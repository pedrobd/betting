/**
 * SofaIntel Pro v4 - xG + Forma + Posição
 * Headers de browser, matching por similaridade, standings corretos.
 */

const SOFA_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json',
    'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.8',
    'Origin': 'https://www.sofascore.com',
    'Referer': 'https://www.sofascore.com/',
    'Cache-Control': 'no-cache',
};

const COUNTRY_MAP = {
    'arg': 'argentina', 'bra': 'brazil', 'ecu': 'ecuador',
    'uru': 'uruguay', 'bol': 'bolivia', 'per': 'peru',
    'par': 'paraguay', 'chi': 'chile', 'ven': 'venezuela',
    'col': 'colombia', 'por': 'portugal', 'esp': 'spain',
    'fra': 'france', 'eng': 'england', 'ger': 'germany',
    'ita': 'italy', 'ned': 'netherlands', 'bel': 'belgium',
    'tur': 'turkey', 'mex': 'mexico', 'usa': 'united states',
    'jpn': 'japan', 'kor': 'korea', 'chn': 'china',
    'sco': 'scotland', 'wal': 'wales', 'irl': 'ireland',
    'den': 'denmark', 'swe': 'sweden', 'nor': 'norway',
    'ukr': 'ukraine', 'pol': 'poland', 'cro': 'croatia',
    'srb': 'serbia', 'aut': 'austria', 'swi': 'switzerland',
    'gre': 'greece', 'cze': 'czech republic', 'rom': 'romania',
    'mor': 'morocco', 'egy': 'egypt', 'gha': 'ghana', 'nig': 'nigeria',
};

function parseTeamInfo(name) {
    const countryMatch = name.match(/\((.*?)\)/);
    const countryHint = countryMatch ? countryMatch[1].toLowerCase() : null;
    const cleanName = name
        .replace(/\(.*?\)/g, '')
        .replace(/\b(FC|CF|SC|AC|CD|CA|RC|UD|RS|U20|U19|U17|U23|Reserve|Reserves|B|II)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
    return { cleanName, countryHint };
}

async function safeFetch(url, timeoutMs = 15000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { headers: SOFA_HEADERS, signal: controller.signal });
        clearTimeout(timer);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } catch (e) {
        clearTimeout(timer);
        throw e;
    }
}

function stringSimilarity(a, b) {
    a = a.toLowerCase().replace(/[^a-z0-9]/g, '');
    b = b.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (a === b) return 1;
    if (a.includes(b) || b.includes(a)) return 0.8;
    const getBigrams = s => {
        const bigrams = new Set();
        for (let i = 0; i < s.length - 1; i++) bigrams.add(s.slice(i, i + 2));
        return bigrams;
    };
    const setA = getBigrams(a);
    const setB = getBigrams(b);
    const intersection = [...setA].filter(x => setB.has(x)).length;
    return (2 * intersection) / (setA.size + setB.size);
}

/**
 * Busca xG médio de uma equipa nos últimos jogos.
 * @param {number} teamId - ID da equipa no SofaScore
 * @param {Array} events - Últimos eventos terminados (com event.id)
 * @returns {number} xG médio arredondado a 2 casas
 */
async function fetchTeamXG(teamId, events) {
    const xgFor = [];
    const xgAgainst = [];

    for (const event of events.slice(0, 3)) {
        try {
            const statsData = await safeFetch(`https://api.sofascore.com/api/v1/event/${event.id}/statistics`, 5000);
            const periods = statsData.statistics || [];
            const allPeriod = periods.find(p => p.period === 'ALL') || periods[0];
            if (!allPeriod) continue;

            for (const group of (allPeriod.groups || [])) {
                const xgItem = (group.statisticsItems || []).find(item =>
                    item.name?.toLowerCase().includes('expected goals') ||
                    item.name?.toLowerCase().includes('xg') ||
                    item.name?.toLowerCase() === 'xg'
                );
                if (xgItem) {
                    const isHome = event.homeTeam?.id === teamId;
                    const myVal = parseFloat(isHome ? xgItem.home : xgItem.away);
                    const oppVal = parseFloat(isHome ? xgItem.away : xgItem.home);
                    if (!isNaN(myVal)) xgFor.push(myVal);
                    if (!isNaN(oppVal)) xgAgainst.push(oppVal);
                    break;
                }
            }
        } catch (e) { /* xG nem sempre disponível */ }
        await new Promise(r => setTimeout(r, 300));
    }

    const avg = (arr) => arr.length > 0 ? parseFloat((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2)) : 0;
    return { xg: avg(xgFor), xgConceded: avg(xgAgainst) };
}

/**
 * Motor principal: busca forma, posição e xG de uma equipa.
 */
