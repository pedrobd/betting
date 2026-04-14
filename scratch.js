export async function fetchTeamNews(teamName) {
  try {
    const query = encodeURIComponent(`${teamName} futebol lesões notícias`);
    const res = await fetch(`https://news.google.com/rss/search?q=${query}&hl=pt-PT&gl=PT`, {
       headers: { "User-Agent": "Mozilla/5.0" }
    });
    const xml = await res.text();
    const items = xml.split('<item>').slice(1, 4);
    let text = "";
    for (let item of items) {
       const titleMatch = item.match(/<title>(.*?)<\/title>/);
       if (titleMatch) text += titleMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1') + ". ";
    }
    console.log("Noticias:", text);
    return text;
  } catch (error) {
    console.error(`Erro GNews:`, error.message);
    return "";
  }
}
fetchTeamNews("Gremio");
