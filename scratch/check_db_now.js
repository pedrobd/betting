import { supabase } from '../lib/supabase.js';

const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
const last7d  = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

if (!supabase) {
  console.error('❌ Supabase não configurado. Verifica .env.local (SUPABASE_URL e SUPABASE_KEY)');
  process.exit(1);
}

console.log('A verificar DB Supabase...\n');

const { data: recent, error: e1 } = await supabase
  .from('betting_predictions')
  .select('team_home, team_away, odd, confidence, created_at')
  .gt('created_at', last24h)
  .order('created_at', { ascending: false })
  .limit(10);

console.log('📊 Jogos últimas 24h:', recent?.length ?? 0, e1 ? `ERRO: ${e1.message}` : '');
if (recent?.length) {
  recent.forEach(m => console.log(`  • ${m.team_home} vs ${m.team_away} | odd=${m.odd} | conf=${m.confidence}% | ${m.created_at}`));
}

const { data: all7, error: e2 } = await supabase
  .from('betting_predictions')
  .select('team_home, team_away, odd, confidence, created_at')
  .gt('created_at', last7d)
  .order('created_at', { ascending: false })
  .limit(5);

console.log('\n📊 Jogos últimos 7 dias:', all7?.length ?? 0, e2 ? `ERRO: ${e2.message}` : '');
if (all7?.length) {
  all7.forEach(m => console.log(`  • ${m.team_home} vs ${m.team_away} | ${m.created_at}`));
}

const { count, error: e3 } = await supabase
  .from('betting_predictions')
  .select('*', { count: 'exact', head: true });

console.log('\n📊 Total de registos na tabela:', count, e3 ? `ERRO: ${e3.message}` : '');

process.exit(0);
