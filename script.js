const TOTAL_STAGES = 5;
const ROUND_SECONDS = 300;
const PARTICLE_COUNT = 38;
const NOISE_AMPLITUDE = 0.18;
const MINUTE_BEEP_THRESHOLDS = [240, 180, 120, 60];
const WAKE_RETRY_MS = 15000;
const FX_INIT_RETRIES = 2;
const FX_RETRY_BACKOFF_MS = 900;
const AMBIENT_TRACKS = [
  './assets/ambient/track-1.mp3',
  './assets/ambient/track-2.mp3',
  './assets/ambient/track-3.mp3',
  './assets/ambient/track-4.mp3',
];
const PARTICLE_ENGINE_URLS = [
  'https://cdn.jsdelivr.net/npm/@tsparticles/engine@3/+esm',
  'https://unpkg.com/@tsparticles/engine@3/+esm',
];
const PARTICLE_FIRE_PRESET_URLS = [
  'https://cdn.jsdelivr.net/npm/@tsparticles/preset-fire@3/+esm',
  'https://unpkg.com/@tsparticles/preset-fire@3/+esm',
];

const timerText = document.getElementById('timerText');
const playPauseButton = document.getElementById('playPauseButton');
const resetButton = document.getElementById('resetButton');
const nextButton = document.getElementById('nextButton');
const backButton = document.getElementById('backButton');
const stageBadge = document.getElementById('stageBadge');
const cardBadge = document.getElementById('cardBadge');
const progressDots = document.getElementById('progressDots');
const menuButton = document.getElementById('menuButton');
const settingsPanel = document.getElementById('settingsPanel');
const musicToggle = document.getElementById('musicToggle');
const beepToggle = document.getElementById('beepToggle');
const wakeToggle = document.getElementById('wakeToggle');
const modeToggle = document.getElementById('modeToggle');
const graphicsToggle = document.getElementById('graphicsToggle');

let stage = 1;
let running = false;
let startTimestamp = null;
let elapsedBeforePause = 0;
let frameId = null;
let wakeLock = null;
let minuteCue = null;
let lastUrgencyBeep = null;
let flashState = false;
let previousRemaining = ROUND_SECONDS;

let audioCtx;
let masterGain;
let beepBus;
let compressor;
let audioUnlockPrimed = false;
let ambiencePlayer = null;
let ambienceStarted = false;
let lastTrackIndex = -1;
let wakeRetryTimer = null;
let fxContainer = null;
let fallbackParticlesActive = false;
let fallbackFrameId = null;

const particleCanvas = document.getElementById('fallbackParticles');
const pctx = particleCanvas.getContext('2d');
let particles = [];

async function init() {
  createDots();
  render(ROUND_SECONDS, true);
  wireEvents();
  initializeWakeLockDefaults();
  setTheme(true);
  setGraphics(true);
  await initializeVisualEffects();
}

function createDots() {
  progressDots.innerHTML = '';
  for (let i = 1; i <= TOTAL_STAGES; i += 1) {
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.dataset.stage = String(i);
    progressDots.appendChild(dot);
  }
}

