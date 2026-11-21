import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getEntry, getIndex, getPhoto, getSummary, markdownBody, saveEntry, searchMonth, StorageConflictError,
} from '../worker/daily-fragments/storage.js';

const env = { ARCHIVE_TOKEN: 'test-archive-token' };
const repoPath = '/repos/Drchennnn/daily-fragments';
const starter = {
  date: '2026-11-18',
  title: '测试目录',
  path: 'diary/2026/11/2026-11-18-fixture.md',
  photos: ['photos/2026/11/test.jpeg'],
  visibility: 'private',
};
const syntheticPhoto = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
const input = {
  date: '2026-11-21',
  title: '虚构日记',
  body: '今天下雨。\n午后出门。',
  nonce: 'test-01',
  photos: [{ bytes: syntheticPhoto, extension: 'jpg' }],
};

function fixtureGitHub({ beforeCommit, afterCommit, records = [starter] } = {}) {
  let revision = 1;
  let commitRequests = 0;
  const refsRead = [];
  const oid = () => revision.toString(16).padStart(40, '0');
  const snapshots = new Map([[oid(), new Map([
    ['index.json', JSON.stringify(records)],
    [starter.path, '---\r\ntitle: Test\r\n---\r\n正文测试'],
    [starter.photos[0], syntheticPhoto],
    ['summaries/2026-11.md', '# 测试回顾'],
    ['search/2026-11.json', JSON.stringify({ [starter.path]: '正文测试' })],
  ])]]);
  const files = () => snapshots.get(oid());
  const advance = (change) => {
    const updated = new Map(files());
    change(updated);
    revision += 1;
    snapshots.set(oid(), updated);
  };
  const fetchImpl = async (requestUrl, request) => {
    assert.equal(request.headers.Authorization, `Bearer ${env.ARCHIVE_TOKEN}`);
    assert.equal(request.cache, 'no-store');
    assert.equal(request.redirect, 'error');
    const url = new URL(requestUrl);
    assert.equal(url.origin, 'https://api.github.com');
    if (url.pathname === `${repoPath}/git/ref/heads/main`) {
      return Response.json({ object: { sha: oid() } });
    }
    if (url.pathname === '/graphql') {
      commitRequests += 1;
      beforeCommit?.({ advance, attempt: commitRequests });
      const { variables: { input } } = JSON.parse(request.body);
      assert.deepEqual(input.branch, { repositoryNameWithOwner: 'Drchennnn/daily-fragments', branchName: 'main' });
      if (input.expectedHeadOid !== oid()) return Response.json({ errors: [{ message: 'stale head' }] });
      advance((updated) => {
        for (const addition of input.fileChanges.additions) {
          updated.set(addition.path, Buffer.from(addition.contents, 'base64'));
        }
      });
      afterCommit?.({ attempt: commitRequests });
      return Response.json({ data: { createCommitOnBranch: { commit: { oid: oid() } } } });
    }
    assert.ok(url.pathname.startsWith(`${repoPath}/contents/`));
    const path = decodeURIComponent(url.pathname.slice(`${repoPath}/contents/`.length));
    const ref = url.searchParams.get('ref');
    refsRead.push({ path, ref });
    assert.equal(request.headers.Accept, 'application/vnd.github.raw+json');
    const value = snapshots.get(ref === 'main' ? oid() : ref)?.get(path);
    return value === undefined ? new Response(null, { status: 404 }) : new Response(value);
  };
  return { fetchImpl, refsRead, commitRequests: () => commitRequests };
}

