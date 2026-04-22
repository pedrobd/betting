import { NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    const { action, offset = 0 } = await req.json();

    if (!supabase) {
      return NextResponse.json({ success: false, error: "Database not connected" });
    }

    const last48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    const { data: matches, error } = await supabase
      .from('betting_predictions')
      .select('*')
      .gt('created_at', last48h)
      .gte('confidence', 60)
      .order('created_at', { ascending: false }); // mais recentes primeiro para dedup

    if (error) throw error;

    // Deduplicação na API — fica com o registo mais recente de cada jogo
    const seen = new Set();
    const deduped = (matches || []).filter(m => {
      const key = `${m.team_home}|${m.team_away}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const now = new Date();
    const upcoming = deduped.filter(m => {
      if (!m.time || !m.time.includes(':')) return true;
      const [hh, mm] = m.time.split(':').map(Number);

      // Verifica se o jogo ainda é hoje (futuro)
      const candidateToday = new Date(now);
      candidateToday.setHours(hh, mm, 0, 0);
      if (candidateToday.getTime() > now.getTime()) return true;

      // Pode ser amanhã se o sync foi recente (< 30h)
      const syncedRecently = (now - new Date(m.created_at)) < 30 * 60 * 60 * 1000;
      return syncedRecently;
    });

    // Ordena por hora crescente (mais cedo primeiro)
    upcoming.sort((a, b) => {
      const toMin = (t) => {
        if (!t || !t.includes(':')) return 9999;
        const [hh, mm] = t.split(':').map(Number);
        return hh * 60 + mm;
      };
      return toMin(a.time) - toMin(b.time);
    });

    const page = upcoming.slice(offset, offset + 20);

    return NextResponse.json({
      success: true,
      matches: page,
      total: upcoming.length,
      sessionId: "cloud-session"
    });

  } catch (err) {
    console.error("API Error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
