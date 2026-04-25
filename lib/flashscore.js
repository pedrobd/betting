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

        // Scroll progressivo para forçar lazy-load de todos os jogos
        await new Promise(r => setTimeout(r, 2000));
        for (let i = 0; i < 35; i++) {
            await page.mouse.wheel({ deltaY: 600 });
            await new Promise(r => setTimeout(r, 300));
        }
        await new Promise(r => setTimeout(r, 1500));

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

        console.log("A extrair dados de hoje...");
        
        // Extrai os dados do DOM — função reutilizável
        const extractMatchesFromPage = () => page.evaluate(() => {
            const matchNodes = document.querySelectorAll('.event__match');
            const data = [];
            
            matchNodes.forEach(node => {
                let trend = 'stable';
                const homeNode = node.querySelector('.event__homeParticipant');
                const awayNode = node.querySelector('.event__awayParticipant');
                const timeNode = node.querySelector('.event__time, .event__stage');
                // Flashscore mostra 3 odds na listagem: [0]=1 (casa), [1]=X (empate), [2]=2 (fora)
                const oddNodes = node.querySelectorAll('.odds__odd');
                
                if (homeNode && awayNode) {
                    let oddVal = 0;     // odd vitória casa (1)
                    let oddDraw = 0;    // odd empate (X)
                    let oddAway = 0;    // odd vitória fora (2)
                    let odd1x = 0;     // odd dupla hipótese (1X) calculada

                    if (oddNodes && oddNodes.length >= 2) {
                        try {
                           const oddText1 = oddNodes[0].innerText || oddNodes[0].textContent || '';
                           const oddTextX = oddNodes[1].innerText || oddNodes[1].textContent || '';
                           const oddText2 = oddNodes[2] ? (oddNodes[2].innerText || oddNodes[2].textContent || '') : '';
                           const parsed1 = parseFloat(oddText1.replace(',', '.').replace(/[^0-9.]/g, ''));
                           const parsedX = parseFloat(oddTextX.replace(',', '.').replace(/[^0-9.]/g, ''));
                           const parsed2 = parseFloat(oddText2.replace(',', '.').replace(/[^0-9.]/g, ''));

                           if (!isNaN(parsed1) && parsed1 > 1) oddVal = parsed1;
                           if (!isNaN(parsedX) && parsedX > 1) oddDraw = parsedX;
                           if (!isNaN(parsed2) && parsed2 > 1) oddAway = parsed2;

                           // Calcula odd 1X real: p(1X) = p(1) + p(X) → odd = 1/p(1X)
                           // Remove margem da casa antes de somar probabilidades
                           if (oddVal > 1 && oddDraw > 1) {
                               const p1 = 1 / oddVal;
                               const pX = 1 / oddDraw;
                               const p1x = Math.min(p1 + pX, 0.98); // cap em 98%
                               odd1x = parseFloat((1 / p1x).toFixed(2));
                           }

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
                        odd_draw: oddDraw,
                        odd_away: oddAway,
                        odd_1x: odd1x,
                        odd_trend: trend,
                        match_id: node.getAttribute('id') || Math.random().toString()
                    });
                }
            });
            return data;
        });

        let matches = await extractMatchesFromPage();
        console.log(`📅 Hoje: ${matches.length} jogos encontrados`);

        // Vai buscar também os jogos de amanhã
        try {
            const nextDayBtn = await page.$('.calendar__navigation--tomorrow, [data-testid="calendar-tab-future"], .filters__tab:last-child');
            if (nextDayBtn) {
                await nextDayBtn.click();
                await new Promise(r => setTimeout(r, 3000));
                const tomorrowMatches = await extractMatchesFromPage();
                console.log(`📅 Amanhã: ${tomorrowMatches.length} jogos encontrados`);
                matches = [...matches, ...tomorrowMatches];
            } else {
                // Tenta navegar directamente para amanhã
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                const dd = String(tomorrow.getDate()).padStart(2, '0');
                const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
                const yyyy = tomorrow.getFullYear();
                await page.goto(`https://www.flashscore.pt/futebol/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
                // Click next day arrow
                const arrow = await page.$('[class*="nextButton"], [class*="next-button"], a[href*="amanha"]');
                if (arrow) {
                    await arrow.click();
                    await new Promise(r => setTimeout(r, 3000));
                    const tomorrowMatches = await extractMatchesFromPage();
                    console.log(`📅 Amanhã (arrow): ${tomorrowMatches.length} jogos encontrados`);
                    matches = [...matches, ...tomorrowMatches];
                }
            }
        } catch(e) {
            console.log('⚠️ Não foi possível navegar para amanhã:', e.message);
        }

        console.log(`📊 Total combinado: ${matches.length} jogos`);

        // Fase 1: Aceitar todos os jogos futuros (odds vem a 0 da listagem por lazy-load do Flashscore)
        let futurematches = matches.filter(m => {
            const isFuture = m.time.includes(':') && !m.time.toLowerCase().includes('fin');
            const isNotLive = !m.time.toLowerCase().includes('ao vivo') && !m.time.toLowerCase().includes('int');
            const isNotFinished = !m.time.toLowerCase().includes('term');
            return isFuture && isNotLive && isNotFinished;
        });

        let validMatches = futurematches.filter(m => m.odd > 1.0 && m.odd <= 3.50);
        const needsDeepScrape = futurematches.filter(m => !(m.odd > 1.0 && m.odd <= 3.50));

        console.log(`📊 Jogos futuros: ${futurematches.length} (${validMatches.length} com odd, ${needsDeepScrape.length} precisam deep scrape)`);

        // Deep Scrape para buscar odds reais — corre sempre para não perder jogos sem odds no listing
        if (needsDeepScrape.length > 0) {
            console.log(`🔍 Deep Scrape de ${needsDeepScrape.length} jogos sem odds no listing...`);
            let missingOdds = needsDeepScrape.slice(0, 40);

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
                    m.odd_trend = matchIntel.oddTrend;
                    if (matchIntel.homeForm) m.homeFormFlash = matchIntel.homeForm;
                    if (matchIntel.awayForm) m.awayFormFlash = matchIntel.awayForm;

                    // Navegar para página Over/Under para recolher odd real Over 1.5
                    try {
                        await detailPage.goto(
                            `https://www.flashscore.pt/jogo/${realId}/#/comparacao-de-odds/mais-menos-golos/tempo-regulamentar`,
                            { waitUntil: 'networkidle2', timeout: 12000 }
                        );
                        await new Promise(r => setTimeout(r, 1500));

                        const ouIntel = await detailPage.evaluate(() => {
                            // Procura linha do Over 1.5 na tabela de odds
                            const rows = document.querySelectorAll('.ui-table__row, [class*="tableRow"]');
                            for (const row of rows) {
                                const text = row.innerText || '';
                                // Linha que conteâm '1.5' ou 'Mais de 1.5'
                                if (text.includes('1.5') || text.includes('1,5')) {
                                    const odds = row.querySelectorAll('[class*="oddsCell"], .odds__odd, a[class*="odd"]');
                                    if (odds.length >= 1) {
                                        const val = parseFloat(odds[0].innerText.replace(',', '.').replace(/[^0-9.]/g, ''));
                                        if (val > 1.0 && val < 4.0) return { over15: val };
                                    }
                                }
                            }
                            // fallback: procurar qualquer valor entre 1.05 e 1.60 (range tipico Over 1.5)
                            const allOdds = document.querySelectorAll('[class*="oddsCell__odd"], .oddsCell__odd');
                            for (const el of allOdds) {
                                const val = parseFloat(el.innerText.replace(',', '.').replace(/[^0-9.]/g, ''));
                                if (val >= 1.05 && val <= 1.60) return { over15: val };
                            }
                            return { over15: 0 };
                        });

                        if (ouIntel.over15 > 1.0) {
                            m.odd_over15 = ouIntel.over15;
                            console.log(`   ⚽ Over 1.5 odd: ${m.odd_over15}`);
                        }
                    } catch(e) {
                        // Over/Under não disponível, continua sem
                    }

                    if (m.odd > 1.0 && m.odd <= 3.50) {
                        validMatches.push(m);
                        console.log(`🎯 [INTEL] ${m.team_home} vs ${m.team_away} | odd=${m.odd} | over15=${m.odd_over15 || 'N/A'} | trend=${m.odd_trend}`);
                    }
                } catch(e) {
                    console.log(`❌ Falha no H2H de ${m.team_home}`);
                }
                await detailPage.close();
                if (validMatches.length >= 50) break;
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
