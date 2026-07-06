// Vercel Serverless Function — World Cup 2026
// Fully dynamic KO bracket resolution

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
};
const mapT = n => TEAM_MAP[n] || n;

async function get(path) {
  const r = await fetch(`${BASE}${path}`, { headers:{'X-Auth-Token':KEY} });
  if (!r.ok) throw new Error(`football-data ${r.status} ${path}`);
  return r.json();
}

// Group stage LOOKUP
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
    gc[g]=(gc[g]||0);
    const id=`${g}-${gc[g]++}`;
    map[`${h}|||${a}`]={id,hi:true};
    map[`${a}|||${h}`]={id,hi:false};
  }
  return map;
})();

// KO bracket tree — W/L labels resolved dynamically from scores
const KO_TREE = {
  // R32 — real teams
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
  // R16 — resolved from R32
  'M89':['W74','W77'],
  'M90':['W73','W75'],
  'M91':['W76','W78'],
  'M92':['W79','W80'],
  'M93':['W83','W84'],
  'M94':['W81','W82'],
  'M95':['W86','W88'],
  'M96':['W85','W87'],
  // QF — resolved from R16
  'M97':['W89','W90'],
  'M99':['W91','W92'],
  'M98':['W93','W94'],
  'M100':['W95','W96'],
  // SF — resolved from QF
  'M101':['W97','W99'],
  'M102':['W98','W100'],
  // 3rd & Final
  'M103':['L101','L102'],
  'M104':['W101','W102'],
};

// Collected scores to resolve winners
const collectedScores = {};
const collectedPens   = {};

function getWinner(matchId) {
  const s = collectedScores[matchId];
  if (!s) return null;
  const [h, a] = resolveTeams(matchId);
  if (!h || !a) return null;
  if (s[0] > s[1]) return h;
  if (s[1] > s[0]) return a;
  const p = collectedPens[matchId];
  if (p) { if (p[0] > p[1]) return h; if (p[1] > p[0]) return a; }
  return null;
}

function getLoser(matchId) {
  const w = getWinner(matchId);
  if (!w) return null;
  const [h, a] = resolveTeams(matchId);
  return w === h ? a : h;
}

function resolveLabel(label, depth=0) {
  if (!label || depth > 8) return null;
  if (!label.startsWith('W') && !label.startsWith('L')) return label;
  const mid = label.replace(/^[WL]/, 'M');
  if (label.startsWith('W')) return getWinner(mid) || null;
  return getLoser(mid) || null;
}

function resolveTeams(matchId, depth=0) {
  const tree = KO_TREE[matchId];
  if (!tree) return [null, null];
  return tree.map(t => (t.startsWith('W') || t.startsWith('L'))
    ? resolveLabel(t, depth+1)
    : t
  );
}

function processMatch(m, scores, liveIds, minutes, pens) {
  const isLive = ['IN_PLAY','PAUSED','HALFTIME'].includes(m.status);
  const isDone  = m.status === 'FINISHED';
  if (!isLive && !isDone) return;

  const hn = mapT(m.homeTeam?.name||'');
  const an = mapT(m.awayTeam?.name||'');

  // 1. Try group stage LOOKUP
  let fm = LOOKUP[`${hn}|||${an}`];

  // 2. Try KO tree — resolve all possible matchups
  if (!fm) {
    for (const matchId of Object.keys(KO_TREE)) {
      const [rh, ra] = resolveTeams(matchId);
      if (!rh || !ra) continue;
      if (rh===hn && ra===an) { fm = {id:matchId, hi:true};  break; }
      if (ra===hn && rh===an) { fm = {id:matchId, hi:false}; break; }
    }
  }

  if (!fm) { console.warn('NOMATCH:', hn, 'vs', an); return; }

  const isKO = fm.id.startsWith('M') && !fm.id.match(/^[A-L]-/);
  let home = isKO
    ? (m.score?.fullTime?.home   ?? m.score?.regularTime?.home)
    : (m.score?.regularTime?.home ?? m.score?.fullTime?.home);
  let away = isKO
    ? (m.score?.fullTime?.away   ?? m.score?.regularTime?.away)
    : (m.score?.regularTime?.away ?? m.score?.fullTime?.away);

  if (home == null && isDone) home = 0;
  if (away == null && isDone) away = 0;
  if (home == null || away == null) { home = 0; away = 0; }

  scores[fm.id] = fm.hi ? [home, away] : [away, home];
  if (isKO) collectedScores[fm.id] = scores[fm.id];

  if (isLive) {
    if (!liveIds.includes(fm.id)) liveIds.push(fm.id);
    if (m.minute != null) minutes[fm.id] = m.minute + (m.injuryTime||0);
  }

  if (m.score?.duration === 'PENALTY_SHOOTOUT' && m.score?.penalties) {
    const ph = m.score.penalties.home;
    const pa = m.score.penalties.away;
    if (ph != null && pa != null) {
      pens[fm.id]   = fm.hi ? [ph, pa] : [pa, ph];
      if (isKO) collectedPens[fm.id] = pens[fm.id];
    }
  }
}

