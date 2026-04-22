"use client"
// Vercel Build Fix Test - Commit 3
import { useState, useEffect } from 'react';
import './globals.css';

export const dynamic = 'force-dynamic';

// ─── Poisson + Dixon-Coles (client-side) ─────────────────────────────────────
// Replica a lógica do server para calcular probabilidades correctas por mercado.
function _poissonProb(lambda, k) {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let logP = -lambda + k * Math.log(lambda);
  for (let i = 1; i <= k; i++) logP -= Math.log(i);
  return Math.exp(logP);
}

function calcMatchProbs(homeXg, awayXg) {
  if (!homeXg || !awayXg || homeXg <= 0 || awayXg <= 0) return null;
  const HOME_ADV = 0.3, DC_RHO = -0.13;
  const lH = homeXg + HOME_ADV;
  const lA = Math.max(0.1, awayXg - HOME_ADV * 0.5);
  let homeWin = 0, draw = 0, awayWin = 0, over15 = 0, total = 0;
  for (let i = 0; i <= 9; i++) {
    const pH = _poissonProb(lH, i);
    for (let j = 0; j <= 9; j++) {
      const pA = _poissonProb(lA, j);
      let tau = 1;
      if (i === 0 && j === 0) tau = 1 - lH * lA * DC_RHO;
      else if (i === 1 && j === 0) tau = 1 + lA * DC_RHO;
      else if (i === 0 && j === 1) tau = 1 + lH * DC_RHO;
      else if (i === 1 && j === 1) tau = 1 - DC_RHO;
      const p = pH * pA * tau;
      if (i > j) homeWin += p; else if (i === j) draw += p; else awayWin += p;
      if (i + j > 1) over15 += p;
      total += p;
    }
  }
  if (total > 0) { homeWin /= total; draw /= total; awayWin /= total; over15 /= total; }
  return {
    homeWin: parseFloat((homeWin * 100).toFixed(1)),
    draw: parseFloat((draw * 100).toFixed(1)),
    awayWin: parseFloat((awayWin * 100).toFixed(1)),
    over15: parseFloat((over15 * 100).toFixed(1)),
    conf1x: parseFloat(Math.min(97, (homeWin + draw) * 100).toFixed(1)),
  };
}

