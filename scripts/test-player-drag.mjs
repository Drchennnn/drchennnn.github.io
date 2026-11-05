import assert from 'node:assert/strict';
import { initPlayerDrag } from '../src/scripts/player-drag.mjs';

class Style {
  left = ''; top = ''; right = ''; bottom = ''; width = '';
  removeProperty(name) { this[name] = ''; }
}

class Element {
  constructor(rect = {}) { this.baseRect = { left: 620, top: 180, width: 420, height: 205, ...rect }; }
  dataset = {}; handlers = {}; children = new Map(); style = new Style(); parentNode = null; focused = false;
  addEventListener(type, fn) { (this.handlers[type] ??= []).push(fn); }
  emit(type, details = {}) {
    const event = {
      type,
      target: this,
      button: 0,
      isPrimary: true,
      pointerId: 1,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { this.propagationStopped = true; },
      ...details
    };
    for (const fn of this.handlers[type] ?? []) fn(event);
    return event;
  }
  dispatchEvent(event) { this.emit(event.type, event); return true; }
  querySelector(selector) { return this.children.get(selector) ?? null; }
  append(child) {
    child.parentNode = this;
    this.appended = child;
    for (const descendant of child.children?.values?.() ?? []) descendant.focused = false;
  }
  focus() { this.focused = true; }
  setPointerCapture(pointerId) { this.capture = pointerId; }
  hasPointerCapture(pointerId) { return this.capture === pointerId; }
  releasePointerCapture(pointerId) { if (this.capture === pointerId) this.capture = null; }
  getBoundingClientRect() {
    const width = Number.parseFloat(this.style.width) || (this.dataset.collapsed === 'true' ? 108 : this.baseRect.width);
    return {
      left: Number.parseFloat(this.style.left) || this.baseRect.left,
      top: Number.parseFloat(this.style.top) || this.baseRect.top,
      width,
      height: this.baseRect.height,
      right: (Number.parseFloat(this.style.left) || this.baseRect.left) + width,
      bottom: (Number.parseFloat(this.style.top) || this.baseRect.top) + this.baseRect.height
    };
  }
}

class MediaQuery extends Element {
  constructor(matches) { super(); this.matches = matches; }
  change(matches) { this.matches = matches; this.emit('change', { matches }); }
}

function mount({ desktop = true, fine = true, docked = true } = {}) {
  const root = new Element();
  const handle = new Element();
  const reset = new Element();
  const collapse = new Element();
  const show = new Element();
  root.children.set('[data-player-drag-handle]', handle);
  root.children.set('[data-player-reset-position]', reset);
  root.children.set('[data-player-collapse]', collapse);
  root.children.set('[data-player-show]', show);
  const body = new Element();
  const dock = new Element();
  (docked ? dock : body).append(root);
  root.dataset.placement = docked ? 'docked' : 'floating';
  root.dataset.collapsed = docked ? 'false' : 'true';
  const doc = new Element();
  doc.body = body;
  doc.documentElement = { clientWidth: 1200, clientHeight: 800 };
  doc.querySelector = selector => selector === '[data-music-player]' ? root : selector === '[data-player-dock]' ? dock : null;
  root.addEventListener('player:place-default', event => {
    (docked ? dock : body).append(root);
    root.dataset.placement = docked ? 'docked' : 'floating';
    root.dataset.collapsed = String(event.detail?.collapsed ?? !docked);
  });
  const desktopQuery = new MediaQuery(desktop);
  const fineQuery = new MediaQuery(fine);
  const win = new Element();
  win.innerWidth = 1200;
  win.innerHeight = 800;
  win.Event = class { constructor(type) { this.type = type; } };
  win.CustomEvent = class { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } };
  win.matchMedia = query => query.includes('min-width') ? desktopQuery : fineQuery;
  win.requestAnimationFrame = callback => { callback(); return 1; };
  const controller = initPlayerDrag(doc, win);
  return { root, handle, reset, collapse, show, body, dock, doc, win, desktopQuery, fineQuery, controller };
}

