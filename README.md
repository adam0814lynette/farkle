# Farkle

A polished, mobile-first version of the classic push-your-luck dice game. Farkle runs entirely in the browser, works offline after its first load, and can be installed as a Progressive Web App.

![Farkle setup](screenshots/setup.png)
![Farkle gameplay](screenshots/gameplay.png)

## Features

- Solo, local pass-and-play, and AI games for one to four players
- Cautious, balanced, and bold AI personalities
- 5,000- or 10,000-point targets with an optional 500-point opening threshold
- Complete scoring for singles, kinds, straights, pairs, and triplets
- Five-part visual tutorial, strategy tips, and an in-game scoring reference
- Saved games, final-round play, tie handling, statistics, dark mode, sound, and haptics
- Touch-friendly portrait and landscape layouts
- Keyboard and screen-reader-friendly controls with reduced-motion support
- Offline installation with an in-app update prompt

## Play locally

Service workers require localhost or HTTPS. From this directory, run:

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000/`. Opening `index.html` directly also works for gameplay, but installation and offline caching will be unavailable.

## Publish with GitHub Pages

Copy this directory into a GitHub repository, then configure Pages to publish from the branch and directory containing `index.html`. All paths are relative, so the game works at a repository subpath. After publishing, verify installation and an offline reload from the live HTTPS address.

## Rules summary

On each turn, roll six dice and select at least one scoring die or combination. Bank to protect the turn total, or roll the remaining dice to keep building it. A roll with no scoring dice is a Farkle and loses the unbanked turn total. Scoring all six creates hot dice and allows another roll with all six.

| Combination | Points |
|---|---:|
| Single 1 / single 5 | 100 / 50 |
| Three 1s | 1,000 |
| Three 2s–6s | Face value × 100 |
| Four / five / six of a kind | 1,000 / 2,000 / 3,000 |
| Straight, 1–6 | 1,500 |
| Three pairs | 1,500 |
| Two triplets | 2,500 |

## Testing

From the workspace root:

```sh
npx playwright test tests/farkle.spec.js
```

The suite covers scoring, the tutorial, optional entry rules, AI setup, save recovery, confirmations, compact portrait and landscape layouts, and offline operation.

## Privacy

Farkle has no server component, advertising, analytics, or external runtime dependencies. Player names, preferences, statistics, and active games remain in the browser's local storage. Clearing site data removes them.

## Release notes

### 1.0.0

- Initial publication-ready release.
- Added solo, pass-and-play, and three AI risk profiles.
- Added tutorial, scoring reference, statistics, preferences, persistence, offline installation, and accessible dialogs.

## License

No license has been selected yet. Choose and add a license before inviting outside contributors or granting reuse rights.
