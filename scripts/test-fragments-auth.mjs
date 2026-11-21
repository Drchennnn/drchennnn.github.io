import assert from 'node:assert/strict';
import test from 'node:test';
import { beginLogin, finishLogin, hasSession, logout, sameOrigin } from '../worker/daily-fragments/auth.js';

const ORIGIN = 'https://daily-fragments.example.com';
const OWNER_ID = 172265187;
const env = {
  APP_ORIGIN: ORIGIN,
  OWNER_ID: String(OWNER_ID),
  GITHUB_CLIENT_ID: 'test-client-id',
  GITHUB_CLIENT_SECRET: 'test-oauth-client-secret',
  SESSION_SECRET: 'test-session-secret-fifty-bytes-only-for-local-tests',
};

function readResponseCookie(response, name) {
  return response.headers.getSetCookie().find(value => value.startsWith(`${name}=`));
}

async function start() {
  const response = await beginLogin(env);
  assert.equal(response.status, 302);
  const location = new URL(response.headers.get('Location'));
  const cookie = readResponseCookie(response, '__Host-fragments-oauth');
  assert.match(cookie, /; Max-Age=600; Path=\/; Secure; HttpOnly; SameSite=Lax$/u);
  return { location, cookie: cookie.split(';')[0], state: location.searchParams.get('state') };
}

function callback(flow, { origin = ORIGIN, state = flow.state, cookie = flow.cookie } = {}) {
  const query = new URLSearchParams({ code: 'short-lived-code', state });
  return new Request(`${origin}/callback?${query}`, { headers: { Cookie: cookie } });
}

function github(flow, { id = OWNER_ID, scope = '' } = {}) {
  return async (url, options) => {
    assert.equal(options.redirect, 'error');
    if (url === 'https://github.com/login/oauth/access_token') {
      assert.equal(options.method, 'POST');
      assert.equal(options.body.get('client_secret'), env.GITHUB_CLIENT_SECRET);
      assert.equal(options.body.get('redirect_uri'), `${ORIGIN}/callback`);
      assert.equal(options.body.get('code'), 'short-lived-code');
      const verifier = options.body.get('code_verifier');
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
      assert.equal(Buffer.from(digest).toString('base64url'), flow.location.searchParams.get('code_challenge'));
      return Response.json({ access_token: 'github-token-must-stay-server-side', scope });
    }
    assert.equal(url, 'https://api.github.com/user');
    assert.equal(options.headers.Authorization, 'Bearer github-token-must-stay-server-side');
    return Response.json({ login: 'DisplayNameIsNotAuthorization', id });
  };
}

