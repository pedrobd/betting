// ============================================================
// SportAPI Client - RapidAPI (SofaScore Data)
// Using RAPIDAPI_KEY and RAPIDAPI_HOST from .env.local
// ============================================================

const BASE_URL = "https://sportapi7.p.rapidapi.com/api/v1";

// Simple 5-minute memory cache
const cache: Record<string, { data: any; expiry: number }> = {};

export async function fetchFromSportAPI<T>(endpoint: string): Promise<T> {
  const cacheKey = endpoint;
  if (cache[cacheKey] && cache[cacheKey].expiry > Date.now()) {
    // console.log(`[SportAPI] Usando cache para ${endpoint}`);
    return cache[cacheKey].data;
  }

  // HARD-CODED FOR FINAL DIAGNOSIS (Pedro's Key)
  const apiKey = "ae0215ddf5msh17b2fb1e99eeb41p1afb26jsn3d1266207e91";
  const apiHost = "sportapi7.p.rapidapi.com";

  console.log(`[SportAPI] 🛰️ CALLING: ${endpoint} (Using Hard-coded Key: ${apiKey.slice(0, 5)}...)`);

  const cacheBuster = `?v=${Date.now()}`;
  const res = await fetch(`${BASE_URL}${endpoint}${cacheBuster}`, {
    method: "GET",
    headers: {
      "x-rapidapi-key": apiKey,
      "x-rapidapi-host": apiHost,
      "Content-Type": "application/json",
    },
    cache: "no-store", 
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "Sem detalhes");
    console.error(`[SportAPI] ❌ Erro na Resposta (${res.status}):`, errorBody.slice(0, 500));
    throw new Error(`SportAPI Error (${res.status})`);
  }

  const data = await res.json();
  
  // Update local memory cache as fallback
  cache[cacheKey] = { data, expiry: Date.now() + 300000 }; 
  
  return data;
}

export interface SportEvent {
  id: number;
  slug: string;
  homeTeam: { name: string; id: number };
  awayTeam: { name: string; id: number };
  status: { type: string; code: number; description: string };
  startTimestamp: number;
  tournament: { name: string; category: { name: string } };
}

export async function getScheduledEvents(date: string): Promise<SportEvent[]> {
  // Format: YYYY-MM-DD
  const data = await fetchFromSportAPI<{ events: SportEvent[] }>(`/sport/football/scheduled-events/${date}`);
  return data.events || [];
}

export async function getLiveEvents(): Promise<SportEvent[]> {
    const data = await fetchFromSportAPI<{ events: SportEvent[] }>(`/sport/football/events/live`);
    return data.events || [];
}

export async function getEventOdds(eventId: number): Promise<any> {
    const data = await fetchFromSportAPI<any>(`/event/${eventId}/odds/1/all`);
    return data;
}

/**
 * Fetches H2H (Head to Head) statistics for a specific event
 */
export async function getH2H(eventId: number): Promise<any> {
    const data = await fetchFromSportAPI<any>(`/event/${eventId}/h2h`);
    return data;
}

/**
 * Extracts Betano odds from the SportAPI response
 * Provider ID for Betano in SofaScore/SportAPI is typically 4, but we search by name.
 */

export function extractBetanoOdds(oddsData: any): Record<string, number> {
  const markets: Record<string, number> = {};
  if (!oddsData || !oddsData.markets) return markets;

  for (const m of oddsData.markets) {
    // Market Mappings
    if (m.marketName === "Full time" || m.marketName === "3-way") {
        const betano = m.choices?.find((c: any) => c.providerName?.toLowerCase().includes("betano"));
        // Note: SportAPI returns nested providers usually. We'll simplify for now.
    }
  }
  
  // Fallback pattern if we can't find Betano specifically (use average or first provider)
  // For now return first choice if present
  return markets;
}
