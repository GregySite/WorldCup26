// FICHIER TEMPORAIRE DE TEST - à supprimer après
const KEY = process.env.ZAFRONIX_KEY;
const BASE = 'https://api.zafronix.com/fifa/worldcup/v1';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const r = await fetch(`${BASE}/matches?year=2026`, {
      headers: { 'X-API-Key': KEY }
    });
    const data = await r.json();
    // Show structure: top-level keys and first match
    const matches = data.data || data.matches || (Array.isArray(data) ? data : []);
    return res.status(200).json({
      topKeys: Object.keys(data),
      totalMatches: matches.length,
      firstMatch: matches[0] ? {
        id: matches[0].id,
        matchNo: matches[0].matchNo,
        homeTeam: matches[0].homeTeam,
        awayTeam: matches[0].awayTeam,
        goals: matches[0].goals,
      } : null
    });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
