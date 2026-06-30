// Vercel Serverless Function — World Cup 2026 v2
// football-data.org free plan — 2 calls only, fast & reliable

const KEY  = process.env.FOOTBALLDATA_KEY;
const BASE = 'https://api.football-data.org/v4';

const TEAM_MAP = {
  'Korea Republic':'South Korea','Czechia':'Czech Republic',
  'Bosnia and Herzegovina':'Bosnia-Herzegovina',
  'United States':'USA','Türkiye':'Turkey',
  "Côte d'Ivoire":'Ivory Coast',"Cote d'Ivoire":'Ivory Coast',
  'IR Iran':'Iran',
  'Cabo Verde':'Cape Verde','Cape Verde Islands':'Cape Verde',
  'Congo DR':'DR Congo','Democratic Republic of Congo':'DR Congo','Congo, DR':'DR Congo',
  'Cote d\'Ivoire':'Ivory Coast',"Côte d'Ivoire":'Ivory Coast',
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
    ['D','USA','Australia'],              ['D','Turkey','Paraguay'],
    ['E','Germany','Ivory Coast'],        ['E','Curaçao','Ecuador'],
    ['F','Netherlands','Sweden'],         ['F','Tunisia','Japan'],
    ['G','Belgium','Iran'],               ['G','New Zealand','Egypt'],
    ['H','Spain','Saudi Arabia'],         ['H','Uruguay','Cape Verde'],
    ['I','France','Iraq'],                ['I','Norway','Senegal'],
    ['J','Argentina','Austria'],          ['J','Jordan','Algeria'],
    ['K','Portugal','Uzbekistan'],        ['K','Colombia','DR Congo'],
    ['L','England','Ghana'],              ['L','Panama','Croatia'],
    ['A','Czech Republic','Mexico'],      ['A','South Africa','South Korea'],
    ['B','Bosnia-Herzegovina','Qatar'],   ['B','Canada','Switzerland'],
    ['C','Haiti','Brazil'],               ['C','Scotland','Morocco'],
    ['D','Turkey','USA'],                 ['D','Paraguay','Australia'],
    ['E','Curaçao','Ivory Coast'],        ['E','Germany','Ecuador'],
    ['F','Tunisia','Netherlands'],        ['F','Japan','Sweden'],
    ['G','Egypt','Iran'],                 ['G','Belgium','New Zealand'],
    ['H','Cape Verde','Saudi Arabia'],    ['H','Spain','Uruguay'],
    ['I','Senegal','Iraq'],               ['I','France','Norway'],
    ['J','Jordan','Argentina'],           ['J','Algeria','Austria'],
    ['K','DR Congo','Uzbekistan'],        ['K','Portugal','Colombia'],
    ['L','Croatia','Ghana'],              ['L','England','Panama'],
  ];
  const gc={}, map={};
  for (const [g,h,a] of raw) {
    gc[g] = (gc[g]||0);
    const id = `${g}-${gc[g]++}`;
    map[`${h}|||${a}`] = { id, hi:true  };
    map[`${a}|||${h}`] = { id, hi:false };
  }

  // ── Knockout stage matches ──
  const ko = [
    ['M73', 'South Africa','Canada'],
    ['M76', 'Brazil','Japan'],
    ['M74', 'Germany','Paraguay'],
    ['M75', 'Netherlands','Morocco'],
    ['M78', 'Ivory Coast','Norway'],
    ['M77', 'France','Sweden'],
    ['M79', 'Mexico','Ecuador'],
    ['M80', 'England','DR Congo'],
    ['M82', 'Belgium','Senegal'],
    ['M81', 'USA','Bosnia-Herzegovina'],
    ['M84', 'Spain','Austria'],
    ['M83', 'Portugal','Croatia'],
    ['M85', 'Switzerland','Algeria'],
    ['M88', 'Australia','Egypt'],
    ['M86', 'Argentina','Cape Verde'],
    ['M87', 'Colombia','Ghana'],
  ];
  for (const [id,h,a] of ko) {
    map[`${h}|||${a}`] = { id, hi:true  };
    map[`${a}|||${h}`] = { id, hi:false };
  }

  return map;
})();

function processMatch(m, scores, liveIds, minutes, pens) {
  const isLive = ['IN_PLAY','PAUSED','HALFTIME'].includes(m.status);
  const isDone = m.status === 'FINISHED';
  if (!isLive && !isDone) return;

  const fm = LOOKUP[`${mapT(m.homeTeam?.name||'')}|||${mapT(m.awayTeam?.name||'')}`];
  if (!fm) {
    console.warn('NOMATCH:', m.homeTeam?.name, 'vs', m.awayTeam?.name, m.status);
    return;
  }

  // Get score — prefer regularTime (90min) for the main displayed score
  // so knockout matches show the 90min result, not extra-time/penalty inflated numbers
  let home = m.score?.regularTime?.home ?? m.score?.fullTime?.home;
  let away = m.score?.regularTime?.away ?? m.score?.fullTime?.away;

  if (home == null && isDone) home = 0;
  if (away == null && isDone) away = 0;
  if (home == null || away == null) { home = 0; away = 0; } // live with no goals yet

  scores[fm.id] = fm.hi ? [home, away] : [away, home];

  if (isLive) {
    if (!liveIds.includes(fm.id)) liveIds.push(fm.id);
    if (m.minute != null) minutes[fm.id] = m.minute + (m.injuryTime||0);
  }

  // Penalty shootout info (knockout stage only)
  if (m.score?.duration === 'PENALTY_SHOOTOUT' && m.score?.penalties) {
    const ph = m.score.penalties.home;
    const pa = m.score.penalties.away;
    if (ph != null && pa != null) {
      pens[fm.id] = fm.hi ? [ph, pa] : [pa, ph];
    }
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=25, stale-while-revalidate=30');
  if (!KEY) return res.status(500).json({ error: 'FOOTBALLDATA_KEY not set' });

  try {
    const scores={}, liveIds=[], minutes={}, pens={};

    // Call 1 — all matches
    const d1 = await get('/competitions/WC/matches');
    for (const m of d1.matches||[]) processMatch(m, scores, liveIds, minutes, pens);

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
      pens,
      scorers,
    });

  } catch(e) {
    console.error(e);
    return res.status(502).json({ error: e.message });
  }
}
