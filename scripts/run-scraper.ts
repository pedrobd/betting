import { FlashscoreBot } from "../lib/core/flashscore-bot";

async function run() {
  console.log("🚀 Iniciando Bot na Github Cloud...");
  try {
    await FlashscoreBot.syncLiveGames();
    console.log("✅ Extração completa e dados enviados para Supabase!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Falha crítica no scraper:", error);
    process.exit(1);
  }
}

run();
