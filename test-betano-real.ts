import { universalShield } from "./lib/core/universal-api";
import { betanoScraper } from "./lib/core/betano-scraper";

async function test() {
  console.log("--- TESTE REAL BETANO/SHIELD ---");
  
  // 1. Check Scraper Cache
  const matches = (betanoScraper as any).cache; // Accessing private for test
  console.log(`Cache Scraper: ${matches.length} jogos carregados.`);

  // 2. Mock a fixture from the scrap (Portsmouth vs Oxford)
  const mockFixture = {
    id: "999",
    homeTeam: "Portsmouth",
    awayTeam: "Oxford United",
    startTime: new Date().toISOString()
  };

  console.log(`Buscando odds para ${mockFixture.homeTeam} vs ${mockFixture.awayTeam}...`);
  const odds = await universalShield.getOddsForUniversalFixture(mockFixture as any);

  console.log("ODDS ENCONTRADAS:");
  console.log(JSON.stringify(odds, null, 2));

  if (odds["under_2.5"]) {
    console.log(`✅ SUCESSO: Odd 'Under 2.5' encontrada: ${odds["under_2.5"]}`);
  } else {
    console.log("❌ FALHA: Odd real não encontrada no cache.");
  }
}

test();
