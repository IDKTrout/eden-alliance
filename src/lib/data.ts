// Reads the CSV copies of the sheet's public web_* tabs (src/data/*.csv) and turns them into
// typed records for the pages. Everything here runs at build time only.

import guildsCsv from '../data/web_guilds.csv?raw';
import expeditionsCsv from '../data/web_expeditions.csv?raw';
import settingsCsv from '../data/web_settings.csv?raw';

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const [head = [], ...body] = rows;
  const keys = head.map((h) => h.trim());
  return body
    .filter((r) => r.some((c) => c.trim() !== ''))
    .map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}

const num = (v: string | undefined): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

// ---------- Settings ----------

const settings = Object.fromEntries(parseCsv(settingsCsv).map((r) => [r.setting, r.value]));
export const updated = settings.updated ?? '';

// ---------- Guilds (from the Discord Bot tab, minus Discord IDs) ----------

export interface Guild {
  id: string;
  name: string;
  order: number;
  category: string;
  leader: string;
  deputies: string[];
  purpose: string;
  region: number | null;
  status: string;
  color: string;
  players: number;
}

export const guilds: Guild[] = parseCsv(guildsCsv)
  .filter((r) => r.name && r.guild_id)
  .map((r) => ({
    id: r.guild_id.replace(/,/g, ''),
    name: r.name,
    order: num(r.order) ?? 999,
    category: r.category || 'Guild',
    leader: r.leader,
    deputies: [...new Set([r.deputy_1, r.deputy_2, r.deputy_3].filter(Boolean))],
    purpose: r.purpose,
    region: num(r.region),
    status: r.status || 'Active',
    color: /^#[0-9a-f]{6}$/i.test(r.color) ? r.color.toLowerCase() : '#8b96a8',
    players: num(r.players) ?? 0,
  }))
  .sort((a, b) => a.order - b.order);

const guildByName = new Map(guilds.map((g) => [g.name.toLowerCase(), g]));
export const guildNamed = (name: string) => guildByName.get(name.toLowerCase());

/** Category order on the directory: founding first, then sister, branch, regional, anything else. */
const CATEGORY_ORDER = ['Founding Guild', 'Sister Guild', 'Branch Guild', 'Regional Guild'];
export const categories = [...new Set(guilds.map((g) => g.category))].sort(
  (a, b) => (CATEGORY_ORDER.indexOf(a) + 1 || 99) - (CATEGORY_ORDER.indexOf(b) + 1 || 99),
);
export const regions = [...new Set(guilds.map((g) => g.region).filter((r): r is number => r != null))].sort((a, b) => a - b);
export const totalPlayers = guilds.reduce((s, g) => s + g.players, 0);

// ---------- Maps and leagues (colours are the cell fills on the sheet's Lists tab) ----------

export const MAPS: Record<string, string> = {
  A: '#b7e1cd', B: '#ea9999', C: '#ffe599', D: '#f9cb9c', E: '#9fc5e8', F: '#b4a7d6',
  G: '#dd7e6b', H: '#a2c4c9', I: '#c9daf8', J: '#fce5cd', NE: '#d5a6bd', S: '#a61c00',
};
export const LEAGUES: Record<string, string> = {
  '1': '#ea4335', '2': '#ffd966', '3': '#d5a6bd', '4': '#93c47d', '5': '#46bdc6', '6': '#674ea7',
  '7': '#6fa8dc', '8': '#b4a7d6', '9': '#7f6000', '10': '#f6b26b', '11': '#38761d', '12': '#1c4587',
};
/** Map codes that aren't a lettered map. */
const MAP_NAMES: Record<string, string> = { S: 'Solo', NE: 'Not enrolled' };
export const mapLabel = (m: string) => MAP_NAMES[m] ?? `Map ${m}`;
const OTHER = '#8b96a8';
export const mapColor = (m: string) => MAPS[m] ?? OTHER;
export const leagueColor = (l: string) => LEAGUES[l] ?? OTHER;

/** Black or white text, whichever reads better on the given fill. */
export function inkOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L > 0.33 ? '#10151f' : '#ffffff';
}

// ---------- Expeditions (one row per player, without player names) ----------

interface ExpRow { expedition: string; guild: string; map: string; league: string }

const isBlank = (v: string) => !v || /^n\/?a$/i.test(v);

const expRows: ExpRow[] = parseCsv(expeditionsCsv)
  .filter((r) => r.expedition && r.guild)
  .map((r) => ({
    expedition: r.expedition.toUpperCase(),
    guild: r.guild,
    map: isBlank(r.map) ? '' : r.map.toUpperCase(),
    league: isBlank(r.league) ? '' : r.league,
  }));

const seasonNum = (id: string) => Number(id.replace(/\D/g, '')) || 0;
export const expeditionIds = [...new Set(expRows.map((r) => r.expedition))].sort((a, b) => seasonNum(a) - seasonNum(b));
export const currentExpedition =
  settings.current_expedition && expeditionIds.includes(settings.current_expedition.toUpperCase())
    ? settings.current_expedition.toUpperCase()
    : expeditionIds[expeditionIds.length - 1] ?? '';

export interface Tally { key: string; count: number }
export interface GuildExpedition {
  guild: string;
  guildRecord?: Guild;
  players: number;
  /** Players with a map entered. */
  mapped: number;
  maps: Tally[];
  leagues: Tally[];
  mainMap: string;
  mainLeague: string;
}

function tally(values: string[], order: string[]): Tally[] {
  const counts = new Map<string, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  const rank = (k: string) => { const i = order.indexOf(k); return i < 0 ? 999 : i; };
  return [...counts].map(([key, count]) => ({ key, count })).sort((a, b) => rank(a.key) - rank(b.key) || a.key.localeCompare(b.key));
}
const top = (t: Tally[]) => [...t].sort((a, b) => b.count - a.count)[0]?.key ?? '';

const mapOrder = Object.keys(MAPS);
const leagueOrder = Object.keys(LEAGUES);

export function expedition(id: string): GuildExpedition[] {
  const rows = expRows.filter((r) => r.expedition === id);
  const byGuild = new Map<string, ExpRow[]>();
  for (const r of rows) byGuild.set(r.guild, [...(byGuild.get(r.guild) ?? []), r]);
  return [...byGuild].map(([guild, rs]) => {
    const maps = tally(rs.map((r) => r.map), mapOrder);
    const leagues = tally(rs.map((r) => r.league), leagueOrder);
    return {
      guild,
      guildRecord: guildNamed(guild),
      players: rs.length,
      mapped: rs.filter((r) => r.map).length,
      maps,
      leagues,
      mainMap: top(maps),
      mainLeague: top(leagues),
    };
  }).sort((a, b) => (a.guildRecord?.order ?? 999) - (b.guildRecord?.order ?? 999) || a.guild.localeCompare(b.guild));
}

/** Maps and leagues actually used in an expedition, in the sheet's order. */
export function keysUsed(list: GuildExpedition[], field: 'maps' | 'leagues'): string[] {
  const order = field === 'maps' ? mapOrder : leagueOrder;
  return tally(list.flatMap((g) => g[field].flatMap((t) => Array(t.count).fill(t.key))), order).map((t) => t.key);
}

export function guildHistory(g: Guild) {
  return expeditionIds
    .map((id) => ({ id, entry: expedition(id).find((e) => e.guildRecord?.id === g.id) }))
    .filter((x): x is { id: string; entry: GuildExpedition } => !!x.entry)
    .reverse();
}

export const fmtInt = (n: number) => n.toLocaleString('en-US');
export const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
export const fmtDate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
};
