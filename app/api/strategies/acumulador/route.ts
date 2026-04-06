// ============================================================
// POST /api/strategies/acumulador
// Generates a new accumulator bet for the active cycle
// ============================================================

import { NextResponse } from "next/server";
import { AcumuladorEngine } from "@/lib/core/strategies";

export const dynamic = "force-dynamic";

export async function POST() {
  console.log("DEBUG: POST /api/strategies/acumulador hit at " + new Date().toISOString());
  try {
    const engine = new AcumuladorEngine();
    const aposta = await engine.gerarAcumulador();

    return NextResponse.json({
      success: true,
      data: aposta,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro interno";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
