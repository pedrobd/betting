import { UniversalAPIClient } from './lib/core/universal-api';

async function testParsing() {
    const client = new UniversalAPIClient();
    const mockGames = [
        { home: 'A', away: 'B', time: '14:30' },
        { home: 'C', away: 'D', time: '11.04. 18:00' },
        { home: 'E', away: 'F', time: 'Adiado' }, // This might crash it
        { home: 'G', away: 'H', time: null }
    ];

    console.log("Testing date parsing...");
    
    for (const g of mockGames) {
        try {
            // @ts-ignore - reaching into private data for test if needed, 
            // but here we just test the mapping logic if it was exposed or we mock the scanner
            console.log(`Testing game: ${g.home} vs ${g.away} | Time: ${g.time}`);
            
            // Mocking the scanner behavior for individual games
            let startTime = g.time || new Date().toISOString();
            const today = '2026-04-11';
            const currentYear = 2026;

            if (g.time && g.time.includes(":") && g.time.length <= 5) {
                startTime = `${today}T${g.time}:00Z`;
            } 
            else if (g.time && g.time.includes(".") && g.time.includes(":")) {
                const parts = g.time.split(" ");
                if (parts.length >= 2) {
                    const dateParts = parts[0].split(".");
                    const timeParts = parts[1].split(":");
                    if (dateParts.length >= 2 && timeParts.length >= 2) {
                        const d = new Date(currentYear, parseInt(dateParts[1]) - 1, parseInt(dateParts[0]), parseInt(timeParts[0]), parseInt(timeParts[1]));
                        if (!isNaN(d.getTime())) {
                            if (d.getFullYear() < 2026) d.setFullYear(2026);
                            startTime = d.toISOString();
                        }
                    }
                }
            }
            
            console.log(`Result: ${startTime}`);
        } catch (e: any) {
            console.error(`❌ CRASHED on ${g.home}: ${e.message}`);
        }
    }
}

testParsing();
