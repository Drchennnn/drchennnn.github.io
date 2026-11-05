import assert from 'node:assert/strict';
import {
  calculateReadingProgress,
  findActiveHeading,
  initReadingTools,
  installReadingToolsLifecycle,
} from '../src/scripts/reading-tools.mjs';

assert.deepEqual(calculateReadingProgress(100, 100, 1100), { enabled: true, value: 0 });
assert.deepEqual(calculateReadingProgress(1100, 100, 1100), { enabled: true, value: 1 });
assert.equal(calculateReadingProgress(-500, 100, 1100).value, 0, 'progress clamps before the article');
assert.equal(calculateReadingProgress(5000, 100, 1100).value, 1, 'progress clamps after the article');
assert.deepEqual(calculateReadingProgress(200, 100, 350), { enabled: false, value: 0 }, 'short articles do not pretend to finish');
assert.equal(findActiveHeading([], 0, 800, 900), -1, 'no headings has no active chapter');
assert.equal(findActiveHeading([400, 900], 300, 800, 2200), 0);
assert.equal(findActiveHeading([400, 900], 100, 800, 2200), -1, 'probe remains before the first heading when appropriate');
assert.equal(findActiveHeading([400, 900], 1450, 800, 2200), 1, 'the final viewport selects the final chapter');

class Events {
  constructor() { this.handlers = new Map(); }
  addEventListener(type, listener) { if (!this.handlers.has(type)) this.handlers.set(type, new Set()); this.handlers.get(type).add(listener); }
  removeEventListener(type, listener) { this.handlers.get(type)?.delete(listener); }
  emit(type, event = {}) { for (const listener of [...(this.handlers.get(type) ?? [])]) listener({ type, target: this, ...event }); }
  listenerCount(type) { return this.handlers.get(type)?.size ?? 0; }
}

class FakeNode extends Events {
  constructor(rect = {}) {
    super();
    this.rect = typeof rect === 'function' ? rect : { top: 0, bottom: 0, ...rect };
    this.attrs = new Map();
    this.hidden = false;
    this.style = { values: new Map(), writes: 0, setProperty: (name, value) => { this.style.values.set(name, value); this.style.writes++; } };
  }
  getBoundingClientRect() { return typeof this.rect === 'function' ? this.rect() : this.rect; }
  getAttribute(name) { return this.attrs.get(name) ?? null; }
  setAttribute(name, value) { this.attrs.set(name, value); }
  removeAttribute(name) { this.attrs.delete(name); }
  querySelector(selector) { return this.queries?.get(selector) ?? null; }
  querySelectorAll(selector) { return this.queryLists?.get(selector) ?? []; }
  closest(selector) { return selector === 'article' ? this.article : null; }
}

class FakeWindow extends Events {
  constructor() {
    super();
    this.scrollY = 0;
    this.innerHeight = 800;
    this.nextFrame = 1;
    this.frames = new Map();
    const owner = this;
    this.ResizeObserver = class {
      constructor(callback) { this.callback = callback; owner.lastObserver = this; }
      observe(node) { this.node = node; }
      disconnect() { this.disconnected = true; }
      trigger() { this.callback(); }
    };
  }
  requestAnimationFrame(callback) { const id = this.nextFrame++; this.frames.set(id, callback); return id; }
  cancelAnimationFrame(id) { this.frames.delete(id); }
  flushFrames() { const frames = [...this.frames.values()]; this.frames.clear(); for (const callback of frames) callback(); }
}

class FakeDocument extends Events {
  constructor() { super(); this.body = {}; this.nodesById = new Map(); }
  querySelector(selector) { return selector === '[data-reading-tools]' ? this.root : null; }
  getElementById(id) { return this.nodesById.get(id) ?? null; }
}

