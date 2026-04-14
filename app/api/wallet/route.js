import { NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!supabase) return NextResponse.json({ success: false, error: "Database not connected" });
  const { data, error } = await supabase.from('wallets').select('balance').eq('id', 1).single();
  if (error) return NextResponse.json({ success: false, error: error.message });
  return NextResponse.json({ success: true, balance: parseFloat(data.balance) });
}

export async function POST(req) {
  if (!supabase) return NextResponse.json({ success: false, error: "Database not connected" });
  const { amount, action } = await req.json(); 
  
  const { data: wallet } = await supabase.from('wallets').select('balance').eq('id', 1).single();
  let newBalance = parseFloat(wallet.balance);
  
  if (action === 'charge') newBalance -= parseFloat(amount);
  if (action === 'reward') newBalance += parseFloat(amount);
  
  const { data, error } = await supabase.from('wallets').update({ balance: newBalance }).eq('id', 1).select();
  if (error) return NextResponse.json({ success: false, error: error.message });
  
  return NextResponse.json({ success: true, balance: parseFloat(data[0].balance) });
}
