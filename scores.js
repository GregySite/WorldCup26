// Vercel Serverless Function
// Proxies football-data.org — hides API key, adds CORS headers
// Free plan: 10 req/min, no daily limit — perfect for 30s refresh

const API_KEY = process.env.FOOTBALLDATA_KEY;
const BASE    = 'https://api.football-data.org/v4';

// football-data.org team name → our internal names
const TEAM_MAP = {
  'Korea Republic':           'South Korea',
  'Czechia':                  'Czech Republic',
  'Bosnia and Herzegovina':   'Bosnia-Herzegovina',
  'United States':            'USA',
  'Türkiye':                  'Turkey',
  "Côte d'Ivoire":            'Ivory Coast',
  'IR Iran':                  'Iran',
  'Cabo Verde':               'Cape Verde',
  'Congo DR':                 'DR Congo',
  'Democratic Republic of Congo': 'DR Congo',
};
function mapTeam(n) { return TEAM_MAP[n] || n; }

async function apiFetch(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'X-Auth-Token': API_KEY },
  });
  if (!res.ok) throw new Error(`football-data.org ${res.status}`);
  return res.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  // Cache 25s on Vercel edge — safe for 30s client refresh
  res.setHeader('Cache-Control', 's-maxage=25, stale-while-revalidate=30');

  if (!API_KEY) {
    return res.status(500).json({ error: 'FOOTBALLDATA_KEY not set' });
  }

  try {
    const scores  = {};
    const liveIds = [];

    // Single call gets everything: live + finished
    // status=LIVE,FINISHED avoids needing two separate requests
    const data = await apiFetch('/competitions/WC/matches?status=LIVE,FINISHED,IN_PLAY,PAUSED');

    for (const match of data.matches || []) {
      const ft   = match.score?.fullTime;
      const live = ['IN_PLAY', 'PAUSED', 'HALFTIME'].includes(match.status);
      const done = match.status === 'FINISHED';

      // For live: use current score (score.fullTime during play = current score)
      const scoreData = live ? (match.score?.fullTime ?? match.score?.halfTime) : ft;
      if (!scoreData || scoreData.home == null) continue;

      const home = mapTeam(match.homeTeam.name);
      const away = mapTeam(match.awayTeam.name);
      const mid  = findMatchId(home, away);
      if (!mid) continue;

      scores[mid.id] = mid.homeIsFirst
        ? [scoreData.home, scoreData.away]
        : [scoreData.away, scoreData.home];

      if (live) liveIds.push(mid.id);
    }

    return res.status(200).json({
      updated: new Date().toISOString(),
      matches: scores,
      live:    liveIds,
    });

  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: e.message });
  }
}

// ── Match ID lookup (group-localIndex, mirrors frontend) ──
const MATCH_LOOKUP = (() => {
  const raw = [
    ['A','Mexico','South Africa'],        ['A','South Korea','Czech Republic'],
    ['B','Canada','Bosnia-Herzegovina'],  ['B','Switzerland','Qatar'],
    ['C','Brazil','Morocco'],             ['C','Haiti','Scotland'],
    ['D','USA','Paraguay'],               ['D','Australia','Turkey'],
    ['E','Germany','Curaçao'],            ['E','Ivory Coast','Ecuador'],
    ['F','Netherlands','Japan'],          ['F','Sweden','Tunisia'],
    ['G','Belgium','Egypt'],              ['G','Iran','New Zealand'],
    ['H','Spain','Cape Verde'],           ['H','Uruguay','Saudi Arabia'],
    ['I','France','Senegal'],             ['I','Iraq','Norway'],
    ['J','Argentina','Algeria'],          ['J','Austria','Jordan'],
    ['K','Portugal','DR Congo'],          ['K','Uzbekistan','Colombia'],
    ['L','England','Croatia'],            ['L','Ghana','Panama'],
    ['A','Czech Republic','South Africa'],['A','Mexico','South Korea'],
    ['B','Bosnia-Herzegovina','Switzerland'],['B','Canada','Qatar'],
    ['C','Scotland','Brazil'],            ['C','Morocco','Haiti'],
    ['D','Turkey','USA'],                 ['D','Paraguay','Australia'],
    ['E','Ecuador','Germany'],            ['E','Curaçao','Ivory Coast'],
    ['F','Tunisia','Netherlands'],        ['F','Japan','Sweden'],
    ['G','New Zealand','Belgium'],        ['G','Egypt','Iran'],
    ['H','Uruguay','Spain'],              ['H','Cape Verde','Saudi Arabia'],
    ['I','Norway','France'],              ['I','Senegal','Iraq'],
    ['J','Jordan','Argentina'],           ['J','Algeria','Austria'],
    ['K','Colombia','Portugal'],          ['K','DR Congo','Uzbekistan'],
    ['L','Panama','England'],             ['L','Croatia','Ghana'],
    ['A','South Africa','South Korea'],   ['A','Mexico','Czech Republic'],
    ['B','Bosnia-Herzegovina','Qatar'],   ['B','Canada','Switzerland'],
    ['C','Morocco','Scotland'],           ['C','Brazil','Haiti'],
    ['D','Paraguay','Turkey'],            ['D','USA','Australia'],
    ['E','Curaçao','Ecuador'],            ['E','Germany','Ivory Coast'],
    ['F','Japan','Tunisia'],              ['F','Netherlands','Sweden'],
    ['G','Egypt','New Zealand'],          ['G','Belgium','Iran'],
    ['H','Cape Verde','Uruguay'],         ['H','Spain','Saudi Arabia'],
    ['I','Senegal','Norway'],             ['I','France','Iraq'],
    ['J','Algeria','Jordan'],             ['J','Argentina','Austria'],
    ['K','DR Congo','Colombia'],          ['K','Portugal','Uzbekistan'],
    ['L','Croatia','Panama'],             ['L','England','Ghana'],
  ];
  const gc = {};
  const map = {};
  for (const [g, h, a] of raw) {
    gc[g] = (gc[g] || 0);
    const id = `${g}-${gc[g]++}`;
    map[`${h}|||${a}`] = { id, homeIsFirst: true  };
    map[`${a}|||${h}`] = { id, homeIsFirst: false };
  }
  return map;
})();

function findMatchId(home, away) {
  return MATCH_LOOKUP[`${home}|||${away}`] || null;
}
