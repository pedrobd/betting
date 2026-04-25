/**
 * FotMob data source — form, position, xG
 * Uses FotMob's public JSON API (no auth required).
 */

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.8',
    'Referer': 'https://www.fotmob.com/',
    'Origin': 'https://www.fotmob.com',
};

async function safeFetch(url, timeoutMs = 10000) {
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

function extractTeamId(match, side) {
    // FotMob can use homeTeam or home depending on endpoint version
    return match[`${side}Team`]?.id ?? match[side]?.id ?? null;
}

function extractScore(match, side) {
    const v = match[`${side}Team`]?.score ?? match[side]?.score ?? match[`${side}Score`];
    return v !== undefined && v !== null ? parseInt(v, 10) : NaN;
}

function parseResult(match, teamId) {
    // Direct W/D/L result field (some endpoints provide this)
    const direct = match.result ?? match.matchResult ?? match.outcome;
    if (typeof direct === 'string') {
        const r = direct.toUpperCase();
        if (r === 'W' || r === 'WIN') return 'W';
        if (r === 'L' || r === 'LOSS' || r === 'DEFEAT') return 'L';
        if (r === 'D' || r === 'DRAW') return 'D';
    }

    // Derive from scores
    const homeId = extractTeamId(match, 'home');
    const homeScore = extractScore(match, 'home');
    const awayScore = extractScore(match, 'away');

    if (isNaN(homeScore) || isNaN(awayScore)) return '';

    const isHome = homeId === teamId;
    const my = isHome ? homeScore : awayScore;
    const opp = isHome ? awayScore : homeScore;
    return my > opp ? 'W' : my < opp ? 'L' : 'D';
}

export async function getTeamStats(teamName) {
    try {
        const cleanName = teamName
            .replace(/\(.*?\)/g, '')
            .replace(/\b(FC|CF|SC|AC|CD|CA|RC|UD)\b/gi, '')
            .trim();

        console.log(`[FOTMOB] 🔍 "${cleanName}"`);

        // 1. Search
        const searchData = await safeFetch(
            `https://www.fotmob.com/api/searchTerms?term=${encodeURIComponent(cleanName)}`
        );

        const raw = searchData.teamResult ?? [];

        if (!raw.length) {
            console.warn(`[FOTMOB] ❌ Sem resultados de pesquisa para "${cleanName}"`);
            return defaultStats();
        }

        // Best match by name similarity
        let best = null, bestScore = 0;
        for (const r of raw) {
            const name = r.teamName ?? r.name ?? '';
            const s = similarity(cleanName, name);
            if (s > bestScore) { bestScore = s; best = r; }
        }

        if (!best || bestScore < 0.35) {
            console.warn(`[FOTMOB] ❌ Score baixo (${bestScore.toFixed(2)}) para "${cleanName}"`);
            return defaultStats();
        }

        const teamId = best.teamId ?? best.id;
        console.log(`[FOTMOB] ✅ "${best.teamName ?? best.name}" (ID: ${teamId}, score: ${bestScore.toFixed(2)})`);

        // 2. Team details
        const teamData = await safeFetch(`https://www.fotmob.com/api/teams?id=${teamId}`);

        // 3. Recent matches — FotMob nests under recentResults.allMatches
        const recentMatches = teamData.recentResults?.allMatches ?? [];

        if (recentMatches.length === 0) {
            console.warn(`[FOTMOB] ⚠️ Sem recentResults para ID ${teamId}`);
            // Log the keys available so we can debug structure
            console.warn(`[FOTMOB] Keys disponíveis: ${Object.keys(teamData).join(', ')}`);
            return defaultStats();
        }

        // Log first match to diagnose structure if form is empty
        const sample = recentMatches[0];
        console.log(`[FOTMOB] 🔬 Amostra match: ${JSON.stringify(sample).slice(0, 200)}`);

        const last5 = recentMatches.slice(-5);
        const form = last5.map(m => parseResult(m, teamId)).filter(Boolean).join('');

        const isHomeMatch  = m => extractTeamId(m, 'home') === teamId;
        const homeMatches  = recentMatches.filter(isHomeMatch).slice(-5);
        const awayMatches  = recentMatches.filter(m => !isHomeMatch(m)).slice(-5);
        const homeForm     = homeMatches.map(m => parseResult(m, teamId)).filter(Boolean).join('');
        const awayForm     = awayMatches.map(m => parseResult(m, teamId)).filter(Boolean).join('');

        // 4. xG — match stats (skipped if fotmob match id unavailable)
        let xgFor = [], xgAgainst = [];
        for (const m of last5) {
            const mid = m.id ?? m.matchId;
            if (!mid) continue;
            try {
                const stats = await safeFetch(
                    `https://www.fotmob.com/api/matchDetails?matchId=${mid}`, 6000
                );
                const groups = stats.content?.stats?.Periods?.All?.stats ?? [];
                for (const group of groups) {
                    const xgItem = (group.stats ?? []).find(s =>
                        s.key === 'expected_goals' || s.title?.toLowerCase().includes('xg')
                    );
                    if (xgItem?.stats) {
                        const isHome = extractTeamId(m, 'home') === teamId;
                        const [h, a] = xgItem.stats;
                        const myXg  = parseFloat(isHome ? h : a);
                        const oppXg = parseFloat(isHome ? a : h);
                        if (!isNaN(myXg))  xgFor.push(myXg);
                        if (!isNaN(oppXg)) xgAgainst.push(oppXg);
                        break;
                    }
                }
            } catch (e) { /* xG nem sempre disponível */ }
            await new Promise(r => setTimeout(r, 400));
        }

        const avg = arr => arr.length
            ? parseFloat((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2))
            : 0;

        // 5. League position
        let pos = 0;
        try {
            const tableRows =
                teamData.table?.[0]?.data?.table?.all ??
                teamData.table?.[0]?.tableData?.table?.all ?? [];
            const row = tableRows.find(r => r.id === teamId);
            if (row) pos = row.idx ?? row.position ?? 0;
        } catch (e) { /* standings opcional */ }

        console.log(`[FOTMOB] 📊 Forma: "${form}" | Casa: "${homeForm}" | Fora: "${awayForm}" | xG: ${avg(xgFor)} | Pos: #${pos}`);
        return {
            teamId, pos,
            form, homeForm, awayForm,
            xg: avg(xgFor), xgConceded: avg(xgAgainst),
        };

    } catch (e) {
        console.warn(`[FOTMOB] 💥 ${teamName}: ${e.message}`);
        return defaultStats();
    }
}
