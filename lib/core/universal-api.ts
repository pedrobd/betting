import { getEffectiveDateString } from "./date-utils";
import { getOddsForDate, getResultsForDate } from "./api-football";
import { normalizeTeamName } from "./utils";
import { flashscoreScanner } from "./flashscore-scanner";

export interface UniversalFixture {
  id: string;
  homeTeam: string;
  awayTeam: string;
  startTime: string;
  league: string;
  source: string;
}

export class UniversalAPIClient {
  private oddsCache: Record<string, Record<string, number>> = {};
  private resultCache: Record<string, any> = {};
  private cacheDate: string = "";

  /**
   * SMART FAILOVER: Get today's actionable games (SCANNER ONLY)
   */
  async getActionableGames(): Promise<UniversalFixture[]> {
    console.log("[Shield] 🎯 SCANNER-ONLY MODE: Fetching 2026 fixtures from Flashscore Cache...");
    
    // Refresh cache from file
    flashscoreScanner.reloadCache();
    const games = flashscoreScanner.getAllGames();

    if (games.length === 0) {
      console.warn("[Shield] ⚠️ NENHUM JOGO ENCONTRADO NO CACHE DO FLASHSCORE.");
      return [];
    }

    return games.map((g, idx) => ({
      id: `scraped-${idx}`,
      homeTeam: g.home,
      awayTeam: g.away,
      startTime: g.time || new Date().toISOString(),
      league: g.league || "Flashscore",
      source: "flashscore"
    }));
  }

  /**
   * UNIFIED ODDS - Tries to get odds for a fixture regardless of source
   */
  async getOddsForUniversalFixture(fixture: UniversalFixture): Promise<Record<string, number>> {
    const today = getEffectiveDateString();
    
    // 1. PRIORITY: Flashscore Scanner (Live Data)
    const scrapedMatch = flashscoreScanner.findGame(fixture.homeTeam, fixture.awayTeam);
    if (scrapedMatch) {
        console.log(`[Shield] 🔥 FLASHSCORE DATA FOUND: ${fixture.homeTeam} vs ${fixture.awayTeam}`);
        return scrapedMatch.odds as any;
    }

    // 2. Fallback to API Cache (Only for historical H2H verification)
    if (this.cacheDate !== today || Object.keys(this.oddsCache).length === 0) {
        this.cacheDate = today;
        this.oddsCache = await getOddsForDate(today);
    }
    
    const homeNorm = normalizeTeamName(fixture.homeTeam);
    const awayNorm = normalizeTeamName(fixture.awayTeam);
    const fixtureKey = `${homeNorm}-${awayNorm}`;
    
    return this.oddsCache[fixtureKey] || {};
  }

  /**
   * UNIFIED RESULTS
   */
  async getUniversalResult(homeTeam: string, awayTeam: string): Promise<{ homeGoals: number; awayGoals: number; status: string; finished: boolean } | null> {
    const today = getEffectiveDateString();
    if (this.cacheDate !== today || Object.keys(this.resultCache).length === 0) {
        this.resultCache = await getResultsForDate(today);
        this.cacheDate = today;
    }

    const homeNorm = normalizeTeamName(homeTeam);
    const awayNorm = normalizeTeamName(awayTeam);
    const fixtureKey = `${homeNorm}-${awayNorm}`;
    
    return this.resultCache[fixtureKey] || null;
  }
}

export const universalShield = new UniversalAPIClient();
