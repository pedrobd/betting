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
    
    // Vamos buscar os 10 jogos com maior confiança
    const { data: matches, error } = await supabase
      .from('betting_predictions')
      .select('*')
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
