import { writeFileSync, rmSync, existsSync, readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const fixtures = {
  legacy: 'src/content/posts/zz-lifecycle-daily.md',
  study: 'src/content/posts/zz-lifecycle-study.md',
  draftPost: 'src/content/posts/zz-lifecycle-draft.md',
  photo: 'src/content/photos/zz-lifecycle-photo.md',
  draftPhoto: 'src/content/photos/zz-lifecycle-photo-draft.md',
  toy: 'src/content/toys/zz-lifecycle-toy.md',
  draftToy: 'src/content/toys/zz-lifecycle-toy-draft.md',
  image: 'public/images/zz-lifecycle.svg',
  toyCover: 'public/images/zz-lifecycle-toy.svg',
  toyDemo: 'public/toys/zz-lifecycle-toy/index.html',
};
const toyDemoDir = 'public/toys/zz-lifecycle-toy';
const build = () => execFileSync('npm', ['run', 'build'], { stdio: 'pipe' });
const html = path => readFileSync(path, 'utf8');
const removeFixtures = () => {
  for (const path of Object.values(fixtures)) rmSync(path, { force: true });
  rmSync(toyDemoDir, { recursive: true, force: true });
};

for (const path of Object.values(fixtures)) assert(!existsSync(path), `Test fixture already exists: ${path}`);
assert(!existsSync(toyDemoDir), `Test fixture already exists: ${toyDemoDir}`);

try {
  mkdirSync('src/content/photos', { recursive: true });
  mkdirSync('src/content/toys', { recursive: true });
  mkdirSync('public/images', { recursive: true });
  mkdirSync(toyDemoDir, { recursive: true });
  writeFileSync(fixtures.image, '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="3"/>');
  writeFileSync(fixtures.toyCover, '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="3"/>');
  writeFileSync(fixtures.toyDemo, '<!doctype html><html lang="zh-CN"><title>Lifecycle toy demo</title><body>Interactive toy fixture</body></html>');
  writeFileSync(fixtures.legacy, '---\ntitle: "Legacy daily fixture"\ndate: 2026-10-15\ndescription: "No category stays daily"\n---\nDaily searchable phrase.');
  writeFileSync(fixtures.study, '---\ntitle: "Study fixture"\ndate: 2026-10-16\ncategory: study\n---\nStudy searchable phrase.');
  writeFileSync(fixtures.draftPost, '---\ntitle: "Private draft phrase"\ndate: 2026-10-17\ndraft: true\n---\nNever searchable draft body.');
  writeFileSync(fixtures.photo, '---\ntitle: "Photo fixture"\ndate: 2026-10-18\ndescription: "A photo record"\nimages:\n  - image: /images/zz-lifecycle.svg\n    caption: "Quiet caption phrase"\n    alt: "Test image"\n---\nOptional photo notes.');
  writeFileSync(fixtures.draftPhoto, '---\ntitle: "Private photo phrase"\ndate: 2026-10-19\ndraft: true\nimages:\n  - image: /images/zz-lifecycle.svg\n    caption: "Never searchable photo caption"\n---');
  writeFileSync(fixtures.toy, '---\ntitle: "Toy fixture"\ndate: 2026-10-20\ndescription: "Playful searchable gadget"\ncover: /images/zz-lifecycle-toy.svg\ndemo: /toys/zz-lifecycle-toy/index.html\ntags:\n  - kinetic\n  - lifecycle\n---\nToy detail searchable phrase.');
  writeFileSync(fixtures.draftToy, '---\ntitle: "Private toy phrase"\ndate: 2026-10-21\ndescription: "Never searchable toy description"\ndraft: true\ncover: /images/zz-lifecycle-toy.svg\ndemo: /toys/zz-lifecycle-toy/index.html\ntags:\n  - hidden-toy-tag\n---\nNever searchable toy body.');

  build();

  assert(html('dist/daily/index.html').includes('Legacy daily fixture'));
  assert(!html('dist/daily/index.html').includes('Study fixture'));
  assert(html('dist/study/index.html').includes('Study fixture'));
  assert(html('dist/photos/index.html').includes('Photo fixture'));
  assert(html('dist/photos/zz-lifecycle-photo/index.html').includes('Quiet caption phrase'));

  const play = html('dist/play/index.html');
  assert(play.includes('Toy fixture'));
  assert(play.includes('Playful searchable gadget'));
  assert(play.includes('/images/zz-lifecycle-toy.svg'));
  assert(!play.includes('Private toy phrase'));
  const toyDetail = html('dist/play/zz-lifecycle-toy/index.html');
  assert(toyDetail.includes('Toy detail searchable phrase.'));
  assert(toyDetail.includes('kinetic'));
  const demoFrame = toyDetail.match(/<iframe\b[^>]*>/)?.[0] ?? '';
  assert(demoFrame.includes('src="/toys/zz-lifecycle-toy/index.html?embed=1"'), 'Toy detail must embed its demo');
  assert(/\bsandbox="allow-scripts"/.test(demoFrame), 'Toy demo iframe must allow scripts without broader sandbox permissions');
  assert(!existsSync('dist/play/zz-lifecycle-toy-draft/index.html'));

  const search = html('dist/search/index.html');
  for (const phrase of ['Daily searchable phrase', 'Study searchable phrase', 'Quiet caption phrase', 'Playful searchable gadget', 'Toy detail searchable phrase', 'kinetic']) {
    assert(search.includes(phrase), `Search index missing: ${phrase}`);
  }
  for (const phrase of ['Private draft phrase', 'Never searchable draft body', 'Private photo phrase', 'Never searchable photo caption', 'Private toy phrase', 'Never searchable toy description', 'hidden-toy-tag', 'Never searchable toy body']) {
    assert(!search.includes(phrase), `Draft leaked into search: ${phrase}`);
  }
  assert(!existsSync('dist/posts/zz-lifecycle-draft/index.html'));
  assert(!existsSync('dist/photos/zz-lifecycle-photo-draft/index.html'));

  removeFixtures();
  build();

  assert(!existsSync('dist/posts/zz-lifecycle-daily/index.html'));
  assert(!existsSync('dist/posts/zz-lifecycle-study/index.html'));
  assert(!existsSync('dist/photos/zz-lifecycle-photo/index.html'));
  assert(!existsSync('dist/play/zz-lifecycle-toy/index.html'));
  assert(!html('dist/play/index.html').includes('Toy fixture'));
  assert(!html('dist/search/index.html').includes('Toy detail searchable phrase'));

  const htmlFiles = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? htmlFiles(`${dir}/${entry.name}`) : entry.name.endsWith('.html') ? [`${dir}/${entry.name}`] : []);
  for (const file of htmlFiles('dist')) {
    for (const match of html(file).matchAll(/(?:href|src)="(\/[^"#?]*)/g)) {
      const url = decodeURIComponent(match[1]);
      assert(existsSync(`dist${url}`), `${file}: broken path ${url}`);
    }
  }
  console.log('PASS: post, photo, and toy publication, draft exclusion, sandboxing, search, deletion, and internal links.');
} finally {
  removeFixtures();
}
