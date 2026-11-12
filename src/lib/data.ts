// Reads the CSV copies of the sheet's public web_* tabs (src/data/*.csv) and turns them into
// typed records for the pages. Everything here runs at build time only.

import guildsCsv from '../data/web_guilds.csv?raw';
import expeditionsCsv from '../data/web_expeditions.csv?raw';
import settingsCsv from '../data/web_settings.csv?raw';
import abexCsv from '../data/web_abex.csv?raw';
import riftCsv from '../data/web_rift.csv?raw';
import formerNamesCsv from '../data/web_former_names.csv?raw';
import playersCsv from '../data/web_players.csv?raw';

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
  /** Used in the page address: the in-game guild ID, or the name when the ID isn't known. */
  id: string;
  /** The in-game guild ID, or '' when the sheet doesn't have it (some inactive guilds). */
  gameId: string;
  active: boolean;
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
  /** Path of the guild's emblem, or '' if there's no file in public/emblems/ for it yet. */
  emblem: string;
}

// Emblems are named after the guild like the Drive folder: Moon Sword -> moon_sword.webp.
const emblemFiles = new Set(
  Object.keys(import.meta.glob('/public/emblems/*.webp')).map((p) => p.replace('/public', '')),
);
const emblemFor = (name: string) => {
  const path = `/emblems/${name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}.webp`;
  return emblemFiles.has(path) ? path : '';
};

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'guild';

/** Every guild on the sheet, active and inactive. */
export const guilds: Guild[] = parseCsv(guildsCsv)
  .filter((r) => r.name)
  .map((r) => ({
    id: r.guild_id ? r.guild_id.replace(/,/g, '') : slug(r.name),
    gameId: r.guild_id.replace(/,/g, ''),
    active: !/^inactive$/i.test(r.status),
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
    emblem: emblemFor(r.name),
  }))
  .sort((a, b) => a.order - b.order);

export const activeGuilds = guilds.filter((g) => g.active);
/** Inactive guilds, listed apart at the end of the directory: by region, then name. */
export const inactiveGuilds = guilds
  .filter((g) => !g.active)
  .sort((a, b) => (a.region ?? 999) - (b.region ?? 999) || a.name.localeCompare(b.name));

/** Active guilds in one category, in display order. Regional guilds go by region, then guild ID. */
export function guildsIn(category: string): Guild[] {
  const list = activeGuilds.filter((g) => g.category === category);
  if (category !== 'Regional Guild') return list;
  return [...list].sort((a, b) => (a.region ?? 999) - (b.region ?? 999) || Number(a.id) - Number(b.id));
}

/** Heading for a category: "Branch Guilds" when it has more than one guild. */
export const categoryHeading = (category: string) =>
  activeGuilds.filter((g) => g.category === category).length > 1 && !/s$/i.test(category) ? `${category}s` : category;

// Former names (web_former_names tab): an old spelling in a log -> the guild's name now.
const formerNames = new Map(
  parseCsv(formerNamesCsv)
    .filter((r) => r.old_name && r.current_name)
    .map((r) => [r.old_name.trim().toLowerCase(), r.current_name.trim()]),
);
/** The guild's current name for a name found in a log (Vespers -> Prodigy). */
export const currentName = (name: string) => formerNames.get(name.trim().toLowerCase()) ?? name;
/** The old name a row was logged under, or '' when it's the current name. */
export const listedAs = (name: string) => (currentName(name) !== name ? name : '');

const guildByName = new Map(guilds.map((g) => [g.name.toLowerCase(), g]));
export const guildNamed = (name: string) => guildByName.get(currentName(name).toLowerCase());

/** Category order on the directory: founding first, then sister, branch, regional, anything else. */
const CATEGORY_ORDER = ['Founding Guild', 'Sister Guild', 'Branch Guild', 'Regional Guild'];
export const categories = [...new Set(activeGuilds.map((g) => g.category))].sort(
  (a, b) => (CATEGORY_ORDER.indexOf(a) + 1 || 99) - (CATEGORY_ORDER.indexOf(b) + 1 || 99),
);
export const regions = [...new Set(guilds.map((g) => g.region).filter((r): r is number => r != null))].sort((a, b) => a - b);
export const activeRegions = [...new Set(activeGuilds.map((g) => g.region).filter((r): r is number => r != null))];
export const totalPlayers = activeGuilds.reduce((s, g) => s + g.players, 0);

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

