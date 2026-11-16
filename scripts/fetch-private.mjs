// Downloads the members-only rows (the current expedition) into src/data/private/, which is
// gitignored. It runs before every build. The rows come from a private Apps Script web app
// (scripts/apps-script/members-data.gs) whose address, with its key, is the build secret
// MEMBERS_DATA_URL; without it this does nothing, and the members page says the data wasn't loaded.
//
// With --stamp it also writes src/data/members-stamp.txt: just a fingerprint of the rows (not the
// rows), so the scheduled refresh can commit a change and trigger a rebuild when they change.

import { writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root = new URL('../', import.meta.url);
const dir = new URL('src/data/private/', root);
const url = (process.env.MEMBERS_DATA_URL || '').trim();

if (!url) {
  console.log('[members] MEMBERS_DATA_URL not set; building without members-only data');
  process.exit(0);
}

try {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = (await res.text()).replace(/\r\n?/g, '\n');
  const head = text.split('\n')[0].trim().toLowerCase();
  if (head !== 'expedition,guild,map,league') throw new Error(`unexpected reply (starts "${text.slice(0, 40)}")`);
  await mkdir(dir, { recursive: true });
  await writeFile(new URL('current_expedition.csv', dir), text.endsWith('\n') ? text : `${text}\n`);
  console.log(`[members] current expedition: ${text.trim().split('\n').length - 1} rows`);
  if (process.argv.includes('--stamp')) {
    const hash = createHash('sha256').update(text).digest('hex').slice(0, 16);
    await writeFile(new URL('src/data/members-stamp.txt', root), `${hash}\n`);
  }
} catch (err) {
  // Don't fail the whole site over this; the members page shows that the data is missing.
  console.warn(`[members] Could not download members-only data (${err.message})`);
}
