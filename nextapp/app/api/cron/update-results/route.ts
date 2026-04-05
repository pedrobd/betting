// ============================================================
// GET /api/cron/update-results
// Vercel Cron Job - Runs every 5 minutes during match hours
// Updates pending bets with final results from API-Football
// Schedule: vercel.json → { "crons": [{ "path": "/api/cron/update-results", "schedule": "*/5 15-23 * * *" }] }
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import {
  getApostasPendentes,
  resolverAposta,
  resetDailyCounters,
} from "@/lib/core/database";
import { getFixtureResult } from "@/lib/core/api-football";
import { BankrollManager } from "@/lib/core/bankroll";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min timeout (Vercel Pro)

function isAuthorized(req: NextRequest): boolean {
  // Vercel Cron sends Authorization header automatically
  const authHeader = req.headers.get("authorization");
  return authHeader === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const log: string[] = [];
  let updated = 0;
  let errors = 0;

  try {
    // ── Check if midnight reset is needed ─────────────────
    const hora = new Date().getUTCHours();
    if (hora === 0) {
      await resetDailyCounters();
      log.push("✅ Reset diário executado (banca início do dia atualizada)");
    }

    // ── Fetch all pending bets with fixture IDs ───────────
    const pendentes = await getApostasPendentes();
    log.push(`📋 ${pendentes.length} apostas pendentes encontradas`);

    const manager = new BankrollManager();

    for (const aposta of pendentes) {
      if (!aposta.api_fixture_id) continue;

      try {
        const result = await getFixtureResult(aposta.api_fixture_id);

        // Skip if match is still in progress
        if (!result || !["FT", "AET", "PEN"].includes(result.status)) {
          log.push(`⏳ Fixture #${aposta.api_fixture_id} ainda em curso (${result?.status})`);
          continue;
        }

        // Determine outcome based on correct score bet
        const metaData = aposta.metadata as {
          placar_alvo?: string;
          distribuicao?: Array<{ placar: string; stake: number; odd: number }>;
        };

        let resultado: "win" | "loss" = "loss";
        let lucro_prejuizo = -aposta.stake;

        const placarReal = `${result.homeGoals}-${result.awayGoals}`;

        if (aposta.estrategia === "dutching") {
          // Check if any distributed bet won
          const ganhou = metaData.distribuicao?.find((d) => d.placar === placarReal);
          if (ganhou) {
            resultado = "win";
            lucro_prejuizo = parseFloat((ganhou.stake * ganhou.odd - aposta.stake).toFixed(2));
          }
        } else if (aposta.estrategia === "funil_cantos") {
          // For corners: simplified win/loss (expand with actual corner count in production)
          resultado = "loss";
          lucro_prejuizo = -aposta.stake;
        }

        await resolverAposta(aposta.id, resultado, lucro_prejuizo);
        await manager.aplicarResultado(lucro_prejuizo);

        log.push(
          `${resultado === "win" ? "✅" : "❌"} Aposta #${aposta.id.slice(0, 8)} — ${placarReal} → ${resultado} (${lucro_prejuizo >= 0 ? "+" : ""}${lucro_prejuizo}€)`
        );
        updated++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erro desconhecido";
        log.push(`⚠️ Erro ao resolver aposta #${aposta.id.slice(0, 8)}: ${msg}`);
        errors++;
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      updated,
      errors,
      log,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro crítico";
    return NextResponse.json({ success: false, error: msg, log }, { status: 500 });
  }
}
