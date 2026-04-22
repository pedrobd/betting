import { getDailyMatches } from '../lib/flashscore.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { fetchTeamNews } from '../lib/news.js';
import { analyzeTextSentiment, calculateConfidence, constructReasoning, detectValueBet } from '../lib/analyzer.js';
import { getTeamStats } from '../lib/sofascore.js';

console.log("🚀 QUICK SYNC — A processar apenas 3 jogos para teste\n");

try {
    const freshMatches = await getDailyMatches();
    if (!freshMatches?.length) { console.log("❌ Nenhum jogo."); process.exit(0); }
    
    // Solo os primeiros 3
    const limitedMatches = freshMatches.slice(0, 3);
    console.log(`✅ ${limitedMatches.length} jogos para teste. A analisar...\n`);

    const records = [];
    for (const match of limitedMatches) {
        console.log(`🧐 ${match.team_home} vs ${match.team_away}`);

        const [homeIntel, awayIntel] = await Promise.all([
            getTeamStats(match.team_home),
            getTeamStats(match.team_away),
        ]);

        const newsText = await fetchTeamNews(match.team_home, match.team_away);
        const sentiment = analyzeTextSentiment(newsText);
        const confidence = calculateConfidence(match.odd, homeIntel.form, awayIntel.form, sentiment.sentimentModifier, homeIntel.pos, awayIntel.pos, match.odd_trend, homeIntel.xg, awayIntel.xg);
        const { isValueBet, ev } = detectValueBet(match.odd, confidence, homeIntel.xg, awayIntel.xg);
        const reasoning = constructReasoning(match.odd, homeIntel.form, awayIntel.form, confidence, sentiment.reasoning, homeIntel.pos, awayIntel.pos, match.odd_trend, homeIntel.xg, awayIntel.xg);

        const rec = {
            team_home: match.team_home,
            team_away: match.team_away,
            odd: match.odd,
            time: match.time,
            confidence,
            reasoning,
            home_form: homeIntel.form || null,
            away_form: awayIntel.form || null,
            home_pos: homeIntel.pos,
            away_pos: awayIntel.pos,
            home_xg: homeIntel.xg,
            away_xg: awayIntel.xg,
            ev,
            is_value_bet: isValueBet,
            odd_trend: match.odd_trend,
            session_id: 'quick_' + Date.now()
        };

        records.push(rec);
        await new Promise(r => setTimeout(r, 500));
    }

    console.log(`\n📥 A inserir ${records.length} registos na DB...`);
    const { error } = await supabaseAdmin.from('betting_predictions').insert(records);

    if (error) {
        console.error('❌ Erro:', error.message);
    } else {
        console.log('✅ Inserido com sucesso!');
    }

} catch (e) {
    console.error('💥 Erro crítico:', e.message);
}