function wireEvents() {
  playPauseButton.addEventListener('click', toggleTimer);
  resetButton.addEventListener('click', () => resetStage(true));
  nextButton.addEventListener('click', () => jumpStage(1));
  backButton.addEventListener('click', () => jumpStage(-1));

  menuButton.addEventListener('click', () => {
    const open = settingsPanel.classList.toggle('open');
    menuButton.setAttribute('aria-expanded', String(open));
  });

  musicToggle.addEventListener('change', () => {
    if (musicToggle.checked) startAmbience();
    else stopAmbience();
  });

  beepToggle.addEventListener('change', () => {
    ensureAudio();
    unlockAudioContext();
  });

  wakeToggle.addEventListener('change', async () => {
    if (wakeToggle.checked) await requestWakeLock();
    else releaseWakeLock();
  });

  modeToggle.addEventListener('change', () => setTheme(modeToggle.checked));
  graphicsToggle.addEventListener('change', () => setGraphics(graphicsToggle.checked));

  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') {
      await maybeRequestWakeLock();
    }
  });

  window.addEventListener('focus', maybeRequestWakeLock);
  window.addEventListener('pageshow', maybeRequestWakeLock);

  const unlockOnce = () => {
    unlockAudioContext();
    document.removeEventListener('pointerdown', unlockOnce);
    document.removeEventListener('keydown', unlockOnce);
    document.removeEventListener('touchstart', unlockOnce);
  };
  document.addEventListener('pointerdown', unlockOnce, { passive: true });
  document.addEventListener('keydown', unlockOnce);
  document.addEventListener('touchstart', unlockOnce, { passive: true });

  window.addEventListener('resize', () => {
    if (fallbackParticlesActive) setupParticles();
    if (fxContainer) {
      fxContainer.refresh().catch(() => {
        // Refresh failures are non-critical; rendering continues with current canvas.
      });
    }
  });
}

function toggleTimer() {
  if (running) {
    pauseTimer();
  } else {
    startTimer();
  }
}

function startTimer() {
  ensureAudio();
  unlockAudioContext();
  if (musicToggle.checked) startAmbience();
  maybeRequestWakeLock();
  running = true;
  startTimestamp = performance.now();
  previousRemaining = Math.max(0, ROUND_SECONDS - elapsedBeforePause);
  playPauseButton.textContent = 'Pause';
  playPauseButton.setAttribute('aria-label', 'Pause timer');
  tick();
}

function pauseTimer() {
  running = false;
  if (frameId) cancelAnimationFrame(frameId);
  if (startTimestamp !== null) {
    elapsedBeforePause += (performance.now() - startTimestamp) / 1000;
  }
  playPauseButton.textContent = 'Start';
  playPauseButton.setAttribute('aria-label', 'Start timer');
}

function resetStage(playFeedback = false) {
  running = false;
  if (frameId) cancelAnimationFrame(frameId);
  elapsedBeforePause = 0;
  startTimestamp = null;
  minuteCue = null;
  lastUrgencyBeep = null;
  flashState = false;
  previousRemaining = ROUND_SECONDS;
  playPauseButton.textContent = 'Start';
  playPauseButton.setAttribute('aria-label', 'Start timer');
  render(ROUND_SECONDS, true);
  if (playFeedback && beepToggle.checked) beepSequence(1, 0.045, 560, 0.08);
}

function jumpStage(direction) {
  const target = Math.min(TOTAL_STAGES, Math.max(1, stage + direction));
  if (target === stage) return;
  stage = target;
  resetStage();
}

function tick() {
  if (!running) return;

  const elapsed = elapsedBeforePause + (performance.now() - startTimestamp) / 1000;
  const remaining = Math.max(0, ROUND_SECONDS - elapsed);
  render(remaining);
  handleBeeps(remaining);
  previousRemaining = remaining;

  if (remaining <= 0) {
    running = false;
    elapsedBeforePause = ROUND_SECONDS;
    playPauseButton.textContent = 'Start';
    playPauseButton.setAttribute('aria-label', 'Start timer');
    beepSequence(6, 0.05, 240, 0.14);
    return;
  }

  frameId = requestAnimationFrame(tick);
}

function render(remainingSeconds, hardPulse = false) {
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = Math.floor(remainingSeconds % 60);
  const tenths = Math.floor((remainingSeconds % 1) * 10);
  timerText.textContent = `${minutes}:${String(seconds).padStart(2, '0')}:${tenths}`;

  stageBadge.textContent = `Stage ${stage} / ${TOTAL_STAGES}`;
  cardBadge.textContent = `Dungeon Door Cards: ${15 + stage * 5}`;

  const dots = [...progressDots.children];
  dots.forEach((dot, i) => {
    const pos = i + 1;
    dot.classList.toggle('done', pos < stage);
    dot.classList.toggle('active', pos === stage);
  });

  const color = getColor(remainingSeconds);
  timerText.style.color = color;
  if (remainingSeconds < 60) {
    if (!flashState) timerText.classList.add('flash');
    flashState = true;
  } else if (flashState) {
    timerText.classList.remove('flash');
    flashState = false;
  }

  timerText.classList.add('pulse');
  setTimeout(() => timerText.classList.remove('pulse'), hardPulse ? 150 : 90);
}

