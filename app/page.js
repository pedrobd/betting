"use client"
import { useState, useEffect } from 'react';
import './globals.css';

export const dynamic = 'force-dynamic';

// Renderiza letras de forma com cor: W=verde, D=amarelo, L=vermelho
function FormBadges({ form }) {
  if (!form || form.includes('?') || form.trim() === '') {
    return <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.2)', letterSpacing: '2px' }}>— — —</span>;
  }
  const colorMap = { W: '#28a745', D: '#fba94c', L: '#d73a49' };
  return (
    <span style={{ display: 'inline-flex', gap: '3px' }}>
      {form.split('').map((c, i) => (
        <span key={i} style={{
          fontSize: '10px', fontWeight: '900', color: colorMap[c] || 'var(--text-secondary)',
          backgroundColor: `${colorMap[c] || '#666'}22`,
          width: '16px', height: '16px', borderRadius: '3px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: `1px solid ${colorMap[c] || '#666'}44`
        }}>{c}</span>
      ))}
    </span>
  );
}

export default function Home() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [session, setSession] = useState(null);
  const [offset, setOffset] = useState(0);
  const [feedFilter, setFeedFilter] = useState('all'); // 'all' ou '1x'

  const [betSlip, setBetSlip] = useState([]);
  const [stake, setStake] = useState(10);
  const [wallet, setWallet] = useState(100.00); 
  const [toast, setToast] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const initWalletAndBets = async () => {
    try {
      const rw = await fetch('/api/wallet');
      const dataW = await rw.json();
      if (dataW.success) setWallet(dataW.balance);

      const rb = await fetch('/api/bets');
      const dataB = await rb.json();
      if (dataB.success) setHistory(dataB.bets);
    } catch(e) {
      console.error(e);
    }
  };

  const initData = async () => {
    setLoading(true);
    await initWalletAndBets(); 
    try {
      const res = await fetch('/api/matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'init' })
      });
      const data = await res.json();
      
      if (data.success) {
        setSession(data.sessionId);
        // Proteção contra duplicados e jogos passados
        const seen = new Set();
        const unique = (data.matches || []).filter(m => {
          const key = `${m.team_home}-${m.team_away}`;
          const isFinished = (m.time || "").toLowerCase().includes('term') || (m.time || "").toLowerCase().includes('fin');
          const isLive = (m.time || "").toLowerCase().includes('ao vivo') || (m.time || "").toLowerCase().includes('int');
          
          if (seen.has(key) || isFinished || isLive) return false;
          seen.add(key);
          return true;
        });
        setMatches(unique.slice(0, 20)); 
      } else {
        showToast("Server Sync Error", "error");
      }
    } catch(e) {
      showToast("Network Ping Failed", "error");
    }
    setLoading(false);
  };

  // Trigger sync completo (Flashscore + SofaScore) em background
  const triggerSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    showToast('⚙️ Sync iniciado! A recolher dados... (~3-5 min)', 'success');

    try {
      await fetch('/api/sync', { method: 'POST' });
    } catch(e) { /* ignora */ }

    // Polling: verifica de 10 em 10 segundos se o sync terminou
    const lastCreatedAt = matches[0]?.created_at || null;
    const poll = setInterval(async () => {
      try {
        const stateRes = await fetch('/api/sync');
        const state = await stateRes.json();

        // Verifica se há dados novos na DB
        const matchRes = await fetch('/api/matches', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'init' })
        });
        const matchData = await matchRes.json();
        const newCreatedAt = matchData.matches?.[0]?.created_at;

        if (!state.running && newCreatedAt && newCreatedAt !== lastCreatedAt) {
          clearInterval(poll);
          setIsSyncing(false);
          // Actualiza matches com dados novos
          const seen = new Set();
          const unique = (matchData.matches || []).filter(m => {
            const key = `${m.team_home}-${m.team_away}`;
            const isFinished = (m.time || '').toLowerCase().includes('term') || (m.time || '').toLowerCase().includes('fin');
            const isLive = (m.time || '').toLowerCase().includes('ao vivo') || (m.time || '').toLowerCase().includes('int');
            if (seen.has(key) || isFinished || isLive) return false;
            seen.add(key); return true;
          });
          setMatches(unique.slice(0, 20));
          showToast('✅ Dados actualizados com sucesso!', 'success');
        } else if (!state.running && !newCreatedAt) {
          clearInterval(poll);
          setIsSyncing(false);
          showToast('⚠️ Sync terminou sem dados novos.', 'error');
        }
      } catch(e) { /* continua a tentar */ }
    }, 10000); // a cada 10 segundos

    // Timeout de segurança: para o polling ao fim de 20 minutos
    setTimeout(() => { clearInterval(poll); setIsSyncing(false); }, 1200000);
  };

  const loadMore = async () => {
    if (!session) return;
    setLoading(true);
    const nextOffset = offset + 20;
    try {
      const res = await fetch('/api/matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'load_more', sessionId: session, offset: nextOffset })
      });
      const data = await res.json();
      
      if (data.success && data.matches.length > 0) {
        // Unir com os atuais e remover duplicados por segurança
        const combined = [...matches, ...data.matches];
        const seen = new Set();
        const unique = combined.filter(m => {
          const key = `${m.team_home}-${m.team_away}`;
          const isFinished = (m.time || "").toLowerCase().includes('term') || (m.time || "").toLowerCase().includes('fin');
          const isLive = (m.time || "").toLowerCase().includes('ao vivo') || (m.time || "").toLowerCase().includes('int');
          
          if (seen.has(key) || isFinished || isLive) return false;
          seen.add(key);
          return true;
        });
        setMatches(unique); 
        setOffset(nextOffset);
      } else {
        showToast("No more pools available.", "error");
      }
    } catch(e) {}
    setLoading(false);
  };

  useEffect(() => {
    initData();
  }, []);

  // -- Lógica do Boletim & Histórico --
  const [activeTab, setActiveTab] = useState('slip'); // 'slip' ou 'history'
  const [history, setHistory] = useState([]);

  // -- Filtro do Historial --
  const [historyFilter, setHistoryFilter] = useState('all'); // 'all' | 'week' | 'month'

  // -- Delete Aposta --
  const deleteBet = async (betId) => {
    const betToDelete = history.find(b => b.id === betId);
    setHistory(history.filter(b => b.id !== betId)); // optimistic UI
    
    if (betToDelete && betToDelete.status === 'PENDING') {
      setWallet(prev => prev + parseFloat(betToDelete.stake));
      try {
        await fetch('/api/wallet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'reward', amount: betToDelete.stake })
        });
      } catch(e) { console.error('Erro ao repor wallet:', e); }
    }

    try {
      await fetch('/api/bets', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: betId })
      });
    } catch(e) { console.error('Erro ao apagar aposta:', e); }
  };

  // -- Export CSV --
  const exportCSV = () => {
    const rows = [['Ticket','Data','Jogo','Odd','Stake','Retorno','Estado']];
    history.forEach(b => {
      const date = new Date(b.created_at).toLocaleDateString('pt-PT');
      const games = (b.matches || []).map(m => m.team_home).join(' + ');
      rows.push([
        b.id.substring(0,8).toUpperCase(),
        date,
        games,
        b.total_odd,
        b.stake,
        b.potential_return,
        b.status
      ]);
    });
    const csv = rows.map(r => r.join(';')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `betmask_historico_${new Date().toLocaleDateString('pt-PT').replace(/\//g,'-')}.csv`;
    a.click(); URL.revokeObjectURL(url);
    showToast('CSV exportado com sucesso!', 'success');
  };

  // -- Filtrar historial por período --
  const filteredHistory = history.filter(b => {
    if (historyFilter === 'all') return true;
    const created = new Date(b.created_at);
    const now = new Date();
    if (historyFilter === 'week') {
      const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
      return created >= weekAgo;
    }
    if (historyFilter === 'month') {
      return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
    }
    return true;
  });

  // -- Agrupar por mês/semana --
  const groupedHistory = filteredHistory.reduce((groups, bet) => {
    const d = new Date(bet.created_at);
    const key = historyFilter === 'week'
      ? `Semana de ${d.toLocaleDateString('pt-PT', { day:'2-digit', month:'short' })}`
      : d.toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' });
    if (!groups[key]) groups[key] = [];
    groups[key].push(bet);
    return groups;
  }, {});

  // -- Estatísticas de Performance --
  const stats = {
    totalStaked: filteredHistory.reduce((acc, curr) => acc + parseFloat(curr.stake || 0), 0),
    totalEarned: filteredHistory.filter(b => b.status === 'WON').reduce((acc, curr) => acc + parseFloat(curr.potential_return || curr.potentialReturn || 0), 0),
  };
  const netProfit = (stats.totalEarned - stats.totalStaked).toFixed(2);
  const winRate = filteredHistory.length > 0 ? Math.round(filteredHistory.filter(b => b.status === 'WON').length / filteredHistory.filter(b => b.status !== 'PENDING').length * 100) || 0 : 0;

  const toggleBet = (match) => {
    const isSelected = betSlip.some(b => b.team_home === match.team_home);
    if (isSelected) {
      setBetSlip(betSlip.filter(b => b.team_home !== match.team_home));
    } else {
      setBetSlip([...betSlip, match]);
    }
  };

  const totalOdd = betSlip.reduce((acc, curr) => acc * curr.odd, 1).toFixed(2);
  const potentialReturn = (stake * totalOdd).toFixed(2);

  const placeBet = async () => {
    if (stake > wallet) return showToast("Insufficient Funds in Wallet!", "error");
    if (betSlip.length === 0) return showToast("Please select at least one asset.", "error");
    
    // UI Local Imediata (Otimista)
    setWallet(prev => prev - stake);
    setBetSlip([]);
    setActiveTab('history');
    showToast(`Submitting transaction to the blockchain (Supabase)...`, "success");
    
    // Grava na DB
    try {
      const rBet = await fetch('/api/bets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matches: betSlip, stake: stake, totalOdd: totalOdd, potentialReturn: potentialReturn })
      });
      const dataBet = await rBet.json();
      
      const rWal = await fetch('/api/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'charge', amount: stake })
      });
      const dataWal = await rWal.json();
      
      if (dataBet.success && dataWal.success) {
         setHistory([dataBet.bet, ...history]); 
         setWallet(dataWal.balance);
         showToast(`Smart Contract Executed: ${stake}€ Bloqueados!`, "success");
      } else {
         showToast("DB Connection Error: " + (dataBet.error || dataWal.error), "error");
         // Reverte a alteração local se falhar no servidor
         setWallet(prev => prev + stake);
         setActiveTab('slip');
      }
    } catch(e) {
      showToast("Falha de gravação na DB!", "error");
      setWallet(prev => prev + stake);
    }
  };

  const resolveBet = async (betId, status, potentialVal) => {
    // UI Local Imediata Otimista
    setHistory(history.map(b => b.id === betId ? { ...b, status: status } : b));
    if (status === 'WON') setWallet(prev => prev + potentialVal);
    
    // Gravação Backend Supabase
    try {
      await fetch('/api/bets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: betId, status: status })
      });
      
      if (status === 'WON') {
        const rWal = await fetch('/api/wallet', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ action: 'reward', amount: potentialVal })
        });
        const dataWal = await rWal.json();
        if (dataWal.success) setWallet(dataWal.balance);
        showToast(`YOU WON! +${potentialVal}€ adicionado à tua Wallet!`, "success");
      } else {
        showToast(`Aposta Perdida. Mais sorte para a próxima!`, "error");
      }
    } catch(e) {
       console.error("Failed to sync bet resolution", e);
    }
  };

  return (
    <div className="app-container">
      
      {/* Toast Notification Premium */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: '40px', left: '50%', transform: 'translateX(-50%)',
          backgroundColor: toast.type === 'success' ? '#28a745' : '#d73a49',
          color: 'white', padding: '16px 32px', borderRadius: '100px',
          boxShadow: '0 10px 40px rgba(0,0,0,0.5)', zIndex: 9999,
          fontWeight: '700', display: 'flex', alignItems: 'center', gap: '12px',
          animation: 'toastFadeIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
        }}>
          {toast.type === 'success' ? '✅' : '⚠️'} {toast.message}
        </div>
      )}
      
      {/* Esquerda: Feed de Jogos */}
      <div className="feed-container">
        <header className="header">
          <div className="header-brand">
            🦊 <span>Bet</span>Mask
          </div>
          <div className="header-actions">
            {matches.length > 0 && (
              <span className="sync-status" style={{ fontSize: '11px', color: 'var(--text-secondary)', backgroundColor: 'rgba(255,255,255,0.05)', padding: '4px 8px', borderRadius: '4px' }}>
                📡 CLOUD SYNC: {new Date(matches[0].created_at).toLocaleTimeString()}
              </span>
            )}
            <button 
              onClick={isSyncing ? undefined : triggerSync}
              disabled={isSyncing || loading}
              title={isSyncing ? 'Sync em progresso (~3-5 min)...' : 'Scrape Flashscore + SofaScore'}
              style={{
                background: isSyncing ? 'rgba(255,165,0,0.1)' : 'transparent',
                border: isSyncing ? '1px solid rgba(255,165,0,0.3)' : 'none',
                borderRadius: '6px', padding: isSyncing ? '4px 10px' : '0',
                color: 'var(--mm-orange)', cursor: isSyncing ? 'not-allowed' : 'pointer',
                fontSize: '13px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px'
              }}
            >
              {isSyncing ? (
                <>
                  <span style={{ display: 'inline-block', width: '10px', height: '10px', border: '2px solid var(--mm-orange)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  SYNCING...
                </>
              ) : '🔄 SYNC'}
            </button>
            <div className="wallet-badge">
               <span style={{ color: 'var(--text-secondary)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px' }}>Wallet</span>
               <strong style={{ color: 'var(--text-primary)', fontSize: '18px' }}>{wallet.toFixed(2)} EUR</strong>
            </div>
          </div>
        </header>


        {loading && matches.length === 0 && (
          <div style={{textAlign: "center", color: "var(--text-secondary)", marginTop: "80px"}}>
            <div style={{ width: '40px', height: '40px', border: '3px solid var(--border-light)', borderTopColor: 'var(--mm-orange)', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 20px auto' }}></div>
            <h3 style={{ margin: 0 }}>Syncing node data...</h3>
            <p>Fetching odds and sentiment from the network.</p>
          </div>
        )}

        {/* Tabs de Filtro do Feed */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '20px', marginBottom: '24px', overflowX: 'auto', paddingBottom: '8px' }}>
            <button 
              onClick={() => setFeedFilter('all')}
              style={{
                padding: '8px 16px', borderRadius: '100px', border: '1px solid var(--border-light)',
                background: feedFilter === 'all' ? 'var(--mm-orange)' : 'transparent',
                color: feedFilter === 'all' ? 'white' : 'var(--text-secondary)',
                fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap', fontSize: '14px'
              }}
            >
              Todos os Jogos
            </button>
            <button 
              onClick={() => setFeedFilter('1x')}
              style={{
                padding: '8px 16px', borderRadius: '100px', border: '1px solid var(--border-light)',
                background: feedFilter === '1x' ? 'var(--mm-orange)' : 'transparent',
                color: feedFilter === '1x' ? 'white' : 'var(--text-secondary)',
                fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap', fontSize: '14px'
              }}
            >
              Estratégia 1X (Seguro)
            </button>
        </div>

        {!loading && matches.length === 0 && (
          <div className="card fade-in" style={{textAlign: "center", marginTop: "40px", borderStyle: 'dashed', padding: '40px'}}>
            <div style={{ fontSize: '48px', marginBottom: '20px' }}>🔍</div>
            <h3 style={{ margin: '0 0 10px 0' }}>No Pools Detected</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '30px' }}>The network is currently empty or blocked. Try a manual sync.</p>
            <button 
              className="btn-mm" 
              onClick={initData}
              style={{ padding: '12px 24px', width: 'auto' }}
            >
              Sync Network Assets
            </button>
          </div>
        )}

        <div className="matches-grid" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {matches.filter(m => {
            if (feedFilter === 'all') return true;
            // Lógica 1X: Casa é favorita ou equilibrada (odd <= 2.80), forma não é péssima, confiança média/alta
            if (feedFilter === '1x') {
              const isHomeCapable = m.odd <= 2.80;
              const notInCrises = m.home_form && !m.home_form.includes('LLL');
              const minConfidence = m.confidence >= 0;
              console.log(`Match: ${m.team_home} vs ${m.team_away}, isHomeCapable: ${isHomeCapable}, notInCrises: ${notInCrises}, minConfidence: ${minConfidence}`);
              return isHomeCapable && notInCrises && minConfidence;
            }
            return true;
          }).map(m => {
            // Aplica odd aproximada realista para 1X (Dupla Hipótese) em vez de mostrar a odd da Vitória Simples (1)
            if (feedFilter === '1x') {
               const odd1x = 1 + ((m.odd - 1) * 0.32);
               return { ...m, odd: odd1x, original_odd: m.odd, market: '1X (Seguro)' };
            }
            return { ...m, market: 'Match Winner' };
          }).map((m, idx) => {
            const isSelected = betSlip.some(b => b.team_home === m.team_home);
            
            return (
              <div 
                key={idx} 
                className={`card fade-in ${isSelected ? 'selected' : ''}`}
                onClick={() => toggleBet(m)}
                style={{
                  animationDelay: `${idx * 0.05}s`,
                  cursor: 'pointer',
                  borderColor: m.is_value_bet ? 'rgba(255,215,0,0.25)' : undefined,
                  boxShadow: m.is_value_bet ? '0 0 20px rgba(255,215,0,0.06)' : undefined,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '600', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: 'var(--mm-orange)' }}>●</span> 
                    {m.time.includes(':') ? `HOJE ÀS ${m.time}` : m.time.toUpperCase()} 
                    <span style={{ color: 'rgba(255,255,255,0.2)' }}>|</span>
                    {new Date(m.created_at).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' })}
                    {m.is_value_bet && (
                      <span style={{
                        fontSize: '10px', fontWeight: '900', color: '#FFD700',
                        backgroundColor: 'rgba(255,215,0,0.12)', border: '1px solid rgba(255,215,0,0.35)',
                        borderRadius: '4px', padding: '2px 6px', letterSpacing: '0.5px',
                        textShadow: '0 0 8px rgba(255,215,0,0.6)'
                      }}>💎 VALUE BET</span>
                    )}
                  </span>
                  <div className={`badge-odd ${isSelected ? 'selected' : ''}`}>
                     {m.odd.toFixed(2)}x
                  </div>
                </div>
                
                <h3 style={{ margin: '0 0 16px 0', fontSize: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', letterSpacing: '-0.5px' }}>
                  <span style={{ color: isSelected ? 'var(--mm-orange)' : 'var(--text-primary)', display: 'flex', flexDirection: 'column' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                       {m.team_home} 
                       {m.home_pos > 0 && <span style={{ fontSize: '10px', backgroundColor: 'rgba(255,255,255,0.1)', padding: '2px 4px', borderRadius: '4px', color: 'var(--text-secondary)' }}>#{m.home_pos}</span>}
                    </span>
                    <span style={{ marginTop: '5px' }}><FormBadges form={m.home_form} /></span>
                  </span>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                    <span style={{ color: 'var(--border-light)', fontSize: '12px' }}>VS</span>
                    {m.odd_trend === 'dropping' && <span title="Odd a cair!" style={{ fontSize: '16px', animation: 'pulse 1.5s infinite' }}>🔥</span>}
                    {m.odd_trend === 'rising' && <span title="Odd a subir" style={{ fontSize: '16px', opacity: 0.5 }}>⚠️</span>}
                  </div>

                  <span style={{ color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                       {m.away_pos > 0 && <span style={{ fontSize: '10px', backgroundColor: 'rgba(255,255,255,0.1)', padding: '2px 4px', borderRadius: '4px', color: 'var(--text-secondary)' }}>#{m.away_pos}</span>}
                       {m.team_away}
                    </span>
                    <span style={{ marginTop: '5px', display: 'flex', justifyContent: 'flex-end' }}><FormBadges form={m.away_form} /></span>
                  </span>
                </h3>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px' }}>Confidence</span>
                  <div style={{ flex: 1, backgroundColor: 'var(--border-light)', height: '8px', borderRadius: '100px', overflow: 'hidden' }}>
                    <div style={{ width: `${m.confidence}%`, backgroundColor: m.confidence > 75 ? 'var(--mm-green)' : 'var(--mm-orange)', height: '100%', borderRadius: '100px' }}></div>
                  </div>
                  <strong style={{ fontSize: '14px', color: 'var(--text-primary)' }}>{m.confidence}%</strong>
                </div>
                
                {/* xG + EV row — Boolean() prevents {0} from rendering as text */}
                {Boolean(m.home_xg > 0 || m.away_xg > 0 || (m.ev && m.ev !== 0)) && (
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
                    {m.home_xg > 0 && (
                      <span style={{ fontSize: '11px', backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', padding: '3px 8px', color: 'var(--text-secondary)' }}>
                        xG 🏠 <strong style={{ color: m.home_xg > m.away_xg ? 'var(--mm-green)' : 'var(--mm-red)' }}>{m.home_xg}</strong>
                      </span>
                    )}
                    {m.away_xg > 0 && (
                      <span style={{ fontSize: '11px', backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', padding: '3px 8px', color: 'var(--text-secondary)' }}>
                        xG ✈️ <strong style={{ color: m.away_xg > m.home_xg ? 'var(--mm-green)' : 'var(--text-secondary)' }}>{m.away_xg}</strong>
                      </span>
                    )}
                    {m.ev !== undefined && m.ev !== null && m.ev !== 0 && (
                      <span style={{
                        fontSize: '11px', borderRadius: '4px', padding: '3px 8px', fontWeight: '700',
                        backgroundColor: m.ev > 0 ? 'rgba(40,167,69,0.1)' : 'rgba(215,58,73,0.1)',
                        border: `1px solid ${m.ev > 0 ? 'rgba(40,167,69,0.3)' : 'rgba(215,58,73,0.3)'}`,
                        color: m.ev > 0 ? 'var(--mm-green)' : 'var(--mm-red)'
                      }}>
                        EV {m.ev > 0 ? '+' : ''}{m.ev}%
                      </span>
                    )}
                  </div>
                )}

                <div style={{ padding: '12px', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                    <span style={{ color: 'var(--mm-blue)' }}>◆</span> {m.reasoning}
                  </p>
                </div>

                {/* Seleção Checkbox Vibe */}
                <div style={{ position: 'absolute', top: '22px', left: '-8px', width: '3px', height: '24px', backgroundColor: isSelected ? 'var(--mm-orange)' : 'transparent', borderRadius: '0 4px 4px 0' }}></div>
              </div>
            );
          })}
        </div>

        {matches.length > 0 && (
           <button 
             className="btn-mm"
             style={{ marginTop: '30px', backgroundColor: 'var(--bg-panel)', color: 'var(--text-primary)', border: '1px solid var(--border-light)' }} 
             onClick={loadMore}
             disabled={loading}
           >
             {loading ? 'Fetching...' : 'Load More Pools'}
           </button>
        )}
      </div>

      {/* Direita: A Sidebar Flutuante do Boletim Tipo Metamask */}
      <aside className="sidebar">
         
         {/* TABS HEADER */}
         <div style={{ display: 'flex', borderBottom: '1px solid var(--border-light)' }}>
            <button 
              onClick={() => setActiveTab('slip')}
              style={{ flex: 1, padding: '24px 16px', background: 'transparent', border: 'none', borderBottom: activeTab === 'slip' ? '3px solid var(--mm-orange)' : '3px solid transparent', color: activeTab === 'slip' ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: 'bold', fontSize: '16px', cursor: 'pointer', transition: 'all 0.2s' }}
            >
              Bet Slip {betSlip.length > 0 && <span style={{backgroundColor:'var(--mm-orange)', color:'white', borderRadius:'12px', padding:'2px 8px', fontSize:'12px', marginLeft:'6px'}}>{betSlip.length}</span>}
            </button>
            <button 
              onClick={() => setActiveTab('history')}
              style={{ flex: 1, padding: '24px 16px', background: 'transparent', border: 'none', borderBottom: activeTab === 'history' ? '3px solid var(--mm-orange)' : '3px solid transparent', color: activeTab === 'history' ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: 'bold', fontSize: '16px', cursor: 'pointer', transition: 'all 0.2s' }}
            >
              Pending & History {history.length > 0 && <span style={{backgroundColor:'var(--border-light)', color:'var(--text-primary)', borderRadius:'12px', padding:'2px 8px', fontSize:'12px', marginLeft:'6px'}}>{history.length}</span>}
            </button>
         </div>

         {/* CONTENT VIEW */}
         <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
            {activeTab === 'slip' ? (
              <>
                {betSlip.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.6 }}>
                     <div style={{ fontSize: '40px', marginBottom: '16px', filter: 'grayscale(1)' }}>🦊</div>
                     <p style={{ color: 'var(--text-secondary)', textAlign: 'center', margin: 0, lineHeight: 1.5 }}>Your slip is empty.<br/>Select matches to build a multiplier.</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                     {betSlip.map((b, i) => (
                       <div key={i} className="card fade-in" style={{ padding: '16px', borderColor: 'var(--border-light)' }}>
                          <button 
                            onClick={() => toggleBet(b)}
                            style={{ position: 'absolute', top: '16px', right: '16px', background: 'transparent', color: 'var(--text-secondary)', border: 'none', cursor: 'pointer', fontSize: '16px', padding: 0 }}
                          >
                            ✕
                          </button>
                          <h4 style={{ margin: '0 0 8px 0', fontSize: '15px', color: 'var(--text-primary)' }}>{b.team_home}</h4>
                          <p style={{ fontSize: '12px', color: 'var(--mm-blue)', margin: 0, fontWeight: '600' }}>{b.market || 'Match Winner'}</p>
                          <div style={{ textAlign: 'right', fontWeight: '900', color: 'var(--mm-orange)', fontSize: '18px', marginTop: '8px' }}>
                            {b.odd.toFixed(2)}x
                          </div>
                       </div>
                     ))}
                  </div>
                )}
              </>
            ) : (
              // TAB HISTORY — com filtros por período, agrupamento e export CSV
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                
                {/* Performance Summary */}
                <div style={{ padding: '16px', backgroundColor: 'var(--bg-main)', borderRadius: 'var(--radius-card)', border: '1px solid var(--border-light)' }}>
                  <p style={{ margin: '0 0 10px 0', fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 'bold' }}>Performance Summary</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                    <div>
                      <p style={{ margin: 0, fontSize: '10px', color: 'var(--text-secondary)' }}>Investido</p>
                      <strong style={{ fontSize: '14px' }}>{stats.totalStaked.toFixed(0)}€</strong>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <p style={{ margin: 0, fontSize: '10px', color: 'var(--text-secondary)' }}>Win Rate</p>
                      <strong style={{ fontSize: '14px', color: winRate >= 50 ? 'var(--mm-green)' : 'var(--mm-orange)' }}>{isNaN(winRate) ? '—' : `${winRate}%`}</strong>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ margin: 0, fontSize: '10px', color: 'var(--text-secondary)' }}>P/L</p>
                      <strong style={{ fontSize: '14px', color: netProfit >= 0 ? 'var(--mm-green)' : 'var(--mm-red)' }}>{netProfit >= 0 ? '+' : ''}{netProfit}€</strong>
                    </div>
                  </div>
                </div>

                {/* Filtros de Período + Export */}
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  {['all','week','month'].map(f => (
                    <button key={f} onClick={() => setHistoryFilter(f)} style={{
                      flex: 1, padding: '6px 4px', fontSize: '11px', fontWeight: '600',
                      border: '1px solid var(--border-light)', borderRadius: '6px', cursor: 'pointer',
                      background: historyFilter === f ? 'var(--mm-orange)' : 'transparent',
                      color: historyFilter === f ? 'white' : 'var(--text-secondary)',
                      transition: 'all 0.2s'
                    }}>
                      {f === 'all' ? 'Tudo' : f === 'week' ? 'Semana' : 'Mês'}
                    </button>
                  ))}
                  <button onClick={exportCSV} title="Exportar CSV" style={{
                    padding: '6px 10px', fontSize: '14px', border: '1px solid var(--border-light)',
                    borderRadius: '6px', cursor: 'pointer', background: 'transparent',
                    color: 'var(--mm-green)', transition: 'all 0.2s'
                  }}>📥</button>
                </div>

                {/* Lista agrupada */}
                {filteredHistory.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 0', opacity: 0.5 }}>
                    <div style={{ fontSize: '32px', marginBottom: '8px' }}>📭</div>
                    <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '13px' }}>Sem apostas neste período.</p>
                  </div>
                ) : (
                  Object.entries(groupedHistory).map(([period, bets]) => (
                    <div key={period}>
                      {/* Cabeçalho do Período */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0 6px 0', marginBottom: '8px', borderBottom: '1px solid var(--border-light)' }}>
                        <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--mm-orange)' }}>{period}</span>
                        <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{bets.length} aposta{bets.length !== 1 ? 's' : ''}</span>
                      </div>

                      {bets.map((record) => {
                        const isPending = record.status === 'PENDING';
                        const isWon = record.status === 'WON';
                        const statusColor = isWon ? 'var(--mm-green)' : (isPending ? 'var(--warning)' : 'var(--mm-red)');
                        
                        return (
                          <div key={record.id} className="card fade-in" style={{ padding: '14px', borderLeft: `3px solid ${statusColor}`, marginBottom: '10px', position: 'relative' }}>
                            
                            {/* Header: Ticket + Status + Delete */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>#{record.id.substring(0,8).toUpperCase()}</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                {isPending && <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--warning)', backgroundColor: 'rgba(251,169,76,0.1)', padding: '2px 7px', borderRadius: '4px' }}>⏰ PENDING</span>}
                                {isWon && <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--mm-green)', backgroundColor: 'rgba(40,167,69,0.1)', padding: '2px 7px', borderRadius: '4px' }}>✅ WON</span>}
                                {!isPending && !isWon && <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--mm-red)', backgroundColor: 'rgba(215,58,73,0.1)', padding: '2px 7px', borderRadius: '4px' }}>❌ LOST</span>}
                                <button
                                  onClick={(e) => { e.stopPropagation(); if(confirm('Apagar esta aposta?')) deleteBet(record.id); }}
                                  title="Apagar aposta"
                                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(215,58,73,0.5)', fontSize: '14px', padding: '2px 4px', borderRadius: '4px', transition: 'color 0.2s' }}
                                  onMouseEnter={e => e.target.style.color='var(--mm-red)'}
                                  onMouseLeave={e => e.target.style.color='rgba(215,58,73,0.5)'}
                                >🗑️</button>
                              </div>
                            </div>

                            {/* Jogos */}
                            <div style={{ borderBottom: '1px solid var(--border-light)', paddingBottom: '10px', marginBottom: '10px' }}>
                              {record.matches.map((m, ii) => (
                                <div key={ii} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                                  <span style={{ color: 'var(--text-primary)' }}>{m.team_home}</span>
                                  <span style={{ color: 'var(--mm-orange)', fontWeight: 'bold' }}>{m.odd?.toFixed(2) || m.odd}</span>
                                </div>
                              ))}
                            </div>

                            {/* Stake + Return */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: isPending ? '12px' : '0' }}>
                              <div>
                                <p style={{ margin: '0 0 2px 0', fontSize: '11px', color: 'var(--text-secondary)' }}>Stake</p>
                                <strong style={{ color: 'var(--text-primary)', fontSize: '13px' }}>{record.stake} EUR</strong>
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <p style={{ margin: '0 0 2px 0', fontSize: '11px', color: 'var(--text-secondary)' }}>Retorno</p>
                                <strong style={{ color: 'var(--mm-green)', fontSize: '13px' }}>{record.potential_return || record.potentialReturn} EUR</strong>
                              </div>
                            </div>
                            
                            {/* Win/Lose buttons para PENDING */}
                            {isPending && (
                              <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid var(--border-light)', paddingTop: '10px' }}>
                                <button 
                                  onClick={() => resolveBet(record.id, 'WON', parseFloat(record.potential_return || record.potentialReturn))}
                                  style={{ flex: 1, backgroundColor: 'rgba(40,167,69,0.1)', color: 'var(--mm-green)', border: '1px solid var(--mm-green)', borderRadius: '6px', padding: '7px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}
                                >✅ Win Bet</button>
                                <button 
                                  onClick={() => resolveBet(record.id, 'LOST', 0)}
                                  style={{ flex: 1, backgroundColor: 'rgba(215,58,73,0.1)', color: 'var(--mm-red)', border: '1px solid var(--mm-red)', borderRadius: '6px', padding: '7px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}
                                >❌ Lose Bet</button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>
            )}
         </div>

         {/* Painel Matemático Final em estilo Swap (Apenas Visível na Tab Slip) */}
         {activeTab === 'slip' && (
           <div style={{ padding: '24px', backgroundColor: 'var(--bg-main)', borderTop: '1px solid var(--border-light)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', marginBottom: '16px', fontSize: '14px' }}>
                 <span>Total Multiplier</span>
                 <strong style={{ color: 'var(--text-primary)' }}>{betSlip.length > 0 ? totalOdd : '0.00'}x</strong>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
                 <label style={{ color: 'var(--text-secondary)', fontSize: '12px', fontWeight: '600', letterSpacing: '1px' }}>STAKE AMOUNT (EUR)</label>
                 <div style={{ position: 'relative' }}>
                   <input 
                     type="number" 
                     min="1"
                     max={wallet}
                     value={stake} 
                     onChange={(e) => setStake(Number(e.target.value))}
                     style={{ width: '100%', boxSizing: 'border-box', backgroundColor: 'var(--bg-panel)', color: 'var(--text-primary)', border: '1px solid var(--border-light)', borderRadius: '12px', padding: '16px', paddingRight: '60px', fontSize: '20px', fontWeight: '700', outline: 'none' }}
                   />
                   <span style={{ position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--mm-orange)', fontWeight: 'bold' }}>EUR</span>
                 </div>
                 
                 {stake > wallet && <span style={{ color: 'var(--mm-red)', fontSize: '13px', marginTop: '4px' }}>Insufficient funds in wallet</span>}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', padding: '16px', backgroundColor: 'var(--bg-panel)', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
                 <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Est. Return</span>
                 <strong style={{ color: 'var(--text-primary)', fontSize: '24px' }}>{betSlip.length > 0 ? potentialReturn : '0.00'}</strong>
              </div>

              <button 
                className="btn-mm"
                onClick={placeBet}
                disabled={betSlip.length === 0 || stake > wallet}
              >
                Sign & Place Bet
              </button>
           </div>
         )}
      </aside>
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}} />
    </div>
  );
}