const point = (target, type, x, y, extra = {}) => target.emit(type, { clientX: x, clientY: y, ...extra });

// A click or sub-threshold move remains docked and is isolated from playback gestures.
const player = mount();
const down = point(player.handle, 'pointerdown', 1000, 210);
assert.equal(down.propagationStopped, true);
point(player.handle, 'pointermove', 1003, 212);
point(player.handle, 'pointerup', 1003, 212);
assert.equal(player.root.dataset.playerDetached, undefined);
assert.equal(player.root.parentNode, player.dock);
assert.equal(player.handle.emit('click').propagationStopped, true);

// Crossing the threshold detaches from the current rectangle, clamps and lightly snaps.
point(player.handle, 'pointerdown', 1000, 210);
point(player.handle, 'pointermove', 1100, 260);
assert.equal(player.root.dataset.playerDetached, 'true');
assert.equal(player.root.parentNode, player.body);
assert.equal(player.handle.focused, true, 'moving the root into body restores handle focus');
assert.equal(player.root.style.left, '720px');
assert.equal(player.root.style.top, '230px');
point(player.handle, 'pointerup', 1100, 260);
assert.equal(player.root.dataset.dragging, undefined);

point(player.handle, 'pointerdown', 1100, 260);
point(player.handle, 'pointermove', 410, 260);
point(player.handle, 'pointerup', 410, 260);
assert.equal(player.root.style.left, '16px', 'a nearby edge attracts the player without forcing every drop to an edge');

point(player.handle, 'pointerdown', 1100, 260);
point(player.handle, 'pointermove', 9999, 9999);
point(player.handle, 'pointerup', 9999, 9999);
assert.equal(player.root.style.left, '764px');
assert.equal(player.root.style.top, '579px');

// Resizing reclamps the same manual node rather than remounting it.
player.win.innerWidth = 900;
player.win.innerHeight = 600;
player.win.emit('resize');
assert.equal(player.root.style.left, '464px');
assert.equal(player.root.style.top, '379px');

// Pointer cancellation restores the exact pre-drag manual position.
const beforeCancel = { left: player.root.style.left, top: player.root.style.top };
point(player.handle, 'pointerdown', 500, 400);
point(player.handle, 'pointermove', 400, 300);
point(player.handle, 'pointercancel', 400, 300);
assert.deepEqual({ left: player.root.style.left, top: player.root.style.top }, beforeCancel);

// A cancelled first drag returns to its original dock.
const cancelledDock = mount();
point(cancelledDock.handle, 'pointerdown', 1000, 210);
point(cancelledDock.handle, 'pointermove', 900, 300);
point(cancelledDock.handle, 'pointercancel', 900, 300);
assert.equal(cancelledDock.root.dataset.playerDetached, undefined);
assert.equal(cancelledDock.root.parentNode, cancelledDock.dock);
assert.equal(cancelledDock.handle.focused, true, 'cancelling back to the dock preserves keyboard focus');
const lostCapture = mount();
point(lostCapture.handle, 'pointerdown', 1000, 210);
point(lostCapture.handle, 'pointermove', 900, 300);
await Promise.resolve();
lostCapture.handle.capture = null;
lostCapture.handle.emit('lostpointercapture', { pointerId: 1 });
assert.equal(lostCapture.root.parentNode, lostCapture.dock);
const escapedDrag = mount();
point(escapedDrag.handle, 'pointerdown', 1000, 210);
point(escapedDrag.handle, 'pointermove', 900, 300);
escapedDrag.handle.emit('keydown', { key: 'Escape' });
assert.equal(escapedDrag.root.parentNode, escapedDrag.dock);

