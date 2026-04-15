import { getDailyMatches } from '../lib/flashscore.js';

async function test() {
    console.log("🚀 Iniciando Debug do Scraper...");
    try {
        const matches = await getDailyMatches();
        console.log("✅ Jogos finais extraídos:", matches.length);
        if (matches.length > 0) {
            console.log("Primeiro jogo:", matches[0]);
        }
    } catch (e) {
        console.error("❌ Erro:", e.message);
    }
}

test();