test('index, Markdown, raster photos, month search, and monthly review read from fixed archive paths', async () => {
  const { fetchImpl } = fixtureGitHub();
  const [entry] = await getIndex(env, fetchImpl);
  assert.deepEqual(entry, { ...starter, id: '2026-11-18-fixture' });
  assert.equal(await getEntry(entry, env, fetchImpl), '正文测试');
  assert.equal(markdownBody('---\ntitle: Text\n---'), '');
  assert.equal(markdownBody('ordinary Markdown'), 'ordinary Markdown');
  assert.equal(markdownBody('---\nNo closing delimiter'), '---\nNo closing delimiter');
  const photo = await getPhoto(entry, 0, env, fetchImpl);
  assert.equal(photo.headers.get('content-type'), 'image/jpeg');
  assert.equal(photo.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(new Uint8Array(await photo.arrayBuffer()), syntheticPhoto);
  assert.equal(await getPhoto(entry, 1, env, fetchImpl), null);
  assert.equal(await getSummary('2026-11', env, fetchImpl), '# 测试回顾');
  assert.equal(await getSummary('2026-10', env, fetchImpl), null);
  assert.deepEqual(await searchMonth('2026-11', env, fetchImpl), { [starter.path]: '正文测试' });
  assert.deepEqual(await searchMonth('2026-10', env, fetchImpl), {});
});

test('malformed records and unsafe paths fail before other files are read', async () => {
  for (const unsafe of [
    { date: '2026-02-30' },
    { visibility: 'public' },
    { path: 'diary/2026/11/%2e%2e/index.json' },
    { photos: ['https://example.test/photo.jpg'] },
    { photos: ['photos/2026/11/../fake.jpg'] },
    { photos: ['photos/2026/11/payload.svg'] },
  ]) {
    const { fetchImpl, refsRead } = fixtureGitHub({ records: [{ ...starter, ...unsafe }] });
    await assert.rejects(getIndex(env, fetchImpl), /Invalid archive index/);
    await assert.rejects(getSummary('../index', env, fetchImpl), /Invalid archive month/);
    assert.deepEqual(refsRead, [{ path: 'index.json', ref: 'main' }]);
  }
});

test('one commit makes body, photos, index and search visible with safe duplicate retries', async () => {
  const { fetchImpl, commitRequests, refsRead } = fixtureGitHub();
  const entry = await saveEntry(input, env, fetchImpl);
  assert.equal(entry.id, '2026-11-21-test-01');
  assert.equal(entry.path, 'diary/2026/11/2026-11-21-test-01.md');
  assert.deepEqual(entry.photos, ['photos/2026/11/2026-11-21-test-01-1.jpg']);
  const firstOid = '1'.padStart(40, '0');
  assert.deepEqual(refsRead, [
    { path: 'index.json', ref: firstOid },
    { path: 'search/2026-11.json', ref: firstOid },
  ]);
  assert.equal(await getEntry(entry, env, fetchImpl), input.body);
  assert.deepEqual(await getIndex(env, fetchImpl), [{ ...starter, id: '2026-11-18-fixture' }, entry]);
  assert.deepEqual(await searchMonth('2026-11', env, fetchImpl), {
    [starter.path]: '正文测试', [entry.path]: input.body,
  });
  assert.deepEqual(new Uint8Array(await (await getPhoto(entry, 0, env, fetchImpl)).arrayBuffer()), syntheticPhoto);
  assert.deepEqual(await saveEntry(input, env, fetchImpl), entry);
  await assert.rejects(saveEntry({ ...input, body: 'changed' }, env, fetchImpl), StorageConflictError);
  await assert.rejects(saveEntry({ ...input, photos: [{ bytes: new Uint8Array([2]), extension: 'jpg' }] }, env, fetchImpl), StorageConflictError);
  assert.equal(commitRequests(), 1);
});

test('stale head retries merge concurrent index and month changes', async () => {
  const concurrent = { ...starter, path: 'diary/2026/11/concurrent.md' };
  const git = fixtureGitHub({
    beforeCommit: ({ attempt, advance }) => {
      if (attempt !== 1) return;
      advance((files) => {
        files.set('index.json', JSON.stringify([starter, concurrent]));
        files.set('search/2026-11.json', JSON.stringify({ [starter.path]: '正文测试', [concurrent.path]: '并发正文' }));
      });
    },
  });
  const saved = await saveEntry(input, env, git.fetchImpl);
  assert.equal(git.commitRequests(), 2);
  assert.equal((await getIndex(env, git.fetchImpl)).length, 3);
  assert.equal((await searchMonth('2026-11', env, git.fetchImpl))[concurrent.path], '并发正文');
  assert.equal((await searchMonth('2026-11', env, git.fetchImpl))[saved.path], input.body);
});

test('a lost success response resolves to the already stored entry', async () => {
  const git = fixtureGitHub({ afterCommit: () => { throw new TypeError('connection interrupted'); } });
  const saved = await saveEntry(input, env, git.fetchImpl);
  assert.equal(git.commitRequests(), 1);
  assert.equal(await getEntry(saved, env, git.fetchImpl), input.body);
});

test('new entries keep Markdown delimiters in the user-supplied body', async () => {
  const { fetchImpl } = fixtureGitHub();
  const body = '---\nA short introduction\n---\nMore text';
  const saved = await saveEntry({ ...input, body, title: '标题: # 中文\nAnother line' }, env, fetchImpl);
  assert.equal(await getEntry(saved, env, fetchImpl), body);
});
