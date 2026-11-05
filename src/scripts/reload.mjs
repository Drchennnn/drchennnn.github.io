/** Motion and navigation for the P3R presentation. No day/night or weather state is read or written. */
export function initReload(doc = document, win = window) {
  const root = doc.documentElement;
  const cleanups = [], observers = [];
  let disposed = false;
  const on = (target, type, handler, options) => {
    target?.addEventListener?.(type, handler, options);
    if (target?.removeEventListener) cleanups.push(() => target.removeEventListener(type, handler, options));
  };
  const observe = (handler, options) => {
    const observer = new win.IntersectionObserver(handler, options);
    observers.push(observer);
    return observer;
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    while (cleanups.length) cleanups.pop()();
    while (observers.length) observers.pop().disconnect?.();
    if (root.__reloadDispose === dispose) delete root.__reloadDispose;
  };
  root.__reloadDispose?.();
  root.__reloadDispose = dispose;
  try {
  const query = selector => doc.querySelector(selector);
  const reduced = win.matchMedia('(prefers-reduced-motion: reduce)');
  const mobileMedia = win.matchMedia('(max-width: 900px), (max-aspect-ratio: 1/1)');
  const get = key => { try { return win.localStorage.getItem(key); } catch { return null; } };
  const set = (key, value) => { try { win.localStorage.setItem(key, value); } catch {} };
  const later = (callback, delay) => (win.setTimeout ?? setTimeout)(() => { if (!disposed) callback(); }, delay);
  const cancel = timer => { if (timer != null) (win.clearTimeout ?? clearTimeout)(timer); };
  const motion = query('.motion-toggle'), top = query('.back-top');
  const menu = query('.menu-toggle'), nav = query('#main-nav');
  const intro = query('[data-hero-intro]'), video = query('[data-hero-video]');
  const openingLayer = query('[data-opening]');
  const heroMedia = query('.hero-media');
  let paused = get('journal-motion') === 'off';
  const wantsVideo = !win.navigator?.connection?.saveData;
  let inView = true, playVersion = 0, blocked = false, mediaFailed = false;
  let openingActive = Boolean(intro && openingLayer && root.dataset.opening === 'blue');
  let openingStarted = false, openingFinishing = false, openingVersion = 0, phaseTimer = null, introTimer = null, openingGuard = null;
  const motionAllowed = () => root.dataset.motion !== 'off';
  const shouldPlay = () => !disposed && wantsVideo && motionAllowed() && !doc.hidden && inView;
  const setOpening = phase => { if (!disposed) root.dataset.opening = phase; };
  const ensureSource = media => {
    if (!media || media.getAttribute('src')) return;
    const source = mobileMedia.matches && media.dataset.mobileSrc ? media.dataset.mobileSrc : media.dataset.src;
    if (source) media.src = source;
  };
  const stopMedia = media => {
    if (!media) return;
    media.pause();
    media.classList.remove('is-playing');
  };
  const clearOpeningTimers = () => {
    cancel(phaseTimer); cancel(introTimer); cancel(openingGuard);
    phaseTimer = introTimer = openingGuard = null;
  };
  cleanups.push(() => {
    ++playVersion;
    ++openingVersion;
    clearOpeningTimers();
    openingActive = false;
    openingStarted = false;
    openingFinishing = false;
    stopMedia(intro);
    stopMedia(video);
  });

  async function playLoop({ completeOpening = false, openingToken = openingVersion } = {}) {
    if (!video) {
      if (completeOpening && openingToken === openingVersion) setOpening('ready');
      return;
    }
    const version = ++playVersion;
    if (!shouldPlay()) {
      stopMedia(video);
      if (completeOpening && openingToken === openingVersion) setOpening('ready');
      return;
    }
    if (blocked || mediaFailed) {
      if (completeOpening && openingToken === openingVersion) setOpening('ready');
      return;
    }
    ensureSource(video);
    video.muted = true;
    let timeout, timedOut = false;
    const attempt = Promise.resolve().then(() => video.play()).then(() => ({ ok: true }), () => ({ ok: false }));
    const result = await Promise.race([
      attempt,
      new Promise(resolve => { timeout = later(() => { timedOut = true; resolve({ ok: false, timeout: true }); }, 1800); })
    ]);
    attempt.then(result => {
      if (timedOut && result.ok && (version === playVersion || !shouldPlay())) stopMedia(video);
    });
    cancel(timeout);
    if (version !== playVersion) {
      if (!shouldPlay()) stopMedia(video);
      return;
    }
    if (!result.ok) {
      blocked = true;
      stopMedia(video);
    } else if (shouldPlay()) {
      blocked = false;
      video.classList.add('is-playing');
    } else {
      stopMedia(video);
    }
    if (completeOpening && openingToken === openingVersion) setOpening('ready');
  }

  async function finishOpening({ playLoopAfter = true, holdIntro = false } = {}) {
    if (holdIntro && openingFinishing) return;
    const token = ++openingVersion;
    clearOpeningTimers();
    if (!holdIntro) {
      openingActive = false;
      openingStarted = false;
      openingFinishing = false;
      stopMedia(intro);
      setOpening('ready');
      if (playLoopAfter && shouldPlay()) await playLoop();
      else stopMedia(video);
      return;
    }
    openingFinishing = true;
    if (playLoopAfter && shouldPlay()) await playLoop({ completeOpening: true, openingToken: token });
    else if (token === openingVersion) setOpening('ready');
    if (token === openingVersion) {
      openingActive = false;
      openingStarted = false;
      openingFinishing = false;
      stopMedia(intro);
    }
  }

  async function playIntro() {
    if (!openingActive || !shouldPlay()) { finishOpening({ playLoopAfter: false }); return; }
    const token = ++openingVersion;
    intro.muted = true;
    let timeout, timedOut = false;
    const attempt = Promise.resolve().then(() => intro.play()).then(() => ({ ok: true }), () => ({ ok: false }));
    const result = await Promise.race([
      attempt,
      new Promise(resolve => { timeout = later(() => { timedOut = true; resolve({ ok: false, timeout: true }); }, 1800); })
    ]);
    attempt.then(result => { if (timedOut && result.ok) stopMedia(intro); });
    cancel(timeout);
    if (token !== openingVersion || !openingActive) {
      stopMedia(intro);
      return;
    }
    if (!result.ok || !shouldPlay()) {
      finishOpening({ playLoopAfter: shouldPlay() });
      return;
    }
    setOpening('fall');
    intro.classList.add('is-playing');
    introTimer = later(() => {
      if (token === openingVersion && openingActive) finishOpening({ playLoopAfter: shouldPlay(), holdIntro: true });
    }, 7500);
  }

  function startOpening() {
    if (!openingActive || openingStarted) return;
    if (!shouldPlay()) { finishOpening({ playLoopAfter: false }); return; }
    openingStarted = true;
    try {
      setOpening('blue');
      ensureSource(intro);
      ensureSource(video);
      intro?.load?.();
      video?.load?.();
      const token = openingVersion;
      phaseTimer = later(() => {
        if (!openingActive || token !== openingVersion) return;
        setOpening('quote');
        phaseTimer = later(() => {
          if (openingActive && token === openingVersion) playIntro();
        }, 2500);
      }, 300);
      openingGuard = later(() => {
        if (openingActive && root.dataset.opening !== 'ready') finishOpening({ playLoopAfter: false });
      }, 15000);
      root.dataset.openingManaged = 'true';
    } catch (error) {
      root.dataset.openingError = 'media-initialization';
      win.console?.warn?.('P3R opening media could not initialize; using the poster.', error);
      clearOpeningTimers();
      openingActive = false;
      openingStarted = false;
      stopMedia(intro);
      stopMedia(video);
      delete root.dataset.openingManaged;
      setOpening('ready');
    }
  }

  function syncVideo() {
    if (openingActive) {
      if (shouldPlay()) startOpening();
      else finishOpening({ playLoopAfter: false });
      return;
    }
    playLoop();
  }
  function syncMotion() {
    root.dataset.motion = paused || reduced.matches ? 'off' : 'on';
    if (motion) {
      motion.setAttribute('aria-pressed', String(!motionAllowed())); motion.disabled = reduced.matches;
      motion.textContent = reduced.matches ? '已遵循系统减动' : paused ? '开启动效' : '暂停动效';
    }
    syncVideo();
  }
  on(motion, 'click', () => { paused = !paused; set('journal-motion', paused ? 'off' : 'on'); syncMotion(); });
  on(reduced, 'change', syncMotion);
  const retryAfterInteraction = () => { if (blocked && !mediaFailed && !openingActive) { blocked = false; playLoop(); } };
  on(doc, 'click', retryAfterInteraction);
  on(doc, 'keydown', retryAfterInteraction);
  on(intro, 'ended', () => { if (openingActive && root.dataset.opening === 'fall') finishOpening({ holdIntro: true }); });
  on(intro, 'error', () => { if (openingActive) finishOpening({ playLoopAfter: shouldPlay() }); });
  on(video, 'error', () => {
    ++playVersion;
    mediaFailed = true;
    stopMedia(video);
    if (openingActive) {
      if (openingFinishing) finishOpening({ playLoopAfter: false });
      return;
    }
    if (root.dataset.opening && root.dataset.opening !== 'ready') setOpening('ready');
  });
  on(doc, 'visibilitychange', () => {
    if (doc.hidden && openingActive) finishOpening({ playLoopAfter: false });
    else syncVideo();
  });
  on(win, 'pagehide', () => {
    ++playVersion;
    ++openingVersion;
    clearOpeningTimers();
    openingFinishing = false;
    stopMedia(intro);
    stopMedia(video);
    if (openingActive) { openingActive = false; setOpening('ready'); }
  });
  on(win, 'pageshow', syncVideo);
  const skipOpening = () => { if (openingActive) finishOpening({ playLoopAfter: shouldPlay() }); };
  on(doc, 'focusin', skipOpening);
  root.dataset.navReady = 'true';
  const closeMenu = () => { nav?.classList.remove('is-open'); menu?.setAttribute('aria-expanded', 'false'); };
  on(menu, 'click', () => { const open = menu.getAttribute('aria-expanded') !== 'true'; menu.setAttribute('aria-expanded', String(open)); nav?.classList.toggle('is-open', open); });
  on(doc, 'keydown', event => {
    if (event.key === 'Escape') {
      skipOpening();
      if (menu?.getAttribute('aria-expanded') === 'true') { closeMenu(); menu.focus(); }
    }
  });
  on(doc, 'click', event => { if(!nav?.contains(event.target) && !menu?.contains(event.target)) closeMenu(); });
  on(nav, 'click', event => { if(event.target.closest?.('a')) closeMenu(); });
  const gallery = query('.chapter-gallery');
  const step = direction => gallery?.scrollBy({ left: direction * ((gallery.querySelector('.chapter-card')?.offsetWidth ?? 290) + 25), behavior: motionAllowed() ? 'smooth' : 'instant' });
  on(query('[data-gallery-prev]'), 'click', () => step(-1));
  on(query('[data-gallery-next]'), 'click', () => step(1));
  on(gallery, 'keydown', event => { if(event.target === gallery && ['ArrowLeft','ArrowRight'].includes(event.key)) { event.preventDefault(); step(event.key === 'ArrowRight' ? 1 : -1); } });
  if ('IntersectionObserver' in win) {
    if (heroMedia) observe(entries => {
      inView = entries[0].isIntersecting;
      if (!inView && openingActive) finishOpening({ playLoopAfter: false });
      else syncVideo();
    }, { threshold: .05 }).observe(heroMedia);
    const reveals = [...doc.querySelectorAll('[data-reveal]')];
    if(!paused && !reduced.matches) {
      root.dataset.revealReady = 'true';
      const observer = observe(entries => { for(const entry of entries) if(entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); } }, { threshold: .08 });
      reveals.forEach(el => observer.observe(el));
    }
    const section = query('.chapter-section'), cards = [...doc.querySelectorAll('[data-chapter]')], ratios = new Map();
    const activate = card => { if(section) section.dataset.activeChapter = card.dataset.chapter; cards.forEach(el => el.classList.toggle('is-active', el === card)); };
    const observer = observe(entries => { entries.forEach(entry => ratios.set(entry.target, entry.intersectionRatio)); const visible = [...ratios].sort((a,b) => b[1]-a[1])[0]; if(visible && visible[1] > 0) activate(visible[0]); }, { root: gallery, threshold: [0,.25,.5,.75,1] });
    cards.forEach(card => { observer.observe(card); on(card, 'focus', () => activate(card)); on(card, 'pointerenter', () => activate(card)); });
  }
  const syncTop = () => { if(top) top.hidden = win.scrollY < 450; };
  on(win, 'scroll', () => { if (win.scrollY > 80) skipOpening(); syncTop(); }, { passive: true });
  on(top, 'click', () => win.scrollTo({ top: 0, behavior: motionAllowed() ? 'smooth' : 'instant' }));
  syncMotion(); syncTop();
  return dispose;
  } catch (error) {
    dispose();
    try {
      delete root.dataset.openingManaged;
      delete root.dataset.revealReady;
      if (root.dataset.opening) root.dataset.opening = 'ready';
    } catch {}
    throw error;
  }
}
