const TOTAL_STAGES = 5;
const ROUND_SECONDS = 300;
const PARTICLE_COUNT = 38;
const NOISE_AMPLITUDE = 0.18;
const MINUTE_BEEP_THRESHOLDS = [240, 180, 120, 60];
const WAKE_RETRY_MS = 15000;
const FX_INIT_RETRIES = 2;
const FX_RETRY_BACKOFF_MS = 900;
const AMBIENT_ERROR_LIMIT = 6;
const AMBIENT_RETRY_DELAY_MS = 700;
const AMBIENT_DIRECTORY = './assets/ambient/';
const DEFAULT_MUSIC_ENABLED = true;
const DEFAULT_BEEP_ENABLED = true;
const DEFAULT_WAKE_ENABLED = true;
const DEFAULT_DARK_MODE_ENABLED = true;
const DEFAULT_ADVANCED_GRAPHICS_ENABLED = true;
const MUSIC_TOGGLE_STORAGE_KEY = 'dungeonTimer.musicEnabled';
const BEEP_TOGGLE_STORAGE_KEY = 'dungeonTimer.beepEnabled';
const WAKE_TOGGLE_STORAGE_KEY = 'dungeonTimer.wakeEnabled';
const MODE_TOGGLE_STORAGE_KEY = 'dungeonTimer.darkModeEnabled';
const GRAPHICS_TOGGLE_STORAGE_KEY = 'dungeonTimer.advancedGraphicsEnabled';
const BEEP_VOLUME_STORAGE_KEY = 'dungeonTimer.beepVolume';
const AMBIENT_VOLUME_STORAGE_KEY = 'dungeonTimer.ambientVolume';
const DEFAULT_BEEP_LEVEL = 1;
const DEFAULT_AMBIENT_LEVEL = 0.2;
const DEFAULT_BEEP_DURATION = 0.085;
const DEFAULT_BEEP_SPACING = 0.12;
const BEEP_RELEASE_TAIL = 0.02;
const PROCEDURAL_AMBIENT_BASE_GAIN = 0.014;
const BOSS_IMAGES = [
  null,
  'assets/images/characters/B1_BabyBarbarian1.png',
  'assets/images/characters/B2_GrimeReaper1.png',
  'assets/images/characters/B3_ZolaTheGorgon1.png',
  'assets/images/characters/B4_FreakinDragon1.png',
  'assets/images/characters/B5_DungeonMaster.png',
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
const bossCharacter = document.getElementById('bossCharacter');
const stageBadge = document.getElementById('stageBadge');
const cardBadge = document.getElementById('cardBadge');
const progressDots = document.getElementById('progressDots');
const menuButton = document.getElementById('menuButton');
const settingsPanel = document.getElementById('settingsPanel');
const debugToggleButton = document.getElementById('debugToggleButton');
const resetSettingsButton = document.getElementById('resetSettingsButton');
const debugPanel = document.getElementById('debugPanel');
const musicToggle = document.getElementById('musicToggle');
const beepToggle = document.getElementById('beepToggle');
const ambientVolumeSlider = document.getElementById('ambientVolumeSlider');
const ambientVolumeValue = document.getElementById('ambientVolumeValue');
const beepVolumeSlider = document.getElementById('beepVolumeSlider');
const beepVolumeValue = document.getElementById('beepVolumeValue');
const wakeToggle = document.getElementById('wakeToggle');
const modeToggle = document.getElementById('modeToggle');
const graphicsToggle = document.getElementById('graphicsToggle');
const debugMinutes = document.getElementById('debugMinutes');
const debugSeconds = document.getElementById('debugSeconds');
const debugTenths = document.getElementById('debugTenths');
const debugPreset401 = document.getElementById('debugPreset401');
const debugPreset301 = document.getElementById('debugPreset301');
const debugPreset201 = document.getElementById('debugPreset201');
const debugPreset101 = document.getElementById('debugPreset101');
const debugPreset015 = document.getElementById('debugPreset015');
const debugSetTimeButton = document.getElementById('debugSetTimeButton');
const debugMinus30Button = document.getElementById('debugMinus30Button');
const debugPlus30Button = document.getElementById('debugPlus30Button');
const debugBeepButton = document.getElementById('debugBeepButton');
const debugMinute4Button = document.getElementById('debugMinute4Button');
const debugMinute3Button = document.getElementById('debugMinute3Button');
const debugMinute2Button = document.getElementById('debugMinute2Button');
const debugMinute1Button = document.getElementById('debugMinute1Button');
const debugValidateBeepsButton = document.getElementById('debugValidateBeepsButton');
const debugBeepValidation = document.getElementById('debugBeepValidation');
const debugClearLogButton = document.getElementById('debugClearLogButton');
const debugEventLog = document.getElementById('debugEventLog');

let stage = 1;
let running = false;
let startTimestamp = null;
let elapsedBeforePause = 0;
let frameId = null;
let wakeLock = null;
let minuteThresholdsTriggered = new Set();
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
let ambiencePausedByTimer = false;
let lastTrackIndex = -1;
let wakeRetryTimer = null;
let fxContainer = null;
let fallbackParticlesActive = false;
let fallbackFrameId = null;
let ambientErrorCount = 0;
let proceduralAmbienceNodes = [];
let debugEventEntries = [];
let ambientTracks = [];
let ambientDiscoveryAttempted = false;
let ambientTrackDiscoveryPromise = null;
let ambientStartRetryTimer = null;
let pendingBeepTimers = [];
let beepVolumeLevel = DEFAULT_BEEP_LEVEL;
let ambientVolumeLevel = DEFAULT_AMBIENT_LEVEL;

const particleCanvas = document.getElementById('fallbackParticles');
const pctx = particleCanvas ? particleCanvas.getContext('2d') : null;
let particles = [];

async function init() {
  await loadAmbientTracks();
  initializeVolumeControls();
  initializeToggleControls();
  createDots();
  syncMinuteThresholdTracking(ROUND_SECONDS);
  render(ROUND_SECONDS, true);
  applyStageClass();
  wireEvents();
  initializeWakeLockDefaults();
  syncAmbientWithTimerState('init');
  await initializeVisualEffects();
}

function createDots() {
  if (!progressDots) return;
  progressDots.innerHTML = '';
  for (let i = 1; i <= TOTAL_STAGES; i += 1) {
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.dataset.stage = String(i);
    progressDots.appendChild(dot);
  }
}

function wireEvents() {
  if (playPauseButton) playPauseButton.addEventListener('click', toggleTimer);
  if (resetButton) resetButton.addEventListener('click', () => resetStage(true));
  if (nextButton) nextButton.addEventListener('click', () => jumpStage(1));
  if (backButton) backButton.addEventListener('click', () => jumpStage(-1));

  if (menuButton && settingsPanel) {
    menuButton.addEventListener('click', (event) => {
      event.stopPropagation();
      const open = settingsPanel.classList.toggle('open');
      menuButton.setAttribute('aria-expanded', String(open));
      if (!open && debugPanel) debugPanel.classList.remove('open');
    });

    settingsPanel.addEventListener('click', (event) => {
      event.stopPropagation();
    });

    document.addEventListener('click', () => {
      settingsPanel.classList.remove('open');
      menuButton.setAttribute('aria-expanded', 'false');
      if (debugPanel) debugPanel.classList.remove('open');
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        settingsPanel.classList.remove('open');
        menuButton.setAttribute('aria-expanded', 'false');
        if (debugPanel) debugPanel.classList.remove('open');
      }
    });
  }

  if (debugToggleButton && debugPanel) {
    debugToggleButton.addEventListener('click', (event) => {
      event.stopPropagation();
      const open = debugPanel.classList.toggle('open');
      if (open && settingsPanel) settingsPanel.classList.add('open');
    });

    debugPanel.addEventListener('click', (event) => {
      event.stopPropagation();
    });
  }

  if (resetSettingsButton) {
    resetSettingsButton.addEventListener('click', () => {
      resetAllSettingsToDefaults();
    });
  }

  if (debugSetTimeButton) {
    debugSetTimeButton.addEventListener('click', () => {
      const minutes = clampNumber(Number(debugMinutes?.value ?? 0), 0, 5);
      const seconds = clampNumber(Number(debugSeconds?.value ?? 0), 0, 59);
      const tenths = clampNumber(Number(debugTenths?.value ?? 0), 0, 9);
      applyRemainingTime(minutes * 60 + seconds + tenths / 10);
    });
  }

  if (debugPreset401) debugPreset401.addEventListener('click', () => applyRemainingTime(241));
  if (debugPreset301) debugPreset301.addEventListener('click', () => applyRemainingTime(181));
  if (debugPreset201) debugPreset201.addEventListener('click', () => applyRemainingTime(121));
  if (debugPreset101) debugPreset101.addEventListener('click', () => applyRemainingTime(61));
  if (debugPreset015) debugPreset015.addEventListener('click', () => applyRemainingTime(15));

  if (debugMinus30Button) {
    debugMinus30Button.addEventListener('click', () => {
      applyRemainingTime(getCurrentRemaining() - 30);
    });
  }

  if (debugPlus30Button) {
    debugPlus30Button.addEventListener('click', () => {
      applyRemainingTime(getCurrentRemaining() + 30);
    });
  }

  if (debugBeepButton) debugBeepButton.addEventListener('click', () => beep(0.12, 840, 0.14, true, 'debug-single'));
  if (debugMinute4Button) debugMinute4Button.addEventListener('click', () => beepSequence(4, 0.12, 380, 0.11, true, 'debug-4beeps'));
  if (debugMinute3Button) debugMinute3Button.addEventListener('click', () => beepSequence(3, 0.12, 420, 0.11, true, 'debug-3beeps'));
  if (debugMinute2Button) debugMinute2Button.addEventListener('click', () => beepSequence(2, 0.12, 470, 0.11, true, 'debug-2beeps'));
  if (debugMinute1Button) debugMinute1Button.addEventListener('click', () => beepSequence(1, 0.12, 540, 0.11, true, 'debug-1beep'));
  if (debugValidateBeepsButton) debugValidateBeepsButton.addEventListener('click', validateMinuteBeepSchedule);
  if (debugClearLogButton) debugClearLogButton.addEventListener('click', clearDebugEventLog);

  if (musicToggle) {
    musicToggle.addEventListener('change', () => {
      writeStoredToggle(MUSIC_TOGGLE_STORAGE_KEY, musicToggle.checked);
      syncAmbientWithTimerState('music-toggle-change');
    });
  }

  if (beepToggle) {
    beepToggle.addEventListener('change', () => {
      writeStoredToggle(BEEP_TOGGLE_STORAGE_KEY, beepToggle.checked);
      ensureAudio();
      unlockAudioContext();
      if (beepToggle.checked) beep(0.08, 680, 0.12);
    });
  }

  if (ambientVolumeSlider) {
    ambientVolumeSlider.addEventListener('input', () => {
      updateAmbientVolumeFromUi();
    });
  }

  if (beepVolumeSlider) {
    beepVolumeSlider.addEventListener('input', () => {
      updateBeepVolumeFromUi();
    });
  }

  if (wakeToggle) {
    wakeToggle.addEventListener('change', async () => {
      writeStoredToggle(WAKE_TOGGLE_STORAGE_KEY, wakeToggle.checked);
      if (wakeToggle.checked) await requestWakeLock();
      else releaseWakeLock();
    });
  }

  if (modeToggle) {
    modeToggle.addEventListener('change', () => {
      writeStoredToggle(MODE_TOGGLE_STORAGE_KEY, modeToggle.checked);
      setTheme(modeToggle.checked);
    });
  }

  if (graphicsToggle) {
    graphicsToggle.addEventListener('change', () => {
      writeStoredToggle(GRAPHICS_TOGGLE_STORAGE_KEY, graphicsToggle.checked);
      setGraphics(graphicsToggle.checked);
    });
  }

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
  if (beepToggle && beepToggle.checked) beep(0.09, 720, 0.11);
  running = true;
  syncAmbientWithTimerState('timer-started');
  maybeRequestWakeLock();
  startTimestamp = performance.now();
  previousRemaining = Math.max(0, ROUND_SECONDS - elapsedBeforePause);
  playPauseButton.textContent = 'Pause';
  playPauseButton.setAttribute('aria-label', 'Pause timer');
  appendDebugEvent('timer', 'started');
  tick();
}

