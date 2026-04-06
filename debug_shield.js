const { universalShield } = require("./lib/core/universal-api");

async function test() {
  console.log("--- DEBUG SHIELD ATOMIC ---");
  const fixture = {
    homeTeam: "Brentford",
    awayTeam: "Chelsea",
    startTime: "2026-04-06T15:00:00Z"
  };

  console.log(`Searching odds for: ${fixture.homeTeam} vs ${fixture.awayTeam}...`);
  const odds = await universalShield.getOddsForUniversalFixture(fixture);
  
  console.log("RESULTADO DAS ODDS:");
  console.log(JSON.stringify(odds, null, 2));

  if (Object.keys(odds).length === 0) {
    console.log("❌ FALHA: Odds continuam vazias (Fallback 1.15 seria ativado).");
  } else {
    console.log("✅ SUCESSO: Odds reais encontradas!");
  }
}

test();
