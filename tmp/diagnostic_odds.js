const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function checkData() {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data: odds } = await supabase.from('live_odds').select('*');
    
    console.log(`Total games in DB: ${odds?.length || 0}`);
    
    if (odds && odds.length > 0) {
        const sample = odds.find(g => g.home.includes('Barcelona')) || odds[0];
        console.log("SAMPLE MATCH:");
        console.log(JSON.stringify(sample, null, 2));
    }
}

checkData();