// Renderiza H2H (últimos confrontos directos)
function H2HBadges({ h2h }) {
  if (!h2h || h2h.length === 0) return null;
  const colorMap = { W: '#28a745', D: '#fba94c', L: '#d73a49' };
  const wins = h2h.filter(r => r.result === 'W').length;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
      <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '1px', marginRight: '2px' }}>H2H</span>
      {h2h.map((r, i) => (
        <span key={i} style={{
          fontSize: '10px', fontWeight: '900', color: colorMap[r.result] || '#666',
          backgroundColor: `${colorMap[r.result] || '#666'}22`,
          width: '16px', height: '16px', borderRadius: '3px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: `1px solid ${colorMap[r.result] || '#666'}44`
        }}>{r.result}</span>
      ))}
      <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.3)', marginLeft: '2px' }}>{wins}/{h2h.length}V</span>
    </span>
  );
}

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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [accuracy, setAccuracy] = useState(null); // { total, wins, winRate }
  const [matchResults, setMatchResults] = useState({}); // id → 'W'|'D'|'L'

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchAccuracy = async () => {
    try {
      const r = await fetch('/api/result');
      const d = await r.json();
      if (d.success) setAccuracy(d);
    } catch (e) {}
  };

  const markResult = async (matchId, result, e) => {
    e.stopPropagation();
    const prev = matchResults[matchId];
    const next = prev === result ? null : result; // toggle off
    setMatchResults(r => ({ ...r, [matchId]: next }));
    await fetch('/api/result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: matchId, result: next }),
    });
    fetchAccuracy();
  };

  const initWalletAndBets = async () => {
    try {
      const rw = await fetch('/api/wallet');
      const dataW = await rw.json();
      if (dataW.success) setWallet(dataW.balance);

      const rb = await fetch('/api/bets');
      const dataB = await rb.json();
      if (dataB.success) setHistory(dataB.bets);
    } catch (e) {
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
    } catch (e) {
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
    } catch (e) { /* ignora */ }

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
      } catch (e) { /* continua a tentar */ }
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
        showToast("Não há mais jogos disponíveis.", "error");
      }
    } catch (e) { }
    setLoading(false);
  };

  useEffect(() => {
    initData();
    fetchAccuracy();
  }, []);

  // -- Lógica do Boletim & Histórico --
  const [activeTab, setActiveTab] = useState('slip'); // 'slip' ou 'history'
  const [history, setHistory] = useState([]);

  // -- Filtro do Historial --
  const [historyFilter, setHistoryFilter] = useState('all'); // 'all' | 'week' | 'month'
  const [expandedBet, setExpandedBet] = useState(null); // id da aposta expandida

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
      } catch (e) { console.error('Erro ao repor wallet:', e); }
    }

    try {
      await fetch('/api/bets', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: betId })
      });
    } catch (e) { console.error('Erro ao apagar aposta:', e); }
  };

  // -- Export CSV --
  const exportCSV = () => {
    const rows = [['Ticket', 'Data', 'Jogo', 'Odd', 'Stake', 'Retorno', 'Estado']];
    history.forEach(b => {
      const date = new Date(b.created_at).toLocaleDateString('pt-PT');
      const games = (b.matches || []).map(m => m.team_home).join(' + ');
      rows.push([
        b.id.substring(0, 8).toUpperCase(),
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
    a.href = url; a.download = `betmask_historico_${new Date().toLocaleDateString('pt-PT').replace(/\//g, '-')}.csv`;
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
      ? `Semana de ${d.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' })}`
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

  // Kelly Criterion (fracção 1/2 para ser conservador)
  const kellyStake = (() => {
    if (betSlip.length !== 1) return null; // Kelly só faz sentido em apostas simples
    const m = betSlip[0];
    const p = (m.confidence || 60) / 100;
    const b = parseFloat(m.odd) - 1;
    const f = (b * p - (1 - p)) / b; // Kelly fraction
    const halfKelly = Math.max(0, f / 2); // metade do Kelly, mais seguro
    const suggested = parseFloat((halfKelly * wallet).toFixed(2));
    return suggested > 0 ? Math.min(suggested, wallet * 0.25) : null; // cap 25% bankroll
  })();

  // Probabilidade combinada da múltipla
  const combinedProb = betSlip.length > 1
    ? betSlip.reduce((acc, m) => acc * ((m.confidence || 60) / 100), 1)
    : null;

  const placeBet = async () => {
    if (stake > wallet) return showToast("Saldo insuficiente na Wallet!", "error");
    if (betSlip.length === 0) return showToast("Seleciona pelo menos um jogo.", "error");

    // UI Local Imediata (Otimista)
    setWallet(prev => prev - stake);
    setBetSlip([]);
    setActiveTab('history');
    setDrawerOpen(true); // abre o drawer para mostrar o histórico
    showToast(`A registar aposta...`, "success");

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
        showToast(`Aposta registada! ${stake}€ deduzidos da Wallet.`, "success");
      } else {
        showToast("Erro a gravar aposta: " + (dataBet.error || dataWal.error), "error");
        // Reverte a alteração local se falhar no servidor
        setWallet(prev => prev + stake);
        setActiveTab('slip');
      }
    } catch (e) {
      showToast("Falha de ligação — aposta não gravada.", "error");
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
    } catch (e) {
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
          <div style={{ textAlign: "center", color: "var(--text-secondary)", marginTop: "80px" }}>
            <div style={{ width: '40px', height: '40px', border: '3px solid var(--border-light)', borderTopColor: 'var(--mm-orange)', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 20px auto' }}></div>
            <h3 style={{ margin: 0 }}>A carregar jogos...</h3>
            <p>A recolher dados do Flashscore e SofaScore.</p>
          </div>
        )}

        {/* Painel de Calibração do Modelo */}
        {accuracy && accuracy.total > 0 && (
          <div style={{ marginTop: '16px', marginBottom: '8px' }}>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
              {/* Taxa global */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', background: 'rgba(255,255,255,0.04)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Acerto</span>
                <strong style={{ fontSize: '16px', color: accuracy.winRate >= 60 ? 'var(--mm-green)' : accuracy.winRate >= 45 ? 'var(--mm-orange)' : 'var(--mm-red)' }}>
                  {accuracy.winRate}%
                </strong>
                <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>{accuracy.wins}/{accuracy.total}</span>
              </div>

              {/* EV médio */}
              {accuracy.avgEV !== null && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)' }}>EV Médio</span>
                  <strong style={{ fontSize: '13px', color: accuracy.avgEV > 0 ? 'var(--mm-green)' : 'var(--mm-red)' }}>
                    {accuracy.avgEV > 0 ? '+' : ''}{accuracy.avgEV}%
                  </strong>
                </div>
              )}

              {/* Value Bets */}
              {accuracy.valueBets?.t > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px', background: 'rgba(255,215,0,0.04)', borderRadius: '10px', border: '1px solid rgba(255,215,0,0.15)' }}>
                  <span style={{ fontSize: '11px', color: 'rgba(255,215,0,0.6)' }}>💎 Value</span>
                  <strong style={{ fontSize: '13px', color: '#FFD700' }}>
                    {Math.round((accuracy.valueBets.w / accuracy.valueBets.t) * 100)}%
                  </strong>
                  <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)' }}>{accuracy.valueBets.w}/{accuracy.valueBets.t}</span>
                </div>
              )}
            </div>

            {/* Calibração por banda — "o modelo diz X%, realmente acerta Y%?" */}
            {accuracy.bands && Object.values(accuracy.bands).some(b => b.t > 0) && (
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                {Object.entries(accuracy.bands).map(([key, b]) => b.t > 0 && (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>Conf {b.label}</span>
                    <strong style={{ fontSize: '12px', color: (b.w/b.t) >= 0.65 ? 'var(--mm-green)' : (b.w/b.t) >= 0.5 ? 'var(--mm-orange)' : 'var(--mm-red)' }}>
                      {Math.round((b.w/b.t)*100)}%
                    </strong>
                    <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.2)' }}>{b.w}/{b.t}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tabs de Filtro do Feed */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '16px', marginBottom: '16px', overflowX: 'auto', paddingBottom: '4px', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
          {[
            { id: 'all',    label: 'Todos',     color: null },
            { id: '1x',     label: '1X Seguro', color: null },
            { id: 'ultra',  label: '🔒 Ultra',  color: '#00e5ff' },
            { id: 'over15', label: '⚽ Over 1.5', color: '#28e87d' },
          ].map(f => (
            <button key={f.id} onClick={() => setFeedFilter(f.id)} style={{
              padding: '7px 14px', borderRadius: '100px', border: `1px solid ${feedFilter === f.id && f.color ? f.color : 'var(--border-light)'}`,
              background: feedFilter === f.id ? (f.color ? `${f.color}22` : 'var(--mm-orange)') : 'transparent',
              color: feedFilter === f.id ? (f.color || 'white') : 'var(--text-secondary)',
              fontWeight: '700', cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap', fontSize: '13px',
              touchAction: 'manipulation',
            }}>{f.label}</button>
          ))}
        </div>

        {!loading && matches.length === 0 && (
          <div className="card fade-in" style={{ textAlign: "center", marginTop: "40px", borderStyle: 'dashed', padding: '40px' }}>
            <div style={{ fontSize: '48px', marginBottom: '20px' }}>🔍</div>
            <h3 style={{ margin: '0 0 10px 0' }}>Sem jogos disponíveis</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '30px' }}>Não há jogos futuros. Faz um SYNC para carregar os jogos de hoje.</p>
            <button
              className="btn-mm"
              onClick={initData}
              style={{ padding: '12px 24px', width: 'auto' }}
            >
              Sincronizar
            </button>
          </div>
        )}

        <div className="matches-grid" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {matches.filter(m => {
            if (feedFilter === 'all') return true;

            if (feedFilter === '1x') {
              const isValidFavorite = m.odd > 1.10 && m.odd <= 2.5; // excluir super-favoritos triviais
              const notInCrises = !m.home_form || !m.home_form.includes('LLL');
              const probs = calcMatchProbs(m.home_xg, m.away_xg);
              const conf1x = probs ? probs.conf1x : m.confidence;
              // Deriva odd 1X para verificar EV antes de mostrar
              const est1xOdd = probs
                ? parseFloat((1 / Math.min(probs.conf1x / 100, 0.97)).toFixed(2))
                : (m.odd_1x > 1.05 ? m.odd_1x : null);
              const hasPositiveEV = est1xOdd ? ((conf1x / 100) * est1xOdd - 1) > -0.03 : true; // tolera até -3%
              return isValidFavorite && notInCrises && conf1x >= 75 && hasPositiveEV;
            }

            if (feedFilter === 'ultra') {
              // 🔒 ULTRA SEGURO: TODOS os critérios devem passar
              const isSuperFav     = m.odd > 1.0 && m.odd <= 1.50;
              const veryConfident  = m.confidence >= 90;
              const goodHomeForm   = m.home_form &&
                (m.home_form.split('').filter(c => c === 'W').length >= 3);
              const badAwayForm    = !m.away_form ||
                (m.away_form.split('').filter(c => c === 'W').length <= 1);
              const positiveEV     = !m.ev || m.ev >= 0;
              const xgEdge         = !m.home_xg || !m.away_xg ||
                                     m.home_xg >= m.away_xg * 0.8;
              const noInjuryAlert  = !m.reasoning?.toLowerCase().includes('lesão');
              return isSuperFav && veryConfident && goodHomeForm && badAwayForm && positiveEV && xgEdge && noInjuryAlert;
            }

            if (feedFilter === 'over15') {
              // Usa Poisson para P(golos > 1.5) directamente — muito mais preciso que heurística
              const probs = calcMatchProbs(m.home_xg, m.away_xg);
              const over15Prob = probs ? probs.over15 : null;
              const hasRealOdds = m.odd_over15 > 1.0 && m.odd_over15 <= 1.65;
              if (over15Prob !== null) return over15Prob >= 68; // >= 68% = jogo com tendência de golos
              return hasRealOdds || ((m.home_xg + m.away_xg) >= 2.0);
            }

            return true;
          }).map(m => {
            if (feedFilter === '1x') {
              const probs = calcMatchProbs(m.home_xg, m.away_xg);
              // Confiança real para 1X = homeWin% + draw% do modelo Poisson DC
              const conf1x = probs ? probs.conf1x : m.confidence;
              let real1xOdd;
              if (m.odd_1x && m.odd_1x > 1.05) {
                // Odd real do bookmaker (scraped) — mais precisa
                real1xOdd = parseFloat(m.odd_1x);
              } else if (probs) {
                // Deriva odd 1X directamente da probabilidade Poisson DC
                real1xOdd = parseFloat((1 / Math.min(probs.conf1x / 100, 0.97)).toFixed(2));
              } else {
                // Fallback sem Poisson: usa confidence como proxy da prob 1X
                // (confidence já inclui forma, posição, etc — razoável para 1X)
                const est1xProb = Math.min((m.confidence + 12) / 100, 0.95);
                real1xOdd = parseFloat((1 / est1xProb).toFixed(2));
              }
              const ev1x = parseFloat((((conf1x / 100) * real1xOdd - 1) * 100).toFixed(2));
              return { ...m, odd: real1xOdd, confidence: parseFloat(conf1x.toFixed(1)), ev: ev1x, market: '1X (Dupla Hipótese)' };
            }
            if (feedFilter === 'over15') {
              const probs = calcMatchProbs(m.home_xg, m.away_xg);
              // Confiança real para Over 1.5 = P(golos totais > 1.5) do Poisson DC
              const confOver15 = probs ? probs.over15 : m.confidence;
              let over15Odd;
              if (m.odd_over15 && m.odd_over15 > 1.0) {
                over15Odd = parseFloat(m.odd_over15);
              } else if (probs) {
                // Odd derivada directamente da probabilidade Poisson (sem heurística)
                over15Odd = parseFloat((1 / Math.min(probs.over15 / 100, 0.97)).toFixed(2));
              } else {
                const totalXg = (m.home_xg || 1.2) + (m.away_xg || 0.9);
                over15Odd = parseFloat((1 / Math.min(0.55 + (totalXg - 1.5) * 0.12, 0.97)).toFixed(2));
              }
              const evOver = parseFloat((((confOver15 / 100) * over15Odd - 1) * 100).toFixed(2));
              return { ...m, odd: over15Odd, confidence: parseFloat(confOver15.toFixed(1)), ev: evOver, market: '⚽ Over 1.5 Golos' };
            }
            if (feedFilter === 'ultra') {
              // Ultra seguro usa 1X da casa
              const real1xOdd = m.odd_1x > 1.0 ? parseFloat(m.odd_1x) : parseFloat((1 / Math.min((1/m.odd) + 0.25, 0.97)).toFixed(2));
              return { ...m, odd: real1xOdd, market: '🔒 Ultra Seg (1X)' };
            }
            return { ...m, market: 'Vitória Casa' };
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
                {/* Linha topo: hora + odd */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', gap: '8px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', minWidth: 0 }}>
                    <span style={{ color: 'var(--mm-orange)' }}>●</span>
                    <span style={{ whiteSpace: 'nowrap' }}>{m.time.includes(':') ? `HOJE ${m.time}` : m.time.toUpperCase()}</span>
                    <span style={{ color: 'rgba(255,255,255,0.2)' }}>·</span>
                    <span style={{ whiteSpace: 'nowrap' }}>{new Date(m.created_at).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' })}</span>
                    {m.is_value_bet && (
                      <span style={{
                        fontSize: '9px', fontWeight: '900', color: '#FFD700',
                        backgroundColor: 'rgba(255,215,0,0.12)', border: '1px solid rgba(255,215,0,0.35)',
                        borderRadius: '4px', padding: '2px 5px', whiteSpace: 'nowrap',
                      }}>💎 VALUE</span>
                    )}
                  </span>
                  <div className={`badge-odd ${isSelected ? 'selected' : ''}`} style={{ fontSize: '13px', padding: '5px 10px', flexShrink: 0 }}>
                    {m.odd.toFixed(2)}x
                  </div>
                </div>

                {/* Teams */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '15px', fontWeight: '800', color: isSelected ? 'var(--mm-orange)' : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.team_home}</span>
                      {m.home_pos > 0 && <span style={{ fontSize: '9px', backgroundColor: 'rgba(255,255,255,0.1)', padding: '1px 4px', borderRadius: '3px', color: 'var(--text-secondary)', flexShrink: 0 }}>#{m.home_pos}</span>}
                    </div>
                    <FormBadges form={m.home_form} />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', flexShrink: 0 }}>
                    <span style={{ color: 'var(--border-light)', fontSize: '11px', fontWeight: '600' }}>VS</span>
                    {m.odd_trend === 'dropping' && <span title="Odd a cair!" style={{ fontSize: '14px', animation: 'pulse 1.5s infinite' }}>🔥</span>}
                    {m.odd_trend === 'rising' && <span title="Odd a subir" style={{ fontSize: '14px', opacity: 0.5 }}>⚠️</span>}
                  </div>

                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '4px' }}>
                      {m.away_pos > 0 && <span style={{ fontSize: '9px', backgroundColor: 'rgba(255,255,255,0.1)', padding: '1px 4px', borderRadius: '3px', color: 'var(--text-secondary)', flexShrink: 0 }}>#{m.away_pos}</span>}
                      <span style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.team_away}</span>
                    </div>
                    <FormBadges form={m.away_form} />
                  </div>
                </div>

                {/* H2H Row */}
                {m.h2h && m.h2h.length > 0 && (
                  <div style={{ marginBottom: '12px' }}>
                    <H2HBadges h2h={m.h2h} />
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px' }}>Confidence</span>
                  <div style={{ flex: 1, backgroundColor: 'var(--border-light)', height: '8px', borderRadius: '100px', overflow: 'hidden' }}>
                    <div style={{ width: `${m.confidence}%`, backgroundColor: m.confidence > 75 ? 'var(--mm-green)' : 'var(--mm-orange)', height: '100%', borderRadius: '100px' }}></div>
                  </div>
                  <strong style={{ fontSize: '14px', color: 'var(--text-primary)' }}>{m.confidence}%</strong>
                </div>

                {/* xG + EV + Margem row */}
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
                    {m.bk_margin > 0 && (
                      <span title="Margem do bookmaker (quanto a casa retém)" style={{
                        fontSize: '11px', borderRadius: '4px', padding: '3px 8px',
                        backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                        color: m.bk_margin <= 5 ? 'var(--mm-green)' : m.bk_margin <= 8 ? 'var(--mm-orange)' : 'var(--mm-red)'
                      }}>
                        Margem {m.bk_margin}%
                      </span>
                    )}
                    {m.odd_previous > 0 && parseFloat(m.odd_previous).toFixed(2) !== parseFloat(m.odd).toFixed(2) && (
                      <span style={{
                        fontSize: '11px', borderRadius: '4px', padding: '3px 8px', fontWeight: '700',
                        backgroundColor: m.odd < m.odd_previous ? 'rgba(40,167,69,0.08)' : 'rgba(215,58,73,0.08)',
                        border: `1px solid ${m.odd < m.odd_previous ? 'rgba(40,167,69,0.25)' : 'rgba(215,58,73,0.25)'}`,
                        color: m.odd < m.odd_previous ? 'var(--mm-green)' : 'var(--mm-red)'
                      }}>
                        {parseFloat(m.odd_previous).toFixed(2)} → {parseFloat(m.odd).toFixed(2)} {m.odd < m.odd_previous ? '↓' : '↑'}
                      </span>
                    )}
                  </div>
                )}

                <div style={{ padding: '12px', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                    <span style={{ color: 'var(--mm-blue)' }}>◆</span> {m.reasoning}
                  </p>
                </div>

                {/* Resultado Real */}
                {(() => {
                  const res = matchResults[m.id] || m.match_result;
                  const btn = (label, val, color) => (
                    <button key={val} onClick={(e) => markResult(m.id, val, e)} style={{
                      padding: '4px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: '900',
                      cursor: 'pointer', border: `1px solid ${res === val ? color : 'rgba(255,255,255,0.1)'}`,
                      background: res === val ? `${color}22` : 'transparent',
                      color: res === val ? color : 'rgba(255,255,255,0.3)',
                      transition: 'all 0.15s',
                    }}>{label}</button>
                  );
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px' }} onClick={e => e.stopPropagation()}>
                      <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '1px' }}>Resultado</span>
                      {btn('✓ Acertou', 'W', '#28a745')}
                      {btn('= Empate', 'D', '#fba94c')}
                      {btn('✗ Falhou', 'L', '#d73a49')}
                    </div>
                  );
                })()}

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
            {loading ? 'A carregar...' : 'Carregar mais jogos'}
          </button>
        )}
      </div>

      {/* Direita: A Sidebar Flutuante do Boletim Tipo Metamask */}
      {/* Backdrop mobile */}
      <div
        className={`sidebar-backdrop ${drawerOpen ? 'visible' : ''}`}
        onClick={() => setDrawerOpen(false)}
      />

<aside className={`sidebar ${drawerOpen ? 'drawer-open' : ''}`}>

        {/* Handle mobile drag */}
        <div className="drawer-handle" onClick={() => setDrawerOpen(false)} style={{ cursor: 'pointer' }} />

        {/* TABS HEADER — sempre visível no mobile (é o "peek") */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-light)', position: 'relative' }}>
          <button
            onClick={() => { setActiveTab('slip'); setDrawerOpen(true); }}
            style={{ flex: 1, padding: '14px 16px', background: 'transparent', border: 'none', borderBottom: activeTab === 'slip' ? '3px solid var(--mm-orange)' : '3px solid transparent', color: activeTab === 'slip' ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: 'bold', fontSize: '15px', cursor: 'pointer', transition: 'all 0.2s', touchAction: 'manipulation' }}
          >
            🎟 Boletim {betSlip.length > 0 && <span style={{ backgroundColor: 'var(--mm-orange)', color: 'white', borderRadius: '12px', padding: '2px 8px', fontSize: '12px', marginLeft: '6px' }}>{betSlip.length}</span>}
          </button>
          <button
            onClick={() => { setActiveTab('history'); setDrawerOpen(true); }}
            style={{ flex: 1, padding: '14px 16px', background: 'transparent', border: 'none', borderBottom: activeTab === 'history' ? '3px solid var(--mm-orange)' : '3px solid transparent', color: activeTab === 'history' ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: 'bold', fontSize: '15px', cursor: 'pointer', transition: 'all 0.2s', touchAction: 'manipulation' }}
          >
            📋 Histórico {history.length > 0 && <span style={{ backgroundColor: 'var(--border-light)', color: 'var(--text-primary)', borderRadius: '12px', padding: '2px 8px', fontSize: '12px', marginLeft: '6px' }}>{history.length}</span>}
          </button>
          {/* Fechar drawer — só visível quando aberto */}
          {drawerOpen && (
            <button onClick={() => setDrawerOpen(false)} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontSize: '22px', cursor: 'pointer', lineHeight: 1, padding: '8px', touchAction: 'manipulation' }}>✕</button>
          )}
        </div>

        {/* CONTENT VIEW */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {activeTab === 'slip' ? (
            <>
              {betSlip.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.6 }}>
                  <div style={{ fontSize: '40px', marginBottom: '16px', filter: 'grayscale(1)' }}>🦊</div>
                  <p style={{ color: 'var(--text-secondary)', textAlign: 'center', margin: 0, lineHeight: 1.5 }}>O teu boletim está vazio.<br />Seleciona jogos para construir uma múltipla.</p>
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
                      <p style={{ fontSize: '12px', color: 'var(--mm-blue)', margin: 0, fontWeight: '600' }}>{b.market || 'Vitória Casa'}</p>
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
                {['all', 'week', 'month'].map(f => (
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
                      const isOpen = expandedBet === record.id;
                      const sc = isWon ? '#28a745' : isPending ? '#fba94c' : '#d73a49';
                      const icon = isWon ? '✓' : isPending ? '⏳' : '✗';
                      const label = record.matches.length > 1
                        ? `${record.matches.length} jogos`
                        : record.matches[0]?.team_home || '—';
                      const totalOddVal = record.total_odd ? parseFloat(record.total_odd).toFixed(2) : '—';
                      const ret = parseFloat(record.potential_return || record.potentialReturn).toFixed(2);

                      return (
                        <div key={record.id} style={{ borderRadius: '10px', overflow: 'hidden', marginBottom: '6px', border: `1px solid ${sc}33`, background: 'var(--bg-panel)' }}>

                          {/* Linha compacta — clica para expandir */}
                          <div
                            onClick={() => setExpandedBet(isOpen ? null : record.id)}
                            style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', cursor: 'pointer' }}
                          >
                            <span style={{ fontSize: '13px', fontWeight: '900', color: sc, width: '16px', flexShrink: 0 }}>{icon}</span>
                            <span style={{ flex: 1, fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
                            <span style={{ fontSize: '12px', fontWeight: '800', color: 'var(--mm-orange)', flexShrink: 0 }}>{totalOddVal}x</span>
                            <span style={{ fontSize: '13px', fontWeight: '800', color: sc, flexShrink: 0 }}>{record.stake}€</span>
                            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', flexShrink: 0 }}>{isOpen ? '▲' : '▼'}</span>
                          </div>

                          {/* Detalhes expandidos */}
                          {isOpen && (
                            <div style={{ borderTop: `1px solid ${sc}22` }}>
                              {/* Jogos */}
                              <div style={{ padding: '8px 12px' }}>
                                {record.matches.map((m, ii) => (
                                  <div key={ii} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: ii < record.matches.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.team_home}</div>
                                      {m.team_away && <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>vs {m.team_away}</div>}
                                      {m.market && <div style={{ fontSize: '10px', color: 'var(--mm-blue)', fontWeight: '600', marginTop: '2px' }}>{m.market}</div>}
                                    </div>
                                    <span style={{ fontSize: '13px', fontWeight: '900', color: 'var(--mm-orange)', marginLeft: '8px' }}>{parseFloat(m.odd).toFixed(2)}x</span>
                                  </div>
                                ))}
                              </div>

                              {/* Stake / Retorno / Data */}
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', backgroundColor: 'rgba(255,255,255,0.03)' }}>
                                <div>
                                  <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>APOSTA</div>
                                  <div style={{ fontSize: '13px', fontWeight: '800' }}>{record.stake}€</div>
                                </div>
                                <div style={{ textAlign: 'center' }}>
                                  <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>DATA</div>
                                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>{new Date(record.created_at).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                  <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>RETORNO</div>
                                  <div style={{ fontSize: '13px', fontWeight: '800', color: '#28a745' }}>{ret}€</div>
                                </div>
                              </div>

                              {/* Botões PENDING + Apagar */}
                              <div style={{ display: 'flex', gap: '1px', backgroundColor: 'rgba(255,255,255,0.05)' }}>
                                {isPending && <>
                                  <button onClick={() => resolveBet(record.id, 'WON', parseFloat(ret))} style={{ flex: 1, padding: '10px', background: 'rgba(40,167,69,0.15)', color: '#28a745', border: 'none', cursor: 'pointer', fontWeight: '800', fontSize: '12px' }}>✓ Ganhou</button>
                                  <button onClick={() => resolveBet(record.id, 'LOST', 0)} style={{ flex: 1, padding: '10px', background: 'rgba(215,58,73,0.15)', color: '#d73a49', border: 'none', cursor: 'pointer', fontWeight: '800', fontSize: '12px' }}>✗ Perdeu</button>
                                </>}
                                <button onClick={(e) => { e.stopPropagation(); if (confirm('Apagar esta aposta?')) deleteBet(record.id); }} style={{ padding: '10px 14px', background: 'rgba(215,58,73,0.08)', color: 'rgba(215,58,73,0.6)', border: 'none', cursor: 'pointer', fontSize: '13px' }}>🗑</button>
                              </div>
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
          <div style={{ padding: '20px', backgroundColor: 'var(--bg-main)', borderTop: '1px solid var(--border-light)' }}>

            {/* Alerta de múltipla */}
            {combinedProb !== null && (
              <div style={{ marginBottom: '16px', padding: '12px', borderRadius: '10px', backgroundColor: 'rgba(215,58,73,0.08)', border: '1px solid rgba(215,58,73,0.25)' }}>
                <div style={{ fontSize: '12px', fontWeight: '800', color: '#d73a49', marginBottom: '6px' }}>⚠️ ATENÇÃO — APOSTA MÚLTIPLA</div>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>
                  Probabilidade combinada de ganhar: <strong style={{ color: '#fba94c' }}>{(combinedProb * 100).toFixed(1)}%</strong>
                  {' '}({betSlip.map(m => `${m.confidence || 60}%`).join(' × ')})
                </div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', marginTop: '4px' }}>
                  Cada jogo adicional multiplica o risco. Apostas simples têm melhor EV a longo prazo.
                </div>
              </div>
            )}

            {/* Odd total */}
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', marginBottom: '14px', fontSize: '14px' }}>
              <span>Odd Total</span>
              <strong style={{ color: 'var(--text-primary)' }}>{betSlip.length > 0 ? totalOdd : '0.00'}x</strong>
            </div>

            {/* Kelly sugerido */}
            {kellyStake !== null && (
              <div style={{ marginBottom: '14px', padding: '10px 14px', borderRadius: '10px', backgroundColor: 'rgba(40,167,69,0.07)', border: '1px solid rgba(40,167,69,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginBottom: '2px' }}>KELLY SUGERIDO <span style={{ fontSize: '10px' }}>(½ Kelly)</span></div>
                  <div style={{ fontSize: '16px', fontWeight: '900', color: '#28a745' }}>{kellyStake.toFixed(2)}€</div>
                </div>
                <button
                  onClick={() => setStake(parseFloat(kellyStake.toFixed(2)))}
                  style={{ padding: '6px 12px', borderRadius: '8px', background: 'rgba(40,167,69,0.15)', color: '#28a745', border: '1px solid rgba(40,167,69,0.3)', cursor: 'pointer', fontSize: '12px', fontWeight: '700' }}
                >Usar</button>
              </div>
            )}

            {/* Input stake */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
              <label style={{ color: 'var(--text-secondary)', fontSize: '12px', fontWeight: '600', letterSpacing: '1px' }}>VALOR A APOSTAR (EUR)</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="number" min="1" max={wallet} value={stake}
                  onChange={(e) => setStake(Number(e.target.value))}
                  style={{ width: '100%', boxSizing: 'border-box', backgroundColor: 'var(--bg-panel)', color: 'var(--text-primary)', border: '1px solid var(--border-light)', borderRadius: '12px', padding: '16px', paddingRight: '60px', fontSize: '20px', fontWeight: '700', outline: 'none' }}
                />
                <span style={{ position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--mm-orange)', fontWeight: 'bold' }}>EUR</span>
              </div>
              {stake > wallet && <span style={{ color: 'var(--mm-red)', fontSize: '13px' }}>Saldo insuficiente</span>}
            </div>

            {/* Retorno */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', padding: '14px 16px', backgroundColor: 'var(--bg-panel)', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Retorno Potencial</span>
              <strong style={{ color: 'var(--text-primary)', fontSize: '24px' }}>{betSlip.length > 0 ? potentialReturn : '0.00'}</strong>
            </div>

            <button className="btn-mm" onClick={placeBet} disabled={betSlip.length === 0 || stake > wallet}>
              Confirmar Aposta
            </button>
          </div>
        )}
      </aside>
      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}} />
    </div>
  );
}
