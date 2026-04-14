import puppeteer from 'puppeteer';

export async function getDailyMatches() {
    let _browser;
    try {
        _browser = await puppeteer.launch({
            headless: false, // Visível ajuda no bypass e permite ver o que se passa no Windows
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox', 
                '--disable-blink-features=AutomationControlled',
                '--window-size=1280,800'
            ],
        });
        
        const page = await _browser.newPage();
        
        // Evasão Manual de Webdriver
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });

        // Anti-bot modernizado
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        console.log("A abrir Flashscore...");
        await page.goto('https://www.flashscore.pt/', { waitUntil: 'domcontentloaded', timeout: 60000 });
        
        // Anti-bot: scroll inicial
        await page.mouse.wheel({ deltaY: 300 });
        await new Promise(r => setTimeout(r, 2000));

        // Clica em "Aceitar Cookies"
        try {
            const cookieBtn = await page.$('#onetrust-accept-btn-handler');
            if (cookieBtn) await cookieBtn.click();
        } catch(e) {}
        
        // Espera pelos jogos com timeout generoso
        try {
            await page.waitForSelector('.event__match', { timeout: 30000 });
        } catch (err) {
            const title = await page.title();
            if (title.includes('Cloudflare') || title.includes('Access Denied')) {
                throw new Error("Bloqueio Cloudflare detectado.");
            }
            throw new Error("Timeout ao carregar os jogos.");
        }

        console.log("A extrair dados...");
        
        // Extrai os dados do DOM
        let matches = await page.evaluate(() => {
            const matchNodes = document.querySelectorAll('.event__match');
            const data = [];
            
            matchNodes.forEach(node => {
                const homeNode = node.querySelector('.event__homeParticipant');
                const awayNode = node.querySelector('.event__awayParticipant');
                const timeNode = node.querySelector('.event__time, .event__stage');
                const oddNodes = node.querySelectorAll('.odds__odd, .o_1, a.o_1');
                
                if (homeNode && awayNode) {
                    let oddVal = 0;
                    if (oddNodes && oddNodes.length > 0) {
                        try {
                           const oddText = oddNodes[0].innerText || oddNodes[0].textContent || '';
                           const parsedOdd = parseFloat(oddText.replace(',', '.').replace(/[^0-9.]/g, ''));
                           if (!isNaN(parsedOdd)) oddVal = parsedOdd;
                        } catch(e) {}
                    }

                    let matchTime = timeNode ? timeNode.innerText.trim() : "ND";
                    
                    data.push({
                        team_home: homeNode.innerText.trim(),
                        team_away: awayNode.innerText.trim(),
                        time: matchTime,
                        odd: oddVal,
                        match_id: node.getAttribute('id') || Math.random().toString()
                    });
                }
            });
            return data;
        });

        // Filtragem (Odds baixas para a nossa estratégia de favoritos)
        // Como é tarde, aceitamos jogos com ':' (em curso ou futuros) e odds até 1.70
        let validMatches = matches.filter(m => m.odd > 1.0 && m.odd <= 1.70);

        // Se tivermos poucos jogos, tentamos deep scrape nos 5 primeiros sem odd
        if (validMatches.length < 5) {
            let missingOdds = matches.filter(m => m.odd === 0).slice(0, 8);
            for (let m of missingOdds) {
                const detailPage = await _browser.newPage();
                try {
                    const realId = m.match_id.replace('g_1_', '');
                    await detailPage.goto(`https://www.flashscore.pt/jogo/${realId}/#/resumo-jogo`, {waitUntil: 'domcontentloaded', timeout: 10000});
                    await new Promise(r => setTimeout(r, 1500));
                    
                    let deepOdd = await detailPage.evaluate(() => {
                        let oddsContainer = document.querySelector('.oddsTab__table') || document.body;
                        let textArray = oddsContainer.innerText.match(/\b[1-9]\.[0-9]{2}\b/g);
                        return textArray ? parseFloat(textArray[0]) : 0;
                    });

                    if (deepOdd > 1.0 && deepOdd <= 1.80) {
                        m.odd = deepOdd;
                        validMatches.push(m);
                    }
                } catch(e) {}
                await detailPage.close();
                if (validMatches.length >= 10) break;
            }
        }

        return validMatches;
        
    } catch (e) {
        console.error("Erro Scraper:", e.message);
        throw e;
    } finally {
        if (_browser) await _browser.close();
    }
}

export function getH2hForm() {
    const forms = [75.0, 85.0, 95.0];
    return forms[Math.floor(Math.random() * forms.length)];
}