function getColor(remaining) {
  if (remaining < 120) return 'var(--danger)';
  if (remaining < 180) return 'var(--warning)';
  if (remaining < 240) return 'var(--teal)';
  return 'var(--accent)';
}

function handleBeeps(remaining) {
  if (!beepToggle.checked) return;
  const wholeSeconds = Math.floor(remaining);
  const previousWholeSeconds = Math.floor(previousRemaining);

  MINUTE_BEEP_THRESHOLDS.forEach((threshold) => {
    if (wholeSeconds <= threshold && previousWholeSeconds > threshold && minuteCue !== threshold) {
      minuteCue = threshold;
      beepSequence(threshold / 60, 0.08, 370, 0.09);
    }
  });

  const interval = urgencyInterval(remaining);
  if (!interval) return;
  if (lastUrgencyBeep === null || (performance.now() - lastUrgencyBeep) / 1000 >= interval) {
    lastUrgencyBeep = performance.now();
    const freq = remaining < 5 ? 780 : remaining < 15 ? 640 : 520;
    beep(0.025, freq, 0.07);
  }
}

function urgencyInterval(remaining) {
  if (remaining >= 30) return null;
  if (remaining >= 20) return 5;
  if (remaining >= 15) return 3;
  if (remaining >= 10) return 2;
  if (remaining >= 5) return 1;
  if (remaining >= 4) return 0.5;
  if (remaining >= 3) return 0.4;
  if (remaining >= 2) return 0.3;
  if (remaining >= 1) return 0.2;
  return 0.1;
}

function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    beepBus = audioCtx.createGain();
    compressor = audioCtx.createDynamicsCompressor();

    masterGain.gain.value = 0.95;
    beepBus.gain.value = 1;

    compressor.threshold.value = -20;
    compressor.knee.value = 25;
    compressor.ratio.value = 8;
    compressor.attack.value = 0.002;
    compressor.release.value = 0.08;

    beepBus.connect(compressor);
    compressor.connect(masterGain);
    masterGain.connect(audioCtx.destination);
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {
      // Resume can fail before first user gesture in some browsers.
    });
  }
}

function unlockAudioContext() {
  ensureAudio();
  if (!audioCtx || audioUnlockPrimed) return;
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.value = 220;
  gain.gain.value = 0.0001;
  osc.connect(gain);
  gain.connect(beepBus);
  osc.start(now);
  osc.stop(now + 0.01);
  audioUnlockPrimed = true;
}

