import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || '';

// Cliente público (anon key) — usado no frontend/API
export const supabase = (supabaseUrl && supabaseUrl.startsWith('http')) 
  ? createClient(supabaseUrl, supabaseKey) 
  : null;

// Cliente privilegiado (service key) — bypassa RLS, usar apenas em scripts locais/server
export const supabaseAdmin = (supabaseUrl && supabaseServiceKey)
  ? createClient(supabaseUrl, supabaseServiceKey)
  : supabase; // fallback para o cliente normal

export async function saveMatches(matches, sessionId) {
  const client = supabaseAdmin || supabase;
  if (!client) return [];
  if (!matches || matches.length === 0) return [];

  const records = matches.map(m => ({
    ...m,
    session_id: sessionId
  }));

  const { data, error } = await client
    .from('betting_predictions')
    .insert(records);

  if (error) {
    console.error('Supabase Insert Error:', error);
    throw error;
  }
  return data;
}

