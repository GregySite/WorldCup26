// FICHIER TEMPORAIRE DE TEST - à supprimer après
const KEY = process.env.ZAFRONIX_KEY;
const BASE = 'https://api.zafronix.com/fifa/worldcup/v1';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  try {
    // Test match M89 (Paraguay vs France, 2026-089)
    const r = await fetch(`${BASE}/matches/2026-089`, {
      headers: { 'X-API-Key': KEY }
    });
    const data = await r.json();
    // Return just goals for debugging
    return res.status(200).json({ goals: data.goals, full: data });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