function pauseTimer() {
  running = false;
  if (frameId) cancelAnimationFrame(frameId);
  clearPendingBeeps();
  if (startTimestamp !== null) {
    elapsedBeforePause += (performance.now() - startTimestamp) / 1000;
  }
  syncAmbientWithTimerState('timer-paused');
  playPauseButton.textContent = 'Start';
  playPauseButton.setAttribute('aria-label', 'Start timer');
  appendDebugEvent('timer', 'paused');
}

function resetStage(playFeedback = false) {
  running = false;
  if (frameId) cancelAnimationFrame(frameId);
  syncAmbientWithTimerState('timer-reset');
  clearPendingBeeps();
  elapsedBeforePause = 0;
  startTimestamp = null;
  syncMinuteThresholdTracking(ROUND_SECONDS);
  lastUrgencyBeep = null;
  flashState = false;
  previousRemaining = ROUND_SECONDS;
  playPauseButton.textContent = 'Start';
  playPauseButton.setAttribute('aria-label', 'Start timer');
  appendDebugEvent('timer', `stage ${stage} reset`);
  render(ROUND_SECONDS, true);
  if (playFeedback && beepToggle.checked) beepSequence(1, 0.065, 560, 0.08);
}

function applyStageClass() {
  for (let i = 1; i <= TOTAL_STAGES; i++) document.body.classList.remove(`stage-${i}`);
  document.body.classList.add(`stage-${stage}`);
  if (bossCharacter) {
    bossCharacter.src = BOSS_IMAGES[stage] ?? '';
    bossCharacter.classList.remove('boss-animating');
    void bossCharacter.offsetWidth;
    bossCharacter.classList.add('boss-animating');
  }
}

