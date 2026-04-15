import { getDailyMatches } from './lib/flashscore.js';
import { supabase } from './lib/supabase.js';
import { fetchTeamNews } from './lib/news.js';
import { analyzeTextSentiment, calculateConfidence, constructReasoning } from './lib/analyzer.js';
import { getTeamStats } from './lib/sofascore.js';

async function syncToCloud() {
    console.log("🚀 [SYNC] Iniciando Sincronização Inteligente Cloud (Flashscore + SofaIntel)...");
    
    try {
        const freshMatches = await getDailyMatches();
        
        if (!freshMatches || freshMatches.length === 0) {
            console.log("⚠️ [SYNC] Nenhum jogo encontrado para sincronizar.");
            return;
        }

        console.log(`✅ [SYNC] ${freshMatches.length} jogos extraídos. A buscar estatísticas no SofaScore...`);

        // 3. Processar Notícias e Confiança
        const records = [];
        for (const match of freshMatches) {
            console.log(`🧐 Analisando: ${match.team_home} vs ${match.team_away}...`);
            
            // Buscar Intel via SofaScore
            const homeIntel = await getTeamStats(match.team_home);
            const awayIntel = await getTeamStats(match.team_away);

            const newsText = await fetchTeamNews(match.team_home, match.team_away);
            const sentiment = analyzeTextSentiment(newsText);
            
            const confidence = calculateConfidence(
                match.odd, 
                homeIntel.form, 
                awayIntel.form, 
                sentiment.sentimentModifier,
                homeIntel.pos,
                awayIntel.pos,
                match.odd_trend
            );

            const reasoning = constructReasoning(
                match.odd, 
                homeIntel.form, 
                awayIntel.form, 
                confidence, 
                sentiment.reasoning,
                homeIntel.pos,
                awayIntel.pos,
                match.odd_trend
            );

            records.push({
                team_home: match.team_home,
                team_away: match.team_away,
                odd: match.odd,
                time: match.time,
                confidence: confidence,
                reasoning: reasoning,
                home_form: homeIntel.form,
                away_form: awayIntel.form,
                home_pos: homeIntel.pos,
                away_pos: awayIntel.pos,
                odd_trend: match.odd_trend,
                session_id: Math.random().toString(36).substring(7)
            });

            // Sleep entre notícias para evitar rate limit
            await new Promise(r => setTimeout(r, 1200));
        }

        console.log(`🚀 [SYNC] A enviar ${records.length} previsões ANALISADAS para a Cloud...`);

        const { error } = await supabase
            .from('betting_predictions')
            .upsert(records, { onConflict: 'team_home,team_away,time' });

        if (error) {
            console.error("❌ [SYNC] Erro no Supabase:", error.message);
            // Fallback: Tenta insert simples se o upsert falhar por falta de constraint
            if (error.code === '42P10') {
                console.log("⚠️ [SYNC] Tentando insert alternativo...");
                await supabase.from('betting_predictions').insert(records);
            }
        } else {
            console.log("✨ [SYNC] IA concluiu a análise profunda (Odds + Notícias + Forma)!");
        }

    } catch (e) {
        console.error("❌ [SYNC] Erro na Sincronização IA:", e.message);
    }
}

// Inicia o ciclo
syncToCloud();
setInterval(syncToCloud, 1800000); // Repetir a cada 30 minutos
