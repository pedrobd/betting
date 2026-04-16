/**
 * Corrige registos com '?????' na DB do Supabase.
 * Busca a forma real no SofaScore e actualiza.
 * Executar: node scratch/fix_db_form.js
 */
import { createClient } from '@supabase/supabase-js';
import { getTeamStats } from '../lib/sofascore.js';
import { calculateConfidence, constructReasoning } from '../lib/analyzer.js';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

async function fixFormData() {
    console.log('🔧 Iniciando correcção de registos com "?????" na DB...\n');

    // Buscar registos com forma inválida
    const { data: badRecords, error } = await supabase
        .from('betting_predictions')
        .select('id, team_home, team_away, odd, home_form, away_form, home_pos, away_pos, odd_trend, reasoning')
        .or('home_form.eq.?????,away_form.eq.?????')
        .order('created_at', { ascending: false })
        .limit(50);

    if (error) {
        console.error('❌ Erro ao ler DB:', error.message);
        process.exit(1);
    }

    if (!badRecords || badRecords.length === 0) {
        console.log('✅ Nenhum registo com "?????" encontrado. DB já está limpa!');
        process.exit(0);
    }

    console.log(`📋 ${badRecords.length} registos para corrigir:\n`);

    let fixedCount = 0;
    let failedCount = 0;

    for (const record of badRecords) {
        console.log(`\n🔍 Corrigindo: ${record.team_home} vs ${record.team_away}`);

        try {
            // Buscar dados reais
            const [homeIntel, awayIntel] = await Promise.all([
                getTeamStats(record.team_home),
                getTeamStats(record.team_away)
            ]);

            console.log(`   → Casa: "${homeIntel.form}" #${homeIntel.pos} | Fora: "${awayIntel.form}" #${awayIntel.pos}`);

            // Recalcular confidence com dados reais
            const newConfidence = calculateConfidence(
                record.odd,
                homeIntel.form,
                awayIntel.form,
                0, // sem sentimento - manter o existente
                homeIntel.pos,
                awayIntel.pos,
                record.odd_trend
            );

            const newReasoning = constructReasoning(
                record.odd,
                homeIntel.form,
                awayIntel.form,
                newConfidence,
                record.reasoning?.split('|').pop()?.trim() || 'Sem alertas críticos nas notícias.',
                homeIntel.pos,
                awayIntel.pos,
                record.odd_trend
            );

            // Actualizar na DB
            const { error: updateError } = await supabase
                .from('betting_predictions')
                .update({
                    home_form: homeIntel.form || null,
                    away_form: awayIntel.form || null,
                    home_pos: homeIntel.pos,
                    away_pos: awayIntel.pos,
                    confidence: newConfidence,
                    reasoning: newReasoning
                })
                .eq('id', record.id);

            if (updateError) {
                console.log(`   ❌ Falha ao actualizar: ${updateError.message}`);
                failedCount++;
            } else {
                console.log(`   ✅ Actualizado! Confidence: ${newConfidence}%`);
                fixedCount++;
            }

            // Rate limit
            await new Promise(r => setTimeout(r, 1500));

        } catch (e) {
            console.log(`   ❌ Erro ao processar: ${e.message}`);
            failedCount++;
        }
    }

    console.log(`\n${'─'.repeat(50)}`);
    console.log(`✅ Corrigidos: ${fixedCount} | ❌ Falhas: ${failedCount}`);
    console.log('🎉 Correcção concluída! Recarrega o dashboard.');
}

fixFormData();
