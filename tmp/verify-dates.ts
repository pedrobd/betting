
import { universalShield } from "../lib/core/universal-api";
import { AcumuladorEngine } from "../lib/core/strategies";

async function testDates() {
    console.log("--- Testing Universal API ---");
    const games = await universalShield.getActionableGames();
    if (games.length > 0) {
        console.log("First game startTime:", games[0].startTime);
        const d = new Date(games[0].startTime);
        console.log("Is valid date?", !isNaN(d.getTime()));
    } else {
        console.log("No games found in universalShield.");
    }

    console.log("\n--- Testing Acumulador Engine ---");
    const engine = new AcumuladorEngine();
    try {
        const aposta = await engine.gerarAcumulador();
        console.log("First selection horario:", aposta.selecoes[0].horario);
        const d2 = new Date(aposta.selecoes[0].horario as string);
        console.log("Is valid date?", !isNaN(d2.getTime()));
    } catch (e: any) {
        console.error("Error generating acumulador:", e.message);
    }
}

testDates();
