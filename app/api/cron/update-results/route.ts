// ============================================================
// GET /api/cron/update-results
// Vercel Cron Job - Runs every 5 minutes during match hours
// Updates pending accumulator bets with final results from API-Football
// Schedule: vercel.json → { "crons": [{ "path": "/api/cron/update-results", "schedule": "*/5 14-23 * * *" }] }
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import {
  getApostasPendentesAcumulador,
  resetDailyCounters,
} from "@/lib/core/database";
import { AcumuladorEngine } from "@/lib/core/strategies";
import { universalShield } from "@/lib/core/universal-api";
import { telegramService } from "@/lib/core/telegram";

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

    // ── Fetch all pending accumulator bets ────────────────
    const pendentes = await getApostasPendentesAcumulador();
    log.push(`📋 ${pendentes.length} acumuladores pendentes encontrados`);

    const engine = new AcumuladorEngine();

    for (const aposta of pendentes) {
      try {
        let allFinished = true;
        let anyLoss = false;
        const details: string[] = [];

        for (const sel of aposta.selecoes) {
          const names = sel.jogo.split(" vs ");
          const home = names[0];
          const away = names[1];

          // Use the Universal Shield to find the result across ALL APIs
          const result = await universalShield.getUniversalResult(home, away, (sel as any).fixture_mid);

          // Handle VOID (Postponed/Cancelled)
          if (result && result.status === "VOID") {
            log.push(`⚠️ ${sel.jogo}: Adiado/Cancelado. Aposta anulada (VOID).`);
            // Custom logic for VOID can be added here (e.g., skip this selection)
            // For now, let's treat it as a special case that doesn't cause a loss.
            continue; 
          }

          // Skip if match is still in progress
          if (!result || !result.finished) {
            allFinished = false;
            details.push(`⏳ ${sel.jogo}: em curso ou aguardando (${result?.status ?? "NS"})`);
            continue;
          }

          const gH = result.homeGoals;
          const gA = result.awayGoals;
          const total = gH + gA;
          let won = false;

          switch (sel.mercado) {
            case "over_0.5": won = total > 0; break;
            case "over_1.5": won = total > 1; break;
            case "over_2.5": won = total > 2; break;
            case "under_2.5": won = total < 3; break;
            case "under_3.5": won = total < 4; break;
            case "under_4.5": won = total < 5; break;
            case "under_5.5": won = total < 6; break;
            case "btts": won = gH > 0 && gA > 0; break;
          }

          if (!won) {
            anyLoss = true;
            details.push(`❌ ${sel.jogo}: falhou (${gH}-${gA} em ${sel.mercado})`);
            break; // Stop at first loss
          } else {
            details.push(`✅ ${sel.jogo}: passou (${gH}-${gA} em ${sel.mercado})`);
          }
        }

        // ── Resolve Bet Logic ───────────────────────────

        if (anyLoss) {
          // At least one selection failed -> LOSS
          await engine.resolverAposta(aposta.id, "loss");
          log.push(`💥 Acumulador #${aposta.id.slice(0, 8)} resolvido como LOSS. Motivo: ${details.join(", ")}`);
          
          // Notificar Telegram
          await telegramService.sendMessage(`❌ *ACUMULADOR PERDIDO*\n\nMotivo: ${details.join("\n")}\n\n_Banca e ciclo atualizados._`);
          
          updated++;
        }
        else if (allFinished) {
          // All selections finished and all won -> WIN
          await engine.resolverAposta(aposta.id, "win");
          log.push(`💰 Acumulador #${aposta.id.slice(0, 8)} resolvido como WIN! Motivo: ${details.join(", ")}`);
          
          // Notificar Telegram
          await telegramService.sendMessage(`💰 *ACUMULADOR GANHO!* 💰\n\n${details.join("\n")}\n\n_Banca e ciclo atualizados com lucro._`);
          
          updated++;
        }
        else {
          // Still matches in progress
          log.push(`⏳ Acumulador #${aposta.id.slice(0, 8)} ainda aguarda outros jogos. Estado: ${details.join(", ")}`);
        }

      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erro desconhecido";
        log.push(`⚠️ Erro ao processar acumulador #${aposta.id.slice(0, 8)}: ${msg}`);
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
