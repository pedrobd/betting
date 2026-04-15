import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://zqrdahblpcppazxoidow.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxcmRhaGJscGNwcGF6eG9pZG93Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxODgzNjEsImV4cCI6MjA5MTc2NDM2MX0.QGGs7fGVm_JpPMA9j93_isrH_nKzB5gSNdTrOZtQc4o';

const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanup() {
    console.log("🧼 Iniciando limpeza de dados corrompidos...");
    
    // Apaga jogos com o prefixo indesejado
    const { data, error, count } = await supabase
        .from('betting_predictions')
        .delete({ count: 'exact' })
        .ilike('team_home', '%Sem odd na Home%');

    if (error) {
        console.error("❌ Erro na limpeza:", error.message);
    } else {
        console.log(`✅ Sucesso! Foram removidos ${count} registos corrompidos.`);
    }

    // Opcional: Apagar jogos com data de ontem (14/04) para limpar o dashboard
    const yesterday = '2026-04-14T23:59:59Z';
    const { count: countOld } = await supabase
        .from('betting_predictions')
        .delete({ count: 'exact' })
        .lt('created_at', yesterday);
        
    console.log(`🧹 Removidos ${countOld || 0} jogos antigos de ontem.`);
}

cleanup();
