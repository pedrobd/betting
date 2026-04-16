/**
 * Reduz o nome da equipa para aumentar as chances de correspondência na pesquisa.
 * Remove (Arg), (Bra), FC, CF, etc.
 */
function cleanTeamName(name) {
    if (!name) return "";
    return name
        .replace(/\(.*\)/g, "") // Remove conteúdo entre parênteses
        .replace(/\b(FC|CF|SC|AC|CD|CA|RC|UD|RS|U20|U19|U17|Reserve|Reserves)\b/gi, "") // Remove siglas comuns
        .trim();
}

/**
 * Motor SofaIntel Pro - Extração de dados via API interna do SofaScore
 */
export async function getTeamStats(teamName) {
    try {
        const cleanedName = cleanTeamName(teamName);
        console.log(`[SOFA] Pesquisando: "${teamName}" -> Clean: "${cleanedName}"`);

        // 1. Pesquisar o ID da equipa (Tentativa 1: Nome Limpo)
        let searchRes = await fetch(`https://api.sofascore.com/api/v1/search/all?q=${encodeURIComponent(cleanedName)}`);
        let searchData = await searchRes.json();
        
        // Filtro rigoroso: Apenas "team" de Futebol (sport id: 1) e evitar U20/Reservas se possível
        let team = searchData.results?.find(r => 
            r.type === 'team' && 
            r.entity?.sport?.id === 1 && 
            !r.entity?.name?.toLowerCase().includes("u20") &&
            !r.entity?.name?.toLowerCase().includes("reserve")
        );

        // Tentativa 2: Nome Original (se a primeira falhar)
        if (!team) {
            searchRes = await fetch(`https://api.sofascore.com/api/v1/search/all?q=${encodeURIComponent(teamName)}`);
            searchData = await searchRes.json();
            team = searchData.results?.find(r => r.type === 'team' && r.entity?.sport?.id === 1);
        }

        if (!team) {
            console.warn(`[SOFA] Equipa não encontrada: ${teamName}`);
            return { pos: 0, form: '?????' };
        }

        const teamId = team.entity.id;
        console.log(`[SOFA] Encontrado: ${team.entity.name} (ID: ${teamId})`);

        // 2. Buscar Forma (Últimos 5 jogos terminados)
        const eventsRes = await fetch(`https://api.sofascore.com/api/v1/team/${teamId}/events/last/0`);
        const eventsData = await eventsRes.json();
        
        // Filtrar apenas por jogos que já terminaram
        const lastMatches = (eventsData.events || [])
            .filter(m => m.status?.type === 'finished')
            .slice(0, 5);
        
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
                // Tenta encontrar a tabela "total" primeiro
                const mainTable = standingsData.standings.find(s => s.type === 'total') || standingsData.standings[0];
                pos = mainTable.rows.find(r => r.team.id === teamId)?.position || 0;
            }
        } catch (e) {
            pos = 0;
        }

        return { pos, form: form || '?????' };
    } catch (error) {
        console.error(`[SOFA] Erro crítico para ${teamName}:`, error.message);
        return { pos: 0, form: '?????' };
    }
}
