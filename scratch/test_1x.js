import puppeteer from 'puppeteer';

(async () => {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.goto('https://www.flashscore.pt/');
    
    try {
        await page.waitForSelector('.event__match', {timeout: 10000});
        
        const matchIdAttr = await page.evaluate(() => {
            const match = document.querySelector('.event__match');
            return match ? match.getAttribute('id') : null;
        });
        
        if (!matchIdAttr) {
            console.log("No match found");
            process.exit();
        }
        
        const realId = matchIdAttr.replace('g_1_', '');
        console.log("Found match ID:", realId);
        
        await page.goto(`https://www.flashscore.pt/jogo/${realId}/#/comparacao-de-odds/dupla-hipotese/tempo-regulamentar`, {waitUntil: 'networkidle2'});
        
        // Wait for odds to load
        await page.waitForSelector('.ui-table__row', {timeout: 5000}).catch(() => {});
        
        const dcOdds = await page.evaluate(() => {
            const row = document.querySelector('.ui-table__row');
            if (!row) return null;
            
            const odds = row.querySelectorAll('.odds__odd, a.oddsCell__odd');
            return Array.from(odds).map(el => el.innerText.trim());
        });
        
        console.log("Double Chance odds on Double Chance page:", dcOdds);
        
        await page.goto(`https://www.flashscore.pt/jogo/${realId}/#/resumo-de-jogo/resumo-de-jogo`, {waitUntil: 'networkidle2'});
        
        const summaryOdds = await page.evaluate(() => {
            const oddsRow = document.querySelector('.oddsRow');
            if(!oddsRow) return null;
            const odds = oddsRow.querySelectorAll('.oddsValueInner');
            return Array.from(odds).map(el => el.innerText.trim());
        });
        
        console.log("Summary odds (1, X, 2):", summaryOdds);
        
    } catch(e) {
        console.log(e.message);
    }
    
    await browser.close();
})();
