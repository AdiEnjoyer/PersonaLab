# PersonalLab

PersonalLab is a modular, offline-first self-improvement tracker for one user on an iPhone. It is a React + TypeScript Progressive Web App. You install it from Safari with "Add to Home Screen", and all data stays on the phone (IndexedDB). There is no account and no server. The only network calls are the ones you trigger: Gemini (meal photos), Open Food Facts (barcodes), Chess.com (game sync) and the app's own update check.

The requirements, design and plan are in [`.kiro/specs/personal-lab/`](.kiro/specs/personal-lab/).

## Features

**Core**
- Profile (sex, age, height, weight, weekly training hours, goal) that feeds the calorie and protein targets.
- Home dashboard with one card per module and a bottom tab bar.
- Backup and restore as a JSON file (the Gemini key is never exported), update prompt when a new version is deployed, offline support.

**Gym**
- Library of 876 exercises with photos (from free-exercise-db), plus your own custom exercises with a photo.
- Routines, a workout logger with rest timer, history, summaries.
- Estimated 1RM, personal records, per-exercise progress charts, weekly muscle volume.

**Nutrition**
- Food log by meal with calorie and macro targets (BMR/TDEE based) and saved meals.
- Barcode scan (camera, Open Food Facts) with portion scaling.
- Meal photo estimation with Google Gemini (your own free API key).
- Weight log with a smoothed trend.

**Chess**
- Chess.com game sync, game viewer, board, and Stockfish analysis with a per-game report (move classification).
- About 10,000 offline Lichess puzzles by rating and theme, with rating tracking (Glicko-2).
- Opening repertoire with spaced-repetition drills (SM-2) and a starter repertoire, plus chess tips.

## Tech stack

React 19, TypeScript (strict), Vite 8, Tailwind 4, React Router 7, Dexie 4 (IndexedDB), Zod 4, Recharts, chess.js, react-chessboard, Stockfish 19 (WASM, in a worker), ZXing (barcodes), BlurHash, vite-plugin-pwa / Workbox. Tests: Vitest, fast-check, Testing Library, fake-indexeddb.

## Run it

Node.js 24 or newer.

```
npm install
npm run dev        # local dev server
npm test           # full test run (vitest --run)
npm run typecheck
npm run build      # production build into dist/
npm run preview    # serve dist/ locally
```

If your network intercepts TLS (a corporate or school proxy, antivirus), npm and node may fail with certificate errors. Prefix commands with the system certificate store option:

```powershell
$env:NODE_OPTIONS='--use-system-ca'; npm install
```

(bash: `NODE_OPTIONS=--use-system-ca npm install`).

The build uses the base path `/PersonalLab/` by default. Set `BASE_PATH` to change it, for example `BASE_PATH=/MyRepo/ npm run build`. Locally the app is then at `http://localhost:4173/PersonalLab/` after `npm run preview`.

## Generated data

The generated data is committed, so you only need these commands to refresh it. Source data goes in `.data-src/` (git-ignored).

**Exercises** (`public/exercises/exercises.json` and `public/exercises/img/`, images resized to at most 600 px, with BlurHash):

```
git clone https://github.com/yuhonas/free-exercise-db .data-src/free-exercise-db
npm run data:exercises
```

**Puzzles** (`public/data/puzzles.json`, at most 10,000 puzzles across 9 rating buckets, deterministic). Download `lichess_db_puzzle.csv.zst` from <https://database.lichess.org/#puzzles> into `.data-src/`, then decompress with Node's built-in zstd and pipe it in. `scripts/zstd-cat.ts` is a small wrapper because the Lichess file starts with a skippable frame that Node's decoder rejects on its own:

```
npx tsx scripts/zstd-cat.ts .data-src/lichess_db_puzzle.csv.zst | npm run data:puzzles -- --in -
```

On Windows PowerShell, run the pipe through `cmd /c "..."` so the bytes are not re-encoded as text.

## Deploy to GitHub Pages

1. Create a public GitHub repository and push this project to it.
2. In the repository open Settings, then Pages, and set Source to **GitHub Actions**.
3. Push to `main`. `.github/workflows/deploy.yml` runs typecheck, tests and the build, then publishes `dist/`. If a step fails, the live site stays unchanged.
4. The app is served at `https://<user>.github.io/<repo>/`.

The workflow sets `BASE_PATH` from the repository name (`/${{ github.event.repository.name }}/`), so the repository name decides the URL path. The default `/PersonalLab/` only applies to local builds. A repository named `PersonaLab` is therefore served at `/PersonaLab/` with no config change.

## Install on iPhone

1. Open the deployed URL in **Safari** (other iOS browsers cannot install web apps).
2. Tap Share, then **Add to Home Screen**, then Add.
3. Open it from the home-screen icon. Do the first run from the icon, not from Safari, so the data lives in the installed app's storage.

## First-run setup

- **Profile:** enter sex, age, height, weight, weekly training hours and goal.
- **Gemini (optional, for meal photos):** create a free key in [Google AI Studio](https://aistudio.google.com/apikey). In Settings, Nutrition, paste the key. The key stays on the phone and is not included in backups. The free tier may use your photos to improve Google products. Model names are retired often, so if estimates fail with a "model not found" error, set a current name in the model-name setting in the same section.
- **Chess.com:** in Settings, Chess, enter your Chess.com username, then sync from the Chess tab.

## Backups

Settings, Backup, Export creates a JSON file through the iOS share sheet. Save it to **iCloud Drive** (Save to Files). To restore, choose Import and pick the file. iOS can clear web-app storage if the app is unused for a long time, so keep a recent backup.

## Optional Cloudflare proxy for Chess.com

If Chess.com requests are blocked by CORS, deploy the small Cloudflare Worker in [`worker/`](worker/README.md) and paste its address into Settings, Chess, "CORS proxy URL". Set `ALLOWED_ORIGIN` in `worker/wrangler.toml` to your site origin (for example `https://<user>.github.io`, no path). The app uses the proxy only after a direct request fails.

## Not verifiable on a PC

These depend on a real iPhone or real accounts and have only been tested with fakes:
- Camera barcode scanning.
- Stockfish start time and analysis speed on the phone.
- The iOS share sheet for backup export and the Add to Home Screen flow.
- Real Gemini and Chess.com responses (formats can change).
- Installed-app storage behaviour and offline start after a long idle period.

## Adding a module

1. Create `src/modules/<name>/` with an `index.ts` exporting a `ModuleDefinition` (see `src/core/registry/types.ts`): `id`, `name`, `icon`, `routes` (one with `tabRoot: true`), `DashboardCard`, `tables` (Dexie stores), `backup` (versioned zod schema and migrations), and optionally `settings` and `Overlay`.
2. Add it to the `MODULES` list in `src/core/registry/modules.ts`. Tabs, routes, the dashboard, Settings and backups are all built from that list.
3. Keep database access out of static imports in `index.ts` (load screens lazily), since `core/db` imports the registry.
