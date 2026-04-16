/**
 * Limpa TODOS os registos antigos (com form='?????') da DB
 * e deixa apenas os mais recentes correctos.
 * Executar: node --env-file=.env.local scratch/fix_all.js
 */
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

console.log('🔧 A limpar registos com dados inválidos...\n');

// Apagar tudo que tem home_form='?????' ou home_form nulo/vazio e xg=0
const { error: e1, count: c1 } = await sb
    .from('betting_predictions')
    .delete()
    .or('home_form.eq.?????,home_xg.eq.0');

if (e1) console.error('Erro 1:', e1.message);
else console.log(`✅ Removidos registos com dados inválidos.`);

// Verificar o que ficou
const { data } = await sb
    .from('betting_predictions')
    .select('team_home, home_form, home_xg, ev')
    .order('created_at', { ascending: false })
    .limit(10);

console.log('\n📊 Estado actual da DB:');
if (!data?.length) {
    console.log('  DB vazia — precisa de sync.');
} else {
    data.forEach(r => {
        const ok = r.home_form && !r.home_form.includes('?');
        console.log(`  ${ok ? '✅' : '❌'} ${r.team_home}: form="${r.home_form}" xg=${r.home_xg}`);
    });
}
