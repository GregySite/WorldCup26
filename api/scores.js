// Vercel Serverless Function — World Cup 2026 v2
// football-data.org free plan — 2 calls only
// Handles 0-0 matches that football-data omits from results

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

// UTC kickoff times for all 72 group stage matches
// Used to detect finished 0-0 matches omitted by football-data API
const MATCH_DATES = {
  'A-0':'2026-06-11T19:00:00Z','A-1':'2026-06-12T02:00:00Z',
  'B-0':'2026-06-12T19:00:00Z','B-1':'2026-06-13T19:00:00Z',
  'C-0':'2026-06-14T22:00:00Z','C-1':'2026-06-14T01:00:00Z',
  'D-0':'2026-06-13T01:00:00Z','D-1':'2026-06-14T04:00:00Z',
  'E-0':'2026-06-14T17:00:00Z','E-1':'2026-06-15T23:00:00Z',
  'F-0':'2026-06-14T20:00:00Z','F-1':'2026-06-15T02:00:00Z',
  'G-0':'2026-06-15T19:00:00Z','G-1':'2026-06-16T01:00:00Z',
  'H-0':'2026-06-15T16:00:00Z','H-1':'2026-06-16T22:00:00Z',
  'I-0':'2026-06-16T19:00:00Z','I-1':'2026-06-17T22:00:00Z',
  'J-0':'2026-06-17T01:00:00Z','J-1':'2026-06-17T04:00:00Z',
  'K-0':'2026-06-17T17:00:00Z','K-1':'2026-06-18T02:00:00Z',
  'L-0':'2026-06-17T20:00:00Z','L-1':'2026-06-18T23:00:00Z',
  'A-2':'2026-06-18T16:00:00Z','A-3':'2026-06-19T01:00:00Z',
  'B-2':'2026-06-18T19:00:00Z','B-3':'2026-06-19T22:00:00Z',
  'C-2':'2026-06-20T22:00:00Z','C-3':'2026-06-20T00:00:00Z',
  'D-2':'2026-06-19T19:00:00Z','D-3':'2026-06-20T03:00:00Z',
  'E-2':'2026-06-20T20:00:00Z','E-3':'2026-06-21T00:00:00Z',
  'F-2':'2026-06-20T17:00:00Z','F-3':'2026-06-21T04:00:00Z',
  'G-2':'2026-06-21T19:00:00Z','G-3':'2026-06-22T01:00:00Z',
  'H-2':'2026-06-21T16:00:00Z','H-3':'2026-06-22T22:00:00Z',
  'I-2':'2026-06-22T21:00:00Z','I-3':'2026-06-23T00:00:00Z',
  'J-2':'2026-06-22T17:00:00Z','J-3':'2026-06-23T03:00:00Z',
  'K-2':'2026-06-23T17:00:00Z','K-3':'2026-06-24T02:00:00Z',
  'L-2':'2026-06-23T20:00:00Z','L-3':'2026-06-24T23:00:00Z',
  'A-4':'2026-06-25T01:00:00Z','A-5':'2026-06-25T01:00:00Z',
  'B-4':'2026-06-24T19:00:00Z','B-5':'2026-06-24T19:00:00Z',
  'C-4':'2026-06-25T22:00:00Z','C-5':'2026-06-25T22:00:00Z',
  'D-4':'2026-06-26T02:00:00Z','D-5':'2026-06-26T02:00:00Z',
  'E-4':'2026-06-25T20:00:00Z','E-5':'2026-06-25T20:00:00Z',
  'F-4':'2026-06-26T23:00:00Z','F-5':'2026-06-26T23:00:00Z',
  'G-4':'2026-06-27T03:00:00Z','G-5':'2026-06-27T03:00:00Z',
  'H-4':'2026-06-27T00:00:00Z','H-5':'2026-06-27T00:00:00Z',
  'I-4':'2026-06-26T19:00:00Z','I-5':'2026-06-26T19:00:00Z',
  'J-4':'2026-06-28T02:00:00Z','J-5':'2026-06-28T02:00:00Z',
  'K-4':'2026-06-28T23:00:00Z','K-5':'2026-06-28T23:00:00Z',
  'L-4':'2026-06-27T21:00:00Z','L-5':'2026-06-27T21:00:00Z',
};

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
  const isDone = m.status === 'FINISHED';
  if (!isLive && !isDone) return;

  const fm = LOOKUP[`${mapT(m.homeTeam?.name||'')}|||${mapT(m.awayTeam?.name||'')}`];
  if (!fm) {
    console.warn('No match found:', m.homeTeam?.name, 'vs', m.awayTeam?.name);
    return;
  }

  // Get score — football-data sometimes returns null for 0-0
  let home = m.score?.fullTime?.home ?? m.score?.regularTime?.home ?? m.score?.halfTime?.home;
  let away = m.score?.fullTime?.away ?? m.score?.regularTime?.away ?? m.score?.halfTime?.away;
  if (home == null || away == null) { home = 0; away = 0; }

  scores[fm.id] = fm.hi ? [home, away] : [away, home];

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

    // Call 1 — all matches
    const d1 = await get('/competitions/WC/matches');
    for (const m of d1.matches||[]) processMatch(m, scores, liveIds, minutes);

    // Fill in 0-0 for finished matches not returned by API
    // (football-data omits matches where fullTime score is null/0-0)
    const now = new Date();
    for (const [id, utcTime] of Object.entries(MATCH_DATES)) {
      if (scores[id] !== undefined) continue; // already have a score
      if (liveIds.includes(id)) continue;     // currently live
      const kickoff = new Date(utcTime);
      // If match started more than 2h ago → finished, default 0-0
      if (now - kickoff > 2 * 3600 * 1000) {
        scores[id] = [0, 0];
      }
    }

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
