// Vercel Serverless Function — World Cup 2026 v2
// football-data.org free plan: 10 req/min, no daily limit

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
    gc[g]=(gc[g]||0);
    const id=`${g}-${gc[g]++}`;
    map[`${h}|||${a}`]={id,homeIsFirst:true};
    map[`${a}|||${h}`]={id,homeIsFirst:false};
  }
  return map;
})();

function findMatch(home,away){ return LOOKUP[`${home}|||${away}`]||null; }

function extractEvents(match, fm, goals, cards) {
  // Goals
  if (match.goals?.length) {
    goals[fm.id] = match.goals.map(g => ({
      min:  g.minute,
      name: g.scorer?.name || '?',
      team: mapT(g.team?.name || ''),
      type: g.type, // REGULAR, OWN_GOAL, PENALTY
    })).filter(g => g.min != null);
  }
  // Cards
  if (match.bookings?.length) {
    cards[fm.id] = match.bookings.map(b => ({
      min:  b.minute,
      name: b.player?.name || '?',
      team: mapT(b.team?.name || ''),
      card: b.card, // YELLOW_CARD, RED_CARD, YELLOW_RED_CARD
    })).filter(b => b.min != null);
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=25, stale-while-revalidate=30');
  if (!KEY) return res.status(500).json({ error: 'FOOTBALLDATA_KEY not set' });

  try {
    const scores={}, liveIds=[], minutes={}, goals={}, cards={};

    // ── Call 1: ALL finished + live matches (scores only, no events on this endpoint) ──
    const allMatches = await get('/competitions/WC/matches?status=IN_PLAY,PAUSED,HALFTIME,FINISHED');
    const liveMatchIds = []; // football-data internal IDs for live matches

    for (const m of allMatches.matches||[]) {
      const isLive = ['IN_PLAY','PAUSED','HALFTIME'].includes(m.status);
      const isDone = m.status === 'FINISHED';
      if (!isLive && !isDone) continue;

      const scoreData = m.score?.fullTime;
      if (!scoreData || scoreData.home == null) continue;

      const home = mapT(m.homeTeam.name);
      const away = mapT(m.awayTeam.name);
      const fm = findMatch(home, away);
      if (!fm) continue;

      scores[fm.id] = fm.homeIsFirst
        ? [scoreData.home, scoreData.away]
        : [scoreData.away, scoreData.home];

      if (isLive) {
        liveIds.push(fm.id);
        const mn = m.minute;
        if (mn != null) minutes[fm.id] = mn + (m.injuryTime||0);
        liveMatchIds.push({ fdId: m.id, fm });
      }

      // Extract events from the list endpoint (may be empty for finished)
      extractEvents(m, fm, goals, cards);
    }

    // ── Call 2: Fetch individual match details for recent finished matches (last 2 days)
    // This gets goals + cards which aren't in the list endpoint ──
    const twoDaysAgo = new Date(Date.now() - 2*24*3600*1000).toISOString().slice(0,10);
    const today      = new Date().toISOString().slice(0,10);
    const recentData = await get(`/competitions/WC/matches?status=FINISHED&dateFrom=${twoDaysAgo}&dateTo=${today}`);
    const recentIds  = (recentData.matches||[]).map(m => m.id);

    // Fetch each recent match individually for events (max ~6 matches, well within 10 req/min)
    await Promise.all(recentIds.slice(0, 8).map(async fdId => {
      try {
        const detail = await get(`/matches/${fdId}`);
        const m = detail.match || detail;
        if (!m || m.status !== 'FINISHED') return;
        const home = mapT(m.homeTeam?.name || '');
        const away = mapT(m.awayTeam?.name || '');
        const fm = findMatch(home, away);
        if (!fm) return;
        extractEvents(m, fm, goals, cards);
      } catch(e) { /* ignore individual match errors */ }
    }));

    // ── Call 3: Live match details (for accurate minute + events) ──
    await Promise.all(liveMatchIds.slice(0, 4).map(async ({fdId, fm}) => {
      try {
        const detail = await get(`/matches/${fdId}`);
        const m = detail.match || detail;
        if (!m) return;
        const mn = m.minute;
        if (mn != null) minutes[fm.id] = mn + (m.injuryTime||0);
        extractEvents(m, fm, goals, cards);
      } catch(e) {}
    }));

    // ── Call 4: Top scorers ──
    const scorersData = await get('/competitions/WC/scorers?limit=20');
    const scorers = (scorersData.scorers||[]).map(s => ({
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
      goals,
      cards,
      scorers,
    });

  } catch(e) {
    console.error(e);
    return res.status(502).json({ error: e.message });
  }
}