test('OAuth uses a pinned callback with a random state, PKCE and no scopes', async () => {
  const { location, state, cookie } = await start();
  assert.equal(location.href.split('?')[0], 'https://github.com/login/oauth/authorize');
  assert.equal(location.searchParams.get('redirect_uri'), `${ORIGIN}/callback`);
  assert.equal(location.searchParams.get('client_id'), env.GITHUB_CLIENT_ID);
  assert.equal(location.searchParams.has('scope'), false);
  assert.equal(location.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(location.searchParams.get('allow_signup'), 'false');
  assert.match(state, /^[\w-]{43}$/u);
  assert.notEqual((await start()).state, state);
  assert.equal(await hasSession(new Request(ORIGIN, { headers: { Cookie: cookie } }), env), false);
});

test('wrong state, callback origin and tampered cookies fail before contacting GitHub', async () => {
  const flow = await start();
  const wrongState = callback(flow, { state: 'not-the-correct-state' });
  const wrongOrigin = callback(flow, { origin: 'https://another.example.com' });
  const tampered = callback(flow, { cookie: `${flow.cookie}x` });
  const noCookie = callback(flow, { cookie: '' });
  let fetchCalls = 0;
  for (const request of [wrongState, wrongOrigin, tampered, noCookie]) {
    const response = await finishLogin(request, env, () => { fetchCalls += 1; });
    assert.equal(response.status, 400);
    assert.match(readResponseCookie(response, '__Host-fragments-oauth'), /Max-Age=0/u);
    assert.equal(readResponseCookie(response, '__Host-fragments-session'), undefined);
  }
  assert.equal(fetchCalls, 0);
});

test('expired OAuth state fails before contacting GitHub', async t => {
  const time = 1_789_000_000_000;
  const clock = t.mock.method(Date, 'now', () => time);
  const flow = await start();
  clock.mock.mockImplementation(() => time + 600_000);
  let fetchCalls = 0;
  const response = await finishLogin(callback(flow), env, () => { fetchCalls += 1; });
  assert.equal(response.status, 400);
  assert.equal(fetchCalls, 0);
});

test('an unauthorized GitHub identity or broader OAuth scope gets no session', async () => {
  const flow = await start();
  const other = await finishLogin(callback(flow), env, github(flow, { id: OWNER_ID + 1 }));
  assert.equal(other.status, 403);
  assert.equal(readResponseCookie(other, '__Host-fragments-session'), undefined);

  const broad = await finishLogin(callback(flow), env, github(flow, { scope: 'repo' }));
  assert.equal(broad.status, 400);
  assert.equal(readResponseCookie(broad, '__Host-fragments-session'), undefined);
});

test('owner session is confined to its origin, owner and expiration', async t => {
  const time = 1_789_000_000_000;
  const clock = t.mock.method(Date, 'now', () => time);
  const flow = await start();
  const response = await finishLogin(callback(flow), env, github(flow));
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('Location'), '/');
  assert.doesNotMatch(await response.text(), /github-token|client-secret/u);
  assert.doesNotMatch([...response.headers.values()].join(' '), /github-token|client-secret/u);

  const session = readResponseCookie(response, '__Host-fragments-session');
  assert.match(session, /; Max-Age=43200; Path=\/; Secure; HttpOnly; SameSite=Lax$/u);
  assert.match(readResponseCookie(response, '__Host-fragments-oauth'), /Max-Age=0/u);
  const cookie = session.split(';')[0];
  const request = new Request(`${ORIGIN}/media/photo.jpg`, { headers: { Cookie: cookie } });
  assert.equal(await hasSession(request, env), true);
  assert.equal(await hasSession(request, { ...env, OWNER_ID: OWNER_ID + 1 }), false);
  assert.equal(await hasSession(request, { ...env, SESSION_SECRET: 'short' }), false);
  assert.equal(await hasSession(new Request('https://other.example.com', { headers: request.headers }), env), false);
  assert.equal(await hasSession(new Request(ORIGIN, { headers: { Cookie: `${cookie}x` } }), env), false);
  assert.equal(await hasSession(new Request(ORIGIN, { headers: { Cookie: `${cookie}; ${cookie}` } }), env), false);
  clock.mock.mockImplementation(() => time + 43_200_000);
  assert.equal(await hasSession(request, env), false);
});

test('logout requires exact origin when the CSRF helper is used and clears both cookies', () => {
  assert.equal(sameOrigin(new Request(`${ORIGIN}/logout`, { headers: { Origin: ORIGIN } }), env), true);
  assert.equal(sameOrigin(new Request(`${ORIGIN}/logout`), env), false);
  assert.equal(sameOrigin(new Request(`${ORIGIN}/logout`, { headers: { Origin: 'https://other.example.com' } }), env), false);
  assert.equal(sameOrigin(new Request('https://other.example.com/logout', { headers: { Origin: ORIGIN } }), env), false);

  const response = logout();
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('Location'), '/');
  for (const name of ['__Host-fragments-oauth', '__Host-fragments-session']) {
    assert.match(readResponseCookie(response, name), /Max-Age=0; Path=\/; Secure; HttpOnly; SameSite=Lax/u);
  }
});