function mount({ end = 2100, headings = [400, 900], duplicateLinks = true } = {}) {
  const win = new FakeWindow();
  const doc = new FakeDocument();
  const absoluteRect = values => () => ({ top: values.top - win.scrollY, bottom: values.bottom - win.scrollY });
  const headingBlock = new FakeNode(absoluteRect({ top: 100, bottom: 300 }));
  let endBottom = end;
  const articleEnd = new FakeNode(() => ({ top: endBottom - 80 - win.scrollY, bottom: endBottom - win.scrollY }));
  const image = new FakeNode();
  const article = new FakeNode();
  article.queries = new Map([['.article-heading', headingBlock], ['.article-end', articleEnd]]);
  article.queryLists = new Map([['.prose img', [image]]]);
  const progress = new FakeNode();
  const bar = new FakeNode();
  const links = [];
  headings.forEach((top, index) => {
    const id = `chapter-${index + 1}`;
    doc.nodesById.set(id, new FakeNode(absoluteRect({ top, bottom: top + 40 })));
    const count = duplicateLinks ? 2 : 1;
    for (let copy = 0; copy < count; copy++) {
      const link = new FakeNode();
      link.setAttribute('href', `#${id}`);
      links.push(link);
    }
  });
  const root = new FakeNode();
  root.article = article;
  root.queries = new Map([['[data-reading-progress]', progress], ['[data-reading-progress-bar]', bar]]);
  root.queryLists = new Map([['a[href^="#"]', links]]);
  doc.root = root;
  return { win, doc, root, article, progress, bar, links, image, setEnd(value) { endBottom = value; } };
}

const page = mount();
const dispose = initReadingTools(page.doc, page.win);
assert.equal(page.progress.hidden, false, 'long article progress is visible');
assert.equal(page.bar.style.values.get('--reading-progress'), '0.0000');
assert.equal(page.win.listenerCount('scroll'), 1);
page.win.scrollY = 400;
page.win.emit('scroll');
page.win.emit('scroll');
assert.equal(page.win.frames.size, 1, 'scroll updates are animation-frame throttled');
page.win.flushFrames();
assert.equal(page.links[0].getAttribute('aria-current'), 'location');
assert.equal(page.links[1].getAttribute('aria-current'), 'location', 'both responsive navigation copies stay in sync');

page.win.scrollY = 1300;
page.win.emit('scroll');
page.win.flushFrames();
assert.equal(page.bar.style.values.get('--reading-progress'), '1.0000');
assert.equal(page.links.at(-1).getAttribute('aria-current'), 'location', 'the bottom selects the final chapter');

page.setEnd(2500);
page.win.emit('resize');
page.win.flushFrames();
assert.equal(page.bar.style.values.get('--reading-progress'), '0.7500', 'resize/reflow remeasures the reading range');
page.setEnd(2900);
page.image.emit('load');
page.win.flushFrames();
assert.equal(page.bar.style.values.get('--reading-progress'), '0.6000', 'late image layout remeasures the reading range');

const writesBeforeReplacement = page.bar.style.writes;
const replacementDispose = initReadingTools(page.doc, page.win);
assert.equal(page.win.listenerCount('scroll'), 1, 'repeated initialization replaces listeners instead of stacking them');
page.win.scrollY = 1500;
page.win.emit('scroll');
page.win.flushFrames();
assert.ok(page.bar.style.writes > writesBeforeReplacement);
const writesBeforeCleanup = page.bar.style.writes;
replacementDispose();
page.win.scrollY = 1800;
page.win.emit('scroll');
page.win.flushFrames();
page.win.lastObserver.trigger();
page.win.flushFrames();
assert.equal(page.bar.style.writes, writesBeforeCleanup, 'disposed scroll and observer callbacks cannot update the page');
dispose();

const short = mount({ end: 1100, headings: [] });
const disposeShort = initReadingTools(short.doc, short.win);
assert.equal(short.progress.hidden, true, 'short article progress remains hidden');
disposeShort();

const routed = mount();
const disposeLifecycle = installReadingToolsLifecycle(routed.doc, routed.win);
assert.equal(installReadingToolsLifecycle(routed.doc, routed.win), disposeLifecycle, 'lifecycle installation is idempotent');
assert.equal(routed.doc.listenerCount('astro:page-load'), 1);
routed.doc.emit('astro:before-swap');
assert.equal(routed.win.listenerCount('scroll'), 0, 'before-swap fully disposes the old page');
const nextPage = mount({ end: 2600 });
routed.doc.body = {};
routed.doc.root = nextPage.root;
routed.doc.nodesById = nextPage.doc.nodesById;
routed.doc.emit('astro:page-load');
assert.equal(routed.win.listenerCount('scroll'), 1, 'page-load initializes the replacement article once');
routed.doc.emit('astro:page-load');
assert.equal(routed.win.listenerCount('scroll'), 1, 'duplicate page-load on the same body is ignored');
disposeLifecycle();
assert.equal(routed.doc.listenerCount('astro:page-load'), 0);
assert.equal(routed.win.listenerCount('scroll'), 0);

console.log('reading tools tests passed');
