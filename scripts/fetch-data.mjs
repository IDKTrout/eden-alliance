// Downloads the public web_* tabs of the "Eden Guild Alliance" sheet as CSV into src/data/.
// Only these tabs are published to the web; the rest of the sheet (Discord IDs, blacklist,
// player rosters) stays private.
//
// The publish ID comes from SHEET_PUB_ID or sheet.config.json. If a download fails, the copy
// already in src/data/ is kept so the build still works.

import { readFile, writeFile, mkdir, access } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const dataDir = new URL('src/data/', root);

// Tab name -> sheet gid (the number after #gid= in the sheet's address bar).
const TABS = {
  web_guilds: 900001,
  web_expeditions: 900002,
  web_settings: 900003,
  web_abex: 900004,
  web_rift: 900005,
  web_former_names: 900006,
  web_players: 900007,
};

async function publishId() {
  if (process.env.SHEET_PUB_ID) return process.env.SHEET_PUB_ID.trim();
  try {
    const cfg = JSON.parse(await readFile(new URL('sheet.config.json', root), 'utf8'));
    return (cfg.publishId || '').trim();
  } catch {
    return '';
  }
}

async function exists(url) {
  try { await access(url); return true; } catch { return false; }
}

const id = await publishId();
await mkdir(dataDir, { recursive: true });

let failed = 0;
for (const [tab, gid] of Object.entries(TABS)) {
  const file = new URL(`${tab}.csv`, dataDir);
  if (!id) {
    console.warn(`[data] No publish ID set; keeping saved ${tab}.csv`);
    if (!(await exists(file))) failed++;
    continue;
  }
  const url = `https://docs.google.com/spreadsheets/d/e/${id}/pub?gid=${gid}&single=true&output=csv&t=${Date.now()}`;
  try {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = (await res.text()).replace(/\r\n?/g, '\n');
    if (text.trimStart().startsWith('<')) throw new Error('got a web page instead of CSV (is this tab published?)');
    // Guard against a privacy slip: these tabs must never carry Discord IDs.
    if (/discord/i.test(text.split('\n')[0])) throw new Error('header mentions Discord; refusing to save');
    await writeFile(file, text.endsWith('\n') ? text : `${text}\n`);
    console.log(`[data] ${tab}: ${text.trim().split('\n').length - 1} rows`);
  } catch (err) {
    console.warn(`[data] Could not download ${tab} (${err.message}); keeping saved copy`);
    if (!(await exists(file))) failed++;
  }
}

if (failed) {
  console.error(`[data] ${failed} tab(s) have no data at all. Publish the web_* tabs and set SHEET_PUB_ID.`);
  process.exit(1);
}