// Cancelling an article-page drag restores its expanded pre-drag state, not the default launcher.
const articleExpanded = mount({ docked: false });
articleExpanded.root.dataset.collapsed = 'false';
point(articleExpanded.handle, 'pointerdown', 1000, 210);
point(articleExpanded.handle, 'pointermove', 900, 300);
point(articleExpanded.handle, 'pointercancel', 900, 300);
assert.equal(articleExpanded.root.parentNode, articleExpanded.body);
assert.equal(articleExpanded.root.dataset.placement, 'floating');
assert.equal(articleExpanded.root.dataset.collapsed, 'false');
assert.equal(articleExpanded.handle.focused, true);

// Keyboard movement uses 8/32px steps; Escape and Home/reset restore defaults.
const keyboard = mount();
keyboard.handle.emit('keydown', { key: 'ArrowRight' });
assert.equal(keyboard.root.style.left, '628px');
assert.equal(keyboard.handle.focused, true, 'first keyboard detach restores focus after moving the root');
keyboard.handle.emit('keydown', { key: 'ArrowDown', shiftKey: true });
assert.equal(keyboard.root.style.top, '212px');
keyboard.handle.emit('keydown', { key: 'Escape' });
assert.equal(keyboard.root.dataset.playerDetached, undefined);
assert.equal(keyboard.root.parentNode, keyboard.dock);
assert.equal(keyboard.handle.focused, true, 'Escape returns focus with the player');
keyboard.handle.emit('keydown', { key: 'ArrowLeft' });
keyboard.handle.emit('keydown', { key: 'Home' });
assert.equal(keyboard.root.parentNode, keyboard.dock);
assert.equal(keyboard.handle.focused, true);
keyboard.handle.emit('keydown', { key: 'ArrowRight' });
assert.equal(keyboard.reset.emit('pointerdown').propagationStopped, true);
assert.equal(keyboard.reset.emit('click').propagationStopped, true);
assert.equal(keyboard.root.dataset.playerDetached, undefined);

// Hide/show keeps coordinates; expanding reclamps the wider device.
const visibility = mount();
visibility.win.innerWidth = 900;
point(visibility.handle, 'pointerdown', 1000, 210);
point(visibility.handle, 'pointermove', 1100, 210);
point(visibility.handle, 'pointerup', 1100, 210);
const detachedLeft = visibility.root.style.left;
visibility.root.dataset.collapsed = 'true';
visibility.root.emit('click', { target: visibility.collapse });
assert.equal(visibility.root.style.left, detachedLeft);
visibility.root.dataset.collapsed = 'false';
visibility.root.emit('click', { target: visibility.show });
assert.equal(visibility.root.style.left, '464px');

// Narrow/touch layouts never detach; crossing to mobile clears manual placement.
const mobile = mount({ desktop: false });
point(mobile.handle, 'pointerdown', 1000, 210);
point(mobile.handle, 'pointermove', 900, 310);
assert.equal(mobile.root.dataset.playerDetached, undefined);
const hybridTouch = mount();
point(hybridTouch.handle, 'pointerdown', 1000, 210, { pointerType: 'touch' });
point(hybridTouch.handle, 'pointermove', 900, 310, { pointerType: 'touch' });
assert.equal(hybridTouch.root.dataset.playerDetached, undefined);
player.desktopQuery.change(false);
assert.equal(player.root.dataset.playerDetached, undefined);
assert.equal(player.root.parentNode, player.dock);

// Astro handoff retains manual coordinates and initialization is idempotent.
const routed = mount();
point(routed.handle, 'pointerdown', 1000, 210);
point(routed.handle, 'pointermove', 1060, 240);
point(routed.handle, 'pointerup', 1060, 240);
const routedPosition = [routed.root.style.left, routed.root.style.top];
routed.doc.emit('astro:page-load');
assert.equal(routed.root.parentNode, routed.body);
assert.deepEqual([routed.root.style.left, routed.root.style.top], routedPosition);
assert.equal(initPlayerDrag(routed.doc, routed.win), null);
assert.equal(routed.handle.handlers.pointerdown.length, 1);

console.log('PASS: desktop player dragging is thresholded, bounded, cancellable, keyboard-accessible and route-persistent.');
