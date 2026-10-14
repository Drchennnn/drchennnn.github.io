import assert from 'node:assert/strict';
import { handleRequest } from '../worker/src/index.js';

const ORIGIN = 'https://byweb-auth.drchennnn.workers.dev';
const NOW = Date.UTC(2026, 9, 15, 12, 0, 0);
const env = {
  GITHUB_CLIENT_ID: 'client-id',
  GITHUB_CLIENT_SECRET: 'test-secret-that-is-not-used-in-production',
  ALLOWED_ORIGIN: 'https://drchennnn.github.io',
  ALLOWED_USER: 'Drchennnn',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function cookieHeader(response) {
  const raw = response.headers.get('set-cookie') ?? '';
  const state = raw.match(/byweb_oauth_state=([^;,]+)/u)?.[1];
  const pkce = raw.match(/byweb_oauth_pkce=([^;,]+)/u)?.[1];
  assert.ok(state && pkce, 'authorization response sets both OAuth cookies');
  assert.match(raw, /HttpOnly/u);
  assert.match(raw, /Secure/u);
  assert.match(raw, /SameSite=Lax/u);
  return `byweb_oauth_state=${state}; byweb_oauth_pkce=${pkce}`;
}

async function start() {
  const response = await handleRequest(
    new Request(`${ORIGIN}/auth?provider=github&site_id=drchennnn.github.io&scope=public_repo`),
    env,
    { now: () => NOW },
  );
  assert.equal(response.status, 302);
  const location = new URL(response.headers.get('location'));
  assert.equal(location.origin, 'https://github.com');
  assert.equal(location.pathname, '/login/oauth/authorize');
  assert.equal(location.searchParams.get('scope'), 'public_repo');
  assert.equal(location.searchParams.get('code_challenge_method'), 'S256');
  return {
    state: location.searchParams.get('state'),
    cookies: cookieHeader(response),
  };
}

function successFetch({ login = 'Drchennnn', push = true, scope = 'public_repo' } = {}) {
  return async (url, options = {}) => {
    if (url === 'https://github.com/login/oauth/access_token') {
      assert.equal(options.method, 'POST');
      assert.doesNotMatch(String(options.body), /undefined/u);
      assert.match(String(options.body), /code_verifier=/u);
      return json({ access_token: 'token-safe-value', scope, token_type: 'bearer' });
    }
    assert.equal(options.headers.Authorization, 'Bearer token-safe-value');
    if (url === 'https://api.github.com/user') return json({ login });
    if (url === 'https://api.github.com/repos/Drchennnn/drchennnn.github.io') {
      return json({
        full_name: 'Drchennnn/drchennnn.github.io',
        permissions: { push },
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
}

async function callback(flow, fetchImpl, now = NOW) {
  return handleRequest(
    new Request(`${ORIGIN}/callback?code=temporary-code&state=${encodeURIComponent(flow.state)}`, {
      headers: { Cookie: flow.cookies },
    }),
    env,
    { fetch: fetchImpl, now: () => now },
  );
}

{
  const flow = await start();
  const response = await callback(flow, successFetch());
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.match(body, /authorization:github:success/u);
  assert.match(body, /token-safe-value/u);
  assert.match(body, /event\.source !== window\.opener/u);
  assert.match(body, /event\.origin !== targetOrigin/u);
  assert.match(response.headers.get('content-security-policy'), /script-src 'nonce-/u);
  assert.equal(response.headers.get('cache-control'), 'no-store, max-age=0');
}

{
  const flow = await start();
  const response = await handleRequest(
    new Request(`${ORIGIN}/callback?code=temporary-code&state=${flow.state}tampered`, {
      headers: { Cookie: flow.cookies },
    }),
    env,
    { fetch: () => assert.fail('CSRF failure must not call GitHub'), now: () => NOW },
  );
  assert.equal(response.status, 400);
  assert.match(await response.text(), /authorization:github:error/u);
}

{
  const flow = await start();
  const response = await callback(flow, () => assert.fail('expired state must not call GitHub'), NOW + 601_000);
  assert.equal(response.status, 400);
  assert.match(await response.text(), /authorization:github:error/u);
}

{
  const flow = await start();
  const response = await callback(flow, successFetch({ login: 'someone-else' }));
  assert.equal(response.status, 400);
  assert.match(await response.text(), /not allowed to manage/u);
}

{
  const flow = await start();
  const response = await callback(flow, successFetch({ push: false }));
  assert.equal(response.status, 400);
  assert.match(await response.text(), /does not have write access/u);
}

{
  const flow = await start();
  const response = await callback(flow, successFetch({ scope: 'repo' }));
  assert.equal(response.status, 400);
  assert.match(await response.text(), /unexpected permission scope/u);
}

{
  const flow = await start();
  const response = await callback(flow, async url => {
    if (url === 'https://github.com/login/oauth/access_token') return json({ message: 'failure' }, 502);
    return assert.fail('upstream failure must stop before API verification');
  });
  assert.equal(response.status, 400);
  const body = await response.text();
  assert.match(body, /GitHub rejected the login request/u);
  assert.doesNotMatch(body, /test-secret/u);
}

{
  const response = await handleRequest(
    new Request(`${ORIGIN}/auth?provider=github&site_id=evil.example&scope=public_repo`),
    env,
    { now: () => NOW },
  );
  assert.equal(response.status, 400);
}

console.log('OAuth worker tests passed.');
