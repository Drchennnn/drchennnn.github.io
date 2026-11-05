import assert from 'node:assert/strict';
import { initMusicPlayer } from '../src/scripts/music-player.mjs';

const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
  await new Promise(resolve => setImmediate(resolve));
};
class Element {
  dataset = {}; handlers = {}; attrs = {}; textContent = ''; value = ''; children = new Map();
  style = { values: {}, writes: 0, setProperty: (key, value) => { this.style.values[key] = value; this.style.writes++; } };
  addEventListener(type, fn) { (this.handlers[type] ??= []).push(fn); }
  emit(type, event = {}) { for (const fn of this.handlers[type] ?? []) fn({ target: this, ...event }); }
  setAttribute(key, value) { this.attrs[key] = value; }
  getAttribute(key) { return this.attrs[key] ?? null; }
  focus() { this.focused = true; }
  append(child) { child.parentNode = this; this.appended = child; }
  contains(node) { return node === this || [...this.children.values()].some(child => child === node || child.contains?.(node)); }
  querySelector(selector) { return this.children.get(selector) ?? null; }
  querySelectorAll(selector) { return selector === '[data-player-bar]' ? this.bars : []; }
}
class Clock {
  next = 1; timers = new Map();
  setTimeout = (fn, delay) => { const id = this.next++; this.timers.set(id, { fn, delay }); return id; };
  clearTimeout = id => this.timers.delete(id);
  tickOne() { const entry = this.timers.entries().next().value; if (entry) { this.timers.delete(entry[0]); entry[1].fn(); } }
}

function mount({ mobile = false, reduce = false, saved = {}, noAudioContext = false, decodeRejects = 0, resumeState = 'running', resumeStates, fetchPending = false, loopStart = '6', docked = true, autoplay = false } = {}) {
  const root = new Element(); root.dataset.audioSrc = '/music/color-your-night-loop.mp3'; root.dataset.loopStart = loopStart; if (autoplay) root.dataset.autoplay = 'true';
  const selectors = ['[data-player-play]','[data-player-restart]','[data-player-info]','[data-player-volume-down]','[data-player-volume-up]','[data-player-volume]','[data-player-collapse]','[data-player-show]','[data-player-title]','[data-player-elapsed]','[data-player-status]'];
  for (const selector of selectors) root.children.set(selector, new Element());
  root.bars = Array.from({ length: 5 }, () => new Element());
  const doc = new Element(); doc.hidden = false; doc.documentElement = new Element(); doc.documentElement.dataset.motion = 'on';
  doc.body = new Element(); doc.dock = docked ? new Element() : null; doc.body.append(root);
  doc.querySelector = selector => selector === '[data-music-player]' ? root : selector === '[data-player-dock]' ? doc.dock : null;
  const clock = new Clock(), prefs = { ...saved }, requests = [], contexts = [], pendingFetches = [], pendingResumes = [];
  const resumeQueue = resumeStates ? [...resumeStates] : null;
  const reduced = new Element(); reduced.matches = reduce;
  class AudioContext {
    constructor() { this.state = resumeState === 'reject' ? 'suspended' : 'suspended'; this.currentTime = 0; this.destination = {}; this.handlers = {}; this.sources = []; contexts.push(this); }
    addEventListener(type, fn) { (this.handlers[type] ??= []).push(fn); }
    emit(type) { for (const fn of this.handlers[type] ?? []) fn(); }
    resume() {
      const next = resumeQueue?.shift() ?? resumeState;
      if (next === 'reject') return Promise.reject(Error('not allowed'));
      if (next === 'pending') return new Promise((resolve, reject) => pendingResumes.push({ resolve: () => { this.state = 'running'; resolve(); }, reject }));
      this.state = next; return Promise.resolve();
    }
    close() { this.state = 'closed'; this.closed = true; }
    createGain() { return this.gainNode = { gain: { value: 1, setValueAtTime(value) { this.value = value; } }, connect() {} }; }
    createAnalyser() { return this.analyser = { frequencyBinCount: 10, reads: 0, connect() {}, getByteFrequencyData(data) { this.reads++; data.fill(128); } }; }
    createBufferSource() {
      const source = { connect() {}, disconnect() {}, stop() { this.stopped = true; }, start(when, offset) { this.started = { when, offset }; } };
      this.sources.push(source); return source;
    }
    decodeAudioData() { if (decodeRejects-- > 0) return Promise.reject(Error('decode failed')); return Promise.resolve({ duration: 208.1064399, sampleRate: 44100 }); }
  }
  const win = new Element();
  win.matchMedia = query => query.includes('max-width') ? { matches: mobile } : reduced;
  win.localStorage = { getItem: key => prefs[key] ?? null, setItem: (key, value) => { prefs[key] = value; } };
  win.setTimeout = clock.setTimeout; win.clearTimeout = clock.clearTimeout;
  win.AudioContext = noAudioContext ? undefined : AudioContext;
  win.fetch = url => {
    requests.push(url);
    if (fetchPending) return new Promise((resolve, reject) => pendingFetches.push({ resolve, reject }));
    return Promise.resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
  };
  initMusicPlayer(doc, win);
  return { root, doc, win, clock, prefs, requests, contexts, pendingFetches, pendingResumes, node: selector => root.querySelector(selector), reduced };
}

