// ============================================================
// Mock Data - Simulates API-Football responses for testing
// Activated when RAPIDAPI_KEY is missing or plan is invalid
// ============================================================

import type { ApiFixture, ApiFixtureStatistics } from "../types";

const TODAY = new Date().toISOString().split("T")[0];

// ── Simulated Pre-Game Fixtures (for Dutching strategy) ──
export const MOCK_FIXTURES: ApiFixture[] = [
  {
    fixture: {
      id: 1001,
      date: `${TODAY}T18:00:00+00:00`,
      status: { elapsed: null, short: "NS" },
    },
    teams: {
      home: { id: 101, name: "Benfica" },
      away: { id: 102, name: "Sporting" },
    },
    goals: { home: null, away: null },
    score: { halftime: { home: null, away: null } },
  },
  {
    fixture: {
      id: 1002,
      date: `${TODAY}T20:00:00+00:00`,
      status: { elapsed: null, short: "NS" },
    },
    teams: {
      home: { id: 103, name: "Porto" },
      away: { id: 104, name: "Braga" },
    },
    goals: { home: null, away: null },
    score: { halftime: { home: null, away: null } },
  },
  {
    fixture: {
      id: 1003,
      date: `${TODAY}T21:45:00+00:00`,
      status: { elapsed: null, short: "NS" },
    },
    teams: {
      home: { id: 105, name: "Vitória SC" },
      away: { id: 106, name: "Gil Vicente" },
    },
    goals: { home: null, away: null },
    score: { halftime: { home: null, away: null } },
  },
];

// ── Simulated Live Fixtures (for Funil de Cantos) ──
export const MOCK_LIVE_FIXTURES: ApiFixture[] = [
  {
    fixture: {
      id: 2001,
      date: `${TODAY}T19:00:00+00:00`,
      status: { elapsed: 78, short: "2H" }, // 78' — dentro da janela 75'-85'
    },
    teams: {
      home: { id: 201, name: "Real Madrid" },
      away: { id: 202, name: "Barcelona" },
    },
    goals: { home: 0, away: 1 }, // Home a perder → pressão esperada
    score: { halftime: { home: 0, away: 1 } },
  },
  {
    fixture: {
      id: 2002,
      date: `${TODAY}T17:00:00+00:00`,
      status: { elapsed: 82, short: "2H" }, // 82' — dentro da janela
    },
    teams: {
      home: { id: 203, name: "Manchester City" },
      away: { id: 204, name: "Arsenal" },
    },
    goals: { home: 1, away: 1 }, // Empate → home team pressiona
    score: { halftime: { home: 1, away: 0 } },
  },
];

// ── Simulated H2H (low-scoring games) ──
export function getMockH2H(homeId: number, awayId: number): ApiFixture[] {
  // Return 8 historic games with avg < 2.0 goals
  return Array.from({ length: 8 }, (_, i) => ({
    fixture: {
      id: 9000 + i,
      date: new Date(Date.now() - i * 7 * 24 * 3600 * 1000).toISOString(),
      status: { elapsed: 90, short: "FT" },
    },
    teams: {
      home: { id: homeId, name: "Home Team" },
      away: { id: awayId, name: "Away Team" },
    },
    // Alternating 0-0, 1-0, 0-1, 1-1 → avg = (0+1+1+2) * 2 / 8 = 1.0 goals
    goals: {
      home: i % 4 === 0 ? 0 : i % 4 === 1 ? 1 : i % 4 === 2 ? 0 : 1,
      away: i % 4 === 0 ? 0 : i % 4 === 1 ? 0 : i % 4 === 2 ? 1 : 1,
    },
    score: { halftime: { home: null, away: null } },
  }));
}

// ── Simulated Live Stats (high pressure scenario) ──
export function getMockStats(homeTeamId: number): ApiFixtureStatistics[] {
  return [
    {
      team: { id: homeTeamId, name: "Home Team" },
      statistics: [
        { type: "Dangerous Attacks", value: 9 },  // 9 * 1.2 = 10.8
        { type: "Total Shots", value: 4 },         // 4 * 2.0 = 8.0  → IP = 18.8 > 15 ✅
        { type: "Shots on Goal", value: 2 },
        { type: "Ball Possession", value: "64%" },
        { type: "Corner Kicks", value: 6 },
      ],
    },
    {
      team: { id: homeTeamId + 1, name: "Away Team" },
      statistics: [
        { type: "Dangerous Attacks", value: 3 },
        { type: "Total Shots", value: 2 },
        { type: "Ball Possession", value: "36%" },
      ],
    },
  ];
}
