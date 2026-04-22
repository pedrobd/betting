import { NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabase';

export const dynamic = 'force-dynamic';

// GET /api/result — estatísticas de acerto + calibração por banda de confiança
export async function GET() {
  if (!supabase) return NextResponse.json({ success: false, error: 'DB not connected' });

  const { data, error } = await supabase
    .from('betting_predictions')
    .select('match_result, confidence, is_value_bet, ev, bk_margin')
    .not('match_result', 'is', null);

  if (error) return NextResponse.json({ success: false, error: error.message });

  const total = data.length;
  const wins = data.filter(r => r.match_result === 'W').length;

  // 4 buckets de confiança mais finos (>= 60 já é filtrado na fetch de jogos)
  const bands = {
    ultra:  { label: '≥85%',   w: 0, t: 0 }, // ultra alta confiança
    high:   { label: '75-84%', w: 0, t: 0 },
    mid:    { label: '65-74%', w: 0, t: 0 },
    low:    { label: '60-64%', w: 0, t: 0 },
  };

  // Value Bets separadas
  const valueBets = { w: 0, t: 0 };

  data.forEach(r => {
    const c = r.confidence || 0;
    const bucket = c >= 85 ? 'ultra' : c >= 75 ? 'high' : c >= 65 ? 'mid' : 'low';
    bands[bucket].t++;
    if (r.match_result === 'W') bands[bucket].w++;
    if (r.is_value_bet) {
      valueBets.t++;
      if (r.match_result === 'W') valueBets.w++;
    }
  });

  // ROI médio (quando temos EV registado)
  const evSamples = data.filter(r => r.ev !== null && r.ev !== undefined);
  const avgEV = evSamples.length > 0
    ? parseFloat((evSamples.reduce((s, r) => s + (r.ev || 0), 0) / evSamples.length).toFixed(1))
    : null;

  const avgMargin = data.filter(r => r.bk_margin).length > 0
    ? parseFloat((data.filter(r => r.bk_margin).reduce((s, r) => s + r.bk_margin, 0) / data.filter(r => r.bk_margin).length).toFixed(1))
    : null;

  return NextResponse.json({
    success: true,
    total,
    wins,
    winRate: total > 0 ? parseFloat(((wins / total) * 100).toFixed(1)) : 0,
    bands,
    valueBets,
    avgEV,
    avgMargin,
  });
}

// POST /api/result — registar resultado de um jogo
export async function POST(req) {
  if (!supabase) return NextResponse.json({ success: false, error: 'DB not connected' });

  const { id, result, homeScore, awayScore } = await req.json();
  if (!id) return NextResponse.json({ success: false, error: 'id obrigatório' });
  if (result !== null && !['W', 'D', 'L'].includes(result)) {
    return NextResponse.json({ success: false, error: 'result deve ser W, D, L ou null' });
  }

  const update = { match_result: result ?? null };
  if (homeScore !== undefined) update.result_home_score = homeScore;
  if (awayScore !== undefined) update.result_away_score = awayScore;

  const { error } = await supabase
    .from('betting_predictions')
    .update(update)
    .eq('id', id);

  if (error) return NextResponse.json({ success: false, error: error.message });
  return NextResponse.json({ success: true });
}
