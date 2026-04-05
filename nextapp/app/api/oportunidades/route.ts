// ============================================================
// GET /api/oportunidades
// Returns active opportunities from DB
// ============================================================

import { NextResponse } from "next/server";
import { getOportunidadesAtivas } from "@/lib/core/database";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const oportunidades = await getOportunidadesAtivas();
    return NextResponse.json({ success: true, data: oportunidades });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro interno";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
