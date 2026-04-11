import { getLiveOdds } from "../lib/core/database";
import { AcumuladorEngine } from "../lib/core/strategies";

async function diagnose() {
    console.log("🔍 [DIAGNOSTIC] Checking Supabase live_odds cache...");
    const games = await getLiveOdds();
    console.log(`📊 Games in cache: ${games.length}`);

    if (games.length === 0) {
        console.warn("❌ CACHE IS EMPTY! Run the scraper.");
        return;
    }

    const engine = new AcumuladorEngine();
    console.log("⚙️ Running strategy engine...");
    
    // We try to generate an accumulator
    try {
        const result = await engine.gerarAcumulador();
        if (!result || !result.selecoes || result.selecoes.length === 0) {
            console.warn("🚫 Strategy returned 0 games.");
        } else {
            console.log(`✅ Strategy found ${result.selecoes.length} games.`);
        }
    } catch (e) {
        console.error("❌ Error in engine:", e);
    }
}

diagnose();
