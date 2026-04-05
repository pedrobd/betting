// ============================================================
// GET /api/strategies/ev-scanner
// Scans for positive EV opportunities across all markets
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { EVEngine } from "@/lib/core/strategies";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const engine = new EVEngine();
    const opportunities = await engine.scanOpportunities();

    return NextResponse.json({
      success: true,
      data: opportunities,
      metadata: {
        timestamp: new Date().toISOString(),
        total_found: opportunities.length
      }
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro interno ao scanear EV";
    console.error("[EV API Error]", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
