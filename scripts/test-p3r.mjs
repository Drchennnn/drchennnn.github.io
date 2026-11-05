import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import { initReload } from '../src/scripts/reload.mjs';

const compiled = process.argv.includes('--compiled');
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

class Element {
  dataset = {}; attrs = {}; handlers = {}; children = {}; textContent = '';
  disabled = false; hidden = false; offsetWidth = 290;
  classList = {
    items: new Set(),
    add: value => this.classList.items.add(value),
    remove: value => this.classList.items.delete(value),
    toggle: (value, on) => on ? this.classList.items.add(value) : this.classList.items.delete(value),
    contains: value => this.classList.items.has(value)
  };
  addEventListener(type, handler) { (this.handlers[type] ??= []).push(handler); }
  emit(type, event = {}) { for (const handler of this.handlers[type] ?? []) handler(event); }
  querySelector(selector) { return this.children[selector] ?? null; }
  setAttribute(key, value) { this.attrs[key] = value; }
  getAttribute(key) { return this.attrs[key] ?? null; }
  contains(node) { return node === this || Object.values(this.children).includes(node); }
  focus() { this.focused = true; }
  scrollBy(value) { this.lastScroll = value; }
}

class Clock {
  now = 0; next = 1; timers = new Map();
  setTimeout = (handler, delay = 0) => {
    const id = this.next++;
    this.timers.set(id, { at: this.now + delay, handler });
    return id;
  };
  clearTimeout = id => this.timers.delete(id);
  advance(ms) {
    const target = this.now + ms;
    while (true) {
      const due = [...this.timers].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      this.timers.delete(due[0]);
      this.now = due[1].at;
      due[1].handler();
    }
    this.now = target;
  }
}

