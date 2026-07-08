// Script appelé par GitHub Actions pour fetcher les buts du match en cours
// et mettre à jour GOALS_DATA dans api/scores.js

const fs = require('fs');
const https = require('https');

const KEY = process.env.ZAFRONIX_KEY;
const BASE = 'api.zafronix.com';

// Matchs KO avec leurs numéros Zafronix et fenêtres horaires UTC
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
    const options = {
      hostname: BASE,
      path,
      headers: { 'X-API-Key': KEY }
    };
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
  return '[\n' + goals.map(g => {
    const cleanScorer = g.scorer.replace(/\s+\d+['+'].*$/, '').trim();
    return `    {minute:${g.minute},added:${g.addedMinute||0},scorer:"${cleanScorer}",team:"${g.team}",type:${g.type?`"${g.type}"`:null}}`;
  }).join(',\n') + '\n  ]';
}

async function main() {
  const now = new Date();
  
  // Find matches currently in window (started within last 140 min)
  const activeMatches = KO_MATCHES.filter(m => {
    const elapsed = (now - m.start) / 60000; // minutes
    return elapsed >= -5 && elapsed <= 145; // -5min before kickoff to +145min after
  });

  if (activeMatches.length === 0) {
    console.log('No active matches right now, skipping.');
    return;
  }

  console.log(`Active matches: ${activeMatches.map(m => m.id).join(', ')}`);

  // Read current scores.js
  let code = fs.readFileSync('api/scores.js', 'utf8');
  let updated = false;

  for (const match of activeMatches) {
    try {
      console.log(`Fetching ${match.id} (matchNo ${match.matchNo})...`);
      const data = await fetchMatch(match.matchNo);
      
      if (!data.goals) {
        console.log(`${match.id}: no goals data yet`);
        continue;
      }

      console.log(`${match.id}: ${data.goals.length} goals, status: ${data.status}`);

      const newGoalsStr = `'${match.id}':${formatGoals(data.goals)}`;
      
      // Check if entry already exists in GOALS_DATA
      const existingRegex = new RegExp(`'${match.id}':\\[.*?\\]`, 's');
      
      if (existingRegex.test(code)) {
        // Update existing entry
        const newCode = code.replace(existingRegex, newGoalsStr);
        if (newCode !== code) {
          code = newCode;
          updated = true;
          console.log(`${match.id}: updated`);
        } else {
          console.log(`${match.id}: no change`);
        }
      } else {
        // Add new entry before closing }; of GOALS_DATA
        code = code.replace(
          /(\s*\/\/ QF[\s\S]*?'M96':\[\].*?,?\n)(};)/,
          `$1  ${newGoalsStr},\n$2`
        );
        // More robust: find GOALS_DATA closing and insert before
        code = code.replace(
          /(  'M96':\[\].*?\n)(};)/,
          `$1  ${newGoalsStr},\n$2`
        );
        updated = true;
        console.log(`${match.id}: added`);
      }

    } catch(e) {
      console.error(`${match.id}: error - ${e.message}`);
    }
  }

  if (updated) {
    fs.writeFileSync('api/scores.js', code);
    console.log('scores.js updated!');
  } else {
    console.log('No changes needed.');
  }
}

main().catch(console.error);