interface ExpRow { expedition: string; guild: string; listedAs: string; map: string; league: string }

const isBlank = (v: string) => !v || /^n\/?a$/i.test(v);

const seasonNum = (id: string) => Number(id.replace(/\D/g, '')) || 0;

// web_settings "inactive_from", like "Hades: S10, Ignivar: S12": a guild's expedition rows from
// that expedition on are left out (the Expedition Log keeps copying their players in).
const inactiveFrom = new Map(
  (settings.inactive_from ?? '').split(/[,;]/)
    .map((part) => part.split(':').map((x) => x.trim()))
    .filter(([g, e]) => g && e)
    .map(([g, e]) => [g.toLowerCase(), seasonNum(e)]),
);
const stillActiveIn = (guild: string, expedition: string) => {
  const from = inactiveFrom.get(guild.toLowerCase());
  return from == null || seasonNum(expedition) < from;
};

const expRows: ExpRow[] = parseCsv(expeditionsCsv)
  .filter((r) => r.expedition && r.guild && stillActiveIn(currentName(r.guild), r.expedition))
  .map((r) => ({
    expedition: r.expedition.toUpperCase(),
    guild: currentName(r.guild),
    listedAs: listedAs(r.guild),
    map: isBlank(r.map) ? '' : r.map.toUpperCase(),
    league: isBlank(r.league) ? '' : r.league,
  }));

/** Expedition data before this season may not be accurate; those pages carry a note. */
export const ACCURATE_FROM = 13;
export const mayBeInaccurate = (id: string) => seasonNum(id) < ACCURATE_FROM;
export const ACCURACY_NOTE = `Seasons before ${ACCURATE_FROM} may not be accurate.`;
export const expeditionIds = [...new Set(expRows.map((r) => r.expedition))].sort((a, b) => seasonNum(a) - seasonNum(b));
export const currentExpedition =
  settings.current_expedition && expeditionIds.includes(settings.current_expedition.toUpperCase())
    ? settings.current_expedition.toUpperCase()
    : expeditionIds[expeditionIds.length - 1] ?? '';

export interface Tally { key: string; count: number }
export interface GuildExpedition {
  guild: string;
  guildRecord?: Guild;
  /** Old names the guild was logged under that expedition. */
  listedAs: string[];
  players: number;
  /** Players with a map entered. */
  mapped: number;
  maps: Tally[];
  /** Players per league, keyed "A·6": a league only exists within its map. */
  leagues: Tally[];
  mainMap: string;
  /** Most common league, keyed "A·6", or ''. */
  mainLeague: string;
}

/** "A·6" -> { map: 'A', league: '6' }. */
export const splitLeague = (key: string) => { const [map = '', league = ''] = key.split('·'); return { map, league }; };
/** Maps that have no leagues: Not enrolled and Solo. */
export const NO_LEAGUE_MAPS = new Set(['NE', 'S']);

function tally(values: string[], order: string[]): Tally[] {
  const counts = new Map<string, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  const rank = (k: string) => { const i = order.indexOf(k); return i < 0 ? 999 : i; };
  return [...counts].map(([key, count]) => ({ key, count })).sort((a, b) => rank(a.key) - rank(b.key) || a.key.localeCompare(b.key));
}
const top = (t: Tally[]) => [...t].sort((a, b) => b.count - a.count)[0]?.key ?? '';

const mapOrder = Object.keys(MAPS);
const leagueOrder = Object.keys(LEAGUES);
const leagueKeyOrder = mapOrder.flatMap((m) => leagueOrder.map((l) => `${m}·${l}`));

export function expedition(id: string): GuildExpedition[] {
  const rows = expRows.filter((r) => r.expedition === id);
  const byGuild = new Map<string, ExpRow[]>();
  for (const r of rows) byGuild.set(r.guild, [...(byGuild.get(r.guild) ?? []), r]);
  return [...byGuild].map(([guild, rs]) => {
    const maps = tally(rs.map((r) => r.map), mapOrder);
    const leagues = tally(rs.map((r) => (r.map && r.league && !NO_LEAGUE_MAPS.has(r.map) ? `${r.map}·${r.league}` : '')), leagueKeyOrder);
    return {
      guild,
      guildRecord: guildNamed(guild),
      listedAs: [...new Set(rs.map((r) => r.listedAs).filter(Boolean))],
      players: rs.length,
      mapped: rs.filter((r) => r.map).length,
      maps,
      leagues,
      mainMap: top(maps),
      mainLeague: top(leagues),
    };
  }).sort((a, b) => (a.guildRecord?.order ?? 999) - (b.guildRecord?.order ?? 999) || a.guild.localeCompare(b.guild));
}