function mount({ saved = {}, reduce = false, mobile = false, storageDenied = false, saveData = false, home = true, opening = true, introBehavior = 'resolve', loopBehavior = 'resolve', loadThrows = false, observerThrows = false, capture } = {}) {
  const keys = ['.motion-toggle', '.back-top', '.menu-toggle', '#main-nav'];
  if (home) keys.push('[data-hero-video]', '.hero-media', '.chapter-gallery', '[data-gallery-prev]', '[data-gallery-next]', '.chapter-section');
  if (home && opening) keys.push('[data-hero-intro]', '[data-opening]');
  const nodes = Object.fromEntries(keys.map(key => [key, new Element()]));
  const doc = new Element();
  if (capture) capture.doc = doc;
  doc.documentElement = new Element();
  doc.documentElement.dataset = { mode: 'day', motion: 'on' };
  if (!compiled && home && opening) doc.documentElement.dataset.opening = 'blue';
  doc.hidden = false;
  doc.querySelector = selector => nodes[selector] ?? null;
  const card = new Element(); card.dataset.chapter = '1';
  const reveals = [new Element(), new Element()];
  doc.querySelectorAll = selector => selector === '[data-chapter]' && home ? [card] : selector === '[data-reveal]' ? reveals : [];

  const win = new Element(), prefs = { ...saved }, reduced = new Element(), mobileQuery = new Element(), clock = new Clock();
  reduced.matches = reduce;
  mobileQuery.matches = mobile;
  win.localStorage = {
    getItem: key => { if (storageDenied) throw Error('denied'); return prefs[key] ?? null; },
    setItem: (key, value) => { if (storageDenied) throw Error('denied'); prefs[key] = value; }
  };
  win.matchMedia = query => query.includes('max-width') ? mobileQuery : reduced;
  win.navigator = { connection: { saveData } };
  win.location = { pathname: home ? '/' : '/daily/' };
  win.setTimeout = clock.setTimeout;
  win.clearTimeout = clock.clearTimeout;
  win.scrollY = 0;
  win.scrollTo = value => { win.lastScroll = value; };
  const observers = [];
  win.IntersectionObserver = class {
    constructor(handler, options) {
      if (observerThrows && observers.length === 1) throw Error('observer failed');
      this.handler = handler; this.options = options; this.targets = []; observers.push(this);
    }
    observe(target) { this.targets.push(target); }
    unobserve(target) { this.targets = this.targets.filter(value => value !== target); }
  };

  const pending = { intro: [], loop: [] };
  const behaviors = { intro: introBehavior, loop: loopBehavior };
  const prepareVideo = (video, kind, src) => {
    video.dataset.src = src;
    video.dataset.mobileSrc = src.replace('.mp4', '-mobile.mp4');
    video.paused = true;
    video.currentTime = 0;
    video.plays = 0;
    video.loads = 0;
    Object.defineProperty(video, 'src', { get() { return this.attrs.src; }, set(value) { this.attrs.src = value; } });
    video.load = () => { video.loads++; if (loadThrows && kind === 'intro') throw Error('load failed'); };
    video.play = () => {
      video.plays++;
      if (behaviors[kind] === 'reject') return Promise.reject(Error('autoplay denied'));
      if (behaviors[kind] === 'pending') return new Promise((resolve, reject) => pending[kind].push({
        resolve: () => { video.paused = false; resolve(); }, reject
      }));
      video.paused = false;
      return Promise.resolve();
    };
    video.pause = () => { video.paused = true; };
  };
  if (home) {
    nodes['.chapter-gallery'].children['.chapter-card'] = card;
    prepareVideo(nodes['[data-hero-video]'], 'loop', '/p3r/hero-loop.mp4');
    if (opening) prepareVideo(nodes['[data-hero-intro]'], 'intro', '/p3r/hero-intro.mp4');
  }

  if (compiled) {
    const built = readFileSync('dist/index.html', 'utf8');
    const startup = [...built.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].find(match => match[1].includes('journal-motion'))?.[1];
    assert(startup, 'Compiled page contains the opening boot script');
    const moduleTag = built.match(/<script([^>]*type="module"[^>]*)>([\s\S]*?)<\/script>/);
    assert(moduleTag, 'Compiled page contains the motion module');
    const modulePath = moduleTag[1].match(/src="([^"]+)"/)?.[1];
    const moduleCode = modulePath ? readFileSync(`dist${modulePath}`, 'utf8') : moduleTag[2];
    const context = vm.createContext({ document: doc, window: win, localStorage: win.localStorage, matchMedia: win.matchMedia, console });
    vm.runInContext(startup, context);
    vm.runInContext(moduleCode, context);
  } else initReload(doc, win);
  return {
    doc, win, nodes, reduced, prefs, observers, card, reveals, clock, pending,
    setBehavior: (kind, value) => { behaviors[kind] = value; }
  };
}

async function reachFall(page) {
  assert.equal(page.doc.documentElement.dataset.opening, 'blue');
  page.clock.advance(300);
  assert.equal(page.doc.documentElement.dataset.opening, 'quote');
  page.clock.advance(2500);
  await flush();
  assert.equal(page.doc.documentElement.dataset.opening, 'fall');
}

// Normal one-shot sequence: blue -> quote -> fall, then the loop starts before ready hides the intro.
const page = mount();
await reachFall(page);
const intro = page.nodes['[data-hero-intro]'], video = page.nodes['[data-hero-video]'];
assert.equal(intro.getAttribute('src'), '/p3r/hero-intro.mp4');
assert.equal(video.getAttribute('src'), '/p3r/hero-loop.mp4');
assert(intro.classList.contains('is-playing'));
intro.emit('ended');
await flush();
assert.equal(page.doc.documentElement.dataset.opening, 'ready');
assert(intro.paused);
assert(!video.paused);
assert(video.classList.contains('is-playing'));
assert.equal(intro.plays, 1, 'The fall clip is not replayed with the loop');
assert(!page.nodes['.film-toggle']);

const mobilePage = mount({ mobile: true });
await reachFall(mobilePage);
assert.equal(mobilePage.nodes['[data-hero-intro]'].getAttribute('src'), '/p3r/hero-intro-mobile.mp4');
assert.equal(mobilePage.nodes['[data-hero-video]'].getAttribute('src'), '/p3r/hero-loop-mobile.mp4');
mobilePage.nodes['[data-hero-intro]'].emit('ended');
await flush();
assert.equal(mobilePage.doc.documentElement.dataset.opening, 'ready');

