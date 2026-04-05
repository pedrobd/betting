// ============================================================
// GET /api/bankroll
// Returns current bankroll state + stop-loss status
// ============================================================

import { NextResponse } from "next/server";
import { BankrollManager } from "@/lib/core/bankroll";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const manager = new BankrollManager();
    const state = await manager.load();
    const summary = await manager.summary();

    return NextResponse.json({
      success: true,
      data: {
        saldo: state.saldo,
        saldoInicioDia: state.saldoInicioDia,
        perdaDiaria: state.perdaDiaria,
        stopLossAtivo: state.stopLossAtivo,
        unidade: state.unidade,
        perdaPercentual: parseFloat(
          ((state.perdaDiaria / state.saldoInicioDia) * 100).toFixed(2)
        ),
        limiteStopLoss: parseFloat((state.saldoInicioDia * 0.05).toFixed(2)),
        summary,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro interno";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
