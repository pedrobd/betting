/**
 * Motor SofaIntel - Extração de dados via API interna do SofaScore
 * Muito mais estável e rápido que web scraping convencional.
 */

export async function getTeamStats(teamName) {
    try {
        // 1. Pesquisar o ID da equipa
        const searchRes = await fetch(`https://api.sofascore.com/api/v1/search/all?q=${encodeURIComponent(teamName)}`);
        const searchData = await searchRes.json();
        const team = searchData.results.find(r => r.type === 'team');
        
        if (!team) return { pos: 0, form: '?????' };

        const teamId = team.entity.id;

        // 2. Buscar Forma (Últimos 5 jogos)
        const eventsRes = await fetch(`https://api.sofascore.com/api/v1/team/${teamId}/events/last/0`);
        const eventsData = await eventsRes.json();
        const lastMatches = eventsData.events.slice(0, 5);
        
        let form = lastMatches.map(m => {
            if (!m.homeScore || !m.awayScore) return '';
            const isHome = m.homeTeam.id === teamId;
            const myScore = isHome ? m.homeScore.display : m.awayScore.display;
            const oppScore = isHome ? m.awayScore.display : m.homeScore.display;

            if (myScore > oppScore) return 'W';
            if (myScore < oppScore) return 'L';
            return 'D';
        }).join('');

        // 3. Buscar Classificação (Standings)
        let pos = 0;
        try {
            const standingsRes = await fetch(`https://api.sofascore.com/api/v1/team/${teamId}/standings/seasons`);
            const standingsData = await standingsRes.json();
            if (standingsData.standings && standingsData.standings.length > 0) {
                pos = standingsData.standings[0].rows.find(r => r.team.id === teamId)?.position || 0;
            }
        } catch (e) {
            pos = 0;
        }

        return { pos, form: form || '?????' };
    } catch (error) {
        console.error(`[SOFA] Erro ao buscar stats para ${teamName}:`, error.message);
        return { pos: 0, form: '?????' };
    }
}