const handoff = mount({ loopBehavior: 'pending' });
await reachFall(handoff);
handoff.nodes['[data-hero-intro]'].emit('ended');
await flush();
assert.equal(handoff.doc.documentElement.dataset.opening, 'fall', 'Intro final frame remains visible while loop startup is pending');
assert(handoff.nodes['[data-hero-intro]'].classList.contains('is-playing'));
assert(!handoff.nodes['[data-hero-intro]'].paused);
assert(handoff.nodes['[data-hero-video]'].paused);
assert.equal(handoff.nodes['[data-hero-video]'].currentTime, 0);
handoff.clock.advance(1800);
await flush();
assert.equal(handoff.doc.documentElement.dataset.opening, 'ready');
assert(handoff.nodes['[data-hero-intro]'].paused);

const interruptedHandoff = mount({ loopBehavior: 'pending' });
await reachFall(interruptedHandoff);
interruptedHandoff.nodes['[data-hero-intro]'].emit('ended');
await flush();
interruptedHandoff.win.scrollY = 100;
interruptedHandoff.win.emit('scroll');
assert.equal(interruptedHandoff.doc.documentElement.dataset.opening, 'ready', 'A skip interrupts a pending handoff immediately');
assert(interruptedHandoff.nodes['[data-hero-intro]'].paused);
interruptedHandoff.pending.loop[0].resolve();
await flush();
assert.equal(interruptedHandoff.doc.documentElement.dataset.opening, 'ready', 'Stale handoff cannot restore fall');

// The intro cannot trap the page: rejection, media error, and a missing ended event all reach ready.
const rejected = mount({ introBehavior: 'reject' });
rejected.clock.advance(300);
assert.equal(rejected.doc.documentElement.dataset.opening, 'quote');
rejected.clock.advance(2500);
await flush();
assert.equal(rejected.doc.documentElement.dataset.opening, 'ready');
assert(!rejected.nodes['[data-hero-video]'].paused);
const errored = mount();
await reachFall(errored);
errored.nodes['[data-hero-intro]'].emit('error');
await flush();
assert.equal(errored.doc.documentElement.dataset.opening, 'ready');
assert(!errored.nodes['[data-hero-video]'].paused);
const noEnded = mount();
await reachFall(noEnded);
noEnded.clock.advance(7500);
await flush();
assert.equal(noEnded.doc.documentElement.dataset.opening, 'ready');
assert(!noEnded.nodes['[data-hero-video]'].paused);

const slowIntro = mount({ introBehavior: 'pending' });
slowIntro.clock.advance(300);
slowIntro.clock.advance(2500);
await flush();
assert.equal(slowIntro.doc.documentElement.dataset.opening, 'quote', 'Slow intro keeps the quote cover visible');
assert(!slowIntro.nodes['[data-hero-intro]'].classList.contains('is-playing'));
slowIntro.clock.advance(1800);
await flush();
assert.equal(slowIntro.doc.documentElement.dataset.opening, 'ready', 'Intro startup timeout fails open');
slowIntro.pending.intro[0].resolve();
await flush();
assert(slowIntro.nodes['[data-hero-intro]'].paused, 'Late intro startup is stopped');

const loopPreloadError = mount();
await reachFall(loopPreloadError);
loopPreloadError.nodes['[data-hero-video]'].emit('error');
assert.equal(loopPreloadError.doc.documentElement.dataset.opening, 'fall');
assert(loopPreloadError.nodes['[data-hero-intro]'].classList.contains('is-playing'));
assert(!loopPreloadError.nodes['[data-hero-intro]'].paused, 'Loop preload error does not cut off a healthy intro');
loopPreloadError.nodes['[data-hero-intro]'].emit('ended');
await flush();
assert.equal(loopPreloadError.doc.documentElement.dataset.opening, 'ready');
assert(loopPreloadError.nodes['[data-hero-intro]'].paused);
assert(loopPreloadError.nodes['[data-hero-video]'].paused, 'Loop failure falls back to the poster');

