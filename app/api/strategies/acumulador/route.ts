// ============================================================
// POST /api/strategies/acumulador
// Generates a new accumulator bet for the active cycle
// ============================================================

import { NextResponse, NextRequest } from "next/server";
import { AcumuladorEngine } from "@/lib/core/strategies";
import { FlashscoreBot } from "@/lib/core/flashscore-bot";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  console.log("DEBUG: POST /api/strategies/acumulador hit at " + new Date().toISOString());
  try {
    const body = await req.json().catch(() => ({}));
    const excludedIds = body.excludedIds || [];

    const engine = new AcumuladorEngine();
    const aposta = await engine.gerarAcumulador(excludedIds);

    return NextResponse.json({
      success: true,
      data: aposta,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro interno";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