function jumpStage(direction) {
  const target = Math.min(TOTAL_STAGES, Math.max(1, stage + direction));
  if (target === stage) return;
  stage = target;
  applyStageClass();
  appendDebugEvent('stage', `jumped to stage ${stage}`);
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
    syncAmbientWithTimerState('timer-ended');
    playPauseButton.textContent = 'Start';
    playPauseButton.setAttribute('aria-label', 'Start timer');
    beepSequence(6, 0.085, 240, 0.14);
    return;
  }

  frameId = requestAnimationFrame(tick);
}

function render(remainingSeconds, hardPulse = false) {
  if (!timerText || !stageBadge || !cardBadge || !progressDots) return;
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
  if (!beepToggle || !beepToggle.checked) return;
  const wholeSeconds = Math.floor(remaining);
  const previousWholeSeconds = Math.floor(previousRemaining);

  MINUTE_BEEP_THRESHOLDS.forEach((threshold) => {
    if (!minuteThresholdsTriggered.has(threshold) && wholeSeconds <= threshold && previousWholeSeconds > threshold) {
      minuteThresholdsTriggered.add(threshold);
      beepSequence(threshold / 60, 0.12, 370, 0.1, false, `minute-${threshold}`);
      speakMinuteLeft(threshold / 60, threshold / 60 * 0.12 + 0.12);
    }
  });

  const interval = urgencyInterval(remaining);
  if (!interval) return;
  if (lastUrgencyBeep === null || (performance.now() - lastUrgencyBeep) / 1000 >= interval) {
    lastUrgencyBeep = performance.now();
    const freq = remaining < 5 ? 780 : remaining < 15 ? 640 : 520;
    beep(0.055, freq, 0.085, false, 'urgency');
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

function beep(duration = DEFAULT_BEEP_DURATION, freq = 440, volume = 0.07, force = false, reason = 'beep') {
  if (!force && (!beepToggle || !beepToggle.checked)) return;
  ensureAudio();
  unlockAudioContext();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'triangle';
  gain.gain.value = 0.0001;
  osc.connect(gain);
  gain.connect(beepBus);
  const now = audioCtx.currentTime;
  const attack = Math.min(0.012, duration * 0.28);
  const end = now + duration;
  const outputVolume = Math.max(0.0001, volume * beepVolumeLevel);
  osc.frequency.setValueAtTime(freq * 1.04, now);
  osc.frequency.exponentialRampToValueAtTime(Math.max(120, freq * 0.9), end);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(outputVolume, now + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, end + BEEP_RELEASE_TAIL);
  osc.start(now);
  osc.stop(end + BEEP_RELEASE_TAIL);
  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
  };
  appendDebugEvent(reason, `${Math.round(freq)}Hz / ${duration.toFixed(3)}s / vol ${volume.toFixed(2)}`);
}

function beepSequence(count, spacing = DEFAULT_BEEP_SPACING, freq = 360, volume = 0.07, force = false, reason = 'sequence') {
  ensureAudio();
  unlockAudioContext();
  for (let i = 0; i < count; i += 1) {
    const delay = i * spacing * 1000;
    const timer = setTimeout(() => {
      beep(DEFAULT_BEEP_DURATION, freq + i * 14, volume, force, `${reason} #${i + 1}/${count}`);
      pendingBeepTimers = pendingBeepTimers.filter((id) => id !== timer);
    }, delay);
    pendingBeepTimers.push(timer);
  }
}

function clearPendingBeeps() {
  pendingBeepTimers.forEach((timer) => clearTimeout(timer));
  pendingBeepTimers = [];
}

function initializeVolumeControls() {
  const savedBeepVolume = readStoredVolume(BEEP_VOLUME_STORAGE_KEY, DEFAULT_BEEP_LEVEL);
  const savedAmbientVolume = readStoredVolume(AMBIENT_VOLUME_STORAGE_KEY, DEFAULT_AMBIENT_LEVEL);

  if (beepVolumeSlider) beepVolumeSlider.value = String(Math.round(savedBeepVolume * 100));
  if (ambientVolumeSlider) ambientVolumeSlider.value = String(Math.round(savedAmbientVolume * 100));
  updateBeepVolumeFromUi();
  updateAmbientVolumeFromUi();
}

function initializeToggleControls() {
  if (musicToggle) {
    musicToggle.checked = readStoredToggle(MUSIC_TOGGLE_STORAGE_KEY, DEFAULT_MUSIC_ENABLED);
  }
  if (beepToggle) {
    beepToggle.checked = readStoredToggle(BEEP_TOGGLE_STORAGE_KEY, DEFAULT_BEEP_ENABLED);
  }
  if (wakeToggle) {
    wakeToggle.checked = readStoredToggle(WAKE_TOGGLE_STORAGE_KEY, DEFAULT_WAKE_ENABLED);
  }
  if (modeToggle) {
    modeToggle.checked = readStoredToggle(MODE_TOGGLE_STORAGE_KEY, DEFAULT_DARK_MODE_ENABLED);
    setTheme(modeToggle.checked);
  }
  if (graphicsToggle) {
    graphicsToggle.checked = readStoredToggle(GRAPHICS_TOGGLE_STORAGE_KEY, DEFAULT_ADVANCED_GRAPHICS_ENABLED);
    setGraphics(graphicsToggle.checked);
  }
}

function clearStoredSettings() {
  const keys = [
    MUSIC_TOGGLE_STORAGE_KEY,
    BEEP_TOGGLE_STORAGE_KEY,
    WAKE_TOGGLE_STORAGE_KEY,
    MODE_TOGGLE_STORAGE_KEY,
    GRAPHICS_TOGGLE_STORAGE_KEY,
    BEEP_VOLUME_STORAGE_KEY,
    AMBIENT_VOLUME_STORAGE_KEY,
  ];

  try {
    keys.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // Storage can be unavailable in privacy-restricted contexts.
  }
}

function resetAllSettingsToDefaults() {
  clearStoredSettings();

  if (musicToggle) {
    musicToggle.checked = DEFAULT_MUSIC_ENABLED;
    writeStoredToggle(MUSIC_TOGGLE_STORAGE_KEY, musicToggle.checked);
  }
  if (beepToggle) {
    beepToggle.checked = DEFAULT_BEEP_ENABLED;
    writeStoredToggle(BEEP_TOGGLE_STORAGE_KEY, beepToggle.checked);
  }
  if (wakeToggle) {
    wakeToggle.checked = DEFAULT_WAKE_ENABLED;
    writeStoredToggle(WAKE_TOGGLE_STORAGE_KEY, wakeToggle.checked);
  }
  if (modeToggle) {
    modeToggle.checked = DEFAULT_DARK_MODE_ENABLED;
    writeStoredToggle(MODE_TOGGLE_STORAGE_KEY, modeToggle.checked);
    setTheme(modeToggle.checked);
  }
  if (graphicsToggle) {
    graphicsToggle.checked = DEFAULT_ADVANCED_GRAPHICS_ENABLED;
    writeStoredToggle(GRAPHICS_TOGGLE_STORAGE_KEY, graphicsToggle.checked);
    setGraphics(graphicsToggle.checked);
  }

  if (beepVolumeSlider) beepVolumeSlider.value = String(Math.round(DEFAULT_BEEP_LEVEL * 100));
  if (ambientVolumeSlider) ambientVolumeSlider.value = String(Math.round(DEFAULT_AMBIENT_LEVEL * 100));
  updateBeepVolumeFromUi();
  updateAmbientVolumeFromUi();

  if (wakeToggle?.checked) maybeRequestWakeLock();
  else releaseWakeLock();

  syncAmbientWithTimerState('settings-reset');
  appendDebugEvent('settings', 'reset to defaults');
}

function readStoredToggle(storageKey, fallback) {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw === null) return fallback;
    return raw === 'true';
  } catch {
    return fallback;
  }
}

