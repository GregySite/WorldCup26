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

// KO bracket — real team names updated as tournament progresses
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
  // R16 — actual teams
  'M89':['Paraguay','France'],
  'M90':['Canada','Morocco'],
  'M91':['Brazil','Norway'],
  'M92':['Mexico','England'],
  'M93':['Portugal','Spain'],
  'M94':['USA','Belgium'],
  'M95':['Argentina','Egypt'],
  'M96':['Switzerland','Colombia'],
  // QF — resolved from R16 winners
  'M97':['France','Morocco'],
  'M99':['Brazil','Mexico'],
  'M98':['Portugal','USA'],
  'M100':['Argentina','Switzerland'],
  // SF — resolved from QF winners (update after QF)
  'M101':['France','Brazil'],
  'M102':['Portugal','Argentina'],
  // 3rd & Final
  'M103':['Paraguay','Morocco'],
  'M104':['France','Portugal'],
};

function processMatch(m, scores, liveIds, minutes, pens) {
  const isLive = ['IN_PLAY','PAUSED','HALFTIME'].includes(m.status);
  const isDone = m.status === 'FINISHED';
  if (!isLive && !isDone) return;

  const hn = mapT(m.homeTeam?.name||'');
  const an = mapT(m.awayTeam?.name||'');

  // Try group stage LOOKUP first
  let fm = LOOKUP[`${hn}|||${an}`];

  // Try KO bracket directly
  if (!fm) {
    for (const [matchId, [h, a]] of Object.entries(KO_BRACKET)) {
      if ((h===hn&&a===an)||(h===an&&a===hn)) {
        fm = { id:matchId, hi: h===hn };
        break;
      }
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

  if (isLive) {
    if (!liveIds.includes(fm.id)) liveIds.push(fm.id);
    if (m.minute != null) minutes[fm.id] = m.minute + (m.injuryTime||0);
  }

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
