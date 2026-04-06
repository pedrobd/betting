import { getEffectiveDateString } from "./date-utils";
import { normalizeTeamName } from "./utils";
import { flashscoreScanner } from "./flashscore-scanner";

export interface UniversalFixture {
  id: string;
  homeTeam: string;
  awayTeam: string;
  startTime: string;
  league: string;
  source: string;
  avg_goals?: number;
  avg_goals_home?: number;
  avg_goals_away?: number;
  form?: string;
  form_home?: string;
  form_away?: string;
  h2h_un55_pct?: number;
  home_pos?: number;
  away_pos?: number;
  home_record?: string;
  away_record?: string;
}

/**
 * UNIFIED SHIELD 4.0 - Flashscore-Only Real-World 2026 Connector
 * No external API dependencies. All data served from Flashscore Cache.
 */
export class UniversalAPIClient {
  /**
   * SMART FIXTURES: Get today's actionable games from Flashscore
   */
  async getActionableGames(): Promise<UniversalFixture[]> {
    console.log("[Shield] 🎯 FLASHSCORE-ONLY MODE: Fetching 2026 fixtures...");
    
    // Refresh cache from file
    flashscoreScanner.reloadCache();
    const games = flashscoreScanner.getAllGames();

    if (games.length === 0) {
      console.warn("[Shield] ⚠️ NENHUM JOGO ENCONTRADO NO FLASHSCORE.");
      return [];
    }

    const today = getEffectiveDateString();

    return games.map((g, idx) => {
      let startTime = g.time || new Date().toISOString();
      
      // If g.time is just HH:mm, prepend today's date
      if (g.time && g.time.includes(":") && g.time.length <= 5) {
        startTime = `${today}T${g.time}:00Z`;
      }

      return {
        id: `scraped-${idx}`,
        homeTeam: g.home,
        awayTeam: g.away,
        startTime,
        league: g.league || "Flashscore",
        source: "flashscore",
        avg_goals: g.avg_goals,
        avg_goals_home: g.avg_goals_home,
        avg_goals_away: g.avg_goals_away,
        form: g.form,
        form_home: g.form_home,
        form_away: g.form_away,
        h2h_un55_pct: g.h2h_un55_pct,
        home_pos: g.home_pos,
        away_pos: g.away_pos,
        home_record: g.home_record,
        away_record: g.away_record
      };
    });
  }

  /**
   * UNIFIED ODDS - Strictly Flashscore
   */
  async getOddsForUniversalFixture(fixture: UniversalFixture): Promise<Record<string, number>> {
    const scrapedMatch = flashscoreScanner.findGame(fixture.homeTeam, fixture.awayTeam);
    if (scrapedMatch) {
        console.log(`[Shield] 🔥 FLASHSCORE DATA FOUND: ${fixture.homeTeam} vs ${fixture.awayTeam}`);
        return scrapedMatch.odds as any;
    }
    
    return {};
  }

  /**
   * UNIFIED RESULTS - Strictly Flashscore
   * (Expects results to be updated in the cache)
   */
  async getUniversalResult(homeTeam: string, awayTeam: string): Promise<{ homeGoals: number; awayGoals: number; status: string; finished: boolean } | null> {
    const scrapedMatch = flashscoreScanner.findGame(homeTeam, awayTeam);
    if (scrapedMatch && (scrapedMatch as any).result) {
        const res = (scrapedMatch as any).result;
        return {
            homeGoals: res.home,
            awayGoals: res.away,
            status: "FT",
            finished: true
        };
    }
    
    return null;
  }
}

export const universalShield = new UniversalAPIClient();
