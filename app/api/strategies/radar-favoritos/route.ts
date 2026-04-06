import { NextResponse } from "next/server";
import { RadarFavoritosEngine } from "@/lib/core/strategies";
import { FlashscoreBot } from "@/lib/core/flashscore-bot";

export async function GET() {
  try {
    // ⚠️ Scraper decoupled to Github Actions. Vercel only reads from Supabase!
    // await FlashscoreBot.syncLiveGames();

    const engine = new RadarFavoritosEngine();
    const ops = await engine.scanFavorites();
    return NextResponse.json({ success: true, data: ops });
  } catch (error: any) {
    console.error("[Radar API] Error:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
