// Cloudflare Worker for alliance.edenafk.com. Static pages are served straight from dist/ (the
// Astro build); only /members/* and /auth/* come through here (see run_worker_first in
// wrangler.jsonc).
//
// /members/*  pages for approved members: needs a valid session from a Discord login, and the
//             Discord account must be allowed (by ID now; by server role once that's set up).
// /auth/*     Discord login (discord, callback), logout, and "me" (who is logged in, for pages).
//
// Settings, all added as *secrets* in Cloudflare (Workers -> eden-alliance -> Settings ->
// Variables and secrets), never in this repo:
//   DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET   from the Discord application (OAuth2 page)
//   SESSION_SECRET                             any long random string; signs the login cookie
//   ALLOWED_DISCORD_IDS                        Discord user IDs allowed in, separated by commas
// Optional, for role-based access later (both needed to turn it on):
//   DISCORD_GUILD_ID                           the Eden Discord server ID
//   ALLOWED_ROLE_IDS                           role IDs allowed in, separated by commas

const SESSION_COOKIE = 'eden_session';
const STATE_COOKIE = 'eden_oauth';
const SESSION_DAYS = 7; // roles are re-checked at each login, so keep sessions fairly short

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (path.startsWith('/auth/')) return await auth(request, env, url);
      if (path === '/members' || path.startsWith('/members/')) return await members(request, env, url);
    } catch (err) {
      console.error(err);
      return text('Something went wrong with the login. Please try again.', 500);
    }
    return env.ASSETS.fetch(request);
  },
};

// ---------- members pages ----------

async function members(request, env, url) {
  const session = await readSession(request, env);
  if (!session) {
    return redirect(`/login/?next=${encodeURIComponent(url.pathname)}`);
  }
  if (!isAllowed(session, env)) {
    const page = await env.ASSETS.fetch(new URL('/not-allowed/', url));
    return new Response(page.body, { status: 403, headers: privateHeaders(page.headers) });
  }
  const res = await env.ASSETS.fetch(request);
  return new Response(res.body, { status: res.status, headers: privateHeaders(res.headers) });
}

function isAllowed(session, env) {
  const ids = list(env.ALLOWED_DISCORD_IDS);
  if (ids.includes(session.id)) return true;
  const roles = list(env.ALLOWED_ROLE_IDS);
  return roles.length > 0 && (session.roles ?? []).some((r) => roles.includes(r));
}

// ---------- /auth ----------

async function auth(request, env, url) {
  const route = url.pathname.replace(/\/+$/, '');

  if (route === '/auth/me') {
    const s = await readSession(request, env);
    const body = s ? { loggedIn: true, allowed: isAllowed(s, env), name: s.name } : { loggedIn: false, allowed: false };
    return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  }

  if (route === '/auth/logout') {
    return redirect('/', [cookie(SESSION_COOKIE, '', 0)]);
  }

  if (route === '/auth/discord') {
    if (!env.DISCORD_CLIENT_ID) return text('Discord login is not set up yet.', 503);
    const next = safeNext(url.searchParams.get('next'));
    const state = randomString(24);
    const useRoles = env.DISCORD_GUILD_ID && list(env.ALLOWED_ROLE_IDS).length > 0;
    const q = new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID,
      redirect_uri: `${url.origin}/auth/callback`,
      response_type: 'code',
      scope: useRoles ? 'identify guilds.members.read' : 'identify',
      state,
      prompt: 'none',
    });
    return redirect(`https://discord.com/oauth2/authorize?${q}`, [cookie(STATE_COOKIE, `${state}.${b64url(next)}`, 600)]);
  }

  if (route === '/auth/callback') {
    const saved = getCookie(request, STATE_COOKIE) ?? '';
    const [state, nextEnc] = saved.split('.');
    const clear = cookie(STATE_COOKIE, '', 0);
    if (url.searchParams.get('error')) return redirect('/', [clear]); // they pressed Cancel on Discord
    if (!state || state !== url.searchParams.get('state')) return text('The login link expired. Please try logging in again.', 400, [clear]);
    const code = url.searchParams.get('code');
    if (!code) return text('Discord did not send a login code. Please try again.', 400, [clear]);

    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.DISCORD_CLIENT_ID,
        client_secret: env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${url.origin}/auth/callback`,
      }),
    });
    if (!tokenRes.ok) return text('Discord login failed. Please try again.', 502, [clear]);
    const { access_token: token } = await tokenRes.json();

    const userRes = await fetch('https://discord.com/api/users/@me', { headers: { authorization: `Bearer ${token}` } });
    if (!userRes.ok) return text('Could not read your Discord account. Please try again.', 502, [clear]);
    const user = await userRes.json();

    let roles = [];
    if (env.DISCORD_GUILD_ID && list(env.ALLOWED_ROLE_IDS).length > 0) {
      const m = await fetch(`https://discord.com/api/users/@me/guilds/${env.DISCORD_GUILD_ID}/member`, { headers: { authorization: `Bearer ${token}` } });
      if (m.ok) roles = (await m.json()).roles ?? [];
    }

    const session = {
      id: String(user.id),
      name: user.global_name || user.username || 'Discord user',
      roles,
      exp: Date.now() + SESSION_DAYS * 864e5,
    };
    const next = safeNext(nextEnc ? fromB64url(nextEnc) : '');
    return redirect(next, [clear, cookie(SESSION_COOKIE, await sign(session, env), SESSION_DAYS * 86400)]);
  }

  return text('Not found', 404);
}

// ---------- sessions (a signed cookie; nothing is stored on the server) ----------

async function sign(data, env) {
  const body = b64url(JSON.stringify(data));
  return `${body}.${await hmac(body, env)}`;
}

async function readSession(request, env) {
  const raw = getCookie(request, SESSION_COOKIE);
  if (!raw || !env.SESSION_SECRET) return null;
  const [body, mac] = raw.split('.');
  if (!body || !mac || mac !== (await hmac(body, env))) return null;
  try {
    const data = JSON.parse(fromB64url(body));
    return data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}

async function hmac(message, env) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return b64urlBytes(new Uint8Array(sig));
}

// ---------- helpers ----------

const list = (v) => String(v ?? '').split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);

/** Only send people back to pages on this site, never to another address. */
const safeNext = (n) => (typeof n === 'string' && /^\/[a-z0-9/_-]*$/i.test(n) && !n.startsWith('//') ? n : '/');

function privateHeaders(h) {
  const headers = new Headers(h);
  headers.set('cache-control', 'private, no-store');
  headers.set('x-robots-tag', 'noindex, nofollow');
  return headers;
}

function cookie(name, value, maxAge) {
  return `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

function getCookie(request, name) {
  const all = request.headers.get('cookie') ?? '';
  for (const part of all.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

function redirect(location, cookies = []) {
  const headers = new Headers({ location, 'cache-control': 'no-store' });
  for (const c of cookies) headers.append('set-cookie', c);
  return new Response(null, { status: 302, headers });
}

function text(message, status, cookies = []) {
  const headers = new Headers({ 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
  for (const c of cookies) headers.append('set-cookie', c);
  return new Response(message, { status, headers });
}

function randomString(bytes) {
  return b64urlBytes(crypto.getRandomValues(new Uint8Array(bytes)));
}

function b64urlBytes(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const b64url = (str) => b64urlBytes(new TextEncoder().encode(str));

function fromB64url(s) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}
