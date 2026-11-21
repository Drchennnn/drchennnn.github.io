const blog = 'https://drchennnn.github.io/fragments/';

const style = `
:root{color-scheme:light;--ink:#102247;--nav:#071b48;--blue:#0649bd;--muted:#425575;--line:#c1d7f6;--paper:#f2f7ff}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.65 system-ui,sans-serif}
a{color:var(--blue);text-underline-offset:.2em}a:hover{text-decoration-thickness:.16em}
:focus-visible{outline:3px solid #0a5bc9;outline-offset:4px}
header{background:var(--nav);color:white;border-bottom:5px solid #54bfff}
nav,main{max-width:62rem;margin:auto;padding:1.2rem clamp(1.15rem,4vw,3rem)}
nav,nav>div,.controls{display:flex;align-items:center;flex-wrap:wrap;gap:.65rem 1.1rem}
nav{justify-content:space-between}nav a,nav button{color:white}nav strong{font-weight:850;letter-spacing:.085em}
nav form{margin:0}nav button{padding:0;border:0;background:none;text-decoration:underline;text-underline-offset:.2em}
main{padding-block:clamp(2.3rem,7vw,4.7rem)}h1,h2{line-height:1.2;margin:0 0 1rem}
h1{font-size:clamp(2.25rem,6vw,4rem);letter-spacing:-.035em;overflow-wrap:anywhere}
h2{font-size:1.45rem}section{margin-top:2rem}p{margin:0 0 1rem}.muted,time{color:var(--muted)}
.button,button.primary{border:0;border-radius:.2rem;background:var(--blue);color:white;padding:.56rem .95rem;text-decoration:none;font-weight:650}
button,input,select,textarea{font:inherit}button{cursor:pointer}label{display:block;margin-bottom:.35rem;font-weight:650}
input,select,textarea{color:inherit;background:white;border:1px solid #859cbd;border-radius:.25rem;padding:.55rem .65rem;max-width:100%}
input[type=search],input[name=title],textarea{width:100%}textarea{min-height:15rem;resize:vertical}
.field{margin-bottom:1.1rem}.controls{align-items:end}.controls .field{margin:0;min-width:0}.controls .wide{flex:1 1 14rem}
.entries{padding:0;margin:1rem 0;list-style:none;border-top:1px solid var(--line)}
.entries li{border-bottom:1px solid var(--line);padding:.82rem .2rem;display:grid;align-items:baseline;gap:.15rem .85rem;grid-template-columns:7.2rem minmax(0,1fr) auto}
.entries a{overflow-wrap:anywhere}.count{color:var(--muted);font-size:.88rem}.prose{white-space:pre-wrap;overflow-wrap:anywhere;max-width:48rem}
.gallery{display:grid;gap:1rem;grid-template-columns:repeat(auto-fit,minmax(min(100%,18rem),1fr))}
.gallery img{display:block;width:100%;height:auto;background:white}.success{border-left:4px solid var(--blue);padding-left:.7rem}
@media(max-width:34rem){.entries li{grid-template-columns:minmax(0,1fr) auto}.entries time{grid-column:1/-1}nav{align-items:start;flex-direction:column}}
`;

const htmlEntities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => htmlEntities[character]);
}

