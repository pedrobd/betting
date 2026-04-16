/**
 * BetMask Backtesting Engine v1
 * ─────────────────────────────
 * Busca as previsões passadas da DB, tenta descobrir o resultado
 * real via SofaScore, e calcula métricas de ROI reais.
 *
 * Executar: node --env-file=.env.local scratch/backtest.js
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

const SOFA_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/json',
    'Origin': 'https://www.sofascore.com',
    'Referer': 'https://www.sofascore.com/',
};

async function safeFetch(url) {
    const res = await fetch(url, { headers: SOFA_HEADERS });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

/**
 * Tenta encontrar o resultado de um jogo no SofaScore.
 * Retorna 1 (casa ganhou), 0 (empate ou fora ganhou), ou null (não encontrado)
 */
async function lookupResult(teamHome, teamAway) {
    try {
        // Pesquisar a equipa da casa
        const search = await safeFetch(
            `https://api.sofascore.com/api/v1/search/all?q=${encodeURIComponent(teamHome.replace(/\(.*\)/g, '').trim())}`
        );

        const teamResult = (search.results || []).find(r =>
            r.type === 'team' && r.entity?.sport?.id === 1
        );
        if (!teamResult) return null;

        const teamId = teamResult.entity.id;

        // Buscar últimos jogos terminados
        const events = await safeFetch(
            `https://api.sofascore.com/api/v1/team/${teamId}/events/last/0`
        );

        const finished = (events.events || []).filter(e => e.status?.type === 'finished');

        // Tentar fazer match pelo nome do adversário
        const match = finished.find(e => {
            const awayName = (e.awayTeam?.name || '').toLowerCase();
            const homeName = (e.homeTeam?.name || '').toLowerCase();
            const searchAway = teamAway.replace(/\(.*\)/g, '').trim().toLowerCase();
            return awayName.includes(searchAway.slice(0, 5)) ||
                   homeName.includes(searchAway.slice(0, 5));
        });

        if (!match) return null;

        // Determinar resultado (da perspetiva da equipa home)
        const isHome = match.homeTeam.id === teamId;
        const myScore = isHome ? match.homeScore.display : match.awayScore.display;
        const oppScore = isHome ? match.awayScore.display : match.homeScore.display;

        if (myScore > oppScore) return 1;  // casa ganhou ✅
        if (myScore < oppScore) return 0;  // fora ganhou ❌
        return 0.5;                         // empate (consideramos perda para 1X2)

    } catch (e) {
        return null;
    }
}

// ─── Cálculo Kelly Criterion ──────────────────────────────────────────────────
function kellyStake(odd, confidence, bankroll, fraction = 0.25) {
    const p = confidence / 100;
    const q = 1 - p;
    const b = odd - 1;
    const kelly = (b * p - q) / b;
    const fractional = Math.max(0, kelly * fraction); // Kelly fracionado (25%)
    return parseFloat((bankroll * fractional).toFixed(2));
}

