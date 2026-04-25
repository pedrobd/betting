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

                    // Try to get form dots from the listing (Flashscore shows them as colored icons)
                    const getListingForm = (participantNode) => {
                        if (!participantNode) return '';
                        // Try several selector patterns Flashscore uses for form
                        const formContainer = participantNode.closest('.event__match')
                            ?.querySelector('[class*="form"], [class*="Form"]');
                        if (!formContainer) return '';
                        return Array.from(formContainer.querySelectorAll('[class*="icon"], span, div'))
                            .slice(0, 5).map(el => {
                                const cls = el.className.toLowerCase();
                                const t = (el.innerText || el.textContent || '').toUpperCase().trim();
                                if (cls.includes('win') || cls.includes('positive') || t === 'V' || t === 'W') return 'W';
                                if (cls.includes('draw') || t === 'E') return 'D';
                                if (cls.includes('loss') || cls.includes('negative') || t === 'D' || t === 'L') return 'L';
                                return '';
                            }).filter(Boolean).join('');
                    };

                    data.push({
                        team_home: homeNode.innerText.trim(),
                        team_away: awayNode.innerText.trim(),
                        time: matchTime,
                        odd: oddVal,
                        odd_draw: oddDraw,
                        odd_away: oddAway,
                        odd_1x: odd1x,
                        odd_trend: trend,
                        match_id: node.getAttribute('id') || Math.random().toString(),
                        homeFormFlash: getListingForm(homeNode),
                        awayFormFlash: getListingForm(awayNode),
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

        // Fase 1: filtrar jogos futuros (odds pode vir a 0 do lazy-load)
        let futurematches = matches.filter(m => {
            const isFuture = m.time.includes(':') && !m.time.toLowerCase().includes('fin');
            const isNotLive = !m.time.toLowerCase().includes('ao vivo') && !m.time.toLowerCase().includes('int');
            const isNotFinished = !m.time.toLowerCase().includes('term');
            return isFuture && isNotLive && isNotFinished;
        });

        // Prioritize: missing-odds first (need odds + form), then already-have-odds (only need form)
        const hasOdds    = futurematches.filter(m => m.odd > 1.0 && m.odd <= 3.50);
        const missingOdd = futurematches.filter(m => !(m.odd > 1.0 && m.odd <= 3.50));

        // Deep scrape ALL matches: missing-odds first, then rest (capped at 50 total valid)
        const deepQueue = [...missingOdd, ...hasOdds].slice(0, 50);
        const validMatchesMap = new Map(hasOdds.map(m => [m.match_id, m]));

        console.log(`📊 Jogos futuros: ${futurematches.length} (${hasOdds.length} com odd, ${missingOdd.length} sem) — deep scrape de ${deepQueue.length}`);

        for (let m of deepQueue) {
            await new Promise(r => setTimeout(r, 1500 + Math.random() * 1500));
            const detailPage = await _browser.newPage();
            try {
                const realId = m.match_id.replace('g_1_', '');
                await detailPage.goto(`https://www.flashscore.pt/jogo/${realId}/#/h2h/overall`, {waitUntil: 'networkidle2', timeout: 20000});

                try {
                    const cookieBtn = await detailPage.$('#onetrust-accept-btn-handler');
                    if (cookieBtn) await cookieBtn.click();
                } catch(e) {}

                const matchIntel = await detailPage.evaluate((homeTeamName, awayTeamName) => {
                    // Parse form by reading SCORES from H2H rows — no CSS class dependency
                    const formFromSection = (section, teamName) => {
                        if (!section) return '';
                        const clean = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
                        const teamClean = clean(teamName).slice(0, 5); // first 5 chars as fingerprint

                        const rows = section.querySelectorAll('.h2h__row, [class*="h2h__row"]');
                        const results = [];

                        for (const row of Array.from(rows).slice(0, 7)) {
                            const allText = row.innerText || row.textContent || '';

                            // Find score pattern like "2:1" or "0 : 0"
                            const scoreMatch = allText.match(/(\d+)\s*[:\-]\s*(\d+)/);
                            if (!scoreMatch) continue;
                            const hs = parseInt(scoreMatch[1]);
                            const as = parseInt(scoreMatch[2]);
                            if (isNaN(hs) || isNaN(as)) continue;

                            // Determine home/away position of our team
                            // Home team name appears before the score in the row text
                            const homeEl = row.querySelector(
                                '[class*="home"], [class*="Home"], [class*="Participant"]:first-of-type'
                            );
                            const homeName = homeEl
                                ? clean(homeEl.innerText || homeEl.textContent || '')
                                : clean(allText.split(scoreMatch[0])[0] || '');

                            const isHome = homeName.includes(teamClean) || teamClean.includes(homeName.slice(0, 4));

                            const my  = isHome ? hs : as;
                            const opp = isHome ? as : hs;
                            results.push(my > opp ? 'W' : my < opp ? 'L' : 'D');
                        }

                        return results.slice(0, 5).join('');
                    };

                    const sections = document.querySelectorAll('.h2h__section');
                    // sections[0] = H2H matches, sections[1] = home last, sections[2] = away last
                    const homeForm = formFromSection(sections[1], homeTeamName);
                    const awayForm = formFromSection(sections[2], awayTeamName);

                    let trend = "stable";
                    const oddEl = document.querySelector('.oddsValue, .o_1');
                    if (oddEl) {
                        if (oddEl.querySelector('.up, .ico-up, [class*="up"]')) trend = "rising";
                        if (oddEl.querySelector('.down, .ico-down, [class*="down"]')) trend = "dropping";
                    }

                    let odd = 0;
                    const oddEls = document.querySelectorAll('.oddsValue, .o_1, [class*="odds"]');
                    for (let el of oddEls) {
                        let val = parseFloat(el.innerText.replace(',', '.').replace(/[^0-9.]/g, ''));
                        if (val > 1.1) { odd = val; break; }
                    }

                    return { homeForm, awayForm, oddTrend: trend, odd };
                }, m.team_home, m.team_away);

                if (matchIntel.odd > 0 && !m.odd) m.odd = matchIntel.odd;
                if (matchIntel.oddTrend !== 'stable') m.odd_trend = matchIntel.oddTrend;
                if (matchIntel.homeForm) m.homeFormFlash = matchIntel.homeForm;
                if (matchIntel.awayForm) m.awayFormFlash = matchIntel.awayForm;

                const hasValidOdd = m.odd > 1.0 && m.odd <= 3.50;

                // Over/Under only for games without odds (saves time for games we already have)
                if (!validMatchesMap.has(m.match_id)) {
                    try {
                        await detailPage.goto(
                            `https://www.flashscore.pt/jogo/${realId}/#/comparacao-de-odds/mais-menos-golos/tempo-regulamentar`,
                            { waitUntil: 'networkidle2', timeout: 12000 }
                        );
                        await new Promise(r => setTimeout(r, 1500));

                        const ouIntel = await detailPage.evaluate(() => {
                            const rows = document.querySelectorAll('.ui-table__row, [class*="tableRow"]');
                            for (const row of rows) {
                                const text = row.innerText || '';
                                if (text.includes('1.5') || text.includes('1,5')) {
                                    const odds = row.querySelectorAll('[class*="oddsCell"], .odds__odd, a[class*="odd"]');
                                    if (odds.length >= 1) {
                                        const val = parseFloat(odds[0].innerText.replace(',', '.').replace(/[^0-9.]/g, ''));
                                        if (val > 1.0 && val < 4.0) return { over15: val };
                                    }
                                }
                            }
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
                    } catch(e) { /* Over/Under não disponível */ }

                    if (hasValidOdd) {
                        validMatchesMap.set(m.match_id, m);
                        console.log(`🎯 [INTEL] ${m.team_home} vs ${m.team_away} | odd=${m.odd} | form=${m.homeFormFlash||'?'} | trend=${m.odd_trend}`);
                    }
                } else {
                    // Update form on existing valid match
                    const existing = validMatchesMap.get(m.match_id);
                    if (matchIntel.homeForm) existing.homeFormFlash = matchIntel.homeForm;
                    if (matchIntel.awayForm) existing.awayFormFlash = matchIntel.awayForm;
                    console.log(`📋 [FORM] ${m.team_home} vs ${m.team_away} | form=${matchIntel.homeForm||'?'}/${matchIntel.awayForm||'?'}`);
                }
            } catch(e) {
                console.log(`❌ Falha deep scrape de ${m.team_home}: ${e.message.slice(0,60)}`);
            }
            await detailPage.close();
            if (validMatchesMap.size >= 50) break;
        }

        const validMatches = [...validMatchesMap.values()];

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
