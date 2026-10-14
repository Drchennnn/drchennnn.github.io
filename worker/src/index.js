const PROVIDER = 'github';
const REPOSITORY = 'Drchennnn/drchennnn.github.io';
const STATE_COOKIE = 'byweb_oauth_state';
const PKCE_COOKIE = 'byweb_oauth_pkce';
const STATE_TTL_SECONDS = 10 * 60;
const GITHUB_API_VERSION = '2022-11-28';

const encoder = new TextEncoder();

export default {
  fetch(request, env) {
    return handleRequest(request, env);
  },
};

export async function handleRequest(request, env, runtime = {}) {
  const fetchImpl = runtime.fetch ?? fetch;
  const now = runtime.now ?? (() => Date.now());

  let config;
  try {
    config = readConfig(env);
  } catch {
    return textResponse('OAuth service is not configured.', 503);
  }

  const url = new URL(request.url);
  if (request.method !== 'GET') {
    return textResponse('Method not allowed.', 405, { Allow: 'GET' });
  }

  if (url.pathname === '/') {
    return textResponse('BYweb OAuth service is ready.');
  }

  if (url.pathname === '/auth') {
    return beginAuthorization(url, config, now);
  }

  if (url.pathname === '/callback') {
    return completeAuthorization(request, url, config, fetchImpl, now);
  }

  return textResponse('Not found.', 404);
}

function readConfig(env) {
  const required = [
    'GITHUB_CLIENT_ID',
    'GITHUB_CLIENT_SECRET',
    'ALLOWED_ORIGIN',
    'ALLOWED_USER',
  ];
  for (const key of required) {
    if (typeof env?.[key] !== 'string' || !env[key].trim()) {
      throw new Error(`Missing ${key}`);
    }
  }

  const allowedUrl = new URL(env.ALLOWED_ORIGIN);
  if (allowedUrl.protocol !== 'https:' || allowedUrl.origin !== env.ALLOWED_ORIGIN) {
    throw new Error('ALLOWED_ORIGIN must be an HTTPS origin without a path');
  }

  return {
    clientId: env.GITHUB_CLIENT_ID,
    clientSecret: env.GITHUB_CLIENT_SECRET,
    allowedOrigin: allowedUrl.origin,
    allowedHost: allowedUrl.host,
    allowedUser: env.ALLOWED_USER,
  };
}

async function beginAuthorization(url, config, now) {
  if (
    url.searchParams.get('provider') !== PROVIDER ||
    url.searchParams.get('site_id') !== config.allowedHost
  ) {
    return textResponse('Invalid authentication request.', 400);
  }

  const requestedScope = url.searchParams.get('scope');
  if (requestedScope && requestedScope !== 'public_repo') {
    return textResponse('Unsupported OAuth scope.', 400);
  }

  const issuedAt = Math.floor(now() / 1000);
  const nonce = randomBase64Url(32);
  const verifier = randomBase64Url(48);
  const state = await signPayload(
    { nonce, origin: config.allowedOrigin, iat: issuedAt, exp: issuedAt + STATE_TTL_SECONDS },
    config.clientSecret,
  );
  const pkce = await signPayload(
    { nonce, verifier, exp: issuedAt + STATE_TTL_SECONDS },
    config.clientSecret,
  );
  const challenge = base64UrlEncode(
    new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(verifier))),
  );

  const callbackUrl = `${url.origin}/callback`;
  const githubUrl = new URL('https://github.com/login/oauth/authorize');
  githubUrl.searchParams.set('client_id', config.clientId);
  githubUrl.searchParams.set('redirect_uri', callbackUrl);
  githubUrl.searchParams.set('scope', 'public_repo');
  githubUrl.searchParams.set('state', state);
  githubUrl.searchParams.set('code_challenge', challenge);
  githubUrl.searchParams.set('code_challenge_method', 'S256');
  githubUrl.searchParams.set('allow_signup', 'false');

  const headers = secureHeaders();
  headers.set('Location', githubUrl.toString());
  headers.append('Set-Cookie', cookie(STATE_COOKIE, state, STATE_TTL_SECONDS));
  headers.append('Set-Cookie', cookie(PKCE_COOKIE, pkce, STATE_TTL_SECONDS));
  return new Response(null, { status: 302, headers });
}