// ─── Motor Principal ──────────────────────────────────────────────────────────
async function runBacktest() {
    console.log('📊 BetMask Backtesting Engine v1\n' + '═'.repeat(55));

    // 1. Buscar previsões dos últimos 7 dias
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: predictions, error } = await supabase
        .from('betting_predictions')
        .select('*')
        .gt('created_at', cutoff)
        .order('confidence', { ascending: false });

    if (error || !predictions?.length) {
        console.error('❌ Erro ao ler previsões:', error?.message || 'Sem dados');
        process.exit(1);
    }

    console.log(`\n🗂️  ${predictions.length} previsões encontradas (últimos 7 dias)\n`);

    // 2. Simular estratégias
    const strategies = {
        flat: { name: 'Flat Stake (10€)', bankroll: 100, stake: 10 },
        kelly: { name: 'Kelly Fracionado (25%)', bankroll: 100, stake: 0 },
        valueBetOnly: { name: 'Apenas Value Bets (flat 10€)', bankroll: 100, stake: 10 },
        highConf: { name: 'Alta Confiança >70% (flat 10€)', bankroll: 100, stake: 10 },
    };

    const results = {
        total: 0, found: 0, wins: 0, losses: 0, skipped: 0,
        bets: []
    };

    console.log('🔍 A descobrir resultados reais...\n');

    for (const pred of predictions) {
        const result = await lookupResult(pred.team_home, pred.team_away);

        if (result === null) {
            results.skipped++;
            continue;
        }

        results.total++;
        const won = result === 1;
        if (won) results.wins++; else results.losses++;

        const bet = {
            home: pred.team_home,
            away: pred.team_away,
            odd: parseFloat(pred.odd),
            confidence: parseFloat(pred.confidence),
            ev: parseFloat(pred.ev || 0),
            isValueBet: pred.is_value_bet,
            won,
        };

        // Flat stake
        strategies.flat.bankroll += won
            ? strategies.flat.stake * (bet.odd - 1)
            : -strategies.flat.stake;

        // Kelly
        const ks = kellyStake(bet.odd, bet.confidence, strategies.kelly.bankroll);
        strategies.kelly.bankroll += won
            ? ks * (bet.odd - 1)
            : -ks;

        // Value bets only
        if (pred.is_value_bet) {
            strategies.valueBetOnly.bankroll += won
                ? strategies.valueBetOnly.stake * (bet.odd - 1)
                : -strategies.valueBetOnly.stake;
        }

        // High confidence only
        if (pred.confidence > 70) {
            strategies.highConf.bankroll += won
                ? strategies.highConf.stake * (bet.odd - 1)
                : -strategies.highConf.stake;
        }

        results.bets.push(bet);
        await new Promise(r => setTimeout(r, 400));
    }

    // 3. Relatório Final
    console.log('\n' + '═'.repeat(55));
    console.log('📈 RESULTADOS DO BACKTESTING\n');

    const winRate = results.total > 0 ? (results.wins / results.total * 100).toFixed(1) : 0;
    const avgOdd = results.bets.length > 0
        ? (results.bets.reduce((a, b) => a + b.odd, 0) / results.bets.length).toFixed(2)
        : 0;
    const avgConf = results.bets.length > 0
        ? (results.bets.reduce((a, b) => a + b.confidence, 0) / results.bets.length).toFixed(1)
        : 0;

    console.log(`📊 Apostas analisadas : ${results.total}`);
    console.log(`🔍 Não encontradas    : ${results.skipped}`);
    console.log(`✅ Vitórias           : ${results.wins} (${winRate}%)`);
    console.log(`❌ Derrotas           : ${results.losses}`);
    console.log(`🎯 Odd média          : ${avgOdd}`);
    console.log(`📡 Confiança média    : ${avgConf}%`);
    console.log(`💎 Value Bets         : ${results.bets.filter(b => b.isValueBet).length}`);

    const valueBetWins = results.bets.filter(b => b.isValueBet && b.won).length;
    const valueBetTotal = results.bets.filter(b => b.isValueBet).length;
    if (valueBetTotal > 0) {
        console.log(`   ↳ Win rate Value Bets: ${(valueBetWins / valueBetTotal * 100).toFixed(1)}%`);
    }

    console.log('\n' + '─'.repeat(55));
    console.log('💰 SIMULAÇÃO DE BANKROLL (início: 100€)\n');

    for (const [key, strat] of Object.entries(strategies)) {
        const roi = ((strat.bankroll - 100) / 100 * 100).toFixed(1);
        const sign = strat.bankroll >= 100 ? '📈' : '📉';
        console.log(`${sign} ${strat.name}`);
        console.log(`   Bankroll final: ${strat.bankroll.toFixed(2)}€ | ROI: ${roi >= 0 ? '+' : ''}${roi}%\n`);
    }

    // 4. Top 5 melhores apostas identificadas
    const valueBetsFound = results.bets
        .filter(b => b.isValueBet && b.won)
        .sort((a, b) => b.ev - a.ev)
        .slice(0, 5);

    if (valueBetsFound.length > 0) {
        console.log('─'.repeat(55));
        console.log('💎 TOP VALUE BETS CONFIRMADAS:\n');
        valueBetsFound.forEach((b, i) => {
            console.log(`${i + 1}. ${b.home} | Odd: ${b.odd} | EV: +${b.ev}% | Conf: ${b.confidence}%`);
        });
    }

    // 5. Calibração do modelo
    if (results.bets.length > 5) {
        console.log('\n─'.repeat(55));
        console.log('🔬 CALIBRAÇÃO DO MODELO:\n');

        const buckets = [
            { label: '50-60%', min: 50, max: 60 },
            { label: '60-70%', min: 60, max: 70 },
            { label: '70-80%', min: 70, max: 80 },
            { label: '80-90%', min: 80, max: 90 },
            { label: '90%+',   min: 90, max: 100 },
        ];

        for (const bucket of buckets) {
            const inBucket = results.bets.filter(b =>
                b.confidence >= bucket.min && b.confidence < bucket.max
            );
            if (inBucket.length === 0) continue;
            const bucketWins = inBucket.filter(b => b.won).length;
            const actual = (bucketWins / inBucket.length * 100).toFixed(0);
            const predicted = ((bucket.min + bucket.max) / 2).toFixed(0);
            const diff = actual - predicted;
            const calibIcon = Math.abs(diff) < 10 ? '✅' : (diff > 0 ? '⬆️ ' : '⬇️ ');
            console.log(`${calibIcon} Confiança ${bucket.label}: Previsto ~${predicted}% | Real ${actual}% (${inBucket.length} apostas)`);
        }
    }

    console.log('\n' + '═'.repeat(55));
    console.log('✅ Backtesting concluído!');
}

runBacktest();
