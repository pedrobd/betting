/**
 * FotMob data source — form, position, xG
 *
 * Strategy: fetch today's + tomorrow's match lists to build a teamName→teamId map.
 * Then fetch team details per team for historical form and standings.
 */

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.8',
    'Referer': 'https://www.fotmob.com/',
    'Origin': 'https://www.fotmob.com',
};

async function safeFetch(url, timeoutMs = 12000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { headers: HEADERS, signal: controller.signal });
        clearTimeout(timer);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } catch (e) {
        clearTimeout(timer);
        throw e;
    }
}

function similarity(a, b) {
    a = a.toLowerCase().replace(/[^a-z0-9]/g, '');
    b = b.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!a || !b) return 0;
    if (a === b) return 1;
    if (b.includes(a) || a.includes(b)) return 0.85;
    const bigrams = s => { const r = new Set(); for (let i = 0; i < s.length - 1; i++) r.add(s.slice(i, i+2)); return r; };
    const setA = bigrams(a), setB = bigrams(b);
    const inter = [...setA].filter(x => setB.has(x)).length;
    return (2 * inter) / (setA.size + setB.size || 1);
}

function defaultStats() {
    return { teamId: null, pos: 0, form: '', homeForm: '', awayForm: '', xg: 0, xgConceded: 0 };
}

// Cache: built once per sync run
let _teamMapDate = '';
let _teamMap = {}; // cleaned_name → { id, name }

function toDateStr(date) {
    return `${date.getFullYear()}${String(date.getMonth()+1).padStart(2,'0')}${String(date.getDate()).padStart(2,'0')}`;
}

function indexMatchesFromResponse(data, map) {
    for (const league of (data.leagues ?? [])) {
        for (const match of (league.matches ?? [])) {
            // FotMob uses home/away or homeTeam/awayTeam depending on endpoint version
            for (const side of ['home', 'away', 'homeTeam', 'awayTeam']) {
                const t = match[side];
                if (t?.id && (t.name || t.shortName || t.longName)) {
                    const name = t.name ?? t.longName ?? t.shortName;
                    const key = name.toLowerCase().replace(/[^a-z0-9]/g, '');
                    if (!map[key]) map[key] = { id: t.id, name };
                    // also index short name variant
                    if (t.shortName) {
                        const sk = t.shortName.toLowerCase().replace(/[^a-z0-9]/g, '');
                        if (!map[sk]) map[sk] = { id: t.id, name };
                    }
                }
            }
        }
    }
}

async function buildTeamMap() {
    const today = new Date();
    const dateStr = toDateStr(today);
    if (_teamMapDate === dateStr && Object.keys(_teamMap).length > 0) return _teamMap;

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = toDateStr(tomorrow);

    _teamMap = {};

    const dates = [dateStr, tomorrowStr];
    for (const d of dates) {
        console.log(`[FOTMOB] 📅 A carregar jogos de ${d}...`);
        try {
            const data = await safeFetch(`https://www.fotmob.com/api/matches?date=${d}`);
            indexMatchesFromResponse(data, _teamMap);
        } catch (e) {
            console.warn(`[FOTMOB] ⚠️ Falha ao carregar jogos de ${d}: ${e.message}`);
        }
    }

    _teamMapDate = dateStr;
    console.log(`[FOTMOB] 📋 ${Object.keys(_teamMap).length} equipas indexadas (hoje + amanhã)`);
    return _teamMap;
}

function findTeamInMap(teamName, teamMap) {
    const cleanName = teamName
        .replace(/\(.*?\)/g, '')
        .replace(/\b(FC|CF|SC|AC|CD|CA|RC|UD|SL|FK|SK|NK|BK|IF|IK|GIF|AIK)\b/gi, '')
        .replace(/\s+/g, ' ').trim();

    let best = null, bestScore = 0;
    for (const [, team] of Object.entries(teamMap)) {
        const s = similarity(cleanName, team.name);
        if (s > bestScore) { bestScore = s; best = team; }
    }
    return bestScore >= 0.5 ? { team: best, score: bestScore } : null;
}

function extractScore(match, side) {
    const v = match[`${side}Team`]?.score
        ?? match[`${side}Team`]?.scoreStr
        ?? match[side]?.score
        ?? match[`${side}Score`];
    const n = parseInt(v, 10);
    return isNaN(n) ? NaN : n;
}

function getTeamIdFromMatch(match, side) {
    return match[`${side}Team`]?.id ?? match[side]?.id ?? null;
}

