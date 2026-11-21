import { beginLogin, finishLogin, hasSession, logout, sameOrigin } from './auth.js';
import { getIndex, getEntry, getPhoto, getSummary, searchMonth, saveEntry, StorageConflictError } from './storage.js';
import { archivePage, composePage, entryPage, errorPage, loginPage, reviewPage } from './views.js';

const MB = 1024 * 1024;
const entryRoute = /^\/entry\/([\w-][\w.-]{0,199})$/;
const photoRoute = /^\/photo\/([\w-][\w.-]{0,199})\/(0|[1-9]\d?)$/;
const monthRoute = /^\/month\/(\d{4}-(?:0[1-9]|1[0-2]))$/;
const dateInHongKong = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit',
});

export default { fetch: (request, env) => handleRequest(request, env) };

export async function handleRequest(request, env, fetchImpl = fetch) {
  let response;
  try {
    response = await route(request, env, fetchImpl);
  } catch (error) {
    if (error instanceof InvalidRequest || error instanceof StorageConflictError) {
      response = errorPage(error instanceof StorageConflictError
        ? '保存冲突，请打开日记核对后再重试。'
        : error.message, error.status);
    } else {
      response = errorPage('暂时无法访问日记，请稍后重试。', 503);
    }
  }
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'private, no-store, max-age=0');
  headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  headers.set('Referrer-Policy', 'same-origin');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
  return new Response(request.method === 'HEAD' ? null : response.body, { status: response.status, headers });
}

async function route(request, env, fetchImpl) {
  const { origin, pathname, searchParams } = new URL(request.url);
  if (origin !== env.APP_ORIGIN) return new Response('Not found', { status: 404 });

  if (request.method === 'GET' && pathname === '/robots.txt') {
    return new Response('User-agent: *\nDisallow: /\n');
  }
  if (request.method === 'GET' && pathname === '/login') return beginLogin(env);
  if (request.method === 'GET' && pathname === '/callback') return finishLogin(request, env, fetchImpl);
  if (!(await hasSession(request, env))) {
    return pathname === '/' && ['GET', 'HEAD'].includes(request.method)
      ? loginPage() : new Response('请先登录。', { status: 401 });
  }

  if (request.method === 'POST') {
    if (!sameOrigin(request, env)) return new Response('请求来源不匹配。', { status: 403 });
    if (pathname === '/logout') return logout();
    if (pathname === '/entries') {
      const entry = await saveEntry(await parseEntry(request), env, fetchImpl);
      return new Response(null, { status: 303, headers: { Location: `/entry/${encodeURIComponent(entry.id)}?saved=1` } });
    }
    if (pathname === '/search') return searchArchive(request, env, fetchImpl);
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }
  if (pathname === '/new') return composePage(dateInHongKong.format(new Date()));

  const entryMatch = pathname.match(entryRoute);
  const photoMatch = pathname.match(photoRoute);
  const monthMatch = pathname.match(monthRoute);
  if (!entryMatch && !photoMatch && !monthMatch && pathname !== '/') {
    return new Response('Not found', { status: 404 });
  }

  const entries = sortedEntries(await getIndex(env, fetchImpl));
  if (entryMatch || photoMatch) {
    const id = (entryMatch ?? photoMatch)[1];
    const entry = entries.find(item => item.id === id);
    if (!entry) return new Response('Not found', { status: 404 });
    if (photoMatch) {
      return await getPhoto(entry, Number(photoMatch[2]), env, fetchImpl) ?? new Response('Not found', { status: 404 });
    }
    return entryPage(entry, await getEntry(entry, env, fetchImpl), searchParams.get('saved') === '1');
  }
  if (monthMatch) {
    const month = monthMatch[1];
    const summary = await getSummary(month, env, fetchImpl);
    return reviewPage(month, monthEntries(entries, month), summary);
  }
  const months = archiveMonths(entries);
  const month = months.includes(searchParams.get('month')) ? searchParams.get('month') : months[0];
  return archivePage(monthEntries(entries, month), months, month);
}

