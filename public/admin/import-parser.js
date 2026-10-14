export function parseArticle(source, filename, loadYaml, today = new Date().toISOString().slice(0, 10)) {
  if (typeof source !== 'string' || source.length > 512000) throw new Error('文章大小不能超过 500 KB。');
  let body = source.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  let meta = {};
  if (body.startsWith('---\n')) {
    const end = body.indexOf('\n---', 4);
    if (end < 0 || !/^\n---(?:\n|$)/.test(body.slice(end))) throw new Error('文章头部格式不完整，缺少结束的 ---。');
    meta = loadYaml(body.slice(4, end)) ?? {};
    if (typeof meta !== 'object' || Array.isArray(meta)) throw new Error('文章头部应为标题、日期等字段。');
    body = body.slice(end + 4).replace(/^\n/, '');
  }
  const title = meta.title ?? body.match(/^#\s+(.+)$/m)?.[1] ?? filename.replace(/\.md$/i, '');
  if (typeof title !== 'string' || !title.trim()) throw new Error('请填写有效的文章标题。');
  const date = meta.date instanceof Date ? meta.date.toISOString().slice(0,10) : String(meta.date ?? today);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date) throw new Error('日期请使用 YYYY-MM-DD 格式。');
  if (meta.description != null && typeof meta.description !== 'string') throw new Error('摘要必须是文字。');
  if (meta.draft != null && typeof meta.draft !== 'boolean') throw new Error('draft 只能是 true 或 false。');
  const category = meta.category ?? 'daily';
  if (!['daily', 'study'].includes(category)) throw new Error('文章分组 category 只能是 daily（日々小记）或 study（学び手帖）。');
  if (!body.trim()) throw new Error('正文不能为空。');
  return { title: title.trim(), date, category, description: meta.description ?? '', draft: meta.draft ?? true, body };
}