// No autoplay, no eager request, and responsive collapse has a stable default.
const idle = mount({ mobile: true });
assert.equal(idle.root.dataset.state, 'idle');
assert.equal(idle.root.dataset.placement, 'docked');
assert.equal(idle.root.parentNode, idle.doc.dock);
assert.equal(idle.root.dataset.collapsed, 'true');
assert.equal(idle.requests.length, 0);
assert.equal(idle.contexts.length, 0);
assert.equal(idle.node('[data-player-show]').getAttribute('aria-expanded'), 'false');
idle.node('[data-player-show]').emit('click');
assert.equal(idle.root.dataset.collapsed, 'false');
assert.equal(idle.node('[data-player-show]').getAttribute('aria-expanded'), 'true');
assert.equal(idle.prefs['p3r-player-collapsed'], 'false');
idle.node('[data-player-info]').emit('click');
assert.match(idle.node('[data-player-title]').textContent, /LOTUS JUICE/);

const nonHome = mount({ docked: false });
assert.equal(nonHome.root.dataset.placement, 'floating');
assert.equal(nonHome.root.parentNode, nonHome.doc.body);
assert.equal(nonHome.root.dataset.collapsed, 'true');
assert.equal(nonHome.prefs['p3r-player-collapsed'], undefined, 'automatic floating collapse does not overwrite the home preference');
nonHome.node('[data-player-show]').emit('click');
assert.equal(nonHome.root.dataset.collapsed, 'false');
nonHome.root.emit('player:place-default', { detail: { collapsed: false } });
assert.equal(nonHome.root.dataset.placement, 'floating');
assert.equal(nonHome.root.dataset.collapsed, 'false', 'cancel restoration may preserve an expanded article-page player');
nonHome.root.emit('player:place-default');
assert.equal(nonHome.root.dataset.collapsed, 'true', 'ordinary reset still uses the article-page default launcher');

// Optional autoplay succeeds from the true beginning when browser policy allows it.
const autoAllowed = mount({ autoplay: true });
assert.equal(autoAllowed.root.dataset.state, 'loading');
assert.equal(autoAllowed.node('[data-player-play]').getAttribute('aria-pressed'), 'true');
await flush();
assert.equal(autoAllowed.root.dataset.state, 'playing');
assert.deepEqual(autoAllowed.contexts[0].sources[0].started, { when: 0, offset: 0 });
assert.equal(autoAllowed.requests.length, 1);
const autoSource = autoAllowed.contexts[0].sources[0];
autoAllowed.doc.emit('astro:page-load');
assert.equal(autoAllowed.contexts[0].sources[0], autoSource);
assert.equal(autoAllowed.requests.length, 1, 'Astro navigation does not re-run autoplay');

// Rejected autoplay waits for a real gesture and never fetches before permission.
const autoBlocked = mount({ autoplay: true, resumeStates: ['reject', 'running'] });
await flush();
assert.equal(autoBlocked.root.dataset.state, 'idle');
assert.equal(autoBlocked.node('[data-player-status]').textContent, '点击或按键开启音乐');
assert.equal(autoBlocked.requests.length, 0);
autoBlocked.doc.emit('click', { target: autoBlocked.doc.body });
await flush();
assert.equal(autoBlocked.root.dataset.state, 'playing');
assert.equal(autoBlocked.requests.length, 1);
assert.deepEqual(autoBlocked.contexts[0].sources[0].started, { when: 0, offset: 0 });

