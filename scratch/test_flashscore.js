import { getDailyMatches } from '../lib/flashscore.js';

async function test() {
    console.log("Iniciando teste de extração...");
    try {
        const matches = await getDailyMatches();
        console.log(`Teste finalizado. Encontrados ${matches.length} jogos.`);
        if (matches.length > 0) {
            console.log("Exemplo:", matches[0]);
        }
    } catch (e) {
        console.error("Erro no teste:", e);
    }
}

test();
