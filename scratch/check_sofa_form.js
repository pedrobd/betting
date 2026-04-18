

const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json',
    'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.8',
    'Origin': 'https://www.sofascore.com',
    'Referer': 'https://www.sofascore.com/',
    'Cache-Control': 'no-cache',
};
const teamId = 328498; // Francs Borains
(async () => {
    const res = await fetch(`https://api.sofascore.com/api/v1/team/${teamId}/events/last/0`, {headers});
    const eventsData = await res.json();
    const allFinished = (eventsData.events || []).filter(m => m.status?.type === 'finished');
    const lastMatches = allFinished.slice(0, 5);
    
    lastMatches.forEach(m => {
        const homeScore = m.homeScore?.display ?? m.homeScore?.current;
        const awayScore = m.awayScore?.display ?? m.awayScore?.current;
        console.log(`${m.homeTeam.name} ${homeScore} - ${awayScore} ${m.awayTeam.name} (Time: ${new Date(m.startTimestamp * 1000).toISOString()}) - HomeID: ${m.homeTeam.id}, AwayID: ${m.awayTeam.id}`);
    });
})();