export interface LeagueGroup {
  map: string;
  /** League number, or '' for players on this map with no league entered. */
  league: string;
  players: number;
  guilds: { guild: string; guildRecord?: Guild; listedAs: string[]; count: number }[];
}

/** Who is together: one group per map and league, with the guilds in it, in the sheet's map/league order. */
export function leagueGroups(id: string): { map: string; groups: LeagueGroup[] }[] {
  const rows = expRows.filter((r) => r.expedition === id && r.map && !NO_LEAGUE_MAPS.has(r.map));
  const byKey = new Map<string, ExpRow[]>();
  for (const r of rows) {
    const k = `${r.map}·${r.league}`;
    byKey.set(k, [...(byKey.get(k) ?? []), r]);
  }
  const rankOf = (arr: string[], v: string) => { const i = arr.indexOf(v); return i < 0 ? 999 : i; };
  const groups: LeagueGroup[] = [...byKey].map(([k, rs]) => {
    const { map, league } = splitLeague(k);
    const byGuild = new Map<string, ExpRow[]>();
    for (const r of rs) byGuild.set(r.guild, [...(byGuild.get(r.guild) ?? []), r]);
    return {
      map, league, players: rs.length,
      guilds: [...byGuild].map(([guild, gr]) => ({
        guild, guildRecord: guildNamed(guild), listedAs: [...new Set(gr.map((r) => r.listedAs).filter(Boolean))], count: gr.length,
      })).sort((a, b) => b.count - a.count || a.guild.localeCompare(b.guild)),
    };
  }).sort((a, b) => rankOf(mapOrder, a.map) - rankOf(mapOrder, b.map) || a.map.localeCompare(b.map)
    || (a.league === '' ? 1 : 0) - (b.league === '' ? 1 : 0) || rankOf(leagueOrder, a.league) - rankOf(leagueOrder, b.league));
  const maps = [...new Set(groups.map((g) => g.map))];
  return maps.map((map) => ({ map, groups: groups.filter((g) => g.map === map) }));
}

/** Maps and leagues actually used in an expedition, in the sheet's order. */
export function keysUsed(list: GuildExpedition[], field: 'maps' | 'leagues'): string[] {
  const order = field === 'maps' ? mapOrder : leagueKeyOrder;
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

// ---------- AbEx (the sheet's Vault of Time tabs) and Temporal Rift: Eden guilds only ----------

/** AbEx seasons left off the site: Season 2 was before AbEx went global. */
const ABEX_HIDDEN = new Set(['2']);

/** "4 Beta" -> "4-beta", used in page addresses. */
export const seasonSlug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
export const seasonName = (s: string) => `Season ${s.trim()}`;
/** Newest first: higher number first, and a full season before its beta. */
const seasonSort = (a: string, b: string) =>
  seasonNum(b) - seasonNum(a) || Number(/beta/i.test(a)) - Number(/beta/i.test(b)) || a.localeCompare(b);

export interface AbexRow {
  season: string;
  guild: string;
  listedAs: string;
  guildRecord?: Guild;
  server: number | null;
  region: number | null;
  dim: string;
  /** Finish time (hhh:mm:ss) when the guild cleared it, '' for DNF. */
  time: string;
  /** Total damage dealt, in raw game units. */
  damage: number | null;
  percent: number | null;
  /** Global rank, or null when the guild didn't place. */
  rank: number | null;
  /** True when the sheet says DNP (did not play). */
  dnp: boolean;
}

/** "71.99%" or the fraction 0.7199 (how the published sheet sends it) -> 71.99. */
const pctValue = (v: string | undefined) => {
  if (!v) return null;
  const n = num(v.replace('%', ''));
  return n == null ? null : v.includes('%') ? n : n * 100;
};

export const abex: AbexRow[] = parseCsv(abexCsv)
  .filter((r) => r.season && r.guild && !ABEX_HIDDEN.has(r.season.trim()))
  .map((r) => ({
    season: r.season.trim(),
    guild: currentName(r.guild),
    listedAs: listedAs(r.guild),
    guildRecord: guildNamed(r.guild),
    server: num(r.server),
    region: num(r.region),
    dim: r.dim,
    time: /^\d+:\d\d:\d\d$/.test(r.time) ? r.time : '',
    damage: num(r.damage),
    percent: pctValue(r.percent),
    rank: num(r.rank),
    dnp: /^dnp$/i.test(r.rank),
  }));

export const abexSeasons = [...new Set(abex.map((r) => r.season))].sort(seasonSort);
export const abexFor = (season: string) =>
  abex.filter((r) => r.season === season).sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9) || (b.damage ?? 0) - (a.damage ?? 0));

