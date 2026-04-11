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
  fixture_mid?: string;
  news_preview?: string;
  absences?: string;
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
    
    // Refresh cache from Supabase
    await flashscoreScanner.reloadCache();
    const games = flashscoreScanner.getAllGames();

    if (games.length === 0) {
      console.warn("[Shield] ⚠️ NENHUM JOGO ENCONTRADO NO FLASHSCORE.");
      return [];
    }

    const today = getEffectiveDateString();

    return games.map((g, idx) => {
      try {
        let startTime = g.time || new Date().toISOString();
        const today = getEffectiveDateString();
        const currentYear = new Date().getFullYear();
        
        // Format 1: HH:mm (prepend today's date)
        if (g.time && g.time.includes(":") && g.time.length <= 5) {
          startTime = `${today}T${g.time}:00Z`;
        } 
        // Format 2: DD/MM/YYYY HH:mm (Our new scraper format)
        else if (g.time && g.time.includes("/") && g.time.includes(":")) {
          const parts = g.time.split(" ");
          if (parts.length >= 2) {
            const dateParts = parts[0].split("/");
            const timeParts = parts[1].split(":");
            if (dateParts.length >= 2 && timeParts.length >= 2) {
                const year = dateParts.length === 3 ? parseInt(dateParts[2]) : 2026;
                const d = new Date(year, parseInt(dateParts[1]) - 1, parseInt(dateParts[0]), parseInt(timeParts[0]), parseInt(timeParts[1]));
                if (!isNaN(d.getTime())) startTime = d.toISOString();
            }
          }
        }
        // Format 3: DD.MM. HH:mm (legacy check)
        else if (g.time && g.time.includes(".") && g.time.includes(":")) {
          const parts = g.time.split(" ");
          if (parts.length >= 2) {
            const dateParts = parts[0].split(".");
            const timeParts = parts[1].split(":");
            if (dateParts.length >= 2 && timeParts.length >= 2) {
               const d = new Date(currentYear, parseInt(dateParts[1]) - 1, parseInt(dateParts[0]), parseInt(timeParts[0]), parseInt(timeParts[1]));
               if (!isNaN(d.getTime())) {
                 if (d.getFullYear() < 2026) d.setFullYear(2026);
                 startTime = d.toISOString();
               }
            }
          }
        }

        return {
          id: g.mid ? `scraped-${g.mid}` : `scraped-${idx}`,
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
          away_record: g.away_record,
          fixture_mid: g.mid,
          news_preview: g.news_preview,
          absences: g.absences
        };
      } catch (e) {
        console.warn(`[Shield] ⚠️ Error mapping game ${g.home} vs ${g.away}:`, e);
        return null;
      }
    }).filter((g): g is UniversalFixture => g !== null);
  }

  /**
   * UNIFIED ODDS - Strictly Flashscore
   */
  async getOddsForUniversalFixture(fixture: UniversalFixture): Promise<Record<string, number>> {
    const scrapedMatch = flashscoreScanner.findGame(fixture.homeTeam, fixture.awayTeam);
    if (scrapedMatch && scrapedMatch.odds) {
        console.log(`[Shield] 🔥 FLASHSCORE DATA FOUND: ${fixture.homeTeam} vs ${fixture.awayTeam}`);
        return scrapedMatch.odds as any;
    }
    
    console.warn(`[Shield] ⚠️ ODDS NOT FOUND in Cache for: ${fixture.homeTeam} vs ${fixture.awayTeam}`);
    return {};
  }

  /**
   * UNIFIED RESULTS - Strictly Flashscore
   * (Expects results to be updated in the cache)
   */
  async getUniversalResult(homeTeam: string, awayTeam: string, mid?: string): Promise<{ homeGoals: number; awayGoals: number; status: string; finished: boolean } | null> {
    // 1. Tentar Cache Local (FlashscoreScanner)
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
    
    // 2. Se temos MID, tentar Deep Scraping (para jogos que já saíram da lista principal)
    if (mid) {
        console.log(`[Shield] 🔍 DEEP SCAN: Verificando resultado para MID ${mid}...`);
        const result = await flashscoreScanner.getGameResultById(mid);
        if (result) {
            const isFinished = result.status.includes("Terminado") || result.status.includes("Fim") || result.status === "FT" || result.status.includes("Encerrado");
            const isVoid = result.status.includes("Adiado") || result.status.includes("Cancelado");
            
            return {
                homeGoals: result.home,
                awayGoals: result.away,
                status: isVoid ? "VOID" : result.status,
                finished: isFinished || isVoid
            };
        }
    }
    
    return null;
  }
}

export const universalShield = new UniversalAPIClient();