function writeStoredToggle(storageKey, enabled) {
  try {
    window.localStorage.setItem(storageKey, String(Boolean(enabled)));
  } catch {
    // Storage can be unavailable in privacy-restricted contexts.
  }
}

function readStoredVolume(storageKey, fallback) {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw === null) return fallback;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return fallback;
    return clampNumber(parsed, 0, 1);
  } catch {
    return fallback;
  }
}

function writeStoredVolume(storageKey, value) {
  try {
    window.localStorage.setItem(storageKey, String(value));
  } catch {
    // Storage can be unavailable in privacy-restricted contexts.
  }
}

function sliderToNormalizedLevel(value) {
  return clampNumber(Number(value), 0, 100) / 100;
}

function updateBeepVolumeFromUi() {
  beepVolumeLevel = beepVolumeSlider ? sliderToNormalizedLevel(beepVolumeSlider.value) : DEFAULT_BEEP_LEVEL;
  writeStoredVolume(BEEP_VOLUME_STORAGE_KEY, beepVolumeLevel);
  if (beepVolumeValue) {
    beepVolumeValue.textContent = `${Math.round(beepVolumeLevel * 100)}%`;
  }
}

function updateAmbientVolumeFromUi() {
  ambientVolumeLevel = ambientVolumeSlider ? sliderToNormalizedLevel(ambientVolumeSlider.value) : DEFAULT_AMBIENT_LEVEL;
  writeStoredVolume(AMBIENT_VOLUME_STORAGE_KEY, ambientVolumeLevel);
  if (ambientVolumeValue) {
    ambientVolumeValue.textContent = `${Math.round(ambientVolumeLevel * 100)}%`;
  }
  applyAmbientVolume();
}

