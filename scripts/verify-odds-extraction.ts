import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { FlashscoreBot } from '../lib/core/flashscore-bot';
import { flashscoreScanner } from '../lib/core/flashscore-scanner';

async function verify() {
  console.log("🔍 [VERIFICATION] Starting Real-Time Odds Extraction Test...");
  
  try {
    // 1. Run the sync (which triggers the scraper with new selectors)
    // We only sync a few games to save time
    await FlashscoreBot.syncLiveGames();
    
    // 2. Reload cache and check matches
    await flashscoreScanner.reloadCache();
    const games = flashscoreScanner.getAllGames();
    
    console.log(`\n📊 [RESULTS] Total Games Found: ${games.length}`);
    
    if (games.length === 0) {
      console.error("❌ [FAILURE] No games extracted from Flashscore. Check if selectors are being blocked.");
      return;
    }

    let successCount = 0;
    games.forEach((g, i) => {
      const untp = g.odds?.["under_5.5"];
      const hasRealOdds = untp !== undefined && untp > 1.0;
      
      console.log(`${i+1}. [${g.home} vs ${g.away}] Under 5.5: ${untp ?? 'MISSING'} ${hasRealOdds ? '✅' : '👀'}`);
      if (hasRealOdds) successCount++;
    });

    const successRate = (successCount / games.length) * 100;
    console.log(`\n📈 [METRIC] Extraction Success Rate: ${successRate.toFixed(1)}%`);
    
    if (successRate > 50) {
      console.log("✅ [SUCCESS] Odds extraction is working with real varied values!");
    } else {
       console.warn("⚠️ [WARNING] Low success rate. Some games might not have odds open yet, or selectors might need more refinement.");
    }
    
  } catch (error) {
    console.error("❌ [CRITICAL ERROR]", error);
  }
}

verify();