export async function getTeamStats(teamName) {
    try {
        const { cleanName, countryHint } = parseTeamInfo(teamName);
        console.log(`[SOFA] 🔍 Pesquisando: "${teamName}" → "${cleanName}", país: "${countryHint}"`);

        // Pesquisa em cascata
        const queries = [cleanName, teamName.replace(/\(.*?\)/g, '').trim()];
        let bestTeam = null;
        let bestScore = 0;

        for (const query of queries) {
            if (bestTeam) break;
            let searchData;
            try {
                searchData = await safeFetch(`https://api.sofascore.com/api/v1/search/all?q=${encodeURIComponent(query)}`);
            } catch (e) {
                console.warn(`[SOFA] ⚠️ Falha na pesquisa "${query}": ${e.message}`);
                continue;
            }

            const results = (searchData.results || []).filter(r => {
                if (r.type !== 'team' || r.entity?.sport?.id !== 1) return false;
                if (/u\d{2}|u-\d{2}|reserve|sub-|youth|juvenil/i.test(r.entity.name || '')) return false;
                return true;
            });

            for (const r of results) {
                let score = stringSimilarity(cleanName, r.entity.name);
                if (countryHint && r.entity.country) {
                    const countryName = r.entity.country.name?.toLowerCase() || '';
                    const targetCountry = COUNTRY_MAP[countryHint] || countryHint;
                    if (countryName.includes(targetCountry) || targetCountry.includes(countryName)) {
                        score += 0.3;
                    } else {
                        score -= 0.2;
                    }
                }
                if (score > bestScore) { bestScore = score; bestTeam = r; }
            }
        }

        if (!bestTeam || bestScore < 0.3) {
            console.warn(`[SOFA] ❌ Não encontrado: "${teamName}" (score: ${bestScore.toFixed(2)})`);
            return { pos: 0, form: '', homeForm: '', awayForm: '', xg: 0, xgConceded: 0 };
        }

        const teamId = bestTeam.entity.id;
        console.log(`[SOFA] ✅ ${bestTeam.entity.name} (ID: ${teamId}, score: ${bestScore.toFixed(2)})`);

        // Buscar eventos + forma + xG
        let form = '';
        let homeForm = '';
        let awayForm = '';
        let xg = 0;
        let xgConceded = 0;
        let tournamentId = null;
        let seasonId = null;

        const getResult = (m, id) => {
            const hs = m.homeScore?.display ?? m.homeScore?.current ?? m.homeScore?.normaltime;
            const as = m.awayScore?.display ?? m.awayScore?.current ?? m.awayScore?.normaltime;
            if (hs == null || as == null) return '';
            const isHome = m.homeTeam.id === id;
            const my = isHome ? hs : as;
            const opp = isHome ? as : hs;
            return my > opp ? 'W' : my < opp ? 'L' : 'D';
        };

        try {
            const eventsData = await safeFetch(`https://api.sofascore.com/api/v1/team/${teamId}/events/last/0`);
            const allFinished = (eventsData.events || []).filter(m => m.status?.type === 'finished');
            const lastMatches = allFinished.slice(-5);

            // Torneio e época para standings
            const domesticEvent = allFinished.find(m => m.tournament?.uniqueTournament?.id && m.season?.id);
            if (domesticEvent) {
                tournamentId = domesticEvent.tournament.uniqueTournament.id;
                seasonId = domesticEvent.season.id;
            }

            // Forma geral + casa/fora separadas
            form = lastMatches.map(m => getResult(m, teamId)).filter(Boolean).join('');
            homeForm = allFinished.filter(m => m.homeTeam.id === teamId).slice(-5).map(m => getResult(m, teamId)).filter(Boolean).join('');
            awayForm = allFinished.filter(m => m.awayTeam.id === teamId).slice(-5).map(m => getResult(m, teamId)).filter(Boolean).join('');

            // xG médio (ataque) + xG concedido (defesa)
            const xgResult = await fetchTeamXG(teamId, lastMatches.map(m => ({
                id: m.id,
                homeTeam: m.homeTeam,
            })));
            xg = xgResult.xg;
            xgConceded = xgResult.xgConceded;

            console.log(`[SOFA] 📊 Forma: "${form}" | Casa: "${homeForm}" | Fora: "${awayForm}" | xG: ${xg} (concedido: ${xgConceded})`);
        } catch (e) {
            console.warn(`[SOFA] ⚠️ Erro ao buscar eventos: ${e.message}`);
        }

        // Posição na classificação
        let pos = 0;
        if (tournamentId && seasonId) {
            try {
                const standUrl = `https://api.sofascore.com/api/v1/unique-tournament/${tournamentId}/season/${seasonId}/standings/total`;
                const standingsData = await safeFetch(standUrl);
                for (const table of (standingsData.standings || [])) {
                    const row = (table.rows || []).find(r => r.team?.id === teamId);
                    if (row) { pos = row.position; break; }
                }
                console.log(`[SOFA] 🏆 Posição: #${pos}`);
            } catch (e) {
                console.warn(`[SOFA] ⚠️ Erro standings: ${e.message}`);
            }
        }

        return { teamId, pos, form: form || '', homeForm: homeForm || '', awayForm: awayForm || '', xg, xgConceded };

    } catch (error) {
        console.error(`[SOFA] 💥 Erro crítico (${teamName}):`, error.message);
        return { teamId: null, pos: 0, form: '', homeForm: '', awayForm: '', xg: 0, xgConceded: 0 };
    }
}

/**
 * Busca últimos 5 confrontos directos entre duas equipas.
 * Resultados da perspectiva da equipa casa (homeTeamId).
 */
export async function getH2H(homeTeamId, awayTeamId) {
    try {
        const data = await safeFetch(
            `https://api.sofascore.com/api/v1/team/${homeTeamId}/team/${awayTeamId}/events/last/0`,
            10000
        );
        const finished = (data.events || []).filter(e => e.status?.type === 'finished');
        return finished.slice(-5).map(e => {
            const homeScore = e.homeScore?.display ?? e.homeScore?.current ?? 0;
            const awayScore = e.awayScore?.display ?? e.awayScore?.current ?? 0;
            const wasHome = e.homeTeam?.id === homeTeamId;
            const myScore = wasHome ? homeScore : awayScore;
            const oppScore = wasHome ? awayScore : homeScore;
            const result = myScore > oppScore ? 'W' : myScore < oppScore ? 'L' : 'D';
            return {
                home: e.homeTeam?.name || '',
                away: e.awayTeam?.name || '',
                score: `${homeScore}-${awayScore}`,
                result
            };
        });
    } catch (e) {
        console.warn(`[SOFA] ⚠️ H2H falhou: ${e.message}`);
        return [];
    }
}
