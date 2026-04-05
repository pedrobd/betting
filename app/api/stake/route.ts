// ============================================================
// POST /api/stake
// Calculates suggested stake for a given bet
// Body: { method: "units" | "kelly", probability?: number, odds?: number }
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { BankrollManager } from "@/lib/core/bankroll";
import type { StakeMethod } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { method, probability, odds, jogo } = body as {
      method: StakeMethod;
      probability?: number;
      odds?: number;
      jogo?: string;
    };

    if (!method || !["units", "kelly"].includes(method)) {
      return NextResponse.json(
        { success: false, error: 'method deve ser "units" ou "kelly"' },
        { status: 400 }
      );
    }

    const manager = new BankrollManager();
    const result = await manager.sugerirStake(
      method,
      method === "kelly" && probability && odds
        ? { probability, odds }
        : undefined
    );

    const state = manager.getState();

    return NextResponse.json({
      success: true,
      data: {
        ...result,
        contexto: jogo
          ? `Para a banca de ${state.saldo.toFixed(2)}€, aposta ${result.valor.toFixed(2)}€ no jogo "${jogo}"`
          : `Para a banca de ${state.saldo.toFixed(2)}€, aposta sugerida: ${result.valor.toFixed(2)}€`,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro interno";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