export function page(title, content, { signedIn = false, status = 200 } = {}) {
  const links = signedIn
    ? '<a href="/">按日期浏览</a><a href="/new">写日记</a><form method="post" action="/logout"><button type="submit">退出</button></form>'
    : `<a href="${blog}">返回博客</a>`;
  return new Response(`<!doctype html>
<html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive"><title>${escapeHtml(title)} · 每日碎片</title><style>${style}</style>
<header><nav aria-label="日记导航"><strong>LINK RELOAD / 每日碎片</strong><div>${links}</div></nav></header>
<main id="main">${content}</main></html>`, {
    status, headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

export function loginPage(status = 200) {
  return page('私人日记', '<h1>每日碎片</h1><p class="muted">日记、照片和月度回顾。</p><a class="button" href="/login">使用 GitHub 登录</a>', { status });
}

export function errorPage(message, status) {
  return page('每日碎片', `<h1>${escapeHtml(message)}</h1><p><a href="/">返回日记首页</a></p>`, { status, signedIn: true });
}

function entryList(entries) {
  if (!entries.length) return '<p class="muted">没有记录。</p>';
  return `<ul class="entries">${entries.map(({ date, title, id, photos }) => `
<li><time datetime="${date}">${date}</time><a href="/entry/${encodeURIComponent(id)}">${escapeHtml(title)}</a>
<span class="count">${photos.length ? `${photos.length} 张照片` : ''}</span></li>`).join('')}</ul>`;
}

export function archivePage(entries, months, month, query = '', scope = month) {
  const monthOptions = months.map(value => `<option${value === month ? ' selected' : ''}>${value}</option>`).join('');
  const yearOptions = [...new Set(months.map(value => value.slice(0, 4)))].map(year =>
    `<option value="${year}"${year === scope ? ' selected' : ''}>${year} 全年</option>`).join('');
  const searchOptions = months.map(value => `<option${value === scope ? ' selected' : ''}>${value}</option>`).join('');
  return page(query ? '搜索结果' : '日期浏览', `<h1>${query ? '搜索结果' : '每日碎片'}</h1>
<form method="post" action="/search" class="controls" role="search">
<div class="field wide"><label for="q">搜索正文或标题</label><input type="search" id="q" name="q" required maxlength="120" value="${escapeHtml(query)}"></div>
<div class="field"><label for="scope">搜索范围</label><select id="scope" name="scope">${yearOptions}${searchOptions}</select></div>
<button class="primary" type="submit">搜索</button>
</form>
<section aria-labelledby="archive-heading">
${query ? `<h2 id="archive-heading">${entries.length} 篇匹配</h2><a href="/">返回日期浏览</a>`
    : `<h2 id="archive-heading">按日期浏览</h2><div class="controls">
<form class="controls" method="get" action="/"><div class="field"><label for="month">月份</label><select id="month" name="month">${monthOptions}</select></div><button class="primary" type="submit">查看</button></form>
<a href="/month/${month}">月度回顾 →</a></div>`}
${entryList(entries)}</section>`, { signedIn: true });
}

export function reviewPage(month, entries, summary) {
  const days = new Set(entries.map(entry => entry.date)).size;
  const photos = entries.reduce((count, entry) => count + entry.photos.length, 0);
  return page('月度回顾', `<p><a href="/?month=${month}">← 返回日期浏览</a></p><h1>${month} 月度回顾</h1>
<p class="muted">${entries.length} 篇日记 · ${days} 天有记录 · ${photos} 张照片</p>
${summary ? `<section aria-label="回顾正文"><div class="prose">${escapeHtml(summary)}</div></section>` : ''}
<section aria-label="本月日记">${entryList(entries)}</section>`, { signedIn: true });
}

export function entryPage(entry, body, saved) {
  const { id, title, date, photos } = entry;
  const gallery = photos.map((_, ordinal) => {
    const path = `/photo/${encodeURIComponent(id)}/${ordinal}`;
    return `<a href="${path}"><img src="${path}" alt="照片 ${ordinal + 1}" loading="lazy" decoding="async"></a>`;
  }).join('');
  return page(title, `<p><a href="/?month=${date.slice(0, 7)}">← 返回日期浏览</a></p>
${saved ? '<p class="success" role="status">已保存到私人日记。</p>' : ''}
<article><time datetime="${date}">${date}</time><h1>${escapeHtml(title)}</h1>
<div class="prose">${escapeHtml(body)}</div>
${gallery ? `<section aria-labelledby="photos"><h2 id="photos">照片</h2><div class="gallery">${gallery}</div></section>` : ''}
</article>`, { signedIn: true });
}

export function composePage(date) {
  return page('写日记', `<h1>写日记</h1>
<form method="post" action="/entries" enctype="multipart/form-data">
<input type="hidden" name="nonce" value="${crypto.randomUUID()}">
<div class="field"><label for="date">日期（香港时间）</label><input type="date" id="date" name="date" value="${date}" required></div>
<div class="field"><label for="title">标题</label><input id="title" name="title" maxlength="120" required></div>
<div class="field"><label for="body">正文</label><textarea id="body" name="body" maxlength="16000" required></textarea></div>
<div class="field"><label for="photos">照片（可选）</label><input type="file" id="photos" name="photos" accept="image/jpeg,image/png,image/webp,image/gif" multiple aria-describedby="limits">
<p class="muted" id="limits">支持 JPEG、PNG、WebP 和 GIF。最多 4 张，每张 5 MB，合计 10 MB。</p></div>
<button type="submit" class="primary">保存日记</button>
</form>`, { signedIn: true });
}
