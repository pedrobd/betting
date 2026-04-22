import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

await page.goto('https://www.flashscore.pt/', { waitUntil: 'domcontentloaded', timeout: 30000 });
await new Promise(r => setTimeout(r, 3000));

try {
  const cookieBtn = await page.$('#onetrust-accept-btn-handler');
  if (cookieBtn) { await cookieBtn.click(); await new Promise(r => setTimeout(r, 1000)); }
} catch(e) {}

await page.waitForSelector('.event__match', { timeout: 15000 }).catch(() => {});

// Inspecionar a estrutura real das odds
const result = await page.evaluate(() => {
  const match = document.querySelector('.event__match');
  if (!match) return { error: 'No match found' };

  // Tentar varios selectores de odds
  const selectors = [
    '.odds__odd',
    '.EventOdds__odd',
    '[class*="odds"]',
    '[class*="Odds"]',
    '.o_1', '.o_x', '.o_2',
    'a[data-odd]',
    '[class*="odd"]'
  ];

  const results = {};
  selectors.forEach(sel => {
    const els = match.querySelectorAll(sel);
    results[sel] = Array.from(els).slice(0, 3).map(el => ({
      text: el.innerText?.trim(),
      className: el.className
    }));
  });

  // HTML bruto dos primeiros 500 chars do match
  results._html = match.innerHTML.substring(0, 800);
  results._matchClass = match.className;

  // Total de jogos
  results._totalMatches = document.querySelectorAll('.event__match').length;

  return results;
});

console.log('Total de jogos na página:', result._totalMatches);
console.log('Match class:', result._matchClass);
console.log('\n--- ODDS SELECTORS ---');
for (const [sel, vals] of Object.entries(result)) {
  if (sel.startsWith('_')) continue;
  if (vals.length > 0) console.log(`✅ "${sel}":`, vals);
}
console.log('\n--- HTML SNIPPET ---');
console.log(result._html);

await browser.close();
process.exit(0);
