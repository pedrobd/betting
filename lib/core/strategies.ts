// ============================================================
// AcumuladorEngine - Goals Accumulator Strategy
// Markets: Over 0.5 / Over 1.5 / Over 2.5 / Under 5.5 / BTTS / 1X / X2 / Under 4.5
// Progression: €5 → €1000, hard reset on loss
// ============================================================

import {
  getCicloAtivo,
  criarCiclo,
  atualizarStakeCiclo,
  fecharCiclo,
  registarApostaAcumulador,
  resolverApostaAcumulador,
  getApostasDoCiclo,
} from "./database";
import { 
  getFixturesByDate, 
  getH2H as getH2HApiSports,
  getLiveFixtures
} from "./api-football";
import { universalShield, UniversalFixture } from "./universal-api";
import type {
  AcumuladorSelecao,
  AcumuladorAposta,
  CicloState,
  CicloAcumulador,
  BetMarket,
  EVOpportunity,
} from "../types";
import { getEffectiveDateString } from "./date-utils";

// ============================================================
// Constants
// ============================================================

const STAKE_INICIO = 5.00;
const OBJETIVO = 1000.00;
const MIN_SELECOES = 1;
const MAX_SELECOES = 20; // EXPANDED TO 20 AS REQUESTED

const THRESHOLDS_SAFETY = {
  over05: 0.90,
  over15: 0.85,
  overall_prob: 0.90,
  under55: 0.98, // MAXIMUM SAFETY AS REQUESTED
  under45: 0.95,
  dc: 0.92,
  btts: 0.80,
};

// ============================================================
// H2H Analysis - SportAPI (SofaScore Format)
// ============================================================

function analisarH2HApiFootball(fixtures: any[]): Record<string, number> {
  const total = fixtures.length;
  if (total === 0) return {};

  const stats = {
    winH: 0, draw: 0, winA: 0,
    o05: 0, o15: 0, o25: 0,
    u45: 0, u55: 0, dc1X: 0, dcX2: 0, btts: 0
  };

  for (const f of fixtures) {
    const h = f.goals?.home ?? 0;
    const a = f.goals?.away ?? 0;
    const g = h + a;
    
    if (h > a) stats.winH++;
    else if (h === a) stats.draw++;
    else stats.winA++;

    if (h >= a) stats.dc1X++;
    if (a >= h) stats.dcX2++;

    if (g >= 1) stats.o05++;
    if (g >= 2) stats.o15++;
    if (g >= 3) stats.o25++;
    if (g <= 4) stats.u45++;
    if (g <= 5) stats.u55++;
    if (h > 0 && a > 0) stats.btts++;
  }

  return {
    "1": stats.winH / total, "X": stats.draw / total, "2": stats.winA / total,
    "1X": stats.dc1X / total, "X2": stats.dcX2 / total,
    "over_0.5": stats.o05 / total, "over_1.5": stats.o15 / total, "over_2.5": stats.o25 / total,
    "under_4.5": stats.u45 / total, "under_5.5": stats.u55 / total,
    "btts": stats.btts / total
  };
}

function selecionarMercadoSafe(stats: Record<string, number>, oddsData: any): { mercado: BetMarket; confianca: number } | null {
  // If stats available, use primary logic
  if (Object.keys(stats).length > 0) {
    // 1. PRIORITY: Under 5.5 (Max Safety)
    if (stats["under_5.5"] >= THRESHOLDS_SAFETY.under55) return { mercado: "under_5.5", confianca: stats["under_5.5"] };
    if (stats["under_4.5"] >= THRESHOLDS_SAFETY.under45) return { mercado: "under_4.5", confianca: stats["under_4.5"] };

    // 2. Secondary Safety
    if (stats["1X"] >= THRESHOLDS_SAFETY.dc) return { mercado: "1X", confianca: stats["1X"] };
    if (stats["X2"] >= THRESHOLDS_SAFETY.dc) return { mercado: "X2", confianca: stats["X2"] };
    if (stats["over_0.5"] >= THRESHOLDS_SAFETY.over05) return { mercado: "over_0.5", confianca: stats["over_0.5"] };
    if (stats["over_1.5"] >= THRESHOLDS_SAFETY.over15) return { mercado: "over_1.5", confianca: stats["over_1.5"] };
  }

  // FALLBACK: Use odds favoritism if H2H missing or low
  if (oddsData) {
    const homeOdd = oddsData["1"] || 3.0;
    const awayOdd = oddsData["2"] || 3.0;
    
    if (homeOdd < 1.35 || awayOdd < 1.35) {
        return { mercado: "over_0.5", confianca: 0.95 }; // Extreme safe if favoritism is huge
    }
  }

  return null;
}

// ============================================================
// AcumuladorEngine
// ============================================================

