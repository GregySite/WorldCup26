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
  // QF — real teams from R16 results
  'M97':['France','Morocco'],
  'M99':['Norway','England'],
  'M98':['Spain','Belgium'],
  'M100':['Argentina','Switzerland'],
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

// ── Hardcoded goals data (from Zafronix, updated as tournament progresses) ──
const GOALS_DATA = {
  'M73':[{minute:90,added:2,scorer:"Eustáquio",team:"away",type:null}],
  'M74':[{minute:42,added:0,scorer:"Enciso",team:"away",type:null},{minute:54,added:0,scorer:"Havertz",team:"home",type:null}],
  'M75':[{minute:72,added:0,scorer:"Gakpo",team:"home",type:null},{minute:90,added:1,scorer:"Diop",team:"away",type:null}],
  'M76':[{minute:29,added:0,scorer:"Sano",team:"away",type:null},{minute:56,added:0,scorer:"Casemiro",team:"home",type:null},{minute:90,added:5,scorer:"Martinelli",team:"home",type:null}],
  'M77':[{minute:45,added:0,scorer:"Mbappé",team:"home",type:null},{minute:53,added:0,scorer:"Barcola",team:"home",type:null},{minute:74,added:0,scorer:"Mbappé",team:"home",type:null}],
  'M78':[{minute:39,added:0,scorer:"Nusa",team:"away",type:null},{minute:74,added:0,scorer:"Diallo",team:"home",type:null},{minute:86,added:0,scorer:"Haaland",team:"away",type:null}],
  'M79':[{minute:22,added:0,scorer:"Quiñones",team:"home",type:null},{minute:31,added:0,scorer:"Jiménez",team:"home",type:null}],
  'M80':[{minute:7,added:0,scorer:"Cipenga",team:"away",type:null},{minute:75,added:0,scorer:"Kane",team:"home",type:null},{minute:86,added:0,scorer:"Kane",team:"home",type:null}],
  'M81':[{minute:45,added:0,scorer:"Balogun",team:"home",type:null},{minute:82,added:0,scorer:"Tillman",team:"home",type:null}],
  'M82':[{minute:25,added:0,scorer:"Diarra",team:"away",type:null},{minute:51,added:0,scorer:"I. Sarr",team:"away",type:null},{minute:86,added:0,scorer:"Lukaku",team:"home",type:null},{minute:89,added:0,scorer:"Tielemans",team:"home",type:null},{minute:120,added:5,scorer:"Tielemans",team:"home",type:"penalty"}],
  'M83':[{minute:53,added:0,scorer:"Perišić",team:"away",type:null},{minute:68,added:0,scorer:"Ronaldo",team:"home",type:"penalty"},{minute:90,added:4,scorer:"Ramos",team:"home",type:null}],
  'M84':[{minute:36,added:0,scorer:"Oyarzabal",team:"home",type:null},{minute:66,added:0,scorer:"Porro",team:"home",type:null},{minute:89,added:0,scorer:"Oyarzabal",team:"home",type:null}],
  'M85':[{minute:10,added:0,scorer:"Embolo",team:"home",type:null},{minute:46,added:0,scorer:"Ndoye",team:"home",type:null}],
  'M86':[{minute:29,added:0,scorer:"Messi",team:"home",type:null},{minute:59,added:0,scorer:"D. Duarte",team:"away",type:null},{minute:92,added:0,scorer:"Li. Martínez",team:"home",type:null},{minute:103,added:0,scorer:"Lopes Cabral",team:"away",type:null},{minute:111,added:0,scorer:"Diney",team:"home",type:"own_goal"}],
  'M87':[{minute:14,added:0,scorer:"J. Arias",team:"home",type:null}],
  'M88':[{minute:13,added:0,scorer:"Ashour",team:"away",type:null},{minute:55,added:0,scorer:"Hany",team:"home",type:"own_goal"}],
  'M89':[{minute:70,added:0,scorer:"Mbappé",team:"away",type:"penalty"}],
  'M90':[{minute:50,added:0,scorer:"Ounahi",team:"away",type:null},{minute:82,added:0,scorer:"Ounahi",team:"away",type:null},{minute:90,added:8,scorer:"Rahimi",team:"away",type:null}],
  'M91':[{minute:79,added:0,scorer:"Haaland",team:"away",type:null},{minute:90,added:0,scorer:"Haaland",team:"away",type:null},{minute:90,added:10,scorer:"Neymar",team:"home",type:"penalty"}],
  'M92':[{minute:36,added:0,scorer:"Bellingham",team:"away",type:null},{minute:38,added:0,scorer:"Bellingham",team:"away",type:null},{minute:42,added:0,scorer:"Quiñones",team:"home",type:null},{minute:60,added:0,scorer:"Kane",team:"away",type:"penalty"},{minute:69,added:0,scorer:"Jiménez",team:"home",type:"penalty"}],
  'M93':[{minute:90,added:1,scorer:"Merino",team:"away",type:null}],
  'M94':[{minute:9,added:0,scorer:"De Ketelaere",team:"away",type:null},{minute:31,added:0,scorer:"Tillman",team:"home",type:null},{minute:33,added:0,scorer:"De Ketelaere",team:"away",type:null},{minute:57,added:0,scorer:"Vanaken",team:"away",type:null},{minute:90,added:3,scorer:"Lukaku",team:"away",type:null}],
  'M95':[{minute:15,added:0,scorer:"Y. Ibrahim",team:"away",type:null},{minute:67,added:0,scorer:"Ziko",team:"away",type:null},{minute:79,added:0,scorer:"Romero",team:"home",type:null},{minute:83,added:0,scorer:"Messi",team:"home",type:null},{minute:90,added:3,scorer:"Fernández",team:"home",type:null}],
  'M96':[], // 0-0 après 120min, Switzerland gagne aux pens 4-3
  'M97':[{minute:60,added:0,scorer:"Mbappé",team:"home",type:null},{minute:66,added:0,scorer:"Dembélé",team:"home",type:null}],
};


// ── Hardcoded penalty shootout overrides (football-data sometimes returns wrong values) ──
const PENS_OVERRIDE = {
  'M96': [4, 3], // Switzerland 4-3 Colombia (football-data returns 3-3 incorrectly)
};

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

    // Apply penalty shootout overrides
    Object.assign(pens, PENS_OVERRIDE);

    // Goals are hardcoded in GOALS_DATA — no API call needed
    const goals = GOALS_DATA;

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
