"use client";

import { useEffect, useState, useCallback } from "react";

// ── Types ──────────────────────────────────────────────────

interface Selecao {
  fixture_id: number;
  jogo: string;
  mercado: string;
  odd: number;
  probabilidade_estimada: number;
}

interface ApostaGerada {
  id: string;
  ciclo_id: string;
  stake: number;
  odd_total: number;
  selecoes: Selecao[];
  retorno_potencial: number;
}

interface CicloAcumulador {
  id: string;
  stake_inicio: number;
  stake_atual: number;
  objetivo: number;
  status: "ativo" | "concluido" | "perdido";
  total_apostas: number;
  criado_em: string;
}

interface ApostaHistorico {
  id: string;
  stake: number;
  odd_total: number;
  resultado: "win" | "loss" | "pending" | "void";
  retorno: number;
  lucro_prejuizo: number;
  criada_em: string;
  selecoes: Selecao[];
}

interface CicloState {
  ciclo: CicloAcumulador;
  progressao_pct: number;
  faltam_para_objetivo: number;
  multiplicador_necessario: number;
  aposta_pendente?: ApostaHistorico;
  historico_apostas: ApostaHistorico[];
}

interface EVOpportunity {
  fixture_id: number;
  jogo: string;
  liga: string;
  market: string;
  odd: number;
  probabilidade: number;
  ev: number;
  sugestao: string;
}


// ── Market Labels ───────────────────────────────────────────

const MARKET_LABEL: Record<string, { label: string; color: string }> = {
  "over_0.5": { label: "Over 0.5 ⚽", color: "#22c55e" },
  "over_1.5": { label: "Over 1.5 ⚽", color: "#16a34a" },
  "over_2.5": { label: "Over 2.5 🎯", color: "#f59e0b" },
  "under_2.5": { label: "Under 2.5 🧱", color: "#10b981" },
  "under_3.5": { label: "Under 3.5 🧱", color: "#059669" },
  "under_5.5": { label: "Under 5.5 🛡️", color: "#3b82f6" },
  btts: { label: "Ambas Marcam ⚡", color: "#a855f7" },
  "1": { label: "Vitória Casa (1) 🏠", color: "#2563eb" },
  "X": { label: "Empate (X) 🤝", color: "#64748b" },
  "2": { label: "Vitória Fora (2) 🚀", color: "#dc2626" },
  "1X": { label: "Casa ou Empate (1X) 🛡️", color: "#3b82f6" },
  "X2": { label: "Empate ou Fora (X2) 🛡️", color: "#3b82f6" },
  "12": { label: "Qualquer Equipa (12) ⚔️", color: "#6366f1" },
};

