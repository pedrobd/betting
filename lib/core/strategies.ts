// ============================================================
// AcumuladorEngine - Goals Accumulator Strategy (FLASHSCORE ONLY)
// Markets: Under 5.5 / Under 4.5 / Over 0.5 (Safety Priority)
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
const MAX_SELECOES = 20;

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

    console.log(`[Acumulador] 🚀 NATIVE 2026 FLASHSCORE MODE: Analyzing Real-World Data...`);
    
    let eligible: UniversalFixture[] = [];
    try {
        eligible = await universalShield.getActionableGames();
        console.log(`[Shield] ✅ JOGOS_FLASHSCORE: ${eligible.length}`);
    } catch (e: any) {
        console.error(`[Shield] ❌ ERRO_FLASHSCORE: ${e.message}`);
    }

    if (eligible.length === 0) {
        throw new Error("Não foram encontrados jogos no Flashscore. Tente novamente mais tarde.");
    }
    
    const candidates: { fixture_id: number; jogo: string; mercado_recomendado: BetMarket; odd_estimada: number; confianca: number; [key: string]: any }[] = [];

    for (const event of eligible) {
      try {
        const fixtureName = `${event.homeTeam} vs ${event.awayTeam}`;
        const oddsData = await universalShield.getOddsForUniversalFixture(event);
        
        // Priority Market: Under 5.5 (Max Safety Strategy)
        const market: BetMarket = "under_5.5";
        const realOdd = oddsData[market];
        
        if (!realOdd) continue;

        // --- ADVANCED 2026 METRICS FILTER ---
        let confianca = 0.98; // Baseline for Under 5.5

        // 1. Avg Goals Filter
        if (event.avg_goals && event.avg_goals > 4.5) {
            console.log(`[Strategy] 🚫 SKIP: Extreme Avg Goals (${event.avg_goals}) for ${fixtureName}`);
            continue; 
        }
        if (event.avg_goals && event.avg_goals > 3.8) {
            confianca *= 0.85; 
        }

        // 2. H2H Consistency Filter
        if (event.h2h_un55_pct !== undefined && event.h2h_un55_pct < 0.90) {
             confianca *= 0.90;
        }

        // 3. Offensive Form Penalty
        if (event.form && event.form.includes("WWWW")) {
             confianca *= 0.95;
        }

        if (confianca < 0.85) {
            console.log(`[Strategy] 🛡️ REJECTED (Unsafe): ${fixtureName} (Confidence: ${confianca.toFixed(2)})`);
            continue;
        }

        // Project time to 2026 if needed (Universal Shield already does most of this)
        let displayTime = event.startTime;
        try {
            const d = new Date(event.startTime);
            if (!isNaN(d.getTime()) && d.getFullYear() < 2026) {
                d.setFullYear(d.getFullYear() + 2);
                displayTime = d.toISOString();
            }
        } catch (e) {}

        candidates.push({
          fixture_id: parseInt(event.id.replace('scraped-', '')) || 0,
          jogo: fixtureName,
          mercado_recomendado: market,
          odd_estimada: realOdd,
          confianca: confianca,
          horario: displayTime,
          avg_goals: event.avg_goals,
          form: event.form,
          h2h_un55_pct: event.h2h_un55_pct
        });

        if (candidates.length >= MAX_SELECOES) break; 
      } catch (err) {}
    }

    candidates.sort((a, b) => b.confianca - a.confianca);
    const selecoes = this.otimizarSelecoes(candidates, ciclo);
    
    if (selecoes.length === 0) throw new Error("0 jogos qualificados para a estratégia hoje.");

    const odd_total = parseFloat(selecoes.reduce((acc, s) => acc * s.odd, 1).toFixed(4));
    const retorno_potencial = parseFloat((ciclo.stake_atual * odd_total).toFixed(2));

    const apostaDB = await registarApostaAcumulador({
      ciclo_id: ciclo.id,
      stake: ciclo.stake_atual,
      odd_total,
      selecoes,
      metadata: { provider: "Flashscore", strategy: "Under 5.5 Native" },
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
        horario: c.horario,
        avg_goals: c.avg_goals,
        form: c.form,
        h2h_un55_pct: c.h2h_un55_pct
      }));
      if (ciclo.stake_atual * oddTotal >= OBJETIVO || oddTotal >= 15) break;
    }
    return selecoes;
  }
}

// ============================================================
// EVEngine - Flashscore Scanner
// ============================================================

// ============================================================
// EVEngine - Flashscore Multi-Market Scanner
// ============================================================

export class EVEngine {
  async scanOpportunities(): Promise<EVOpportunity[]> {
    const events = await universalShield.getActionableGames();
    const ops: EVOpportunity[] = [];

    for (const event of events) {
      try {
        const oddsData = await universalShield.getOddsForUniversalFixture(event);
        const probs = this.estimarProbabilidadesNativas(event);
        const markets: BetMarket[] = ["1", "2", "1X", "X2", "under_5.5", "over_1.5"];

        for (const m of markets) {
          const odd = oddsData[m];
          if (!odd || odd <= 1.0) continue;

          const prob = probs[m] || 0;
          if (prob <= 0) continue;

          const ev = (prob * odd) - 1;

          // Only show positive EV opportunities with a minimum threshold
          if (ev > 0.05) { 
            ops.push({
              fixture_id: parseInt(event.id.replace('scraped-', '')) || 0,
              jogo: `${event.homeTeam} vs ${event.awayTeam}`,
              market: m,
              liga: event.league ?? "Liga",
              odd,
              probabilidade: prob,
              ev: parseFloat(ev.toFixed(4)),
              sugestao: this.getSugestaoParaMercado(m, prob)
            });
          }
        }
      } catch { continue; }
    }
    return ops.sort((a, b) => b.ev - a.ev);
  }