export interface RiftRow {
  season: string;
  place: number | null;
  player: string;
  floor: number | null;
  server: string;
  guild: string;
  listedAs: string;
  guildRecord?: Guild;
}

export const rift: RiftRow[] = parseCsv(riftCsv)
  .filter((r) => r.season && r.player)
  .map((r) => ({
    season: r.season.trim(),
    place: num(r.place),
    player: r.player,
    floor: num(r.floor),
    server: r.server.replace(/^s/i, ''),
    guild: currentName(r.guild),
    listedAs: listedAs(r.guild),
    guildRecord: guildNamed(r.guild),
  }));

export const riftSeasons = [...new Set(rift.map((r) => r.season))].sort(seasonSort);
export const riftFor = (season: string) => rift.filter((r) => r.season === season).sort((a, b) => (a.place ?? 1e9) - (b.place ?? 1e9));

/** 3,840,000,000,000 -> "3.84T"; 769,380,000,000 -> "769.38B". */
export function fmtDamage(n: number | null): string {
  if (n == null) return '—';
  const units: [number, string][] = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
  for (const [v, u] of units) if (n >= v) return `${(n / v).toLocaleString('en-US', { maximumFractionDigits: 2 })}${u}`;
  return fmtInt(n);
}

// ---------- Players and power (web_players: every guild block on the Region tabs, plus Player IDs) ----------

export interface Player {
  /** In-game player ID, or '' when it's missing or shared by two players (then there's no player card). */
  id: string;
  /** Name as on the Region tab, without the (L)/(D) role tag. */
  name: string;
  role: '' | 'Leader' | 'Deputy';
  guild: string;
  guildRecord?: Guild;
  /** Power in raw units (66M -> 66,000,000). */
  power: number | null;
  /** Rank in the region's top 30 arena, or null. */
  arena: number | null;
  server: string;
  /** Shown on the player card only. */
  language: string;
  /** Place by power across all Eden guilds (1 = strongest). */
  rank: number;
  /** Place by power within the guild. */
  guildRank: number;
  /** Campaign stage like "47-28" (chapter 47, stage 28), or null if not known. */
  campaign: { chapter: number; stage: number; text: string } | null;
  /** Place by campaign stage across all Eden guilds (ties share a place), or null. */
  campaignRank: number | null;
}

/** "66M" -> 66e6, "6483K" -> 6.483e6, "1.2B" -> 1.2e9. */
const powerValue = (v: string): number | null => {
  const m = /^([\d.,]+)\s*([KMB]?)$/i.exec((v ?? '').trim());
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ''));
  const mult = { K: 1e3, M: 1e6, B: 1e9 }[m[2].toUpperCase() as 'K' | 'M' | 'B'] ?? 1;
  return Number.isFinite(n) ? n * mult : null;
};

/** "47-28" -> chapter 47, stage 28. */
const campaignValue = (v: string | undefined): Player['campaign'] => {
  const m = /^\s*(\d+)\s*-\s*(\d+)\s*$/.exec(v ?? '');
  return m ? { chapter: Number(m[1]), stage: Number(m[2]), text: `${Number(m[1])}-${Number(m[2])}` } : null;
};

const playerRows = parseCsv(playersCsv).filter((r) => r.name && r.guild);
const idCount = new Map<string, number>();
for (const r of playerRows) if (r.player_id) idCount.set(r.player_id, (idCount.get(r.player_id) ?? 0) + 1);

