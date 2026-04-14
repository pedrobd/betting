"use client"
import { useState, useEffect } from 'react';
import './globals.css';

export const dynamic = 'force-dynamic';

export default function Home() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState(null);
  const [offset, setOffset] = useState(0);

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
        // Proteção contra duplicados: Filtra jogos com as mesmas equipas
        const seen = new Set();
        const unique = (data.matches || []).filter(m => {
          const key = `${m.team_home}-${m.team_away}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        setMatches(unique.slice(0, 10)); 
      } else {
        showToast("Server Sync Error", "error");
      }
    } catch(e) {
      showToast("Network Ping Failed", "error");
    }
    setLoading(false);
  };

  const loadMore = async () => {
    if (!session) return;
    setLoading(true);
    const nextOffset = offset + 10;
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
          if (seen.has(key)) return false;
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

  // -- Estatísticas de Performance --
  const stats = {
    totalStaked: history.reduce((acc, curr) => acc + parseFloat(curr.stake || 0), 0),
    totalEarned: history.filter(b => b.status === 'WON').reduce((acc, curr) => acc + parseFloat(curr.potential_return || curr.potentialReturn || 0), 0),
  };
  const netProfit = (stats.totalEarned - stats.totalStaked).toFixed(2);

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
    <div className="layout-container" style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--bg-main)', position: 'relative' }}>
      
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
      <div className="feed-container" style={{ flex: 1, padding: '40px 20px', maxWidth: '800px', margin: '0 auto' }}>
        <header className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
          <div className="header-brand">
            🦊 <span>Bet</span>Mask
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            {matches.length > 0 && (
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', backgroundColor: 'rgba(255,255,255,0.05)', padding: '4px 8px', borderRadius: '4px' }}>
                📡 CLOUD SYNC: {new Date(matches[0].created_at).toLocaleTimeString()}
              </span>
            )}
            <button 
              onClick={initData} 
              disabled={loading}
              style={{ background: 'transparent', border: 'none', color: 'var(--mm-orange)', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              {loading ? 'SYNCING...' : '🔄 SYNC'}
            </button>
            <div style={{ backgroundColor: 'var(--bg-panel)', padding: '12px 24px', borderRadius: 'var(--radius-btn)', border: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: '12px' }}>
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

        {!loading && matches.length === 0 && (
          <div className="card fade-in" style={{textAlign: "center", marginTop: "80px", borderStyle: 'dashed', padding: '40px'}}>
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
          {matches.map((m, idx) => {
            const isSelected = betSlip.some(b => b.team_home === m.team_home);
            
            return (
              <div 
                key={idx} 
                className={`card fade-in ${isSelected ? 'selected' : ''}`}
                onClick={() => toggleBet(m)}
                style={{ animationDelay: `${idx * 0.05}s`, cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '600', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: 'var(--mm-orange)' }}>●</span> 
                    {m.time.includes(':') ? `HOJE ÀS ${m.time}` : m.time.toUpperCase()} 
                    <span style={{ color: 'rgba(255,255,255,0.2)' }}>|</span>
                    {new Date(m.created_at).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' })}
                  </span>
                  <div className={`badge-odd ${isSelected ? 'selected' : ''}`}>
                     {m.odd.toFixed(2)}x
                  </div>
                </div>
                
                <h3 style={{ margin: '0 0 16px 0', fontSize: '20px', display: 'flex', justifyContent: 'space-between', letterSpacing: '-0.5px' }}>
                  <span style={{ color: isSelected ? 'var(--mm-orange)' : 'var(--text-primary)' }}>{m.team_home}</span>
                  <span style={{ color: 'var(--border-light)' }}>vs</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{m.team_away}</span>
                </h3>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px' }}>Confidence</span>
                  <div style={{ flex: 1, backgroundColor: 'var(--border-light)', height: '8px', borderRadius: '100px', overflow: 'hidden' }}>
                    <div style={{ width: `${m.confidence}%`, backgroundColor: m.confidence > 75 ? 'var(--mm-green)' : 'var(--mm-orange)', height: '100%', borderRadius: '100px' }}></div>
                  </div>
                  <strong style={{ fontSize: '14px', color: 'var(--text-primary)' }}>{m.confidence}%</strong>
                </div>
                
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
      <div className="sidebar-slip" style={{ width: '380px', backgroundColor: 'var(--bg-panel)', borderLeft: '1px solid var(--border-light)', position: 'sticky', top: 0, height: '100vh', display: 'flex', flexDirection: 'column', boxShadow: '-10px 0 30px rgba(0,0,0,0.5)' }}>
         
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
                          <p style={{ fontSize: '12px', color: 'var(--mm-blue)', margin: 0, fontWeight: '600' }}>Match Winner</p>
                          <div style={{ textAlign: 'right', fontWeight: '900', color: 'var(--mm-orange)', fontSize: '18px', marginTop: '8px' }}>
                            {b.odd.toFixed(2)}x
                          </div>
                       </div>
                     ))}
                  </div>
                )}
              </>
            ) : (
              // TAB HISTORY
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                 
                 {/* Dashboard de Performance */}
                 <div style={{ padding: '20px', backgroundColor: 'var(--bg-main)', borderRadius: 'var(--radius-card)', border: '1px solid var(--border-light)', marginBottom: '8px' }}>
                    <p style={{ margin: '0 0 12px 0', fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 'bold' }}>Performance Summary</p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                       <div>
                          <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>Staked</p>
                          <strong style={{ fontSize: '16px' }}>{stats.totalStaked.toFixed(2)}</strong>
                       </div>
                       <div style={{ textAlign: 'right' }}>
                          <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>Profit/Loss</p>
                          <strong style={{ fontSize: '18px', color: netProfit >= 0 ? 'var(--mm-green)' : 'var(--mm-red)' }}>
                            {netProfit >= 0 ? '+' : ''}{netProfit} EUR
                          </strong>
                       </div>
                    </div>
                 </div>

                 {history.length === 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100px', opacity: 0.6 }}>
                       <p style={{ color: 'var(--text-secondary)', textAlign: 'center', margin: 0 }}>Sem apostas gravadas nesta sessão.</p>
                    </div>
                 ) : (
                    history.map((record, index) => {
                      const isPending = record.status === 'PENDING';
                      const isWon = record.status === 'WON';
                      const statusColor = isWon ? 'var(--mm-green)' : (isPending ? 'var(--warning)' : 'var(--mm-red)');
                      
                      return (
                        <div key={record.id} className="card fade-in" style={{ padding: '16px', borderLeft: `3px solid ${statusColor}` }}>
                           <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Ticket #{record.id.substring(0,8).toUpperCase()}</span>
                              
                              {isPending && <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--warning)', backgroundColor: 'rgba(251,169,76,0.1)', padding: '2px 8px', borderRadius: '4px' }}>⏰ PENDING</span>}
                              {isWon && <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--mm-green)', backgroundColor: 'rgba(40,167,69,0.1)', padding: '2px 8px', borderRadius: '4px' }}>✅ WON</span>}
                              {!isPending && !isWon && <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--mm-red)', backgroundColor: 'rgba(215,58,73,0.1)', padding: '2px 8px', borderRadius: '4px' }}>❌ LOST</span>}
                           </div>
                           <div style={{ borderBottom: '1px solid var(--border-light)', paddingBottom: '12px', marginBottom: '12px' }}>
                             {record.matches.map((m, ii) => (
                               <div key={ii} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '6px' }}>
                                  <span style={{ color: 'var(--text-primary)' }}>{m.team_home}</span>
                                  <span style={{ color: 'var(--mm-orange)', fontWeight: 'bold' }}>{m.odd?.toFixed(2) || m.odd}</span>
                               </div>
                             ))}
                           </div>
                           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: isPending ? '16px' : '0' }}>
                             <div>
                                <p style={{ margin: '0 0 4px 0', fontSize: '12px', color: 'var(--text-secondary)' }}>Stake</p>
                                <strong style={{ color: 'var(--text-primary)' }}>{record.stake} EUR</strong>
                             </div>
                             <div style={{ textAlign: 'right' }}>
                                <p style={{ margin: '0 0 4px 0', fontSize: '12px', color: 'var(--text-secondary)' }}>Est. Return</p>
                                <strong style={{ color: 'var(--mm-green)' }}>{record.potential_return || record.potentialReturn} EUR</strong>
                             </div>
                           </div>
                           
                           {/* God Mode: Resolve Buttons */}
                           {isPending && (
                             <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid var(--border-light)', paddingTop: '12px' }}>
                                <button 
                                  onClick={() => resolveBet(record.id, 'WON', parseFloat(record.potential_return || record.potentialReturn))}
                                  style={{ flex: 1, backgroundColor: 'rgba(40,167,69,0.1)', color: 'var(--mm-green)', border: '1px solid var(--mm-green)', borderRadius: '6px', padding: '8px', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.2s' }}
                                >
                                  ✅ Win Bet
                                </button>
                                <button 
                                  onClick={() => resolveBet(record.id, 'LOST', 0)}
                                  style={{ flex: 1, backgroundColor: 'rgba(215,58,73,0.1)', color: 'var(--mm-red)', border: '1px solid var(--mm-red)', borderRadius: '6px', padding: '8px', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.2s' }}
                                >
                                  ❌ Lose Bet
                                </button>
                             </div>
                           )}
                        </div>
                      );
                    })
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
      </div>
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}} />
    </div>
  );
}
