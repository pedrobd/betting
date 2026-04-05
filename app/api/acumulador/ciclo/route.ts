// ============================================================
// GET /api/acumulador/ciclo
// Returns current active cycle state and history
// ============================================================

import { NextResponse } from "next/server";
import { AcumuladorEngine } from "@/lib/core/strategies";
import { getCiclosHistorico } from "@/lib/core/database";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const engine = new AcumuladorEngine();
    const [cicloState, historicoCiclos] = await Promise.all([
      engine.getCicloState(),
      getCiclosHistorico(10),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        ciclo_state: cicloState,
        historico_ciclos: historicoCiclos,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro interno";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
