import fs from "fs";
import path from "path";
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
}

const CACHE_PATH = path.join(process.cwd(), "data", "betano_odds.json"); // Reusing this for now to avoid breaking dashboard

/**
 * FLASHSCORE SCANNER SERVICE
 * The new single source of truth for 2026 fixtures and Under 5.5 odds.
 */
export class FlashscoreScanner {
  private static instance: FlashscoreScanner;
  private cache: FlashscoreGame[] = [];

  private constructor() {
    this.reloadCache();
  }

  public static getInstance(): FlashscoreScanner {
    if (!FlashscoreScanner.instance) {
      FlashscoreScanner.instance = new FlashscoreScanner();
    }
    return FlashscoreScanner.instance;
  }

  public reloadCache() {
    try {
      if (fs.existsSync(CACHE_PATH)) {
        const data = fs.readFileSync(CACHE_PATH, "utf-8");
        this.cache = JSON.parse(data);
        console.log(`[FlashscoreScanner] 🟢 Loaded ${this.cache.length} games from Cache.`);
      } else {
        console.warn(`[FlashscoreScanner] ⚠️ Cache not found at ${CACHE_PATH}`);
        this.cache = [];
      }
    } catch (e) {
      console.error("[FlashscoreScanner] ❌ Error reloading cache:", e);
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
}

export const flashscoreScanner = FlashscoreScanner.getInstance();
