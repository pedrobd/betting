// ============================================================
// POST /api/acumulador/resolver
// Resolves a pending accumulator bet (win/loss)
// Body: { apostaId: string, resultado: "win" | "loss" }
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { AcumuladorEngine } from "@/lib/core/strategies";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { apostaId, resultado } = body as { apostaId: string; resultado: "win" | "loss" };

    if (!apostaId || !["win", "loss"].includes(resultado)) {
      return NextResponse.json(
        { success: false, error: "apostaId e resultado ('win'|'loss') são obrigatórios." },
        { status: 400 }
      );
    }

    const engine = new AcumuladorEngine();
    const cicloState = await engine.resolverAposta(apostaId, resultado);

    return NextResponse.json({
      success: true,
      data: cicloState,
      message:
        resultado === "win"
          ? cicloState.ciclo.status === "ativo"
            ? `✅ Vitória! Novo stake: €${cicloState.ciclo.stake_atual.toFixed(2)}`
            : `🏆 OBJETIVO ATINGIDO! Ciclo concluído. Novo ciclo iniciado a €5.`
          : `💥 Derrota. Ciclo reiniciado a €5.`,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro interno";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
