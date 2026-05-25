# 5-Minute Dungeon Companion App

A fully static, mobile-first companion timer for **5-Minute Dungeon**, themed with a brutalist fantasy UI.

https://a13xg.github.io/5-Min-Dungeon-Timer/

## Features
- 5 rounds, each with a 5:00:0 countdown
- Stage progression tracker with 5 dots and animated transitions
- Large intuitive controls: Start/Pause, Reset, Next, and Back
- Dynamic urgency color shifts:
  - Green at start
  - Teal/blue under 4:00
  - Yellow/orange under 3:00
  - Red under 2:00
  - Flashing red under 1:00
- Stage card badges:
  - Stage 1 → 20 cards
  - Stage 2 → 25 cards
  - Stage 3 → 30 cards
  - Stage 4 → 35 cards
  - Stage 5 → 40 cards
- Audio system:
  - Minute threshold beeps (4/3/2/1 beeps)
  - Escalating urgency beeps below 30s down to sub-second intervals
  - Very low-volume procedural dungeon ambience (royalty-free)
- Keep-awake support using Wake Lock API (when available)
- Top-right expandable settings menu:
  - Music toggle (default ON)
  - Beeps toggle (default ON)
  - Keep awake toggle
  - Dark/Light mode toggle
  - Advanced/Simple graphics toggle (default Advanced)
  - GitHub repo link
- Advanced graphics mode with subtle smoke + particles (simple mode disables effects)

## Quick board game context
5-Minute Dungeon is a frantic, cooperative, real-time card game where players race against a 5-minute timer to clear dungeon cards and defeat a boss each stage. Difficulty increases across five stages, with larger dungeon door card counts.

## GitHub Pages setup
This repository includes `.github/workflows/pages.yml` for static site deployment via GitHub Actions.

To enable Pages in repository settings:
1. Go to **Settings → Pages**.
2. Set **Source** to **GitHub Actions**.
3. Push to your deployment branch (workflow is configured for `main` and `copilot/add-5-minute-dungeon-app`).

## Wiki-style docs
See `docs/wiki/Home.md` for a concise in-repo wiki page.

## Local run
Open `index.html` directly in a browser, or serve statically:

```bash
python -m http.server
```

Then open `http://localhost:8000`.
