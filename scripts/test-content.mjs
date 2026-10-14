import { writeFileSync, rmSync, existsSync, readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const fixtures = { legacy: 'src/content/posts/zz-lifecycle-daily.md', study: 'src/content/posts/zz-lifecycle-study.md', draftPost: 'src/content/posts/zz-lifecycle-draft.md', photo: 'src/content/photos/zz-lifecycle-photo.md', draftPhoto: 'src/content/photos/zz-lifecycle-photo-draft.md', image: 'public/images/zz-lifecycle.svg' };
const build = () => execFileSync('npm', ['run', 'build'], { stdio: 'pipe' });
const html = path => readFileSync(path, 'utf8');
for (const path of Object.values(fixtures)) assert(!existsSync(path), `Test fixture already exists: ${path}`);
try {
  mkdirSync('src/content/photos', { recursive: true }); mkdirSync('public/images', { recursive: true });
  writeFileSync(fixtures.image, '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="3"/>');
  writeFileSync(fixtures.legacy, '---\ntitle: "Legacy daily fixture"\ndate: 2026-10-15\ndescription: "No category stays daily"\n---\nDaily searchable phrase.');
  writeFileSync(fixtures.study, '---\ntitle: "Study fixture"\ndate: 2026-10-16\ncategory: study\n---\nStudy searchable phrase.');
  writeFileSync(fixtures.draftPost, '---\ntitle: "Private draft phrase"\ndate: 2026-10-17\ndraft: true\n---\nNever searchable draft body.');
  writeFileSync(fixtures.photo, '---\ntitle: "Photo fixture"\ndate: 2026-10-18\ndescription: "A photo record"\nimages:\n  - image: /images/zz-lifecycle.svg\n    caption: "Quiet caption phrase"\n    alt: "Test image"\n---\nOptional photo notes.');
  writeFileSync(fixtures.draftPhoto, '---\ntitle: "Private photo phrase"\ndate: 2026-10-19\ndraft: true\nimages:\n  - image: /images/zz-lifecycle.svg\n    caption: "Never searchable photo caption"\n---');
  build();
  assert(html('dist/daily/index.html').includes('Legacy daily fixture')); assert(!html('dist/daily/index.html').includes('Study fixture')); assert(html('dist/study/index.html').includes('Study fixture'));
  assert(html('dist/photos/index.html').includes('Photo fixture')); assert(html('dist/photos/zz-lifecycle-photo/index.html').includes('Quiet caption phrase'));
  const search = html('dist/search/index.html');
  for (const phrase of ['Daily searchable phrase', 'Study searchable phrase', 'Quiet caption phrase']) assert(search.includes(phrase), `Search index missing: ${phrase}`);
  for (const phrase of ['Private draft phrase', 'Never searchable draft body', 'Private photo phrase', 'Never searchable photo caption']) assert(!search.includes(phrase), `Draft leaked into search: ${phrase}`);
  assert(!existsSync('dist/posts/zz-lifecycle-draft/index.html')); assert(!existsSync('dist/photos/zz-lifecycle-photo-draft/index.html'));
  for (const path of Object.values(fixtures)) rmSync(path, { force: true }); build();
  assert(!existsSync('dist/posts/zz-lifecycle-daily/index.html')); assert(!existsSync('dist/posts/zz-lifecycle-study/index.html')); assert(!existsSync('dist/photos/zz-lifecycle-photo/index.html'));
  const htmlFiles = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? htmlFiles(`${dir}/${entry.name}`) : entry.name.endsWith('.html') ? [`${dir}/${entry.name}`] : []);
  for (const file of htmlFiles('dist')) for (const match of html(file).matchAll(/(?:href|src)="(\/[^"#?]*)/g)) { const url = decodeURIComponent(match[1]); assert(existsSync(`dist${url}`), `${file}: broken path ${url}`); }
  console.log('PASS: daily defaults, study separation, photo captions, draft exclusion, deletion, and internal links.');
} finally { for (const path of Object.values(fixtures)) rmSync(path, { force: true }); }
