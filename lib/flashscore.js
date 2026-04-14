import puppeteer from 'puppeteer';

export async function getDailyMatches() {
    let _browser;
    try {
        _browser = await puppeteer.launch({
            headless: false, // abrir uma janela visível passa melhor pelo bloqueio Cloudflare.
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080'],
        });
        
        const page = await _browser.newPage();
        
        // Anti-bot
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36');
        
        // Abre o Flashscore
        console.log("A abrir Flashscore...");
        await page.goto('https://www.flashscore.pt/', { waitUntil: 'networkidle2', timeout: 60000 });
        
        // Clica em "Aceitar Cookies" se existir para desvendar a UI
        try {
            await page.waitForSelector('#onetrust-accept-btn-handler', { timeout: 3000 });
            await page.click('#onetrust-accept-btn-handler');
        } catch(e) {} // ignorar se não aparecer
        
        // Espera peos jogos carregarem
        await page.waitForSelector('.event__match', { timeout: 15000 });

        console.log("A extrair jogos reais da página principal...");
        
        // Extrai os dados do DOM
        let matches = await page.evaluate(() => {
            const matchNodes = document.querySelectorAll('.event__match');
            const data = [];
            
            matchNodes.forEach(node => {
                const homeNode = node.querySelector('.event__homeParticipant');
                const awayNode = node.querySelector('.event__awayParticipant');
                const timeNode = node.querySelector('.event__time, .event__stage');
                
                // As odds 1x2 aparecem geralmente em span ou a tag com class contendo 'odds'
                // O flashscore coloca a odd da Casa no primeiro filho.
                // Apanhar classes comuns de odds no FS
                const oddNodes = node.querySelectorAll('.odds__odd, .o_1, [title*="Betano"], a.o_1');
                
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

        console.log(`Foram encontrados ${matches.length} jogos totais na página principal do Flashscore.`);
        
        // Filtrar logo os que já capturámos no ecrã com odd perfeita (e EXCLUIR Vivos e Terminados com o truque do ':')
        let validMatches = matches.filter(m => m.odd > 1.0 && m.odd <= 1.70 && m.time.includes(':'));
        
        // Identificar os jogos futuros (não terminados, que contêm ':') cuja odd não estava visível na Home page (Traço -)
        let missingOddsMatches = matches.filter(m => m.odd === 0 && m.time.includes(':'));

        console.log(`Existem ${missingOddsMatches.length} jogos futuros puros sem Odd aparente. A fazer Deep Scrape aos 15 primeiros para poupar tempo...`);
        missingOddsMatches = missingOddsMatches.slice(0, 15);

        for (let m of missingOddsMatches) {
            console.log(`A entrar no jogo ${m.team_home} vs ${m.team_away} (${m.time})...`);
            const detailPage = await _browser.newPage();
            try {
                const realId = m.match_id.replace('g_1_', '');
                await detailPage.goto(`https://www.flashscore.pt/jogo/${realId}/#/resumo-jogo`, {waitUntil: 'domcontentloaded', timeout: 5000});
                
                await new Promise(r => setTimeout(r, 2000));
                
                // Forçar o Scraping Sujo com Regex cega para extrair cotações matemáticas
                let deepOdd = await detailPage.evaluate(() => {
                    // Restringir a pesquisa de texto ao Contentor de ODDS ou ao Resumo da Aba, em último recurso ao ecrã todo
                    let oddsContainer = document.querySelector('.oddsTab__table') || document.getElementById('detail-tab-summary') || document.body;
                    
                    // Regex para apanhar qualquer coisa que seja "Num.NumNum" (ex: 1.75, 2.50)
                    let textArray = oddsContainer.innerText.match(/\b[1-9]\.[0-9]{2}\b/g);
                    
                    if (textArray && textArray.length >= 1) {
                        // O primeiro número lido da esquerda para a direita no HTML costuma ser a Home 1x2 Odd.
                        return parseFloat(textArray[0]);
                    }
                    return 0;
                });

                if (deepOdd > 1.0 && deepOdd <= 1.70) {
                    m.odd = deepOdd;
                    console.log(`Sucesso Deep Scrape! Odd Betano ${deepOdd} resgatada para ${m.team_home}`);
                    validMatches.push(m);
                } else {
                    console.log(`Odd encontrada foi ${deepOdd} (Ignorada, > 1.70 ou 0)`);
                }
            } catch(e) {
                console.log(`Erro no Deep Scrape para ${m.team_home}`);
            }
            await detailPage.close();
            
            if (validMatches.length >= 10) break;
        }

        matches = validMatches;
        return matches;
        
    } catch (e) {
        console.error("Erro Crítico no Scraper Real:", e);
        throw new Error("Falha ao extrair dados ao vivo do Flashscore. Verifique o terminal para bloqueios Cloudflare.");
    } finally {
        if (_browser) {
            await _browser.close();
        }
    }
}

export function getH2hForm() {
    // Retorna percentagem de vitórias na forma recente real exigiria abrir page por match_id id,
    // Para performance e MVP mantemos inferência aleatoria positiva (favs).
    const forms = [60.0, 80.0, 100.0];
    return forms[Math.floor(Math.random() * forms.length)];
}
