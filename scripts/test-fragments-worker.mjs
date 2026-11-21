import assert from 'node:assert/strict';
import test from 'node:test';
import { handleRequest } from '../worker/daily-fragments/index.js';

const origin = 'https://journal.example.test';
const env = {
  APP_ORIGIN: origin, OWNER_ID: '12345', SESSION_SECRET: 'test-only-session-secret-that-is-long-enough',
  GITHUB_CLIENT_ID: 'test-app', GITHUB_CLIENT_SECRET: 'test-only-client-secret', ARCHIVE_TOKEN: 'test-only-archive-token',
};
const id = '2026-10-15-sample';
const path = `diary/2026/10/${id}.md`;
const photo = 'photos/2026/10/sample.png';
const index = [{
  date: '2026-10-15', title: '<em>Test title</em>', path, photos: [photo], visibility: 'private',
}];
const note = '私密合成关键字 <img src="https://invalid.example/">';

function call(path, options, fetchImpl) {
  return handleRequest(new Request(new URL(path, origin), options), env, fetchImpl);
}

function flags(response) {
  assert.match(response.headers.get('Cache-Control'), /private, no-store/);
  assert.match(response.headers.get('X-Robots-Tag'), /noindex/);
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(response.headers.get('Cross-Origin-Resource-Policy'), 'same-origin');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
}

test('every anonymous diary, photo, search, compose and write route is blocked before reading GitHub', async () => {
  let requests = 0;
  const upstream = () => { requests++; throw new Error('Anonymous request went upstream'); };
  const home = await call('/', {}, upstream);
  flags(home);
  const html = await home.text();
  assert.match(html, /使用 GitHub 登录/);
  assert.ok(!html.includes(note));
  for (const [method, path] of [
    ['GET', '/?month=2026-10'], ['GET', `/entry/${id}`], ['HEAD', `/photo/${id}/0`],
    ['GET', `/photo/${id}/0`], ['GET', '/month/2026-10'], ['GET', '/new'],
    ['POST', '/search'], ['POST', '/entries'], ['POST', '/logout'], ['GET', '/index.json'],
  ]) {
    const response = await call(path, { method, headers: { Cookie: '__Host-fragments-session=forged' } }, upstream);
    assert.equal(response.status, path.startsWith('/?') ? 200 : 401);
    flags(response);
    assert.ok(!(await response.text()).includes(note));
  }
  assert.equal(requests, 0);
});

test('one verified owner can browse, search, view photos, save photos and log out', async () => {
  const files = new Map([
    ['index.json', JSON.stringify(index)],
    [path, `---\ntitle: ignored\n---\n${note}`],
    [photo, Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10)],
    ['search/2026-10.json', JSON.stringify({ [path]: note })],
    ['summaries/2026-10.md', '合成月度回顾'],
  ]);
  let writes = 0;
  const upstream = async (input, options) => {
    const url = new URL(input);
    if (url.hostname === 'github.com') {
      assert.equal(url.pathname, '/login/oauth/access_token');
      assert.ok(options.body.get('code_verifier'));
      return Response.json({ access_token: 'test-identity-token', scope: '' });
    }
    if (url.pathname === '/user') return Response.json({ id: 12345 });
    assert.equal(options.headers.Authorization, 'Bearer test-only-archive-token');
    if (url.pathname.endsWith('/git/ref/heads/main')) {
      return Response.json({ object: { sha: 'a'.repeat(40) } });
    }
    if (url.pathname === '/graphql') {
      const { input } = JSON.parse(options.body).variables;
      assert.equal(input.expectedHeadOid, 'a'.repeat(40));
      assert.equal(input.fileChanges.additions.length, 4);
      for (const { path, contents } of input.fileChanges.additions) files.set(path, Buffer.from(contents, 'base64'));
      writes++;
      return Response.json({ data: { createCommitOnBranch: { commit: { oid: 'b'.repeat(40) } } } });
    }
    const matched = /^\/repos\/Drchennnn\/daily-fragments\/contents\/(.+)$/.exec(url.pathname);
    assert.ok(matched);
    const value = files.get(decodeURIComponent(matched[1]));
    return value === undefined ? new Response(null, { status: 404 }) : new Response(value);
  };
  const login = await call('/login', {}, upstream);
  const state = new URL(login.headers.get('Location')).searchParams.get('state');
  const flowCookie = login.headers.getSetCookie()[0].split(';')[0];
  const callback = await call(`/callback?state=${state}&code=fake`, { headers: { Cookie: flowCookie } }, upstream);
  assert.equal(callback.status, 302);
  flags(callback);
  const Cookie = callback.headers.getSetCookie().find(value => value.startsWith('__Host-fragments-session')).split(';')[0];
  const home = await call('/', { headers: { Cookie } }, upstream);
  assert.match(await home.text(), /按日期浏览/);
  const entry = await call(`/entry/${id}`, { headers: { Cookie } }, upstream);
  const rendered = await entry.text();
  assert.ok(rendered.includes('私密合成关键字 &lt;img'));
  assert.ok(rendered.includes('&lt;em&gt;Test title'));
  assert.ok(!rendered.includes('<img src="https://invalid.example/'));
  const image = await call(`/photo/${id}/0`, { headers: { Cookie } }, upstream);
  flags(image);
  assert.equal(image.headers.get('Content-Type'), 'image/png');
  assert.deepEqual(new Uint8Array(await image.arrayBuffer()), files.get(photo));
  const month = await call('/month/2026-10', { headers: { Cookie } }, upstream);
  assert.match(await month.text(), /合成月度回顾/);
  const headers = { Cookie, Origin: origin };
  const search = await call('/search', { method: 'POST', headers, body: new URLSearchParams({ q: '合成关键字', scope: '2026' }) }, upstream);
  assert.match(await search.text(), /1 篇匹配/);
  const compose = await call('/new', { headers: { Cookie } }, upstream);
  const nonce = /name="nonce" value="([^"]+)"/.exec(await compose.text())[1];
  const form = new FormData();
  form.set('date', '2026-10-16');
  form.set('title', '合成记录');
  form.set('body', '合成正文');
  form.set('nonce', nonce);
  form.set('photos', new Blob(['<svg/>'], { type: 'image/png' }), 'untrusted.png');
  const rejected = await call('/entries', { method: 'POST', headers, body: form }, upstream);
  assert.equal(rejected.status, 400);
  form.set('photos', new Blob([files.get(photo)], { type: 'image/png' }), 'sample.png');
  const foreign = await call('/entries', { method: 'POST', headers: { ...headers, Origin: 'https://foreign.example' }, body: form }, upstream);
  assert.equal(foreign.status, 403);
  assert.equal(writes, 0);
  const save = await call('/entries', { method: 'POST', headers, body: form }, upstream);
  assert.equal(save.status, 303);
  const saved = await call(save.headers.get('Location'), { headers: { Cookie } }, upstream);
  assert.match(await saved.text(), /已保存到私人日记/);
  assert.equal(writes, 1);
  const logout = await call('/logout', { method: 'POST', headers }, upstream);
  assert.equal(logout.status, 303);
  assert.match(logout.headers.getSetCookie().join('\n'), /__Host-fragments-session=; Max-Age=0/);
});