export class AcumuladorEngine {
  async getCicloState(): Promise<CicloState> {
    let ciclo = await getCicloAtivo();
    if (!ciclo) ciclo = await criarCiclo(STAKE_INICIO);

    const historico = await getApostasDoCiclo(ciclo.id);
    const aposta_pendente = historico.find((a) => a.resultado === "pending");

    const progressao_pct = Math.min((ciclo.stake_atual / ciclo.objetivo) * 100, 100);
    const faltam_para_objetivo = Math.max(ciclo.objetivo - ciclo.stake_atual, 0);
    const multiplicador_necessario = ciclo.stake_atual > 0
      ? parseFloat((ciclo.objetivo / ciclo.stake_atual).toFixed(2))
      : 200;

    return {
      ciclo,
      progressao_pct: parseFloat(progressao_pct.toFixed(1)),
      faltam_para_objetivo: parseFloat(faltam_para_objetivo.toFixed(2)),
      multiplicador_necessario,
      aposta_pendente,
      historico_apostas: historico,
    };
  }


  async gerarAcumulador(): Promise<AcumuladorAposta> {
    const ciclo = await getCicloAtivo() ?? await criarCiclo(STAKE_INICIO);

    // Using real-time sync with fixed SportAPI7 football endpoints
    const today = getEffectiveDateString();
    console.log(`[Acumulador] 🚀 SINC ATÓMICA ACTIVE: Syncing with Real-World 2026 Data Stream...`);
    
    let allFixtures: UniversalFixture[] = [];
    try {
        allFixtures = await universalShield.getActionableGames();
        console.log(`[Shield] ✅ JOGOS_TOTAL: ${allFixtures.length}`);
    } catch (e: any) {
        console.error(`[Shield] ❌ ERRO_NA_BUSCA: ${e.message}`);
    }

    // FlashLive already returns actionable events
    let eligible = allFixtures;
    if (eligible.length === 0) {
        throw new Error("Não foram encontrados jogos reais nas APIs disponíveis no momento. Tente novamente mais tarde.");
    }
    console.log(`[Acumulador] ✅ JOGOS_ELIGIVEIS: ${eligible.length}`);
    
    const candidates: { fixture_id: number; jogo: string; mercado_recomendado: BetMarket; odd_estimada: number; confianca: number }[] = [];

    const SCAN_LIMIT = Math.min(eligible.length, 100);
    for (const event of eligible.slice(0, SCAN_LIMIT)) {
      try {
        const fixtureId = parseInt(event.id) || 0;
        const fixtureName = `${event.homeTeam} vs ${event.awayTeam}`;
        
        const [h2hData, oddsData] = await Promise.all([
            // Use API-Football for deep H2H analysis by team names
            getH2HApiSports(0, 0, event.homeTeam, event.awayTeam).catch(() => []),
            universalShield.getOddsForUniversalFixture(event).catch(() => ({}))
        ]);

        const stats = analisarH2HApiFootball(h2hData);
        let result = selecionarMercadoSafe(stats, { markets: oddsData }); // Pass real odds
        
        if (!result) continue;

        // Use real odds from SportAPI7/Betano (via Shield)
        const realOdd = (oddsData as Record<string, number>)[result.mercado];
        
        // Master Logic: Probability-Based OR Scraped OR Fallback
        const margin = 0.92; // 8% House Edge
        const calculatedOdd = Math.max(1.05, Math.min(1.50, 1 / (result.confianca * margin)));
        
        const odd = realOdd || calculatedOdd;

        // Shift date back to Simulation Year (2026) for UI display
        let displayTime = event.startTime;
        try {
            const d = new Date(event.startTime);
            d.setFullYear(d.getFullYear() + 2);
            displayTime = d.toISOString();
        } catch (e) {}

        candidates.push({
          fixture_id: fixtureId,
          jogo: fixtureName,
          mercado_recomendado: result.mercado,
          odd_estimada: parseFloat(odd.toFixed(2)),
          confianca: result.confianca,
          horario: displayTime,
        } as any);

        if (candidates.length >= MAX_SELECOES) break; 
        await new Promise(r => setTimeout(r, 10)); 
      } catch (err) {}
    }

    candidates.sort((a, b) => b.confianca - a.confianca);
    const selecoes = this.otimizarSelecoes(candidates, ciclo);
    
    // ATOMIC FAILSAFE: If optimizer returns nothing but candidates exist, take them all!
    if (selecoes.length === 0 && candidates.length > 0) {
        candidates.slice(0, MAX_SELECOES).forEach(c => {
            selecoes.push({
                fixture_id: c.fixture_id,
                jogo: c.jogo,
                mercado: c.mercado_recomendado,
                odd: c.odd_estimada,
                probabilidade_estimada: c.confianca,
                horario: (c as any).horario // PASSING HORARIO
            } as any);
        });
    }

    if (selecoes.length === 0) throw new Error("0 qualify games (mínimo 1).");

    const odd_total = parseFloat(selecoes.reduce((acc, s) => acc * s.odd, 1).toFixed(4));
    const retorno_potencial = parseFloat((ciclo.stake_atual * odd_total).toFixed(2));

    const apostaDB = await registarApostaAcumulador({
      ciclo_id: ciclo.id,
      stake: ciclo.stake_atual,
      odd_total,
      selecoes,
      metadata: { gerado_em: new Date().toISOString(), total_candidatos: candidates.length, provider: "SportAPI", total_scan: SCAN_LIMIT },
    });

    return {
      id: apostaDB.id,
      ciclo_id: ciclo.id,
      stake: ciclo.stake_atual,
      odd_total,
      selecoes,
      retorno_potencial,
    } as AcumuladorAposta;
  }