const ranked = playerRows
  .map((r) => {
    const tag = /\s*\((L|D)\)\s*$/i.exec(r.name);
    const role: Player['role'] = tag ? (tag[1].toUpperCase() === 'L' ? 'Leader' : 'Deputy') : '';
    const guild = currentName(r.guild);
    return {
      id: r.player_id && idCount.get(r.player_id) === 1 ? r.player_id.replace(/\D/g, '') : '',
      name: tag ? r.name.slice(0, tag.index).trim() : r.name.trim(),
      role, guild, guildRecord: guildNamed(guild),
      power: powerValue(r.power), arena: num(r.arena),
      server: r.server.replace(/^s/i, ''), language: r.language,
      rank: 0, guildRank: 0,
      campaign: campaignValue(r.campaign), campaignRank: null,
    } satisfies Player;
  })
  .sort((a, b) => (b.power ?? -1) - (a.power ?? -1) || a.name.localeCompare(b.name));
ranked.forEach((p, i) => { p.rank = i + 1; });
const perGuild = new Map<string, number>();
for (const p of ranked) { const n = (perGuild.get(p.guild) ?? 0) + 1; perGuild.set(p.guild, n); p.guildRank = n; }

const campaignScore = (p: Player) => (p.campaign ? p.campaign.chapter * 1000 + p.campaign.stage : -1);
/** Players with a campaign stage, furthest first; equal stages share a place. */
export const playersByCampaign: Player[] = ranked
  .filter((p) => p.campaign)
  .sort((a, b) => campaignScore(b) - campaignScore(a) || (b.power ?? 0) - (a.power ?? 0) || a.name.localeCompare(b.name));
playersByCampaign.forEach((p, i) => {
  const prev = playersByCampaign[i - 1];
  p.campaignRank = prev && campaignScore(prev) === campaignScore(p) ? prev.campaignRank : i + 1;
});

/** Every player in Eden, strongest first. */
export const players: Player[] = ranked;
export const playersIn = (g: Guild) => players.filter((p) => p.guildRecord?.id === g.id);
export const totalPower = players.reduce((s, p) => s + (p.power ?? 0), 0);

/** 291e6 -> "291M", 6.483e6 -> "6.5M", 1.25e9 -> "1.25B". */
export function fmtPower(n: number | null): string {
  if (n == null) return '—';
  if (n >= 1e12) return `${(n / 1e12).toLocaleString('en-US', { maximumFractionDigits: 2 })}T`;
  if (n >= 1e9) return `${(n / 1e9).toLocaleString('en-US', { maximumFractionDigits: 2 })}B`;
  return `${(n / 1e6).toLocaleString('en-US', { maximumFractionDigits: n < 1e8 ? 1 : 0 })}M`;
}

/** Temporal Rift results that belong to a player: same guild, same name (role tags ignored). */
export function riftForPlayer(p: Player) {
  const norm = (s: string) => s.replace(/\s*\((L|D)\)\s*$/i, '').trim().toLowerCase();
  return rift.filter((r) => r.guildRecord && r.guildRecord.id === p.guildRecord?.id && norm(r.player) === norm(p.name));
}

/** The player card for a Rift row, when the name and guild match a player with an ID. */
export function playerForRift(r: RiftRow): Player | undefined {
  const norm = (s: string) => s.replace(/\s*\((L|D)\)\s*$/i, '').trim().toLowerCase();
  return players.find((p) => p.id && p.guildRecord && p.guildRecord.id === r.guildRecord?.id && norm(p.name) === norm(r.player));
}

export interface GuildPower {
  guild: Guild;
  players: number;
  total: number;
  average: number;
  strongest?: Player;
  rank: number;
}

/** Active guilds by total power, strongest first. */
export const guildPower: GuildPower[] = activeGuilds
  .map((g) => {
    const ms = players.filter((p) => p.guildRecord?.id === g.id);
    const total = ms.reduce((s, p) => s + (p.power ?? 0), 0);
    return { guild: g, players: ms.length, total, average: ms.length ? total / ms.length : 0, strongest: ms[0], rank: 0 };
  })
  .filter((x) => x.players > 0)
  .sort((a, b) => b.total - a.total);
guildPower.forEach((x, i) => { x.rank = i + 1; });
export const guildPowerOf = (g: Guild) => guildPower.find((x) => x.guild.id === g.id);
