import { getDailyMatches } from '../lib/flashscore.js';

async function test() {
    console.log("🚀 Iniciando teste do Scraper...");
    try {
        const matches = await getDailyMatches();
        console.log("✅ Sucesso! Jogos totais extraídos:", matches.length);
        if (matches.length === 0) {
            console.log("⚠️ Nenhum jogo passou pelos filtros (Odds 1.0-1.70 e Futuros).");
        } else {
            console.log("Exemplo de jogo filtrado:", matches[0]);
        }
    } catch (e) {
        console.error("❌ Falha no Teste:", e.message);
    }
}

test();
