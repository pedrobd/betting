import puppeteer from 'puppeteer';

async function debugDetail() {
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    
    const url = 'https://www.flashscore.pt/jogo/nJz1sa9F/#/resumo-jogo'; // Arsenal vs Sporting
    console.log("Abrindo jogo:", url);
    await page.goto(url, { waitUntil: 'networkidle2' });
    
    await new Promise(r => setTimeout(r, 4000));
    
    // Tirar screenshot para ver o que o Puppeteer vê
    await page.screenshot({ path: 'scratch/detail_view.png' });
    console.log("Screenshot salva em scratch/detail_view.png");
    
    const content = await page.evaluate(() => {
        // Tenta encontrar todos os números que pareçam odds
        const allText = document.body.innerText;
        const potentialOdds = allText.match(/\b[1-9]\.[0-9]{2}\b/g);
        return {
            title: document.title,
            potentialOdds: potentialOdds ? potentialOdds.slice(0, 10) : [],
            htmlSnippet: document.querySelector('.oddsValue')?.outerHTML || 'Nao achou .oddsValue'
        };
    });
    
    console.log("Debug Info:", content);
    await browser.close();
}

debugDetail();
