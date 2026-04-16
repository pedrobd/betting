import puppeteer from 'puppeteer';

export async function getDailyMatches() {
    let _browser;
    try {
        const isCI = process.env.CI === 'true';
        _browser = await puppeteer.launch({
            headless: isCI ? true : false, 
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
                let trend = 'stable';
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

                           const cls = oddNodes[0].className.toLowerCase();
                           if (cls.includes('down') || node.querySelector('.odds__odd--down') || node.querySelector('.icon--arrow-down')) {
                               trend = 'dropping';
                           } else if (cls.includes('up') || node.querySelector('.odds__odd--up') || node.querySelector('.icon--arrow-up')) {
                               trend = 'rising';
                           }
                        } catch(e) {}
                    }

                    let matchTime = timeNode ? timeNode.innerText.trim() : "ND";
                    
                    data.push({
                        team_home: homeNode.innerText.trim(),
                        team_away: awayNode.innerText.trim(),
                        time: matchTime,
                        odd: oddVal,
                        odd_trend: trend,
                        match_id: node.getAttribute('id') || Math.random().toString()
                    });
                }
            });
            return data;
        });

        // Filtragem Estrita: Apenas jogos futuros (com ':') e que não tenham terminado
        let validMatches = matches.filter(m => {
            const isFuture = m.time.includes(':') && !m.time.toLowerCase().includes('fin');
            const isNotLive = !m.time.toLowerCase().includes('ao vivo') && !m.time.toLowerCase().includes('int');
            const isNotFinished = !m.time.toLowerCase().includes('term');
            
            return m.odd > 1.0 && m.odd <= 1.85 && isFuture && isNotLive && isNotFinished;
        });

        console.log(`📊 Jogos com odd válida na home: ${validMatches.length}`);

        // Deep Scrape para buscar odds e FORMA (H2H)
        if (validMatches.length < 15) {
            console.log("🔍 Iniciando Deep Scrape para odds e Forma (H2H)...");
            let missingOdds = matches.filter(m => 
                m.time.includes(':') && 
                !m.time.toLowerCase().includes('term')
            ).slice(0, 20);

            for (let m of missingOdds) {
                await new Promise(r => setTimeout(r, 2000 + Math.random() * 2000));
                const detailPage = await _browser.newPage();
                try {
                    const realId = m.match_id.replace('g_1_', '');
                    await detailPage.goto(`https://www.flashscore.pt/jogo/${realId}/#/h2h/overall`, {waitUntil: 'networkidle2', timeout: 20000});
                    
                    try {
                        const cookieBtn = await detailPage.$('#onetrust-accept-btn-handler');
                        if (cookieBtn) await cookieBtn.click();
                    } catch(e) {}

                    // Extrair Forma, Odd, Posição e Tendência
                    const matchIntel = await detailPage.evaluate(async () => {
                        const getForm = (sectionIdx) => {
                            const sections = document.querySelectorAll('.h2h__section');
                            if (!sections[sectionIdx]) return "";
                            const icons = sections[sectionIdx].querySelectorAll('.h2h__result, .h2h__icon, .h2h__row div:last-child');
                            return Array.from(icons).slice(0, 5).map(icon => {
                                const cls = icon.className.toLowerCase();
                                const text = icon.innerText.toUpperCase().trim();
                                
                                // Detetar por Classe (Internacional) ou Texto (Português)
                                if (cls.includes('w') || cls.includes('win') || text === 'V') return 'W';
                                if (cls.includes('l') || cls.includes('loss') || text === 'D') return 'L';
                                if (cls.includes('d') || cls.includes('draw') || text === 'E') return 'D';
                                return '';
                            }).join('');
                        };

                        // 1. Posição na Tabela (Motivation)
                        const standingText = document.body.innerText.match(/Classificação:?\s*(\d+)\./g);
                        const positions = standingText ? standingText.map(t => parseInt(t.match(/\d+/)[0])) : [0, 0];

                        // 2. Tendência da Odd (Dropping Odds)
                        // Procura setas de subida/descida no elemento da odd
                        let trend = "stable";
                        const oddEl = document.querySelector('.oddsValue, .o_1');
                        if (oddEl) {
                            if (oddEl.querySelector('.up, .ico-up, [class*="up"]')) trend = "rising";
                            if (oddEl.querySelector('.down, .ico-down, [class*="down"]')) trend = "dropping";
                        }

                        // 3. Odd Atual
                        let odd = 0;
                        const oddEls = document.querySelectorAll('.oddsValue, .o_1, [class*="odds"]');
                        for (let el of oddEls) {
                            let val = parseFloat(el.innerText.replace(',', '.').replace(/[^0-9.]/g, ''));
                            if (val > 1.1) { odd = val; break; }
                        }

                        return {
                            homeForm: getForm(1),
                            awayForm: getForm(2),
                            homePos: positions[0] || 0,
                            awayPos: positions[1] || 0,
                            oddTrend: trend,
                            odd: odd
                        };
                    });

                    if (matchIntel.odd > 0) m.odd = matchIntel.odd;
                    // Nota: home_form, away_form, home_pos e away_pos vem do SofaScore (cloud_sync.js)
                    // Nao guardamos os valores do Flashscore para evitar '?????'
                    m.odd_trend = matchIntel.oddTrend;

                    if (m.odd > 1.0 && m.odd <= 1.85) {
                        validMatches.push(m);
                        console.log(`🎯 [INTEL] ${m.team_home} (Pos:${m.home_pos}) vs ${m.team_away} (Pos:${m.away_pos}) | Trend: ${m.odd_trend}`);
                    }
                } catch(e) {
                    console.log(`❌ Falha no H2H de ${m.team_home}`);
                }
                await detailPage.close();
                if (validMatches.length >= 15) break;
            }
        }

        console.log(`✅ Scraper finalizado com ${validMatches.length} jogos.`);
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