// A gesture arriving inside the 800 ms window immediately supersedes autoplay resume.
const autoEarlyGesture = mount({ autoplay: true, resumeStates: ['pending', 'running'] });
assert.equal(autoEarlyGesture.root.dataset.state, 'loading');
autoEarlyGesture.doc.emit('pointerdown', { target: autoEarlyGesture.doc.body });
await flush();
assert.equal(autoEarlyGesture.root.dataset.state, 'playing');
assert.equal(autoEarlyGesture.requests.length, 1);
assert.deepEqual(autoEarlyGesture.contexts[0].sources[0].started, { when: 0, offset: 0 });
autoEarlyGesture.pendingResumes[0].reject(Error('late obsolete resume')); await flush();
assert.equal(autoEarlyGesture.root.dataset.state, 'playing');
assert.equal(autoEarlyGesture.contexts[0].sources.length, 1);

// A pending policy response is bounded; keyboard activation can then resume it.
const autoPending = mount({ autoplay: true, resumeStates: ['pending', 'running'] });
assert.equal(autoPending.root.dataset.state, 'loading');
assert.equal(autoPending.requests.length, 0);
assert.equal([...autoPending.clock.timers.values()][0].delay, 800);
autoPending.clock.tickOne(); await flush();
assert.equal(autoPending.root.dataset.state, 'idle');
assert.equal(autoPending.node('[data-player-status]').textContent, '点击或按键开启音乐');
autoPending.doc.emit('keydown', { target: autoPending.doc.body, key: 'Enter' });
await flush();
assert.equal(autoPending.root.dataset.state, 'playing');
assert.equal(autoPending.requests.length, 1);

// Player controls own their click and are not double-toggled by document fallbacks.
const autoButton = mount({ autoplay: true, resumeStates: ['reject', 'running'] });
await flush();
const autoPlayButton = autoButton.node('[data-player-play]');
autoButton.doc.emit('pointerdown', { target: autoPlayButton });
autoPlayButton.emit('click');
autoButton.doc.emit('click', { target: autoPlayButton });
await flush();
assert.equal(autoButton.root.dataset.state, 'playing');
assert.equal(autoButton.requests.length, 1);

// Explicit cancellation defeats timeout, late resume and later fallback gestures.
const autoCancelled = mount({ autoplay: true, resumeStates: ['pending'] });
autoCancelled.node('[data-player-play]').emit('click');
assert.equal(autoCancelled.root.dataset.state, 'paused');
autoCancelled.clock.tickOne(); await flush();
autoCancelled.pendingResumes[0].resolve(); await flush();
autoCancelled.doc.emit('pointerdown', { target: autoCancelled.doc.body });
await flush();
assert.equal(autoCancelled.root.dataset.state, 'paused');
assert.equal(autoCancelled.requests.length, 0);
assert.equal(autoCancelled.contexts[0].sources.length, 0);

// An obsolete autoplay resume failure cannot overwrite later manual playback.
const oldResume = mount({ autoplay: true, resumeStates: ['pending', 'running'] });
oldResume.clock.tickOne(); await flush();
oldResume.doc.emit('pointerdown', { target: oldResume.doc.body });
await flush();
assert.equal(oldResume.root.dataset.state, 'playing');
oldResume.pendingResumes[0].reject(Error('obsolete resume failure')); await flush();
assert.equal(oldResume.root.dataset.state, 'playing');

// First user action loads, decodes and starts a true AudioBuffer loop.
idle.node('[data-player-play]').emit('click');
await flush();
assert.deepEqual(idle.requests, ['/music/color-your-night-loop.mp3']);
assert.equal(idle.root.dataset.state, 'playing');
const context = idle.contexts[0], firstSource = context.sources[0];
assert.equal(context.analyser.reads, 1);
assert.equal([...idle.clock.timers.values()][0].delay, 100);
assert.equal(firstSource.loop, true);
assert.equal(firstSource.loopStart, 6);
assert.equal(firstSource.loopEnd, 208.1064399);
assert.deepEqual(firstSource.started, { when: 0, offset: 0 });

// Hiding the complete device and showing it again never changes playback.
idle.node('[data-player-collapse]').emit('click');
assert.equal(idle.root.dataset.collapsed, 'true');
assert.equal(idle.node('[data-player-show]').getAttribute('aria-expanded'), 'false');
assert.equal(idle.node('[data-player-show]').focused, true);
assert.equal(idle.node('[data-player-collapse]').getAttribute('aria-label'), '隐藏音乐播放器');
assert.equal(idle.root.dataset.state, 'playing');
assert.equal([...idle.clock.timers.values()][0].delay, 1000);
const readsWhileHidden = context.analyser.reads;
idle.clock.tickOne();
assert.equal(context.analyser.reads, readsWhileHidden);
idle.node('[data-player-show]').emit('click');
assert.equal(idle.root.dataset.collapsed, 'false');
assert.equal(idle.node('[data-player-play]').focused, true);
assert.equal(idle.root.dataset.state, 'playing');
assert.equal(idle.requests.length, 1);

