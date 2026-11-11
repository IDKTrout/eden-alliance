# Eden Alliance

Two small sites for the Eden Guild Alliance:

| Site | Folder | What it is |
|---|---|---|
| [edenafk.com](https://edenafk.com) | `home/` | The Eden home page: links to the alliance site and to [Event Rankings](https://event-rankings.edenafk.com). Plain HTML, no build. |
| [alliance.edenafk.com](https://alliance.edenafk.com) | repo root | The guild directory and each expedition's maps and leagues, built with [Astro](https://astro.build) from the alliance sheet. |

## Where the data lives

Everything comes from the Google Sheet **Eden Guild Alliance 4.1**. The site reads only the three `web_*` tabs, which are formulas over the real tabs and are the only tabs published to the web:

| Tab | Pulls from | Holds |
|---|---|---|
| `web_guilds` | Discord Bot | name, order, category, leader, deputies, purpose, region, guild ID, status, colour, players. **No Discord IDs.** |
| `web_expeditions` | Expedition Log | expedition, guild, map, league. **No player names.** |
| `web_settings` | Lists | the current expedition, and when member counts were last updated |

Edit the sheet as usual (Discord Bot, Region tabs, Expedition Board); the `web_*` tabs follow on their own. Don't publish any other tab: Discord Bot holds Discord IDs and Other Groups holds the blacklist. `scripts/fetch-data.mjs` also refuses to save a tab whose header mentions Discord.

Map and league colours match the fills on the sheet's Lists tab; they are copied into `MAPS` and `LEAGUES` in `src/lib/data.ts`, so change them there too if you recolour the sheet.

## Logo

The full-size Eden logo is `assets/eden-logo-original.png` (not deployed; 2.9 MB). The sites use smaller copies made from it: `eden-logo.webp` (720 px on the home page, 400 px on the alliance site), `og.jpg` (link previews, 1200×630) and `apple-touch-icon.png`. The small crystal in headers and browser tabs stays as `favicon.svg`, because the full logo can't be read at that size.

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
