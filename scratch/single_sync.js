import { getDailyMatches } from '../lib/flashscore.js';
import { createClient } from '@supabase/supabase-js';
import { fetchTeamNews } from '../lib/news.js';
import { analyzeTextSentiment, calculateConfidence, constructReasoning } from '../lib/analyzer.js';

const supabaseUrl = 'https://zqrdahblpcppazxoidow.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxcmRhaGJscGNwcGF6eG9pZG93Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxODgzNjEsImV4cCI6MjA5MTc2NDM2MX0.QGGs7fGVm_JpPMA9j93_isrH_nKzB5gSNdTrOZtQc4o';
const supabase = createClient(supabaseUrl, supabaseKey);

async function syncToCloud() {
    console.log("🚀 [SYNC] Iniciando Sincronização Única...");
    
    try {
        const freshMatches = await getDailyMatches();
        
        if (!freshMatches || freshMatches.length === 0) {
            console.log("⚠️ [SYNC] Nenhum jogo encontrado para sincronizar.");
            return;
        }

        console.log(`✅ [SYNC] ${freshMatches.length} jogos extraídos. A analisar notícias...`);

        const records = [];
        for (let m of freshMatches) {
            console.log(`🧐 Analisando: ${m.team_home} vs ${m.team_away}...`);
            const newsText = await fetchTeamNews(m.team_home);
            const sentimentData = analyzeTextSentiment(newsText);
            
            const conf = calculateConfidence(m.odd, 80, sentimentData.sentimentModifier);
            const reasoning = constructReasoning(m.odd, conf, sentimentData.reasoning);

            records.push({
                team_home: m.team_home,
                team_away: m.team_away,
                odd: m.odd,
                time: m.time,
                confidence: conf,
                reasoning: reasoning,
                home_form: m.home_form,
                away_form: m.away_form,
                session_id: 'manual-ai-sync'
            });
        }

        console.log(`🚀 [SYNC] Enviando ${records.length} previsões...`);

        const { error } = await supabase
            .from('betting_predictions')
            .insert(records);

        if (error) {
            console.error("❌ Erro no Upsert:", error);
        } else {
            console.log("✨ [SYNC] Sincronização concluída com sucesso!");
        }

    } catch (e) {
        console.error("❌ Erro fatal:", e.message);
    }
}

syncToCloud();
