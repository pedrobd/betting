// ============================================================
// AcumuladorEngine - Goals Accumulator Strategy
// Markets: Over 0.5 / Over 1.5 / Over 2.5 / Under 5.5 / BTTS
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
import { getFixturesByDate, getH2H, getOddsForFixture } from "./api-football";
import type {
  GoalMarket,
  AcumuladorSelecao,
  AcumuladorAposta,
  CicloState,
  GoalsAnalysis,
  ApiFixture,
  CicloAcumulador,
  BetMarket,
  EVOpportunity,
} from "../types";

// ============================================================
// Constants
// ============================================================

const TOP_LEAGUES = new Set([
  94, 135, 39, 61, 78, 140, // Top Europe
  2, 3, 4, 5, 848, // Cups
  71, 72, 73, // Brazil A, B, Cup
  144, 141, 143, // Belgium, Slovenia, etc.
  88, 89, 90, // Netherlands
  128, 129, 130, // Argentina
  253, 262, 265, // USA, Mexico, Chile
  179, 180, 183, // Scotland
  301, 307, // Ukraine, Switzerland
  79, 80, // Germany 2, 3
  40, 41, 42, // England 2, 3, 4
  136, 137, // Italy 2, 3
  203, 204, // Turkey
  10, 11 // Portugal 2, etc.
]);
const STAKE_INICIO = 5.00;
const OBJETIVO = 1000.00;
const MIN_SELECOES = 5;
const MAX_SELECOES = 10;
const MIN_H2H_JOGOS = 4; // min H2H games to trust stats

// Ultra-strict thresholds for "Almost Certain" Accumulator
const THRESHOLDS_SAFETY = {
  over05: 0.94,
  over15: 0.85,
  overall_prob: 0.92,
  under55: 0.96,
  btts: 0.80,
};

// Thresholds for +EV Scanner
const THRESHOLDS_EV = {
  min_prob: 0.65,
  min_ev: 0.10, // 10% edge
};




// ============================================================
// H2H Analysis
// ============================================================

function analisarH2H(fixtures: ApiFixture[]): Omit<GoalsAnalysis, "fixture_id" | "jogo" | "mercado_recomendado" | "odd_estimada" | "confianca"> {
  const total = fixtures.length;
  if (total === 0) {
    return { taxa_over05: 0, taxa_over15: 0, taxa_over25: 0, taxa_under55: 0, taxa_btts: 0, media_golos: 0 };
  }

  let over05 = 0, over15 = 0, over25 = 0, under55 = 0, btts = 0, totalGolos = 0;

  for (const f of fixtures) {
    const home = f.goals.home ?? 0;
    const away = f.goals.away ?? 0;
    const golos = home + away;
    totalGolos += golos;
    if (golos >= 1) over05++;
    if (golos >= 2) over15++;
    if (golos >= 3) over25++;
    if (golos <= 5) under55++;
    if (home >= 1 && away >= 1) btts++;
  }

  return {
    taxa_over05: over05 / total,
    taxa_over15: over15 / total,
    taxa_over25: over25 / total,
    taxa_under55: under55 / total,
    taxa_btts: btts / total,
    media_golos: totalGolos / total,
  };
}

// Full multi-market analysis for EV Engine
function analisarH2HMulti(fixtures: ApiFixture[]): Record<string, number> {
  const total = fixtures.length;
  if (total === 0) return {};

  const stats = {
    winH: 0, draw: 0, winA: 0,
    dc1X: 0, dcX2: 0, dc12: 0,
    o05: 0, o15: 0, o25: 0,
    u25: 0, u35: 0, u45: 0, u55: 0,
    btts: 0
  };

  for (const f of fixtures) {
    const h = f.goals.home ?? 0;
    const a = f.goals.away ?? 0;
    const g = h + a;
    
    if (h > a) stats.winH++;
    else if (h === a) stats.draw++;
    else stats.winA++;

    if (h >= a) stats.dc1X++;
    if (h <= a) stats.dcX2++;
    if (h !== a) stats.dc12++;

    if (g >= 1) stats.o05++;
    if (g >= 2) stats.o15++;
    if (g >= 3) stats.o25++;
    if (g <= 2) stats.u25++;
    if (g <= 3) stats.u35++;
    if (g <= 4) stats.u45++;
    if (g <= 5) stats.u55++;
    if (h > 0 && a > 0) stats.btts++;
  }

  return {
    "1": stats.winH / total, "X": stats.draw / total, "2": stats.winA / total,
    "1X": stats.dc1X / total, "X2": stats.dcX2 / total, "12": stats.dc12 / total,
    "over_0.5": stats.o05 / total, "over_1.5": stats.o15 / total, "over_2.5": stats.o25 / total,
    "under_2.5": stats.u25 / total, "under_3.5": stats.u35 / total, "under_4.5": stats.u45 / total, "under_5.5": stats.u55 / total,
    "btts": stats.btts / total
  };
}

