import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Client-side (browser) — uses anon key
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabase = createClient<any>(supabaseUrl, supabaseAnonKey);

// Server-side (API routes) — uses service role key when available
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createServerClient() {
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey;
  return createClient<any>(supabaseUrl, key, { auth: { persistSession: false } });
}