function applyAmbientVolume() {
  if (ambiencePlayer) {
    ambiencePlayer.volume = ambientVolumeLevel;
  }
  if (proceduralAmbienceNodes.length) {
    const [ambienceMaster] = proceduralAmbienceNodes;
    if (audioCtx && ambienceMaster?.gain) {
      ambienceMaster.gain.cancelScheduledValues(audioCtx.currentTime);
      ambienceMaster.gain.linearRampToValueAtTime(PROCEDURAL_AMBIENT_BASE_GAIN * ambientVolumeLevel, audioCtx.currentTime + 0.04);
    }
  }
}

function speakMinuteLeft(minutes, delaySeconds = 0) {
  if (!('speechSynthesis' in window)) return;
  if (!beepToggle || !beepToggle.checked) return;

  const voiceTimer = setTimeout(() => {
    const utterance = new SpeechSynthesisUtterance(`${minutes}min left`);
    utterance.rate = 1.02;
    utterance.pitch = 0.98;
    utterance.volume = 0.85;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    pendingBeepTimers = pendingBeepTimers.filter((id) => id !== voiceTimer);
    appendDebugEvent('voice', `${minutes}min left`);
  }, Math.max(0, delaySeconds) * 1000);

  pendingBeepTimers.push(voiceTimer);
}

