"use client";

import { useEffect, useState, useCallback } from "react";
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell
} from 'recharts';
import { 
  TrendingUp, Target, Activity, Award, Calendar, 
  ChevronUp, ChevronDown, CheckCircle, XCircle,
  Trophy, Search, Home, Sparkles
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────

interface Selecao {
  fixture_id: number;
  jogo: string;
  mercado: string;
  odd: number;
  probabilidade_estimada: number;
  horario?: string;
  avg_goals?: number;
  form?: string;
  h2h_un55_pct?: number;
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
  avg_goals?: number;
  form?: string;
  h2h_un55_pct?: number;
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

const TOP_LEAGUES_COUNT = 80;

// ── Dashboard ──────────────────────────────────────────────

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<"acumulador" | "ev" | "radar" | "previsoes" | "performance">("acumulador");
  const [cicloState, setCicloState] = useState<CicloState | null>(null);
  const [historicoCiclos, setHistoricoCiclos] = useState<CicloAcumulador[]>([]);
  const [apostaAtual, setApostaAtual] = useState<ApostaGerada | null>(null);
  const [evOps, setEvOps] = useState<EVOpportunity[]>([]);
  const [radarOps, setRadarOps] = useState<EVOpportunity[]>([]);
  const [previsoes, setPrevisoes] = useState<EVOpportunity[]>([]);
  const [performanceData, setPerformanceData] = useState<any[]>([]);
  const [performanceStats, setPerformanceStats] = useState<any>(null);
  const [previsoesLoading, setPrevisoesLoading] = useState(false);
  const [performanceLoading, setPerformanceLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [gerando, setGerando] = useState(false);
  const [scaneando, setScaneando] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [radarLoading, setRadarLoading] = useState(false);
  const [resolvendo, setResolvendo] = useState<"win" | "loss" | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" | "info" } | null>(null);
  const [expandedAposta, setExpandedAposta] = useState<string | null>(null);
  const [excludedMatchIds, setExcludedMatchIds] = useState<number[]>([]);

  // Load exclusions
  useEffect(() => {
    const saved = localStorage.getItem("betting_excluded_matches");
    if (saved) setExcludedMatchIds(JSON.parse(saved));
  }, []);

  const toggleExcludeMatch = (id: number) => {
    const next = excludedMatchIds.includes(id) 
      ? excludedMatchIds.filter(x => x !== id) 
      : [...excludedMatchIds, id];
    setExcludedMatchIds(next);
    localStorage.setItem("betting_excluded_matches", JSON.stringify(next));
    showToast(excludedMatchIds.includes(id) ? "Jogo reativado!" : "Jogo desativado.", "info");
  };

  const showToast = (msg: string, type: "success" | "error" | "info" = "info") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const getSafetyColor = (avg: number) => {
    if (avg < 2.5) return { bg: 'rgba(74, 222, 128, 0.1)', text: '#4ade80' }; // Verde
    if (avg < 3.5) return { bg: 'rgba(251, 191, 36, 0.1)', text: '#fbbf24' }; // Ambar
    return { bg: 'rgba(248, 113, 113, 0.1)', text: '#f87171' }; // Vermelho
  };

  const formatTime = (dateStr?: string) => {
    if (!dateStr) return "--/-- --:--";
    
    // Se for apenas um número (minuto do jogo ao vivo), mostra como "X'"
    if (/^\d+'?$/.test(dateStr.trim())) {
      return `LIVE: ${dateStr.trim()}'`;
    }

    // Se for um status conhecido de tempo real
    const statusLower = dateStr.toLowerCase();
    if (statusLower.includes("ao vivo") || statusLower.includes("live") || statusLower.includes("intervalo")) {
      return dateStr.toUpperCase();
    }

    let d = new Date(dateStr);

    // Fallback for HH:mm format (legacy/scraped strings without date)
    if (isNaN(d.getTime()) && dateStr.includes(":") && dateStr.length <= 5) {
      const today = new Date().toISOString().split("T")[0];
      d = new Date(`${today}T${dateStr}:00Z`);
    }

    // Handle Flashscore date format (e.g., "08.04. 23:00")
    if (isNaN(d.getTime()) && dateStr.includes(".") && dateStr.includes(":")) {
      const parts = dateStr.split(" ");
      if (parts.length >= 2) {
        const dateParts = parts[0].split(".");
        const timeParts = parts[1].split(":");
        if (dateParts.length >= 2 && timeParts.length >= 2) {
          const year = new Date().getFullYear();
          // Adjust year to 2026 if it's in the past
          const targetYear = year < 2026 ? 2026 : year;
          d = new Date(targetYear, parseInt(dateParts[1]) - 1, parseInt(dateParts[0]), parseInt(timeParts[0]), parseInt(timeParts[1]));
        }
      }
    }

    if (isNaN(d.getTime())) {
      return dateStr;
    }

    return d.toLocaleString("pt-PT", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

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
        // Filter out excluded on client side
        setEvOps(json.data.filter((op: any) => !excludedMatchIds.includes(op.fixture_id)));
      }
    } catch {
      showToast("Erro ao scanear EV.", "error");
    } finally {
      setScaneando(false);
    }
  }, [excludedMatchIds]);

  const fetchRadar = useCallback(async () => {
    setRadarLoading(true);
    try {
      const res = await fetch("/api/strategies/radar-favoritos");
      const json = await res.json();
      if (json.success) {
        setRadarOps(json.data.filter((op: any) => !excludedMatchIds.includes(op.fixture_id)));
      }
    } catch {
      showToast("Erro ao carregar Radar.", "error");
    } finally {
      setRadarLoading(false);
    }
  }, [excludedMatchIds]);

  const fetchPrevisoes = useCallback(async () => {
    setPrevisoesLoading(true);
    try {
      const res = await fetch("/api/strategies/previsoes");
      const json = await res.json();
      if (json.success) {
        setPrevisoes(json.data.filter((op: any) => !excludedMatchIds.includes(op.fixture_id)));
      }
    } catch {
      showToast("Erro ao carregar Previsões.", "error");
    } finally {
      setPrevisoesLoading(false);
    }
  }, [excludedMatchIds]);

  const fetchPerformance = useCallback(async () => {
    setPerformanceLoading(true);
    try {
      const res = await fetch("/api/analytics/performance");
      const json = await res.json();
      if (json.success) {
        setPerformanceData(json.data);
        setPerformanceStats(json.stats);
      }
    } catch {
      showToast("Erro ao carregar Performance.", "error");
    } finally {
      setPerformanceLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCiclo();
    
    const interval = setInterval(() => {
      fetchCiclo();
    }, 30000); // Ciclo keeps auto-updating for results
    return () => clearInterval(interval);
  }, [fetchCiclo]);

  // Initial EV fetch when tab changes, but NO interval
  useEffect(() => {
    if (activeTab === "ev" && evOps.length === 0) {
      fetchEV();
    }
    if (activeTab === "radar" && radarOps.length === 0) {
      fetchRadar();
    }
    if (activeTab === "previsoes" && previsoes.length === 0) {
      fetchPrevisoes();
    }
    if (activeTab === "performance") {
      fetchPerformance();
    }
  }, [activeTab, fetchEV, fetchRadar, fetchPrevisoes, fetchPerformance, evOps.length, radarOps.length, previsoes.length]);


  const gerarAcumulador = async () => {
    setGerando(true);
    setApostaAtual(null);
    try {
      const res = await fetch("/api/strategies/acumulador", { 
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ excludedIds: excludedMatchIds })
      });
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

  const verificarResultados = async () => {
    showToast("A verificar fontes de dados reais...", "info");
    try {
      const res = await fetch("/api/cron/update-results", {
        headers: { "Authorization": "Bearer dev-secret" } // In dev, we might need to handle this
      });
      const json = await res.json();
      if (json.updated > 0) {
        showToast(`✅ ${json.updated} aposta(s) resolvida(s)!`, "success");
        await fetchCiclo();
      } else {
        showToast("Os jogos ainda não terminaram.", "info");
      }
    } catch {
      showToast("Não foi possível aceder à cron API.", "error");
    }
  };

  const reiniciarCiclo = async () => {
    if (!confirm("Tem a certeza que deseja reiniciar o ciclo para €5.00? O progresso atual será arquivado.")) return;
    try {
      const res = await fetch("/api/acumulador/reset", { method: "POST" });
      const json = await res.json();
      if (json.success) {
        showToast(json.message, "success");
        setApostaAtual(null);
        await fetchCiclo();
      } else {
        showToast(json.error ?? "Erro ao reiniciar ciclo.", "error");
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
    <main className="app-container">
      {toast && (
        <div className={`toast toast--${toast.type}`}>
          {toast.msg}
        </div>
      )}

      {/* ── Sidebar (Desktop) ───────────────────────────── */}
      <aside className="sidebar">
        <div className="logo-wrapper" style={{ marginBottom: '3rem', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '45px', height: '45px', background: 'var(--clr-accent)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 20px rgba(6,182,212,0.3)' }}>
            <span style={{ fontSize: '1.5rem' }}>💎</span>
          </div>
          <div>
            <h1 style={{ letterSpacing: '-0.03em', fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>COOL<span style={{ color: 'var(--clr-accent)' }}>BET</span></h1>
            <span style={{ fontSize: '0.6rem', color: 'var(--clr-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Elite Analytics</span>
          </div>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {[
            { id: 'acumulador', label: 'Dashboard', icon: <Trophy size={20} /> },
            { id: 'ev', label: 'Scanner +EV', icon: <Search size={20} /> },
            { id: 'radar', label: 'Radar Favoritos', icon: <Home size={20} /> },
            { id: 'previsoes', label: 'Previsões Elite', icon: <Sparkles size={20} /> },
            { id: 'performance', label: 'Performance', icon: <TrendingUp size={20} /> },
          ].map((item) => (
            <button
              key={item.id}
              className={`tab-btn ${activeTab === item.id ? "active" : ""}`}
              onClick={() => setActiveTab(item.id as any)}
              style={{ justifyContent: 'flex-start', padding: '12px 16px', borderRadius: '12px' }}
            >
              {item.icon}
              <span style={{ marginLeft: '12px' }}>{item.label}</span>
            </button>
          ))}
        </nav>

        <div style={{ marginTop: 'auto', padding: '1.5rem', background: 'rgba(255,255,255,0.03)', borderRadius: '16px', border: '1px solid var(--clr-border)' }}>
          <p style={{ fontSize: '0.7rem', color: 'var(--clr-muted)', marginBottom: '4px' }}>ESTADO DO MOTOR</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '8px', height: '8px', background: 'var(--clr-green)', borderRadius: '50%', boxShadow: '0 0 10px var(--clr-green)' }} />
            <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>LIVE 2026</span>
          </div>
        </div>
      </aside>

      {/* ── Bottom Nav (Mobile) ─────────────────────────── */}
      <nav className="bottom-nav">
        {[
          { id: 'acumulador', icon: <Trophy size={22} /> },
          { id: 'ev', icon: <Search size={22} /> },
          { id: 'radar', icon: <Home size={22} /> },
          { id: 'previsoes', icon: <Sparkles size={22} /> },
          { id: 'performance', icon: <TrendingUp size={22} /> },
        ].map((item) => (
          <button
            key={item.id}
            className={`tab-btn ${activeTab === item.id ? "active" : ""}`}
            onClick={() => setActiveTab(item.id as any)}
            style={{ width: '50px', height: '50px', background: 'none', border: 'none', color: activeTab === item.id ? 'var(--clr-accent)' : 'var(--clr-muted)' }}
          >
            {item.icon}
          </button>
        ))}
      </nav>

      <div className="main-content">
        {/* ── Header ────────────────────────────────────────── */}
        <header className="dash-header" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--clr-border)', marginBottom: '2rem' }}>
          <div className="header-left">
            <div className="logo-text" style={{ fontSize: '1.2rem', fontWeight: 800 }}>
              <span style={{ color: 'var(--clr-text)' }}>Resumo de </span>
              <span style={{ color: 'var(--clr-accent)' }}>Atividade</span>
            </div>
            <p className="subtitle" style={{ fontSize: '0.75rem', marginLeft: '10px', paddingLeft: '10px', borderLeft: '1px solid var(--clr-border)' }}>
              €5 → <span style={{ color: 'var(--clr-green)', fontWeight: 700 }}>€1.000,00</span>
            </p>
          </div>
          <div className="header-right" style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
            <div style={{ textAlign: 'right', borderRight: '1px solid rgba(255,255,255,0.1)', paddingRight: '20px' }}>
              <p style={{ fontSize: '0.6rem', color: 'var(--clr-muted)', textTransform: 'uppercase', fontWeight: 700 }}>HORA LOCAL</p>
              <p style={{ fontSize: '0.9rem', fontWeight: 600 }}>{currentTime.toLocaleTimeString("pt-PT", { hour: '2-digit', minute: '2-digit' })}</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: '0.6rem', color: 'var(--clr-muted)', textTransform: 'uppercase', fontWeight: 700 }}>BANCA ATUAL</p>
              <p style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--clr-green)' }}>€{ciclo?.stake_atual?.toFixed(2) ?? "5.00"}</p>
            </div>
          </div>
        </header>


      {/* ── Global Cycle Progress ──────────────────────────── */}
      <section className="cycle-section" style={{ position: 'relative', overflow: 'hidden', marginBottom: '2rem' }}>
          <div style={{ position: 'absolute', top: '-50%', right: '-10%', width: '300px', height: '300px', background: 'radial-gradient(circle, rgba(6,182,212,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div className="cycle-header">
          <div className="cycle-title">
            <span className="cycle-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--clr-accent)' }} />
                Ciclo Ativo #{historicoCiclos.length || 1}
            </span>
            <span className="cycle-apostas">{ciclo?.total_apostas ?? 0} etapas concluídas hoje</span>
          </div>
          <div className="cycle-amounts" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <button 
              onClick={reiniciarCiclo} 
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--clr-border)', color: 'var(--clr-muted)', fontSize: '0.7rem', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, transition: 'all 0.2s' }}
              title="Reiniciar Ciclo para €5.00"
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; e.currentTarget.style.color = 'var(--clr-red)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.color = 'var(--clr-muted)'; }}
            >
              🔄 Reiniciar
            </button>
            <div style={{ textAlign: 'right' }}>
                <p className="cs-label">Objetivo</p>
                <span className="stake-objetivo" style={{ fontSize: '1.5rem', opacity: 1, color: 'var(--clr-text)' }}>€{ciclo?.objetivo?.toFixed(0) ?? "1000"}</span>
            </div>
          </div>
        </div>

        <div className="progress-track" style={{ height: '14px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div
            className="progress-fill progress-fill--glow"
            style={{ 
                width: `${cicloState?.progressao_pct ?? 0.5}%`, 
                background: 'linear-gradient(90deg, var(--clr-accent), #ff7733)',
                boxShadow: '0 0 25px rgba(255,85,0,0.3)'
            }}
          />
          <div
            className="progress-label"
            style={{ 
                left: `${Math.min(cicloState?.progressao_pct ?? 0.5, 90)}%`,
                background: 'var(--clr-accent)',
                color: 'white',
                padding: '2px 8px',
                borderRadius: '4px',
                top: '-30px',
                fontSize: '0.7rem'
            }}
          >
            {cicloState?.progressao_pct?.toFixed(1)}%
          </div>
        </div>

        <div className="cycle-stats" style={{ background: 'rgba(0,0,0,0.2)', padding: '1.25rem', borderRadius: '12px' }}>
          <div className="cycle-stat">
            <span className="cs-label">Banca</span>
            <span className="cs-value" style={{ color: 'var(--clr-green)' }}>€{ciclo?.stake_atual?.toFixed(2)}</span>
          </div>
          <div className="cycle-stat">
            <span className="cs-label">Faltam</span>
            <span className="cs-value">€{cicloState?.faltam_para_objetivo?.toFixed(2)}</span>
          </div>
          <div className="cycle-stat">
            <span className="cs-label">Multiplicador</span>
            <span className="cs-value cs-value--amber" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                {cicloState?.multiplicador_necessario?.toFixed(1)}x 
                <span style={{ fontSize: '0.6rem', opacity: 0.6 }}>IQ</span>
            </span>
          </div>
        </div>
      </section>

      {activeTab === "acumulador" ? (
        <>
          {/* ── Pending / Builder Area ────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            
            {pendente && (
              <section className="pending-section" style={{ background: 'rgba(255,171,0,0.02)', border: '1px solid rgba(255,171,0,0.15)' }}>
                <div className="pending-header" style={{ marginBottom: '1.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span className="pending-badge" style={{ padding: '4px 12px', background: 'var(--clr-amber)', color: 'black' }}>EM CURSO</span>
                    <h3 style={{ fontSize: '0.9rem', fontWeight: 700 }}>Aguardando Resultados Reais</h3>
                  </div>
                  <span className="pending-meta" style={{ background: 'rgba(255,255,255,0.05)', padding: '4px 10px', borderRadius: '6px' }}>
                    Stake: <strong>€{pendente.stake.toFixed(2)}</strong> · Retorno: <strong style={{ color: 'var(--clr-green)' }}>€{(pendente.stake * pendente.odd_total).toFixed(2)}</strong>
                  </span>
                </div>
                
                <div className="pending-selecoes" style={{ gap: '8px' }}>
                  {(pendente.selecoes ?? []).map((s, i) => (
                    <div key={i} className="selecao-row" style={{ padding: '12px 16px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                      <span className="sel-num" style={{ opacity: 0.4 }}>{i + 1}</span>
                      <div style={{ flex: 1 }}>
                        <p className="sel-jogo" style={{ fontSize: '0.9rem' }}>
                          {s.jogo}
                        </p>
                        <p style={{ fontSize: '0.65rem', color: 'var(--clr-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                             <span>⌚ {formatTime(s.horario)}</span>
                             <span style={{ color: MARKET_LABEL[s.mercado]?.color }}>• {MARKET_LABEL[s.mercado]?.label}</span>
                             {s.avg_goals && (
                               <span style={{ 
                                 background: getSafetyColor(s.avg_goals).bg, 
                                 color: getSafetyColor(s.avg_goals).text,
                                 padding: '1px 8px', 
                                 borderRadius: '12px',
                                 fontSize: '0.6rem',
                                 fontWeight: 700,
                                 border: `1px solid ${getSafetyColor(s.avg_goals).text}22`
                               }}>
                                 📊 {s.avg_goals.toFixed(1)} avg
                               </span>
                             )}
                             {s.form && <span style={{ opacity: 0.6 }}>[{s.form}]</span>}
                        </p>
                      </div>
                      <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div>
                          <span className="sel-odd" style={{ fontSize: '1rem', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '4px' }}>{s.odd.toFixed(2)}</span>
                          <div style={{ fontSize: '0.6rem', marginTop: '4px', color: 'var(--clr-amber)' }}>⏳ A AGUARDAR</div>
                        </div>
                        <button 
                          onClick={async () => {
                            if (confirm(`Excluir "${s.jogo}" e gerar nova aposta?`)) {
                              setExcludedMatchIds(prev => [...prev, s.fixture_id]);
                              await cancelarAposta(pendente.id);
                              setTimeout(() => gerarAcumulador(), 500);
                            }
                          }}
                          style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: 'var(--clr-red)', cursor: 'pointer', padding: '10px', borderRadius: '8px', fontSize: '1.2rem' }}
                          title="Eliminar este jogo e gerar novo"
                        >
                          🚫
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pending-actions" style={{ marginTop: '1.5rem', display: 'flex', gap: '10px' }}>
                   <button
                    className="btn-result"
                    onClick={verificarResultados}
                    style={{ height: '50px', fontSize: '0.9rem', flex: 1, background: 'var(--clr-surface-3)', border: '1px solid var(--clr-border)', color: 'white' }}
                  >
                    🔄 Verificar Resultados
                  </button>
                   <button
                    className="btn-result btn-result--win"
                    onClick={() => resolverAposta(pendente.id, "win")}
                    style={{ height: '50px', fontSize: '0.9rem', flex: 1, fontWeight: 700 }}
                    title="Simular Vitória (Para Testes)"
                  >
                    {resolvendo === "win" ? "..." : "Simular WIN 🏆"}
                  </button>
                  <button
                    className="btn-regenerar"
                    onClick={() => cancelarAposta(pendente.id)}
                    style={{ height: '50px', width: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', background: 'rgba(255,59,113,0.1)', color: 'var(--clr-red)', border: '1px solid rgba(255,59,113,0.2)' }}
                    title="Anular Aposta"
                  >
                    🗑️
                  </button>
                </div>
              </section>
            )}

            {!pendente && (
              <section className="builder-section" style={{ border: '1px solid var(--clr-border)', boxShadow: 'none' }}>
                <div className="builder-header">
                   <div>
                    <h2 style={{ fontSize: '1.1rem', color: 'var(--clr-text)', textTransform: 'none', letterSpacing: '0' }}>Próxima Etapa</h2>
                    <p style={{ fontSize: '0.75rem', color: 'var(--clr-muted)' }}>O algoritmo seleciona os melhores mercados de golos para hoje</p>
                   </div>
                   <button
                    className="btn-gerar"
                    onClick={gerarAcumulador}
                    disabled={gerando}
                    style={{ background: 'var(--clr-accent)', color: 'white', border: 'none', padding: '10px 20px' }}
                  >
                    {gerando ? <span className="btn-spinner" style={{ borderTopColor: 'white' }} /> : "🚀 Gerar Seleções"}
                  </button>
                </div>

                {apostaAtual ? (
                  <div className="acumulador-card" style={{ animation: 'fadeIn 0.5s ease' }}>
                    <div className="acumulador-summary" style={{ background: 'var(--clr-surface-2)', border: '1px solid var(--clr-accent)', borderRadius: '16px' }}>
                       <div className="acc-stat">
                        <span className="acc-stat-label">Investimento</span>
                        <span className="acc-stat-val" style={{ color: 'var(--clr-text)' }}>€{apostaAtual.stake.toFixed(2)}</span>
                      </div>
                      <div className="acc-stat">
                        <span className="acc-stat-label">Odd Total</span>
                        <span className="acc-stat-val" style={{ color: 'var(--clr-accent)' }}>{apostaAtual.odd_total.toFixed(2)}x</span>
                      </div>
                      <div className="acc-stat">
                        <span className="acc-stat-label">Potencial</span>
                        <span className="acc-stat-val" style={{ color: 'var(--clr-green)' }}>€{apostaAtual.retorno_potencial.toFixed(2)}</span>
                      </div>
                      <div className="acc-stat">
                        <span className="acc-stat-label">Jogos</span>
                        <span className="acc-stat-val">{apostaAtual.selecoes.length}</span>
                      </div>
                    </div>

                    <div className="selecoes-list" style={{ gap: '10px' }}>
                       {apostaAtual.selecoes.map((s, i) => (
                        <div key={i} className="selecao-row" style={{ height: '64px', transition: 'transform 0.2s' }}>
                          <span className="sel-num" style={{ opacity: 0.3 }}>{i + 1}</span>
                          <div style={{ flex: 1 }}>
                            <p style={{ fontWeight: 700, fontSize: '0.9rem' }}>{s.jogo}</p>
                            <p style={{ fontSize: '0.65rem', color: 'var(--clr-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span>🕒 {formatTime(s.horario)}</span>
                                {s.avg_goals && (
                                  <span style={{ 
                                    background: getSafetyColor(s.avg_goals).bg, 
                                    color: getSafetyColor(s.avg_goals).text,
                                    padding: '1px 8px', 
                                    borderRadius: '12px',
                                    fontSize: '0.6rem',
                                    fontWeight: 700,
                                    border: `1px solid ${getSafetyColor(s.avg_goals).text}22`
                                  }}>
                                    📊 {s.avg_goals.toFixed(1)} avg
                                  </span>
                                )}
                                {s.form && <span style={{ color: 'var(--clr-accent)', opacity: 0.8 }}>{s.form}</span>}
                            </p>
                          </div>
                          <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                            <button 
                              onClick={(e) => { e.stopPropagation(); toggleExcludeMatch(s.fixture_id); }}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.65rem', opacity: 0.4, color: 'var(--clr-red)', marginBottom: '4px' }}
                              title="Remover este jogo permanentemente"
                            >
                              🚫 Desativar
                            </button>
                            <p style={{ color: MARKET_LABEL[s.mercado]?.color, fontSize: '0.75rem', fontWeight: 800 }}>{MARKET_LABEL[s.mercado]?.label}</p>
                            <p style={{ fontWeight: 800, color: 'var(--clr-text)' }}>{s.odd.toFixed(2)}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="acumulador-actions">
                       <button
                        className="btn-confirmar"
                        onClick={() => {
                          fetchCiclo();
                          showToast("✅ Acumulador Registado na Base de Dados!", "success");
                        }}
                        style={{ height: '54px', fontSize: '1.1rem', background: 'var(--clr-accent)', border: 'none', color: 'white' }}
                      >
                        ⚡ REGISTAR APOSTA NO CICLO
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="empty-builder" style={{ padding: '60px 20px', background: 'rgba(0,0,0,0.15)' }}>
                    <div style={{ fontSize: '3rem', opacity: 0.2, marginBottom: '10px' }}>📊</div>
                    <p style={{ fontWeight: 600 }}>Nenhum acumulador ativo</p>
                    <p style={{ maxWidth: '300px', margin: '0 auto', opacity: 0.6 }}>O motor está pronto para analisar os mercados de hoje em 2026.</p>
                  </div>
                )}
              </section>
            )}
          </div>

          {/* ── History Sections ─────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem' }}>
             {cicloState && cicloState.historico_apostas.length > 0 && (
              <section className="historico-section">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h2 style={{ margin: 0 }}>Atividade do Ciclo</h2>
                    <span className="badge" style={{ background: 'var(--clr-surface-3)', color: 'white' }}>{cicloState.historico_apostas.length} Apostas</span>
                </div>
                <div className="historico-list">
                  {cicloState.historico_apostas.map((a) => (
                    <div key={a.id} className={`hist-item hist-item--${a.resultado}`} style={{ background: 'rgba(255,255,255,0.02)' }}>
                       <div className="hist-header" style={{ display: 'grid', gridTemplateColumns: '30px 1fr 1fr 1fr 40px 30px', alignItems: 'center', gap: '10px' }}>
                         <span style={{ fontSize: '1.2rem' }} onClick={(e) => { e.stopPropagation(); setExpandedAposta(expandedAposta === a.id ? null : a.id); }}>{a.resultado === 'win' ? '🟢' : a.resultado === 'loss' ? '🔴' : '🟡'}</span>
                         <span style={{ fontWeight: 700 }}>€{a.stake.toFixed(2)}</span>
                         <span style={{ opacity: 0.5 }}>@{a.odd_total.toFixed(2)}</span>
                         <span style={{ textAlign: 'right', fontWeight: 800, color: a.lucro_prejuizo >= 0 ? 'var(--clr-green)' : 'var(--clr-red)' }}>
                            {a.lucro_prejuizo >= 0 ? '+' : ''}€{a.lucro_prejuizo.toFixed(2)}
                         </span>
                         <button 
                           onClick={(e) => { e.stopPropagation(); cancelarAposta(a.id); }}
                           style={{ background: 'none', border: 'none', color: 'var(--clr-red)', fontSize: '1.1rem', opacity: 0.6, cursor: 'pointer', padding: '5px' }}
                           title="Apagar aposta permanentemente"
                         >
                           🗑️
                         </button>
                         <span style={{ cursor: 'pointer' }} onClick={() => setExpandedAposta(expandedAposta === a.id ? null : a.id)}>{expandedAposta === a.id ? '▲' : '▼'}</span>
                       </div>
                    </div>
                  ))}
                </div>
              </section>
             )}
          </div>
        </>
      ) : (
        <>
          {activeTab === "ev" && (
            <section className="ev-scanner-section">
          {/* EV Scanner remains with the same robust logic but better card styles applied via the grid */}
            <div className="section-header">
             <div>
               <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Scanner de Valor <span style={{ color: 'var(--clr-accent)' }}>+EV</span></h2>
               <p className="subtitle">Odds desajustadas detetadas por comparação estatística</p>
             </div>
             <button className="btn-gerar" onClick={fetchEV} disabled={scaneando}>
               {scaneando ? "A scanear..." : "🔄 Atualizar Varredura"}
             </button>
           </div>

          <div className="ev-grid" style={{ marginTop: '1rem' }}>
            {evOps.length > 0 ? (
              evOps.map((op, i) => (
                <div key={i} className="ev-card" style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)' }}>
                   <div className="ev-card-header">
                    <span className="ev-liga">{op.liga}</span>
                    <button 
                      onClick={() => toggleExcludeMatch(op.fixture_id)}
                      style={{ background: 'none', border: 'none', color: 'var(--clr-red)', fontSize: '0.7rem', opacity: 0.5, cursor: 'pointer' }}
                    >
                      🚫 Desativar
                    </button>
                  </div>
                  <h3 className="ev-jogo">{op.jogo}</h3>
                  <div className="ev-market-box" style={{ background: 'var(--clr-bg)', border: 'none' }}>
                    <span className="ev-market-label">Oportunidade</span>
                    <span className="ev-market-value" style={{ color: MARKET_LABEL[op.market]?.color }}>
                      {MARKET_LABEL[op.market]?.label ?? op.market}
                    </span>
                  </div>
                  <div className="ev-stats-grid">
                    <div className="ev-stat">
                      <span className="label">ODD</span>
                      <span className="val">{op.odd.toFixed(2)}x</span>
                    </div>
                    <div className="ev-stat">
                      <span className="label">PROB</span>
                      <span className="val">{(op.probabilidade * 100).toFixed(0)}%</span>
                    </div>
                    <div className="ev-stat ev-stat--highlight">
                      <span className="label">VALOR</span>
                      <span className="val" style={{ color: 'var(--clr-green)' }}>+{(op.ev * 100).toFixed(1)}%</span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state" style={{ background: 'rgba(0,0,0,0.1)', border: '1px dashed var(--clr-border)' }}>
                 {scaneando ? (
                   <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                     <div className="spinner" style={{ borderTopColor: 'var(--clr-accent)' }} />
                     <p>Analisando 200+ jogos em tempo real...</p>
                   </div>
                 ) : (
                   <>
                    <span style={{ fontSize: '3rem', opacity: 0.2 }}>📉</span>
                    <p style={{ marginTop: '1rem' }}>Sem oportunidades de valor no momento.</p>
                   </>
                 )}
              </div>
            )}
          </div>
        </section>
      )}

      {activeTab === "radar" && (
        <section className="radar-section">
          <div className="section-header">
            <div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }}>🏠 Radar de <span style={{ color: 'var(--clr-green)' }}>Favoritos</span></h2>
              <p className="subtitle">Superioridade absoluta em casa (Tabela + Forma)</p>
            </div>
            <button className="btn-gerar" onClick={fetchRadar} disabled={radarLoading}>
              {radarLoading ? "Analizando..." : "🔄 Atualizar Radar"}
            </button>
          </div>

          <div className="ev-grid" style={{ marginTop: '1.5rem' }}>
            {radarOps.length > 0 ? (
              radarOps.map((op, i) => (
                <div key={i} className="ev-card" style={{ background: 'var(--clr-surface)', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                  <div className="ev-card-header">
                    <span className="ev-liga">{op.liga}</span>
                    <span className="ev-sugestao" style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--clr-green)', border: '1px solid rgba(16, 185, 129, 0.2)' }}>FAVORITO EM CASA</span>
                  </div>
                  <h3 className="ev-jogo" style={{ margin: '0.8rem 0' }}>{op.jogo}</h3>
                  
                  {/* Win Probability Bar */}
                  <div style={{ marginTop: '1.2rem', padding: '1.2rem', background: 'rgba(0,0,0,0.2)', borderRadius: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.8rem', fontWeight: 600 }}>
                      <span style={{ opacity: 0.6 }}>Probabilidade de Ganho</span>
                      <span style={{ color: 'var(--clr-green)', fontSize: '1.1rem' }}>{(op.probabilidade * 100).toFixed(0)}%</span>
                    </div>
                    <div style={{ height: '10px', background: 'rgba(255,255,255,0.05)', borderRadius: '5px', overflow: 'hidden' }}>
                      <div style={{ 
                        height: '100%', 
                        width: `${op.probabilidade * 100}%`, 
                        background: `linear-gradient(90deg, #3b82f6 0%, #10b981 100%)`,
                        boxShadow: '0 0 10px rgba(16, 185, 129, 0.3)',
                        transition: 'width 1s ease-out'
                      }} />
                    </div>
                  </div>

                  <div className="ev-stats-grid" style={{ marginTop: '1.2rem' }}>
                    <div className="ev-stat">
                      <span className="label">ODD ({op.market})</span>
                      <span className="val">{op.odd.toFixed(2)}x</span>
                    </div>
                    <div className="ev-stat">
                       <button 
                        onClick={() => toggleExcludeMatch(op.fixture_id)}
                        style={{ background: 'none', border: 'none', color: 'var(--clr-red)', fontSize: '0.65rem', opacity: 0.4, cursor: 'pointer' }}
                      >
                        🚫 Ocultar
                      </button>
                    </div>
                    <div className="ev-stat ev-stat--highlight" style={{ background: 'rgba(16, 185, 129, 0.1)' }}>
                      <span className="label">POTENCIAL</span>
                      <span className="val" style={{ color: 'var(--clr-green)' }}>+{(op.ev * 100).toFixed(1)}%</span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state" style={{ background: 'rgba(0,0,0,0.1)', border: '1px dashed var(--clr-green)', gridColumn: '1/-1', textAlign: 'center', padding: '4rem 2rem' }}>
                {radarLoading ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                    <div className="spinner" style={{ borderTopColor: 'var(--clr-green)' }} />
                    <p>Calculando probabilidades...</p>
                  </div>
                ) : (
                  <>
                    <span style={{ fontSize: '3rem', opacity: 0.2 }}>🏠</span>
                    <p style={{ marginTop: '1rem' }}>Radar limpo. Sem favoritos claros com odds de valor.</p>
                  </>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {activeTab === "previsoes" && (
        <section className="previsoes-section">
          <div className="section-header">
            <div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }}>✨ Previsões <span style={{ color: 'var(--clr-accent)' }}>Elite</span></h2>
              <p className="subtitle">Resultados estatísticos com probabilidade superior a 80%</p>
            </div>
            
            <div style={{ display: 'flex', gap: '10px' }}>
              <div style={{ position: 'relative' }}>
                <input 
                  type="text" 
                  placeholder="Filtrar por liga ou equipa..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--clr-border)', borderRadius: '12px', padding: '10px 15px', fontSize: '0.85rem', width: '250px', color: 'white', transition: 'all 0.2s' }}
                />
              </div>
              <button className="btn-gerar" onClick={fetchPrevisoes} disabled={previsoesLoading}>
                {previsoesLoading ? "Analizando..." : "🔄 Atualizar"}
              </button>
            </div>
          </div>

          <div className="ev-grid" style={{ marginTop: '1.5rem' }}>
            {previsoes
              .filter(op => 
                op.liga.toLowerCase().includes(searchTerm.toLowerCase()) || 
                op.jogo.toLowerCase().includes(searchTerm.toLowerCase())
              ).length > 0 ? (
              previsoes
                .filter(op => 
                  op.liga.toLowerCase().includes(searchTerm.toLowerCase()) || 
                  op.jogo.toLowerCase().includes(searchTerm.toLowerCase())
                )
                .map((op, i) => (
                <div key={i} className="ev-card" style={{ background: 'var(--clr-surface)', border: '1px solid rgba(251, 191, 36, 0.3)', position: 'relative' }}>
                  <div className="ev-card-header">
                    <span className="ev-liga">{op.liga}</span>
                    <span className="ev-sugestao" style={{ background: 'rgba(251, 191, 36, 0.1)', color: 'var(--clr-amber)', border: '1px solid rgba(251, 191, 36, 0.2)' }}>
                      {op.sugestao}
                    </span>
                  </div>
                  <h3 className="ev-jogo" style={{ margin: '0.8rem 0', fontSize: '1.1rem' }}>{op.jogo}</h3>
                  
                  {/* Stats Context Row */}
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '1rem', flexWrap: 'wrap' }}>
                    {op.form && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(255,255,255,0.05)', padding: '4px 8px', borderRadius: '6px', fontSize: '0.7rem' }}>
                        <Activity size={12} color="var(--clr-amber)" />
                        <span style={{ fontWeight: 700, letterSpacing: '1px' }}>{op.form}</span>
                      </div>
                    )}
                    {op.avg_goals && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(255,255,255,0.05)', padding: '4px 8px', borderRadius: '6px', fontSize: '0.7rem' }}>
                        <span style={{ opacity: 0.6 }}>Golos:</span>
                        <span style={{ fontWeight: 700 }}>{op.avg_goals.toFixed(1)} avg</span>
                      </div>
                    )}
                  </div>
                  
                  <div style={{ marginTop: '1.2rem', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.8rem', fontWeight: 600 }}>
                      <span style={{ opacity: 0.6 }}>Confiança do Algoritmo</span>
                      <span style={{ color: 'var(--clr-amber)', fontSize: '1rem' }}>{(op.probabilidade * 100).toFixed(0)}%</span>
                    </div>
                    <div style={{ height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ 
                        height: '100%', 
                        width: `${op.probabilidade * 100}%`, 
                        background: `linear-gradient(90deg, #fbbf24 0%, #f59e0b 100%)`,
                        boxShadow: '0 0 15px rgba(251, 191, 36, 0.2)'
                      }} />
                    </div>
                  </div>

                  <div className="ev-stats-grid" style={{ marginTop: '1.2rem' }}>
                    <div className="ev-stat">
                      <span className="label">PREVISÃO (MERCADO)</span>
                      <span className="val" style={{ color: 'white', fontWeight: 800 }}>{op.market}</span>
                    </div>
                    <div className="ev-stat">
                      <span className="label">ODD ATUAL</span>
                      <span className="val">{op.odd ? `${op.odd.toFixed(2)}x` : '--'}</span>
                    </div>
                    <div style={{ position: 'absolute', top: '10px', right: '10px' }}>
                      <button 
                        onClick={() => toggleExcludeMatch(op.fixture_id)}
                        style={{ background: 'rgba(0,0,0,0.3)', border: 'none', color: 'var(--clr-red)', fontSize: '0.8rem', cursor: 'pointer', padding: '5px', borderRadius: '50%' }}
                        title="Ocultar jogo"
                      >
                        🚫
                      </button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state" style={{ background: 'rgba(0,0,0,0.1)', border: '1px dashed var(--clr-amber)', gridColumn: '1/-1', textAlign: 'center', padding: '4rem 2rem' }}>
                {previsoesLoading ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                    <div className="spinner" style={{ borderTopColor: 'var(--clr-amber)' }} />
                    <p>O algoritmo está a processar {TOP_LEAGUES_COUNT}+ ligas...</p>
                  </div>
                ) : (
                  <>
                    <span style={{ fontSize: '3rem', opacity: 0.2 }}>✨</span>
                    <p style={{ marginTop: '1rem' }}>Nenhum resultado com 80%+ de confiança detetado neste momento.</p>
                  </>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {activeTab === "performance" && (
        <section className="performance-section animate-in">
          <div className="section-header">
            <div>
              <h2 style={{ fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                📊 Análise de <span style={{ color: 'var(--clr-green)' }}>Performance Elite</span>
              </h2>
              <p className="subtitle">Estatísticas acumuladas e evolução patrimonial do motor</p>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginTop: '20px' }}>
            <div className="stat-card" style={{ background: 'var(--clr-surface)', padding: '1.5rem', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--clr-muted)', fontWeight: 600 }}>TAXA DE ACERTO</span>
                <Award size={20} color="var(--clr-amber)" />
              </div>
              <p style={{ fontSize: '2rem', fontWeight: 800, marginTop: '10px' }}>{performanceStats?.winRate}%</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '5px', fontSize: '0.75rem', color: 'var(--clr-green)' }}>
                <ChevronUp size={12} /> <span>Acima da média</span>
              </div>
            </div>
            
            <div className="stat-card" style={{ background: 'var(--clr-surface)', padding: '1.5rem', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--clr-muted)', fontWeight: 600 }}>LUCRO TOTAL</span>
                <TrendingUp size={20} color="var(--clr-green)" />
              </div>
              <p style={{ fontSize: '2rem', fontWeight: 800, marginTop: '10px', color: 'var(--clr-green)' }}>€{performanceStats?.totalProfit}</p>
              <span style={{ fontSize: '0.7rem', opacity: 0.5 }}>Líquido acumulado</span>
            </div>

            <div className="stat-card" style={{ background: 'var(--clr-surface)', padding: '1.5rem', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--clr-muted)', fontWeight: 600 }}>TOTAL APOSTAS</span>
                <Activity size={20} color="var(--clr-accent)" />
              </div>
              <p style={{ fontSize: '2rem', fontWeight: 800, marginTop: '10px' }}>{performanceStats?.totalBets}</p>
              <span style={{ fontSize: '0.7rem', opacity: 0.5 }}>Operaçoes finalizadas</span>
            </div>
          </div>

          {/* Bankroll Chart */}
          <div style={{ background: 'var(--clr-surface)', padding: '2rem', borderRadius: '24px', marginTop: '2rem', border: '1px solid rgba(255,255,255,0.05)', height: '450px' }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              📈 Evolução da Banca (€)
            </h3>
            <div style={{ width: '100%', height: '350px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={performanceData}>
                  <defs>
                    <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--clr-accent)" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="var(--clr-accent)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
                  <XAxis 
                    dataKey="timestamp" 
                    hide 
                  />
                  <YAxis 
                    stroke="rgba(255,255,255,0.2)" 
                    fontSize={10} 
                    tickFormatter={(val) => `€${val}`}
                    domain={['auto', 'auto']}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip 
                    contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                    itemStyle={{ color: '#22c55e' }}
                    labelFormatter={(label) => new Date(label).toLocaleDateString()}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="balance" 
                    stroke="#22c55e" 
                    strokeWidth={3}
                    fillOpacity={1} 
                    fill="url(#colorBalance)" 
                    animationDuration={1500}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      )}
        </>
      )}

      {/* ── Hidden Games Manager ────────────────────────── */}
      {excludedMatchIds.length > 0 && (
        <section style={{ marginTop: '2rem', background: 'rgba(0,0,0,0.2)', padding: '1.5rem', borderRadius: '16px', border: '1px dashed rgba(255,255,255,0.1)' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🔒 Jogos Desativados</span>
            <span style={{ fontSize: '0.7rem', opacity: 0.5, fontWeight: 400 }}>({excludedMatchIds.length})</span>
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            {excludedMatchIds.map(id => (
              <div key={id} style={{ background: 'var(--clr-surface-2)', padding: '4px 12px', borderRadius: '20px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <span>ID: {id}</span>
                <button 
                  onClick={() => toggleExcludeMatch(id)}
                  style={{ background: 'none', border: 'none', color: 'var(--clr-green)', cursor: 'pointer', fontWeight: 700 }}
                >
                  ➕ Reativar
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

        {/* ── Footer ───────────────────────────────────────── */}
        <footer style={{ marginTop: '4rem', padding: '2rem 0', textAlign: 'center', borderTop: '1px solid var(--clr-border)', opacity: 0.5 }}>
           <p style={{ fontSize: '0.75rem' }}>COOLBET Analytics v5.0 · Powered by Universal Shield AI</p>
           <p style={{ fontSize: '0.65rem', marginTop: '4px' }}>Dados fornecidos por API-Sports, SoccerData e FlashLive 2026</p>
        </footer>
      </div>
    </main>
  );
}