async function completeAuthorization(request, url, config, fetchImpl, now) {
  const cookies = parseCookies(request.headers.get('Cookie'));
  const suppliedState = url.searchParams.get('state') ?? '';
  const code = url.searchParams.get('code') ?? '';
  const githubError = url.searchParams.get('error');

  try {
    if (githubError) {
      throw new OAuthError('GitHub authorization was cancelled.');
    }
    if (!code || !suppliedState || cookies[STATE_COOKIE] !== suppliedState) {
      throw new OAuthError('The login request could not be verified.');
    }

    const state = await verifyPayload(suppliedState, config.clientSecret, now());
    const pkce = await verifyPayload(cookies[PKCE_COOKIE] ?? '', config.clientSecret, now());
    if (
      state.origin !== config.allowedOrigin ||
      typeof state.nonce !== 'string' ||
      state.nonce !== pkce.nonce ||
      typeof pkce.verifier !== 'string'
    ) {
      throw new OAuthError('The login request could not be verified.');
    }

    const token = await exchangeCode(
      code,
      pkce.verifier,
      `${url.origin}/callback`,
      config,
      fetchImpl,
    );
    await verifyGitHubAccess(token, config, fetchImpl);
    return authorizationPage(config.allowedOrigin, { token, provider: PROVIDER });
  } catch (error) {
    const message = error instanceof OAuthError ? error.message : 'GitHub login failed.';
    return authorizationPage(config.allowedOrigin, null, message);
  }
}

async function exchangeCode(code, verifier, redirectUri, config, fetchImpl) {
  let response;
  try {
    response = await fetchImpl('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'BYweb-OAuth-Worker',
      },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: redirectUri,
        code_verifier: verifier,
      }),
    });
  } catch {
    throw new OAuthError('GitHub could not be reached.');
  }

  if (!response.ok) {
    throw new OAuthError('GitHub rejected the login request.');
  }

  const data = await safeJson(response);
  if (data.error || typeof data.access_token !== 'string') {
    throw new OAuthError('GitHub rejected the login request.');
  }

  const scopes = new Set(
    String(data.scope ?? '')
      .split(',')
      .map(scope => scope.trim())
      .filter(Boolean),
  );
  if (scopes.size !== 1 || !scopes.has('public_repo')) {
    throw new OAuthError('GitHub returned an unexpected permission scope.');
  }
  return data.access_token;
}

async function verifyGitHubAccess(token, config, fetchImpl) {
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'User-Agent': 'BYweb-OAuth-Worker',
    'X-GitHub-Api-Version': GITHUB_API_VERSION,
  };

  const [userResponse, repoResponse] = await Promise.all([
    githubFetch(fetchImpl, 'https://api.github.com/user', headers),
    githubFetch(fetchImpl, `https://api.github.com/repos/${REPOSITORY}`, headers),
  ]);
  if (!userResponse.ok || !repoResponse.ok) {
    throw new OAuthError('GitHub permissions could not be verified.');
  }

  const user = await safeJson(userResponse);
  const repo = await safeJson(repoResponse);
  if (user.login !== config.allowedUser) {
    throw new OAuthError('This GitHub account is not allowed to manage the blog.');
  }
  if (repo.full_name !== REPOSITORY || repo.permissions?.push !== true) {
    throw new OAuthError('This GitHub account does not have write access to the blog.');
  }
}

async function githubFetch(fetchImpl, url, headers) {
  try {
    return await fetchImpl(url, { headers });
  } catch {
    throw new OAuthError('GitHub could not be reached.');
  }
}

