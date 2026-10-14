import { mkdirSync, readdirSync, copyFileSync } from 'node:fs';
const dest = 'public/admin/vendor';
mkdirSync(dest, { recursive: true });
for (const file of readdirSync('node_modules/decap-cms/dist')) {
  if (/\.cms\.js$|^cms\.(js|css)$|\.wasm$|LICENSE/.test(file)) {
    copyFileSync(`node_modules/decap-cms/dist/${file}`, `${dest}/${file}`);
  }
}
copyFileSync('node_modules/js-yaml/dist/js-yaml.mjs', `${dest}/js-yaml.mjs`);