  private estimarProbabilidadesNativas(event: UniversalFixture): Record<string, number> {
    const probs: Record<string, number> = {};
    const homeFormVal = this.getFormValue(event.form_home || event.form || "");
    const awayFormVal = this.getFormValue(event.form_away || "");
    const avgGoals = event.avg_goals || 2.5;

    // 1. Under 5.5 (Conservative Baseline)
    probs["under_5.5"] = avgGoals < 3.5 ? 0.98 : avgGoals < 4.5 ? 0.94 : 0.88;

    // 2. Over 1.5 (Proportional to Avg Goals)
    probs["over_1.5"] = avgGoals > 3.0 ? 0.88 : avgGoals > 2.2 ? 0.82 : 0.70;

    // 3. Match Outcomes (Based on Form Delta)
    const delta = homeFormVal - awayFormVal;
    
    // Prob 1 (Home Win)
    probs["1"] = 0.35 + (delta * 0.05);
    // Prob 2 (Away Win)
    probs["2"] = 0.30 - (delta * 0.05);

    // 4. Double Chance (1X / X2)
    probs["1X"] = Math.min(probs["1"] + 0.30, 0.92);
    probs["X2"] = Math.min(probs["2"] + 0.30, 0.90);

    return probs;
  }

  private getFormValue(form: string): number {
    if (!form) return 0;
    let val = 0;
    for (const char of form) {
      if (char === "W") val += 2;
      if (char === "D") val += 1;
      if (char === "L") val -= 1;
    }
    return val;
  }

  private getSugestaoParaMercado(m: string, prob: number): string {
    if (m === "under_5.5") return "Segurança Máxima 🛡️";
    if (m === "over_1.5") return "Tendência de Golos ⚽";
    if (m.includes("X")) return "Cobertura de Risco 🛡️";
    if (prob > 0.6) return "Forte Favoritismo ⭐";
    return "Oportunidade de Valor 💎";
  }
}

// ============================================================
// RadarFavoritosEngine - Home Advantage & Standings Strategy
// ============================================================

export class RadarFavoritosEngine {
  async scanFavorites(): Promise<EVOpportunity[]> {
    const events = await universalShield.getActionableGames();
    const ops: EVOpportunity[] = [];

    for (const event of events) {
      try {
        const hPos = event.home_pos || 0;
        const aPos = event.away_pos || 0;

        // Skip se não temos dados de liga
        if (!hPos || !aPos) continue;

        const oddsData = await universalShield.getOddsForUniversalFixture(event);
        const winOdd = oddsData["1"] || 0;
        
        // Regra de Ouro "Radar Favoritos": 
        // A odd do mercado (Casas de Apostas) tem de concordar que a Equipa da Casa é Favorita.
        // Se a odd de vitória for maior que 2.50, significa probabilidade inferior a 40%, logo NÃO é favorita absoluta.
        if (!winOdd || winOdd <= 1.0 || winOdd > 2.50) {
            console.log(`[Radar Favoritos] 🚫 Rejeitado: ${event.homeTeam} tem Odd de Casa demasiado alta (${winOdd}) para ser Favorito.`);
            continue;
        }

        // Lógica de Tabela: A equipa da casa tem de estar significativamente à frente
        const posDiff = aPos - hPos; 
        
        if (posDiff > 3) {
          const { prob1, prob1X } = this.calcularProbabilidades(event, posDiff);
          
          const odd1 = oddsData["1"] || 0;
          const odd1X = oddsData["1X"] || 0;

          const ev1 = odd1 ? (prob1 * odd1) - 1 : -1;
          const ev1X = odd1X ? (prob1X * odd1X) - 1 : -1;

          const bestMarket = ev1X > ev1 && ev1X > 0.05 ? "1X" : "1";
          const finalProb = bestMarket === "1X" ? prob1X : prob1;
          const finalOdd = bestMarket === "1X" ? odd1X : odd1;
          const finalEV = bestMarket === "1X" ? ev1X : ev1;

          if (finalEV > 0.02) { 
            ops.push({
              fixture_id: parseInt(event.id.replace('scraped-', '')) || 0,
              jogo: `${event.homeTeam} vs ${event.awayTeam}`,
              market: bestMarket,
              liga: event.league ?? "Liga",
              odd: finalOdd,
              probabilidade: finalProb,
              ev: parseFloat(finalEV.toFixed(4)),
              sugestao: `Favorito em Casa (${hPos}º vs ${aPos}º) | Sugestão: ${bestMarket} 🏠⭐`
            });
          }
        }
      } catch { continue; }
    }
    return ops.sort((a, b) => b.probabilidade - a.probabilidade);
  }

  private calcularProbabilidades(event: UniversalFixture, posDiff: number): { prob1: number; prob1X: number } {
    let prob1 = 0.45; // Baseline for any home team

    // Add for position gap
    prob1 += Math.min(posDiff * 0.03, 0.35);

    // Add for Home Form
    const hForm = event.form_home || event.form || "";
    if (hForm.includes("WWW")) prob1 += 0.10;
    else if (hForm.includes("WW")) prob1 += 0.05;

    // Penalty for Away Form if they are strong
    const aForm = event.form_away || "";
    if (aForm.includes("WWW")) prob1 -= 0.10;

    prob1 = Math.min(prob1, 0.95); // Cap win at 95%
    
    // Draw probability (heuristic: 25%) - simplified for now
    const probX = 0.25; 
    const prob1X = Math.min(prob1 + probX, 0.98); // Cap double chance at 98%

    return { prob1, prob1X };
  }
}
