// Vercel Serverless Function — World Cup 2026 v2
// football-data.org free plan — 2 calls only, fast & reliable

const KEY  = process.env.FOOTBALLDATA_KEY;
const BASE = 'https://api.football-data.org/v4';

const TEAM_MAP = {
  'Korea Republic':'South Korea','Czechia':'Czech Republic',
  'Bosnia and Herzegovina':'Bosnia-Herzegovina',
  'United States':'USA','Türkiye':'Turkey',
  "Côte d'Ivoire":'Ivory Coast',"Cote d'Ivoire":'Ivory Coast',
  'IR Iran':'Iran','Cabo Verde':'Cape Verde',
  'Congo DR':'DR Congo','Democratic Republic of Congo':'DR Congo',
};
const mapT = n => TEAM_MAP[n] || n;

async function get(path) {
  const r = await fetch(`${BASE}${path}`, { headers:{'X-Auth-Token':KEY} });
  if (!r.ok) throw new Error(`football-data ${r.status} ${path}`);
  return r.json();
}

const LOOKUP = (() => {
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
  const gc={}, map={};
  for (const [g,h,a] of raw) {
    gc[g] = (gc[g]||0);
    const id = `${g}-${gc[g]++}`;
    map[`${h}|||${a}`] = { id, hi:true  };
    map[`${a}|||${h}`] = { id, hi:false };
  }
  return map;
})();

function processMatch(m, scores, liveIds, minutes) {
  const isLive = ['IN_PLAY','PAUSED','HALFTIME'].includes(m.status);
  if (!isLive && m.status !== 'FINISHED') return;
  const ft = m.score?.fullTime;
  if (!ft || ft.home == null) return;
  const fm = LOOKUP[`${mapT(m.homeTeam?.name||'')}|||${mapT(m.awayTeam?.name||'')}`];
  if (!fm) return;
  scores[fm.id] = fm.hi ? [ft.home, ft.away] : [ft.away, ft.home];
  if (isLive) {
    if (!liveIds.includes(fm.id)) liveIds.push(fm.id);
    if (m.minute != null) minutes[fm.id] = m.minute + (m.injuryTime||0);
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=25, stale-while-revalidate=30');
  if (!KEY) return res.status(500).json({ error: 'FOOTBALLDATA_KEY not set' });

  try {
    const scores={}, liveIds=[], minutes={};

    // Call 1 — all matches (scores + live status)
    const d1 = await get('/competitions/WC/matches');
    for (const m of d1.matches||[]) processMatch(m, scores, liveIds, minutes);

    // Call 2 — top scorers
    const sd = await get('/competitions/WC/scorers?limit=20');
    const scorers = (sd.scorers||[]).map(s => ({
      name:      s.player?.name || '?',
      team:      mapT(s.team?.name || ''),
      goals:     s.goals ?? 0,
      assists:   s.assists ?? 0,
      penalties: s.penalties ?? 0,
    }));

    return res.status(200).json({
      updated: new Date().toISOString(),
      matches: scores,
      live:    liveIds,
      minutes,
      scorers,
    });

  } catch(e) {
    console.error(e);
    return res.status(502).json({ error: e.message });
  }
}
