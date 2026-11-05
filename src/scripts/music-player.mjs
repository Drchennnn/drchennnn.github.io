import { findMusicTrack, nextMusicTrack, previousMusicTrack } from './music-tracks.mjs';

const VOLUME_KEY = 'p3r-player-volume';
const COLLAPSED_KEY = 'p3r-player-collapsed';
const TRACK_KEY = 'p3r-player-track';
const DEFAULT_VOLUME = .35;

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const formatTime = seconds => {
  const whole = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(whole / 60).toString().padStart(2, '0')}:${(whole % 60).toString().padStart(2, '0')}`;
};

/** A Web Audio loop player with optional, policy-aware autoplay. */
export function initMusicPlayer(doc = document, win = window) {
  const root = doc.querySelector('[data-music-player]');
  if (!root || root.dataset.playerInitialized === 'true') return null;
  root.dataset.playerInitialized = 'true';

  const query = selector => root.querySelector(selector);
  const playButton = query('[data-player-play]');
  const restartButton = query('[data-player-restart]');
  const infoButton = query('[data-player-info]');
  const previousButton = query('[data-player-prev]');
  const nextButton = query('[data-player-next]');
  const volumeDown = query('[data-player-volume-down]');
  const volumeUp = query('[data-player-volume-up]');
  const volumeInput = query('[data-player-volume]');
  const collapseButton = query('[data-player-collapse]');
  const showButton = query('[data-player-show]');
  const title = query('[data-player-title]');
  const mode = query('[data-player-mode]');
  const elapsed = query('[data-player-elapsed]');
  const status = query('[data-player-status]');
  const bars = [...root.querySelectorAll('[data-player-bar]')];
  const reduced = win.matchMedia?.('(prefers-reduced-motion: reduce)') ?? { matches: false, addEventListener() {} };
  const mobile = win.matchMedia?.('(max-width: 700px)') ?? { matches: false };
  const later = (handler, delay) => (win.setTimeout ?? setTimeout)(handler, delay);
  const cancelLater = timer => (win.clearTimeout ?? clearTimeout)(timer);
  const get = key => { try { return win.localStorage?.getItem(key); } catch { return null; } };
  const set = (key, value) => { try { win.localStorage?.setItem(key, value); } catch {} };

  const storedVolume = Number.parseFloat(get(VOLUME_KEY));
  const markupVolume = Number.parseFloat(volumeInput?.value);
  let volume = Number.isFinite(storedVolume) ? clamp(storedVolume, 0, 1) : Number.isFinite(markupVolume) ? clamp(markupVolume, 0, 1) : DEFAULT_VOLUME;
  const storedCollapsed = get(COLLAPSED_KEY);
  let preferredCollapsed = storedCollapsed == null ? Boolean(mobile.matches) : storedCollapsed === 'true';
  let track = findMusicTrack(get(TRACK_KEY));
  root.dataset.state = 'idle';
  if (volumeInput) volumeInput.value = String(volume);
  if (elapsed) elapsed.textContent = '00:00';

  let context = null;
  let gain = null;
  let analyser = null;
  let frequencyData = null;
  let buffer = null;
  let bufferTrackId = null;
  let loadPromise = null;
  let loadVersion = 0;
  let source = null;
  let playing = false;
  let desiredPlaying = false;
  let offset = 0;
  let loopStart = 0;
  let startedAt = 0;
  let timer = null;
  let shownSecond = -1;
  let showArtist = false;
  let disposed = false;
  let sourceVersion = 0;
  let commandVersion = 0;
  let staticBarsApplied = false;
  let autoplayInFlight = false;
  let autoplayCancelled = false;
  let gestureArmed = false;

  const setStatus = message => { if (status) status.textContent = message; };
  const setTitle = () => {
    if (title) title.textContent = showArtist ? track.artist : track.title;
    infoButton?.setAttribute('aria-pressed', String(showArtist));
    if (mode) mode.textContent = track.mode;
    root.dataset.track = track.id;
    const previous = previousMusicTrack(track.id);
    const next = nextMusicTrack(track.id);
    previousButton?.setAttribute('aria-label', '上一首');
    nextButton?.setAttribute('aria-label', '下一首');
    previousButton?.setAttribute('title', `上一首：${previous.id === 'instrumental' ? 'REMI 伴奏版' : '原唱版'}`);
    nextButton?.setAttribute('title', `下一首：${next.id === 'instrumental' ? 'REMI 伴奏版' : '原唱版'}`);
  };
  const setPlayLabel = () => {
    if (!playButton) return;
    const active = playing || desiredPlaying;
    playButton.setAttribute('aria-pressed', String(active));
    playButton.setAttribute('aria-label', `${active ? '暂停' : '播放'} ${track.title}`);
  };
  const syncCollapseButton = () => {
    const collapsed = root.dataset.collapsed === 'true';
    collapseButton?.setAttribute('aria-label', '隐藏音乐播放器');
    collapseButton?.setAttribute('aria-expanded', String(!collapsed));
    showButton?.setAttribute('aria-expanded', String(!collapsed));
    showButton?.setAttribute('aria-label', collapsed ? '显示音乐播放器' : '隐藏音乐播放器');
  };
  const setCollapsed = (collapsed, { save = true } = {}) => {
    root.dataset.collapsed = String(collapsed);
    syncCollapseButton();
    if (save) {
      preferredCollapsed = collapsed;
      set(COLLAPSED_KEY, String(collapsed));
    }
    if (playing) refreshMeters();
  };
  const placePlayer = event => {
    const restoredCollapsed = typeof event?.detail?.collapsed === 'boolean' ? event.detail.collapsed : null;
    if (root.dataset.playerDetached === 'true') {
      if (doc.body && root.parentNode !== doc.body) doc.body.append(root);
      root.dataset.placement = 'floating';
      return;
    }
    const dock = doc.querySelector('[data-player-dock]');
    if (dock) {
      if (root.parentNode !== dock) dock.append(root);
      root.dataset.placement = 'docked';
      setCollapsed(restoredCollapsed ?? preferredCollapsed, { save: false });
    } else {
      if (doc.body && root.parentNode !== doc.body) doc.body.append(root);
      root.dataset.placement = 'floating';
      setCollapsed(restoredCollapsed ?? true, { save: false });
    }
  };
  const setStaticBars = () => {
    if (staticBarsApplied) return;
    bars.forEach((bar, index) => bar.style.setProperty('--bar-level', String(.18 + (index % 2) * .07)));
    staticBarsApplied = true;
  };
  const advancePosition = (position, seconds) => {
    if (!buffer?.duration) return position;
    const end = buffer.duration;
    const span = end - loopStart;
    if (span <= 0) return 0;
    const remainingBeforeLoop = Math.max(0, end - position);
    if (seconds < remainingBeforeLoop) return position + seconds;
    return loopStart + ((seconds - remainingBeforeLoop) % span + span) % span;
  };
  const currentOffset = () => {
    if (!playing || !buffer) return offset;
    return advancePosition(offset, Math.max(0, context.currentTime - startedAt));
  };
  const updateElapsed = () => {
    const current = currentOffset();
    const second = Math.floor(current);
    if (second !== shownSecond && elapsed) {
      shownSecond = second;
      elapsed.textContent = formatTime(current);
    }
  };
  const animationsAllowed = () => !doc.hidden && !reduced.matches && doc.documentElement?.dataset.motion !== 'off';
  const stopTimer = () => { if (timer != null) cancelLater(timer); timer = null; };
  const updateMeters = () => {
    timer = null;
    if (!playing || disposed) return;
    updateElapsed();
    if (!animationsAllowed() || root.dataset.collapsed === 'true' || !analyser || !frequencyData) {
      setStaticBars();
      timer = later(updateMeters, 1000);
    } else {
      staticBarsApplied = false;
      analyser.getByteFrequencyData(frequencyData);
      bars.forEach((bar, index) => {
        const start = Math.floor(index * frequencyData.length / bars.length);
        const end = Math.max(start + 1, Math.floor((index + 1) * frequencyData.length / bars.length));
        let total = 0;
        for (let i = start; i < end; i++) total += frequencyData[i];
        bar.style.setProperty('--bar-level', String(clamp(total / (end - start) / 255, .12, 1)));
      });
      timer = later(updateMeters, 100);
    }
  };
  const startTimer = () => { stopTimer(); shownSecond = -1; updateMeters(); };
  const refreshMeters = () => { if (playing) startTimer(); };

  const applyVolume = value => {
    volume = Math.round(clamp(Number(value) || 0, 0, 1) * 20) / 20;
    if (volumeInput) volumeInput.value = String(volume);
    if (gain) {
      if (gain.gain?.setValueAtTime) gain.gain.setValueAtTime(volume, context.currentTime);
      else if (gain.gain) gain.gain.value = volume;
    }
    set(VOLUME_KEY, String(volume));
  };

  const stopSource = ({ preserve = true } = {}) => {
    if (playing && preserve) offset = currentOffset();
    playing = false;
    sourceVersion++;
    if (source) {
      try { source.stop(); } catch {}
      try { source.disconnect(); } catch {}
      source = null;
    }
    stopTimer();
    updateElapsed();
    setStaticBars();
    setPlayLabel();
  };

  const resumeContext = async timeout => {
    if (context.state === 'running') return;
    let timeoutTimer;
    let resume;
    try { resume = Promise.resolve(context.resume()); }
    catch { throw new Error('audio-context-blocked'); }
    try {
      if (timeout) await Promise.race([
        resume,
        new Promise((_, reject) => { timeoutTimer = later(() => reject(new Error('audio-context-timeout')), timeout); })
      ]);
      else await resume;
    } catch (error) {
      if (error?.message === 'audio-context-timeout') throw error;
      throw new Error('audio-context-blocked');
    } finally {
      if (timeoutTimer != null) cancelLater(timeoutTimer);
    }
    if (context.state !== 'running') throw new Error('audio-context-blocked');
  };

  const ensureAudio = async ({ command, resumeTimeout = 0 } = {}) => {
    const requestedTrack = track;
    if (buffer && bufferTrackId === requestedTrack.id) {
      await resumeContext(resumeTimeout);
      return buffer;
    }
    if (loadPromise) return loadPromise;
    const AudioContext = win.AudioContext ?? win.webkitAudioContext;
    if (!AudioContext) throw new Error('audio-context-unavailable');
    if (!context) {
      context = new AudioContext();
      gain = context.createGain();
      analyser = context.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = .72;
      frequencyData = new Uint8Array(analyser.frequencyBinCount);
      gain.connect(analyser);
      analyser.connect(context.destination);
      applyVolume(volume);
      context.addEventListener?.('statechange', () => {
        if (!disposed && playing && context.state !== 'running') {
          desiredPlaying = false;
          stopSource();
          root.dataset.state = 'paused';
          setStatus('播放已暂停，点击继续');
        }
      });
    }
    await resumeContext(resumeTimeout);
    if (command !== commandVersion || !desiredPlaying || disposed) throw new Error('audio-start-cancelled');
    root.dataset.state = 'loading';
    setStatus('正在载入音乐…');
    setPlayLabel();
    const version = ++loadVersion;
    const pending = Promise.resolve()
      .then(() => win.fetch(requestedTrack.src))
      .then(response => {
        if (!response?.ok) throw new Error(`audio-request-${response?.status ?? 'failed'}`);
        return response.arrayBuffer();
      })
      .then(data => context.decodeAudioData(data))
      .then(decoded => {
        if (!decoded?.duration) throw new Error('audio-decode-empty');
        if (version !== loadVersion || requestedTrack.id !== track.id) throw new Error('audio-start-cancelled');
        buffer = decoded;
        bufferTrackId = requestedTrack.id;
        const requestedLoopStart = Number(requestedTrack.loopStart);
        const finalSampleStart = Math.max(0, decoded.duration - 1 / (decoded.sampleRate || 44100));
        loopStart = clamp(Number.isFinite(requestedLoopStart) ? requestedLoopStart : 0, 0, finalSampleStart);
        return decoded;
      })
      .finally(() => { if (loadPromise === pending) loadPromise = null; });
    loadPromise = pending;
    return loadPromise;
  };

  const begin = async ({ restart = false, autoplay = false } = {}) => {
    const command = ++commandVersion;
    if (autoplay) {
      autoplayInFlight = true;
      gestureArmed = true;
    }
    desiredPlaying = true;
    if (restart) offset = 0;
    if (autoplay) {
      root.dataset.state = 'loading';
      setStatus('正在尝试播放音乐…');
    }
    setPlayLabel();
    try {
      const decoded = await ensureAudio({ command, resumeTimeout: autoplay ? 800 : 0 });
      if (command !== commandVersion || !desiredPlaying || disposed) {
        if (command !== commandVersion) return;
        root.dataset.state = 'paused';
        setStatus('已暂停');
        setPlayLabel();
        return;
      }
      if (context.state !== 'running') {
        desiredPlaying = false;
        root.dataset.state = 'paused';
        setStatus('浏览器已暂停音频，点击继续');
        setPlayLabel();
        return;
      }
      stopSource({ preserve: !restart });
      if (restart) offset = 0;
      const next = context.createBufferSource();
      const version = ++sourceVersion;
      next.buffer = decoded;
      next.loop = true;
      next.loopStart = loopStart;
      next.loopEnd = decoded.duration;
      next.connect(gain);
      source = next;
      startedAt = context.currentTime;
      next.onended = () => { if (version === sourceVersion && playing) stopSource(); };
      next.start(0, offset % decoded.duration);
      playing = true;
      if (autoplay) {
        autoplayInFlight = false;
        gestureArmed = false;
      }
      root.dataset.state = 'playing';
      setStatus(`正在播放 ${track.title}`);
      setPlayLabel();
      startTimer();
    } catch (error) {
      if (disposed || command !== commandVersion) return;
      if (autoplay) {
        autoplayInFlight = false;
        gestureArmed = false;
      }
      desiredPlaying = false;
      stopSource();
      if (autoplay && !autoplayCancelled && ['audio-context-blocked', 'audio-context-timeout'].includes(error?.message)) {
        gestureArmed = true;
        root.dataset.state = 'idle';
        setStatus('点击或按键开启音乐');
        setPlayLabel();
        return;
      }
      root.dataset.state = 'error';
      setStatus(error?.message === 'audio-context-unavailable' ? '此浏览器不支持网页音频' : ['audio-context-blocked', 'audio-context-timeout'].includes(error?.message) ? '浏览器阻止了播放，请再次点击' : '音乐载入失败，点击重试');
    }
  };

  const pause = () => {
    autoplayCancelled = true;
    autoplayInFlight = false;
    gestureArmed = false;
    commandVersion++;
    desiredPlaying = false;
    stopSource();
    root.dataset.state = 'paused';
    setStatus('已暂停');
  };
  const selectTrack = next => {
    if (!next || next.id === track.id) return;
    const resumeAfterSwitch = playing || desiredPlaying;
    autoplayCancelled = true;
    autoplayInFlight = false;
    gestureArmed = false;
    commandVersion++;
    loadVersion++;
    loadPromise = null;
    stopSource({ preserve: false });
    buffer = null;
    bufferTrackId = null;
    offset = 0;
    shownSecond = -1;
    track = next;
    set(TRACK_KEY, track.id);
    showArtist = false;
    setTitle();
    updateElapsed();
    if (resumeAfterSwitch) begin({ restart: true });
    else {
      root.dataset.state = 'paused';
      setStatus(`已选择 ${track.title}`);
      setPlayLabel();
    }
  };
  playButton?.addEventListener('click', () => {
    if (desiredPlaying || playing) pause();
    else {
      autoplayCancelled = true;
      gestureArmed = false;
      begin();
    }
  });
  restartButton?.addEventListener('click', () => {
    autoplayCancelled = true;
    autoplayInFlight = false;
    gestureArmed = false;
    commandVersion++;
    stopSource({ preserve: false });
    offset = 0;
    shownSecond = -1;
    updateElapsed();
    begin({ restart: true });
  });
  infoButton?.addEventListener('click', () => { showArtist = !showArtist; setTitle(); });
  previousButton?.addEventListener('click', () => selectTrack(previousMusicTrack(track.id)));
  nextButton?.addEventListener('click', () => selectTrack(nextMusicTrack(track.id)));
  volumeDown?.addEventListener('click', () => applyVolume(volume - .05));
  volumeUp?.addEventListener('click', () => applyVolume(volume + .05));
  volumeInput?.addEventListener('input', event => applyVolume(event.target.value));
  collapseButton?.addEventListener('click', () => {
    setCollapsed(true);
    showButton?.focus?.();
  });
  showButton?.addEventListener('click', () => {
    setCollapsed(false);
    playButton?.focus?.();
  });
  const isPlaybackControl = target => [playButton, restartButton, previousButton, nextButton].some(control => control && (control === target || control.contains?.(target)));
  const activateFromGesture = event => {
    if (!gestureArmed || autoplayCancelled || disposed || playing || isPlaybackControl(event.target)) return;
    if (desiredPlaying && !autoplayInFlight) return;
    gestureArmed = false;
    if (autoplayInFlight) {
      commandVersion++;
      autoplayInFlight = false;
      desiredPlaying = false;
    }
    begin({ restart: true });
  };
  doc.addEventListener('pointerdown', activateFromGesture);
  doc.addEventListener('keydown', activateFromGesture);
  doc.addEventListener('click', activateFromGesture);
  reduced.addEventListener?.('change', refreshMeters);
  doc.addEventListener('visibilitychange', refreshMeters);
  doc.addEventListener('astro:page-load', placePlayer);
  root.addEventListener('player:place-default', placePlayer);
  win.addEventListener('pagehide', event => {
    disposed = !event.persisted;
    autoplayCancelled = true;
    autoplayInFlight = false;
    gestureArmed = false;
    commandVersion++;
    desiredPlaying = false;
    stopSource();
    root.dataset.state = 'paused';
    setStatus('已暂停');
    if (!event.persisted) context?.close?.();
  });

  setTitle();
  setPlayLabel();
  setStaticBars();
  setStatus('点击播放音乐');
  placePlayer();
  if (root.dataset.autoplay === 'true') begin({ restart: true, autoplay: true });
  return { get state() { return root.dataset.state; } };
}
