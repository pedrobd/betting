const apiKey = "ae0215ddf5msh17b2fb1e99eeb41p1afb26jsn3d1266207e91";
// DATA CORRIGIDA PARA TESTAR REALIDADE (DOMINGO, 6 DE ABRIL DE 2025)
const date = "2025-04-06"; 
const dateCompact = "20250406";

async function test() {
    const urls = [
        { 
            name: "SportAPI7 (Standard)",
            url: `https://sportapi7.p.rapidapi.com/api/v1/sport/football/scheduled-events/${date}`,
            host: "sportapi7.p.rapidapi.com"
        },
        { 
            name: "Free Football API Data (Corrected Path)",
            url: `https://free-football-api-data.p.rapidapi.com/football-scheduled-events?date=${date}`,
            host: "free-football-api-data.p.rapidapi.com"
        },
        { 
            name: "Soccer Data Live (NEW - Compact Date)",
            url: `https://free-api-live-football-data.p.rapidapi.com/football-get-matches-by-date?date=${dateCompact}`,
            host: "free-api-live-football-data.p.rapidapi.com"
        },
        {
            name: "Sport Highlights API",
            url: `https://sport-highlights-api.p.rapidapi.com/football/fixtures?date=${date}`,
            host: "sport-highlights-api.p.rapidapi.com"
        }
    ];

    for (const item of urls) {
        console.log(`\n--- TESTING: ${item.name} ---`);
        try {
            const res = await fetch(item.url, {
                method: "GET",
                headers: {
                    "x-rapidapi-key": apiKey,
                    "x-rapidapi-host": item.host,
                }
            });

            console.log(`STATUS: ${res.status} ${res.statusText}`);
            const data = await res.json();
            
            // Check for various structures
            const fixtures = data.data || data.response || data.events || [];
            
            if (Array.isArray(fixtures)) {
                console.log(`SUCCESS: Found ${fixtures.length} events!`);
                if (fixtures.length > 0) {
                    fixtures.slice(0, 3).forEach((f, i) => {
                        const home = f.homeTeam?.name || f.teams?.home?.name || f.home_team_name || "Unknown";
                        const away = f.awayTeam?.name || f.teams?.away?.name || f.away_team_name || "Unknown";
                        console.log(`JOGO ${i+1}: ${home} vs ${away}`);
                    });
                }
            } else {
                console.log("RESPONSE IS NOT AN ARRAY. TYPE:", typeof data);
                console.log("RAW DATA (First 200 chars):", JSON.stringify(data).slice(0, 200));
            }
        } catch (e) {
            console.error(`ERROR: ${e.message}`);
        }
    }
}

test();
