import { writeFileSync, rmSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const fixture = 'src/content/posts/zz-lifecycle-test.md';
const build = () => execFileSync('npm', ['run', 'build'], { stdio: 'pipe' });
assert(!existsSync(fixture), 'Test fixture path already exists; refusing to overwrite it.');
try {
  writeFileSync(fixture, '---\ntitle: "Lifecycle fixture"\ndate: 2026-10-15\n---\n## Fixture body\n\nA real article.');
  build();
  assert(readFileSync('dist/index.html', 'utf8').includes('Lifecycle fixture'));
  assert(readFileSync('dist/posts/zz-lifecycle-test/index.html', 'utf8').includes('Fixture body'));
  writeFileSync(fixture, '---\ntitle: "Lifecycle fixture"\ndate: 2026-10-15\ndraft: true\n---\nDraft body');
  build();
  assert(!readFileSync('dist/index.html', 'utf8').includes('Lifecycle fixture'));
  assert(!existsSync('dist/posts/zz-lifecycle-test/index.html'));
  rmSync(fixture);
  build();
  assert(!existsSync('dist/posts/zz-lifecycle-test/index.html'));
  const htmlFiles = (dir) => readdirSync(dir, {withFileTypes:true}).flatMap(e => e.isDirectory() ? htmlFiles(`${dir}/${e.name}`) : e.name.endsWith('.html') ? [`${dir}/${e.name}`] : []);
  for (const file of htmlFiles('dist')) {
    for (const match of readFileSync(file, 'utf8').matchAll(/(?:href|src)="(\/[^"#?]*)/g)) {
      const url = decodeURIComponent(match[1]);
      assert(existsSync(`dist${url}`), `${file}: broken path ${url}`);
    }
  }
  console.log('PASS: publish, detail render, draft hiding, deletion, and all internal asset/page links.');
} finally { rmSync(fixture, {force:true}); }
