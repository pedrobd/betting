import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { getLiveOdds } from './lib/core/database';

async function diagnose() {
    console.log("🔍 [DIAGNOSTIC] Checking Supabase live_odds...");
    try {
        const games = await getLiveOdds();
        console.log(`📊 Current games in DB: ${games.length}`);
        
        if (games.length > 0) {
            console.log("\nSample Data (First 3):");
            games.slice(0, 3).forEach((g, i) => {
                console.log(`${i+1}. ${g.home} vs ${g.away} | League: ${g.league}`);
                console.log(`   Odds: ${JSON.stringify(g.odds)}`);
                console.log(`   Avg Goals: ${g.avg_goals} | Home Pos: ${g.home_pos}`);
            });
            
            const withUnder = games.filter(g => g.odds?.["under_5.5"] > 0);
            console.log(`\n✅ Games with real Under 5.5 odds: ${withUnder.length}`);
        } else {
            console.error("❌ Database is EMPTY.");
        }
    } catch (e: any) {
        console.error("❌ Error querying database:", e.message);
    }
}

diagnose();
