// FICHIER TEMPORAIRE DE TEST - à supprimer après
const KEY = process.env.ZAFRONIX_KEY;
const BASE = 'https://api.zafronix.com/fifa/worldcup/v1';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const matchNo = parseInt(req.query.m || '97');
  try {
    const r = await fetch(`${BASE}/matches/2026-${String(matchNo).padStart(3,'0')}`, {
      headers: { 'X-API-Key': KEY }
    });
    const d = await r.json();
    return res.status(200).json({
      status: d.status,
      goals: d.goals,
      liveMinute: d.liveMinute,
      livePhase: d.livePhase,
    });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