// ── Dashboard ──────────────────────────────────────────────

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<"acumulador" | "ev">("acumulador");
  const [cicloState, setCicloState] = useState<CicloState | null>(null);
  const [historicoCiclos, setHistoricoCiclos] = useState<CicloAcumulador[]>([]);
  const [apostaAtual, setApostaAtual] = useState<ApostaGerada | null>(null);
  const [evOps, setEvOps] = useState<EVOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [gerando, setGerando] = useState(false);
  const [scaneando, setScaneando] = useState(false);
  const [resolvendo, setResolvendo] = useState<"win" | "loss" | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" | "info" } | null>(null);
  const [expandedAposta, setExpandedAposta] = useState<string | null>(null);

  const showToast = (msg: string, type: "success" | "error" | "info" = "info") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchCiclo = useCallback(async () => {
    try {
      const res = await fetch("/api/acumulador/ciclo");
      const json = await res.json();
      if (json.success) {
        setCicloState(json.data.ciclo_state);
        setHistoricoCiclos(json.data.historico_ciclos);
        // If there's a pending bet, restore it
        if (json.data.ciclo_state.aposta_pendente) {
          setApostaAtual(null); // pending is shown in state
        }
      }
    } catch {
      showToast("Erro ao carregar dados.", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchEV = useCallback(async () => {
    setScaneando(true);
    try {
      const res = await fetch("/api/strategies/ev-scanner");
      const json = await res.json();
      if (json.success) {
        setEvOps(json.data);
      }
    } catch {
      showToast("Erro ao scanear EV.", "error");
    } finally {
      setScaneando(false);
    }
  }, []);

  useEffect(() => {
    fetchCiclo();
    if (activeTab === "ev") fetchEV();
    
    const interval = setInterval(() => {
      fetchCiclo();
      if (activeTab === "ev") fetchEV();
    }, 60000);
    return () => clearInterval(interval);
  }, [fetchCiclo, fetchEV, activeTab]);

  const gerarAcumulador = async () => {
    setGerando(true);
    setApostaAtual(null);
    try {
      const res = await fetch("/api/strategies/acumulador", { method: "POST" });
      const json = await res.json();
      if (json.success) {
        setApostaAtual(json.data);
        showToast(`✅ Acumulador gerado com ${json.data.selecoes.length} seleções!`, "success");
      } else {
        showToast(json.error ?? "Erro ao gerar acumulador.", "error");
      }
    } finally {
      setGerando(false);
    }
  };

  const resolverAposta = async (apostaId: string, resultado: "win" | "loss") => {
    setResolvendo(resultado);
    try {
      const res = await fetch("/api/acumulador/resolver", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apostaId, resultado }),
      });
      const json = await res.json();
      if (json.success) {
        setCicloState(json.data);
        setApostaAtual(null);
        showToast(json.message, resultado === "win" ? "success" : "error");
        await fetchCiclo();
      } else {
        showToast(json.error ?? "Erro ao resolver aposta.", "error");
      }
    } finally {
      setResolvendo(null);
    }
  };

  const cancelarAposta = async (apostaId: string) => {
    if (!confirm("Tem certeza que deseja apagar esta aposta permanentemente?")) return;
    
    try {
      const res = await fetch(`/api/acumulador/resolver?apostaId=${apostaId}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (json.success) {
        setCicloState(json.data);
        setApostaAtual(null);
        showToast("Aposta eliminada com sucesso.", "info");
        await fetchCiclo();
      } else {
        showToast(json.error ?? "Erro ao eliminar aposta.", "error");
      }
    } catch {
      showToast("Erro ao conectar com o servidor.", "error");
    }
  };

  const pendente = cicloState?.aposta_pendente;
  const ciclo = cicloState?.ciclo;

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p>A carregar engine...</p>
      </div>
    );
  }

  return (
    <main className="dashboard">
      {/* ── Toast ─────────────────────────────────────────── */}
      {toast && (
        <div className={`toast toast--${toast.type}`}>
          {toast.msg}
        </div>
      )}

      {/* ── Tabs ─────────────────────────────────────────── */}
      <nav className="tab-nav">
        <button
          className={`tab-btn ${activeTab === "acumulador" ? "active" : ""}`}
          onClick={() => setActiveTab("acumulador")}
        >
          🏆 Ciclo Acumulador (€1000)
        </button>
        <button
          className={`tab-btn ${activeTab === "ev" ? "active" : ""}`}
          onClick={() => setActiveTab("ev")}
        >
          💎 Oportunidades +EV
        </button>
      </nav>

      {activeTab === "acumulador" ? (
        <>
          {/* ── Header ────────────────────────────────────────── */}
          <header className="dash-header">
            <div className="header-left">
              <span className="logo-icon">⚽</span>
              <div>
                <h1>Betano Engine</h1>
                <p className="subtitle">Acumulador de Golos · €5 → €1000</p>
              </div>
            </div>
            <div className="header-right">
              <span className={`status-badge ${ciclo?.status === "ativo" ? "safe" : "danger"}`}>
                {ciclo?.status === "ativo" ? "🟢 CICLO ATIVO" : "🔴 SEM CICLO"}
              </span>
            </div>
          </header>

          {/* ── Cycle Progress ────────────────────────────────── */}
          <section className="cycle-section">
            <div className="cycle-header">
              <div className="cycle-title">
                <span className="cycle-label">🎯 CICLO #{historicoCiclos.length}</span>
                <span className="cycle-apostas">{ciclo?.total_apostas ?? 0} apostas realizadas</span>
              </div>
              <div className="cycle-amounts">
                <span className="stake-atual">€{ciclo?.stake_atual?.toFixed(2) ?? "5.00"}</span>
                <span className="stake-sep">→</span>
                <span className="stake-objetivo">€{ciclo?.objetivo?.toFixed(0) ?? "1000"}</span>
              </div>
            </div>

            <div className="progress-track">
              <div
                className="progress-fill progress-fill--glow"
                style={{ width: `${cicloState?.progressao_pct ?? 0.5}%` }}
              />
              <div
                className="progress-label"
                style={{ left: `${Math.min(cicloState?.progressao_pct ?? 0.5, 90)}%` }}
              >
                {cicloState?.progressao_pct?.toFixed(1)}%
              </div>
            </div>

            <div className="cycle-stats">
              <div className="cycle-stat">
                <span className="cs-label">Stake atual</span>
                <span className="cs-value cs-value--green">€{ciclo?.stake_atual?.toFixed(2)}</span>
              </div>
              <div className="cycle-stat">
                <span className="cs-label">Faltam para €1000</span>
                <span className="cs-value">€{cicloState?.faltam_para_objetivo?.toFixed(2)}</span>
              </div>
              <div className="cycle-stat">
                <span className="cs-label">Multiplicador necessário</span>
                <span className="cs-value cs-value--amber">{cicloState?.multiplicador_necessario?.toFixed(1)}x</span>
              </div>
            </div>
          </section>

          {/* ── Pending Bet Alert ─────────────────────────────── */}
          {pendente && !apostaAtual && (
            <section className="pending-section">
              <div className="pending-header">
                <span className="pending-badge">⏳ APOSTA PENDENTE</span>
                <span className="pending-meta">
                  €{pendente.stake.toFixed(2)} · odd {pendente.odd_total.toFixed(2)}x · retorno potencial €{(pendente.stake * pendente.odd_total).toFixed(2)}
                </span>
              </div>
              <div className="pending-selecoes">
                {(pendente.selecoes ?? []).map((s, i) => (
                  <div key={i} className="selecao-row">
                    <span className="sel-num">{i + 1}</span>
                    <span className="sel-jogo">{s.jogo}</span>
                    <span
                      className="sel-mercado"
                      style={{ color: MARKET_LABEL[s.mercado]?.color ?? "#fff" }}
                    >
                      {MARKET_LABEL[s.mercado]?.label ?? s.mercado}
                    </span>
                    <span className="sel-odd">{s.odd.toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <div className="pending-actions">
                <button
                  className="btn-result btn-result--win"
                  onClick={() => resolverAposta(pendente.id, "win")}
                  disabled={!!resolvendo}
                >
                  {resolvendo === "win" ? "A processar..." : "✅ Ganhou"}
                </button>
                <button
                  className="btn-result btn-result--loss"
                  onClick={() => resolverAposta(pendente.id, "loss")}
                  disabled={!!resolvendo}
                >
                  {resolvendo === "loss" ? "A processar..." : "❌ Perdeu"}
                </button>
              </div>
              <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'center' }}>
                <button 
                  className="btn-regenerar" 
                  style={{ width: 'auto', padding: '0.5rem 1rem' }}
                  onClick={() => cancelarAposta(pendente.id)}
                >
                  🚫 Cancelar e Apagar Aposta (Odds Reais)
                </button>
              </div>
            </section>
          )}

          {/* ── Accumulator Builder ───────────────────────────── */}
          {!pendente && (
            <section className="builder-section">
              <div className="builder-header">
                <h2>Acumulador do Dia</h2>
                <button
                  className="btn-gerar"
                  onClick={gerarAcumulador}
                  disabled={gerando}
                >
                  {gerando ? (
                    <><span className="btn-spinner" />A analisar jogos...</>
                  ) : (
                    <>▶ Gerar Acumulador</>
                  )}
                </button>
              </div>

              {apostaAtual ? (
                <div className="acumulador-card">
                  <div className="acumulador-summary">
                    <div className="acc-stat">
                      <span className="acc-stat-label">Stake</span>
                      <span className="acc-stat-val">€{apostaAtual.stake.toFixed(2)}</span>
                    </div>
                    <div className="acc-stat">
                      <span className="acc-stat-label">Odd Total</span>
                      <span className="acc-stat-val acc-stat-val--amber">{apostaAtual.odd_total.toFixed(2)}x</span>
                    </div>
                    <div className="acc-stat">
                      <span className="acc-stat-label">Retorno Potencial</span>
                      <span className="acc-stat-val acc-stat-val--green">€{apostaAtual.retorno_potencial.toFixed(2)}</span>
                    </div>
                    <div className="acc-stat">
                      <span className="acc-stat-label">Seleções</span>
                      <span className="acc-stat-val">{apostaAtual.selecoes.length}</span>
                    </div>
                  </div>

                  <div className="selecoes-list">
                    {apostaAtual.selecoes.map((s, i) => (
                      <div key={i} className="selecao-row">
                        <span className="sel-num">{i + 1}</span>
                        <span className="sel-jogo">{s.jogo}</span>
                        <span
                          className="sel-mercado"
                          style={{ color: MARKET_LABEL[s.mercado]?.color ?? "#fff" }}
                        >
                          {MARKET_LABEL[s.mercado]?.label ?? s.mercado}
                        </span>
                        <div className="sel-right">
                          <span className="sel-prob">{(s.probabilidade_estimada * 100).toFixed(0)}%</span>
                          <span className="sel-odd">{s.odd.toFixed(2)}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="acumulador-actions">
                    <button
                      className="btn-confirmar"
                      onClick={() => {
                        fetchCiclo();
                        showToast("✅ Aposta registada! Aguarda o resultado.", "success");
                      }}
                    >
                      ✅ Confirmar — Aposta Registada
                    </button>
                    <button className="btn-regenerar" onClick={gerarAcumulador} disabled={gerando}>
                      🔄 Regenerar Seleções
                    </button>
                  </div>
                </div>
              ) : (
                <div className="empty-builder">
                  <span className="empty-icon">🎲</span>
                  <p>Clica em <strong>Gerar Acumulador</strong> para o engine analisar hoje&apos;s jogos</p>
                  <p className="empty-sub">O engine vai selecionar 5-10 jogos com maior probabilidade de golos</p>
                </div>
              )}
            </section>
          )}

          {/* ── Cycle History ── */}
          {cicloState && cicloState.historico_apostas.length > 0 && (
            <section className="historico-section">
              <h2>Apostas deste Ciclo <span className="badge">{cicloState.historico_apostas.length}</span></h2>
              <div className="historico-list">
                {cicloState.historico_apostas.map((a) => (
                  <div key={a.id} className={`hist-item hist-item--${a.resultado}`}>
                    <div
                      className="hist-header"
                      onClick={() => setExpandedAposta(expandedAposta === a.id ? null : a.id)}
                      style={{ cursor: "pointer" }}
                    >
                      <span className="hist-resultado">
                        {a.resultado === "win" ? "✅" : a.resultado === "loss" ? "❌" : "⏳"}
                      </span>
                      <span className="hist-stake">€{a.stake.toFixed(2)}</span>
                      <span className="hist-odd">odd {a.odd_total.toFixed(2)}x</span>
                      <span className={`hist-lucro ${a.lucro_prejuizo >= 0 ? "hist-lucro--pos" : "hist-lucro--neg"}`}>
                        {a.lucro_prejuizo >= 0 ? "+" : ""}€{a.lucro_prejuizo.toFixed(2)}
                      </span>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button 
                          onClick={(e) => { e.stopPropagation(); cancelarAposta(a.id); }}
                          style={{ background: 'none', border: 'none', color: 'var(--clr-red)', fontSize: '1rem', opacity: 0.6, cursor: 'pointer' }}
                          title="Apagar aposta"
                        >
                          🗑️
                        </button>
                        <span className="hist-toggle" style={{ margin: 0 }}>{expandedAposta === a.id ? "▲" : "▼"}</span>
                      </div>
                    </div>

                    {expandedAposta === a.id && (
                      <div className="hist-selecoes">
                        {a.selecoes?.map((s, i) => (
                          <div key={i} className="hist-sel-row">
                            <span>{s.jogo}</span>
                            <span style={{ color: MARKET_LABEL[s.mercado]?.color ?? "#fff" }}>
                              {MARKET_LABEL[s.mercado]?.label ?? s.mercado}
                            </span>
                            <span>{s.odd.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Cycles History ────────────────────────────────── */}
          {historicoCiclos.length > 1 && (
            <section className="ciclos-section">
              <h2>Histórico de Ciclos</h2>
              <div className="ciclos-table">
                <div className="ciclos-thead">
                  <span>Ciclo</span>
                  <span>Apostas</span>
                  <span>Stake Final</span>
                  <span>Status</span>
                  <span>Data</span>
                </div>
                {historicoCiclos.map((c, i) => (
                  <div key={c.id} className={`ciclos-row ciclos-row--${c.status}`}>
                    <span className="ciclos-num">#{historicoCiclos.length - i}</span>
                    <span>{c.total_apostas}</span>
                    <span>€{c.stake_atual.toFixed(2)}</span>
                    <span className={`ciclo-status ciclo-status--${c.status}`}>
                      {c.status === "concluido" ? "🏆 Concluído" : c.status === "perdido" ? "💥 Perdido" : "🔄 Ativo"}
                    </span>
                    <span className="ciclos-data">{new Date(c.criado_em).toLocaleDateString("pt-PT")}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      ) : (
        <section className="ev-scanner-section">
          <div className="section-header">
            <div>
              <h2>Scanner de Valor Esperado (+EV)</h2>
              <p className="subtitle">Algoritmo que deteta odds desajustadas pelo mercado</p>
            </div>
            <button className="btn-gerar" onClick={fetchEV} disabled={scaneando}>
              {scaneando ? "A scanear..." : "🔄 Atualizar Scanner"}
            </button>
          </div>

          <div className="ev-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem', marginTop: '1.5rem' }}>
            {evOps.length > 0 ? (
              evOps.map((op, i) => (
                <div key={i} className="ev-card" style={{ background: 'var(--clr-bg-card)', padding: '1.5rem', borderRadius: '16px', border: '1px solid var(--clr-border)' }}>
                  <div className="ev-card-header" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', fontSize: '0.875rem' }}>
                    <span className="ev-liga" style={{ color: '#94a3b8' }}>{op.liga}</span>
                    <span className="ev-sugestao" style={{ color: op.ev > 0.2 ? '#f59e0b' : '#3b82f6', fontWeight: 600 }}>{op.sugestao}</span>
                  </div>
                  <h3 className="ev-jogo" style={{ fontSize: '1.125rem', marginBottom: '1rem' }}>{op.jogo}</h3>
                  <div className="ev-market-box" style={{ background: 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: '8px', marginBottom: '1rem' }}>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>Mercado sugerido:</div>
                    <span className="ev-market-value" style={{ color: MARKET_LABEL[op.market]?.color, fontWeight: 700 }}>
                      {MARKET_LABEL[op.market]?.label ?? op.market}
                    </span>
                  </div>
                  <div className="ev-stats-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                    <div className="ev-stat">
                      <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Odd</div>
                      <div style={{ fontWeight: 600 }}>{op.odd.toFixed(2)}</div>
                    </div>
                    <div className="ev-stat">
                      <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Prob.</div>
                      <div style={{ fontWeight: 600 }}>{(op.probabilidade * 100).toFixed(0)}%</div>
                    </div>
                    <div className="ev-stat">
                      <div style={{ fontSize: '0.7rem', color: '#22c55e' }}>Vantagem</div>
                      <div style={{ fontWeight: 700, color: '#22c55e' }}>+{(op.ev * 100).toFixed(1)}%</div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '4rem', background: 'var(--clr-bg-card)', borderRadius: '16px', color: '#94a3b8' }}>
                {scaneando ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                    <div className="spinner" style={{ width: '32px', height: '32px', border: '3px solid #3b82f6', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                    <p>A realizar varrimento de mercado (+EV)...</p>
                  </div>
                ) : (
                  <>
                    <span style={{ fontSize: '3rem', marginBottom: '1rem', display: 'block' }}>🔍</span>
                    <p>Nenhuma oportunidade com valor esperado positivo encontrada.</p>
                  </>
                )}
              </div>
            )}
          </div>
        </section>
      )}
    </main>
  );
}

