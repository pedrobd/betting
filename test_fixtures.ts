import { getFixturesByDate } from "./lib/core/api-football";
import { normalizeTeamName } from "./lib/core/utils";

async function test() {
  const date = "2026-04-06";
  console.log(`Searching fixtures for ${date}...`);
  const fixtures = await getFixturesByDate(date);
  console.log(`Found ${fixtures.length} fixtures.`);
  
  const target = { h: "Brentford", a: "Chelsea" };
  const hNorm = normalizeTeamName(target.h);
  const aNorm = normalizeTeamName(target.a);
  
  const found = fixtures.find(f => 
    normalizeTeamName(f.teams.home.name) === hNorm && 
    normalizeTeamName(f.teams.away.name) === aNorm
  );

  if (found) {
    console.log(`✅ MATCH FOUND! Fixture ID: ${found.fixture.id}`);
    console.log(`Match Status: ${found.fixture.status.short}`);
  } else {
    console.log("❌ NO MATCH FOUND for Brentford vs Chelsea 2025-04-06.");
    // Log some samples
    console.log("Samples:", fixtures.slice(0, 3).map(f => `${f.teams.home.name} vs ${f.teams.away.name}`).join(" | "));
  }
}

test();
