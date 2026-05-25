# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the app

```bash
python -m http.server
# Open http://localhost:8000
```

No build step, bundler, or package manager — this is a fully static site with no dependencies installed locally. All external libraries (tsParticles) are loaded at runtime via CDN ESM imports in `script.js`.

## Deployment

Pushing to `main` triggers `.github/workflows/pages.yml`, which validates CDN availability of the tsParticles libraries before uploading the artifact and deploying to GitHub Pages.

## Architecture

Three files constitute the entire app:

- **`index.html`** — static markup; all interactive elements have IDs that `script.js` binds to on load.
- **`styles.css`** — theme system via body classes (`theme-dark`/`theme-light`, `graphics-advanced`/`graphics-simple`); CSS variables for colors (`--accent`, `--teal`, `--warning`, `--danger`).
- **`script.js`** — single-file, no modules. All state is module-level `let` variables. Entry point is `init()` called at the bottom.

### Key subsystems in `script.js`

**Timer loop** — `requestAnimationFrame`-based via `tick()`. State: `running`, `startTimestamp`, `elapsedBeforePause`. Timer is paused by accumulating elapsed time rather than storing a target end time.

**Audio** — Web Audio API; `ensureAudio()` lazily creates the graph (`audioCtx → beepBus → compressor → masterGain → destination`). `unlockAudioContext()` must be called on a user gesture before sounds work. Ambient music uses an `<Audio>` element with automatic track rotation; `startProceduralAmbienceFallback()` synthesizes a drone via oscillators if MP3s fail to load after `AMBIENT_ERROR_LIMIT` errors.

**Visual effects** — Primary: tsParticles fire preset loaded as ESM from CDN with multi-CDN fallback (`jsDelivr` → `unpkg`) and retry logic. Fallback: canvas-based floating particle renderer (`setupParticles` / `animateParticles`) used when CDN loading fails entirely. Both are controlled by the `graphics-advanced` body class.

**Wake Lock** — `navigator.wakeLock.request('screen')` with a periodic retry interval (`WAKE_RETRY_MS = 15000ms`) and re-request on `visibilitychange`/`focus`/`pageshow`.

### Ambient music files

The four tracks in `assets/ambient/` are placeholders. Replace with real MP3s using the same filenames, or update the `AMBIENT_TRACKS` array in `script.js`.

### Card count formula

Dungeon door cards per stage: `15 + stage * 5` (20, 25, 30, 35, 40).
