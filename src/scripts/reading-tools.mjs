export const MIN_READING_RANGE = 360;

export function clamp(value, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function calculateReadingProgress(scrollY, start, finish, minimumRange = MIN_READING_RANGE) {
  const range = finish - start;
  if (!Number.isFinite(range) || range < minimumRange) return { enabled: false, value: 0 };
  return { enabled: true, value: clamp((scrollY - start) / range) };
}

export function findActiveHeading(headingTops, scrollY, viewportHeight, contentBottom) {
  if (!headingTops.length) return -1;
  if (scrollY + viewportHeight >= contentBottom - 24) return headingTops.length - 1;
  const probe = scrollY + Math.max(112, viewportHeight * .28);
  let active = -1;
  for (let index = 0; index < headingTops.length; index++) {
    if (headingTops[index] > probe) break;
    active = index;
  }
  return active;
}

const activeControllers = new WeakMap();
const lifecycleControllers = new WeakMap();

function getScrollY(win) {
  return Number(win.scrollY ?? win.pageYOffset ?? 0);
}

function absoluteTop(node, win) {
  return node.getBoundingClientRect().top + getScrollY(win);
}

function headingFromLink(link, doc) {
  const href = link.getAttribute('href') ?? '';
  if (!href.startsWith('#') || href.length === 1) return null;
  try {
    return doc.getElementById(decodeURIComponent(href.slice(1)));
  } catch {
    return doc.getElementById(href.slice(1));
  }
}

export function initReadingTools(doc = document, win = window) {
  activeControllers.get(doc)?.();

  const root = doc.querySelector('[data-reading-tools]');
  if (!root) {
    const emptyDispose = () => {
      if (activeControllers.get(doc) === emptyDispose) activeControllers.delete(doc);
    };
    activeControllers.set(doc, emptyDispose);
    return emptyDispose;
  }

  const article = root.closest('article');
  const articleHeading = article?.querySelector('.article-heading');
  const articleEnd = article?.querySelector('.article-end');
  const progress = root.querySelector('[data-reading-progress]');
  const progressBar = root.querySelector('[data-reading-progress-bar]');
  const links = [...root.querySelectorAll('a[href^="#"]')];
  const pairs = links.map(link => ({ link, heading: headingFromLink(link, doc) })).filter(pair => pair.heading);
  const headings = [...new Set(pairs.map(({ heading }) => heading))];
  const images = article ? [...article.querySelectorAll('.prose img')] : [];
  const requestFrame = win.requestAnimationFrame?.bind(win) ?? (callback => win.setTimeout(callback, 16));
  const cancelFrame = win.cancelAnimationFrame?.bind(win) ?? win.clearTimeout?.bind(win) ?? (() => {});
  let metrics = { start: 0, finish: 0, contentBottom: 0, headingTops: [] };
  let frame = 0;
  let measurePending = false;
  let disposed = false;
  let activeIndex = -2;
  let lastProgress = '';

  function measure() {
    if (disposed || !article || !articleHeading || !articleEnd) return;
    const scrollY = getScrollY(win);
    const headingRect = articleHeading.getBoundingClientRect();
    const endRect = articleEnd.getBoundingClientRect();
    const start = headingRect.top + scrollY;
    const contentBottom = endRect.bottom + scrollY;
    metrics = {
      start,
      finish: contentBottom - Number(win.innerHeight || 0),
      contentBottom,
      headingTops: headings.map(heading => absoluteTop(heading, win)),
    };
  }

  function render() {
    if (disposed || !article) return;
    const scrollY = getScrollY(win);
    const viewportHeight = Number(win.innerHeight || 0);
    const reading = calculateReadingProgress(scrollY, metrics.start, metrics.finish);
    if (progress) progress.hidden = !reading.enabled;
    if (reading.enabled && progressBar) {
      const nextProgress = reading.value.toFixed(4);
      if (nextProgress !== lastProgress) {
        progressBar.style.setProperty('--reading-progress', nextProgress);
        lastProgress = nextProgress;
      }
    }

    const nextActive = findActiveHeading(metrics.headingTops, scrollY, viewportHeight, metrics.contentBottom);
    if (nextActive === activeIndex) return;
    activeIndex = nextActive;
    const activeHeading = headings[nextActive];
    for (const { link, heading } of pairs) {
      if (heading === activeHeading) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    }
  }

  function flush() {
    frame = 0;
    if (disposed) return;
    if (measurePending) {
      measurePending = false;
      measure();
    }
    render();
  }

  function scheduleRender() {
    if (!disposed && !frame) frame = requestFrame(flush);
  }

  function scheduleMeasure() {
    measurePending = true;
    scheduleRender();
  }

  const resizeObserver = typeof win.ResizeObserver === 'function' && article
    ? new win.ResizeObserver(scheduleMeasure)
    : null;
  resizeObserver?.observe(article);
  for (const image of images) image.addEventListener('load', scheduleMeasure);
  win.addEventListener('scroll', scheduleRender, { passive: true });
  win.addEventListener('resize', scheduleMeasure, { passive: true });
  win.addEventListener('hashchange', scheduleRender);

  measure();
  render();
  doc.fonts?.ready?.then(() => { if (!disposed) scheduleMeasure(); });

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (frame) cancelFrame(frame);
    resizeObserver?.disconnect();
    for (const image of images) image.removeEventListener('load', scheduleMeasure);
    win.removeEventListener('scroll', scheduleRender);
    win.removeEventListener('resize', scheduleMeasure);
    win.removeEventListener('hashchange', scheduleRender);
    if (activeControllers.get(doc) === dispose) activeControllers.delete(doc);
  }

  activeControllers.set(doc, dispose);
  return dispose;
}

export function installReadingToolsLifecycle(doc = document, win = window) {
  const installed = lifecycleControllers.get(doc);
  if (installed) return installed;

  let activeBody = doc.body;
  let disposePage = initReadingTools(doc, win);

  const beforeSwap = () => {
    disposePage?.();
    disposePage = undefined;
    activeBody = undefined;
  };
  const pageLoad = () => {
    if (disposePage && activeBody === doc.body) return;
    disposePage?.();
    activeBody = doc.body;
    disposePage = initReadingTools(doc, win);
  };
  doc.addEventListener('astro:before-swap', beforeSwap);
  doc.addEventListener('astro:page-load', pageLoad);

  const disposeLifecycle = () => {
    disposePage?.();
    doc.removeEventListener('astro:before-swap', beforeSwap);
    doc.removeEventListener('astro:page-load', pageLoad);
    if (lifecycleControllers.get(doc) === disposeLifecycle) lifecycleControllers.delete(doc);
  };
  lifecycleControllers.set(doc, disposeLifecycle);
  return disposeLifecycle;
}
