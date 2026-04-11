// ============================================================
// DatabaseClient - Supabase Data Access Layer
// All DB interactions go through this module
// ============================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "@supabase/supabase-js";
import type {
  Banca,
  HistoricoAposta,
  Oportunidade,
  CicloAcumulador,
  ApostaAcumulador,
  AcumuladorSelecao,
} from "../types";

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient<any>(url, key, { auth: { persistSession: false } });
}

// ============================================================
// BANCA
// ============================================================

export async function getBanca(): Promise<Banca> {
  const db = getServerClient();
  const { data, error } = await db.from("banca").select("*").limit(1).single();
  if (error) throw new Error(`getBanca: ${error.message}`);
  return data;
}

export async function updateSaldo(novoSaldo: number): Promise<void> {
  const db = getServerClient();
  const { error } = await db
    .from("banca")
    .update({ saldo_atual: novoSaldo, data_atualizacao: new Date().toISOString() })
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (error) throw new Error(`updateSaldo: ${error.message}`);
}

// ============================================================
// HISTORICO APOSTAS (legacy)
// ============================================================

export async function registarAposta(
  aposta: Omit<HistoricoAposta, "id" | "data_aposta">
): Promise<HistoricoAposta> {
  const db = getServerClient();
  const { data, error } = await db
    .from("historico_apostas")
    .insert(aposta)
    .select()
    .single();
  if (error) throw new Error(`registarAposta: ${error.message}`);
  return data;
}

export async function getApostasPendentes(): Promise<HistoricoAposta[]> {
  const db = getServerClient();
  const { data, error } = await db
    .from("historico_apostas")
    .select("*")
    .eq("resultado", "pending")
    .not("api_fixture_id", "is", null);
  if (error) throw new Error(`getApostasPendentes: ${error.message}`);
  return data ?? [];
}

