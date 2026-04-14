import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';

export const supabase = (supabaseUrl && supabaseUrl.startsWith('http')) 
  ? createClient(supabaseUrl, supabaseKey) 
  : null;

export async function saveMatches(matches, sessionId) {
  if (!supabase) return [];
  if (!matches || matches.length === 0) return [];

  const records = matches.map(m => ({
    ...m,
    session_id: sessionId
  }));

  const { data, error } = await supabase
    .from('betting_predictions')
    .insert(records);

  if (error) {
    console.error('Supabase Insert Error:', error);
    throw error;
  }
  return data;
}
