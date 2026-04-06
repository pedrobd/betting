// ============================================================
// Database Types - Supabase Schema Types
// ============================================================

export interface Banca {
  id: string;
  saldo_atual: number;
  moeda: string;
  data_atualizacao: string;
  saldo_inicio_dia: number;
  perda_diaria_atual: number;
}

export interface HistoricoAposta {
  id: string;
  jogo: string;
  estrategia: "dutching" | "funil_cantos" | "acumulador_golos";
  stake: number;
  odd: number;
  resultado: "win" | "loss" | "pending" | "void";
  lucro_prejuizo: number;
  api_fixture_id?: number;
  data_aposta: string;
  data_resultado?: string;
  metadata: Record<string, unknown>;
}

export interface Oportunidade {
  id: string;
  tipo_estrategia: "dutching_resultado_correto" | "funil_cantos" | "acumulador_golos";
  msg_alerta: string;
  valor_sugerido_euro: number;
  api_fixture_id?: number;
  status: "ativa" | "executada" | "expirada" | "recusada";
  criada_em: string;
  expira_em?: string;
  metadata: Record<string, unknown>;
}

export interface DailySnapshot {
  id: string;
  data_snapshot: string;
  saldo_inicio: number;
  saldo_fim?: number;
  total_apostas: number;
  resultado_dia: number;
}

// ============================================================
// Acumulador de Golos Types
// ============================================================

export type GoalMarket =
  | "over_0.5"
  | "over_1.5"
  | "over_2.5"
  | "under_5.5"
  | "btts";

export type BetMarket = 
  | GoalMarket 
  | "1" | "X" | "2" 
  | "1X" | "X2" | "12"
  | "under_2.5" | "under_3.5" | "under_4.5";

export interface EVOpportunity {
  fixture_id: number;
  jogo: string;
  liga: string;
  market: BetMarket;
  odd: number;
  probabilidade: number;
  ev: number;
  sugestao: string;
}


export interface AcumuladorSelecao {
  fixture_id: number;
  jogo: string;
  mercado: BetMarket;
  odd: number;
  probabilidade_estimada: number; // 0-1
  horario?: string;
  avg_goals?: number;
  avg_goals_home?: number;
  avg_goals_away?: number;
  form?: string;
  form_home?: string;
  form_away?: string;
  h2h_un55_pct?: number;
  home_pos?: number;
  away_pos?: number;
  home_record?: string; // e.g. "5-2-1"
  away_record?: string; // e.g. "1-2-5"
}

export interface AcumuladorAposta {
  id?: string; // Optional for pending creations
  ciclo_id: string;
  stake: number;
  odd_total: number;
  selecoes: AcumuladorSelecao[];
  retorno_potencial: number;
}

export interface CicloAcumulador {
  id: string;
  stake_inicio: number;
  stake_atual: number;
  objetivo: number;
  status: "ativo" | "concluido" | "perdido";
  total_apostas: number;
  criado_em: string;
  concluido_em?: string;
}

export interface ApostaAcumulador {
  id: string;
  ciclo_id: string;
  stake: number;
  odd_total: number;
  selecoes: AcumuladorSelecao[];
  resultado: "win" | "loss" | "pending" | "void";
  retorno: number;
  lucro_prejuizo: number;
  criada_em: string;
  data_resultado?: string;
  metadata: Record<string, unknown>;
}

export interface CicloState {
  ciclo: CicloAcumulador;
  progressao_pct: number;          // 0-100
  faltam_para_objetivo: number;    // €X para chegar a €1000
  multiplicador_necessario: number; // odd minima para chegar a €1000 num passo
  aposta_pendente?: ApostaAcumulador;
  historico_apostas: ApostaAcumulador[];
}

export interface GoalsAnalysis {
  fixture_id: number;
  jogo: string;
  taxa_over05: number;
  taxa_over15: number;
  taxa_over25: number;
  taxa_under55: number;
  taxa_btts: number;
  media_golos: number;
  mercado_recomendado: BetMarket;
  odd_estimada: number;
  confianca: number; // 0-1
}


// ============================================================
// API-Football Types
// ============================================================

export interface ApiFixture {
  fixture: {
    id: number;
    date: string;
    status: { elapsed: number | null; short: string };
  };
  teams: {
    home: { id: number; name: string };
    away: { id: number; name: string };
  };
  goals: { home: number | null; away: number | null };
  score: { halftime: { home: number | null; away: number | null } };
  league?: { id: number; name: string; country: string; logo: string; flag: string; season: number; round: string };
}

export interface ApiFixtureStatistics {
  team: { id: number; name: string };
  statistics: Array<{ type: string; value: number | string | null }>;
}

export interface ApiFixtureEvent {
  time: { elapsed: number };
  type: string;
  team: { id: number };
}

// ============================================================
// Engine Types (Legacy - mantidos para compatibilidade)
// ============================================================

export type StakeMethod = "units" | "kelly";

export interface KellyInput {
  probability: number;
  odds: number;
}

export interface KellyResult {
  fraction: number;
  approved: boolean;
  reason?: string;
}

export interface BankrollState {
  saldo: number;
  saldoInicioDia: number;
  perdaDiaria: number;
  stopLossAtivo: boolean;
  unidade: number;
}

// ============================================================
// Supabase Database type
// ============================================================

export type Database = {
  public: {
    Tables: {
      banca: { Row: Banca; Insert: Partial<Banca>; Update: Partial<Banca> };
      historico_apostas: { Row: HistoricoAposta; Insert: Omit<HistoricoAposta, "id" | "data_aposta">; Update: Partial<HistoricoAposta> };
      oportunidades: { Row: Oportunidade; Insert: Omit<Oportunidade, "id" | "criada_em">; Update: Partial<Oportunidade> };
      daily_snapshot: { Row: DailySnapshot; Insert: Partial<DailySnapshot>; Update: Partial<DailySnapshot> };
      acumulador_ciclos: { Row: CicloAcumulador; Insert: Partial<CicloAcumulador>; Update: Partial<CicloAcumulador> };
      acumulador_apostas: { Row: ApostaAcumulador; Insert: Omit<ApostaAcumulador, "id" | "criada_em">; Update: Partial<ApostaAcumulador> };
    };
  };
};
