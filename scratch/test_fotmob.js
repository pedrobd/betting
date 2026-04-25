/**
 * Debug: inspect FotMob API response structure for a known team
 * Usage: node --env-file=.env.local scratch/test_fotmob.js
 */

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.8',
    'Referer': 'https://www.fotmob.com/',
    'Origin': 'https://www.fotmob.com',
};

async function safeFetch(url) {
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
    return res.json();
}

function toDateStr(date) {
    return `${date.getFullYear()}${String(date.getMonth()+1).padStart(2,'0')}${String(date.getDate()).padStart(2,'0')}`;
}

async function main() {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    console.log('=== Matches hoje ===');
    const todayData = await safeFetch(`https://www.fotmob.com/api/matches?date=${toDateStr(today)}`);
    console.log('Top-level keys:', Object.keys(todayData));
    const leagues = todayData.leagues ?? [];
    console.log(`Ligas: ${leagues.length}`);
    if (leagues.length > 0) {
        const firstMatch = leagues[0]?.matches?.[0];
        if (firstMatch) {
            console.log('\nEstrutura de um jogo:');
            console.log(JSON.stringify(firstMatch, null, 2).slice(0, 800));
        }
    }

    // Find a team with matches today or tomorrow and fetch its details
    let teamId = null, teamName = null;
    outer:
    for (const data of [todayData]) {
        for (const league of (data.leagues ?? [])) {
            for (const match of (league.matches ?? [])) {
                for (const side of ['home', 'away', 'homeTeam', 'awayTeam']) {
                    const t = match[side];
                    if (t?.id && (t.name || t.shortName)) {
                        teamId = t.id;
                        teamName = t.name ?? t.shortName;
                        break outer;
                    }
                }
            }
        }
    }

    if (!teamId) {
        console.log('\n❌ Nenhuma equipa encontrada nos jogos de hoje');
        return;
    }

    console.log(`\n=== Team data para "${teamName}" (id=${teamId}) ===`);
    const teamData = await safeFetch(`https://www.fotmob.com/api/teams?id=${teamId}`);
    console.log('Top-level keys:', Object.keys(teamData));

    // Show recentResults structure
    const rr = teamData.recentResults ?? teamData.recentResultsForTeam ?? teamData.latestMatches;
    if (rr) {
        console.log('\nrecentResults keys:', Object.keys(rr));
        const matches = rr.allMatches ?? rr.matches ?? rr;
        console.log(`Matches count: ${Array.isArray(matches) ? matches.length : 'N/A'}`);
        if (Array.isArray(matches) && matches.length > 0) {
            console.log('\nPrimeiro match em recentResults:');
            console.log(JSON.stringify(matches[0], null, 2).slice(0, 600));
        }
    } else {
        console.log('\n⚠️  Nenhum recentResults encontrado');
        // Show full top-level structure for debugging
        for (const key of Object.keys(teamData).slice(0, 6)) {
            const val = teamData[key];
            if (val && typeof val === 'object') {
                console.log(`\n${key}:`, JSON.stringify(val, null, 2).slice(0, 300));
            }
        }
    }

    // Show table structure
    if (teamData.table) {
        console.log('\ntable[0] keys:', Object.keys(teamData.table?.[0] ?? {}));
    }
}

main().catch(e => console.error('💥', e.message));
