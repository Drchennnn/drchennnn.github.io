import assert from 'node:assert/strict';
import { initMusicPlayer } from '../src/scripts/music-player.mjs';
import { MUSIC_TRACKS } from '../src/scripts/music-tracks.mjs';

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

function mount({ mobile = false, reduce = false, saved = {}, noAudioContext = false, decodeRejects = 0, decodePending = false, resumeState = 'running', resumeStates, fetchPending = false, docked = true, autoplay = false } = {}) {
  const root = new Element(); if (autoplay) root.dataset.autoplay = 'true';
  const selectors = ['[data-player-play]','[data-player-restart]','[data-player-info]','[data-player-track]','[data-player-volume-down]','[data-player-volume-up]','[data-player-volume]','[data-player-collapse]','[data-player-show]','[data-player-title]','[data-player-mode]','[data-player-elapsed]','[data-player-status]'];
  for (const selector of selectors) root.children.set(selector, new Element());
  root.bars = Array.from({ length: 5 }, () => new Element());
  const doc = new Element(); doc.hidden = false; doc.documentElement = new Element(); doc.documentElement.dataset.motion = 'on';
  doc.body = new Element(); doc.dock = docked ? new Element() : null; doc.body.append(root);
  doc.querySelector = selector => selector === '[data-music-player]' ? root : selector === '[data-player-dock]' ? doc.dock : null;
  const clock = new Clock(), prefs = { ...saved }, requests = [], contexts = [], pendingFetches = [], pendingDecodes = [], pendingResumes = [];
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
    decodeAudioData() {
      if (decodeRejects-- > 0) return Promise.reject(Error('decode failed'));
      if (decodePending) return new Promise((resolve, reject) => pendingDecodes.push({ resolve: () => resolve({ duration: 208.1064399, sampleRate: 44100 }), reject }));
      return Promise.resolve({ duration: 208.1064399, sampleRate: 44100 });
    }
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
  return { root, doc, win, clock, prefs, requests, contexts, pendingFetches, pendingDecodes, pendingResumes, node: selector => root.querySelector(selector), reduced };
}

// No autoplay, no eager request, and responsive collapse has a stable default.
const idle = mount({ mobile: true });
assert.equal(idle.root.dataset.state, 'idle');
assert.equal(idle.root.dataset.placement, 'docked');
assert.equal(idle.root.parentNode, idle.doc.dock);
assert.equal(idle.root.dataset.collapsed, 'true');
assert.equal(idle.requests.length, 0);
assert.equal(idle.contexts.length, 0);
assert.equal(idle.root.dataset.track, 'original');
assert.equal(idle.node('[data-player-mode]').textContent, 'ORIG LOOP');
assert.match(idle.node('[data-player-track]').getAttribute('aria-label'), /伴奏版/);
assert.equal(idle.node('[data-player-show]').getAttribute('aria-expanded'), 'false');
idle.node('[data-player-show]').emit('click');
assert.equal(idle.root.dataset.collapsed, 'false');
assert.equal(idle.node('[data-player-show]').getAttribute('aria-expanded'), 'true');
assert.equal(idle.prefs['p3r-player-collapsed'], 'false');
idle.node('[data-player-info]').emit('click');
assert.match(idle.node('[data-player-title]').textContent, /LOTUS JUICE/);

// Invalid saved choices fail closed to the original track.
const invalidChoice = mount({ saved: { 'p3r-player-track': 'missing-track' } });
assert.equal(invalidChoice.root.dataset.track, 'original');
assert.equal(invalidChoice.node('[data-player-title]').textContent, 'COLOR YOUR NIGHT');

// Selecting a track while paused changes metadata without fetching or starting audio.
const pausedChoice = mount();
pausedChoice.node('[data-player-track]').emit('click');
assert.equal(pausedChoice.root.dataset.track, 'instrumental');
assert.equal(pausedChoice.prefs['p3r-player-track'], 'instrumental');
assert.equal(pausedChoice.node('[data-player-mode]').textContent, 'INST LOOP');
assert.match(pausedChoice.node('[data-player-title]').textContent, /INSTRUMENTAL/);
assert.equal(pausedChoice.root.dataset.state, 'paused');
assert.equal(pausedChoice.requests.length, 0);
pausedChoice.node('[data-player-info]').emit('click');
assert.equal(pausedChoice.node('[data-player-title]').textContent, 'REMI');
assert.match(pausedChoice.node('[data-player-track]').getAttribute('aria-label'), /原唱版/);
const restoredChoice = mount({ saved: pausedChoice.prefs });
assert.equal(restoredChoice.root.dataset.track, 'instrumental');
assert.equal(restoredChoice.requests.length, 0);

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

