import { NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    const { action, offset = 0 } = await req.json();

    if (!supabase) {
      return NextResponse.json({ success: false, error: "Database not connected" });
    }

    // Na Vercel, apenas lemos os dados que o teu Script Local (cloud_sync.js) enviou.
    console.log("A ler jogos da Cloud Supabase...");
    
    // Vamos buscar apenas jogos recentes (últimas 24h) com maior confiança
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: matches, error } = await supabase
      .from('betting_predictions')
      .select('*')
      .gt('created_at', last24h)
      .order('created_at', { ascending: false })
      .range(offset, offset + 9);

    if (error) throw error;

    return NextResponse.json({ 
      success: true, 
      matches: matches || [], 
      sessionId: "cloud-session" 
    });

  } catch (err) {
    console.error("API Error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