// Scroll, focus, and Escape immediately skip to the normal loop.
for (const trigger of ['scroll', 'focus', 'escape']) {
  const skipped = mount();
  if (trigger === 'scroll') { skipped.win.scrollY = 81; skipped.win.emit('scroll'); }
  if (trigger === 'focus') skipped.doc.emit('focusin', { target: new Element() });
  if (trigger === 'escape') skipped.doc.emit('keydown', { key: 'Escape' });
  await flush();
  assert.equal(skipped.doc.documentElement.dataset.opening, 'ready', `${trigger} skips opening`);
  assert.equal(skipped.nodes['[data-hero-intro]'].plays, 0);
  assert(!skipped.nodes['[data-hero-video]'].paused);
}

// Reduced motion, global pause, and save-data never request either video.
for (const options of [{ reduce: true }, { saved: { 'journal-motion': 'off' } }, { saveData: true }, { reduce: true, mobile: true }, { saveData: true, mobile: true }]) {
  const staticPage = mount(options);
  await flush();
  assert.equal(staticPage.nodes['[data-hero-intro]'].plays, 0);
  assert.equal(staticPage.nodes['[data-hero-video]'].plays, 0);
  assert.equal(staticPage.nodes['[data-hero-intro]'].getAttribute('src'), null);
  assert.equal(staticPage.nodes['[data-hero-video]'].getAttribute('src'), null);
}

// A stale pending intro cannot restore fall after the visitor has skipped it.
const racedIntro = mount({ introBehavior: 'pending' });
racedIntro.clock.advance(300);
racedIntro.clock.advance(2500);
await flush();
assert.equal(racedIntro.doc.documentElement.dataset.opening, 'quote');
racedIntro.win.scrollY = 100;
racedIntro.win.emit('scroll');
await flush();
assert.equal(racedIntro.doc.documentElement.dataset.opening, 'ready');
racedIntro.pending.intro[0].resolve();
await flush();
assert.equal(racedIntro.doc.documentElement.dataset.opening, 'ready');
assert(racedIntro.nodes['[data-hero-intro]'].paused);

const loadFailure = mount({ loadThrows: true });
assert.equal(loadFailure.doc.documentElement.dataset.opening, 'ready');
assert.equal(loadFailure.doc.documentElement.dataset.openingManaged, undefined);
assert.equal(loadFailure.doc.documentElement.dataset.openingError, 'media-initialization', 'Media fallback remains observable');

const initFailure = {};
assert.throws(() => mount({ observerThrows: true, capture: initFailure }), /observer failed/);
assert.equal(initFailure.doc.documentElement.dataset.opening, 'ready', 'Unexpected init failure still releases opening UI');
assert.equal(initFailure.doc.documentElement.dataset.openingManaged, undefined);
assert.equal(initFailure.doc.documentElement.dataset.revealReady, undefined, 'Unexpected observer failure cannot leave content hidden');

// A stale loop play promise cannot mark an offscreen/hidden video as playing.
const racedLoop = mount({ opening: false, loopBehavior: 'pending' });
await flush();
racedLoop.doc.hidden = true;
racedLoop.doc.emit('visibilitychange');
racedLoop.pending.loop[0].resolve();
await flush();
assert(racedLoop.nodes['[data-hero-video]'].paused);
assert(!racedLoop.nodes['[data-hero-video]'].classList.contains('is-playing'));

const lateLoop = mount({ opening: false, loopBehavior: 'pending' });
await flush();
lateLoop.clock.advance(1800);
await flush();
assert(lateLoop.nodes['[data-hero-video]'].paused, 'Timed-out play is stopped');
lateLoop.setBehavior('loop', 'resolve');
lateLoop.doc.emit('click', { target: new Element() });
await flush();
assert(!lateLoop.nodes['[data-hero-video]'].paused);
lateLoop.pending.loop[0].resolve();
await flush();
assert(!lateLoop.nodes['[data-hero-video]'].paused, 'Late old fulfillment does not stop a newer valid play');
assert(lateLoop.nodes['[data-hero-video]'].classList.contains('is-playing'));

