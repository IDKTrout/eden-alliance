# Eden Alliance

Two small sites for the Eden Guild Alliance:

| Site | Folder | What it is |
|---|---|---|
| [edenafk.com](https://edenafk.com) | `home/` | The Eden home page: links to the alliance site and to [Event Rankings](https://event-rankings.edenafk.com). Plain HTML, no build. |
| [alliance.edenafk.com](https://alliance.edenafk.com) | repo root | The guild directory, each expedition's maps and leagues, and Eden's AbEx and Temporal Rift results, built with [Astro](https://astro.build) from the alliance sheet. |

## Where the data lives

Everything comes from the Google Sheet **Eden Guild Alliance 4.1**. The site reads only the seven `web_*` tabs, which (apart from `web_former_names`) are formulas over the real tabs and are the only tabs published to the web:

| Tab | Pulls from | Holds |
|---|---|---|
| `web_guilds` | Discord Bot | name, order, category, leader, deputies, purpose, region, guild ID, status, colour, players. **No Discord IDs.** |
| `web_expeditions` | Expedition Log | expedition, guild, map, league. **No player names.** |
| `web_settings` | Lists, plus typed rows | the current expedition, when member counts were last updated, and `inactive_from` (typed in, like `Hades: S10, Ignivar: S12`): an inactive guild's expedition rows from that expedition on are left off the site |
| `web_abex` | VoT Log | AbEx (Vault of Time) results for Eden guilds: season, guild, server, region, dim, time, damage, percent, rank. Season 2 is left off the site (before AbEx went global). |
| `web_rift` | TR Log | Temporal Rift results for Eden players: season, place, player, floor, server, guild |
| `web_players` | Region tabs + Player IDs | one row per player: guild, name, power, arena, player ID, server, language. Collects every "Eden: <guild>" block on the Region tabs and looks up the ID by guild and name. Language is shown only on player cards. |
| `web_former_names` | *(typed in directly)* | old guild names and the guild's name now (Vespers → Prodigy). Results logged under an old name are shown under the current guild, marked "listed as". |

Edit the sheet as usual (Discord Bot, Region tabs, Expedition Board); the `web_*` tabs follow on their own. Don't publish any other tab: Discord Bot holds Discord IDs and Other Groups holds the blacklist. `scripts/fetch-data.mjs` also refuses to save a tab whose header mentions Discord.

Map and league colours match the fills on the sheet's Lists tab; they are copied into `MAPS` and `LEAGUES` in `src/lib/data.ts`, so change them there too if you recolour the sheet.

## Logo

The full-size Eden logo is `assets/eden-logo-original.png` (not deployed; 2.9 MB). The sites use smaller copies made from it: `eden-logo.webp` (720 px on the home page, 400 px on the alliance site), `og.jpg` (link previews, 1200×630) and `apple-touch-icon.png`. The small crystal in headers and browser tabs stays as `favicon.svg`, because the full logo can't be read at that size.

## Guild emblems

Emblems come from the **Eden Guild Emblems** Drive folder, named after the guild like the sheet expects (`moon_sword.png`). The site shows `public/emblems/<name>.webp` (256 px); a guild without one shows its colour. To add or change one:

1. Download the PNG into `assets/emblems/` (that folder isn't committed; Drive keeps the originals).
2. Run `npm run emblems`, then commit the new `.webp` in `public/emblems/`.

## How it updates

- `.github/workflows/refresh-data.yml` downloads the published tabs every 3 hours and commits any change to `src/data/`, which makes Cloudflare rebuild the site. To update right away: **Actions** tab → **Refresh sheet data** → **Run workflow**.
- The publish ID is in `sheet.config.json` (or the `SHEET_PUB_ID` environment variable).

## Working on it locally

```bash
npm install
npm run data      # download the latest sheet data
npm run dev       # preview at http://localhost:4321
npm run build     # build into dist/
```

## Cloudflare setup

Two Workers projects, both connected to this repository (Workers & Pages → Create → Import a repository):

| Setting | Alliance site | Home page |
|---|---|---|
| Project name | `eden-alliance` | `edenafk-home` |
| Root directory | `/` | `home` |
| Build command | `npm run build` | *(none)* |
| Deploy command | `npx wrangler deploy` | `npx wrangler deploy` |
| Config | `wrangler.jsonc` | `home/wrangler.jsonc` |
| Custom domain | `alliance.edenafk.com` | `edenafk.com` (and `www.edenafk.com`) |
| Build watch paths | exclude `home/*` | include `home/*` only |
