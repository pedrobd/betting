import puppeteer from 'puppeteer';
import path from 'path';
import { saveLiveOdds } from "./database";

const CACHE_PATH = path.join(process.cwd(), "data", "betano_odds.json");

export class FlashscoreBot {
  static async syncLiveGames() {
    console.log("[FlashscoreBot] 🤖 A iniciar bot de Web Scraping...");
    
    let browser;
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      const page = await browser.newPage();
      
      // Imitações de uso humano para evitar rate-limits
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36');
      
      console.log("[FlashscoreBot] 🌐 A navegar para flashscore.pt...");
      await page.goto('https://www.flashscore.pt/', { waitUntil: 'domcontentloaded', timeout: 30000 });

      console.log("[FlashscoreBot] ⏳ A extrair jogos da página principal...");
      
      // Aguardar meio segundo para garantir elementos renderizados via React (Websockets Flashscore)
      await new Promise(r => setTimeout(r, 1000));

      console.log("[FlashscoreBot] ⏳ A aguardar renderização da tabela de jogos...");
      await page.waitForSelector('.event__match', { timeout: 15000 });

      // Extrai os jogos diretamente do DOM e descobre o MID de cada jogo
      let games = await page.evaluate(() => {
         const results: any[] = [];
         let currentLeague = "Outros";

         // Pegar em todos os elementos filhos diretos do contentor de futebol
         const rows = document.querySelectorAll('.sportName.soccer > div');

         rows.forEach((row: any) => {
            // Tenta identificar se é um cabeçalho de liga (contém título) ou um jogo
            if (row.querySelector('.headerLeague__title')) {
                currentLeague = row.textContent?.trim() || "Outros";
            } else if (row.classList.contains('event__match') || (row.id && row.id.startsWith('g_1_'))) {
                const homeEl = row.querySelector('.event__homeParticipant');
                const awayEl = row.querySelector('.event__awayParticipant');
                const timeEl = row.querySelector('.event__time') || row.querySelector('.event__stage');
                
                if (homeEl && awayEl && homeEl.textContent && awayEl.textContent) {
                    let time = timeEl && timeEl.textContent ? timeEl.textContent.trim() : "LIVE";
                    time = time.replace(/\s+/g, ' '); 

                    let mid = "";
                    if (row.id && row.id.startsWith("g_1_")) {
                        mid = row.id.split("_")[2];
                    }

                    if (mid) {
                        // Better time parsing
                        let processedTime = time;
                        const dateMatch = time.match(/(\d{2})\/(\d{2})/);
                        const hourMatch = time.match(/(\d{2}):(\d{2})/);
                        
                        // Check if it's a live game (contains minutes ' or stage identifiers)
                        const isLive = time.includes("'") || time.includes("+") || 
                                       time.includes("Intervalo") || time.includes("LIVE") ||
                                       (time.split(' ').length === 1 && !hourMatch && !dateMatch);

                        if (isLive) {
                            processedTime = "LIVE";
                        } else if (dateMatch) {
                            // Format: DD/MM HH:MM -> DD/MM/2026 HH:MM
                            processedTime = `${dateMatch[1]}/${dateMatch[2]}/2026`;
                            if (hourMatch) processedTime += ` ${hourMatch[0]}`;
                        } else if (hourMatch) {
                            // Format: HH:MM (Today) -> 11/04/2026 HH:MM
                            processedTime = `11/04/2026 ${hourMatch[0]}`;
                        }

                        results.push({
                            mid: mid,
                            home: homeEl.textContent.trim(),
                            away: awayEl.textContent.trim(),
                            time: processedTime,
                            league: currentLeague,
                        });
                    }
                }
            }
         });
         return results;
      });

      console.log(`[FlashscoreBot] ✅ Encontrados ${games.length} jogos no total da página principal.`);

      const TOP_COUNTRIES = [
        "portugal", "espanha", "inglaterra", "alemanha", "italia", "itália", "frança", "franca", "holanda", "turquia", "europa", "brasil", "américa do sul",
        "eua", "usa", "méxico", "japão", "japao", "coreia", "austrália", "belgica", "bélgica", "escócia", "suíça", "suica", "áustria"
      ];
      const TOP_LEAGUES = [
        "premier league", "championship", "league one", "league two",
        "laliga", "segunda división", 
        "serie a", "serie b", "série a", "série b", "brasileirão",
        "bundesliga", "2. bundesliga",
        "ligue 1", "ligue 2",
        "liga portugal", "liga portugal 2",
        "eredivisie", "super lig", "süper lig",
        "liga dos campeões", "liga europa", "liga conferência", "champions league",
        "taça de portugal", "fa cup", "copa del rey", "coppa italia", "dfb pokal", "coupe de france", 
        "copa do brasil", "libertadores", "sul-americana", "sudamericana",
        "mls", "major league soccer", "liga mx", "j1 league", "k league 1", "a-league",
        "super league", "pro league", "premiership", "swiss super league", "austrian bundesliga"
      ];

      // Filtrar: só jogos FUTUROS ou AO VIVO de Ligas de Topo
      const jogosValidos = games.filter(g => {
        const tempoNorm = (g.time || "").toLowerCase();
        const ligaNorm = (g.league || "").toLowerCase().trim();

        // 🛡️ REJECT LIVE GAMES for Accumulator safety
        if (tempoNorm === "live" || tempoNorm.includes("'") || tempoNorm.includes("+")) return false;

        // Excluir terminados
        if (tempoNorm.includes("terminado") || tempoNorm.includes("encerrado") || tempoNorm === "fim") return false;
        
        // Critério: Deve conter um país de topo europeu E uma das competições alvo
        const hasCountry = TOP_COUNTRIES.some(c => ligaNorm.includes(c));
        const hasLeague = TOP_LEAGUES.some(l => ligaNorm.includes(l));
        
        return hasCountry && hasLeague;
      });

      if (jogosValidos.length === 0 && games.length > 0) {
          const leaguesFound = [...new Set(games.map(g => g.league))];
          console.log(`[FlashscoreBot] 🔍 Ligas encontradas (amostra): ${leaguesFound.slice(0, 5).join(", ")}...`);
      }

      console.log(`[FlashscoreBot] 🎯 Após filtro de qualidade: ${jogosValidos.length} jogos elegíveis das Ligas Top.`);

      if (jogosValidos.length === 0) {
        console.log(`[FlashscoreBot] ⚠️  Nenhum jogo das Ligas Top encontrado agora.`);
        return;
      }

      // Limitar a 20 jogos (conforme solicitado pelo utilizador) para o Deep Scraping
      const topGames = jogosValidos.slice(0, 20);
      const finalGames: any[] = [];

      console.log(`[FlashscoreBot] 🔍 A iniciar o "Deep Scraping" de Estatísticas + Odds BETANO para ${topGames.length} jogos...`);
      
      for (const game of topGames) {
          try {
              // Passo 1: Navegar para a página do jogo DE FORMA ROBUSTA
              const matchUrl = `https://www.flashscore.pt/jogo/${game.mid}/#/resumo-de-jogo`;
              await page.goto(matchUrl, { waitUntil: 'networkidle2', timeout: 20000 });
              await new Promise(r => setTimeout(r, 2000));

              // 1.1. Tentar clicar na aba "Classificações"
              const tabClicked = await page.evaluate(() => {
                const tabs = Array.from(document.querySelectorAll('a'));
                const tab = tabs.find(el => el.textContent?.trim() === 'Classificações');
                if (tab) { (tab as HTMLElement).click(); return true; }
                return false;
              });

              let stats = { homePos: 0, awayPos: 0, avgGoals: 0, homeForm: "WWDWD", awayForm: "LDLLD" };

              if (tabClicked) {
                await new Promise(r => setTimeout(r, 4000));
                try {
                    const rawRows: any[] = await page.evaluate(() => {
                        return Array.from(document.querySelectorAll('.ui-table__row')).map(r => {
                            const nameEl = r.querySelector('.tableCellParticipant__name');
                            const rankEl = r.querySelector('.tableCellRank');
                            const valCells = r.querySelectorAll('.table__cell--value');
                            const formEls = r.querySelectorAll('.tableCellFormIcon span');
                            return {
                                rank: rankEl?.textContent?.trim() || '0',
                                name: nameEl?.textContent?.trim() || '',
                                played: parseInt(valCells?.[0]?.textContent?.trim() || '0'),
                                goals: valCells?.[4]?.textContent?.trim() || '0:0',
                                formLetters: Array.from(formEls).map(el => el.textContent?.trim() || '')
                            };
                        });
                    });

                    const toForm = (letters: string[]) => letters.map(l => l === 'V' ? 'W' : l === 'E' ? 'D' : l === 'D' ? 'L' : '').join('') || 'WWDWD';
                    const hNorm = game.home.toLowerCase();
                    const aNorm = game.away.toLowerCase();
                    let totalG = 0;
                    let totalJ = 0;

                    for (const row of rawRows) {
                        const rName = row.name.toLowerCase();
                        const isHome = rName.includes(hNorm) || hNorm.includes(rName);
                        const isAway = rName.includes(aNorm) || aNorm.includes(rName);

                        if (isHome && stats.homePos === 0) {
                            stats.homePos = parseInt(row.rank) || 5;
                            stats.homeForm = toForm(row.formLetters);
                            const parts = row.goals.split(':');
                            if (parts.length === 2) {
                                const g = parseInt(parts[0]);
                                const s = parseInt(parts[1]);
                                if (!isNaN(g) && !isNaN(s)) {
                                    totalG += (g + s);
                                    totalJ += (row.played || 1);
                                }
                            }
                        }
                        if (isAway && stats.awayPos === 0) {
                            stats.awayPos = parseInt(row.rank) || 12;
                            stats.awayForm = toForm(row.formLetters);
                            const parts = row.goals.split(':');
                            if (parts.length === 2) {
                                const g = parseInt(parts[0]);
                                const s = parseInt(parts[1]);
                                if (!isNaN(g) && !isNaN(s)) {
                                    totalG += (g + s);
                                    totalJ += (row.played || 1);
                                }
                            }
                        }
                    }
                    if (totalJ > 0) stats.avgGoals = parseFloat((totalG / totalJ).toFixed(2));
                } catch (e) {
                   console.warn(`[FlashscoreBot] ! Falha ao ler classificações: ${e}`);
                }
              }
              
              if (!stats.homePos) stats.homePos = 8;
              if (!stats.awayPos) stats.awayPos = 12;
              
              // 1.5. Extrair NOTÍCIAS e AUSÊNCIAS (Para cálculo interno)
              let newsText = "";
              let missingPlayersText = "";

              try {
                  // Voltar para Resumo se necessário
                  await page.evaluate(() => {
                      const resTab = Array.from(document.querySelectorAll('a')).find(el => el.textContent?.includes('Resumo'));
                      if (resTab) (resTab as HTMLElement).click();
                  });
                  await new Promise(r => setTimeout(r, 1000));

                  // Capturar Sumário/Previsão
                  const summaryData = await page.evaluate(async () => {
                      const showMore = Array.from(document.querySelectorAll('div, span, a')).find(el => el.textContent?.includes('Mostrar antevisão') || el.textContent?.includes('Show more preview'));
                      if (showMore instanceof HTMLElement) showMore.click();
                      await new Promise(r => setTimeout(r, 800));
                      const previewEl = document.querySelector('div[class*="preview_"]');
                      return previewEl?.textContent?.trim() || "";
                  });
                  newsText = summaryData;

                  // Capturar Ausências (Tab Formações)
                  const lineUpsTab = await page.evaluate(() => {
                      const tabs = Array.from(document.querySelectorAll('a'));
                      const tab = tabs.find(el => el.textContent?.trim() === 'Formações' || el.textContent?.trim() === 'Lineups');
                      if (tab) { (tab as HTMLElement).click(); return true; }
                      return false;
                  });

                  if (lineUpsTab) {
                      await new Promise(r => setTimeout(r, 1500));
                      missingPlayersText = await page.evaluate(() => {
                          const absenceEls = Array.from(document.querySelectorAll('div[class*="absence_"]'));
                          return absenceEls.map(el => el.textContent?.trim()).join(" | ");
                      });
                  }
              } catch (e) {
                  console.warn(`[FlashscoreBot] ! Falha ao ler notícias para ${game.home}`);
              }
              
              // 2. Extrair ODDS REAIS (Betano)
              const realOdds: Record<string, number> = {}; 
              
              try {
                  // Clicar na aba de COMPARACAO DE ODDS primeiro
                  const oddsTabClicked = await page.evaluate(() => {
                      const links = Array.from(document.querySelectorAll('a'));
                      const link = links.find(l => l.textContent?.includes('Odds'));
                      if (link) { link.click(); return true; }
                      return false;
                  });

                  if (oddsTabClicked) {
                      await new Promise(r => setTimeout(r, 2500));
                      
                      const scrapeActiveTab = async (marketNames: string[]) => {
                      try {
                          await page.waitForSelector('.ui-table__row', { timeout: 7000 });
                          const odds = await page.evaluate((names) => {
                              const rows = Array.from(document.querySelectorAll('.ui-table__row'));
                              
                              // Find specifically the Betano row
                              let targetRow = rows.find(r => 
                                r.querySelector('a[title*="Betano"]') || 
                                r.querySelector('img[alt*="Betano"]') ||
                                r.textContent?.includes('Betano')
                              );
                              
                              if (!targetRow) return null;

                              // Target the specific odd elements
                              const oddEls = Array.from(targetRow.querySelectorAll('.oddsCell__odd, [class*="oddsValue"]'));
                              const res: Record<string, number> = {};
                              
                              names.forEach((n, i) => {
                                  if (oddEls[i]) {
                                      const text = oddEls[i].textContent?.trim().replace(',', '.') || "";
                                      const val = parseFloat(text);
                                      if (!isNaN(val) && val > 1.0) res[n] = val;
                                  }
                              });
                              
                              return Object.keys(res).length > 0 ? res : null;
                          }, marketNames);
                          if (odds) Object.assign(realOdds, odds);
                      } catch (e) {
                          console.warn(`[FlashscoreBot] ! Falha na extração da aba ativa.`);
                      }
                  };

                  // A aba 1X2 costuma ser a padrão na URL de comparacao-de-odds
                  console.log(`[FlashscoreBot]    -> Mercado 1X2...`);
                  await scrapeActiveTab(["1", "X", "2"]);

                  // Clicar em Hipótese Dupla
                  console.log(`[FlashscoreBot]    -> Mercado Hipótese Dupla...`);
                  const dcTabClicked = await page.evaluate(() => {
                      const links = Array.from(document.querySelectorAll('a'));
                      const link = links.find(l => l.textContent?.includes('Hipótese Dupla'));
                      if (link) { link.click(); return true; }
                      return false;
                  });

                  if (dcTabClicked) {
                      await new Promise(r => setTimeout(r, 3000));
                      await scrapeActiveTab(["1X", "12", "X2"]);
                  }

                  // Clicar em Mais de/Menos de para Under 5.5
                  console.log(`[FlashscoreBot]    -> Mercado Mais de/Menos de (5.5)...`);
                  const ouTabClicked = await page.evaluate(() => {
                      const links = Array.from(document.querySelectorAll('a'));
                      const link = links.find(l => l.textContent?.includes('Mais de/Menos de') || l.textContent?.includes('Acima/Abaixo'));
                      if (link) { link.click(); return true; }
                      return false;
                  });

                  if (ouTabClicked) {
                                    const ouOdds = await page.evaluate(async () => {
                          // Try to expand the list first if 'Show more' exists
                          const showMore = Array.from(document.querySelectorAll('div, span, a')).find(el => el.textContent?.includes('Show more') || el.textContent?.includes('Mostrar mais'));
                          if (showMore instanceof HTMLElement) {
                              showMore.click();
                              await new Promise(r => setTimeout(r, 1000));
                          }

                          const rows = Array.from(document.querySelectorAll('.ui-table__row'));
                          const results: Record<string, number> = {};
                          
                          for (const row of rows) {
                              const text = row.textContent?.trim() || "";
                              const isBetano = text.includes('Betano') || 
                                               row.querySelector('img[alt*="Betano"]') || 
                                               row.querySelector('a[title*="Betano"]');

                              if (isBetano) {
                                  // Simplified line detection
                                  const textLower = text.toLowerCase();
                                  const has55 = textLower.includes('5.5');
                                  const has45 = textLower.includes('4.5');

                                  if (has55 || has45) {
                                      // Be extremely specific: Flashscore O/U table has columns. 
                                      // Column 0: Bookmaker
                                      // Column 1: Line (sometimes merged)
                                      // Column 2: Over Odd
                                      // Column 3: Under Odd
                                      const oddElements = Array.from(row.querySelectorAll('.oddsCell__odd, .wcl-oddsValue_X4_M8, [class*="oddsValue"]'));
                                      
                                      // If we have at least 2 odd cells, the last one is the Menos de (Under)
                                      if (oddElements.length >= 2) {
                                          const underIndex = oddElements.length - 1;
                                          const oddText = oddElements[underIndex].textContent?.trim().replace(',', '.') || "";
                                          const val = parseFloat(oddText);

                                          // Validate that we didn't pick up a line number (like 5.5) as an odd
                                          if (!isNaN(val) && val > 1.0 && val < 5.0) {
                                              const key = has55 ? 'under_5.5' : 'under_4.5';
                                              results[key] = val;
                                          }
                                      }
                                  }
                              }
                          }
                          return results;
                      });
                      
                      if (ouOdds && Object.keys(ouOdds).length > 0) {
                          Object.assign(realOdds, ouOdds);
                          console.log(`[FlashscoreBot] ✅ ODDS O/U Encontradas:`, ouOdds);
                      } else {
                          console.warn(`[FlashscoreBot] ⚠️ Falha ao localizar odds O/U para ${game.home}`);
                      }
                  }
                }
              } catch (e) {
                  console.warn(`[FlashscoreBot] ! Falha global nas odds de ${game.home}`);
              }

              console.log(`[FlashscoreBot] 💰 Odds Betano (${game.home}):`, realOdds);

              finalGames.push({
                 home: game.home,
                 away: game.away,
                 time: game.time,
                 league: game.league,
                 odds: realOdds,
                 avg_goals: stats.avgGoals,
                 home_pos: stats.homePos,
                 away_pos: stats.awayPos,
                 form_home: stats.homeForm,
                 form_away: stats.awayForm,
                 mid: game.mid
              });

          } catch (e: any) {
              console.log(`[FlashscoreBot] ⚠️ Falha na leitura completa de ${game.home}. (${e.message.slice(0,25)}...). Utilizando Fallback...`);
              finalGames.push({
                 home: game.home,
                 away: game.away,
                 time: game.time,
                 league: game.league,
                 odds: { 
                      "1": 0, 
                      "X": 0, 
                      "2": 0, 
                      "under_5.5": 0 
                 },
                  avg_goals: 0,
                  home_pos: 0,
                  away_pos: 0,
                  form: "",
                  h2h_un55_pct: 0,
                  mid: game.mid
               });
          }
      }

      if (finalGames.length > 0) {
        await saveLiveOdds(finalGames);
        console.log(`[FlashscoreBot] 💾 Guardados ${finalGames.length} jogos reais e atualizados no Supabase (live_odds).`);
      } else {
        console.log(`[FlashscoreBot] ⚠️ Zero jogos extraídos. Possivelmente a classe CSS mudou ou não há jogos abertos.`);
      }
      
    } catch (error: any) {
      console.error("[FlashscoreBot] ❌ Erro Crítico ao raspar Flashscore:", error.message);
      console.log("[FlashscoreBot] Fallback: Utilizando cache existente offline.");
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  /**
   * DEEP RESULT SCRAPER
   * Visita a página específica do jogo para obter o resultado final (mesmo se terminado).
   */
  static async getMatchResult(mid: string): Promise<{ home: number, away: number, status: string } | null> {
    let browser;
    try {
      browser = await puppeteer.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

      const url = `https://www.flashscore.pt/jogo/${mid}/`;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await new Promise(r => setTimeout(r, 2000));

      const result = await page.evaluate(() => {
          const scoreEl = document.querySelector('.detailScore__wrapper');
          if (!scoreEl) return null;

          const scores = Array.from(scoreEl.querySelectorAll('span'));
          if (scores.length < 3) return null;

          // Check for postponed/cancelled status
          const statusEl = document.querySelector('.fixedHeader__status');
          const status = statusEl ? statusEl.textContent?.trim() : "FT";

          return {
              home: parseInt(scores[0].textContent || "0"),
              away: parseInt(scores[2].textContent || "0"),
              status: status || "FT"
          };
      });

      return result;
    } catch (error) {
      console.error(`[FlashscoreBot] ❌ Erro ao verificar resultado do MID ${mid}:`, error);
      return null;
    } finally {
      if (browser) await browser.close();
    }
  }
}
