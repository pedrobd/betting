/**
 * Teste directo: insere 1 registo com home_form="TESTEWWWDL" e le de volta
 * Executar: node --env-file=.env.local scratch/test_insert.js
 */
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const testRecord = {
    team_home: '__TEST_HOME__',
    team_away: '__TEST_AWAY__',
    odd: 1.50,
    time: '23:59',
    confidence: 55,
    reasoning: 'Teste directo',
    home_form: 'WWWDL',
    away_form: 'LLDWW',
    home_pos: 3,
    away_pos: 8,
    home_xg: 1.75,
    away_xg: 0.95,
    ev: 7.5,
    is_value_bet: true,
    odd_trend: 'dropping',
    session_id: 'test-session'
};

console.log('📥 A inserir registo de teste...');
const { error: insertError } = await sb
    .from('betting_predictions')
    .insert(testRecord);

if (insertError) {
    console.log('❌ Erro no INSERT:', insertError.message);
    process.exit(1);
}

console.log('✅ INSERT ok. A ler de volta...');

const { data, error: readError } = await sb
    .from('betting_predictions')
    .select('team_home, home_form, away_form, home_xg, away_xg, ev, is_value_bet')
    .eq('team_home', '__TEST_HOME__')
    .single();

if (readError) {
    console.log('❌ Erro no SELECT:', readError.message);
} else {
    console.log('\nValores guardados na DB:');
    console.log(`  home_form  : ${JSON.stringify(data.home_form)}  ${data.home_form === 'WWWDL' ? '✅' : '❌ ERRADO!'}`);
    console.log(`  away_form  : ${JSON.stringify(data.away_form)}`);
    console.log(`  home_xg    : ${data.home_xg}  ${data.home_xg === 1.75 ? '✅' : '❌ ERRADO!'}`);
    console.log(`  ev         : ${data.ev}  ${data.ev === 7.5 ? '✅' : '❌ ERRADO!'}`);
    console.log(`  is_value_bet: ${data.is_value_bet}  ${data.is_value_bet === true ? '✅' : '❌ ERRADO!'}`);
}

// Limpar
await sb.from('betting_predictions').delete().eq('team_home', '__TEST_HOME__');
console.log('\n🧹 Registo de teste removido.');
