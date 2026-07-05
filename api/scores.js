// Vercel Serverless Function — World Cup 2026 v2
// football-data.org free plan — 2 calls only

const KEY  = process.env.FOOTBALLDATA_KEY;
const BASE = 'https://api.football-data.org/v4';

const TEAM_MAP = {
  'Korea Republic':'South Korea','Czechia':'Czech Republic',
  'Bosnia and Herzegovina':'Bosnia-Herzegovina',
  'United States':'USA','Türkiye':'Turkey',
  "Côte d'Ivoire":'Ivory Coast',"Cote d'Ivoire":'Ivory Coast',
  "Cote d'Ivoire":'Ivory Coast',
  'IR Iran':'Iran',
  'Cabo Verde':'Cape Verde','Cape Verde Islands':'Cape Verde',
  'Congo DR':'DR Congo','Democratic Republic of Congo':'DR Congo','Congo, DR':'DR Congo',
};
const mapT = n => TEAM_MAP[n] || n;

async function get(path) {
  const r = await fetch(`${BASE}${path}`, { headers:{'X-Auth-Token':KEY} });
  if (!r.ok) throw new Error(`football-data ${r.status} ${path}`);
  return r.json();
}

// Build LOOKUP from raw arrays
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
  return map;
})();

// KO bracket structure — used to resolve winner chains
const KO_BRACKET = {
  // R32
  'M73':['South Africa','Canada'],
  'M74':['Germany','Paraguay'],
  'M75':['Netherlands','Morocco'],
  'M76':['Brazil','Japan'],
  'M77':['France','Sweden'],
  'M78':['Ivory Coast','Norway'],
  'M79':['Mexico','Ecuador'],
  'M80':['England','DR Congo'],
  'M81':['USA','Bosnia-Herzegovina'],
  'M82':['Belgium','Senegal'],
  'M83':['Portugal','Croatia'],
  'M84':['Spain','Austria'],
  'M85':['Switzerland','Algeria'],
  'M86':['Argentina','Cape Verde'],
  'M87':['Colombia','Ghana'],
  'M88':['Australia','Egypt'],
  // R16 — actual matchups
  'M89':['Paraguay','France'],
  'M90':['Canada','Morocco'],
  'M91':['Brazil','Norway'],
  'M92':['Mexico','England'],
  'M93':['Portugal','Spain'],
  'M94':['USA','Belgium'],
  'M95':['Argentina','Egypt'],
  'M96':['Switzerland','Colombia'],
  // QF, SF, Final — will be resolved dynamically from scores
  'M97':['W89','W90'],
  'M99':['W91','W92'],
  'M98':['W93','W94'],
  'M100':['W95','W96'],
  'M101':['W97','W99'],
  'M102':['W98','W100'],
  'M103':['L101','L102'],
  'M104':['W101','W102'],
};

// scores collected so far (filled as matches are processed)
const koScores = {};
const koPens = {};

function koWinner(matchId) {
  const teams = KO_BRACKET[matchId];
  if (!teams) return null;
  const [h, a] = teams.map(t => t.startsWith('W')||t.startsWith('L') ? resolveTeam(t) : t);
  const key1 = `${h}|||${a}`;
  const key2 = `${a}|||${h}`;
  const fm = LOOKUP[key1] || LOOKUP[key2];
  if (!fm) return null;
  const s = koScores[matchId];
  if (!s) return null;
  const [sh, sa] = fm.hi ? s : [s[1], s[0]];
  if (sh > sa) return h;
  if (sa > sh) return a;
  const p = koPens[matchId];
  if (p) {
    const [ph, pa] = fm.hi ? p : [p[1], p[0]];
    if (ph > pa) return h;
    if (pa > ph) return a;
  }
  return null;
}

function resolveTeam(label, depth=0) {
  if (!label || depth > 6) return null;
  if (!label.startsWith('W') && !label.startsWith('L')) return label;
  const matchId = label.replace(/^[WL]/, 'M');
  const [h, a] = (KO_BRACKET[matchId] || []).map(t =>
    t.startsWith('W')||t.startsWith('L') ? resolveTeam(t, depth+1) : t
  );
  if (!h || !a) return null;
  if (label.startsWith('W')) return koWinner(matchId);
  // Loser
  const w = koWinner(matchId);
  if (!w) return null;
  return w === h ? a : h;
}

// Build dynamic LOOKUP entry for a KO match
function koLookupKey(matchId) {
  const [ht, at] = (KO_BRACKET[matchId] || []).map(t =>
    t.startsWith('W')||t.startsWith('L') ? resolveTeam(t) : t
  );
  if (!ht || !at) return null;
  return { key1:`${ht}|||${at}`, key2:`${at}|||${ht}`, hi:true, id:matchId, h:ht, a:at };
}

function processMatch(m, scores, liveIds, minutes, pens) {
  const isLive = ['IN_PLAY','PAUSED','HALFTIME'].includes(m.status);
  const isDone = m.status === 'FINISHED';
  if (!isLive && !isDone) return;

  const hn = mapT(m.homeTeam?.name||'');
  const an = mapT(m.awayTeam?.name||'');

  // Try group stage LOOKUP first
  let fm = LOOKUP[`${hn}|||${an}`];

  // Try KO matches dynamically
  if (!fm) {
    for (const matchId of Object.keys(KO_BRACKET)) {
      const entry = koLookupKey(matchId);
      if (!entry) continue;
      if (entry.key1 === `${hn}|||${an}`) { fm = { id:matchId, hi:true }; break; }
      if (entry.key2 === `${hn}|||${an}`) { fm = { id:matchId, hi:false }; break; }
    }
  }

  if (!fm) {
    console.warn('NOMATCH:', hn, 'vs', an, m.status);
    return;
  }

  const isKO = fm.id.startsWith('M');
  let home, away;
  if (isKO) {
    home = m.score?.fullTime?.home ?? m.score?.regularTime?.home;
    away = m.score?.fullTime?.away ?? m.score?.regularTime?.away;
  } else {
    home = m.score?.regularTime?.home ?? m.score?.fullTime?.home;
    away = m.score?.regularTime?.away ?? m.score?.fullTime?.away;
  }

  if (home == null && isDone) home = 0;
  if (away == null && isDone) away = 0;
  if (home == null || away == null) { home = 0; away = 0; }

  scores[fm.id] = fm.hi ? [home, away] : [away, home];
  if (isKO) koScores[fm.id] = scores[fm.id];

  if (isLive) {
    if (!liveIds.includes(fm.id)) liveIds.push(fm.id);
    if (m.minute != null) minutes[fm.id] = m.minute + (m.injuryTime||0);
  }

  if (m.score?.duration === 'PENALTY_SHOOTOUT' && m.score?.penalties) {
    const ph = m.score.penalties.home;
    const pa = m.score.penalties.away;
    if (ph != null && pa != null) {
      pens[fm.id] = fm.hi ? [ph, pa] : [pa, ph];
      if (isKO) koPens[fm.id] = pens[fm.id];
    }
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=25, stale-while-revalidate=30');
  if (!KEY) return res.status(500).json({ error: 'FOOTBALLDATA_KEY not set' });

  try {
    const scores={}, liveIds=[], minutes={}, pens={};

    const d1 = await get('/competitions/WC/matches');
    for (const m of d1.matches||[]) processMatch(m, scores, liveIds, minutes, pens);

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
