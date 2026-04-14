import { NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!supabase) return NextResponse.json({ success: false, error: "Database not connected" });
  const { data, error } = await supabase.from('bet_slips').select('*').order('created_at', { ascending: false });
  if (error) return NextResponse.json({ success: false, error: error.message });
  return NextResponse.json({ success: true, bets: data });
}

export async function POST(req) {
  if (!supabase) return NextResponse.json({ success: false, error: "Database not connected" });
  const body = await req.json();
  
  const record = {
    matches: body.matches,
    stake: body.stake,
    total_odd: body.totalOdd,
    potential_return: body.potentialReturn,
    status: 'PENDING'
  };
  
  const { data, error } = await supabase.from('bet_slips').insert(record).select();
  if (error) return NextResponse.json({ success: false, error: error.message });
  return NextResponse.json({ success: true, bet: data[0] });
}

export async function PATCH(req) {
  if (!supabase) return NextResponse.json({ success: false, error: "Database not connected" });
  const { id, status } = await req.json();
  
  const { data, error } = await supabase.from('bet_slips').update({ status }).eq('id', id).select();
  if (error) return NextResponse.json({ success: false, error: error.message });
  return NextResponse.json({ success: true, bet: data[0] });
}
