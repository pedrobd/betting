import puppeteer from 'puppeteer';

async function debugH2H() {
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 1000 });
    
    const url = 'https://www.flashscore.pt/jogo/nJz1sa9F/#/h2h/overall'; // Arsenal vs Sporting
    console.log("Abrindo H2H:", url);
    await page.goto(url, { waitUntil: 'networkidle2' });
    
    await new Promise(r => setTimeout(r, 4000));
    
    // Tirar screenshot
    await page.screenshot({ path: 'scratch/h2h_view.png' });
    console.log("Screenshot salva em scratch/h2h_view.png");
    
    const data = await page.evaluate(() => {
        // Tenta encontrar secções de forma (W, D, L)
        const formIcons = document.querySelectorAll('.h2h__result');
        return {
            iconsCount: formIcons.length,
            htmlSnippet: document.querySelector('.h2h__section')?.innerText.slice(0, 200) || 'Nao achou .h2h__section'
        };
    });
    
    console.log("H2H Debug Info:", data);
    await browser.close();
}

debugH2H();
