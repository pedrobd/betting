import fs from "fs";
import path from "path";
import { normalizeTeamName } from "./utils";

export interface BetanoGame {
  home: string;
  away: string;
  time: string;
  odds: {
    "1": number;
    "X": number;
    "2": number;
    "over_2.5"?: number;
    "under_2.5"?: number;
    "over_3.5"?: number;
    "under_3.5"?: number;
    "under_4.5"?: number;
    "under_5.5"?: number;
  };
}

const CACHE_PATH = path.join(process.cwd(), "data", "betano_odds.json");

/**
 * BETANO SCRAPER SERVICE
 * Connects the engine to real-time scraped odds from Betano.pt
 */
export class BetanoScraper {
  private static instance: BetanoScraper;
  private cache: BetanoGame[] = [];

  private constructor() {
    this.reloadCache();
  }

  public static getInstance(): BetanoScraper {
    if (!BetanoScraper.instance) {
      BetanoScraper.instance = new BetanoScraper();
    }
    return BetanoScraper.instance;
  }

  public reloadCache() {
    try {
      if (fs.existsSync(CACHE_PATH)) {
        const data = fs.readFileSync(CACHE_PATH, "utf-8");
        this.cache = JSON.parse(data);
        console.log(`[Scraper] 🟢 Loaded ${this.cache.length} games from Betano Cache.`);
      } else {
        console.warn(`[Scraper] ⚠️ Betano cache not found at ${CACHE_PATH}`);
        this.cache = [];
      }
    } catch (e) {
      console.error("[Scraper] ❌ Error reloading Betano cache:", e);
      this.cache = [];
    }
  }

  public findOdds(homeTeam: string, awayTeam: string): BetanoGame | null {
    const hNorm = normalizeTeamName(homeTeam);
    const aNorm = normalizeTeamName(awayTeam);

    // 1. Precise Match
    const match = this.cache.find(g => 
        normalizeTeamName(g.home) === hNorm && 
        normalizeTeamName(g.away) === aNorm
    );
    if (match) return match;

    // 2. Fuzzy Match
    return this.cache.find(g => {
        const gH = normalizeTeamName(g.home);
        const gA = normalizeTeamName(g.away);
        return (gH.includes(hNorm) || hNorm.includes(gH)) && 
               (gA.includes(aNorm) || aNorm.includes(gA));
    }) || null;
  }
}

export const betanoScraper = BetanoScraper.getInstance();
