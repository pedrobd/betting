import { getLiveOdds } from "./database";
import { normalizeTeamName } from "./utils";

export interface FlashscoreGame {
  home: string;
  away: string;
  time: string;
  league: string;
  odds: {
    "1"?: number;
    "X"?: number;
    "2"?: number;
    "under_5.5"?: number;
    "under_4.5"?: number;
  };
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
  mid?: string;
}

/**
 * FLASHSCORE SCANNER SERVICE
 * Reads from Supabase `live_odds` cache.
 */
export class FlashscoreScanner {
  private static instance: FlashscoreScanner;
  private cache: FlashscoreGame[] = [];

  private constructor() {
    // We don't load async in constructor
  }

  public static getInstance(): FlashscoreScanner {
    if (!FlashscoreScanner.instance) {
      FlashscoreScanner.instance = new FlashscoreScanner();
    }
    return FlashscoreScanner.instance;
  }

  public async reloadCache(): Promise<void> {
    try {
      this.cache = await getLiveOdds();
      console.log(`[FlashscoreScanner] 🟢 Loaded ${this.cache.length} games from Supabase Cache.`);
    } catch (e) {
      console.error("[FlashscoreScanner] ❌ Error loading from DB cache:", e);
      this.cache = [];
    }
  }

  public getAllGames(): FlashscoreGame[] {
    return this.cache;
  }

  public findGame(home: string, away: string): FlashscoreGame | null {
    const hNorm = normalizeTeamName(home);
    const aNorm = normalizeTeamName(away);

    return this.cache.find(g => {
        const gH = normalizeTeamName(g.home);
        const gA = normalizeTeamName(g.away);
        return (gH.includes(hNorm) || hNorm.includes(gH)) && 
               (gA.includes(aNorm) || aNorm.includes(gA));
    }) || null;
  }

  public async getGameResultById(mid: string): Promise<{ home: number, away: number, status: string } | null> {
     // Lazy import to avoid circular dependency
     const { FlashscoreBot } = require("./flashscore-bot");
     return await FlashscoreBot.getMatchResult(mid);
  }
}

export const flashscoreScanner = FlashscoreScanner.getInstance();
