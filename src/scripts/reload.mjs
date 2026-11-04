/** Motion and navigation for the P3R presentation. No day/night or weather state is read or written. */
export function initReload(doc = document, win = window) {
  const root = doc.documentElement;
  const query = selector => doc.querySelector(selector);
  const reduced = win.matchMedia('(prefers-reduced-motion: reduce)');
  const get = key => { try { return win.localStorage.getItem(key); } catch { return null; } };
  const set = (key, value) => { try { win.localStorage.setItem(key, value); } catch {} };
  const motion = query('.motion-toggle'), top = query('.back-top');
  const menu = query('.menu-toggle'), nav = query('#main-nav');
  const video = query('[data-hero-video]');
  let paused = get('journal-motion') === 'off';
  // Each visit defaults to video; the global accessibility/motion preference still wins.
  let wantsVideo = !win.navigator?.connection?.saveData;
  let inView = true, playVersion = 0, blocked = false, mediaFailed = false;
  const motionAllowed = () => root.dataset.motion !== 'off';
  const shouldPlay = () => wantsVideo && motionAllowed() && !doc.hidden && inView;
  async function syncVideo() {
    if (!video) return;
    const version = ++playVersion;
    if (!shouldPlay()) {
      video.pause(); video.classList.remove('is-playing'); return;
    }
    if (blocked || mediaFailed) return;
    if (!video.getAttribute('src')) video.src = video.dataset.src;
    video.muted = true;
    try {
      await video.play();
      if (version !== playVersion) return;
      if (shouldPlay()) { blocked = false; video.classList.add('is-playing'); }
      else { video.pause(); video.classList.remove('is-playing'); }
    } catch {
      if (version !== playVersion) return;
      blocked = true; video.classList.remove('is-playing');
    }
  }
  function syncMotion() {
    root.dataset.motion = paused || reduced.matches ? 'off' : 'on';
    if (motion) {
      motion.setAttribute('aria-pressed', String(!motionAllowed())); motion.disabled = reduced.matches;
      motion.textContent = reduced.matches ? '已遵循系统减动' : paused ? '开启动效' : '暂停动效';
    }
    syncVideo();
  }
  motion?.addEventListener('click', () => { paused = !paused; set('journal-motion', paused ? 'off' : 'on'); syncMotion(); });
  reduced.addEventListener('change', syncMotion);
  // Some browsers only permit playback after interaction. Retry on click (including touch activation), quietly without a dedicated play button.
  const retryAfterInteraction = () => { if(blocked && !mediaFailed) { blocked = false; syncVideo(); } };
  doc.addEventListener('click', retryAfterInteraction);
  doc.addEventListener('keydown', retryAfterInteraction);
  video?.addEventListener('error', () => { ++playVersion; mediaFailed = true; video.pause(); video.classList.remove('is-playing'); });
  doc.addEventListener('visibilitychange', syncVideo);
  win.addEventListener('pagehide', () => { ++playVersion; video?.pause(); });
  win.addEventListener('pageshow', syncVideo);
  root.dataset.navReady = 'true';
  const closeMenu = () => { nav?.classList.remove('is-open'); menu?.setAttribute('aria-expanded', 'false'); };
  menu?.addEventListener('click', () => { const open = menu.getAttribute('aria-expanded') !== 'true'; menu.setAttribute('aria-expanded', String(open)); nav?.classList.toggle('is-open', open); });
  doc.addEventListener('keydown', event => { if(event.key === 'Escape' && menu?.getAttribute('aria-expanded') === 'true') { closeMenu(); menu.focus(); } });
  doc.addEventListener('click', event => { if(!nav?.contains(event.target) && !menu?.contains(event.target)) closeMenu(); });
  nav?.addEventListener('click', event => { if(event.target.closest?.('a')) closeMenu(); });
  const gallery = query('.chapter-gallery');
  const step = direction => gallery?.scrollBy({ left: direction * ((gallery.querySelector('.chapter-card')?.offsetWidth ?? 290) + 25), behavior: motionAllowed() ? 'smooth' : 'instant' });
  query('[data-gallery-prev]')?.addEventListener('click', () => step(-1));
  query('[data-gallery-next]')?.addEventListener('click', () => step(1));
  gallery?.addEventListener('keydown', event => { if(event.target === gallery && ['ArrowLeft','ArrowRight'].includes(event.key)) { event.preventDefault(); step(event.key === 'ArrowRight' ? 1 : -1); } });
  if ('IntersectionObserver' in win) {
    if(video) new win.IntersectionObserver(entries => { inView = entries[0].isIntersecting; syncVideo(); }, { threshold: .05 }).observe(video);
    const reveals = [...doc.querySelectorAll('[data-reveal]')];
    if(!paused && !reduced.matches) {
      root.dataset.revealReady = 'true';
      const observer = new win.IntersectionObserver(entries => { for(const entry of entries) if(entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); } }, { threshold: .08 });
      reveals.forEach(el => observer.observe(el));
    }
    const section = query('.chapter-section'), cards = [...doc.querySelectorAll('[data-chapter]')], ratios = new Map();
    const activate = card => { if(section) section.dataset.activeChapter = card.dataset.chapter; cards.forEach(el => el.classList.toggle('is-active', el === card)); };
    const observer = new win.IntersectionObserver(entries => { entries.forEach(entry => ratios.set(entry.target, entry.intersectionRatio)); const visible = [...ratios].sort((a,b) => b[1]-a[1])[0]; if(visible && visible[1] > 0) activate(visible[0]); }, { root: gallery, threshold: [0,.25,.5,.75,1] });
    cards.forEach(card => { observer.observe(card); card.addEventListener('focus', () => activate(card)); card.addEventListener('pointerenter', () => activate(card)); });
  }
  const syncTop = () => { if(top) top.hidden = win.scrollY < 450; };
  win.addEventListener('scroll', syncTop, { passive: true });
  top?.addEventListener('click', () => win.scrollTo({ top: 0, behavior: motionAllowed() ? 'smooth' : 'instant' }));
  syncMotion(); syncTop();
}
