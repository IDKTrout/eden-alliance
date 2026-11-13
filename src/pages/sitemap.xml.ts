import type { APIRoute } from 'astro';
import { guilds, expeditionIds, abexSeasons, riftSeasons, seasonSlug, players, regionPower } from '../lib/data';

export const GET: APIRoute = ({ site }) => {
  const paths = ['/', ...guilds.map((g) => `/guild/${g.id}/`), ...expeditionIds.map((e) => `/expedition/${e}/`), ...abexSeasons.map((s) => `/abex/${seasonSlug(s)}/`), ...riftSeasons.map((s) => `/rift/${seasonSlug(s)}/`), '/power/', '/campaign/', '/regions/', ...regionPower.map((r) => `/region/${r.region}/`), ...players.filter((p) => p.id).map((p) => `/player/${p.id}/`)];
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths
    .map((p) => `  <url><loc>${new URL(p, site)}</loc></url>`)
    .join('\n')}\n</urlset>\n`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml' } });
};
