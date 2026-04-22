import { getDailyMatches } from './lib/flashscore.js';
import { supabase } from './lib/supabase.js';
import { fetchTeamNews } from './lib/news.js';
import { analyzeTextSentiment, calculateConfidence, constructReasoning, detectValueBet } from './lib/analyzer.js';
import { getTeamStats, getH2H } from './lib/sofascore.js';

async function syncToCloud() {
    console.log("🚀 [SYNC] Iniciando Sincronização BetMask Pro (Flashscore + SofaIntel + xG)...");

    try {
        const freshMatches = await getDailyMatches();

        if (!freshMatches || freshMatches.length === 0) {
            console.log("⚠️ [SYNC] Nenhum jogo encontrado.");
            return;
        }

        console.log(`✅ [SYNC] ${freshMatches.length} jogos extraídos. A calcular inteligência...`);

        // Guardar odds anteriores antes de sobrescrever
        const { data: existingData } = await supabase
            .from('betting_predictions')
            .select('team_home, team_away, time, odd');
        const existingOdds = {};
        (existingData || []).forEach(r => {
            existingOdds[`${r.team_home}|${r.team_away}|${r.time}`] = parseFloat(r.odd);
        });

        const records = [];
        for (const match of freshMatches) {
            console.log(`\n🧐 Analisando: ${match.team_home} vs ${match.team_away}`);

            // 1. SofaIntel: Forma + Posição + xG
            const [homeIntel, awayIntel] = await Promise.all([
                getTeamStats(match.team_home),
                getTeamStats(match.team_away),
            ]);

            console.log(`   🏠 Casa: forma="${homeIntel.form}" pos=#${homeIntel.pos} xG=${homeIntel.xg}`);
            console.log(`   ✈️  Fora: forma="${awayIntel.form}" pos=#${awayIntel.pos} xG=${awayIntel.xg}`);

            // 2. H2H directo
            let h2h = [];
            if (homeIntel.teamId && awayIntel.teamId) {
                h2h = await getH2H(homeIntel.teamId, awayIntel.teamId);
                if (h2h.length > 0) console.log(`   ⚔️  H2H: ${h2h.map(r => r.result).join('')} (${h2h.filter(r => r.result === 'W').length}V)`);
            }

            // 3. Sentimento de notícias
            const newsText = await fetchTeamNews(match.team_home, match.team_away);
            const sentiment = analyzeTextSentiment(newsText);

            // 4. Confidence com xG + H2H integrados
            const confidence = calculateConfidence(
                match.odd,
                homeIntel.form,
                awayIntel.form,
                sentiment.sentimentModifier,
                homeIntel.pos,
                awayIntel.pos,
                match.odd_trend,
                homeIntel.xg,
                awayIntel.xg,
                h2h
            );

            // 5. Value Bet detector
            const { isValueBet, ev, edge } = detectValueBet(
                match.odd,
                confidence,
                homeIntel.xg,
                awayIntel.xg
            );

            // 6. Reasoning enriquecido
            const reasoning = constructReasoning(
                match.odd,
                homeIntel.form,
                awayIntel.form,
                confidence,
                sentiment.reasoning,
                homeIntel.pos,
                awayIntel.pos,
                match.odd_trend,
                homeIntel.xg,
                awayIntel.xg,
                h2h
            );

            const oddPrevious = existingOdds[`${match.team_home}|${match.team_away}|${match.time}`] || 0;

            if (isValueBet) {
                console.log(`   💎 VALUE BET! EV: +${ev}% | Edge: +${edge}%`);
            }
            // Validação de qualidade de dados
            const dataQuality = {
                hasRealOdd: match.odd > 1.0,
                hasForm: homeIntel.form.length > 0,
                hasXg: homeIntel.xg > 0,
                hasPosition: homeIntel.pos > 0,
            };
            console.log(`   📋 Qualidade: ${JSON.stringify(dataQuality)}`);
            records.push({
                team_home: match.team_home,
                team_away: match.team_away,
                odd: match.odd,
                odd_previous: oddPrevious,
                odd_draw: match.odd_draw || 0,
                odd_1x: match.odd_1x || 0,
                odd_over15: match.odd_over15 || 0,
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
                h2h: h2h,
                session_id: Math.random().toString(36).substring(7)
            });

            await new Promise(r => setTimeout(r, 1200));
        }

        console.log(`\n🚀 [SYNC] A enviar ${records.length} previsões para a Cloud...`);
        const valueBets = records.filter(r => r.is_value_bet).length;
        console.log(`   💎 Value Bets detectadas: ${valueBets}/${records.length}`);

        // Delete + Insert (evita erro de constraint ON CONFLICT)
        for (const rec of records) {
            // Apagar registo antigo do mesmo jogo (se existir)
            await supabase
                .from('betting_predictions')
                .delete()
                .eq('team_home', rec.team_home)
                .eq('team_away', rec.team_away)
                .eq('time', rec.time);
        }

        const { error } = await supabase
            .from('betting_predictions')
            .insert(records);

        if (error) {
            console.error("❌ [SYNC] Erro no Supabase:", error.message);
            if (error.code === '42P10') {
                await supabase.from('betting_predictions').insert(records);
            }
        } else {
            console.log("✨ [SYNC] Sincronização completa! (Odds + Notícias + Forma + xG + Value Bets)");
        }

    } catch (e) {
        console.error("❌ [SYNC] Erro:", e.message);
    }
}

syncToCloud();
setInterval(syncToCloud, 1800000); // a cada 30 minutos
