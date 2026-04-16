const teams = [
    "Tigre (Arg)",
    "Macara (Ecu)",
    "Lanus (Arg)",
    "Always Ready (Bol)",
    "Atletico-MG (Bra)",
    "Aston Villa",
    "Strasbourg"
];

async function test() {
    for (const name of teams) {
        console.log(`\n--- Testing: ${name} ---`);
        const cleanName = name.replace(/\(.*\)/, '').trim();
        console.log(`Cleaned: ${cleanName}`);
        
        try {
            const res = await fetch(`https://api.sofascore.com/api/v1/search/all?q=${encodeURIComponent(cleanName)}`);
            const data = await res.json();
            const results = data.results.filter(r => r.type === 'team').slice(0, 3);
            
            if (results.length === 0) {
                console.log("❌ No team results found.");
            } else {
                results.forEach((r, i) => {
                    console.log(`${i+1}. ${r.entity.name} (ID: ${r.entity.id}) - Category: ${r.entity.category?.name}`);
                });
            }
        } catch (e) {
            console.error(`Error: ${e.message}`);
        }
    }
}

test();
