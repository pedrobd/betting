// ============================================================
// ApiFootballClient - API-Sports Direct (v3.football.api-sports.io)
// Uses x-apisports-key header (NOT RapidAPI)
// Falls back to mock when key is missing or API fails
// ============================================================

import type { ApiFixture, ApiFixtureStatistics, ApiFixtureEvent } from "../types";
import { MOCK_FIXTURES, MOCK_LIVE_FIXTURES, getMockH2H, getMockStats } from "./mock-data";

const BASE_URL = "https://v3.football.api-sports.io";

async function apiFetch<T>(
  endpoint: string,
  params: Record<string, string> = {}
): Promise<{ data: T; isMock: boolean }> {
  const apiKey = process.env.APISPORTS_KEY;
  if (!apiKey) {
    console.warn("[API-Sports] Chave nao definida  usando mock");
    return { data: [] as T, isMock: true };
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
  season: number = new Date().getFullYear()
): Promise<ApiFixture[]> {
  const today = new Date().toISOString().split("T")[0];
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
  last: number = 10
): Promise<ApiFixture[]> {
  const { data, isMock } = await apiFetch<ApiFixture[]>("/fixtures/headtohead", {
    h2h: `${homeTeamId}-${awayTeamId}`,
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

export async function getOddsForFixture(
  fixtureId: number
): Promise<Record<string, number>> {
  const { data, isMock } = await apiFetch<any[]>("/odds", { fixture: String(fixtureId) });
  
  // Minimal mock for odds if needed
  if (isMock || !data || data.filter((d: any) => d.bookmakers && d.bookmakers.length > 0).length === 0) {
    return {
      "over_0.5": 1.15,
      "over_1.5": 1.40,
      "under_5.5": 1.08,
      "btts": 1.75,
      "1": 2.10, "X": 3.40, "2": 3.20,
      "1X": 1.30, "X2": 1.60, "12": 1.25
    };
  }

  const odds: Record<string, number> = {};
  
  // API-Football returns odds per bookmaker. We use the first one (usually the main one).
  const bookmaker = data[0].bookmakers[0];
  if (!bookmaker) return odds;

  for (const bet of bookmaker.bets) {
    // Match Winner (id: 1)
    if (bet.id === 1) {
      bet.values.forEach((v: any) => {
        if (v.value === "Home") odds["1"] = parseFloat(v.odd);
        if (v.value === "Draw") odds["X"] = parseFloat(v.odd);
        if (v.value === "Away") odds["2"] = parseFloat(v.odd);
      });
    }
    // Goals Over/Under (id: 5)
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
    // Both Teams Score (id: 8)
    if (bet.id === 8) {
      const yesValue = bet.values.find((v: any) => v.value === "Yes");
      if (yesValue) odds["btts"] = parseFloat(yesValue.odd);
    }
    // Double Chance (id: 12)
    if (bet.id === 12) {
      bet.values.forEach((v: any) => {
        if (v.value === "Home/Draw") odds["1X"] = parseFloat(v.odd);
        if (v.value === "Draw/Away") odds["X2"] = parseFloat(v.odd);
        if (v.value === "Home/Away") odds["12"] = parseFloat(v.odd);
      });
    }
  }

  return odds;
}