async function loadAmbientTracks() {
  if (ambientDiscoveryAttempted) return ambientTracks;
  if (ambientTrackDiscoveryPromise) return ambientTrackDiscoveryPromise;

  ambientTrackDiscoveryPromise = discoverAmbientTracks()
    .then((tracks) => {
      ambientTracks = tracks;
      ambientDiscoveryAttempted = true;
      appendDebugEvent('ambient', `discovered ${ambientTracks.length} mp3 track(s)`);
      return ambientTracks;
    })
    .catch(() => {
      ambientTracks = [];
      ambientDiscoveryAttempted = true;
      appendDebugEvent('ambient', 'failed to discover mp3 tracks');
      return ambientTracks;
    })
    .finally(() => {
      ambientTrackDiscoveryPromise = null;
    });

  return ambientTrackDiscoveryPromise;
}

async function discoverAmbientTracks() {
  try {
    const response = await fetch(AMBIENT_DIRECTORY, { cache: 'no-store' });
    if (!response.ok) return [];

    const listing = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(listing, 'text/html');
    const links = [...doc.querySelectorAll('a[href]')];
    const tracks = links
      .map((link) => link.getAttribute('href') || '')
      .filter((href) => /\.mp3($|\?)/i.test(href))
      .map((href) => {
        try {
          return new URL(href, AMBIENT_DIRECTORY).pathname
            .replace(/\/\/+/g, '/')
            .replace(/^\/$/, AMBIENT_DIRECTORY);
        } catch {
          return `${AMBIENT_DIRECTORY}${href.replace(/^\.\//, '')}`;
        }
      })
      .map((path) => (path.startsWith('/') ? `.${path}` : path))
      .filter((value, idx, arr) => arr.indexOf(value) === idx);

    return tracks;
  } catch {
    return [];
  }
}

function buildAmbientPlayer() {
  if (ambiencePlayer) return ambiencePlayer;
  ambiencePlayer = new Audio();
  ambiencePlayer.preload = 'auto';
  ambiencePlayer.loop = false;
  ambiencePlayer.volume = ambientVolumeLevel;

  ambiencePlayer.addEventListener('ended', () => {
    ambientErrorCount = 0;
    if (running && musicToggle && musicToggle.checked) {
      playRandomAmbientTrack();
    }
  });

  ambiencePlayer.addEventListener('loadeddata', () => {
    ambientErrorCount = 0;
  });

  ambiencePlayer.addEventListener('error', () => {
    ambientErrorCount += 1;
    appendDebugEvent('ambient', `track error ${ambientErrorCount}/${AMBIENT_ERROR_LIMIT}`);
    if (ambientErrorCount >= AMBIENT_ERROR_LIMIT) {
      stopAmbience();
      appendDebugEvent('ambient', 'stopped after repeated track errors');
      return;
    }
    setTimeout(() => {
      playRandomAmbientTrack(true);
    }, AMBIENT_RETRY_DELAY_MS);
  });

  return ambiencePlayer;
}

function getRandomAmbientTrack() {
  if (!ambientTracks.length) return null;
  if (ambientTracks.length === 1) {
    lastTrackIndex = 0;
    return ambientTracks[0];
  }

  let nextIndex = lastTrackIndex;
  while (nextIndex === lastTrackIndex) {
    nextIndex = Math.floor(Math.random() * ambientTracks.length);
  }
  lastTrackIndex = nextIndex;
  return ambientTracks[nextIndex];
}