// Autoplay rejection uses the poster, then retries silently on interaction; hard errors do not retry.
const blocked = mount({ opening: false, loopBehavior: 'reject' });
await flush();
assert(!blocked.nodes['[data-hero-video]'].classList.contains('is-playing'));
blocked.setBehavior('loop', 'resolve');
blocked.doc.emit('click', { target: new Element(), pointerType: 'touch' });
await flush();
assert(!blocked.nodes['[data-hero-video]'].paused);
blocked.nodes['[data-hero-video]'].emit('error');
const failedPlays = blocked.nodes['[data-hero-video]'].plays;
blocked.doc.emit('keydown', { key: 'Enter' });
await flush();
assert.equal(blocked.nodes['[data-hero-video]'].plays, failedPlays);

// Existing global motion, visibility, offscreen, pageshow, menu, gallery, reveal, and back-top behavior remains intact.
page.nodes['.motion-toggle'].emit('click'); await flush(); assert(video.paused); assert.equal(page.prefs['reload-video'], undefined);
page.nodes['.motion-toggle'].emit('click'); await flush(); assert(!video.paused);
page.doc.hidden = true; page.doc.emit('visibilitychange'); await flush(); assert(video.paused);
page.doc.hidden = false; page.doc.emit('visibilitychange'); await flush(); assert(!video.paused);
const viewport = page.observers.find(observer => observer.targets.includes(page.nodes['.hero-media']));
assert(viewport, 'Visibility observer tracks .hero-media');
viewport.handler([{ isIntersecting: false }]); await flush(); assert(video.paused);
viewport.handler([{ isIntersecting: true }]); await flush(); assert(!video.paused);
page.reduced.matches = true; page.reduced.emit('change'); await flush(); assert(video.paused); assert(page.nodes['.motion-toggle'].disabled);
page.reduced.matches = false; page.reduced.emit('change'); await flush(); assert(!video.paused);
page.win.emit('pagehide'); assert(video.paused); page.win.emit('pageshow'); await flush(); assert(!video.paused);
assert.equal(page.prefs['leblanc-mode'], undefined);
const denied = mount({ storageDenied: true, opening: false }); await flush();
denied.nodes['.motion-toggle'].emit('click'); await flush(); assert.equal(denied.doc.documentElement.dataset.motion, 'off');
const nonhome = mount({ home: false }); await flush(); assert.equal(nonhome.prefs['leblanc-mode'], undefined);
const revisit = mount({ opening: false, saved: { 'reload-video': 'off', 'leblanc-mode': 'night', 'leblanc-weather': 'rain' } }); await flush();
assert(!revisit.nodes['[data-hero-video]'].paused, 'Old per-video key does not suppress a new visit');
assert.equal(revisit.doc.documentElement.dataset.mode, 'day');
const menu = page.nodes['.menu-toggle'], nav = page.nodes['#main-nav'];
menu.emit('click'); assert.equal(menu.attrs['aria-expanded'], 'true'); page.doc.emit('keydown', { key: 'Escape' }); assert.equal(menu.attrs['aria-expanded'], 'false'); assert(menu.focused);
menu.emit('click'); page.doc.emit('click', { target: new Element() }); assert(!nav.classList.contains('is-open'));
menu.emit('click'); nav.emit('click', { target: { closest: () => ({}) } }); assert(!nav.classList.contains('is-open'));
page.nodes['[data-gallery-next]'].emit('click'); assert.equal(page.nodes['.chapter-gallery'].lastScroll.left, 315);
page.nodes['.chapter-gallery'].emit('keydown', { target: page.nodes['.chapter-gallery'], key: 'ArrowLeft', preventDefault() {} }); assert.equal(page.nodes['.chapter-gallery'].lastScroll.left, -315);
const revealObserver = page.observers.find(observer => observer.targets.includes(page.reveals[0]));
assert.equal(page.doc.documentElement.dataset.revealReady, 'true');
revealObserver.handler([{ target: page.reveals[0], isIntersecting: true }]);
assert(page.reveals[0].classList.contains('is-visible'));
assert(!revealObserver.targets.includes(page.reveals[0]), 'Reveal runs once');
page.win.scrollY = 800; page.win.emit('scroll'); assert(!page.nodes['.back-top'].hidden);
page.nodes['.back-top'].emit('click'); assert.equal(page.win.lastScroll.top, 0);