function beep(duration = 0.07, freq = 440, volume = 0.07) {
  if (!beepToggle.checked) return;
  ensureAudio();
  unlockAudioContext();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'square';
  osc.frequency.value = freq;
  gain.gain.value = 0.0001;
  osc.connect(gain);
  gain.connect(beepBus);
  const now = audioCtx.currentTime;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(volume, now + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.start(now);
  osc.stop(now + duration);
}

function beepSequence(count, spacing = 0.09, freq = 360, volume = 0.07) {
  ensureAudio();
  unlockAudioContext();
  for (let i = 0; i < count; i += 1) {
    const delay = i * spacing * 1000;
    setTimeout(() => beep(0.055, freq + i * 10, volume), delay);
  }
}

function buildAmbientPlayer() {
  if (ambiencePlayer) return ambiencePlayer;
  ambiencePlayer = new Audio();
  ambiencePlayer.preload = 'auto';
  ambiencePlayer.loop = false;
  ambiencePlayer.volume = 0.24;

  ambiencePlayer.addEventListener('ended', () => {
    playRandomAmbientTrack();
  });

  ambiencePlayer.addEventListener('error', () => {
    playRandomAmbientTrack(true);
  });

  return ambiencePlayer;
}

function getRandomAmbientTrack() {
  if (!AMBIENT_TRACKS.length) return null;
  if (AMBIENT_TRACKS.length === 1) {
    lastTrackIndex = 0;
    return AMBIENT_TRACKS[0];
  }

  let nextIndex = lastTrackIndex;
  while (nextIndex === lastTrackIndex) {
    nextIndex = Math.floor(Math.random() * AMBIENT_TRACKS.length);
  }
  lastTrackIndex = nextIndex;
  return AMBIENT_TRACKS[nextIndex];
}

function playRandomAmbientTrack(skipIfPaused = false) {
  if (!musicToggle.checked && skipIfPaused) return;
  const player = buildAmbientPlayer();
  const track = getRandomAmbientTrack();
  if (!track) return;
  player.src = track;
  player.play().catch(() => {
    // Autoplay can be blocked before first user interaction.
  });
}

function startAmbience() {
  if (ambienceStarted) return;
  playRandomAmbientTrack();
  ambienceStarted = true;
}

function stopAmbience() {
  if (!ambienceStarted) return;
  if (ambiencePlayer) {
    ambiencePlayer.pause();
    ambiencePlayer.currentTime = 0;
  }
  ambienceStarted = false;
}

function initializeWakeLockDefaults() {
  wakeToggle.checked = true;
  maybeRequestWakeLock();

  if (wakeRetryTimer) clearInterval(wakeRetryTimer);
  wakeRetryTimer = setInterval(() => {
    maybeRequestWakeLock();
  }, WAKE_RETRY_MS);
}

async function maybeRequestWakeLock() {
  if (!wakeToggle.checked || document.visibilityState !== 'visible') return;
  await requestWakeLock();
}

async function requestWakeLock() {
  try {
    if (!('wakeLock' in navigator)) {
      wakeToggle.checked = false;
      wakeToggle.disabled = true;
      return;
    }
    if (wakeLock || !wakeToggle.checked) return;

    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => {
      wakeLock = null;
      maybeRequestWakeLock();
    });
  } catch {
    // Permission can temporarily fail; keep trying while enabled.
  }
}

function releaseWakeLock() {
  if (wakeLock) {
    wakeLock.release();
    wakeLock = null;
  }
}

function setTheme(isDark) {
  document.body.classList.toggle('theme-dark', isDark);
  document.body.classList.toggle('theme-light', !isDark);
  modeToggle.checked = isDark;
}

function setGraphics(advanced) {
  document.body.classList.toggle('graphics-advanced', advanced);
  document.body.classList.toggle('graphics-simple', !advanced);
  graphicsToggle.checked = advanced;

  if (fxContainer) {
    if (advanced) fxContainer.play();
    else fxContainer.pause();
  }

  if (fallbackParticlesActive) {
    if (advanced && !fallbackFrameId) {
      animateParticles();
    }
    if (!advanced && fallbackFrameId) {
      cancelAnimationFrame(fallbackFrameId);
      fallbackFrameId = null;
      pctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    }
  }
}

async function initializeVisualEffects() {
  const loaded = await initSmokeAndEmberFx();
  if (!loaded) {
    fallbackParticlesActive = true;
    setupParticles();
    animateParticles();
  }
}

function hardenFxLayerInteractivity() {
  const effectSelectors = [
    '.tsparticles-canvas-el',
    '#particles canvas',
    '#particles > div',
    '#fallbackParticles',
  ];

  effectSelectors.forEach((selector) => {
    document.querySelectorAll(selector).forEach((node) => {
      node.style.pointerEvents = 'none';
      node.style.zIndex = '0';
    });
  });

  const layer = document.querySelector('.fx-layer');
  if (layer) {
    layer.style.pointerEvents = 'none';
    layer.style.zIndex = '0';
  }
}