function sortedEntries(entries) {
  return entries.toSorted((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}

function archiveMonths(entries) {
  return [...new Set(entries.map(entry => entry.date.slice(0, 7)))];
}

function monthEntries(entries, month) {
  return entries.filter(entry => entry.date.startsWith(`${month}-`));
}

async function searchArchive(request, env, fetchImpl) {
  const form = await boundedForm(request, 'application/x-www-form-urlencoded', 4096);
  const query = getText(form, 'q', 120);
  const scope = getText(form, 'scope', 7);
  const entries = sortedEntries(await getIndex(env, fetchImpl));
  const months = archiveMonths(entries);
  const selectedMonths = months.filter(month => month === scope || month.slice(0, 4) === scope);
  if (!selectedMonths.length) throw new InvalidRequest('请选择要搜索的月份或年份。');
  const indices = await Promise.all(selectedMonths.map(month => searchMonth(month, env, fetchImpl)));
  const bodies = Object.assign(Object.create(null), ...indices);
  const needles = query.normalize('NFKC').toLowerCase().split(/\s+/u);
  const matches = entries.filter(entry => {
    if (!selectedMonths.includes(entry.date.slice(0, 7))) return false;
    const haystack = `${entry.title}\n${bodies[entry.path] ?? ''}`.normalize('NFKC').toLowerCase();
    return needles.every(needle => haystack.includes(needle));
  });
  return archivePage(matches, months, selectedMonths[0], query, scope);
}

class InvalidRequest extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function getText(form, name, limit) {
  const values = form.getAll(name);
  const value = values.length === 1 && typeof values[0] === 'string' ? values[0].trim() : '';
  if (!value || value.length > limit) throw new InvalidRequest('请检查必填字段和长度。');
  return value;
}

async function boundedForm(request, type, maxBytes) {
  const contentType = request.headers.get('Content-Type') ?? '';
  if (contentType.split(';', 1)[0].trim().toLowerCase() !== type || !request.body) {
    throw new InvalidRequest('表单格式无效。');
  }
  if (Number(request.headers.get('Content-Length')) > maxBytes) {
    throw new InvalidRequest('上传内容超过大小限制。', 413);
  }
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new InvalidRequest('上传内容超过大小限制。', 413);
      }
      chunks.push(value);
    }
    return await new Response(new Blob(chunks), { headers: { 'Content-Type': contentType } }).formData();
  } catch (error) {
    if (error instanceof InvalidRequest) throw error;
    throw new InvalidRequest('表单格式无效。');
  } finally {
    reader.releaseLock();
  }
}

async function parseEntry(request) {
  const form = await boundedForm(request, 'multipart/form-data', 10 * MB + 128 * 1024);
  const date = getText(form, 'date', 10);
  const title = getText(form, 'title', 120);
  const body = getText(form, 'body', 16000);
  const nonce = getText(form, 'nonce', 36);
  const parsedDate = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(+parsedDate) ||
      parsedDate.toISOString().slice(0, 10) !== date || /[\r\n]/.test(title) ||
      !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(nonce)) {
    throw new InvalidRequest('日期、标题或表单编号无效。');
  }

  const files = form.getAll('photos').filter(value => !(value instanceof File && !value.size && !value.name));
  if (files.length > 4 || files.some(file => !(file instanceof File) || file.size > 5 * MB) ||
      files.reduce((sum, file) => sum + file.size, 0) > 10 * MB) {
    throw new InvalidRequest('最多上传 4 张照片，每张不超过 5 MB，合计不超过 10 MB。', 413);
  }
  const photos = await Promise.all(files.map(async file => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const extension = rasterExtension(bytes);
    if (!extension) throw new InvalidRequest('请选择 JPEG、PNG、WebP 或 GIF 照片。');
    return { bytes, extension };
  }));
  return { date, title, body, nonce, photos };
}

function rasterExtension(bytes) {
  const starts = (signature, from = 0) => signature.every((byte, index) => bytes[from + index] === byte);
  if (starts([255, 216, 255])) return 'jpg';
  if (starts([137, 80, 78, 71, 13, 10, 26, 10])) return 'png';
  if (starts([82, 73, 70, 70]) && starts([87, 69, 66, 80], 8)) return 'webp';
  if (starts([71, 73, 70, 56, 55, 97]) || starts([71, 73, 70, 56, 57, 97])) return 'gif';
  return null;
}
