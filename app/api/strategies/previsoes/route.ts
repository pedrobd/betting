import { NextRequest, NextResponse } from "next/server";
import { PrevisaoEngine } from "@/lib/core/strategies";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const engine = new PrevisaoEngine();
    const results = await engine.getHighConfidenceResults();

    return NextResponse.json({
      success: true,
      data: results
    });
  } catch (error) {
    console.error("[API Previsões] Error:", error);
    return NextResponse.json(
      { success: false, error: "Erro ao carregar previsões." },
      { status: 500 }
    );
  }
}