// The same persistent player docks on the home page and becomes a launcher elsewhere.
const persistentSource = context.sources[0];
idle.doc.dock = null;
idle.doc.emit('astro:page-load');
assert.equal(idle.root.dataset.placement, 'floating');
assert.equal(idle.root.parentNode, idle.doc.body);
assert.equal(idle.root.dataset.collapsed, 'true');
assert.equal(context.sources[0], persistentSource);
assert.equal(idle.root.dataset.state, 'playing');
assert.equal(idle.requests.length, 1);
idle.doc.dock = new Element();
idle.doc.emit('astro:page-load');
assert.equal(idle.root.dataset.placement, 'docked');
assert.equal(idle.root.parentNode, idle.doc.dock);
assert.equal(idle.root.dataset.collapsed, 'false', 'home restores the manually saved visible state');
assert.equal(context.sources[0], persistentSource);
assert.equal(idle.requests.length, 1);

// Manual desktop placement survives route handoff without rebuilding audio.
idle.root.dataset.playerDetached = 'true';
idle.doc.body.append(idle.root);
idle.doc.emit('astro:page-load');
assert.equal(idle.root.dataset.placement, 'floating');
assert.equal(idle.root.parentNode, idle.doc.body);
assert.equal(idle.root.dataset.collapsed, 'false');
assert.equal(context.sources[0], persistentSource);
assert.equal(idle.requests.length, 1);
delete idle.root.dataset.playerDetached;
idle.root.emit('player:place-default');
assert.equal(idle.root.dataset.placement, 'docked');
assert.equal(idle.root.parentNode, idle.doc.dock);
assert.equal(context.sources[0], persistentSource);

// Pause preserves time; resume reuses the decoded buffer without another request.
context.currentTime = 17.25;
idle.node('[data-player-play]').emit('click');
assert.equal(idle.root.dataset.state, 'paused');
idle.node('[data-player-play]').emit('click');
await flush();
assert.equal(idle.requests.length, 1);
assert.equal(context.sources[1].started.offset, 17.25);

// Volume is clamped, persisted, and restart replaces the source at offset zero.
for (let i = 0; i < 20; i++) idle.node('[data-player-volume-up]').emit('click');
assert.equal(idle.node('[data-player-volume]').value, '1');
assert.equal(idle.prefs['p3r-player-volume'], '1');
context.currentTime = 25;
idle.node('[data-player-restart]').emit('click');
await flush();
assert.equal(context.sources.at(-1).started.offset, 0);
assert.equal(idle.root.dataset.state, 'playing');

// After the one-time intro, elapsed time and resume positions wrap to 00:06.
const wrapped = mount();
wrapped.node('[data-player-play]').emit('click');
await flush();
const wrappedContext = wrapped.contexts[0];
wrappedContext.currentTime = 208.1064399 + 2 * 202.1064399 + 10;
wrapped.clock.tickOne();
assert.equal(wrapped.node('[data-player-elapsed]').textContent, '00:16');
wrapped.node('[data-player-play]').emit('click');
wrapped.node('[data-player-play]').emit('click');
await flush();
assert(Math.abs(wrappedContext.sources.at(-1).started.offset - 16) < 1e-8);
assert.equal(wrapped.requests.length, 1);

// Missing and invalid loop metadata remain bounded and safe.
const legacy = mount({ loopStart: '' });
legacy.node('[data-player-play]').emit('click'); await flush();
assert.equal(legacy.contexts[0].sources[0].loopStart, 0);
const invalid = mount({ loopStart: '9999' });
invalid.node('[data-player-play]').emit('click'); await flush();
assert(invalid.contexts[0].sources[0].loopStart < invalid.contexts[0].sources[0].loopEnd);

// Loading can be cancelled; its eventual completion must not begin playback.
const pending = mount({ fetchPending: true });
pending.node('[data-player-play]').emit('click');
await flush();
assert.equal(pending.root.dataset.state, 'loading');
pending.node('[data-player-play]').emit('click');
assert.equal(pending.root.dataset.state, 'paused');
pending.pendingFetches[0].resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
await flush();
assert.equal(pending.contexts[0].sources.length, 0);
assert.equal(pending.root.dataset.state, 'paused');

