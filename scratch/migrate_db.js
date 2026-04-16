/**
 * Verifica se as colunas novas existem na DB.
 * Executar: node --env-file=.env.local scratch/migrate_db.js
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

async function checkColumns() {
    console.log('🔧 A verificar colunas na DB...\n');

    // Buscar 1 registo e ver que campos existem
    const { data, error } = await supabase
        .from('betting_predictions')
        .select('id, home_xg, away_xg, ev, is_value_bet, home_form, away_form, home_pos, away_pos, odd_trend')
        .limit(1);

    if (error) {
        console.log('❌ Erro ao ler colunas:', error.message);
        console.log('\nColunas ainda não existem. Executa este SQL no Supabase:\n');
        console.log(`ALTER TABLE betting_predictions
  ADD COLUMN IF NOT EXISTS home_form text,
  ADD COLUMN IF NOT EXISTS away_form text,
  ADD COLUMN IF NOT EXISTS home_pos integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS away_pos integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS odd_trend text DEFAULT 'stable',
  ADD COLUMN IF NOT EXISTS home_xg numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS away_xg numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ev numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_value_bet boolean DEFAULT false;`);
    } else {
        const sample = data?.[0];
        console.log('✅ Migração confirmada! Colunas existem:\n');
        const cols = ['home_form', 'away_form', 'home_pos', 'away_pos', 'odd_trend', 'home_xg', 'away_xg', 'ev', 'is_value_bet'];
        cols.forEach(col => {
            const exists = sample !== undefined && col in (sample || {});
            console.log(`  ${exists ? '✅' : '❓'} ${col}`);
        });
        console.log('\n🚀 Podes correr: node --env-file=.env.local cloud_sync.js');
    }
}

checkColumns();
