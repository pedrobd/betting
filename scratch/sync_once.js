/**
 * Sync único (sem setInterval) para debug.
 * Executar: node --env-file=.env.local scratch/sync_once.js
 */
import { getDailyMatches } from '../lib/flashscore.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { fetchTeamNews } from '../lib/news.js';
import { analyzeTextSentiment, calculateConfidence, constructReasoning, detectValueBet } from '../lib/analyzer.js';
import { getTeamStats, getH2H } from '../lib/sofascore.js';

console.log("🚀 SYNC ÚNICO — Modo Produção\n");

// Limpeza prévia — garante que não ficam registos antigos/inválidos
// Limpeza seletiva será feita durante o loop ou via upsert
console.log("🔄 Preparando atualização da base de dados...\n");

try {
    const freshMatches = await getDailyMatches();
    if (!freshMatches?.length) { console.log("❌ Nenhum jogo."); process.exit(0); }
    console.log(`✅ ${freshMatches.length} jogos. A analisar...\n`);

    // Guardar odds anteriores antes de sobrescrever
    const { data: existingData } = await supabaseAdmin
        .from('betting_predictions')
        .select('team_home, team_away, time, odd');
    const existingOdds = {};
    (existingData || []).forEach(r => {
        existingOdds[`${r.team_home}|${r.team_away}|${r.time}`] = parseFloat(r.odd);
    });

    const records = [];
    for (const match of freshMatches) {
        console.log(`🧐 ${match.team_home} vs ${match.team_away}`);

        const [homeIntel, awayIntel] = await Promise.all([
            getTeamStats(match.team_home),
            getTeamStats(match.team_away),
        ]);

        // H2H directo
        let h2h = [];
        if (homeIntel.teamId && awayIntel.teamId) {
            h2h = await getH2H(homeIntel.teamId, awayIntel.teamId);
            if (h2h.length > 0) console.log(`   ⚔️  H2H: ${h2h.map(r => r.result).join('')} (${h2h.filter(r => r.result === 'W').length}V)`);
        }

        const newsText = await fetchTeamNews(match.team_home, match.team_away);
        const sentiment = analyzeTextSentiment(newsText);
        // xG ajustado ao adversário: blend do ataque próprio com a defesa do oponente
        const homeXg = (homeIntel.xg > 0 && awayIntel.xgConceded > 0)
            ? parseFloat(((homeIntel.xg + awayIntel.xgConceded) / 2).toFixed(2))
            : homeIntel.xg;
        const awayXg = (awayIntel.xg > 0 && homeIntel.xgConceded > 0)
            ? parseFloat(((awayIntel.xg + homeIntel.xgConceded) / 2).toFixed(2))
            : awayIntel.xg;
        if (homeIntel.xgConceded > 0 || awayIntel.xgConceded > 0) {
            console.log(`   🎯 xG ajustado: casa ${homeIntel.xg}→${homeXg} | fora ${awayIntel.xg}→${awayXg}`);
        }

        const confidence = calculateConfidence(match.odd, homeIntel.form, awayIntel.form, sentiment.sentimentModifier, homeIntel.pos, awayIntel.pos, match.odd_trend, homeXg, awayXg, h2h, homeIntel.homeForm, awayIntel.awayForm, match.odd_draw, match.odd_away);
        const { isValueBet, ev, margin } = detectValueBet(match.odd, confidence, homeXg, awayXg, match.odd_draw, match.odd_away);
        const reasoning = constructReasoning(match.odd, homeIntel.form, awayIntel.form, confidence, sentiment.reasoning, homeIntel.pos, awayIntel.pos, match.odd_trend, homeXg, awayXg, h2h);

        const oddPrevious = existingOdds[`${match.team_home}|${match.team_away}|${match.time}`] || 0;

        const rec = {
            team_home: match.team_home,
            team_away: match.team_away,
            odd: match.odd,
            odd_draw: match.odd_draw || 0,
            odd_away: match.odd_away || 0,
            odd_previous: oddPrevious,
            time: match.time,
            confidence,
            reasoning,
            home_form: homeIntel.form || null,
            away_form: awayIntel.form || null,
            home_pos: homeIntel.pos,
            away_pos: awayIntel.pos,
            home_xg: homeXg,
            away_xg: awayXg,
            ev,
            bk_margin: margin,
            is_value_bet: isValueBet,
            odd_trend: match.odd_trend,
            h2h: h2h,
            session_id: 'debug_' + Date.now()
        };

        // DEBUG: Mostrar exactamente o que vai para a DB
        console.log(`  → home_form="${rec.home_form}" | xg=${rec.home_xg} | ev=${rec.ev} | value=${rec.is_value_bet}`);
        if (isValueBet) console.log(`  💎 VALUE BET!`);

        records.push(rec);
        await new Promise(r => setTimeout(r, 1200));
    }

    console.log(`\n📥 A atualizar ${records.length} registos na DB...`);

    // Apagar registos existentes com o mesmo jogo (evita conflito de constraint)
    for (const rec of records) {
        await supabaseAdmin.from('betting_predictions').delete()
            .eq('team_home', rec.team_home).eq('team_away', rec.team_away).eq('time', rec.time);
    }
    const { error } = await supabaseAdmin.from('betting_predictions').insert(records);

    if (error) {
        console.error('❌ Erro:', error.message);
    } else {
        console.log('✅ Inserido com sucesso!');

        // Verificação imediata
        console.log('\n🔍 Verificação imediata:');
        const { data } = await supabaseAdmin
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
