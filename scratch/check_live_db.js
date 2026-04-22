import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const { data, error } = await sb
    .from('betting_predictions')
    .select('team_home, team_away, time, home_form, away_form, home_xg, away_xg, ev, is_value_bet, created_at')
    .order('created_at', { ascending: false })
    .limit(10);

if (error) { console.log('ERRO:', error.message); process.exit(1); }

console.log('=== ULTIMOS 10 REGISTOS NA DB ===\n');
data.forEach(r => {
    const age = Math.round((Date.now() - new Date(r.created_at)) / 60000);
    const formOk = r.home_form && !r.home_form.includes('?') && r.home_form.length > 0;
    console.log(`[${age}min atras] ${r.team_home} vs ${r.team_away} @ ${r.time}`);
    console.log(`  home_form = ${JSON.stringify(r.home_form)} ${formOk ? 'OK' : 'VAZIO/NULO'}`);
    console.log(`  away_form = ${JSON.stringify(r.away_form)}`);
    console.log(`  xG = ${r.home_xg} / ${r.away_xg} | EV = ${r.ev} | VALUE = ${r.is_value_bet}`);
    console.log('');
});