function parseResult(match, teamId) {
    const direct = match.result ?? match.matchResult ?? match.outcome;
    if (typeof direct === 'string') {
        const r = direct.toUpperCase();
        if (r === 'W' || r === 'WIN')   return 'W';
        if (r === 'L' || r === 'LOSS')  return 'L';
        if (r === 'D' || r === 'DRAW')  return 'D';
    }
    const homeId    = getTeamIdFromMatch(match, 'home');
    const homeScore = extractScore(match, 'home');
    const awayScore = extractScore(match, 'away');
    if (isNaN(homeScore) || isNaN(awayScore)) return '';
    const isHome = homeId === teamId;
    const my  = isHome ? homeScore : awayScore;
    const opp = isHome ? awayScore : homeScore;
    return my > opp ? 'W' : my < opp ? 'L' : 'D';
}

function extractRecentMatches(teamData) {
    // Try all known paths for recent results in FotMob team response
    return teamData.recentResults?.allMatches
        ?? teamData.recentResultsForTeam?.allMatches
        ?? teamData.recentResults?.matches
        ?? teamData.latestMatches
        ?? teamData.matches?.allMatches
        ?? [];
}

export async function getTeamStats(teamName) {
    try {
        const teamMap = await buildTeamMap();
        const found = findTeamInMap(teamName, teamMap);

        if (!found) {
            console.warn(`[FOTMOB] ❌ "${teamName}" não encontrado no mapa`);
            return defaultStats();
        }

        const { team, score } = found;
        console.log(`[FOTMOB] ✅ "${teamName}" → "${team.name}" (ID: ${team.id}, score: ${score.toFixed(2)})`);

        const teamData = await safeFetch(`https://www.fotmob.com/api/teams?id=${team.id}`);

        const recentMatches = extractRecentMatches(teamData);

        if (recentMatches.length === 0) {
            const topKeys = Object.keys(teamData).slice(0, 10).join(', ');
            console.warn(`[FOTMOB] ⚠️ Sem recentResults para "${team.name}" — top keys: ${topKeys}`);
            return defaultStats();
        }

        const last5 = recentMatches.slice(-5);
        const form  = last5.map(m => parseResult(m, team.id)).filter(Boolean).join('');

        const isHomeMatch = m => getTeamIdFromMatch(m, 'home') === team.id;
        const homeForm = recentMatches.filter(isHomeMatch).slice(-5)
            .map(m => parseResult(m, team.id)).filter(Boolean).join('');
        const awayForm = recentMatches.filter(m => !isHomeMatch(m)).slice(-5)
            .map(m => parseResult(m, team.id)).filter(Boolean).join('');

        // xG from match stats (best effort)
        let xgFor = [], xgAgainst = [];
        for (const m of last5) {
            const mid = m.id ?? m.matchId;
            if (!mid) continue;
            try {
                const stats = await safeFetch(`https://www.fotmob.com/api/matchDetails?matchId=${mid}`, 6000);
                const groups = stats.content?.stats?.Periods?.All?.stats ?? [];
                for (const group of groups) {
                    const xgItem = (group.stats ?? []).find(s =>
                        s.key === 'expected_goals' || s.title?.toLowerCase().includes('xg')
                    );
                    if (xgItem?.stats) {
                        const isHome = getTeamIdFromMatch(m, 'home') === team.id;
                        const [h, a] = xgItem.stats;
                        const myXg  = parseFloat(isHome ? h : a);
                        const oppXg = parseFloat(isHome ? a : h);
                        if (!isNaN(myXg))  xgFor.push(myXg);
                        if (!isNaN(oppXg)) xgAgainst.push(oppXg);
                        break;
                    }
                }
            } catch (_) { /* xG opcional */ }
            await new Promise(r => setTimeout(r, 300));
        }

        const avg = arr => arr.length
            ? parseFloat((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2))
            : 0;

        // League position
        let pos = 0;
        try {
            const tableRows =
                teamData.table?.[0]?.data?.table?.all ??
                teamData.table?.[0]?.tableData?.table?.all ??
                teamData.tableData?.table?.all ?? [];
            const row = tableRows.find(r => r.id === team.id);
            if (row) pos = row.idx ?? row.position ?? 0;
        } catch (_) {}

        console.log(`[FOTMOB] 📊 Forma: "${form}" | Casa: "${homeForm}" | Fora: "${awayForm}" | xG: ${avg(xgFor)} | Pos: #${pos}`);
        return { teamId: team.id, pos, form, homeForm, awayForm, xg: avg(xgFor), xgConceded: avg(xgAgainst) };

    } catch (e) {
        console.warn(`[FOTMOB] 💥 ${teamName}: ${e.message}`);
        return defaultStats();
    }
}
