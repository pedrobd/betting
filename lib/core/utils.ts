/**
 * UNIVERSAL TEAM NORMALIZATION
 * Cleans names and maps synonyms to ensure 100% match between APIs
 */
export function normalizeTeamName(name: string): string {
  if (!name) return "";
  
  let n = name.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/[^a-z0-9]/g, "") // Remove everything but chars
    .replace(/\b(fc|cf|united|utd|as|sc|cp|sl|city|town|wanderers|rovers|athletic|atletico|real|sporting|vitoria|club|association|calcio|1907)\b/g, "") // Remove suffixes
    .trim();
  
  // Synonyms Mapping (FlashLive vs API-Sports vs SofaScore)
  const synonyms: Record<string, string> = {
    "manutd": "manchesterunited",
    "mancity": "manchestercity",
    "tottenham": "tottenhamhotspur",
    "spurs": "tottenhamhotspur",
    "forest": "nottinghamforest",
    "wolves": "wolverhamptonwanderers",
    "leicester": "leicestercity",
    "palace": "crystalpalace",
    "osasuna": "osasuna",
    "osuna": "osasuna",
    "alaves": "deportivoalaves",
    "bilbao": "athleticclub",
    "betis": "realbetis",
    "sociedad": "realsociedad",
    "valencia": "valenciacf",
    "villa": "astonvilla",
    "gladbach": "borussiamglonchengladbach",
    "mgladbach": "borussiamglonchengladbach",
    "hike": "hik",
    "sae": "asane",
    "aane": "asane"
  };

  return synonyms[n] || n;
}