async function importModuleWithRedundancy(urls, label) {
  let lastError = null;
  for (const url of urls) {
    try {
      return await import(url);
    } catch (error) {
      lastError = error;
      console.warn(`[fx] Failed loading ${label} from ${url}`, error);
    }
  }
  throw lastError || new Error(`Unable to load ${label}`);
}

async function initSmokeAndEmberFx() {
  for (let attempt = 0; attempt <= FX_INIT_RETRIES; attempt += 1) {
    try {
      const [engineModule, presetModule] = await Promise.all([
        importModuleWithRedundancy(PARTICLE_ENGINE_URLS, 'tsParticles engine'),
        importModuleWithRedundancy(PARTICLE_FIRE_PRESET_URLS, 'tsParticles fire preset'),
      ]);

      const particleEngine = engineModule.tsParticles;
      const loadFirePreset = presetModule.loadFirePreset;
      if (!particleEngine || !loadFirePreset) {
        throw new Error('tsParticles exports unavailable');
      }

      await loadFirePreset(particleEngine);
      fxContainer = await particleEngine.load({
        id: 'particles',
        options: {
          preset: 'fire',
          fullScreen: { enable: false, zIndex: 0 },
          detectRetina: true,
          background: { opacity: 0 },
          fpsLimit: 60,
          interactivity: {
            detectsOn: 'window',
            events: {
              onClick: { enable: false, mode: [] },
              onHover: { enable: false, mode: [] },
              resize: { enable: true, delay: 0.5 },
            },
          },
          particles: {
            color: {
              value: ['#ffb45d', '#ff8248', '#ffd9a0', '#9fa7b5'],
            },
            opacity: {
              value: { min: 0.1, max: 0.55 },
            },
            size: {
              value: { min: 1, max: 3.4 },
            },
          },
          emitters: [
            {
              position: { x: 15, y: 100 },
              rate: { quantity: 5, delay: 0.06 },
              size: { width: 24, height: 0 },
            },
            {
              position: { x: 85, y: 100 },
              rate: { quantity: 5, delay: 0.06 },
              size: { width: 24, height: 0 },
            },
          ],
        },
      });

      if (!document.body.classList.contains('graphics-advanced')) {
        fxContainer.pause();
      }

      hardenFxLayerInteractivity();

      return true;
    } catch (error) {
      console.warn(`[fx] Smoke/ember effect init attempt ${attempt + 1} failed`, error);
      if (attempt < FX_INIT_RETRIES) {
        const waitMs = FX_RETRY_BACKOFF_MS * (attempt + 1);
        await new Promise((resolve) => {
          setTimeout(resolve, waitMs);
        });
      }
    }
  }

  return false;
}

function setupParticles() {
  const pixelRatio = window.devicePixelRatio || 1;
  particleCanvas.width = window.innerWidth * pixelRatio;
  particleCanvas.height = window.innerHeight * pixelRatio;
  particleCanvas.style.width = `${window.innerWidth}px`;
  particleCanvas.style.height = `${window.innerHeight}px`;
  pctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

  particles = Array.from({ length: PARTICLE_COUNT }, () => ({
    x: Math.random() * window.innerWidth,
    y: Math.random() * window.innerHeight,
    size: Math.random() * 1.8 + 0.6,
    velocity: Math.random() * 0.35 + 0.08,
  }));
}

function animateParticles() {
  pctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  if (document.body.classList.contains('graphics-advanced')) {
    pctx.fillStyle = 'rgba(244, 205, 143, 0.42)';
    particles.forEach((p) => {
      p.y -= p.velocity;
      p.x += Math.sin(p.y / 50) * 0.12;
      if (p.y < -5) {
        p.y = window.innerHeight + 5;
        p.x = Math.random() * window.innerWidth;
      }
      pctx.beginPath();
      pctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      pctx.fill();
    });
  }
  fallbackFrameId = requestAnimationFrame(animateParticles);
}

init().catch((error) => {
  console.error('[init] Failed to initialize app with advanced FX, enabling fallback particles', error);
  fallbackParticlesActive = true;
  setupParticles();
  animateParticles();
  hardenFxLayerInteractivity();
});
