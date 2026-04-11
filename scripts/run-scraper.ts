import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { FlashscoreBot } from "../lib/core/flashscore-bot";
import { PrevisaoEngine } from "../lib/core/strategies";
import { telegramService } from "../lib/core/telegram";

async function run() {
  console.log("🚀 Iniciando Bot na Github Cloud...");
  try {
    await FlashscoreBot.syncLiveGames();
    console.log("✅ Extração completa e dados enviados para Supabase!");

    // FAZE 2: Alertas de Previsões de Alta Confiança (>= 85%)
    console.log("🔍 Verificando previsões de elite para alertas Telegram...");
    const engine = new PrevisaoEngine();
    const results = await engine.getHighConfidenceResults();
    
    // Filtrar apenas o topo (85%+)
    const elite = results.filter(r => r.probabilidade >= 0.85);

    if (elite.length > 0) {
      console.log(`📢 Enviando ${elite.length} alertas de elite para Telegram...`);
      for (const forecast of elite) {
        await telegramService.notifyForecast(forecast);
      }
    }

    process.exit(0);
  } catch (error) {
    console.error("❌ Falha crítica no scraper:", error);
    process.exit(1);
  }
}

run();