// The track control owns the blocked-autoplay gesture and never starts the old selection first.
const autoTrackButton = mount({ autoplay: true, resumeStates: ['reject', 'running'] });
await flush();
const autoTrackControl = autoTrackButton.node('[data-player-track]');
autoTrackButton.doc.emit('pointerdown', { target: autoTrackControl });
autoTrackControl.emit('click');
autoTrackButton.doc.emit('click', { target: autoTrackControl });
await flush();
assert.equal(autoTrackButton.root.dataset.track, 'instrumental');
assert.equal(autoTrackButton.root.dataset.state, 'paused');
assert.equal(autoTrackButton.requests.length, 0);

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

// Switching while playing starts the selected track at its true opening using the same context.
idle.node('[data-player-track]').emit('click');
await flush();
assert.equal(idle.contexts.length, 1);
assert.deepEqual(idle.requests, ['/music/color-your-night-loop.mp3', '/music/color-your-night-instrumental-loop.mp3']);
assert.equal(idle.root.dataset.track, 'instrumental');
assert.equal(idle.contexts[0].sources.at(-1).started.offset, 0);
assert.equal(idle.contexts[0].sources.at(-1).loopStart, MUSIC_TRACKS[1].loopStart);
assert.match(idle.node('[data-player-status]').textContent, /INSTRUMENTAL/);
idle.node('[data-player-track]').emit('click');
await flush();
assert.equal(idle.root.dataset.track, 'original');
assert.equal(idle.contexts[0].sources.at(-1).started.offset, 0);
assert.equal(idle.contexts[0].sources.at(-1).loopStart, MUSIC_TRACKS[0].loopStart);
assert.equal(idle.contexts.length, 1, 'track changes reuse one AudioContext');

// Astro route placement and manual detachment preserve the selected track and source.
const trackNav = mount();
trackNav.node('[data-player-track]').emit('click');
trackNav.node('[data-player-play]').emit('click');
await flush();
const trackNavSource = trackNav.contexts[0].sources.at(-1);
trackNav.doc.dock = null;
trackNav.doc.emit('astro:page-load');
assert.equal(trackNav.root.dataset.track, 'instrumental');
assert.equal(trackNav.contexts[0].sources.at(-1), trackNavSource);
assert.equal(trackNav.contexts[0].sources.length, 1, 'navigation must not create another audio source');
assert.equal(trackNav.requests.length, 1);
trackNav.root.dataset.playerDetached = 'true';
trackNav.doc.body.append(trackNav.root);
trackNav.doc.emit('astro:page-load');
assert.equal(trackNav.root.dataset.track, 'instrumental');
assert.equal(trackNav.contexts[0].sources.at(-1), trackNavSource);
assert.equal(trackNav.contexts[0].sources.length, 1, 'navigation must not create another audio source');
assert.equal(trackNav.requests.length, 1);

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
assert.equal(idle.requests.length, 3);

// The same persistent player docks on the home page and becomes a launcher elsewhere.
const persistentSource = context.sources.at(-1);
const sourcesBeforeNavigation = context.sources.length;
idle.doc.dock = null;
idle.doc.emit('astro:page-load');
assert.equal(idle.root.dataset.placement, 'floating');
assert.equal(idle.root.parentNode, idle.doc.body);
assert.equal(idle.root.dataset.collapsed, 'true');
assert.equal(context.sources.at(-1), persistentSource);
assert.equal(context.sources.length, sourcesBeforeNavigation, 'placement must keep the active source');
assert.equal(idle.root.dataset.state, 'playing');
assert.equal(idle.requests.length, 3);
idle.doc.dock = new Element();
idle.doc.emit('astro:page-load');
assert.equal(idle.root.dataset.placement, 'docked');
assert.equal(idle.root.parentNode, idle.doc.dock);
assert.equal(idle.root.dataset.collapsed, 'false', 'home restores the manually saved visible state');
assert.equal(context.sources.at(-1), persistentSource);
assert.equal(context.sources.length, sourcesBeforeNavigation, 'placement must keep the active source');
assert.equal(idle.requests.length, 3);

