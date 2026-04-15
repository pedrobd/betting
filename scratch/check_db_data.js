import 'dotenv/config';
import { supabase } from './lib/supabase.js';

async function checkDB() {
    const { data, error } = await supabase
        .from('betting_predictions')
        .select('team_home, home_form, home_pos, odd_trend, created_at')
        .order('created_at', { ascending: false })
        .limit(5);

    if (error) {
        console.error("Erro:", error);
    } else {
        console.log("Dados recentes:", JSON.stringify(data, null, 2));
    }
}

checkDB();
