export async function fetchTeamNews(teamName) {
  try {
    const query = encodeURIComponent(`${teamName} equipa futebol lesões`);
    const res = await fetch(`https://news.google.com/rss/search?q=${query}&hl=pt-PT&gl=PT`, {
       headers: { "User-Agent": "Mozilla/5.0" }
    });
    
    const xml = await res.text();
    // Dividir os blocos <item> (ignorar o header [0]) e focar nas 3 primeiras noticias
    const items = xml.split('<item>').slice(1, 4);
    
    let text = "";
    for (let item of items) {
       const titleMatch = item.match(/<title>(.*?)<\/title>/);
       if (titleMatch) {
         // Limpar as tags CDATA do XML para a string ficar pura para a AI
         text += titleMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1') + ". ";
       }
    }
    
    return text;
  } catch (error) {
    console.error(`Erro ao obter noticias do GNews para ${teamName}:`, error.message);
    return "";
  }
}
