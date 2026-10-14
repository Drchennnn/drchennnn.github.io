import { load, JSON_SCHEMA } from './vendor/js-yaml.mjs';
import { parseArticle } from './import-parser.js';
const input = document.querySelector('#article');
const status = document.querySelector('#status');
const preview = document.querySelector('#preview');
const next = document.querySelector('#continue');
let article;
let revision = 0;
input.addEventListener('change', async () => {
  const current = ++revision;
  article = null; next.disabled = true; preview.hidden = true; status.textContent = '';
  const file = input.files[0];
  if (!file) return;
  try {
    if (!/\.md$/i.test(file.name) || file.size > 512000) throw new Error('请选择不超过 500 KB 的 .md 文件。');
    const source = await file.text();
    if (current !== revision) return;
    article = parseArticle(source, file.name, text => load(text, { schema: JSON_SCHEMA }));
    preview.textContent = `${article.title}\n${article.date}\n${article.draft ? '隐藏草稿' : '公开文章'}\n\n${article.body.slice(0, 2000)}`;
    preview.hidden = false; next.disabled = false;
  } catch(error) { if (current === revision) status.textContent = error.message; }
});
next.addEventListener('click', () => {
  if (!article) return;
  try { sessionStorage.setItem('byweb-import', JSON.stringify(article)); location.href = '/admin/?import=1#/collections/posts/new'; }
  catch { status.textContent = '浏览器无法暂存文章，请允许本站存储后重试。'; }
});
