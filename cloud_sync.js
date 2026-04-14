import { getDailyMatches } from './lib/flashscore.js';
import { supabase } from './lib/supabase.js';

async function syncToCloud() {
    console.log("🚀 [SYNC] Iniciando Sincronização Cloud...");
    
    try {
        // 1. Extrair jogos reais usando o teu browser local
        const freshMatches = await getDailyMatches();
        
        if (!freshMatches || freshMatches.length === 0) {
            console.log("⚠️ [SYNC] Nenhum jogo encontrado para sincronizar.");
            return;
        }

        console.log(`✅ [SYNC] ${freshMatches.length} jogos extraídos. A limpar base de dados antiga...`);

        // 2. Limpar previsões antigas (Opcional, ou podes manter para histórico)
        // Aqui vamos apenas inserir os novos. Para este simulador, vamos limpar para ter sempre os frescos.
        await supabase.from('betting_predictions').delete().neq('id', -1); 

        // 3. Preparar dados para Supabase
        const records = freshMatches.map(m => ({
            team_home: m.team_home,
            team_away: m.team_away,
            odd: m.odd,
            time: m.time,
            confidence: Math.floor(Math.random() * (95 - 70 + 1) + 70), // Simulação de confiança
            reasoning: `Análise algorítmica baseada em odds de ${m.odd} e volume de mercado.`
        }));

        // 4. Enviar para a Cloud
        const { error } = await supabase.from('betting_predictions').insert(records);

        if (error) throw error;

        console.log("✨ [SYNC] Sincronização concluída com sucesso! O teu site na Vercel já tem dados novos.");

    } catch (e) {
        console.error("❌ [SYNC] Erro na Sincronização:", e.message);
    }
}

// Corre uma vez ao iniciar
syncToCloud();

// E depois a cada 30 minutos (1800000 ms)
setInterval(syncToCloud, 1800000);