function selecionarMercado(analise: ReturnType<typeof analisarH2H>): { mercado: GoalMarket; confianca: number } | null {
  const { taxa_over05, taxa_over15, taxa_btts, taxa_over25, taxa_under55 } = analise;

  // Prioritize absolute safety overall
  if (taxa_under55 >= THRESHOLDS_SAFETY.under55) return { mercado: "under_5.5", confianca: taxa_under55 };
  if (taxa_over05 >= THRESHOLDS_SAFETY.over05) return { mercado: "over_0.5", confianca: taxa_over05 };
  if (taxa_over15 >= THRESHOLDS_SAFETY.over15) return { mercado: "over_1.5", confianca: taxa_over15 };
  if (taxa_btts >= THRESHOLDS_SAFETY.btts) return { mercado: "btts", confianca: taxa_btts };

  return null;
}


// ============================================================
// AcumuladorEngine
// ============================================================

export class AcumuladorEngine {

  // ──────────────────────────────────────────────────────────
  // Get or create active cycle state
  // ──────────────────────────────────────────────────────────

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

  // ──────────────────────────────────────────────────────────
  // Scan fixtures and build accumulator
  // ──────────────────────────────────────────────────────────

  async gerarAcumulador(): Promise<AcumuladorAposta> {
    const ciclo = await getCicloAtivo() ?? await criarCiclo(STAKE_INICIO);

    const today = new Date().toISOString().split("T")[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
    
    console.log(`[Acumulador] Procurando jogos para hoje (${today}) e amanhã (${tomorrow})...`);
    
    const fixturesToday = await getFixturesByDate(today);
    const fixturesTomorrow = await getFixturesByDate(tomorrow);
    const allFixtures = [...fixturesToday, ...fixturesTomorrow];

    const candidates: GoalsAnalysis[] = [];
    console.log(`[Acumulador] Total fixtures encontradas: ${allFixtures.length}`);

    const eligible = allFixtures.filter((f) => {
      const leagueId = (f as any).league?.id;
      const isTopLeague = leagueId ? TOP_LEAGUES.has(leagueId) : true;
      const notStarted = ["NS", "TBD"].includes(f.fixture.status.short);
      return isTopLeague && notStarted;
    });

    console.log(`[Acumulador] Fixtures elegíveis (Liga + NS): ${eligible.length}`);

    for (const fixture of eligible) {
      try {
        const h2h = await getH2H(fixture.teams.home.id, fixture.teams.away.id, 10);
        if (h2h.length < MIN_H2H_JOGOS) {
          // console.log(`[Acumulador] ${fixture.fixture.id} ignorado: H2H insuficiente (${h2h.length})`);
          continue;
        }

        const analise = analisarH2H(h2h);
        const mercadoResult = selecionarMercado(analise);
        if (!mercadoResult) continue;

        // Fetch real odds for the selected market
        const realOdds = await getOddsForFixture(fixture.fixture.id);
        const odd = realOdds[mercadoResult.mercado];

        if (!odd || odd < 1.01) continue;

        console.log(`[Acumulador] ✅ Jogo qualificado: ${fixture.teams.home.name} vs ${fixture.teams.away.name} | ${mercadoResult.mercado} @ ${odd}`);

        candidates.push({
          fixture_id: fixture.fixture.id,
          jogo: `${fixture.teams.home.name} vs ${fixture.teams.away.name}`,
          ...analise,
          mercado_recomendado: mercadoResult.mercado,
          odd_estimada: odd,
          confianca: mercadoResult.confianca,
        });

        if (candidates.length >= 20) break; // Limit deep analysis to first 20 candidates for performance
        await new Promise(resolve => setTimeout(resolve, 30));
      } catch (err) {
        continue;
      }
    }


    // Sort by confidence (highest first)
    candidates.sort((a, b) => b.confianca - a.confianca);

    // Pick optimal number of selections
    const selecoes = this.otimizarSelecoes(candidates, ciclo);

    if (selecoes.length < MIN_SELECOES) {
      throw new Error(`Apenas ${selecoes.length} jogos qualificados hoje (mínimo ${MIN_SELECOES}). Tenta mais tarde.`);
    }

    const odd_total = parseFloat(
      selecoes.reduce((acc, s) => acc * s.odd, 1).toFixed(4)
    );
    const retorno_potencial = parseFloat((ciclo.stake_atual * odd_total).toFixed(2));

    const apostaDB = await registarApostaAcumulador({
      ciclo_id: ciclo.id,
      stake: ciclo.stake_atual,
      odd_total,
      selecoes,
      metadata: { gerado_em: new Date().toISOString(), total_candidatos: candidates.length },
    });

    return {
      ciclo_id: ciclo.id,
      stake: ciclo.stake_atual,
      odd_total,
      selecoes,
      retorno_potencial,
      // Attach DB id for resolution
      ...{ id: apostaDB.id },
    } as AcumuladorAposta & { id: string };
  }

  // ──────────────────────────────────────────────────────────
  // Resolve accumulator result (WIN / LOSS)
  // ──────────────────────────────────────────────────────────

  async resolverAposta(
    apostaId: string,
    resultado: "win" | "loss"
  ): Promise<CicloState> {
    const ciclo = await getCicloAtivo();
    if (!ciclo) throw new Error("Sem ciclo ativo para resolver.");

    const historico = await getApostasDoCiclo(ciclo.id);
    const aposta = historico.find((a) => a.id === apostaId);
    if (!aposta) throw new Error(`Aposta ${apostaId} não encontrada no ciclo ativo.`);

    if (resultado === "win") {
      const retorno = parseFloat((aposta.stake * aposta.odd_total).toFixed(2));
      const lucro = parseFloat((retorno - aposta.stake).toFixed(2));

      await resolverApostaAcumulador(apostaId, "win", retorno, lucro);

      if (retorno >= OBJETIVO) {
        // Cycle complete! Close and create new one
        await fecharCiclo(ciclo.id, "concluido");
        await criarCiclo(STAKE_INICIO);
      } else {
        // Update cycle with new stake (compounded winnings)
        await atualizarStakeCiclo(ciclo.id, retorno, ciclo.total_apostas + 1);
      }
    } else {
      // LOSS — hard reset
      const lucro = -aposta.stake;
      await resolverApostaAcumulador(apostaId, "loss", 0, lucro);
      await fecharCiclo(ciclo.id, "perdido");
      await criarCiclo(STAKE_INICIO);
    }

    return this.getCicloState();
  }

  // ──────────────────────────────────────────────────────────
  // Optimize selection count (5-10 games)
  // Target: odd_total between 3x and 15x
  // ──────────────────────────────────────────────────────────

  private otimizarSelecoes(
    candidates: GoalsAnalysis[],
    ciclo: CicloAcumulador
  ): AcumuladorSelecao[] {
    const pool = candidates.slice(0, MAX_SELECOES);
    let selecoes: AcumuladorSelecao[] = [];

    for (let n = MIN_SELECOES; n <= Math.min(pool.length, MAX_SELECOES); n++) {
      const top = pool.slice(0, n);
      const oddTotal = top.reduce((acc, c) => acc * c.odd_estimada, 1);

      selecoes = top.map((c) => ({
        fixture_id: c.fixture_id,
        jogo: c.jogo,
        mercado: c.mercado_recomendado,
        odd: c.odd_estimada,
        probabilidade_estimada: c.confianca,
      }));

      // Stop adding games if odd total already exceeds what's needed to reach €1000
      const retornoPotencial = ciclo.stake_atual * oddTotal;
      if (retornoPotencial >= OBJETIVO || oddTotal >= 15) break;
    }

    return selecoes;
  }
}

// ============================================================
// EVEngine - Multi-Market EV Scanner
// ============================================================

export class EVEngine {
  async scanOpportunities(): Promise<EVOpportunity[]> {
    const today = new Date().toISOString().split("T")[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
    
    const fixturesArr = await Promise.all([
      getFixturesByDate(today),
      getFixturesByDate(tomorrow)
    ]);
    const allFixtures = fixturesArr.flat().filter(f => 
      TOP_LEAGUES.has((f as any).league?.id) && ["NS", "TBD"].includes(f.fixture.status.short)
    );

    const ops: EVOpportunity[] = [];

    for (const fixture of allFixtures.slice(0, 40)) { // Deep scan max 40 fixtures
      try {
        const h2h = await getH2H(fixture.teams.home.id, fixture.teams.away.id, 10);
        if (h2h.length < 5) continue;

        const probMap = analisarH2HMulti(h2h);
        const realOdds = await getOddsForFixture(fixture.fixture.id);

        for (const [market, prob] of Object.entries(probMap)) {
          const odd = realOdds[market];
          if (!odd) continue;

          const ev = (prob * odd) - 1;

          if (prob >= THRESHOLDS_EV.min_prob && ev >= THRESHOLDS_EV.min_ev) {
            ops.push({
              fixture_id: fixture.fixture.id,
              jogo: `${fixture.teams.home.name} vs ${fixture.teams.away.name}`,
              liga: (fixture as any).league?.name ?? "Liga",
              market: market as BetMarket,
              odd,
              probabilidade: prob,
              ev: parseFloat(ev.toFixed(4)),
              sugestao: ev > 0.2 ? "Forte Recomendação 🔥" : "Boa Oportunidade 💎"
            });
          }
        }
        await new Promise(r => setTimeout(r, 20));
      } catch { continue; }
    }

    return ops.sort((a, b) => b.ev - a.ev);
  }
}