const ZAFRONIX_KEY = process.env.ZAFRONIX_KEY;
const ZAFRONIX_BASE = 'https://api.zafronix.com/fifa/worldcup/v1';

async function getZafronixGoals(matchNos) {
  if (!ZAFRONIX_KEY || matchNos.length === 0) return {};
  const goals = {};
  // Fetch all finished matches in parallel (max 10 at a time to stay within rate limits)
  const chunks = [];
  for (let i = 0; i < matchNos.length; i += 10) chunks.push(matchNos.slice(i, i+10));
  
  for (const chunk of chunks) {
    await Promise.all(chunk.map(async ({matchNo, id, hi}) => {
      try {
        const r = await fetch(`${ZAFRONIX_BASE}/matches/2026-${String(matchNo).padStart(3,'0')}`, {
          headers: { 'X-API-Key': ZAFRONIX_KEY }
        });
        if (!r.ok) return;
        const data = await r.json();
        if (!data.goals || data.goals.length === 0) return;
        goals[id] = data.goals.map(g => ({
          minute: g.minute,
          added:  g.addedMinute || 0,
          scorer: g.scorer,
          team:   g.team,
          type:   g.type || null, // 'penalty', 'own_goal', null = regular
          hi,
        }));
      } catch(e) { /* ignore individual failures */ }
    }));
  }
  return goals;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=25, stale-while-revalidate=30');
  if (!KEY) return res.status(500).json({error:'FOOTBALLDATA_KEY not set'});

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

    // Get goals/scorers from Zafronix for all finished matches
    // Map our match IDs to Zafronix match numbers
    const MATCH_NOS = {
      // R32
      'M73':73,'M74':74,'M75':75,'M76':76,'M77':77,'M78':78,
      'M79':79,'M80':80,'M81':81,'M82':82,'M83':83,'M84':84,
      'M85':85,'M86':86,'M87':87,'M88':88,
      // R16
      'M89':89,'M90':90,'M91':91,'M92':92,'M93':93,'M94':94,'M95':95,'M96':96,
      // QF
      'M97':97,'M98':98,'M99':99,'M100':100,
      // SF
      'M101':101,'M102':102,
      // Final
      'M103':103,'M104':104,
    };

    // Only fetch goals for finished matches
    const finishedKO = Object.entries(MATCH_NOS)
      .filter(([id]) => scores[id] !== undefined && !liveIds.includes(id))
      .map(([id, matchNo]) => ({id, matchNo, hi: true}));

    const goals = await getZafronixGoals(finishedKO);

    return res.status(200).json({
      updated: new Date().toISOString(),
      matches: scores,
      live:    liveIds,
      minutes,
      pens,
      goals,
      scorers,
    });

  } catch(e) {
    console.error(e);
    return res.status(502).json({error:e.message});
  }
}