function playRandomAmbientTrack(skipIfPaused = false) {
  if (!musicToggle.checked && skipIfPaused) return;
  const player = buildAmbientPlayer();
  const track = getRandomAmbientTrack();
  if (!track) {
    appendDebugEvent('ambient', 'no .mp3 tracks discovered in ambient directory');
    return;
  }
  player.src = track;
  player.play().catch(() => {
    // Autoplay can be blocked before first user interaction.
    appendDebugEvent('ambient', 'autoplay blocked until user interaction');
    scheduleAmbientPlaybackRetry('play-blocked');
  });
}

function scheduleAmbientPlaybackRetry(reason = 'retry') {
  if (ambientStartRetryTimer) {
    clearTimeout(ambientStartRetryTimer);
    ambientStartRetryTimer = null;
  }

  ambientStartRetryTimer = setTimeout(() => {
    ambientStartRetryTimer = null;

    if (!running || !musicToggle || !musicToggle.checked) return;
    if (!ambiencePlayer) {
      resumeOrStartAmbience();
      return;
    }

    if (ambiencePlayer.paused) {
      appendDebugEvent('ambient', `${reason}: retrying playback`);
      resumeOrStartAmbience();
    }
  }, 350);
}

function startAmbience() {
  if (ambienceStarted) return;
  ambientErrorCount = 0;
  playRandomAmbientTrack();
  ambienceStarted = true;
}

function pauseAmbienceForTimer() {
  if (!musicToggle || !musicToggle.checked || !ambienceStarted) return;

  if (ambientStartRetryTimer) {
    clearTimeout(ambientStartRetryTimer);
    ambientStartRetryTimer = null;
  }

  if (ambiencePlayer && !ambiencePlayer.paused) {
    ambiencePlayer.pause();
    ambiencePausedByTimer = true;
  }

  if (proceduralAmbienceNodes.length) {
    stopProceduralAmbienceFallback();
    ambiencePausedByTimer = true;
  }
}

function resumeOrStartAmbience() {
  if (!musicToggle || !musicToggle.checked) return;

  if (!ambienceStarted) {
    startAmbience();
    ambiencePausedByTimer = false;
    return;
  }

  if (ambiencePlayer && ambiencePlayer.src && ambiencePlayer.paused) {
    ambiencePlayer.play().catch(() => {
      appendDebugEvent('ambient', 'resume blocked until user interaction');
    });
  } else if (!ambiencePlayer || !ambiencePlayer.src) {
    playRandomAmbientTrack();
  }

  ambiencePausedByTimer = false;
}

function syncAmbientWithTimerState(reason = 'sync') {
  if (!musicToggle || !musicToggle.checked) {
    stopAmbience();
    appendDebugEvent('ambient', `${reason}: stopped (toggle off)`);
    return;
  }

  if (!running) {
    pauseAmbienceForTimer();
    appendDebugEvent('ambient', `${reason}: paused (timer not running)`);
    return;
  }

  resumeOrStartAmbience();
  appendDebugEvent('ambient', `${reason}: playing`);
}

function stopAmbience() {
  if (!ambienceStarted) return;
  if (ambientStartRetryTimer) {
    clearTimeout(ambientStartRetryTimer);
    ambientStartRetryTimer = null;
  }
  if (ambiencePlayer) {
    ambiencePlayer.pause();
    ambiencePlayer.currentTime = 0;
  }
  stopProceduralAmbienceFallback();
  ambiencePausedByTimer = false;
  ambienceStarted = false;
}

function startProceduralAmbienceFallback() {
  if (proceduralAmbienceNodes.length) return;
  ensureAudio();

  const ambienceMaster = audioCtx.createGain();
  ambienceMaster.gain.value = PROCEDURAL_AMBIENT_BASE_GAIN * ambientVolumeLevel;

  const low = audioCtx.createOscillator();
  low.type = 'triangle';
  low.frequency.value = 52;

  const mid = audioCtx.createOscillator();
  mid.type = 'sawtooth';
  mid.frequency.value = 104;

  const mod = audioCtx.createOscillator();
  mod.frequency.value = 0.08;
  const modGain = audioCtx.createGain();
  modGain.gain.value = 7;

  mod.connect(modGain);
  modGain.connect(low.frequency);
  low.connect(ambienceMaster);
  mid.connect(ambienceMaster);
  ambienceMaster.connect(masterGain);

  const now = audioCtx.currentTime;
  low.start(now);
  mid.start(now);
  mod.start(now);

  proceduralAmbienceNodes = [ambienceMaster, low, mid, mod, modGain];
}

function stopProceduralAmbienceFallback() {
  if (!proceduralAmbienceNodes.length) return;
  const [ambienceMaster, low, mid, mod] = proceduralAmbienceNodes;
  const stopAt = audioCtx.currentTime + 0.1;
  ambienceMaster.gain.exponentialRampToValueAtTime(0.0001, stopAt);
  low.stop(stopAt + 0.02);
  mid.stop(stopAt + 0.02);
  mod.stop(stopAt + 0.02);
  proceduralAmbienceNodes = [];
}

