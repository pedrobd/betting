// ============================================================
// GET /api/analytics/performance
// Calculates bankroll evolution over time for Recharts
// ============================================================

import { NextResponse } from "next/server";
import { getHistoricoCompleto, getBanca } from "@/lib/core/database";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const historicalBets = await getHistoricoCompleto();
    const banca = await getBanca();
    
    // Starting balance (work backwards or define a start)
    // For simplicity, we'll start with the initial balance established in 001 migration: 1000.
    let currentBalance = 1000;
    const historyData = [{
      timestamp: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString(), // 30 days ago
      balance: 1000,
      label: "Início"
    }];

    // Group by day or show each trade
    let runningTotal = currentBalance;
    
    const performance = historicalBets.map(bet => {
      runningTotal += (bet.lucro_prejuizo || 0);
      return {
        timestamp: bet.data_resultado || bet.criada_em || bet.data_aposta,
        balance: parseFloat(runningTotal.toFixed(2)),
        label: bet.type === 'accumulator' ? 'Acumulado' : 'Individual',
        profit: bet.lucro_prejuizo
      };
    });

    // Add current point
    const finalData = [
       ...historyData,
       ...performance,
       {
           timestamp: new Date().toISOString(),
           balance: banca.saldo_atual,
           label: "Atual"
       }
    ];

    // Win rate calculation
    const wins = historicalBets.filter(b => b.resultado === 'win').length;
    const total = historicalBets.length;
    const winRate = total > 0 ? (wins / total) * 100 : 0;
    const totalProfit = historicalBets.reduce((acc, b) => acc + (b.lucro_prejuizo || 0), 0);

    return NextResponse.json({
      success: true,
      data: finalData,
      stats: {
        winRate: winRate.toFixed(1),
        totalProfit: totalProfit.toFixed(2),
        totalBets: total
      }
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro interno";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
