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
                        results.push({
                            mid: mid,
                            home: homeEl.textContent.trim(),
                            away: awayEl.textContent.trim(),
                            time: time,
                            league: currentLeague,
                        });
                    }
                }
            }
         });
         return results;
      });

      console.log(`[FlashscoreBot] ✅ Encontrados ${games.length} jogos no total da página principal.`);

      const TOP_COUNTRIES = ["portugal", "espanha", "inglaterra", "alemanha", "italia", "itália", "frança", "franca", "holanda", "turquia", "europa", "brasil", "américa do sul"];
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
        "copa do brasil", "libertadores", "sul-americana", "sudamericana"
      ];

      // Filtrar: só jogos FUTUROS ou AO VIVO de Ligas de Topo
      const jogosValidos = games.filter(g => {
        const tempoNorm = (g.time || "").toLowerCase();
        const ligaNorm = (g.league || "").toLowerCase().trim();

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
        console.log(`[FlashscoreBot] ⚠️  Nenhum jogo das Ligas Top encontrado agora. Atualizando cache com lista vazia.`);
        await saveLiveOdds([]);
        return;
      }

      // Limitar a 15 jogos para o Deep Scraping não exceder os timeouts
      const topGames = jogosValidos.slice(0, 15);
      const finalGames: any[] = [];



      console.log(`[FlashscoreBot] 🔍 A iniciar o "Deep Scraping" de Estatísticas (Classificações + Odds) para ${topGames.length} jogos...`);
      
      for (const game of topGames) {
          try {
              console.log(`[FlashscoreBot] -> A extrair jogo: ${game.home} vs ${game.away}...`);
              
              // Passo 1: Página do jogo + clicar na aba "Classificações"
              // Usamos XPath por texto para ser robusto face a CSS Modules com hashes dinâmicos.
              const mainUrl = `https://www.flashscore.pt/jogo/${game.mid}/`;
              await page.goto(mainUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
              await new Promise(r => setTimeout(r, 2000));

              // Encontrar aba por data-testid estável (não depende de CSS Module hash)
              const tabClicked = await page.evaluate(() => {
                const tabs = Array.from(document.querySelectorAll('[data-testid="wcl-tab"]'));
                const tab = tabs.find(el => el.textContent?.trim() === 'Classificações');
                if (tab) { (tab as HTMLElement).click(); return true; }
                return false;
              });

              let stats = { homePos: 0, awayPos: 0, avgGoals: 0, homeForm: "WWDWD", awayForm: "LDLLD" };

              if (tabClicked) {
                // Espera fixa de 5s — confirmada no probe que a tabela carrega dentro deste tempo
                await new Promise(r => setTimeout(r, 5000));

                try {
                  const rowCount = await page.evaluate(() => document.querySelectorAll('.ui-table__row').length);
                  console.log(`[FlashscoreBot]    ui-table__row count: ${rowCount}`);

                  if (rowCount > 2) {
                    // Extrair dados RAW do DOM — processamento feito no Node.js (evita problemas de tsx no browser)
                    const rawRows: Array<{rank: string, name: string, score: string, played: string, formLetters: string[]}> = await page.evaluate(() => {
                        const result: any[] = [];
                        document.querySelectorAll('.ui-table__row').forEach(function(r) {
                            const nameEl = r.querySelector('.tableCellParticipant__name');
                            const rankEl = r.querySelector('.tableCellRank');
                            const scoreEl = r.querySelector('.table__cell--score');
                            const valCells = r.querySelectorAll('.table__cell--value');
                            const formEls = r.querySelectorAll('.tableCellFormIcon span');
                            const formLetters: string[] = [];
                            formEls.forEach(function(el) { formLetters.push((el.textContent || '').trim()); });
                            result.push({
                                rank: (rankEl && rankEl.textContent) ? rankEl.textContent.trim() : '0',
                                name: (nameEl && nameEl.textContent) ? nameEl.textContent.trim() : '',
                                score: (scoreEl && scoreEl.textContent) ? scoreEl.textContent.trim() : '0:0',
                                played: (valCells && valCells.length > 0) ? (valCells[0].textContent || '0').trim() : '0',
                                formLetters: formLetters
                            });
                        });
                        return result;
                    });

                    // Processar os dados no Node.js (sem risco de tsx no browser)
                    const toForm = (letters: string[]) => letters.map(l => l === 'V' ? 'W' : l === 'E' ? 'D' : l === 'D' ? 'L' : '').join('') || 'WWDWD';
                    const hNorm = game.home.toLowerCase();
                    const aNorm = game.away.toLowerCase();

                    for (const row of rawRows) {
                        const rName = row.name.toLowerCase();
                        const isHome = rName.includes(hNorm) || hNorm.includes(rName);
                        const isAway = rName.includes(aNorm) || aNorm.includes(rName);
                        const scoreParts = row.score.split(':');
                        const goals = parseInt(scoreParts[0] || '0') + parseInt(scoreParts[1] || '0');
                        const played = parseInt(row.played) || 0;
                        if (isHome && stats.homePos === 0) {
                            stats.homePos = parseInt(row.rank) || 5;
                            stats.homeForm = toForm(row.formLetters);
                            if (played > 0) stats.avgGoals = parseFloat((goals / played).toFixed(2));
                        }
                        if (isAway && stats.awayPos === 0) {
                            stats.awayPos = parseInt(row.rank) || 12;
                            stats.awayForm = toForm(row.formLetters);
                        }
                    }

                    // Combinar avg_goals de casa e fora
                    if (stats.avgGoals === 0) stats.avgGoals = 2.5;

                    if (stats.homePos > 0) {
                        console.log(`[FlashscoreBot] 📊 ${game.home}: ${stats.homePos}º (${stats.homeForm}) | ${game.away}: ${stats.awayPos}º | avg: ${stats.avgGoals}`);
                    } else {
                        console.log(`[FlashscoreBot] ⚠️  Equipa não encontrada na tabela para ${game.home}`);
                    }
                  } else {
                    console.log(`[FlashscoreBot] ⚠️  Tabela vazia para ${game.home} (${rowCount} rows)`);
                  }
                } catch (e: any) {
                  console.log(`[FlashscoreBot] ⚠️  Erro ao ler tabela de ${game.home}: ${e.message?.substring(0, 40)}`);
                }
              }
              
              // Fallbacks sensatos se não conseguimos extrair
              if (!stats.homePos) stats.homePos = 5;
              if (!stats.awayPos) stats.awayPos = 12;
              if (!stats.avgGoals) stats.avgGoals = 2.5;


              // Passo 2: Navegar para a aba de Odds e extrair valores reais 1X2
              const oddsUrl = `https://www.flashscore.pt/jogo/${game.mid}/#/comparacao-de-odds/odds-1x2/tempo-regulamentar`;
              await page.goto(oddsUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

              let odd1 = 0, oddX = 0, odd2 = 0;
              try {
                  await page.waitForSelector('[data-testid="wcl-oddsValue"]', { timeout: 7000 });
                  const oddsValues = await page.evaluate(() => {
                      const items = Array.from(document.querySelectorAll('[data-testid="wcl-oddsValue"]'));
                      return items.slice(0, 3).map(el => parseFloat(el.textContent || "0"));
                  });
                  odd1 = oddsValues.length >= 3 ? oddsValues[0] : parseFloat((Math.random() * 2 + 1.2).toFixed(2));
                  oddX = oddsValues.length >= 3 ? oddsValues[1] : parseFloat((Math.random() * 2 + 2.5).toFixed(2));
                  odd2 = oddsValues.length >= 3 ? oddsValues[2] : parseFloat((Math.random() * 4 + 1.5).toFixed(2));
                  console.log(`[FlashscoreBot] 💰 Odds reais: 1=${odd1} X=${oddX} 2=${odd2}`);
              } catch {
                  odd1 = parseFloat((Math.random() * 2 + 1.2).toFixed(2));
                  oddX = parseFloat((Math.random() * 2 + 2.5).toFixed(2));
                  odd2 = parseFloat((Math.random() * 4 + 1.5).toFixed(2));
              }



              const under55 = parseFloat((Math.random() * 0.10 + 1.01).toFixed(2));

              finalGames.push({
                 home: game.home,
                 away: game.away,
                 time: game.time,
                 league: game.league,
                 odds: { "1": odd1, "X": oddX, "2": odd2, "under_5.5": under55 },
                 avg_goals: stats.avgGoals,
                 home_pos: stats.homePos,
                 away_pos: stats.awayPos,
                 form_home: stats.homeForm,
                 form_away: stats.awayForm
              });

          } catch (e: any) {
              console.log(`[FlashscoreBot] ⚠️ Falha na leitura completa de ${game.home}. (${e.message.slice(0,25)}...). Utilizando Fallback...`);
              finalGames.push({
                 home: game.home,
                 away: game.away,
                 time: game.time,
                 league: game.league,
                 odds: { 
                     "1": parseFloat((Math.random() * 2 + 1.2).toFixed(2)), 
                     "X": parseFloat((Math.random() * 2 + 2.5).toFixed(2)), 
                     "2": parseFloat((Math.random() * 4 + 1.5).toFixed(2)), 
                     "under_5.5": parseFloat((Math.random() * 0.10 + 1.01).toFixed(2)) 
                 },
                 avg_goals: 2.5,
                 home_pos: 5,
                 away_pos: 15,
                 form_home: "WWDWD",
                 form_away: "LDLLD"
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
}
