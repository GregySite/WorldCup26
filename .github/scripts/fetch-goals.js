const fs = require('fs');
const https = require('https');

const KEY = process.env.ZAFRONIX_KEY;
const BASE = 'api.zafronix.com';

const KO_MATCHES = [
  { id:'M101', matchNo:101, start: new Date('2026-07-14T19:00:00Z') },
  { id:'M102', matchNo:102, start: new Date('2026-07-15T19:00:00Z') },
  { id:'M103', matchNo:103, start: new Date('2026-07-18T21:00:00Z') },
  { id:'M104', matchNo:104, start: new Date('2026-07-19T19:00:00Z') },
];

function fetchMatch(matchNo) {
  return new Promise((resolve, reject) => {
    const path = `/fifa/worldcup/v1/matches/2026-${String(matchNo).padStart(3,'0')}`;
    console.log(`  Fetching: ${BASE}${path}`);
    const options = { hostname: BASE, path, headers: { 'X-API-Key': KEY } };
    https.get(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { console.log('  Parse error:', data.substring(0,100)); reject(e); }
      });
    }).on('error', reject);
  });
}

function formatGoals(goals) {
  if (!goals || goals.length === 0) return '[]';
  const items = goals.map(g => {
    const cleanScorer = g.scorer.replace(/\s+\d+['+].*$/, '').trim();
    const type = g.type ? `"${g.type}"` : 'null';
    return `{minute:${g.minute},added:${g.addedMinute||0},scorer:"${cleanScorer}",team:"${g.team}",type:${type}}`;
  });
  return `[${items.join(',')}]`;
}

async function main() {
  if (!KEY) { console.log('ERROR: ZAFRONIX_KEY not set!'); process.exit(1); }

  const now = new Date();
  console.log('Current time UTC:', now.toISOString());

  const forceMatch = process.env.FORCE_MATCH;
  const activeMatches = forceMatch
    ? KO_MATCHES.filter(m => m.id === forceMatch)
    : KO_MATCHES.filter(m => {
        const elapsed = (now - m.start) / 60000;
        return elapsed >= -5 && elapsed <= 180; // 180 min pour couvrir les prolongations
      });

  if (activeMatches.length === 0) {
    console.log('No active matches right now, skipping.');
    return;
  }
  console.log('Active matches:', activeMatches.map(m => m.id).join(', '));

  let code = fs.readFileSync('api/scores.js', 'utf8');
  console.log('scores.js loaded, length:', code.length);
  let updated = false;

  for (const match of activeMatches) {
    try {
      console.log(`\nProcessing ${match.id}...`);
      const data = await fetchMatch(match.matchNo);
      console.log(`  Status: ${data.status}, Goals: ${data.goals?.length ?? 'none'}`);

      if (!data.goals) { console.log('  No goals field, skipping'); continue; }
      if (data.status !== 'finished') { console.log('  Match not finished yet, status:', data.status); continue; }

      const goalsStr = formatGoals(data.goals);
      const newEntry = `'${match.id}':${goalsStr}`;
      console.log('  New entry:', newEntry.substring(0, 100));

      // Try to replace existing entry
      const regex = new RegExp(`'${match.id}':\\[[^\\]]*\\]`);
      if (regex.test(code)) {
        const newCode = code.replace(regex, newEntry);
        if (newCode !== code) {
          code = newCode;
          updated = true;
          console.log(`  ✓ Updated existing entry for ${match.id}`);
        } else {
          console.log(`  No change needed for ${match.id}`);
        }
      } else {
        // Find last M entry and insert after it
        const lastEntry = code.match(/'M\d+':\[[^\]]*\],?\s*\n(\s*\/\/[^\n]*)?\s*\};/);
        if (lastEntry) {
          const insertPos = code.lastIndexOf(lastEntry[0]);
          const insertAt = code.indexOf('],', insertPos) + 2;
          code = code.slice(0, insertAt) + `\n  ${newEntry},` + code.slice(insertAt);
          updated = true;
          console.log(`  ✓ Inserted new entry for ${match.id}`);
        } else {
          // Fallback: insert before closing }; of GOALS_DATA
          code = code.replace(/(\n};(\s*\/\/)?\s*\n\/\/ ── Hardcoded penalty)/, `\n  ${newEntry},\n$1`);
          updated = true;
          console.log(`  ✓ Inserted new entry for ${match.id} (fallback)`);
        }
      }
    } catch(e) {
      console.error(`  ✗ Error for ${match.id}:`, e.message);
    }
  }

  if (updated) {
    fs.writeFileSync('api/scores.js', code);
    console.log('\n✅ scores.js updated and saved!');
  } else {
    console.log('\nNo changes needed.');
  }
}

main().catch(e => { console.error('Fatal error:', e); process.exit(1); });