// Manual desktop placement survives route handoff without rebuilding audio.
idle.root.dataset.playerDetached = 'true';
idle.doc.body.append(idle.root);
idle.doc.emit('astro:page-load');
assert.equal(idle.root.dataset.placement, 'floating');
assert.equal(idle.root.parentNode, idle.doc.body);
assert.equal(idle.root.dataset.collapsed, 'false');
assert.equal(context.sources.at(-1), persistentSource);
assert.equal(context.sources.length, sourcesBeforeNavigation, 'placement must keep the active source');
assert.equal(idle.requests.length, 3);
delete idle.root.dataset.playerDetached;
idle.root.emit('player:place-default');
assert.equal(idle.root.dataset.placement, 'docked');
assert.equal(idle.root.parentNode, idle.doc.dock);
assert.equal(context.sources.at(-1), persistentSource);
assert.equal(context.sources.length, sourcesBeforeNavigation, 'placement must keep the active source');

// Pause preserves time; resume reuses the decoded buffer without another request.
context.currentTime = 17.25;
idle.node('[data-player-play]').emit('click');
assert.equal(idle.root.dataset.state, 'paused');
idle.node('[data-player-play]').emit('click');
await flush();
assert.equal(idle.requests.length, 3);
assert.equal(context.sources.at(-1).started.offset, 17.25);

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

// Obsolete A/B/A loads may finish out of order but only the final selection can play.
const trackRace = mount({ fetchPending: true });
trackRace.node('[data-player-play]').emit('click');
await flush();
trackRace.node('[data-player-track]').emit('click');
await flush();
trackRace.node('[data-player-track]').emit('click');
await flush();
assert.deepEqual(trackRace.requests, [
  '/music/color-your-night-loop.mp3',
  '/music/color-your-night-instrumental-loop.mp3',
  '/music/color-your-night-loop.mp3',
]);
trackRace.pendingFetches[1].resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
trackRace.pendingFetches[0].resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
await flush();
assert.equal(trackRace.contexts[0].sources.length, 0);
trackRace.pendingFetches[2].resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
await flush();
assert.equal(trackRace.root.dataset.track, 'original');
assert.equal(trackRace.root.dataset.state, 'playing');
assert.equal(trackRace.contexts[0].sources.length, 1);
assert.equal(trackRace.contexts[0].sources[0].loopStart, MUSIC_TRACKS[0].loopStart);

// Decodes completing after a newer selection are discarded just like stale requests.
const decodeRace = mount({ decodePending: true });
decodeRace.node('[data-player-play]').emit('click');
await flush();
decodeRace.node('[data-player-track]').emit('click');
await flush();
decodeRace.node('[data-player-track]').emit('click');
await flush();
assert.equal(decodeRace.pendingDecodes.length, 3);
decodeRace.pendingDecodes[1].resolve();
decodeRace.pendingDecodes[0].resolve();
await flush();
assert.equal(decodeRace.contexts[0].sources.length, 0);
decodeRace.pendingDecodes[2].resolve();
await flush();
assert.equal(decodeRace.root.dataset.track, 'original');
assert.equal(decodeRace.contexts[0].sources.length, 1);
assert.equal(decodeRace.root.dataset.state, 'playing');

// A failed decode is retryable and does not reuse the rejected promise.
const retry = mount({ decodeRejects: 1 });
retry.node('[data-player-play]').emit('click');
await flush();
assert.equal(retry.root.dataset.state, 'error');
retry.node('[data-player-play]').emit('click');
await flush();
assert.equal(retry.root.dataset.state, 'playing');
assert.equal(retry.requests.length, 2);

// A failed instrumental load retries the same selection without falling back to original.
const instrumentalRetry = mount({ decodeRejects: 1 });
instrumentalRetry.node('[data-player-track]').emit('click');
instrumentalRetry.node('[data-player-play]').emit('click');
await flush();
assert.equal(instrumentalRetry.root.dataset.track, 'instrumental');
assert.equal(instrumentalRetry.root.dataset.state, 'error');
instrumentalRetry.node('[data-player-play]').emit('click');
await flush();
assert.equal(instrumentalRetry.root.dataset.track, 'instrumental');
assert.equal(instrumentalRetry.root.dataset.state, 'playing');
assert.deepEqual(instrumentalRetry.requests, [MUSIC_TRACKS[1].src, MUSIC_TRACKS[1].src]);

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
assert.equal(idle.requests.length, 3, 'resuming an interrupted decoded track does not fetch again');

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

console.log('PASS: P3R music player switches two lazy-loaded loop tracks safely and remains cancellable, resumable and motion-aware.');
