# Farkle — Development Handoff

## Overview

Farkle is a static, installable mobile web game built with plain HTML, CSS, and JavaScript. It has no build step or runtime dependencies. It supports one to four players, local pass-and-play, three AI risk profiles, validated saved games, light/dark themes, sound/haptic preferences, statistics, and a five-part interactive tutorial.

## Rules implemented

- Single 1: 100; single 5: 50.
- Three 1s: 1,000; other triples: face value × 100.
- Four/five/six of a kind: 1,000/2,000/3,000.
- Straight, three pairs: 1,500. Two triplets: 2,500.
- All six scoring dice create hot dice.
- Games default to no entry threshold, so any valid scoring selection may be banked. An optional 500-point opening threshold is available during setup. Targets can be 5,000 or 10,000.
- Reaching the target starts a final round in multiplayer. Each other seat receives one last turn.

## Files and storage

- `index.html`: setup, game, results, and overlay hosts.
- `styles.css`: responsive mobile presentation, dice, sheets, and dark theme.
- `app.js`: scoring, turn flow, AI, persistence, tutorial, and rendering.
- `manifest.webmanifest`, `sw.js`, SVG and PNG icons: installable offline app shell with an update prompt.
- `README.md`, `screenshots/`: publication documentation and images.

The active game is saved under `adams-farkle-state-v1`. Preferences, statistics, and tutorial completion use separate versioned keys. Saved state is structurally validated before resuming. When changing cached assets, increment `CACHE` in `sw.js`; the app will offer the waiting service worker through its update banner.

The manifest uses the explicit ID `/adams-farkle`. Do not reuse that ID for another app. Keep Farkle, Yahtzee, and Solitaire at distinct URLs even when they share a domain.

## Release checklist

- Run `npx playwright test tests/farkle.spec.js`.
- Confirm the manifest, service worker asset list, and cache version are current.
- Test installation from the final HTTPS address on a phone.
- Add the owner's chosen license. No license is included because licensing terms require an explicit owner decision.

## Running

Serve this directory through localhost for service-worker testing:

```sh
cd farkle
python3 -m http.server 8000
```

Then open `http://localhost:8000/`. The game also runs from `index.html` directly, except for installation and offline caching.
