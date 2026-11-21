const FLOW_COOKIE = '__Host-fragments-oauth';
const SESSION_COOKIE = '__Host-fragments-session';
const FLOW_TTL = 10 * 60;
const SESSION_TTL = 12 * 60 * 60;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function beginLogin(env) {
  const config = oauthConfig(env);
  if (!config) return new Response('登录尚未配置。', { status: 503 });

  const state = randomToken();
  const verifier = randomToken();
  const challenge = await crypto.subtle.digest('SHA-256', encoder.encode(verifier));
  const flow = await sign('oauth', { state, verifier, exp: now() + FLOW_TTL }, config);
  const location = new URL('https://github.com/login/oauth/authorize');
  location.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: `${config.origin}/callback`,
    state,
    code_challenge: base64Url(new Uint8Array(challenge)),
    code_challenge_method: 'S256',
    allow_signup: 'false',
  }).toString();

  return new Response(null, {
    status: 302,
    headers: { Location: location.href, 'Set-Cookie': cookie(FLOW_COOKIE, flow, FLOW_TTL) },
  });
}

export async function finishLogin(request, env, fetchImpl = fetch) {
  const config = oauthConfig(env);
  if (!config) return new Response('登录尚未配置。', { status: 503 });

  const headers = new Headers({ 'Set-Cookie': cookie(FLOW_COOKIE, '', 0) });
  const failed = () => new Response('GitHub 登录验证失败，请重新登录。', { status: 400, headers });
  const url = new URL(request.url);
  if (url.origin !== config.origin || url.pathname !== '/callback' || request.method !== 'GET') {
    return failed();
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const flow = await verify('oauth', readCookie(request, FLOW_COOKIE), config, FLOW_TTL);
  if (url.searchParams.has('error') || !code || !state || flow?.state !== state) return failed();

  try {
    const exchange = await fetchImpl('https://github.com/login/oauth/access_token', {
      method: 'POST',
      redirect: 'error',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Daily-Fragments',
      },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: `${config.origin}/callback`,
        code,
        code_verifier: flow.verifier,
      }),
    });
    if (!exchange.ok) return failed();
    const credentials = await exchange.json();
    if (credentials.error || !credentials.access_token || (credentials.scope ?? '') !== '') return failed();

    const identity = await fetchImpl('https://api.github.com/user', {
      redirect: 'error',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${credentials.access_token}`,
        'User-Agent': 'Daily-Fragments',
      },
    });
    if (!identity.ok) return failed();
    const user = await identity.json();
    if (!Number.isSafeInteger(user.id) || String(user.id) !== config.ownerId) {
      return new Response('此 GitHub 账号无权查看日记。', { status: 403, headers });
    }

    const session = await sign('session', { sub: config.ownerId, exp: now() + SESSION_TTL }, config);
    headers.append('Set-Cookie', cookie(SESSION_COOKIE, session, SESSION_TTL));
    headers.set('Location', '/');
    return new Response(null, { status: 302, headers });
  } catch {
    return failed();
  }
}

export async function hasSession(request, env) {
  const config = sessionConfig(env);
  if (!config || new URL(request.url).origin !== config.origin) return false;
  const session = await verify('session', readCookie(request, SESSION_COOKIE), config, SESSION_TTL);
  return session?.sub === config.ownerId;
}

export function logout() {
  const headers = new Headers({ Location: '/' });
  headers.append('Set-Cookie', cookie(SESSION_COOKIE, '', 0));
  headers.append('Set-Cookie', cookie(FLOW_COOKIE, '', 0));
  return new Response(null, { status: 303, headers });
}

export function sameOrigin(request, env) {
  const origin = appOrigin(env);
  return origin !== null && request.headers.get('Origin') === origin && new URL(request.url).origin === origin;
}

function appOrigin(env) {
  try {
    const url = new URL(env?.APP_ORIGIN);
    return url.protocol === 'https:' && url.origin === env.APP_ORIGIN ? url.origin : null;
  } catch {
    return null;
  }
}

function sessionConfig(env) {
  const origin = appOrigin(env);
  const ownerId = String(env?.OWNER_ID ?? '');
  const secret = env?.SESSION_SECRET;
  if (!origin || !/^[1-9]\d{0,15}$/u.test(ownerId) || typeof secret !== 'string' || secret.trim().length < 32) {
    return null;
  }
  return { origin, ownerId, secret };
}

function oauthConfig(env) {
  const config = sessionConfig(env);
  if (!config || !env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) return null;
  return { ...config, clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET };
}

function cookie(name, value, ttl) {
  return `${name}=${value}; Max-Age=${ttl}; Path=/; Secure; HttpOnly; SameSite=Lax`;
}

function readCookie(request, name) {
  const prefix = `${name}=`;
  const matches = (request.headers.get('Cookie') ?? '').split(';')
    .map(part => part.trim())
    .filter(part => part.startsWith(prefix));
  return matches.length === 1 ? matches[0].slice(prefix.length) : '';
}

function now() {
  return Math.floor(Date.now() / 1000);
}

function base64Url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function fromBase64Url(value) {
  const standard = value.replaceAll('-', '+').replaceAll('_', '/');
  return Uint8Array.from(atob(standard), character => character.charCodeAt(0));
}

function randomToken() {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)));
}

function signingKey(secret, use) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [use]);
}

function signedBytes(purpose, body, origin) {
  return encoder.encode(`daily-fragments/v1\0${origin}\0${purpose}\0${body}`);
}

async function sign(purpose, payload, config) {
  const body = base64Url(encoder.encode(JSON.stringify(payload)));
  const key = await signingKey(config.secret, 'sign');
  const signature = await crypto.subtle.sign('HMAC', key, signedBytes(purpose, body, config.origin));
  return `${body}.${base64Url(new Uint8Array(signature))}`;
}

async function verify(purpose, token, config, ttl) {
  if (!/^[\w-]{1,400}\.[\w-]{43}$/u.test(token)) return null;
  const [body, signature] = token.split('.');
  try {
    const bytes = fromBase64Url(signature);
    if (base64Url(bytes) !== signature) return null;
    const key = await signingKey(config.secret, 'verify');
    const valid = await crypto.subtle.verify('HMAC', key, bytes, signedBytes(purpose, body, config.origin));
    if (!valid) return null;
    const payload = JSON.parse(decoder.decode(fromBase64Url(body)));
    const time = now();
    return Number.isSafeInteger(payload?.exp) && payload.exp > time && payload.exp <= time + ttl ? payload : null;
  } catch {
    return null;
  }
}