export async function resolverAposta(
  id: string,
  resultado: "win" | "loss" | "void",
  lucro_prejuizo: number
): Promise<void> {
  const db = getServerClient();
  const { error } = await db
    .from("historico_apostas")
    .update({ resultado, lucro_prejuizo, data_resultado: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`resolverAposta: ${error.message}`);
}

// ============================================================
// OPORTUNIDADES
// ============================================================

export async function criarOportunidade(
  oportunidade: Omit<Oportunidade, "id" | "criada_em">
): Promise<Oportunidade> {
  const db = getServerClient();
  const { data, error } = await db
    .from("oportunidades")
    .insert(oportunidade)
    .select()
    .single();
  if (error) throw new Error(`criarOportunidade: ${error.message}`);
  return data;
}

export async function getOportunidadesAtivas(): Promise<Oportunidade[]> {
  const db = getServerClient();
  const { data, error } = await db
    .from("oportunidades")
    .select("*")
    .eq("status", "ativa")
    .order("criada_em", { ascending: false })
    .limit(20);
  if (error) throw new Error(`getOportunidadesAtivas: ${error.message}`);
  return data ?? [];
}

export async function atualizarStatusOportunidade(
  id: string,
  status: Oportunidade["status"]
): Promise<void> {
  const db = getServerClient();
  const { error } = await db
    .from("oportunidades")
    .update({ status })
    .eq("id", id);
  if (error) throw new Error(`atualizarStatus: ${error.message}`);
}

// ============================================================
// ACUMULADOR — CICLOS
// ============================================================

export async function getCicloAtivo(): Promise<CicloAcumulador | null> {
  const db = getServerClient();
  const { data, error } = await db
    .from("acumulador_ciclos")
    .select("*")
    .eq("status", "ativo")
    .single();
  if (error && error.code !== "PGRST116") throw new Error(`getCicloAtivo: ${error.message}`);
  return data ?? null;
}

export async function criarCiclo(stake_inicio = 5.00): Promise<CicloAcumulador> {
  const db = getServerClient();
  const { data, error } = await db
    .from("acumulador_ciclos")
    .insert({ id: crypto.randomUUID(), stake_inicio, stake_atual: stake_inicio, objetivo: 1000.00, status: "ativo", total_apostas: 0 })
    .select()
    .single();
  if (error) throw new Error(`criarCiclo: ${error.message}`);
  return data;
}

export async function atualizarStakeCiclo(
  cicloId: string,
  novoStake: number,
  totalApostas: number
): Promise<void> {
  const db = getServerClient();
  const { error } = await db
    .from("acumulador_ciclos")
    .update({ stake_atual: novoStake, total_apostas: totalApostas })
    .eq("id", cicloId);
  if (error) throw new Error(`atualizarStakeCiclo: ${error.message}`);
}

export async function fecharCiclo(
  cicloId: string,
  status: "concluido" | "perdido"
): Promise<void> {
  const db = getServerClient();
  const { error } = await db
    .from("acumulador_ciclos")
    .update({ status, concluido_em: new Date().toISOString() })
    .eq("id", cicloId);
  if (error) throw new Error(`fecharCiclo: ${error.message}`);
}

export async function getCiclosHistorico(limit = 10): Promise<CicloAcumulador[]> {
  const db = getServerClient();
  const { data, error } = await db
    .from("acumulador_ciclos")
    .select("*")
    .order("criado_em", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`getCiclosHistorico: ${error.message}`);
  return data ?? [];
}

// ============================================================
// ACUMULADOR — APOSTAS
// ============================================================

export async function registarApostaAcumulador(aposta: {
  ciclo_id: string;
  stake: number;
  odd_total: number;
  selecoes: AcumuladorSelecao[];
  metadata?: Record<string, unknown>;
}): Promise<ApostaAcumulador> {
  const db = getServerClient();
  const { data, error } = await db
    .from("acumulador_apostas")
    .insert({
      id: crypto.randomUUID(),
      ...aposta,
      resultado: "pending",
      retorno: 0,
      lucro_prejuizo: 0,
      metadata: aposta.metadata ?? {},
    })
    .select()
    .single();
  if (error) throw new Error(`registarApostaAcumulador: ${error.message}`);
  return data;
}

export async function resolverApostaAcumulador(
  apostaId: string,
  resultado: "win" | "loss" | "void",
  retorno: number,
  lucro_prejuizo: number
): Promise<void> {
  const db = getServerClient();
  const { error } = await db
    .from("acumulador_apostas")
    .update({ resultado, retorno, lucro_prejuizo, data_resultado: new Date().toISOString() })
    .eq("id", apostaId);
  if (error) throw new Error(`resolverApostaAcumulador: ${error.message}`);
}

export async function getApostasPendentesAcumulador(): Promise<ApostaAcumulador[]> {
  const db = getServerClient();
  const { data, error } = await db
    .from("acumulador_apostas")
    .select("*")
    .eq("resultado", "pending")
    .order("criada_em", { ascending: false });
  if (error) throw new Error(`getApostasPendentesAcumulador: ${error.message}`);
  return data ?? [];
}

export async function getApostasDoCiclo(cicloId: string): Promise<ApostaAcumulador[]> {
  const db = getServerClient();
  const { data, error } = await db
    .from("acumulador_apostas")
    .select("*")
    .eq("ciclo_id", cicloId)
    .order("criada_em", { ascending: false });
  if (error) throw new Error(`getApostasDoCiclo: ${error.message}`);
  return data ?? [];
}

export async function removerApostaAcumulador(id: string): Promise<void> {
  const db = getServerClient();
  const { error } = await db
    .from("acumulador_apostas")
    .delete()
    .eq("id", id);
  if (error) throw new Error(`removerApostaAcumulador: ${error.message}`);
}

export async function getHistoricoCompleto(): Promise<any[]> {
  const db = getServerClient();
  
  // Fetch from both tables
  const [standard, accum] = await Promise.all([
    db.from("historico_apostas").select("*").neq("resultado", "pending"),
    db.from("acumulador_apostas").select("*").neq("resultado", "pending")
  ]);

  const combined = [
    ...(standard.data || []).map(a => ({ ...a, type: 'standard' })),
    ...(accum.data || []).map(a => ({ ...a, type: 'accumulator' }))
  ];

  // Sort by result date
  return combined.sort((a, b) => {
    const dA = new Date(a.data_resultado || a.criada_em || a.data_aposta).getTime();
    const dB = new Date(b.data_resultado || b.criada_em || b.data_aposta).getTime();
    return dA - dB;
  });
}


// ============================================================
// DAILY RESET (called by cron at midnight)
// ============================================================

export async function resetDailyCounters(): Promise<void> {
  const db = getServerClient();
  const { error } = await db.rpc("reset_daily_snapshot");
  if (error) throw new Error(`resetDailyCounters: ${error.message}`);
}

// ============================================================
// LIVE ODDS CACHE (Flashscore Deep Scraper)
// ============================================================

export async function saveLiveOdds(games: any[]): Promise<void> {
  const db = getServerClient();
  const { error } = await db
    .from("live_odds")
    .upsert({ id: 1, games_json: games, updated_at: new Date().toISOString() });
  if (error) throw new Error(`saveLiveOdds: ${error.message}`);
}

export async function getLiveOdds(): Promise<any[]> {
  const db = getServerClient();
  const { data, error } = await db
    .from("live_odds")
    .select("games_json")
    .eq("id", 1)
    .single();
  if (error && error.code !== "PGRST116") throw new Error(`getLiveOdds: ${error.message}`);
  return data?.games_json ?? [];
}
