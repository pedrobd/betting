import { getDailyMatches } from './lib/flashscore.js';
import { supabase } from './lib/supabase.js';
import { fetchTeamNews } from './lib/news.js';
import { analyzeTextSentiment, calculateConfidence, constructReasoning } from './lib/analyzer.js';

async function syncToCloud() {
    console.log("🚀 [SYNC] Iniciando Sincronização Inteligente Cloud...");
    
    try {
        const freshMatches = await getDailyMatches();
        
        if (!freshMatches || freshMatches.length === 0) {
            console.log("⚠️ [SYNC] Nenhum jogo encontrado para sincronizar.");
            return;
        }

        console.log(`✅ [SYNC] ${freshMatches.length} jogos extraídos. A analisar notícias e sentimento...`);

        const records = [];
        for (let m of freshMatches) {
            // Pausa para evitar rate limit de notícias (DuckDuckGo é sensível)
            await new Promise(r => setTimeout(r, 1200));
            
            console.log(`🧐 Analisando contexto para: ${m.team_home} vs ${m.team_away}...`);
            const newsText = await fetchTeamNews(m.team_home);
            const sentimentData = analyzeTextSentiment(newsText);
            
            // Calculamos a confiança baseada na Odd + Sentimento das notícias
            // Usamos uma Form (H2H) base fixa de 80% para este MVP
            const conf = calculateConfidence(m.odd, 80, sentimentData.sentimentModifier);
            const reasoning = constructReasoning(m.odd, conf, sentimentData.reasoning);

            records.push({
                team_home: m.team_home,
                team_away: m.team_away,
                odd: m.odd,
                time: m.time,
                confidence: conf,
                reasoning: reasoning,
                session_id: 'automated-ia-sync'
            });
        }

        console.log(`🚀 [SYNC] A enviar ${records.length} previsões ANALISADAS pela IA para a Cloud...`);

        const { error } = await supabase
            .from('betting_predictions')
            .upsert(records, { onConflict: 'team_home,team_away,time' });

        if (error) throw error;

        console.log("✨ [SYNC] IA concluiu a análise. O teu site já reflete as notícias reais das equipas!");

    } catch (e) {
        console.error("❌ [SYNC] Erro na Sincronização IA:", e.message);
    }
}

// Inicia o ciclo
syncToCloud();
setInterval(syncToCloud, 1800000); // Repetir a cada 30 minutos