// Rapid play/pause/play while loading creates only the source requested last.
const rapid = mount({ fetchPending: true });
rapid.node('[data-player-play]').emit('click');
await flush();
rapid.node('[data-player-play]').emit('click');
rapid.node('[data-player-play]').emit('click');
rapid.pendingFetches[0].resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
await flush();
assert.equal(rapid.contexts[0].sources.length, 1);
assert.equal(rapid.root.dataset.state, 'playing');

// A failed decode is retryable and does not reuse the rejected promise.
const retry = mount({ decodeRejects: 1 });
retry.node('[data-player-play]').emit('click');
await flush();
assert.equal(retry.root.dataset.state, 'error');
retry.node('[data-player-play]').emit('click');
await flush();
assert.equal(retry.root.dataset.state, 'playing');
assert.equal(retry.requests.length, 2);

// Browser restrictions are clear and a later user click can retry resume.
const blocked = mount({ resumeState: 'suspended' });
blocked.node('[data-player-play]').emit('click');
await flush();
assert.equal(blocked.root.dataset.state, 'error');
assert.match(blocked.node('[data-player-status]').textContent, /阻止|暂停/);

// An obsolete failed command cannot overwrite a newer successful play command.
const stale = mount({ resumeStates: ['reject', 'running'] });
stale.node('[data-player-play]').emit('click');
stale.node('[data-player-play]').emit('click');
stale.node('[data-player-play]').emit('click');
await flush();
assert.equal(stale.root.dataset.state, 'playing');
assert.match(stale.node('[data-player-status]').textContent, /正在播放/);

// Mobile interruption pauses without automatically restoring sound.
context.currentTime = 30;
context.state = 'interrupted'; context.emit('statechange');
assert.equal(idle.root.dataset.state, 'paused');
assert.equal(idle.node('[data-player-play]').getAttribute('aria-pressed'), 'false');
idle.node('[data-player-play]').emit('click');
await flush();
assert.equal(context.state, 'running');
assert.equal(idle.root.dataset.state, 'playing');
assert.equal(idle.requests.length, 1, 'resuming an interrupted decoded track does not fetch again');

// Back/forward cache exits pause but keep the controller recoverable.
idle.win.emit('pagehide', { persisted: true });
assert.equal(idle.root.dataset.state, 'paused');
assert.equal(context.closed, undefined);
idle.node('[data-player-play]').emit('click');
await flush();
assert.equal(idle.root.dataset.state, 'playing');

// Reinitialization does not duplicate handlers or create a second controller.
const handlers = idle.node('[data-player-play]').handlers.click.length;
assert.equal(initMusicPlayer(idle.doc, idle.win), null);
assert.equal(idle.node('[data-player-play]').handlers.click.length, handlers);

// Reduced motion freezes meters without suppressing user-controlled audio.
const quietMotion = mount({ reduce: true });
quietMotion.node('[data-player-play]').emit('click');
await flush();
assert.equal(quietMotion.root.dataset.state, 'playing');
assert.deepEqual(quietMotion.root.bars.map(bar => bar.style.values['--bar-level']), ['0.18','0.25','0.18','0.25','0.18']);
assert.equal(quietMotion.contexts[0].analyser.reads, 0);
assert.equal([...quietMotion.clock.timers.values()][0].delay, 1000);
const staticWrites = quietMotion.root.bars.map(bar => bar.style.writes);
quietMotion.clock.tickOne();
assert.deepEqual(quietMotion.root.bars.map(bar => bar.style.writes), staticWrites);
assert.equal(quietMotion.contexts[0].analyser.reads, 0);

// Astro's in-document swap is ignored, while a full-page exit releases audio.
quietMotion.doc.emit('astro:before-swap');
assert.equal(quietMotion.root.dataset.state, 'playing');
quietMotion.win.emit('pagehide');
assert.equal(quietMotion.root.dataset.state, 'paused');
assert.equal(quietMotion.contexts[0].closed, true);

// Unsupported browsers fail without fetching a large asset.
const unsupported = mount({ noAudioContext: true });
unsupported.node('[data-player-play]').emit('click');
await flush();
assert.equal(unsupported.root.dataset.state, 'error');
assert.equal(unsupported.requests.length, 0);

console.log('PASS: P3R music player is user-activated, cancellable, resumable, retryable and motion-aware.');
