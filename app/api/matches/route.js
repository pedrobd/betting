import { NextResponse } from 'next/server';
import { getDailyMatches, getH2hForm } from '../../../lib/flashscore';
import { fetchTeamNews } from '../../../lib/news';
import { analyzeTextSentiment, calculateConfidence, constructReasoning } from '../../../lib/analyzer';
import { saveMatches, supabase } from '../../../lib/supabase';

export async function POST(req) {
  try {
    const { action, sessionId = null, offset = 0 } = await req.json();

    // Ação: Iniciar / Raspar os dados
    if (action === 'init') {
      const rawMatches = await getDailyMatches();
      const processedMatches = [];
      const newSessionId = sessionId || Math.random().toString(36).substring(2);

      for (let raw of rawMatches) {
        // Pausa de 1,5 segundos entre pesquisas para que o DuckDuckGo não bloqueie a sua API por "too quickly"
        await new Promise(r => setTimeout(r, 1500));
        
        const formWon = getH2hForm();
        const newsText = await fetchTeamNews(raw.team_home);
        const sentimentData = analyzeTextSentiment(newsText);
        const conf = calculateConfidence(raw.odd, formWon, sentimentData.sentimentModifier);
        const reasoning = constructReasoning(raw.odd, conf, sentimentData.reasoning);

        processedMatches.push({
          time: raw.time,
          team_home: raw.team_home,
          team_away: raw.team_away,
          odd: raw.odd,
          confidence: conf,
          reasoning: reasoning
        });
      }

      // Guardar na BD só se estiver configurado env variables para o supabase
      if (supabase) {
         try {
           await saveMatches(processedMatches, newSessionId);
         } catch(e) {
           console.log("Falha ao salvar no supabase DB", e);
         }
      }

      return NextResponse.json({ success: true, sessionId: newSessionId, matches: processedMatches });
    }

    // Ação: Lógica para carregar via DB e obter mais (Paginação)
    if (action === 'load_more' && sessionId) {
      if (supabase) {
         const { data, error } = await supabase
            .from('betting_predictions')
            .select('*')
            .eq('session_id', sessionId)
            .order('confidence', { ascending: false })
            .range(offset, offset + 9);
            
         if (error) throw error;
         return NextResponse.json({ success: true, matches: data });
      } else {
         return NextResponse.json({ success: true, matches: [], error: "Supabase n configurado" });
      }
    }

    return NextResponse.json({ success: false, error: "Ação Inválida" }, { status: 400 });

  } catch (err) {
    console.error("API Error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
