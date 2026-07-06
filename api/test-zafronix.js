// FICHIER TEMPORAIRE DE TEST - à supprimer après
const KEY = process.env.ZAFRONIX_KEY;
const BASE = 'https://api.zafronix.com/fifa/worldcup/v1';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const matchNos = [73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96];
  const results = {};
  for (const no of matchNos) {
    try {
      const r = await fetch(`${BASE}/matches/2026-${String(no).padStart(3,'0')}`, {
        headers: { 'X-API-Key': KEY }
      });
      const d = await r.json();
      if (d.status === 'finished' && d.goals) {
        results[`M${no}`] = d.goals.map(g => ({
          minute: g.minute,
          added: g.addedMinute || 0,
          scorer: g.scorer,
          team: g.team,
          type: g.type || null
        }));
      }
    } catch(e) {}
  }
  return res.status(200).json(results);
}