// Source boot script paints blue only for an eligible home visit and clears itself if the module never starts.
if (!compiled) {
  const base = readFileSync('src/layouts/Base.astro', 'utf8');
  const boot = base.match(/<script is:inline>([\s\S]*?)<\/script>/)?.[1];
  assert(boot?.includes("dataset.opening = 'blue'"));
  const runBoot = options => {
    const bootPage = mount({ ...options, home: false, opening: false });
    bootPage.win.location.pathname = '/';
    vm.runInContext(boot, vm.createContext({ document: bootPage.doc, window: bootPage.win, localStorage: bootPage.win.localStorage, matchMedia: bootPage.win.matchMedia }));
    return bootPage;
  };
  const bootPage = runBoot({});
  assert.equal(bootPage.doc.documentElement.dataset.opening, 'blue');
  bootPage.clock.advance(4000);
  assert.equal(bootPage.doc.documentElement.dataset.opening, undefined, 'Boot fail-safe cannot permanently hide content');
  const stuckBoot = runBoot({});
  stuckBoot.doc.documentElement.dataset.openingManaged = 'true';
  stuckBoot.clock.advance(4000);
  assert.equal(stuckBoot.doc.documentElement.dataset.opening, 'blue');
  stuckBoot.clock.advance(11000);
  assert.equal(stuckBoot.doc.documentElement.dataset.opening, 'ready', 'Absolute boot guard releases a stuck managed opening');
  assert.equal(stuckBoot.doc.documentElement.dataset.openingManaged, undefined);
  for (const options of [{ reduce: true }, { saveData: true }, { saved: { 'journal-motion': 'off' } }]) {
    assert.equal(runBoot(options).doc.documentElement.dataset.opening, undefined, 'Static preference skips boot before media can be requested');
  }
}

const html = readFileSync('dist/index.html', 'utf8');
assert(html.includes('RELOAD')); assert(html.includes('YOUR DAYS.')); assert(html.includes('LINK RELOAD')); assert(html.includes('青蓝档案')); assert(html.includes('P3R-RELOAD-1'));
assert(!html.includes('film-toggle')); assert(!html.includes('播放背景影像')); assert(!html.includes('P3R PREVIEW')); assert(html.includes('/brand-reload.svg'));
assert(!html.includes('data-scene-time')); assert(!html.includes('leblanc-mode')); assert(!html.includes('theme-toggle')); assert(html.includes('data-hero-video'));
assert(html.includes('data-hero-intro')); assert(html.includes('data-opening')); assert(html.includes('site-home'));
assert(!html.includes('data-scene-rain')); assert(!html.includes('rain-texture')); assert(!html.includes('leblanc-weather')); assert(!html.includes('雨歇之前'));
for (const href of ['/daily/', '/study/', '/photos/', '/play/', '/search/', '/about/']) assert(html.includes(`href="${href}"`));
const css = readdirSync('dist/_astro').filter(name => name.endsWith('.css')).map(name => readFileSync(`dist/_astro/${name}`, 'utf8')).join('');
assert(css.includes('prefers-reduced-motion')); assert(css.includes('object-fit:cover'));
console.log(`PASS (${compiled ? 'compiled' : 'source'}): P3R one-shot opening, loop fallback, bounded failures, skip/accessibility, async races, reveal, navigation and built assets.`);