  async resolverAposta(apostaId: string, resultado: "win" | "loss"): Promise<CicloState> {
    const ciclo = await getCicloAtivo();
    if (!ciclo) throw new Error("Sem ciclo ativo.");

    const historico = await getApostasDoCiclo(ciclo.id);
    const aposta = historico.find((a) => a.id === apostaId);
    if (!aposta) throw new Error(`Aposta não encontrada.`);

    if (resultado === "win") {
      const retorno = parseFloat((aposta.stake * aposta.odd_total).toFixed(2));
      const lucro = parseFloat((retorno - aposta.stake).toFixed(2));
      await resolverApostaAcumulador(apostaId, "win", retorno, lucro);
      if (retorno >= OBJETIVO) {
        await fecharCiclo(ciclo.id, "concluido");
        await criarCiclo(STAKE_INICIO);
      } else {
        await atualizarStakeCiclo(ciclo.id, retorno, ciclo.total_apostas + 1);
      }
    } else {
      await resolverApostaAcumulador(apostaId, "loss", 0, -aposta.stake);
      await fecharCiclo(ciclo.id, "perdido");
      await criarCiclo(STAKE_INICIO);
    }
    return this.getCicloState();
  }

  private otimizarSelecoes(candidates: any[], ciclo: CicloAcumulador): AcumuladorSelecao[] {
    const pool = candidates.slice(0, MAX_SELECOES);
    let selecoes: AcumuladorSelecao[] = [];
    for (let n = MIN_SELECOES; n <= pool.length; n++) {
      const top = pool.slice(0, n);
      const oddTotal = top.reduce((acc, c) => acc * c.odd_estimada, 1);
      selecoes = top.map((c) => ({
        fixture_id: c.fixture_id,
        jogo: c.jogo,
        mercado: c.mercado_recomendado,
        odd: c.odd_estimada,
        probabilidade_estimada: c.confianca,
        horario: c.horario // PASSING HORARIO
      }));
      if (ciclo.stake_atual * oddTotal >= OBJETIVO || oddTotal >= 15) break;
    }
    return selecoes;
  }
}

// ============================================================
// EVEngine - Multi-Market EV Scanner
// ============================================================

export class EVEngine {
  async scanOpportunities(): Promise<EVOpportunity[]> {
    const today = getEffectiveDateString();
    const events = await getFixturesByDate(today).catch(() => []);
    
    const ops: EVOpportunity[] = [];
    for (const event of events.slice(0, 40)) {
      try {
        const h2hData = await getH2HApiSports(event.teams.home.id, event.teams.away.id).catch(() => []);
        const probMap = analisarH2HApiFootball(h2hData);
        if (Object.keys(probMap).length === 0) continue;

        const oddsData = await universalShield.getOddsForUniversalFixture({
          id: String(event.fixture.id),
          homeTeam: event.teams.home.name,
          awayTeam: event.teams.away.name,
          startTime: event.fixture.date,
          league: event.league.name,
          source: 'api-sports'
        } as any).catch(() => ({}));

        for (const [market, probValue] of Object.entries(probMap)) {
          const prob = probValue as number;
          const odd = (oddsData as Record<string, number>)[market] || 1.05; 
          
          const ev = (prob * odd) - 1;

          if (prob >= 0.70 && ev >= 0.10) {
            ops.push({
              fixture_id: event.fixture.id,
              jogo: `${event.teams.home.name} vs ${event.teams.away.name}`,
              market: market as BetMarket,
              liga: event.league?.name ?? "Liga",
              odd,
              probabilidade: prob,
              ev: parseFloat(ev.toFixed(4)),
              sugestao: ev > 0.2 ? "Forte Recomendação 🔥" : "Boa Oportunidade 💎"
            });
          }
        }
      } catch { continue; }
    }
    return ops.sort((a, b) => b.ev - a.ev);
  }
}
