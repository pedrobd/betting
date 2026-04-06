// ============================================================
// ApiFootballClient - API-Sports Direct (v3.football.api-sports.io)
// Uses x-apisports-key header (NOT RapidAPI)
// Falls back to mock when key is missing or API fails
// ============================================================

import type { ApiFixture, ApiFixtureStatistics, ApiFixtureEvent } from "../types";
import { getEffectiveDateString } from "./date-utils";
import { MOCK_FIXTURES, MOCK_LIVE_FIXTURES, getMockH2H, getMockStats } from "./mock-data";
import { normalizeTeamName } from "./utils";

const BASE_URL = "https://v3.football.api-sports.io";

async function apiFetch<T>(endpoint: string, params: Record<string, string> = {}): Promise<{ data: T; isMock: boolean }> {
  // HARD-CODED FOR PHOENIX RECOVERY (Pedro's Key)
  const apiKey = "1933ec48aae4c6fd8b5794cd9a576df4";
  if (!apiKey) {
    console.warn("[API-Sports] ❌ CHAVE APISPORTS_KEY NÃO ENCONTRADA! Usando Mock.");
    return { data: [] as T, isMock: true };
  } else {
    // console.log(`[API-Sports] ✅ Chave encontrada (${apiKey.slice(0, 4)}...). Buscando ${endpoint}...`);
  }

  const url = new URL(`${BASE_URL}${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  try {
    const res = await fetch(url.toString(), {
      headers: { "x-apisports-key": apiKey },
      cache: "no-store",
    });

    if (res.status === 403 || res.status === 401) {
      console.warn(`[API-Sports] ${res.status} em ${endpoint}  a usar mock`);
      return { data: [] as T, isMock: true };
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`API-Sports error ${res.status} em ${endpoint}: ${body.slice(0, 200)}`);
    }

    const json = await res.json();
    // API-Sports wraps results in { response: [], errors: [], results: N }
    if (json.errors && Object.keys(json.errors).length > 0) {
      console.warn(`[API-Sports] Erros em ${endpoint}:`, json.errors);
      return { data: [] as T, isMock: true };
    }

    return { data: json.response as T, isMock: false };
  } catch (err) {
    if (err instanceof Error && err.message.includes("fetch failed")) {
      console.warn("[API-Sports] Sem ligacao  a usar mock");
      return { data: [] as T, isMock: true };
    }
    throw err;
  }
}

export async function getLiveFixtures(): Promise<ApiFixture[]> {
  const { data, isMock } = await apiFetch<ApiFixture[]>("/fixtures", { live: "all" });
  return isMock ? MOCK_LIVE_FIXTURES : data;
}

export async function getFixtureById(fixtureId: number): Promise<ApiFixture | null> {
  const { data, isMock } = await apiFetch<ApiFixture[]>("/fixtures", { id: String(fixtureId) });
  if (isMock) return MOCK_FIXTURES.find((f) => f.fixture.id === fixtureId) ?? null;
  return data[0] ?? null;
}

export async function getFixturesByDate(date: string): Promise<ApiFixture[]> {
  const { data, isMock } = await apiFetch<ApiFixture[]>("/fixtures", { date });
  return isMock ? MOCK_FIXTURES : data;
}

export async function getTodayFixturesByLeague(
  leagueId: number,
  season: number = 2024 // Use real-world data season for stats
): Promise<ApiFixture[]> {
  const today = getEffectiveDateString();
  const { data, isMock } = await apiFetch<ApiFixture[]>("/fixtures", {
    league: String(leagueId),
    season: String(season),
    date: today,
  });
  return isMock ? MOCK_FIXTURES : data;
}

export async function getFixtureStatistics(fixtureId: number): Promise<ApiFixtureStatistics[]> {
  const { data, isMock } = await apiFetch<ApiFixtureStatistics[]>("/fixtures/statistics", {
    fixture: String(fixtureId),
  });
  if (isMock) {
    const fixture = MOCK_LIVE_FIXTURES.find((f) => f.fixture.id === fixtureId);
    return getMockStats(fixture?.teams.home.id ?? 201);
  }
  return data;
}

export async function getFixtureEvents(fixtureId: number): Promise<ApiFixtureEvent[]> {
  const { data, isMock } = await apiFetch<ApiFixtureEvent[]>("/fixtures/events", {
    fixture: String(fixtureId),
    type: "Corner",
  });
  return isMock ? [] : data;
}

export async function getH2H(
  homeTeamId: number,
  awayTeamId: number,
  homeName?: string,
  awayName?: string,
  last: number = 10
): Promise<ApiFixture[]> {
  let h2hParam = `${homeTeamId}-${awayTeamId}`;

  // If IDs are missing but names are provided, try to find IDs first
  if (homeTeamId === 0 && awayTeamId === 0 && homeName && awayName) {
    console.log(`[API-Sports] 🔍 Searching IDs for ${homeName} vs ${awayName}...`);
    const [hRes, aRes] = await Promise.all([
      apiFetch<any[]>("/teams", { name: homeName }),
      apiFetch<any[]>("/teams", { name: awayName })
    ]);
    
    if (hRes.data?.[0]?.team?.id && aRes.data?.[0]?.team?.id) {
       h2hParam = `${hRes.data[0].team.id}-${aRes.data[0].team.id}`;
    } else {
       return getMockH2H(0, 0);
    }
  }

  const { data, isMock } = await apiFetch<ApiFixture[]>("/fixtures/headtohead", {
    h2h: h2hParam,
    last: String(last),
  });
  return isMock ? getMockH2H(homeTeamId, awayTeamId) : data;
}

export async function getFixtureResult(
  fixtureId: number
): Promise<{ homeGoals: number; awayGoals: number; status: string } | null> {
  const fixture = await getFixtureById(fixtureId);
  if (!fixture) return null;
  return {
    homeGoals: fixture.goals.home ?? 0,
    awayGoals: fixture.goals.away ?? 0,
    status: fixture.fixture.status.short,
  };
}

export async function getResultsForDate(date: string): Promise<Record<string, { home: number; away: number; status: string; finished: boolean }>> {
  const { data, isMock } = await apiFetch<any[]>("/fixtures", { date });
  
  const cache: Record<string, { home: number; away: number; status: string; finished: boolean }> = {};
  if (isMock || !data || data.length === 0) return cache;

  for (const entry of data) {
    const teams = entry.teams;
    const goals = entry.goals;
    const status = entry.fixture.status;
    if (!teams) continue;

    const nameKey = `${normalizeTeamName(teams.home.name)}-${normalizeTeamName(teams.away.name)}`;
    
    cache[nameKey] = {
      home: goals.home ?? 0,
      away: goals.away ?? 0,
      status: status.short,
      finished: ["FT", "AET", "PEN"].includes(status.short)
    };
  }
  return cache;
}

export async function getOddsForDate(date: string): Promise<Record<string, Record<string, number>>> {
  const { data, isMock } = await apiFetch<any[]>("/odds", { date });
  
  const cache: Record<string, Record<string, number>> = {};
  if (isMock || !data || data.length === 0) return cache;

  for (const entry of data) {
    const teams = entry.teams;
    if (!teams) continue;

    const nameKey = `${normalizeTeamName(teams.home.name)}-${normalizeTeamName(teams.away.name)}`;
    const odds: Record<string, number> = {};
    
    entry.bookmakers?.forEach((bm: any) => {
      if (bm.name === "Bet365" || !odds["1"]) {
        bm.bets?.forEach((bet: any) => {
          if (bet.id === 1) {
            bet.values.forEach((v: any) => {
              if (v.value === "Home") odds["1"] = parseFloat(v.odd);
              if (v.value === "Draw") odds["X"] = parseFloat(v.odd);
              if (v.value === "Away") odds["2"] = parseFloat(v.odd);
            });
          }
          if (bet.id === 5) {
            bet.values.forEach((v: any) => {
              if (v.value === "Over 0.5") odds["over_0.5"] = parseFloat(v.odd);
              if (v.value === "Over 1.5") odds["over_1.5"] = parseFloat(v.odd);
              if (v.value === "Over 2.5") odds["over_2.5"] = parseFloat(v.odd);
              if (v.value === "Under 2.5") odds["under_2.5"] = parseFloat(v.odd);
              if (v.value === "Under 3.5") odds["under_3.5"] = parseFloat(v.odd);
              if (v.value === "Under 4.5") odds["under_4.5"] = parseFloat(v.odd);
              if (v.value === "Under 5.5") odds["under_5.5"] = parseFloat(v.odd);
            });
          }
        });
      }
    });
    cache[nameKey] = odds;
  }
  return cache;
}