function initializeWakeLockDefaults() {
  if (!wakeToggle) return;
  if (wakeToggle.checked) maybeRequestWakeLock();
  else releaseWakeLock();

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
      writeStoredToggle(WAKE_TOGGLE_STORAGE_KEY, false);
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
  if (modeToggle) modeToggle.checked = isDark;
}

function setGraphics(advanced) {
  document.body.classList.toggle('graphics-advanced', advanced);
  document.body.classList.toggle('graphics-simple', !advanced);
  if (graphicsToggle) graphicsToggle.checked = advanced;

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
  if (!particleCanvas || !pctx) return;
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

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function appendDebugEvent(type, detail) {
  if (!debugEventLog) return;
  const stamp = new Date().toLocaleTimeString();
  debugEventEntries.unshift(`${stamp} | ${type} | ${detail}`);
  if (debugEventEntries.length > 80) debugEventEntries = debugEventEntries.slice(0, 80);

  debugEventLog.innerHTML = debugEventEntries
    .map((entry) => `<div class="debug-log-entry">${entry}</div>`)
    .join('');
}

function clearDebugEventLog() {
  debugEventEntries = [];
  if (debugEventLog) debugEventLog.textContent = 'No beep events yet.';
}

function getCurrentRemaining() {
  if (!running || startTimestamp === null) {
    return Math.max(0, ROUND_SECONDS - elapsedBeforePause);
  }
  const elapsed = elapsedBeforePause + (performance.now() - startTimestamp) / 1000;
  return Math.max(0, ROUND_SECONDS - elapsed);
}

function syncMinuteThresholdTracking(remaining) {
  minuteThresholdsTriggered = new Set(
    MINUTE_BEEP_THRESHOLDS.filter((threshold) => remaining <= threshold),
  );
}

function applyRemainingTime(rawRemaining) {
  const nextRemaining = clampNumber(rawRemaining, 0, ROUND_SECONDS);
  running = false;
  if (frameId) cancelAnimationFrame(frameId);
  clearPendingBeeps();
  syncAmbientWithTimerState('time-set');
  startTimestamp = null;
  elapsedBeforePause = ROUND_SECONDS - nextRemaining;
  previousRemaining = nextRemaining;
  lastUrgencyBeep = null;
  syncMinuteThresholdTracking(nextRemaining);
  if (debugMinutes) debugMinutes.value = String(Math.floor(nextRemaining / 60));
  if (debugSeconds) debugSeconds.value = String(Math.floor(nextRemaining % 60));
  if (debugTenths) debugTenths.value = String(Math.floor((nextRemaining % 1) * 10));
  appendDebugEvent('timer', `time set to ${Math.floor(nextRemaining / 60)}:${String(Math.floor(nextRemaining % 60)).padStart(2, '0')}:${Math.floor((nextRemaining % 1) * 10)}`);
  render(nextRemaining, true);
  if (playPauseButton) {
    playPauseButton.textContent = 'Start';
    playPauseButton.setAttribute('aria-label', 'Start timer');
  }
}

function validateMinuteBeepSchedule() {
  const triggered = new Set();
  const counts = { 240: 0, 180: 0, 120: 0, 60: 0 };
  let previous = ROUND_SECONDS;

  for (let remaining = ROUND_SECONDS - 0.1; remaining >= 0; remaining -= 0.1) {
    const wholeSeconds = Math.floor(remaining);
    const previousWholeSeconds = Math.floor(previous);

    MINUTE_BEEP_THRESHOLDS.forEach((threshold) => {
      if (!triggered.has(threshold) && wholeSeconds <= threshold && previousWholeSeconds > threshold) {
        triggered.add(threshold);
        counts[threshold] += threshold / 60;
      }
    });

    previous = remaining;
  }

  const expected = { 240: 4, 180: 3, 120: 2, 60: 1 };
  const valid = MINUTE_BEEP_THRESHOLDS.every((threshold) => counts[threshold] === expected[threshold]);

  if (debugBeepValidation) {
    if (valid) {
      debugBeepValidation.textContent = 'PASS: 4:00=4 beeps, 3:00=3 beeps, 2:00=2 beeps, 1:00=1 beep.';
      appendDebugEvent('validation', 'PASS minute beep thresholds');
    } else {
      debugBeepValidation.textContent = `FAIL: counts 4:00=${counts[240]}, 3:00=${counts[180]}, 2:00=${counts[120]}, 1:00=${counts[60]}`;
      appendDebugEvent('validation', `FAIL 4:00=${counts[240]}, 3:00=${counts[180]}, 2:00=${counts[120]}, 1:00=${counts[60]}`);
    }
  }
}

function animateParticles() {
  if (!pctx) return;
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
