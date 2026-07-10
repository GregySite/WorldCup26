// Script appelé par GitHub Actions pour fetcher les buts du match en cours
// et mettre à jour GOALS_DATA dans api/scores.js

const fs = require('fs');
const https = require('https');

const KEY = process.env.ZAFRONIX_KEY;
const BASE = 'api.zafronix.com';

const KO_MATCHES = [
  { id: 'M97',  matchNo: 97,  start: new Date('2026-07-09T21:00:00Z') },
  { id: 'M98',  matchNo: 98,  start: new Date('2026-07-10T19:00:00Z') },
  { id: 'M99',  matchNo: 99,  start: new Date('2026-07-11T22:00:00Z') },
  { id: 'M100', matchNo: 100, start: new Date('2026-07-12T02:00:00Z') },
  { id: 'M101', matchNo: 101, start: new Date('2026-07-14T19:00:00Z') },
  { id: 'M102', matchNo: 102, start: new Date('2026-07-15T19:00:00Z') },
  { id: 'M103', matchNo: 103, start: new Date('2026-07-18T21:00:00Z') },
  { id: 'M104', matchNo: 104, start: new Date('2026-07-19T19:00:00Z') },
];

function fetchMatch(matchNo) {
  return new Promise((resolve, reject) => {
    const path = `/fifa/worldcup/v1/matches/2026-${String(matchNo).padStart(3,'0')}`;
    const options = { hostname: BASE, path, headers: { 'X-API-Key': KEY } };
    https.get(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function formatGoals(goals) {
  if (!goals || goals.length === 0) return '[]';
  const items = goals.map(g => {
    const cleanScorer = g.scorer.replace(/\s+\d+['+].*$/, '').trim();
    const type = g.type ? `"${g.type}"` : null;
    return `{minute:${g.minute},added:${g.addedMinute||0},scorer:"${cleanScorer}",team:"${g.team}",type:${type}}`;
  });
  return `[${items.join(',')}]`;
}

async function main() {
  const now = new Date();
  console.log('Current time UTC:', now.toISOString());

  // Find matches in window: from 5min before kickoff to 145min after
  const activeMatches = KO_MATCHES.filter(m => {
    const elapsed = (now - m.start) / 60000;
    return elapsed >= -5 && elapsed <= 145;
  });

  if (activeMatches.length === 0) {
    console.log('No active matches right now, skipping.');
    return;
  }

  console.log(`Active matches: ${activeMatches.map(m => m.id).join(', ')}`);

  let code = fs.readFileSync('api/scores.js', 'utf8');
  let updated = false;

  for (const match of activeMatches) {
    try {
      console.log(`Fetching ${match.id}...`);
      const data = await fetchMatch(match.matchNo);

      if (!data.goals) {
        console.log(`${match.id}: no goals field in response`);
        continue;
      }

      console.log(`${match.id}: status=${data.status}, goals=${data.goals.length}`);

      const goalsStr = formatGoals(data.goals);
      const entryStr = `'${match.id}':${goalsStr}`;

      // Try to replace existing entry
      const existingRegex = new RegExp(`'${match.id}':\\[.*?\\]`, 's');
      if (existingRegex.test(code)) {
        const newCode = code.replace(existingRegex, entryStr);
        if (newCode !== code) {
          code = newCode;
          updated = true;
          console.log(`${match.id}: updated existing entry`);
        } else {
          console.log(`${match.id}: no change needed`);
        }
      } else {
        // Insert before closing }; of GOALS_DATA
        code = code.replace(
          /(const GOALS_DATA = \{[\s\S]*?)(^\};)/m,
          `$1  ${entryStr},\n$2`
        );
        updated = true;
        console.log(`${match.id}: inserted new entry`);
      }

    } catch(e) {
      console.error(`${match.id}: error - ${e.message}`);
    }
  }

  if (updated) {
    fs.writeFileSync('api/scores.js', code);
    console.log('scores.js updated successfully!');
  } else {
    console.log('No changes needed.');
  }
}

main().catch(console.error);