const SAFE_EDGE = 16;
const DRAG_THRESHOLD = 5;
const SNAP_DISTANCE = 28;
const KEY_STEP = 8;
const KEY_STEP_LARGE = 32;

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

/** Adds desktop-only pointer and keyboard positioning without recreating the player. */
export function initPlayerDrag(doc = document, win = window) {
  const root = doc.querySelector('[data-music-player]');
  if (!root || root.dataset.playerDragInitialized === 'true') return null;

  const handle = root.querySelector('[data-player-drag-handle]');
  const resetButton = root.querySelector('[data-player-reset-position]');
  const showButton = root.querySelector('[data-player-show]');
  if (!handle || !resetButton) return null;
  root.dataset.playerDragInitialized = 'true';

  const desktop = win.matchMedia?.('(min-width: 761px)') ?? { matches: true, addEventListener() {} };
  const finePointer = win.matchMedia?.('(hover: hover) and (pointer: fine)') ?? { matches: true, addEventListener() {} };
  const later = win.requestAnimationFrame?.bind(win) ?? (callback => (win.setTimeout ?? setTimeout)(callback, 0));
  let active = null;
  let keyboardUndo = null;

  const focusHandle = () => {
    try { handle.focus?.({ preventScroll: true }); } catch { handle.focus?.(); }
  };
  const enabled = () => desktop.matches && finePointer.matches;
  const viewport = () => ({ width: win.innerWidth ?? doc.documentElement?.clientWidth ?? 0, height: win.innerHeight ?? doc.documentElement?.clientHeight ?? 0 });
  const boundsFor = rect => {
    const view = viewport();
    return {
      minX: SAFE_EDGE,
      minY: SAFE_EDGE,
      maxX: Math.max(SAFE_EDGE, view.width - rect.width - SAFE_EDGE),
      maxY: Math.max(SAFE_EDGE, view.height - rect.height - SAFE_EDGE)
    };
  };
  const readPosition = () => {
    const rect = root.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  };
  const writePosition = (left, top, rect = readPosition()) => {
    const bounds = boundsFor(rect);
    root.style.left = `${clamp(left, bounds.minX, bounds.maxX)}px`;
    root.style.top = `${clamp(top, bounds.minY, bounds.maxY)}px`;
    root.style.right = 'auto';
    root.style.bottom = 'auto';
  };
  const dispatchPlacement = restoredCollapsed => {
    if (typeof root.dispatchEvent === 'function') {
      const CustomEventClass = win.CustomEvent ?? globalThis.CustomEvent;
      if (CustomEventClass) root.dispatchEvent(new CustomEventClass('player:place-default', { detail: typeof restoredCollapsed === 'boolean' ? { collapsed: restoredCollapsed } : undefined }));
      else {
        const EventClass = win.Event ?? globalThis.Event;
        const event = new EventClass('player:place-default');
        if (typeof restoredCollapsed === 'boolean') event.detail = { collapsed: restoredCollapsed };
        root.dispatchEvent(event);
      }
    }
  };
  const clearFixedStyles = () => {
    for (const property of ['left', 'top', 'right', 'bottom', 'width']) root.style.removeProperty?.(property);
    // Tiny test DOMs and older style shims may not expose removeProperty.
    root.style.left = '';
    root.style.top = '';
    root.style.right = '';
    root.style.bottom = '';
    root.style.width = '';
  };
  const detachAt = rect => {
    if (root.dataset.playerDetached !== 'true') {
      root.dataset.playerDetached = 'true';
      if (doc.body && root.parentNode !== doc.body) doc.body.append(root);
      root.dataset.placement = 'floating';
      root.style.width = `${rect.width}px`;
      focusHandle();
    }
    writePosition(rect.left, rect.top, rect);
  };
  const snapshot = () => ({
    detached: root.dataset.playerDetached === 'true',
    position: readPosition(),
    left: root.style.left ?? '',
    top: root.style.top ?? '',
    width: root.style.width ?? '',
    collapsed: root.dataset.collapsed === 'true'
  });
  const reset = ({ focus = true, restoreCollapsed } = {}) => {
    active = null;
    keyboardUndo = null;
    delete root.dataset.dragging;
    delete root.dataset.playerDetached;
    clearFixedStyles();
    dispatchPlacement(restoreCollapsed);
    if (focus) later(() => (root.dataset.collapsed === 'true' ? showButton : handle)?.focus?.());
  };
  const restore = previous => {
    if (!previous) return;
    delete root.dataset.dragging;
    if (!previous.detached) {
      reset({ restoreCollapsed: previous.collapsed });
      return;
    }
    root.dataset.playerDetached = 'true';
    if (doc.body && root.parentNode !== doc.body) doc.body.append(root);
    root.dataset.placement = 'floating';
    root.style.width = previous.width;
    writePosition(Number.parseFloat(previous.left) || previous.position.left, Number.parseFloat(previous.top) || previous.position.top, previous.position);
  };
  const clampPosition = () => {
    if (root.dataset.playerDetached !== 'true' || !enabled()) return;
    const rect = readPosition();
    writePosition(rect.left, rect.top, rect);
  };
  const finishPointer = ({ cancel = false } = {}) => {
    if (!active) return;
    const current = active;
    active = null;
    delete root.dataset.dragging;
    if (cancel && current.dragging) restore(current.previous);
    else if (current.dragging) {
      const rect = readPosition();
      const bounds = boundsFor(rect);
      let left = rect.left;
      let top = rect.top;
      if (left - bounds.minX <= SNAP_DISTANCE) left = bounds.minX;
      else if (bounds.maxX - left <= SNAP_DISTANCE) left = bounds.maxX;
      if (top - bounds.minY <= SNAP_DISTANCE) top = bounds.minY;
      else if (bounds.maxY - top <= SNAP_DISTANCE) top = bounds.maxY;
      writePosition(left, top, rect);
    }
    try { if (handle.hasPointerCapture?.(current.pointerId)) handle.releasePointerCapture(current.pointerId); } catch {}
  };

  handle.addEventListener('pointerdown', event => {
    if (!enabled() || event.button !== 0 || event.isPrimary === false || (event.pointerType && event.pointerType !== 'mouse')) return;
    event.preventDefault?.();
    event.stopPropagation?.();
    focusHandle();
    keyboardUndo = null;
    active = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: readPosition(),
      previous: snapshot(),
      dragging: false
    };
    try { handle.setPointerCapture?.(event.pointerId); } catch {}
  });
  handle.addEventListener('pointermove', event => {
    if (!active || event.pointerId !== active.pointerId) return;
    const deltaX = event.clientX - active.startX;
    const deltaY = event.clientY - active.startY;
    if (!active.dragging && Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD) return;
    if (!active.dragging) {
      active.dragging = true;
      active.relocating = true;
      detachAt(active.origin);
      try { handle.setPointerCapture?.(active.pointerId); } catch {}
      const relocating = active;
      (win.queueMicrotask ?? globalThis.queueMicrotask)(() => {
        if (active === relocating) relocating.relocating = false;
      });
      root.dataset.dragging = 'true';
    }
    event.preventDefault?.();
    writePosition(active.origin.left + deltaX, active.origin.top + deltaY, active.origin);
  });
  handle.addEventListener('pointerup', event => {
    if (!active || event.pointerId !== active.pointerId) return;
    event.preventDefault?.();
    event.stopPropagation?.();
    finishPointer();
  });
  handle.addEventListener('pointercancel', event => {
    if (active && event.pointerId === active.pointerId) finishPointer({ cancel: true });
  });
  handle.addEventListener('lostpointercapture', event => {
    if (active && event.pointerId === active.pointerId && (active.relocating || handle.hasPointerCapture?.(event.pointerId))) return;
    if (active && event.pointerId === active.pointerId) finishPointer({ cancel: true });
  });
  handle.addEventListener('click', event => {
    event.preventDefault?.();
    event.stopPropagation?.();
  });
  handle.addEventListener('keydown', event => {
    if (!enabled()) return;
    event.stopPropagation?.();
    if (event.key === 'Home') {
      event.preventDefault?.();
      reset();
      return;
    }
    if (event.key === 'Escape' && active) {
      event.preventDefault?.();
      finishPointer({ cancel: true });
      handle.focus?.();
      return;
    }
    if (event.key === 'Escape' && keyboardUndo) {
      event.preventDefault?.();
      const previous = keyboardUndo;
      keyboardUndo = null;
      restore(previous);
      return;
    }
    const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault?.();
    if (!keyboardUndo) keyboardUndo = snapshot();
    const rect = readPosition();
    detachAt(rect);
    const step = event.shiftKey ? KEY_STEP_LARGE : KEY_STEP;
    writePosition(rect.left + direction[0] * step, rect.top + direction[1] * step, rect);
  });
  handle.addEventListener('blur', () => { keyboardUndo = null; });
  resetButton.addEventListener('pointerdown', event => event.stopPropagation?.());
  resetButton.addEventListener('click', event => {
    event.preventDefault?.();
    event.stopPropagation?.();
    reset();
  });

  const leaveDesktop = () => {
    if (!enabled()) reset({ focus: false });
    else clampPosition();
  };
  desktop.addEventListener?.('change', leaveDesktop);
  finePointer.addEventListener?.('change', leaveDesktop);
  win.addEventListener('resize', clampPosition);
  doc.addEventListener('astro:page-load', leaveDesktop);

  const collapseButton = root.querySelector('[data-player-collapse]');
  root.addEventListener('click', event => {
    if (event.target === collapseButton || event.target === showButton) later(clampPosition);
  });

  if (root.dataset.playerDetached === 'true') leaveDesktop();
  return { reset, clampPosition, get detached() { return root.dataset.playerDetached === 'true'; } };
}
