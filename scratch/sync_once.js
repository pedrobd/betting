/**
 * Sync único (sem setInterval) para debug.
 * Executar: node --env-file=.env.local scratch/sync_once.js
 */
import { getDailyMatches } from '../lib/flashscore.js';
import { supabase } from '../lib/supabase.js';
import { fetchTeamNews } from '../lib/news.js';
import { analyzeTextSentiment, calculateConfidence, constructReasoning, detectValueBet } from '../lib/analyzer.js';
import { getTeamStats } from '../lib/sofascore.js';

console.log("🚀 SYNC ÚNICO — Modo Produção\n");

// Limpeza prévia — garante que não ficam registos antigos/inválidos
console.log("🗑️  A limpar registos antigos...");
await supabase.from('betting_predictions').delete().gt('created_at', '2000-01-01');
console.log("✅ DB limpa.\n");

try {
    const freshMatches = await getDailyMatches();
    if (!freshMatches?.length) { console.log("❌ Nenhum jogo."); process.exit(0); }
    console.log(`✅ ${freshMatches.length} jogos. A analisar...\n`);

    const records = [];
    for (const match of freshMatches) {
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
            session_id: 'debug_' + Date.now()
        };

        // DEBUG: Mostrar exactamente o que vai para a DB
        console.log(`  → home_form="${rec.home_form}" | xg=${rec.home_xg} | ev=${rec.ev} | value=${rec.is_value_bet}`);
        if (isValueBet) console.log(`  💎 VALUE BET!`);

        records.push(rec);
        await new Promise(r => setTimeout(r, 1200));
    }

    console.log(`\n📥 A inserir ${records.length} registos na DB...`);
    const { error } = await supabase.from('betting_predictions').insert(records);

    if (error) {
        console.error('❌ Erro:', error.message);
    } else {
        console.log('✅ Inserido com sucesso!');

        // Verificação imediata
        console.log('\n🔍 Verificação imediata:');
        const { data } = await supabase
            .from('betting_predictions')
            .select('team_home, home_form, home_xg, ev, is_value_bet')
            .order('created_at', { ascending: false })
            .limit(5);

        data?.forEach(r => {
            const ok = r.home_form && !r.home_form.includes('?');
            console.log(`  ${ok ? '✅' : '❌'} ${r.team_home}: form="${r.home_form}" xg=${r.home_xg} ev=${r.ev}`);
        });
    }

} catch (e) {
    console.error('💥 Erro crítico:', e.message);
}
