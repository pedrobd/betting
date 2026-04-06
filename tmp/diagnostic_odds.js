const apiKey = "ae0215ddf5msh17b2fb1e99eeb41p1afb26jsn3d1266207e91";
const date = "2026-04-06";

async function diagnostic() {
    console.log("--- DIAGNÓSTICO ODDS (Udinese vs Como) ---");
    
    try {
        // 1. LIST EVENTS TO FIND ID
        const listRes = await fetch(`https://sportapi7.p.rapidapi.com/api/v1/sport/football/scheduled-events/${date}`, {
            headers: { "x-rapidapi-key": apiKey, "x-rapidapi-host": "sportapi7.p.rapidapi.com" }
        });
        const listData = await listRes.json();
        const event = (listData.events || []).find(e => e.homeTeam.name.includes("Udinese"));
        
        if (!event) {
            console.log("ERRO: Jogo não encontrado na SportAPI7");
            return;
        }
        
        console.log(`SUCESSO: Encontrado ID ${event.id} para ${event.homeTeam.name} vs ${event.awayTeam.name}`);
        
        // 2. FETCH FEATURED ODDS
        const oddsRes = await fetch(`https://sportapi7.p.rapidapi.com/api/v1/event/${event.id}/odds/1/featured`, {
            headers: { "x-rapidapi-key": apiKey, "x-rapidapi-host": "sportapi7.p.rapidapi.com" }
        });
        const oddsData = await oddsRes.json();
        
        console.log("ESTRUTURA DE MERCADOS RECEBIDA:");
        oddsData.markets?.forEach(m => {
            console.log(`- Mercado: ${m.marketName}`);
            m.choices?.forEach(c => {
                console.log(`  - ${c.name}: ${c.decimalValue}`);
            });
        });

    } catch (e) {
        console.error("FALHA NO DIAGNÓSTICO:", e.message);
    }
}

diagnostic();