function authorizationPage(targetOrigin, credentials, errorMessage) {
  const result = credentials
    ? `authorization:${PROVIDER}:success:${JSON.stringify(credentials)}`
    : `authorization:${PROVIDER}:error:${JSON.stringify({ message: errorMessage })}`;
  const nonce = randomBase64Url(18);
  const script = `
    (() => {
      const targetOrigin = ${safeScriptJson(targetOrigin)};
      const result = ${safeScriptJson(result)};
      const finish = event => {
        if (event.source !== window.opener || event.origin !== targetOrigin || event.data !== 'authorizing:github') return;
        window.removeEventListener('message', finish);
        window.opener.postMessage(result, targetOrigin);
      };
      window.addEventListener('message', finish);
      if (!window.opener) {
        document.getElementById('status').textContent = '请从博客管理页面重新登录。';
        return;
      }
      window.opener.postMessage('authorizing:github', targetOrigin);
    })();`;

  const headers = secureHeaders();
  headers.set('Content-Type', 'text/html; charset=utf-8');
  headers.set(
    'Content-Security-Policy',
    `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
  );
  clearOAuthCookies(headers);
  return new Response(
    `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>博客登录</title><style>body{font:16px/1.7 system-ui,sans-serif;display:grid;min-height:100vh;place-items:center;margin:0;background:#f8f7f3;color:#353b35}main{max-width:30rem;padding:2rem;text-align:center}</style><main><p id="status">正在完成 GitHub 登录…</p></main><script nonce="${nonce}">${script}</script></html>`,
    { status: credentials ? 200 : 400, headers },
  );
}

async function signPayload(payload, secret) {
  const body = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const key = await hmacKey(secret, ['sign']);
  const signature = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, encoder.encode(body)),
  );
  return `${body}.${base64UrlEncode(signature)}`;
}

async function verifyPayload(token, secret, nowMs) {
  const [body, signature, extra] = token.split('.');
  if (!body || !signature || extra) throw new OAuthError('Invalid OAuth state.');
  const key = await hmacKey(secret, ['verify']);
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    base64UrlDecode(signature),
    encoder.encode(body),
  );
  if (!valid) throw new OAuthError('Invalid OAuth state.');

  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(body)));
  } catch {
    throw new OAuthError('Invalid OAuth state.');
  }
  const nowSeconds = Math.floor(nowMs / 1000);
  if (
    !Number.isInteger(payload.iat ?? nowSeconds) ||
    !Number.isInteger(payload.exp) ||
    payload.exp < nowSeconds ||
    payload.exp > nowSeconds + STATE_TTL_SECONDS
  ) {
    throw new OAuthError('Expired OAuth state.');
  }
  return payload;
}

function hmacKey(secret, usages) {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(`BYweb OAuth state v1\0${secret}`),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    usages,
  );
}

function randomBase64Url(length) {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(length)));
}

function base64UrlEncode(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function base64UrlDecode(value) {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new OAuthError('Invalid OAuth state.');
  const standard = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = standard.padEnd(Math.ceil(standard.length / 4) * 4, '=');
  try {
    return Uint8Array.from(atob(padded), character => character.charCodeAt(0));
  } catch {
    throw new OAuthError('Invalid OAuth state.');
  }
}

function parseCookies(value) {
  const cookies = {};
  for (const part of String(value ?? '').split(';')) {
    const separator = part.indexOf('=');
    if (separator < 1) continue;
    const name = part.slice(0, separator).trim();
    const cookieValue = part.slice(separator + 1).trim();
    cookies[name] = cookieValue;
  }
  return cookies;
}

function cookie(name, value, maxAge) {
  return `${name}=${value}; Max-Age=${maxAge}; Path=/callback; HttpOnly; Secure; SameSite=Lax`;
}

function clearOAuthCookies(headers) {
  headers.append('Set-Cookie', cookie(STATE_COOKIE, '', 0));
  headers.append('Set-Cookie', cookie(PKCE_COOKIE, '', 0));
}

function secureHeaders(extra = {}) {
  return new Headers({
    'Cache-Control': 'no-store, max-age=0',
    Pragma: 'no-cache',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    ...extra,
  });
}

function textResponse(body, status = 200, extraHeaders = {}) {
  const headers = secureHeaders({ 'Content-Type': 'text/plain; charset=utf-8', ...extraHeaders });
  return new Response(body, { status, headers });
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    throw new OAuthError('GitHub returned an invalid response.');
  }
}

function safeScriptJson(value) {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}

class OAuthError extends Error {}

