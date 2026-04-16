/**
 * Limpa todos os registos de betting_predictions.
 * Executar: node --env-file=.env.local scratch/clear_db.js
 */
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

console.log('🗑️  A limpar tabela betting_predictions...');

// Supabase requires a filter for delete — using gt on created_at to match all
const { error, count } = await sb
    .from('betting_predictions')
    .delete()
    .gt('created_at', '2000-01-01');

if (error) {
    console.error('❌ Erro:', error.message);
} else {
    console.log(`✅ Tabela limpa! Registos removidos.`);
}
