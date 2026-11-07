# Implementation Plan: PersonalLab

## Overview

This plan builds the whole PersonalLab PWA described in `design.md` in TypeScript (React + Vite), in six parts: core platform, UI kit and app shell, Gym, Nutrition, Chess, and final integration. Each sub-task is sized for one sub-agent run. Pure logic comes first in each area, then its property tests, then data access, module wiring and screens, so every step is wired into earlier code and nothing is left orphaned.

Rules that apply to every task:

- **Branch**: all work after task 1.2 happens on `feature/personal-lab`. Before committing, check `git branch --show-current`. Never commit to `main` after task 1.2, never merge, never push, and never change git config.
- **"Verify and commit" step**: every sub-task ends with this step. Run `npm run typecheck` and the listed `npx vitest --run <filter>` command. Fix failures in the files this task owns. Then stage only the files this task created or changed (`git add <paths>`, never `git add -A`; checkbox updates in `tasks.md` may be staged too) and run `git commit -m "<message>"` with the conventional-commit message given. Never commit failing code, never use `--no-verify` and never amend. If the typecheck fails only in files owned by a task running in parallel, wait and re-run it instead of editing those files. If `.git/index.lock` exists because a parallel task is committing, wait and retry.
- **Property tests are required**, not optional. Each one lives in its own file `<area>/__tests__/<topic>.p<N>.property.test.ts`, starts with the tag comment `// Feature: personal-lab, Property N: <title>`, uses `numRuns` ≥ 100 and the generators, ranges and tolerances stated in the design's Correctness Properties section. Oracles go in `src/test/oracles/` and never import production code. The filter `npx vitest --run p<N>.property` runs exactly that file.
- **Logic purity**: files under any `logic/` folder import only other `logic/` code, `src/core/math`, `src/core/time`, `src/core/text` and `chess.js` (checked by the architecture test from task 3.3).
- **Design verification items** are resolved where the affected code is written: Stockfish file names in 10.1, licence names in 14.3, Open Food Facts fields in 27.4 and the Gemini model id and CORS in 27.5.

## Tasks

## Part 1: Core platform

- [x] 1. Environment check, git setup and project scaffold
  - [x] 1.1 Check the toolchain before changing anything
    - Run `node --version`, `npm --version` and `git --version`.
    - If Node.js or npm is missing, stop at once with a clear error that names the missing tool and points to the Prerequisites section of `requirements.md` ("Node.js LTS installed on the Windows PC"). Create no files.
    - If Node.js is older than the minimum version required by the current Vite release, stop with an error that states the found and required versions.
    - Read (do not set) `git config user.name` and `git config user.email`. If either is empty, stop and ask the user to set them, because commits would fail.
    - Run `git status` and `git log` to confirm the repository has no commits. If it already has commits or a `main` branch with content, stop and ask the user.
    - Verify and commit: nothing changes in this sub-task, so there is no typecheck, test or commit.
    - _Requirements: 74.1, 12.2_

  - [x] 1.2 Create the initial commit on `main` and switch to `feature/personal-lab`
    - Make sure the unborn branch is `main` (`git symbolic-ref HEAD refs/heads/main`).
    - Create `.gitignore` with: `node_modules/`, `dist/`, `coverage/`, `*.local`, `.env*`, `.data-src/` (downloaded source datasets), `*.zst`, `.tmp/`, `worker/.wrangler/`, `public/engine/` (copied at build time).
    - Create a `README.md` stub: project name, one-paragraph description, "Status: in development on `feature/personal-lab`", and a pointer to `.kiro/specs/personal-lab/`.
    - Stage exactly `.gitignore`, `README.md` and every file in `.kiro/specs/personal-lab/` (including `.config.kiro`, `requirements.md`, `design.md` and `tasks.md`). Commit on `main` with `chore: initial commit with PersonalLab spec`.
    - Run `git switch -c feature/personal-lab` and confirm with `git branch --show-current`.
    - Verify and commit: no code yet, so no typecheck or tests; the commit above is this sub-task's commit.
    - _Requirements: 12.1, 12.9_

  - [x] 1.3 Scaffold the Vite + React + TypeScript project and install every dependency
    - Create `package.json` (`name: personallab`, `version: 1.0.0`, `type: module`, `private: true`) with the scripts from the design: `dev`, `typecheck` (`tsc -b --noEmit`; if the installed TypeScript rejects this combination, set `noEmit` in the tsconfigs and use `tsc -b`), `test` (`vitest --run`), `build` (temporarily `vite build`; task 10.1 sets the final command), `preview`, `data:exercises` (`tsx scripts/build-exercises.ts`) and `data:puzzles` (`tsx scripts/build-puzzles.ts`). The data scripts take their arguments on the command line.
    - Install all runtime dependencies now so later tasks never edit `package.json` in parallel: `react`, `react-dom`, `react-router`, `dexie`, `dexie-react-hooks`, `zod` (v4), `recharts`, `chess.js`, `react-chessboard`, `stockfish`, `@zxing/browser`, `@zxing/library`, `blurhash`, `workbox-precaching`, `workbox-routing`, `workbox-strategies`, `workbox-cacheable-response`, `workbox-core`.
    - Install all dev dependencies: `vite`, `@vitejs/plugin-react`, `typescript`, `tailwindcss` (v4), `@tailwindcss/vite`, `vite-plugin-pwa`, `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `fake-indexeddb`, `fast-check`, `tsx`, `sharp`, `@types/node`, `@types/react`, `@types/react-dom`, `@cloudflare/workers-types`.
    - Create `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json` (strict mode, `jsx: react-jsx`, include `src`, `scripts`, `vite.config.ts`, `vitest.config.ts`).
    - Create `vite.config.ts` with `base = process.env.BASE_PATH ?? '/PersonalLab/'`, the React plugin and `@tailwindcss/vite` (the PWA plugin is configured in task 9.1).
    - Create `vitest.config.ts`: `test.projects` with a `jsdom` project for `src/**` (setup file `src/test/setup.ts`) and a `node` project for `scripts/**`; `process.env.TZ = 'Asia/Jerusalem'`; no `passWithNoTests`.
    - Create `src/test/setup.ts` (`import 'fake-indexeddb/auto'`, `@testing-library/jest-dom/vitest`, RTL `cleanup` after each test, `fc.configureGlobal({ numRuns: 100 })`), `src/test/smoke.test.ts` (one trivial test so the suite never has zero files), `src/vite-env.d.ts`.
    - Create `index.html` (root div, `src/main.tsx` entry; task 9.1 adds the PWA meta tags), `src/main.tsx` rendering a placeholder "PersonalLab" heading, and `src/ui/styles/index.css` containing `@import "tailwindcss";`.
    - Run `npm install`. If it fails with an error that points at the workspace path (Hebrew characters, OneDrive sync locks such as `EPERM`, `EBUSY` or `ENOENT` on a mangled path), stop and report the exact command, the error output and the likely cause. Do not move the folder; tell the user that moving it to an ASCII path outside OneDrive, such as `C:\dev\PersonalLab`, is the remedy listed under Risks in `requirements.md`, and wait for their decision.
    - Verify and commit: no commit here; task 1.4 verifies and commits the scaffold.
    - _Requirements: 74.1, 12.5, 1.1_

  - [x] 1.4 Verify the workspace path with typecheck, tests and build, then commit the scaffold
    - Run `npm run typecheck`, `npx vitest --run` and `npx vite build`. Confirm `dist/index.html` exists and asset URLs start with `/PersonalLab/`.
    - If any of these fails because of the Hebrew/OneDrive path (for example Vite or Rollup failing to resolve a path, `sharp` failing to load its native binary, or file lock errors), stop and report clearly: the command, the error output, and that the workspace path is the cause. Do not move the folder and do not work around it silently; ask the user how to proceed.
    - Delete `dist/` after the check (it is gitignored).
    - Verify and commit: `npm run typecheck`; `npx vitest --run`; commit `package.json`, `package-lock.json`, configs, `index.html` and `src/` with `chore: scaffold vite react typescript project`.
    - _Requirements: 12.2, 12.3, 74.1_

- [x] 2. Shared pure helpers and image processing
  - [x] 2.1 Implement math, time, text and id helpers with shared core generators
    - `src/core/math/round.ts` (`round(x, decimals)` half away from zero, exponent-string method), `decimal.ts` (`parseDecimal`, `isMultipleOfStep`), `tolerance.ts` (`relClose`).
    - `src/core/time/localDate.ts` (`toLocalDate`, `addDays`, `daysBetween`, `startOfLocalDate`), `monthRange.ts` (`monthsBack`), `format.ts` (`formatClock`, `formatDurationMinutes`).
    - `src/core/text/fold.ts` (`fold`) and `compare.ts` (`compareFolded`); `src/core/ids.ts` (`newId`, `newIdemKey` via `crypto.randomUUID`).
    - `src/test/arbitraries/core.ts`: `arbText`, `arbLocalDate`, `arbEpoch`, `arbImageBytes` as defined in the design's shared generators table.
    - Example tests: `round(1.005, 2) = 1.01`, `round(-2.5) = -3`, `addDays` across the Asia/Jerusalem DST change, `monthsBack('2025-03-31', 1) = '2025-02-28'`, `formatDurationMinutes` for 45 min and 65 min, `fold('Éé')`.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/core/math src/core/time src/core/text`; commit `feat(core): add rounding, decimal, date, text and id helpers`
    - _Requirements: Conventions (Rounding, Local_Date), 4.2, 4.3, 11.1, 14.1, 25.4, 28.2, 45.6, 72.3_

  - [x] 2.2 Write property test for rounding
    - **Property 31: Rounding is half away from zero**
    - **Validates: Conventions (Rounding)**
    - BigInt oracle; values with up to 6 fractional digits; `d ∈ [0, 3]`.
    - Verify and commit: `npm run typecheck`; `npx vitest --run p31.property`; commit `test(core): add rounding property test (P31)`

  - [x] 2.3 Write property test for clock formatting
    - **Property 28: Clock and elapsed formatting**
    - **Validates: Requirements 28.2, 45.6**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p28.property`; commit `test(core): add clock formatting property test (P28)`

  - [x] 2.4 Write property test for month ranges
    - **Property 29: Month ranges**
    - **Validates: Requirements 25.4, 45.8**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p29.property`; commit `test(core): add month range property test (P29)`

  - [x] 2.5 Implement shared image processing
    - `src/core/image/processImage.ts`: `scaleDims`, `processImage` (decode with `createImageBitmap(..., { imageOrientation: 'from-image' })`, `<img>` fallback, canvas re-encode to JPEG with no metadata, 32 × 32 BlurHash with `encode(…, 4, 3)`), `ImageDecodeError`.
    - Unit tests with mocked `createImageBitmap`, canvas and `toBlob` (jsdom has no canvas): decode failure throws `ImageDecodeError`; output is JPEG with the scaled size.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/core/image`; commit `feat(core): add image scaling and blurhash processing`
    - _Requirements: 15.3, 36.2, 37.7, 66.1_

  - [x] 2.6 Write property test for image scaling
    - **Property 30: Image scaling dimensions**
    - **Validates: Requirements 13.2, 15.3, 36.2**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p30.property`; commit `test(core): add image scaling property test (P30)`

- [x] 3. Module registry
  - [x] 3.1 Implement registry types, capabilities, validator and derivation helpers
    - `src/core/registry/types.ts` (`ModuleDefinition`, `ModuleRoute`, `CommandEntry`, `CommandContext`, `ModuleBackup`, `ModuleSettings` exactly as in the design), `capabilities.ts` (`Capabilities`, `getCapability` reading a module list), `validate.ts` (`validateRegistry`, including core paths `/` and `/settings` under pseudo-id `core`).
    - `src/core/registry/derive.ts`: pure `deriveTabs`, `deriveRoutes`, `deriveCards`, `deriveCommandSources` that follow list order.
    - `src/core/registry/__tests__/types.test-d.ts` with `// @ts-expect-error` objects missing each required field (checked by `tsc`).
    - Example tests for `validateRegistry`: valid list, `Gym` (uppercase), `1gym`, 21-character id, duplicate id, duplicate route.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/core/registry`; commit `feat(core): add module registry types, validator and derivation`
    - _Requirements: 2.1, 2.3, 2.5, 29.3_

  - [x] 3.2 Create stub Gym, Nutrition and Chess module definitions and the Module_Registry
    - `src/modules/{gym,nutrition,chess}/tables.ts` with the version 1 index specs from the design's Dexie schema table.
    - `src/modules/{gym,nutrition,chess}/index.ts`: valid `ModuleDefinition`s with the design ids and names, a placeholder icon, one tab-root route rendering a placeholder screen, a placeholder `DashboardCard`, the tables, `exportData` returning empty data, a no-op `importData` and `backup: { dataVersion: 1, schema, migrations: {}, sections }` with empty-data schemas. Later module tasks replace these pieces.
    - `src/core/registry/modules.ts`: `MODULES = [gymModule, nutritionModule, chessModule]`.
    - Example test: the registry contains exactly `gym`, `nutrition`, `chess` in that order and passes `validateRegistry`.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/core/registry src/modules`; commit `feat(core): register stub gym, nutrition and chess modules`
    - _Requirements: 2.2, 2.6, 2.7_

  - [x] 3.3 Add the architecture import scan and the numRuns meta test
    - `src/test/architecture.test.ts`: parse every `.ts/.tsx` under `src/` with the TypeScript compiler API, resolve import specifiers and assert the three dependency rules of the design (core/app/ui import modules only via `core/registry/modules.ts`; no module imports another module; `logic/` files import no `dexie`, `react`, `react-dom`, `db/`, `data/`, `ui/`, `app/`, `net/` or `engine/` path).
    - `src/test/numruns.test.ts`: read every `*.property.test.ts` and fail if any `numRuns` literal is below 100 or the tag comment is missing.
    - Include negative self-tests with in-memory source strings so each rule is shown to fail on a violating import.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/test`; commit `test(core): add architecture import scan and numRuns check`
    - _Requirements: 2.8, 74.2, 74.3_

  - [x] 3.4 Write property test for the registry validator
    - **Property 3: Registry validator reports exactly the problems**
    - **Validates: Requirements 2.5**
    - Oracle in `src/test/oracles/registry.ts`.
    - Verify and commit: `npm run typecheck`; `npx vitest --run p3.property`; commit `test(core): add registry validator property test (P3)`

- [x] 4. Database layer
  - [x] 4.1 Implement the Dexie database, versioning, open handling and change tracking
    - `src/core/db/tables.ts` (`buildStores(modules)` → `${id}_${short}` plus core stores `core_profile`, `core_settings`, `core_secrets`, `core_meta`), `versions.ts` (`DB_VERSION = 1`, `DbMigration`, `MIGRATIONS = []`, `MODULE_DATA_VERSIONS_V1`), `db.ts` (the `db` instance from `MODULES`, migration chain declaration, `openDatabase(): Promise<OpenResult>` mapping `VersionError` → `newer-version`, upgrade error or abort → `migration-failed`, anything else → `unavailable`).
    - `changeTracker.ts`: DBCore middleware that sets `core_meta.lastDataChangeAt` and, when absent, `firstDataAt` after successful mutations of every table except `core_secrets` and `core_meta`.
    - `src/core/db/strip.ts`: `stripUndefined`.
    - `src/test/helpers/db.ts`: `withFreshDb` (fresh database name per run or `Dexie.delete`).
    - Example tests: open succeeds; a database stored at version 2 yields `newer-version` with no change; a throwing upgrade yields `migration-failed`; secrets and meta writes do not set `lastDataChangeAt`.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/core/db`; commit `feat(core): add dexie database, versioning and change tracking`
    - _Requirements: 2.6, 3.1, 3.3, 3.4, 3.6, 3.7, 8.4, 9.2_

  - [x] 4.2 Implement the write path, idempotent creates and the per-record write queue
    - `src/core/db/errors.ts` (`DbWriteError`, `toDbWriteError` with `quota` detection through the cause chain), `write(tables, fn)` in `db.ts` or `write.ts`, `idempotent.ts` (`createIdempotent` with the in-flight map, `&idemKey` lookup, `ConstraintError` recovery, `MissingIdempotencyKeyError`), `writeQueue.ts` (`enqueueWrite`).
    - Example tests: quota error mapping; a failed create leaves no record and a retry with the same key creates it; writes for one key apply in call order.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/core/db`; commit `feat(core): add idempotent create, write errors and write queue`
    - _Requirements: 3.5, 11.2, 11.5, 11.6, 63.3_

  - [x] 4.3 Write property test for registry derivation
    - **Property 1: Registry derivation follows registry order**
    - **Validates: Requirements 2.3, 2.6**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p1.property`; commit `test(core): add registry derivation property test (P1)`

  - [x] 4.4 Write property test for database migrations
    - **Property 4: Database migrations preserve records**
    - **Validates: Requirements 3.3, 3.4**
    - Synthetic v1 → v2 → v3 chain with one field transform and one declared deletion; a throwing v3 step leaves v1 intact.
    - Verify and commit: `npm run typecheck`; `npx vitest --run p4.property`; commit `test(core): add migration preservation property test (P4)`

  - [x] 4.5 Write property test for idempotent creates
    - **Property 20: Create operations are idempotent**
    - **Validates: Requirements 11.2, 11.3, 15.6, 37.8, 48.11**
    - Run against generic idempotent test tables here; task 38.3 extends the same test to every real module create path.
    - Verify and commit: `npm run typecheck`; `npx vitest --run p20.property`; commit `test(core): add idempotent create property test (P20)`

  - [x] 4.6 Write property test for creates without a key
    - **Property 21: Creates without a key are rejected**
    - **Validates: Requirements 11.5**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p21.property`; commit `test(core): add missing idempotency key property test (P21)`

- [x] 5. Settings and profile
  - [x] 5.1 Implement settings, secrets and module setting schemas
    - `src/core/settings/schema.ts` (core key `core.backupReminderDays`, default 7; a schema registry that merges core schemas with each module's `settings.schema` read through `MODULES`), `repo.ts`, `useSetting.ts` (`[value, commit]`, stored value unchanged on failure, accepted-values text on error), `secrets.ts` (`getSecret`, `setSecret`, `deleteSecret`, Gemini key schema, `maskKey`).
    - `src/modules/gym/settings.ts`, `src/modules/nutrition/settings.ts`, `src/modules/chess/settings.ts`: the schemas and defaults from the design's module settings table; attach them to the stub definitions (`settings.Section` stays a placeholder until the module settings screens are built).
    - Example tests: unset key reads its default; invalid commit leaves the stored value; `maskKey('abcd1234')`.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/core/settings`; commit `feat(core): add settings, secrets and module setting schemas`
    - _Requirements: 5.2, 5.5, 5.6, 5.7, 9.1, 30.2, 40.2_

  - [x] 5.2 Implement the Profile schema, text validation and repository
    - `src/core/profile/schema.ts` (`ProfileSchema` for stored records; `validateProfile(texts)` checking entered text with `parseDecimal` and `isMultipleOfStep`, returning per-field accepted range and step), `repo.ts` (`getProfile`, `saveProfile` writing all six fields only on a valid save, `useProfile`).
    - Example tests: 70.25 kg, 175.5 cm and 3.2 h are rejected; a failed write keeps the stored Profile.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/core/profile`; commit `feat(core): add profile validation and repository`
    - _Requirements: 4.1, 4.2, 4.3, 4.6, 4.7, 4.8_

  - [x] 5.3 Write property test for Profile validation
    - **Property 5: Profile validation accepts exactly valid profiles**
    - **Validates: Requirements 4.2, 4.3**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p5.property`; commit `test(core): add profile validation property test (P5)`

  - [x] 5.4 Write property test for settings acceptance
    - **Property 6: Settings accept exactly their accepted values**
    - **Validates: Requirements 5.2, 5.6, 30.2, 30.9, 40.2, 40.8**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p6.property`; commit `test(core): add settings acceptance property test (P6)`

  - [x] 5.5 Write property test for the key mask
    - **Property 7: Key mask shows only the last four characters**
    - **Validates: Requirements 5.7**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p7.property`; commit `test(core): add key mask property test (P7)`

- [x] 6. Undo service and optimistic updates
  - [x] 6.1 Implement the Undo service and record-diff undo
    - `src/core/undo/undoService.ts` (`push` finalises the current action and starts a 6000 ms timer, `undo` acts on the first tap only, `dismiss`, `subscribe`, failure state "Could not undo" + reason), `recordDiff.ts` (`TableSnapshot`, `captureSnapshot(tables, keys)`, `recordDiffUndo(label, before, after)` restoring in one transaction).
    - The timer lives outside React so it survives navigation; undo data is memory-only.
    - Example tests with fake timers: second tap does nothing; a new push finalises the previous action; a failing undo keeps the after-state and reports the reason.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/core/undo`; commit `feat(core): add undo service and record-diff undo`
    - _Requirements: 64.2, 64.3, 64.4, 64.5, 64.6, 64.7_

  - [x] 6.2 Write property test for undo identity
    - **Property 23: Undo restores the exact previous state**
    - **Validates: Requirements 64.2, 64.3, 7.11, 16.6, 38.2, 38.3**
    - Run against generated generic table states with delete, replace and bulk-delete actions here; task 38.4 extends the same test to every module destructive action listed in the property.
    - Verify and commit: `npm run typecheck`; `npx vitest --run p23.property`; commit `test(core): add undo identity property test (P23)`

  - [x] 6.3 Implement optimistic overlays
    - `src/core/optimistic/overlay.ts` (pure `applyOverlay(stored, ops)`), `useOptimisticList.ts` (`items`, `run(op)` applying synchronously, writing through `enqueueWrite`, removing the op on settle, calling an injected `onError(error, op)` so the UI can show the R3.5 Toast and close a delete's Undo_Toast).
    - Example tests: overlay applies within the same render; a failed write reverts to stored data.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/core/optimistic`; commit `feat(core): add optimistic list overlay`
    - _Requirements: 63.1, 63.2, 63.3, 63.4, 3.5_

  - [x] 6.4 Write property test for optimistic consistency
    - **Property 22: Optimistic UI equals stored state after settling**
    - **Validates: Requirements 3.5, 63.3, 63.4**
    - Use a Dexie middleware that fails a chosen subset of writes.
    - Verify and commit: `npm run typecheck`; `npx vitest --run p22.property`; commit `test(core): add optimistic consistency property test (P22)`

- [ ] 7. Backup service
  - [x] 7.1 Implement the backup format, zod envelope, base64, file name and migrations
    - `src/core/backup/format.ts` (`SUPPORTED_SCHEMA_VERSION = 1`, format id), `schema.ts` (`BackupEnvelope`, `BackupV1`), `base64.ts` (`toBase64`, `fromBase64` for `ArrayBuffer`), `filename.ts` (`backupFileName(date)` in local time), `migrations.ts` (`ENVELOPE_MIGRATIONS`, `migrateEnvelope`, `migrateModuleEntry`).
    - Example tests: the file name for 09:05 on 7 March 2025 is `personallab-backup-2025-03-07-0905.json`; empty bytes round-trip.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/core/backup`; commit `feat(core): add backup format, schemas and file naming`
    - _Requirements: 6.1, 6.2, 6.4, 7.6, 8.3_

  - [x] 7.2 Implement backup file checking in R7.1 order
    - `src/core/backup/import.ts`: `checkBackupFile(file, modules = MODULES)` and a pure `validateBackupValue(parsed, modules)` running read → JSON → envelope → version support (file and module data versions) → migration → record validation (core profile, core settings per key, module entries in file order with `module.backup.schema` and `sections()` positions); `ImportPlan` with `present`, `absent`, `skipped`.
    - `src/core/backup/messages.ts`: the exact R7 messages.
    - Example tests for each message, including section, 1-based record position and field path.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/core/backup`; commit `feat(core): add backup file validation pipeline`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.13, 7.14_

  - [x] 7.3 Implement backup export, sharing and the generic app-state generator
    - `src/core/backup/export.ts`: `buildBackup(now, modules = MODULES)` (each `exportData` once in order; failure names the module id or `core data`; JSON text; Gemini key absence assertion; self-validation with `validateBackupValue`), `exportBackup()` returning `ExportOutcome`; on `shared` or `downloaded` write `core_meta.lastBackupAt`.
    - `src/core/backup/share.ts`: Web Share with `canShare`, `AbortError` → `dismissed`, other rejection → download fallback, `<a download>` with object URL.
    - `src/test/arbitraries/appState.ts`: `arbAppState` and `arbBackupFile` over core data plus a test registry of generic table-backed modules (each with zod record schemas and images), so backup properties run before the real modules exist.
    - Example tests with mocked `navigator.share`/`canShare`: shared, dismissed (no `lastBackupAt`), failed share falls back to download, failing module export leaves `lastBackupAt` unchanged.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/core/backup`; commit `feat(core): add backup export and share flow`
    - _Requirements: 2.4, 2.9, 6.1, 6.2, 6.3, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 8.7_

  - [x] 7.4 Implement the emergency export for failed migrations
    - `src/core/db/rawDump.ts`: `emergencyExport()` opening `new Dexie('personallab')` in dynamic mode, reading every table and building a Backup_File with the module data versions recorded for the stored version.
    - Example test: a database at a stored version with records produces a file containing every record.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/core/db`; commit `feat(core): add emergency export for failed migrations`
    - _Requirements: 3.4_

  - [x] 7.5 Implement import application with snapshot undo
    - `applyImport(plan)` in `src/core/backup/apply.ts`: snapshot core and present-module tables, one `rw` transaction clearing and rewriting core data and present modules via `importData`, `core_secrets` untouched, `undoService.push({ label: 'Backup imported', undo: restoreSnapshot })` on success, error without undo on failure; returns the skipped ids for the result Toast.
    - Example tests: failed transaction leaves data unchanged and pushes no undo; undo restores the pre-import state.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/core/backup`; commit `feat(core): add transactional backup import with undo`
    - _Requirements: 7.9, 7.10, 7.11, 7.12, 8.2, 8.6_

  - [x] 7.6 Implement the backup reminder decision
    - `src/core/backup/reminder.ts` (pure `shouldShowBackupReminder`) and `snoozeReminder(now)` writing `reminderSnoozeUntil = now + 86_400_000`.
    - Example tests: off, snoozed, exactly 72 h (not shown), 72 h + 1 ms (shown).
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/core/backup`; commit `feat(core): add backup reminder decision`
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [x] 7.7 Write property test for export call order
    - **Property 2: Export calls every module once, in order**
    - **Validates: Requirements 2.4**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p2.property`; commit `test(core): add export call order property test (P2)`

  - [x] 7.8 Write property test for image base64 round trip
    - **Property 8: Image base64 round trip**
    - **Validates: Requirements 6.2**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p8.property`; commit `test(core): add image base64 property test (P8)`

  - [x] 7.9 Write property test for Gemini key exclusion from backups
    - **Property 9: The Gemini key never appears in a Backup_File**
    - **Validates: Requirements 6.3**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p9.property`; commit `test(core): add backup key exclusion property test (P9)`

  - [~] 7.10 Write property test for the backup file name
    - **Property 10: Backup file name format**
    - **Validates: Requirements 6.4**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p10.property`; commit `test(core): add backup file name property test (P10)`

  - [~] 7.11 Write property test for validation stage order
    - **Property 11: Import validation stops at the earliest failing stage**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p11.property`; commit `test(core): add import stage order property test (P11)`

  - [~] 7.12 Write property test for the first invalid record
    - **Property 12: The first invalid record is reported**
    - **Validates: Requirements 7.5**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p12.property`; commit `test(core): add first invalid record property test (P12)`

  - [~] 7.13 Write property test for skipping unregistered modules
    - **Property 13: Unregistered modules are skipped**
    - **Validates: Requirements 7.7**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p13.property`; commit `test(core): add unregistered module skip property test (P13)`

  - [~] 7.14 Write property test for module replacement on import
    - **Property 14: Import replaces exactly the present modules**
    - **Validates: Requirements 7.9, 8.6**
    - Uses the generic test registry; task 38.1 switches it to the real registry.
    - Verify and commit: `npm run typecheck`; `npx vitest --run p14.property`; commit `test(core): add import replacement property test (P14)`

  - [~] 7.15 Write property test for the backup round trip
    - **Property 15: Backup round trip**
    - **Validates: Requirements 8.1, 8.5**
    - Uses the generic test registry; task 38.1 switches it to the real registry.
    - Verify and commit: `npm run typecheck`; `npx vitest --run p15.property`; commit `test(core): add backup round trip property test (P15)`

  - [~] 7.16 Write property test for import idempotence
    - **Property 16: Import is idempotent**
    - **Validates: Requirements 8.2**
    - Uses the generic test registry; task 38.1 switches it to the real registry.
    - Verify and commit: `npm run typecheck`; `npx vitest --run p16.property`; commit `test(core): add import idempotence property test (P16)`

  - [~] 7.17 Write property test for backup parse/print
    - **Property 17: Backup parse/print round trip**
    - **Validates: Requirements 8.3**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p17.property`; commit `test(core): add backup parse/print property test (P17)`

  - [~] 7.18 Write property test for the backup reminder
    - **Property 19: Backup reminder decision**
    - **Validates: Requirements 9.2, 9.3, 9.4**
    - Oracle in `src/test/oracles/reminder.ts`.
    - Verify and commit: `npm run typecheck`; `npx vitest --run p19.property`; commit `test(core): add backup reminder property test (P19)`

- [ ] 8. Network utilities
  - [~] 8.1 Implement online state, fetch with timeout, stale-while-revalidate and age labels
    - `src/core/net/online.ts` (`useOnline`, `reportUnreachable`, 5 s probe of `version.json` with `cache: 'no-store'`, `online` event clears flags), `fetchWithTimeout.ts` (timeout, caller abort, network `TypeError`, HTTP status), `swr.ts` (`useRemoteResource` with one in-flight promise per key, data kept on failure, `offline` state), `ageLabel.ts` (pure).
    - Example tests with fake timers: unreachable → probe → recovered within 5 s; two components share one fetch; failure keeps cached data.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/core/net`; commit `feat(core): add online state, timed fetch and stale-while-revalidate`
    - _Requirements: 1.5, 1.9, 1.10, 65.1, 65.2, 65.3, 65.4, 65.5, 65.6_

  - [~] 8.2 Write property test for age labels
    - **Property 24: Age labels**
    - **Validates: Requirements 65.1**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p24.property`; commit `test(core): add age label property test (P24)`

- [ ] 9. Service worker, update service and storage persistence
  - [~] 9.1 Configure the PWA plugin, service worker, manifest, icons and build info
    - `vite.config.ts`: `define` for `__APP_VERSION__` (`${pkg.version}+${gitShortSha}`) and `__BUILD_DATE__`; `VitePWA` with `injectManifest`, `registerType: 'prompt'`, `injectRegister: false`, the manifest from the design, glob patterns and ignores; a small plugin that emits `dist/version.json` = `{ "version": __APP_VERSION__ }`.
    - `src/sw.ts`: precache, outdated cache cleanup, navigation route to `index.html` inside the base path, `CacheFirst` for `exercises/img/` (200 only, no expiry), `NetworkOnly` for `version.json`, `SKIP_WAITING` and `PRECACHE_STATUS` messages; no `skipWaiting` on install and no `clientsClaim`.
    - `index.html`: viewport with `viewport-fit=cover`, `apple-touch-icon` (`%BASE_URL%icons/icon-180.png`), `apple-mobile-web-app-capable`, status bar style, theme colour.
    - `scripts/make-icons.ts` (sharp, from an authored SVG in `scripts/assets/icon.svg`) and the generated `public/icons/icon-180.png`, `icon-512.png`, `maskable-512.png`.
    - `src/core/about/buildInfo.ts` exporting `APP_VERSION` and `BUILD_DATE`.
    - Example test: a `vite build` output check is added in task 10.1; here, unit-test the `version.json` plugin's emitted content.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/core/about scripts`; also run `npx vite build` once and confirm `dist/sw.js` and `dist/manifest.webmanifest` exist; commit `feat(core): add service worker, manifest, icons and build info`
    - _Requirements: 1.1, 1.2, 1.3, 1.8, 5.3, 12.5, 12.10, 13.6, 47.9, 55.1, 70.2_

  - [~] 9.2 Implement the update service, precache status and persistent storage request
    - `src/core/update/updateService.ts` (`start` via `virtual:pwa-register`, `checkIfDue` with 1 h interval and 10 s race, `onNeedRefresh` fetching `version.json`, dismissal until next start/foreground, `reload` awaiting every module's `lifecycle.flushPendingWrites` with a 5 s race, then `SKIP_WAITING` and reload on `controllerchange`); state exposed through `subscribe` for the UI Toast.
    - `src/core/update/precacheStatus.ts` (`getOfflineReady`), `src/core/storage/persist.ts` (`requestPersistOnce` non-blocking, recorded result; `getPersistStatus`).
    - Integration tests with a mocked registration and mocked `virtual:pwa-register`: different version shows the update state; reload waits for flush; flush timeout postpones with the R10.5 message; offline check is silent and keeps `lastUpdateCheckAt`.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/core/update src/core/storage`; commit `feat(core): add update service, precache status and storage persistence`
    - _Requirements: 1.6, 1.7, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_

- [ ] 10. Build scripts and deployment pipeline
  - [~] 10.1 Implement engine copy, 404 fallback and build output checks
    - `scripts/copy-engine.ts`: resolve the lite single-threaded Stockfish files in `node_modules/stockfish` by glob and copy them to `public/engine/` (design verification item 3: if the JS locates its WASM by its own file name, keep the original names and record them in an exported `ENGINE_FILES` constant in `src/modules/chess/engine/engineFiles.ts`).
    - `scripts/postbuild-404.ts` (copy `dist/index.html` to `dist/404.html`).
    - `scripts/check-dist.ts` with pure checks in `scripts/lib/checkDist.ts`: no Google API key pattern (`AIza[0-9A-Za-z_-]{35}`) or `Bearer ` token in `dist/`; every `src`/`href` in `dist/index.html` and every manifest URL starts with the base path; manifest name, short name, display and icons; `404.html` equals `index.html`.
    - Set `package.json` `build` to `tsx scripts/copy-engine.ts && vite build && tsx scripts/postbuild-404.ts && tsx scripts/check-dist.ts`.
    - Unit tests for `checkDist` with fixture strings (pass and fail cases).
    - Verify and commit: `npm run typecheck`; `npx vitest --run scripts`; run `npm run build` once; commit `build: add engine copy, 404 fallback and dist checks`
    - _Requirements: 1.1, 12.5, 12.6, 12.9, 55.1_

  - [~] 10.2 Add the GitHub Pages deployment workflow and source safety scans
    - `.github/workflows/deploy.yml` as in the design: push to `main` only, permissions, `concurrency: { group: pages, cancel-in-progress: true }`, `npm ci` → `npm run typecheck` → `npx vitest --run` → `BASE_PATH=/${{ github.event.repository.name }}/ npm run build` → newest-commit guard (`git ls-remote origin refs/heads/main` must equal `$GITHUB_SHA`) → `actions/upload-pages-artifact` (path `dist`) → `deploy` job with `actions/deploy-pages`.
    - `src/test/safety.test.ts`: no secret patterns in `src/`; every absolute `https://` URL used in `fetch` calls is on the allow-list (own origin, `api.chess.com`, the proxy setting, `world.openfoodfacts.org`, `generativelanguage.googleapis.com`).
    - Example test that parses `deploy.yml` as text and checks the step order and the `main`-only trigger.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/test`; commit `ci: add github pages deploy workflow and safety scans`
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.7, 12.8, 12.9_

- [~] 11. Checkpoint: core platform
  - Run `npm run typecheck`, `npx vitest --run` and `npm run build`; fix any failure and commit fixes with `fix(core): …`.
  - Ensure all tests pass, ask the user if questions arise.

## Part 2: UI kit and app shell

- [ ] 12. UI component kit
  - [~] 12.1 Implement styles, layout primitives, form fields and status components
    - `src/ui/styles/index.css`: Tailwind v4 theme tokens, `tabular-nums` on numeric text, `h1, h2, h3 { text-wrap: balance }`, `.rounded-continuous` with `@supports (corner-shape: squircle)`, `.tap` (44 × 44 px minimum or transparent `::before` hit area), safe-area utilities.
    - `src/ui/primitives/`: `Button`, `IconButton`, `ListRow`, `CardFrame`, `ChartFrame` (all apply `.tap` where interactive).
    - `src/ui/form/`: `NumberField` (`inputMode="decimal"`, "," normalised to "."), `TextField`, `Select`, `Switch`, `FieldError`.
    - `src/ui/status/`: `OfflineNotice`, `AgeLabel`, `ErrorPanel` (with Retry), `EmptyState`; `src/ui/ErrorBoundary.tsx` (fallback prop and reset).
    - Component tests: every interactive primitive renders the `.tap` class; `NumberField` passes "70,5" as "70.5"; `ErrorBoundary` shows the fallback.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/ui`; commit `feat(ui): add styles, primitives, form fields and status components`
    - _Requirements: 1.5, 2.10, 62.4, 70.1, 70.2, 70.3, 71.1, 71.2, 71.3, 71.4_

  - [~] 12.2 Implement reduced-motion detection and gesture math
    - `src/ui/motion/useReducedMotion.ts` (subscribes to `matchMedia` change events).
    - `src/ui/gestures/velocity.ts` (pure ring buffer, velocity over the last 100 ms, `shouldRelease(offset, size, velocity, share)`), `useDrag.ts` (pointer events, direction lock after 10 px).
    - Example tests: velocity of a two-sample drag; `shouldRelease` at exactly 25 % (false) and above (true).
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/ui/gestures src/ui/motion`; commit `feat(ui): add reduced motion hook and gesture math`
    - _Requirements: 67.4, 68.3, 69.2_

  - [~] 12.3 Write property test for gesture release
    - **Property 26: Gesture release decision**
    - **Validates: Requirements 68.3, 69.2**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p26.property`; commit `test(ui): add gesture release property test (P26)`

  - [~] 12.4 Implement the Bottom_Sheet with drag, interruption and discard confirmation
    - `src/ui/sheet/Sheet.tsx` (portal, `role="dialog"`, `aria-modal`, focus trap, safe-area padding), `useSheetDrag.ts` (offset `max(0, …)`, inner scroll first, release rule, WAAPI snap-back ≤ 250 ms, interrupt by reading the computed transform), `ConfirmDiscard.tsx` ("Discard changes?" with "Discard" / "Keep editing" when `dirty`).
    - Component tests: Escape and backdrop call `onRequestClose`; a dirty sheet shows the confirmation instead of closing.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/ui/sheet`; commit `feat(ui): add draggable bottom sheet`
    - _Requirements: 68.1, 68.2, 68.3, 68.4, 68.5, 68.6, 68.7, 68.8, 70.3_

  - [~] 12.5 Implement Toasts and the Undo_Toast
    - `src/ui/toast/toastStore.ts` (`toast.show({ message, kind, action, durationMs })`), `ToastHost.tsx` (outside the routed outlet, `aria-live="polite"`, stacked above the tab bar and home indicator, horizontal swipe dismiss), Undo_Toast bound to `undoService.subscribe` (6 s, "Undo" button disabled after the first tap, swipe finalises, failure message "Could not undo: …").
    - Component tests with fake timers: Undo_Toast disappears after 6 s; second tap does nothing; swipe dismiss calls `undoService.dismiss`.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/ui/toast`; commit `feat(ui): add toast host and undo toast`
    - _Requirements: 64.1, 64.4, 64.5, 64.6, 64.7, 70.3_

  - [~] 12.6 Implement Skeletons and the skeleton gate
    - `src/ui/skeleton/useSkeletonGate.ts` (`blank` for 150 ms, then `skeleton`, minimum 200 ms visible, errors bypass), `Skeleton.tsx` built from `CardFrame`, `ChartFrame` and `ListRow` at fixed heights, row count `ceil(visibleHeight / rowHeight)`, shimmer disabled under reduced motion.
    - Example tests with fake timers for data at 100 ms and at 400 ms.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/ui/skeleton`; commit `feat(ui): add skeleton loaders and gate`
    - _Requirements: 62.1, 62.2, 62.3, 62.4, 62.5_

  - [~] 12.7 Write property test for the skeleton gate
    - **Property 25: Skeleton gate timing**
    - **Validates: Requirements 62.1, 62.2, 62.3**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p25.property`; commit `test(ui): add skeleton gate property test (P25)`

  - [~] 12.8 Implement BlurHashImage
    - `src/ui/image/BlurHashImage.tsx` (fixed aspect box, 32 × 32 decode to data URL, 200 ms fade or instant under reduced motion, image-off icon on error, neutral placeholder SVG when no or invalid BlurHash), `blurhashCache.ts` (LRU).
    - Component tests: error keeps the BlurHash and shows the icon; missing BlurHash shows the neutral placeholder; no Toast.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/ui/image`; commit `feat(ui): add blurhash image placeholder`
    - _Requirements: 66.1, 66.2, 66.3, 14.9_

  - [~] 12.9 Implement view transitions
    - `src/ui/transitions/navigate.ts` (`useAppNavigate` using `viewTransition: true` when supported and motion allowed, skipping a running transition first, catching `finished` rejection), `RouteTransition.tsx` (200 ms CSS fallback keyed by `location.key`, 120 ms opacity under reduced motion, skipped for edge-swipe backs).
    - Example tests with a stubbed `document.startViewTransition`: called when available; a throwing transition still navigates.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/ui/transitions`; commit `feat(ui): add view transitions with fallback`
    - _Requirements: 67.1, 67.2, 67.3, 67.4, 67.5, 67.6, 67.7_

  - [~] 12.10 Implement the iOS edge swipe back
    - `src/ui/gestures/EdgeSwipeBack.tsx` (start at `clientX ≤ 20`, not on tab roots, not inside `[data-gesture="board"]`, previous screen kept mounted `inert` at −30 %, release at 35 % or 0.5 px/ms, snap back ≤ 250 ms) and `useUnsavedChanges(dirty)` (snap back and `ConfirmDiscard` on a qualifying release).
    - Component tests with simulated touch events: release past 35 % navigates back; a start inside the board area is ignored; dirty form asks first.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/ui/gestures`; commit `feat(ui): add edge swipe back gesture`
    - _Requirements: 69.1, 69.2, 69.3, 69.4, 69.5, 69.6_

  - [~] 12.11 Implement hardware keyboard shortcuts and hints
    - `src/ui/keyboard/useHardwareKeyboard.ts` (flag set on the first `keydown` outside text entry), `ShortcutHint.tsx`, `shortcuts.ts` (capture-phase listener: Cmd/Ctrl+K with `preventDefault`, Escape to the top sheet's `requestDismiss`, arrows to a registered handler when no text field is focused).
    - Example tests: hint hidden until a non-text keydown; Cmd+K calls the registered opener.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/ui/keyboard`; commit `feat(ui): add keyboard shortcuts and hints`
    - _Requirements: 73.1, 73.2, 73.3, 73.4_

  - [~] 12.12 Implement the progress ring, chart card, range selector and virtual list
    - `src/ui/ring/ProgressRing.tsx` (`fraction`, `variant: 'normal' | 'over'` with text label), `src/ui/chart/LineChartCard.tsx` (Recharts wrapper with marked points and gaps), `RangeSelector.tsx`, `src/ui/list/VirtualList.tsx` (fixed row height windowing).
    - Component tests: ring "over" variant shows its label; VirtualList renders only visible rows for 1,000 items.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/ui/ring src/ui/chart src/ui/list`; commit `feat(ui): add progress ring, chart card and virtual list`
    - _Requirements: 14.2, 25.3, 32.2, 38.5_

- [ ] 13. Command_Menu
  - [~] 13.1 Implement command ranking, recents and core commands
    - `src/core/command/logic/ranking.ts` (`matchClass`, `rankEntries` with memoised folded names), `recents.ts` (`core_meta.commandRecents`, dedupe, 20 stored, 5 shown), `coreCommands.ts` (Home, Settings, Export backup), `useAllCommands.ts` (core entries + each module's `useCommandEntries?.() ?? []`).
    - Example tests: each match class; ranking of 2,000 entries finishes in under 100 ms.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/core/command`; commit `feat(core): add command ranking, recents and core commands`
    - _Requirements: 2.3, 72.2, 72.3, 72.4, 72.5, 72.7, 72.9_

  - [~] 13.2 Write property test for Command_Menu ranking
    - **Property 27: Command_Menu ranking**
    - **Validates: Requirements 72.3, 72.9**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p27.property`; commit `test(core): add command ranking property test (P27)`

  - [~] 13.3 Implement the Command_Menu sheet
    - `src/ui/command/CommandMenu.tsx`: opened from the header button or Cmd/Ctrl+K with the input focused; empty query shows "Recent" then all entries by type; selection closes, records the recent, checks `exists?.()` (false → keep open, drop entry, Toast "This item no longer exists"), disables `needsNetwork` entries offline with the offline note, then runs.
    - Component test: keyboard flow (open with Cmd+K, type, arrow down, Enter runs the entry).
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/ui/command`; commit `feat(ui): add command menu sheet`
    - _Requirements: 72.1, 72.5, 72.6, 72.8, 73.1_

- [ ] 14. App shell, start-up gate, dashboard and Settings_Screen
  - [~] 14.1 Implement the start-up gate and first-run Profile
    - `src/app/StartupGate.tsx`: `validateRegistry(MODULES)` first (full-screen `RegistryErrorScreen` naming every problem; database not opened), then `openDatabase()` with the three blocking screens (newer version → reload; migration failed → "no data was lost" + emergency export; unavailable → Retry), then `requestPersistOnce()` without awaiting, then `FirstRunProfile` when no Profile exists.
    - `src/app/FirstRunProfile.tsx`: six empty fields, `validateProfile` on save, nothing stored until valid.
    - `src/main.tsx`: boot through `StartupGate`; start `updateService`.
    - Component tests: invalid registry renders the error and no tabs; each open failure screen; first-run save with an invalid field stores nothing.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/app`; commit `feat(app): add start-up gate and first-run profile`
    - _Requirements: 1.6, 2.5, 3.3, 3.4, 3.6, 3.7, 4.4, 4.8_

  - [~] 14.2 Implement the router, AppShell, tab bar and Home_Dashboard
    - `src/app/router.tsx` (core routes `/` and `/settings` plus `MODULES.flatMap(m => m.routes)`, `basename = import.meta.env.BASE_URL`, route-level `ErrorBoundary`), `AppShell.tsx` (header with search button, outlet inside `EdgeSwipeBack` and `RouteTransition`, tab bar Home + modules in registry order, every module `Overlay` and `StartupPrompt`, `ToastHost`, `CommandMenu`, update Toast bound to `updateService`, `OfflineNotice`, safe-area padding).
    - `src/app/HomeDashboard.tsx`: backup reminder banner ("Export now", "Remind me later") using `shouldShowBackupReminder`, then each module card in an `ErrorBoundary` with the "{name} could not be loaded" placeholder.
    - Component tests: tabs in registry order; a throwing card shows the placeholder and other cards render; Undo_Toast stays visible across navigation; offline notice toggles with `online`/`offline` events; banner hides after a successful export and stays after a dismissed share.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/app`; commit `feat(app): add router, app shell, tabs and home dashboard`
    - _Requirements: 1.5, 1.10, 2.3, 2.7, 2.10, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 10.1, 10.2, 70.2_

  - [~] 14.3 Implement the Settings_Screen with Profile, Backup interval, module sections and About
    - `src/app/SettingsScreen.tsx`: sections Profile, Backup, Gym, Nutrition, Chess, About in this order (module sections from `MODULES[i].settings.Section`).
    - Profile section: the six fields with inline accepted range and step, error Toast on write failure, entered values kept.
    - `src/app/settings/BackupSection.tsx`: reminder interval (3, 7, 14, 30, off); export and import controls are added in task 14.4.
    - `src/core/about/licences.ts` (design verification item 4: read each project's LICENSE in `node_modules` or the project page and record the licence names) and the About section: App version, build date (UTC, YYYY-MM-DD), licence entries with links (Stockfish with an extra source link), persistent storage status and "Offline ready: yes/no".
    - Component tests: section order; About lists all six projects; storage status falls back to the recorded result.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/app src/core/about`; commit `feat(app): add settings screen with profile and about sections`
    - _Requirements: 1.7, 4.1, 4.2, 4.3, 4.5, 4.6, 4.7, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

  - [~] 14.4 Implement backup export and import screens with the rejection-message component test
    - `BackupSection.tsx`: "Export backup" running `exportBackup()` with success and error Toasts; "Import backup" file picker → `checkBackupFile` → confirmation `Sheet` (local export time, record count per present module, absent modules marked unchanged, replacement warning) → `applyImport` → result Toast listing skipped ids; cancel or picker dismissal changes nothing.
    - Component test (R74.7): one case per R7 message using crafted files (empty, invalid JSON, wrong format, newer schema, newer module version, failing migration, invalid record with section, position and field, unreadable file).
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/app`; commit `feat(app): add backup export and import screens`
    - _Requirements: 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 7.1, 7.2, 7.3, 7.4, 7.5, 7.7, 7.8, 7.12, 7.13, 7.14, 9.5, 74.7_

- [~] 15. Checkpoint: UI kit and app shell
  - Run `npm run typecheck`, `npx vitest --run` and `npm run build`; fix any failure and commit fixes with `fix(ui): …` or `fix(app): …`.
  - Ensure all tests pass, ask the user if questions arise.

## Part 3: Gym module

- [ ] 16. Gym domain model and Exercise_Build_Script
  - [~] 16.1 Define Gym constants, types, zod schemas and generators
    - `src/modules/gym/constants.ts` (exactly the design constants), `schema.ts` (zod schemas for `LibraryExercise`, `LibraryState`, `CustomExercise`, `Routine`, `RoutineItem`, `SetRecord`, `SessionEntry`, `Session`, `BackupImage` and the Gym backup data object), `types.ts` (`z.infer` types plus the `Exercise` view model).
    - `src/test/arbitraries/gym.ts`: `arbWeight2dp`, `arbReps`, `arbSetRecord`, `arbSession`, `arbSessions`, `arbExerciseMap`, `arbRoutine`.
    - Example test: schemas accept generated records and reject a Set with 1001 kg.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/gym`; commit `feat(gym): add gym constants, types, schemas and generators`
    - _Requirements: 8.4, 13.3, 16.7, 18.7, 19.1, 23.10_

  - [~] 16.2 Implement the pure exercise normalisation library
    - `scripts/lib/exercises.ts`: `normaliseExercise(raw, index)` (`ok` / `excluded` / `fatal`), `findDuplicateIds`, `sortById`, and `serialiseExercises` with fixed key order and no timestamps.
    - Example tests: whitespace and case variants of muscles map to canonical spelling; missing equipment → `other`; blank name → excluded with reason; unknown level → fatal.
    - Verify and commit: `npm run typecheck`; `npx vitest --run scripts`; commit `feat(gym): add exercise source normalisation`
    - _Requirements: 13.1, 13.3, 13.4, 13.8_

  - [~] 16.3 Write property test for exercise normalisation
    - **Property 32: Exercise source normalisation**
    - **Validates: Requirements 13.1, 13.3, 13.4, 13.8**
    - Oracle in `src/test/oracles/exercises.ts`; test file under `scripts/__tests__/`.
    - Verify and commit: `npm run typecheck`; `npx vitest --run p32.property`; commit `test(gym): add exercise normalisation property test (P32)`

  - [~] 16.4 Implement the Exercise_Build_Script CLI with fixture-based tests
    - `scripts/build-exercises.ts`: `--src <free-exercise-db checkout> --out <dir>`; read `dist/exercises.json`; run all fatal checks first and exit non-zero before writing; resize images with `sharp` (`fit: 'inside'`, 600 px, `withoutEnlargement`, JPEG quality 80); BlurHash from a 32 × 32 raw render with `encode(…, 4, 3)`; drop and print missing or undecodable images; write into a temp directory and rename over the output only on success; print included and excluded counts.
    - `scripts/fixtures/free-exercise-db/`: 5 exercises with small images, including one missing and one corrupt image, plus a fatal-input variant.
    - `scripts/__tests__/build-exercises.test.ts`: two runs into two temp directories are byte-identical (every file); fatal input exits non-zero and leaves an existing output directory unchanged; images are at most 600 px on the long side and small images are not enlarged.
    - Verify and commit: `npm run typecheck`; `npx vitest --run scripts`; commit `feat(gym): add exercise build script with fixture tests`
    - _Requirements: 13.1, 13.2, 13.4, 13.5, 13.8, 13.9, 74.6_

- [ ] 17. Gym strength metrics and PR detection
  - [~] 17.1 Implement strength metrics, entry parsing and weight display
    - `src/modules/gym/logic/metrics.ts` (`isValidStoredSet`, `isCompletedSet`, `e1rm`, `setVolume`, `exerciseVolume`, `sessionVolume`, `topWeight`, `bestE1rm`, `topSet`, `sessionDurationMs`, `volumeChange`), `entry.ts` (`parseWeight`, `parseReps`, `canComplete`), `format.ts` (`formatWeight`, `formatE1rm`, `formatVolume`).
    - Example tests: E1RM 100 kg × 5 displays 116.7 kg (R74.5 reference); `volumeChange(0, undefined)` is `first`; no `pct` when the previous volume is 0.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/gym/logic`; commit `feat(gym): add strength metrics and set entry parsing`
    - _Requirements: 19.1, 19.6, 19.7, 19.8, 19.9, 22.2, 22.5, 22.8, 23.1, 23.2, 23.3, 23.4, 23.5, 23.6, 23.7, 23.8, 23.9, 23.10_

  - [~] 17.2 Write property test for weight and reps parsing
    - **Property 47: Weight and reps parsing**
    - **Validates: Requirements 19.1, 19.9**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p47.property`; commit `test(gym): add weight and reps parsing property test (P47)`

  - [~] 17.3 Write property test for weight display
    - **Property 49: Weight display**
    - **Validates: Requirements 19.6, 23.8**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p49.property`; commit `test(gym): add weight display property test (P49)`

  - [~] 17.4 Write property test for the completion gate
    - **Property 50: Completion gate**
    - **Validates: Requirements 19.7, 19.8**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p50.property`; commit `test(gym): add completion gate property test (P50)`

  - [~] 17.5 Write property test for session duration
    - **Property 54: Duration is never negative**
    - **Validates: Requirements 22.2**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p54.property`; commit `test(gym): add session duration property test (P54)`

  - [~] 17.6 Write property test for top set selection
    - **Property 56: Top set selection**
    - **Validates: Requirements 22.5**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p56.property`; commit `test(gym): add top set property test (P56)`

  - [~] 17.7 Write property test for E1RM
    - **Property 58: E1RM formula and monotonicity**
    - **Validates: Requirements 23.1, 23.6**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p58.property`; commit `test(gym): add e1rm property test (P58)`

  - [~] 17.8 Write property test for volume additivity
    - **Property 59: Volume additivity**
    - **Validates: Requirements 23.3, 23.7**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p59.property`; commit `test(gym): add volume additivity property test (P59)`

  - [~] 17.9 Write property test for aggregates over valid sets
    - **Property 60: Aggregates use only valid Completed_Sets**
    - **Validates: Requirements 23.4, 23.5, 23.9, 23.10**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p60.property`; commit `test(gym): add valid-set aggregates property test (P60)`

  - [~] 17.10 Implement the PR_Detector
    - `src/modules/gym/logic/pr.ts`: `completionOrder`, `PriorStats`, `statsOf`, `evaluateAgainst`, `detectPrs` (one pass with a max-Fenwick tree over distinct weights in descending order), `prInputsForExercise` (Finished and Active Sessions), and a memoised selector `prMarksFor(sessions, exerciseId)`.
    - Example tests: first set gets `[]`; equal weight is not a weight PR; E1RM gain of exactly 0.001 kg is not a PR; rep PR needs a prior set with weight ≥ the current weight.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/gym/logic`; commit `feat(gym): add PR detector`
    - _Requirements: 24.1, 24.2, 24.3, 24.4, 24.5, 24.6, 24.8, 24.9, 24.10, 24.11, 24.12, 24.13_

  - [~] 17.11 Write property test for PR detection against the reference model
    - **Property 61: PR detection matches the reference model**
    - **Validates: Requirements 24.1, 24.2, 24.3, 24.4, 24.5, 24.6, 24.11, 24.12**
    - Naive O(n²) oracle in `src/test/oracles/pr.ts`.
    - Verify and commit: `npm run typecheck`; `npx vitest --run p61.property`; commit `test(gym): add PR reference-model property test (P61)`

  - [~] 17.12 Write property test for incremental PR evaluation
    - **Property 62: Incremental and one-pass PR marks agree**
    - **Validates: Requirements 24.9**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p62.property`; commit `test(gym): add incremental PR property test (P62)`

  - [~] 17.13 Write property test for maximum weight provenance
    - **Property 63: Maximum weight comes from the first set or a weight PR**
    - **Validates: Requirements 24.10**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p63.property`; commit `test(gym): add max weight provenance property test (P63)`

- [ ] 18. Gym session, rest timer and routine logic
  - [~] 18.1 Implement set pre-fill
    - `src/modules/gym/logic/prefill.ts`: `referenceSets`, `prefillFor`, `previousLabel`; draft sources `'prefill'`/`'owner'`.
    - Example tests: fewer reference sets than drafts reuse the last one; no history with a routine item pre-fills only reps.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/gym/logic`; commit `feat(gym): add set pre-fill from history`
    - _Requirements: 19.2, 19.3, 19.4, 19.5, 19.6, 19.10_

  - [~] 18.2 Write property test for pre-fill
    - **Property 48: Pre-fill from the latest finished session**
    - **Validates: Requirements 19.2, 19.3, 19.4**
    - Oracle in `src/test/oracles/prefill.ts`.
    - Verify and commit: `npm run typecheck`; `npx vitest --run p48.property`; commit `test(gym): add pre-fill property test (P48)`

  - [~] 18.3 Implement session editing operations and the session reducer
    - `src/modules/gym/logic/session.ts` (part 1): `startFromRoutine`, `startEmpty`, `addExercises`, `addSet` (no-op at 20 sets), `removeSet`, `removeEntry`, `restoreRemoved`, `moveEntry`, `editSetField`, `completeSet` (sets `completedAt`, starts the rest timer with the entry's `restSec` or the default), `uncompleteSet`, and `sessionReducer` dispatching these. Ids and time come from an injected context.
    - Example tests: starting from a routine with 3 × 8–12 gives 3 drafts; removing the last Set keeps the empty entry.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/gym/logic`; commit `feat(gym): add active session editing operations`
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.8, 18.9, 19.5, 19.7, 19.10, 20.1_

  - [~] 18.4 Implement session finishing, resume decisions and summary logic
    - `src/modules/gym/logic/session.ts` (part 2): `finishPlan`, `finish`, `lastCompletionTime`, `resumeDecision` (`RESUME_STALE_MS`); `src/modules/gym/logic/summary.ts`: `sessionSummary(session, history)` with duration, Completed_Set count, total volume, top set per exercise, PR list and volume change against the most recent earlier finished session containing the exercise.
    - Example tests: resume threshold at exactly 10,800 s; finishing with zero completed sets returns the "no completed sets" plan.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/gym/logic`; commit `feat(gym): add session finishing, resume and summary logic`
    - _Requirements: 21.2, 21.4, 21.5, 21.6, 22.1, 22.3, 22.4, 22.5, 22.8_

  - [~] 18.5 Implement Rest_Timer arithmetic
    - `src/modules/gym/logic/restTimer.ts`: `startRest`, `minus15`, `plus15`, `remainingLabel`.
    - Example tests: `minus15` with exactly 15 s left ends the countdown; `plus15` caps at 600 s.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/gym/logic`; commit `feat(gym): add rest timer arithmetic`
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5_

  - [~] 18.6 Implement Routine operations and validation
    - `src/modules/gym/logic/routine.ts`: `appendItems` (defaults 3 × 8–12, no rest), `moveItem`, `moveUp`, `moveDown`, `validateItemField`, `validateRoutineName`, plus the 50-item cap.
    - Example tests: rest 20 s is rejected; min 12 > max 10 is rejected.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/gym/logic`; commit `feat(gym): add routine operations and validation`
    - _Requirements: 17.1, 17.3, 17.4, 17.5, 17.6, 17.9, 17.10, 17.11_

  - [~] 18.7 Write property test for reordering
    - **Property 41: Reordering preserves contents**
    - **Validates: Requirements 17.5, 17.6, 18.9**
    - Cover both `moveItem` (Routine_Items) and `moveEntry` (Session entries).
    - Verify and commit: `npm run typecheck`; `npx vitest --run p41.property`; commit `test(gym): add reorder property test (P41)`

  - [~] 18.8 Write property test for appending picked exercises
    - **Property 42: Appending picked exercises**
    - **Validates: Requirements 17.11**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p42.property`; commit `test(gym): add routine append property test (P42)`

  - [~] 18.9 Write property test for routine field validation
    - **Property 40: Routine field validation**
    - **Validates: Requirements 17.1, 17.3, 17.4, 17.9, 17.10**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p40.property`; commit `test(gym): add routine validation property test (P40)`

  - [~] 18.10 Write property test for starting from a routine
    - **Property 43: Starting from a routine mirrors it**
    - **Validates: Requirements 18.1**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p43.property`; commit `test(gym): add start-from-routine property test (P43)`

  - [~] 18.11 Write property test for adding exercises and sets
    - **Property 44: Adding exercises and sets**
    - **Validates: Requirements 18.3, 18.4**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p44.property`; commit `test(gym): add add-exercise and add-set property test (P44)`

  - [~] 18.12 Write property test for remove and restore
    - **Property 46: Remove then restore is identity**
    - **Validates: Requirements 18.8**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p46.property`; commit `test(gym): add remove-restore property test (P46)`

  - [~] 18.13 Write property test for rest timer arithmetic
    - **Property 51: Rest timer arithmetic**
    - **Validates: Requirements 20.3, 20.4**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p51.property`; commit `test(gym): add rest timer property test (P51)`

  - [~] 18.14 Write property test for the last set time
    - **Property 53: Finish at last set time**
    - **Validates: Requirements 21.5**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p53.property`; commit `test(gym): add last set time property test (P53)`

  - [~] 18.15 Write property test for finishing a session
    - **Property 55: Finishing keeps exactly the Completed_Sets**
    - **Validates: Requirements 22.3**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p55.property`; commit `test(gym): add finish session property test (P55)`

  - [~] 18.16 Write property test for the volume change baseline
    - **Property 57: Volume change baseline**
    - **Validates: Requirements 22.8**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p57.property`; commit `test(gym): add volume change baseline property test (P57)`

- [ ] 19. Gym library, split analysis and chart logic
  - [~] 19.1 Implement Exercise_Library filters and Custom_Exercise validation
    - `src/modules/gym/logic/library.ts` (`sortExercises`, `matchesText`, `matchesMuscles`, `matchesEquipment`, `filterExercises`, `muscleOptions`, `equipmentOptions`), `exerciseForm.ts` (`validateCustomExercise`, `findDuplicateName` ignoring archived exercises and the edited one, `archiveImpact(routines, exerciseId)`).
    - Example tests: "  squat " matches "Barbell Squat"; secondary toggle off ignores secondary muscles.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/gym/logic`; commit `feat(gym): add library filters and custom exercise validation`
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 15.1, 15.4, 15.7, 16.2_

  - [~] 19.2 Write property test for library sort order
    - **Property 33: Exercise_Library sort order**
    - **Validates: Requirements 14.1**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p33.property`; commit `test(gym): add library sort property test (P33)`

  - [~] 19.3 Write property test for library filter intersection
    - **Property 34: Library filters intersect**
    - **Validates: Requirements 14.2, 14.3, 14.4, 14.5, 14.6**
    - Oracle in `src/test/oracles/library.ts`.
    - Verify and commit: `npm run typecheck`; `npx vitest --run p34.property`; commit `test(gym): add library filter property test (P34)`

  - [~] 19.4 Write property test for Custom_Exercise validation
    - **Property 35: Custom_Exercise validation**
    - **Validates: Requirements 15.1, 15.7**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p35.property`; commit `test(gym): add custom exercise validation property test (P35)`

  - [~] 19.5 Write property test for duplicate name detection
    - **Property 36: Duplicate name detection**
    - **Validates: Requirements 15.4**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p36.property`; commit `test(gym): add duplicate name property test (P36)`

  - [~] 19.6 Write property test for the archive confirmation
    - **Property 37: Archive confirmation lists affected routines**
    - **Validates: Requirements 16.2**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p37.property`; commit `test(gym): add archive confirmation property test (P37)`

  - [~] 19.7 Implement the Split_Analyzer
    - `src/modules/gym/logic/split.ts`: `analyseSplit` (window, weekly sets with 1 / 0.5 counting, classes, frequency by distinct start dates, flags in R27.12 order, empty-week message), `formatSets`, flag message builders.
    - Example tests: 9.5 low, 10 and 20 in range, 20.5 high; push/pull ratio exactly 1.5 gives no flag; one side zero gives the one-sided flag.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/gym/logic`; commit `feat(gym): add split analyzer`
    - _Requirements: 26.1, 26.2, 26.3, 26.4, 26.5, 26.6, 26.7, 26.11, 27.1, 27.2, 27.3, 27.4, 27.5, 27.6, 27.7, 27.8, 27.9, 27.10, 27.11, 27.12_

  - [~] 19.8 Write property test for weekly set counting
    - **Property 65: Weekly sets match the reference count**
    - **Validates: Requirements 26.1, 26.2, 26.4, 26.11**
    - Oracle in `src/test/oracles/split.ts`.
    - Verify and commit: `npm run typecheck`; `npx vitest --run p65.property`; commit `test(gym): add weekly sets reference property test (P65)`

  - [~] 19.9 Write property test for weekly set conservation
    - **Property 66: Weekly sets are conserved**
    - **Validates: Requirements 26.5**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p66.property`; commit `test(gym): add weekly sets conservation property test (P66)`

  - [~] 19.10 Write property test for order independence
    - **Property 67: Split analysis is order-independent**
    - **Validates: Requirements 26.6**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p67.property`; commit `test(gym): add split order independence property test (P67)`

  - [~] 19.11 Write property test for split monotonicity
    - **Property 68: Adding a set never lowers weekly sets**
    - **Validates: Requirements 26.7**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p68.property`; commit `test(gym): add split monotonicity property test (P68)`

  - [~] 19.12 Write property test for split flags
    - **Property 69: Split flags match the reference rules**
    - **Validates: Requirements 27.1, 27.2, 27.3, 27.4, 27.5, 27.6, 27.7, 27.8, 27.10, 27.11, 27.12**
    - Oracle in `src/test/oracles/splitFlags.ts`.
    - Verify and commit: `npm run typecheck`; `npx vitest --run p69.property`; commit `test(gym): add split flags property test (P69)`

  - [~] 19.13 Implement progress chart and dashboard statistics
    - `src/modules/gym/logic/charts.ts` (`chartPoints`, `inRange` with `monthsBack`), `dashboard.ts` (`gymCardStats`, `elapsedLabel`).
    - Example tests: range `3m` boundary day; `lowOrUntrained` counts tracked muscles under 10 sets.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/gym/logic`; commit `feat(gym): add progress chart and dashboard statistics`
    - _Requirements: 25.3, 25.4, 25.5, 28.1, 28.2, 28.5_

  - [~] 19.14 Write property test for chart points
    - **Property 64: Chart points**
    - **Validates: Requirements 25.3, 25.5**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p64.property`; commit `test(gym): add chart points property test (P64)`

- [ ] 20. Gym data access and module wiring
  - [~] 20.1 Implement exercise data access
    - `src/modules/gym/data/exercises.ts`: `useLibrary()` (fetch precached `exercises/exercises.json` once per run, error state), `useExercises()` (library + custom + archive flags, live), `createCustomExercise` via `createIdempotent` with the photo stored in `gym_images`, `updateCustomExercise`, `archiveExercise` (one write: archive flag + removal of every referencing Routine_Item, `recordDiffUndo('Exercise archived', …)`), `restoreExercise` (never re-adds Routine_Items), `getImageUrl` for stored photos.
    - Data tests on fake-indexeddb: archive removes routine items and Undo restores them; image read failure is reported.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/gym/data`; commit `feat(gym): add exercise data access with archive and undo`
    - _Requirements: 14.7, 14.8, 15.2, 15.3, 15.5, 15.6, 15.8, 16.1, 16.3, 16.4, 16.5, 16.6, 16.7, 16.8, 16.9, 16.11_

  - [~] 20.2 Implement Routine data access
    - `src/modules/gym/data/routines.ts`: create via `createIdempotent`, edits written as whole records through `enqueueWrite(routineId)`, delete with `recordDiffUndo`, `useRoutines()` sorted by `createdAt`.
    - Data tests: two quick edits apply in order; delete + Undo restores the routine with the same id and key.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/gym/data`; commit `feat(gym): add routine data access`
    - _Requirements: 17.2, 17.7, 17.8, 17.9, 64.2, 64.3_

  - [~] 20.3 Implement Session data access and the Autosaver
    - `src/modules/gym/data/sessions.ts`: `startSession(plan)` (double-tap guard + `rw` transaction conflict check), `discardAndStart` with Undo, `Autosaver` (debounced `put` within 500 ms of the first pending change, `revertTo(lastStored)` + error Toast on failure, `flush()`), `finishSession`, `editFinishedSet`, `deleteFinishedSet` with Undo, domain-specific undo for removing a Set or Exercise from the Active Session (re-insert into the current Session), `useActiveSession()`, `useFinishedSessions()`.
    - Data tests with fake timers: change persisted within 500 ms; failed `put` reverts the in-memory session; `flush` resolves after the write.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/gym/data`; commit `feat(gym): add session persistence and autosaver`
    - _Requirements: 10.4, 18.5, 18.6, 18.7, 18.8, 21.1, 21.3, 21.7, 22.1, 22.6, 22.7_

  - [~] 20.4 Implement the exercise photo download
    - `src/modules/gym/data/photoDownload.ts`: count cached images in `exercise-images-v1`, fetch missing ones with concurrency 4 and a 30 s timeout, `cache.put` on HTTP 200 only, report "N of M", stop on `QuotaExceededError`, return the cached count for the result Toast.
    - Tests with a mocked Cache API and `fetch`: rerun requests only missing images; quota stops further requests.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/gym/data`; commit `feat(gym): add exercise photo download`
    - _Requirements: 13.7, 13.10_

  - [~] 20.5 Implement Gym backup and the full Gym ModuleDefinition
    - `src/modules/gym/data/backup.ts`: `exportData` (custom exercises, library state, routines, sessions, images as base64 with MIME type), `importData` inside the caller's transaction, `backup.schema` and `sections()` in the design order.
    - `src/modules/gym/data/trainingLog.ts`: `provides.trainingLog.listFinishedSessions()`.
    - `src/modules/gym/index.ts`: every route from the design table, each lazily loading its screen file under `src/modules/gym/ui/screens/` (create placeholder screens now; tasks 21.x replace them), `useCommandEntries` (non-archived exercises, routines, "Gym" screen, "Start workout" action), `Overlay` (`ui/ActiveSessionLink.tsx` placeholder), `StartupPrompt` (`ui/ResumePrompt.tsx` placeholder), `lifecycle.flushPendingWrites` (Autosaver flush), `settings.Section` (`ui/GymSettingsSection.tsx` placeholder), `DashboardCard` (`ui/GymDashboardCard.tsx` placeholder).
    - Example test: export → clear → import restores equal records for a small fixture state.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/gym`; commit `feat(gym): add gym backup and module wiring`
    - _Requirements: 2.1, 2.3, 2.7, 6.2, 8.4, 10.4, 20.7, 21.2, 29.2, 72.2_

  - [~] 20.6 Write property test for Gym referential invariants
    - **Property 38: Gym referential invariants**
    - **Validates: Requirements 16.3, 16.7, 16.9**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p38.property`; commit `test(gym): add referential invariants property test (P38)`

  - [~] 20.7 Write property test for archiving and history
    - **Property 39: Archiving does not change history-derived values**
    - **Validates: Requirements 16.4**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p39.property`; commit `test(gym): add archive history property test (P39)`

  - [~] 20.8 Write property test for a single Active Session
    - **Property 45: At most one Active Session**
    - **Validates: Requirements 18.7**
    - Two Dexie instances on the same fake-indexeddb database simulate two windows.
    - Verify and commit: `npm run typecheck`; `npx vitest --run p45.property`; commit `test(gym): add single active session property test (P45)`

  - [~] 20.9 Write property test for Active Session persistence
    - **Property 52: Active Session persistence round trip**
    - **Validates: Requirements 21.3**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p52.property`; commit `test(gym): add active session persistence property test (P52)`

- [ ] 21. Gym screens
  - [~] 21.1 Build the Gym start screen, Exercise_Library and exercise detail
    - Gym start screen (Start workout, Resume, Routines, History, Split analysis, Library).
    - Library screen: search, muscle and equipment filters, secondary toggle, `VirtualList`, empty state, state restored when returning from detail (module-level store; toggle resets on a new launch), Skeleton gate.
    - Detail screen: photos with `BlurHashImage` (offline placeholder), muscles, equipment, instructions, link to chart.
    - Component tests: filtering updates the list; returning from detail restores query and scroll.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/gym/ui`; commit `feat(gym): add exercise library and detail screens`
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 14.8, 14.9, 14.10, 13.6, 66.1_

  - [~] 21.2 Build the Custom_Exercise form, archive flow and Gym settings section
    - Custom_Exercise form (create and edit): name, primary and secondary muscle pickers, equipment, one photo through `processImage` (1024 px, quality 0.85), duplicate-name warning, inline errors, dirty-sheet confirmation.
    - Archive action on the detail screen with the confirmation listing affected Routines and item counts, then Undo_Toast.
    - `GymSettingsSection.tsx`: default rest time (30–600 in 15 s steps), rest sound switch, "Download all exercise photos" with "N of M" and disabled button while running, archived exercises sorted by name with "Restore" and an empty state.
    - Component tests: invalid form names every failing field; archive confirmation lists routines.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/gym/ui`; commit `feat(gym): add custom exercise form, archive flow and gym settings`
    - _Requirements: 5.2, 13.7, 13.10, 15.1, 15.2, 15.3, 15.4, 15.5, 15.7, 15.8, 15.9, 16.1, 16.2, 16.5, 16.6, 16.8, 16.9, 16.10_

  - [~] 21.3 Build the Routine list and Routine_Builder
    - Routine list (create, delete with Undo, empty state) and builder: name field, exercise picker appending items, per-item target sets, rep range and rest fields with inline validation, drag reorder plus "Move up" / "Move down", remove item.
    - Component tests: invalid rep range shows the message and keeps the stored item; move down reorders.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/gym/ui`; commit `feat(gym): add routine list and builder screens`
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7, 17.8, 17.9, 17.10, 17.11_

  - [~] 21.4 Build Session_Logger part 1: start, conflict, resume and exercise list
    - Start choice sheet (routine or empty), conflict sheet when a Session is Active ("Resume current" / "Discard and start new" with confirmation and Undo), `ResumePrompt.tsx` for fresh and stale sessions (with and without completed sets), `/gym/session` screen with entries, add-exercise picker, entry reorder and remove with Undo, " (archived)" suffix.
    - Component tests: starting while another Session is Active shows the conflict; stale prompt offers finish at last set time.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/gym/ui`; commit `feat(gym): add session start, conflict and resume flows`
    - _Requirements: 16.11, 18.1, 18.2, 18.3, 18.5, 18.6, 18.7, 18.8, 18.9, 18.10, 21.2, 21.4, 21.6_

  - [~] 21.5 Build Session_Logger part 2: set rows, PR labels, rest timer and autosave wiring
    - Set rows: weight and reps `NumberField`s with pre-fill styling, "previous" label, complete button gated by `canComplete`, swipe-to-delete with Undo, add set (disabled at 20), PR highlight and labels from `prMarksFor`.
    - Rest timer: full timer on the session screen and `ActiveSessionLink.tsx` overlay with compact timer on every other route; −15 s, +15 s, skip; foreground alert; sound `public/sounds/rest-done.m4a` (≤ 2 s; generate it with a small script; if no AAC encoder is available, generate a WAV and add `wav` to the precache glob) played through an `HTMLAudioElement` primed on the first tap, failures swallowed, respecting `gym.restSound`.
    - Autosave wiring through the `Autosaver` with revert and error Toast on failure.
    - Component tests: completing a set starts the timer; a PR label appears for a new best weight.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/gym/ui`; commit `feat(gym): add set rows, rest timer and autosave wiring`
    - _Requirements: 19.1, 19.2, 19.5, 19.6, 19.7, 19.8, 19.10, 20.1, 20.2, 20.3, 20.4, 20.5, 20.6, 20.7, 20.8, 20.9, 21.1, 21.7, 24.7_

  - [~] 21.6 Build Session_Logger part 3: finishing and the summary
    - Finish flow: confirmation when incomplete sets exist, "no completed sets" prompt (Discard session with Undo / Keep logging), summary sheet with duration, Completed_Set count, total volume, top set per exercise, PR list and volume change per exercise; Finished Session editing under the R19.1 ranges.
    - Component tests: finishing with incomplete sets asks first and drops them; summary shows "first" for a new exercise.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/gym/ui`; commit `feat(gym): add session finish flow and summary`
    - _Requirements: 22.1, 22.2, 22.3, 22.4, 22.5, 22.6, 22.7, 22.8, 22.9_

  - [~] 21.7 Build history, Finished Session detail and the progress chart
    - History list (newest first, Skeleton, empty state), Finished Session detail (sets, PR marks, edit and delete with Undo), progress chart screen with metric selector (top weight, best E1RM, volume), range selector (1m, 3m, 6m, 1y, all) and PR-marked points.
    - Component tests: chart shows one point per finished session in range.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/gym/ui`; commit `feat(gym): add history and progress chart screens`
    - _Requirements: 25.1, 25.2, 25.3, 25.4, 25.5, 25.6, 25.7, 25.8_

  - [~] 21.8 Build the split analysis screen and the Gym DashboardCard
    - Split screen: weekly sets per muscle with classes, flags in order, session count, previous/next week controls ("next" disabled at today), empty-week message.
    - `GymDashboardCard.tsx`: sessions in the last 7 days, last session date and routine, low or untrained muscle count, Active Session elapsed time, Skeleton and error panel with Retry.
    - Component tests: next week disabled at today; card shows the elapsed label for an Active Session.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/gym/ui`; commit `feat(gym): add split analysis screen and dashboard card`
    - _Requirements: 26.8, 26.9, 26.10, 27.9, 27.11, 28.1, 28.2, 28.3, 28.4, 28.5, 28.6_

  - [~] 21.9 Write the Session logging component test with autosave and resume
    - `src/modules/gym/ui/__tests__/sessionLogging.test.tsx` (R74.7): start from a routine, edit and complete sets (PR label appears), advance fake timers past 500 ms, unmount, remount → resume prompt → identical state; stale prompt after 3 h with and without completed sets; finish with incomplete sets confirmation; autosave failure revert.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/gym/ui`; commit `test(gym): add session logging autosave and resume component test`
    - _Requirements: 21.1, 21.2, 21.3, 21.4, 21.7, 22.3, 74.7_

- [~] 22. Checkpoint: Gym module
  - Run `npm run typecheck`, `npx vitest --run` and `npm run build`; fix any failure and commit fixes with `fix(gym): …`.
  - Ensure all tests pass, ask the user if questions arise.

## Part 4: Nutrition module

- [ ] 23. Nutrition domain model and Energy_Calculator
  - [~] 23.1 Define Nutrition constants, types, zod schemas and generators
    - `src/modules/nutrition/constants.ts` (exactly the design constants), `schema.ts` (zod schemas for `FoodEntry`, `SavedMeal`, `SavedMealItem`, `DayMark`, `Product`, `WeightEntry`, the state records and the Nutrition backup data object), `types.ts`.
    - `src/test/arbitraries/nutrition.ts`: `arbFoodEntry`, `arbSavedMeal`, `arbWeightEntries`, `arbDayMarks`, `arbOffProduct`, `arbProfile`, `arbTrainingSessions`.
    - Example test: schemas accept generated records and reject a Food_Entry with 5001 kcal.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/nutrition`; commit `feat(nutrition): add nutrition constants, types, schemas and generators`
    - _Requirements: 8.4, 31.2, 38.1_

  - [~] 23.2 Implement the Energy_Calculator
    - `src/modules/nutrition/logic/energy.ts`: `bmr`, `currentWeight`, `loggedTrainingHours`, `effectiveTrainingHours`, `activityFactor`, `computeEnergy`, `calorieTarget`, `proteinTarget`, `proteinFactorFor`; no intermediate rounding.
    - Reference example tests (R74.5): Mifflin male W 80, H 180, A 30 → 1780; female W 60, H 165, A 25 → 1345.25; logged hours with earliest session 3 days ago and sessions 1 h, 1.5 h, 5 h → 6.5 h and factor 1.725; earliest 60 days ago with capped sum 12 h → 3.0 h and factor 1.55; factor boundaries 0.99 → 1.2 and 1 → 1.375; calorie floor for each sex.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/nutrition/logic`; commit `feat(nutrition): add energy calculator`
    - _Requirements: 29.1, 29.2, 29.3, 29.4, 29.5, 29.7, 29.8, 29.9, 29.10, 29.12, 30.1, 30.3, 30.4, 30.5, 30.6, 30.7, 30.8, 30.10_

  - [~] 23.3 Write property test for current weight selection
    - **Property 70: Current weight selection**
    - **Validates: Requirements 29.1, 38.6**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p70.property`; commit `test(nutrition): add current weight property test (P70)`

  - [~] 23.4 Write property test for the energy pipeline
    - **Property 71: Energy pipeline matches the reference**
    - **Validates: Requirements 29.2, 29.3, 29.4, 29.5**
    - Oracle in `src/test/oracles/energy.ts`.
    - Verify and commit: `npm run typecheck`; `npx vitest --run p71.property`; commit `test(nutrition): add energy pipeline property test (P71)`

  - [~] 23.5 Write property test for BMR metamorphic relations
    - **Property 72: BMR metamorphic relations**
    - **Validates: Requirements 29.9**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p72.property`; commit `test(nutrition): add BMR metamorphic property test (P72)`

  - [~] 23.6 Write property test for TDEE monotonicity
    - **Property 73: TDEE is monotone in training hours**
    - **Validates: Requirements 29.10**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p73.property`; commit `test(nutrition): add TDEE monotonicity property test (P73)`

  - [~] 23.7 Write property test for the calorie floor
    - **Property 74: Calorie floor**
    - **Validates: Requirements 30.3, 30.4, 30.10**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p74.property`; commit `test(nutrition): add calorie floor property test (P74)`

  - [~] 23.8 Write property test for protein target bounds
    - **Property 75: Protein target bounds**
    - **Validates: Requirements 30.6, 30.7**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p75.property`; commit `test(nutrition): add protein target property test (P75)`

- [ ] 24. Food log, progress rings and barcode logic
  - [~] 24.1 Implement food log, Saved_Meal scaling and ring state
    - `src/modules/nutrition/logic/food.ts` (`dayTotals`, `groupBySlot`, `validateFoodForm`, `validateSavedMealForm`, `scaleMeal` with `${actionKey}:${index}` keys, `maxMultiplier`, `isLoggedDay`), `rings.ts` (`ringState`).
    - Example tests: missing macros count as 0; `ringState` with equal totals gives remaining 0; `maxMultiplier` returns `null` when 0.25 already exceeds a limit.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/nutrition/logic`; commit `feat(nutrition): add food log, saved meal scaling and ring logic`
    - _Requirements: 31.1, 31.2, 31.4, 31.5, 31.7, 31.8, 31.9, 31.10, 32.1, 32.2, 32.3, 32.6_

  - [~] 24.2 Write property test for daily totals and grouping
    - **Property 76: Daily totals and grouping**
    - **Validates: Requirements 31.1**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p76.property`; commit `test(nutrition): add daily totals property test (P76)`

  - [~] 24.3 Write property test for food and Saved_Meal form validation
    - **Property 77: Food and Saved_Meal form validation**
    - **Validates: Requirements 31.2, 31.4, 31.9**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p77.property`; commit `test(nutrition): add food form validation property test (P77)`

  - [~] 24.4 Write property test for the Logged_Day definition
    - **Property 78: Logged_Day definition**
    - **Validates: Requirements 31.7**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p78.property`; commit `test(nutrition): add logged day property test (P78)`

  - [~] 24.5 Write property test for Saved_Meal scaling
    - **Property 79: Saved_Meal scaling**
    - **Validates: Requirements 31.5, 31.8**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p79.property`; commit `test(nutrition): add saved meal scaling property test (P79)`

  - [~] 24.6 Write property test for the largest allowed multiplier
    - **Property 80: Largest allowed multiplier**
    - **Validates: Requirements 31.10**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p80.property`; commit `test(nutrition): add max multiplier property test (P80)`

  - [~] 24.7 Write property test for ring state
    - **Property 81: Ring state**
    - **Validates: Requirements 32.1, 32.2, 32.3, 32.6**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p81.property`; commit `test(nutrition): add ring state property test (P81)`

  - [~] 24.8 Implement barcode check digits, UPC-E expansion and normalisation
    - `src/modules/nutrition/logic/barcode.ts`: `gs1CheckDigit`, `isValidGs1`, `expandUpcE`, `isValidUpcE`, `normaliseBarcode`, `validateTyped`, `validFor(format, text)`.
    - Example tests: UPC-E expansions for each `x[5]` case from the design table; typed "4006381333931" → EAN_13; "12345" → length error.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/nutrition/logic`; commit `feat(nutrition): add barcode validation and normalisation`
    - _Requirements: 33.3, 33.5, 33.7, 33.8, 33.9_

  - [~] 24.9 Write property test for typed barcode validation
    - **Property 82: Typed barcode validation**
    - **Validates: Requirements 33.5, 33.8**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p82.property`; commit `test(nutrition): add typed barcode property test (P82)`

  - [~] 24.10 Write property test for GS1 check digits and UPC-E expansion
    - **Property 83: GS1 check digits and UPC-E expansion**
    - **Validates: Requirements 33.7**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p83.property`; commit `test(nutrition): add check digit property test (P83)`

  - [~] 24.11 Write property test for barcode normalisation
    - **Property 84: Barcode normalisation**
    - **Validates: Requirements 33.9**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p84.property`; commit `test(nutrition): add barcode normalisation property test (P84)`

- [ ] 25. Open Food Facts mapping and Portion_Calculator
  - [~] 25.1 Implement Open Food Facts mapping and portion scaling
    - `src/modules/nutrition/logic/off.ts` (`parseNutrient`, `mapOffProduct` reading `nutriments[k] ?? product[k]`, kJ fallback, plausibility caps, `classifyOffResponse`, `needsManualForm`), `portion.ts` (`scalePortion`, `servingsToGrams`, `validateGrams`, `validateServings`, `portionEntry` building the Food_Entry fields with absent macros left absent).
    - Example tests: kcal 1001 dropped and kJ used; "12,5" string rejected; servings 0.3 rejected.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/nutrition/logic`; commit `feat(nutrition): add open food facts mapping and portion calculator`
    - _Requirements: 34.3, 34.4, 34.5, 34.8, 34.12, 35.1, 35.2, 35.3, 35.4, 35.5, 35.6, 35.7, 35.8, 35.9, 35.10, 35.11_

  - [~] 25.2 Write property test for Open Food Facts mapping validity
    - **Property 85: Open Food Facts mapping validity**
    - **Validates: Requirements 34.3, 34.12**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p85.property`; commit `test(nutrition): add OFF mapping property test (P85)`

  - [~] 25.3 Write property test for nutrient parsing and kJ fallback
    - **Property 86: Nutrient parsing and kJ fallback**
    - **Validates: Requirements 34.4, 34.5**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p86.property`; commit `test(nutrition): add nutrient parsing property test (P86)`

  - [~] 25.4 Write property test for portion identity and missing values
    - **Property 87: Portion identity and missing values**
    - **Validates: Requirements 35.1, 35.5, 35.9**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p87.property`; commit `test(nutrition): add portion identity property test (P87)`

  - [~] 25.5 Write property test for portion linearity
    - **Property 88: Portion linearity**
    - **Validates: Requirements 35.6**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p88.property`; commit `test(nutrition): add portion linearity property test (P88)`

  - [~] 25.6 Write property test for servings and grams
    - **Property 89: Servings equal grams**
    - **Validates: Requirements 35.7**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p89.property`; commit `test(nutrition): add servings property test (P89)`

  - [~] 25.7 Write property test for finite scaled values
    - **Property 90: Scaled values are finite and non-negative**
    - **Validates: Requirements 35.8**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p90.property`; commit `test(nutrition): add finite portion property test (P90)`

  - [~] 25.8 Write property test for portion input validation
    - **Property 91: Portion input validation**
    - **Validates: Requirements 35.3, 35.10**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p91.property`; commit `test(nutrition): add portion input property test (P91)`

- [ ] 26. AI estimate review, weight trend and trend correction logic
  - [~] 26.1 Implement Gemini response validation and review logic
    - `src/modules/nutrition/logic/estimate.ts` (`extractText`, `EstimateSchema`, `validateEstimate`, `httpErrorKind`), `review.ts` (`ReviewItem`, `toReviewItems` assigning one key per item, `setGrams`, `consistencyWarning`, `reviewTotals`, `reviewSaveBlockers`).
    - Example tests: thought parts are ignored; unknown keys are stripped; `setGrams` from 0 changes only grams.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/nutrition/logic`; commit `feat(nutrition): add estimate validation and review logic`
    - _Requirements: 37.1, 37.2, 37.3, 37.4, 37.5, 37.8, 37.12, 37.13, 37.14, 37.17, 37.18_

  - [~] 26.2 Write property test for the estimate validator
    - **Property 93: Estimate validator**
    - **Validates: Requirements 37.1, 37.17**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p93.property`; commit `test(nutrition): add estimate validator property test (P93)`

  - [~] 26.3 Write property test for gram edits
    - **Property 94: Gram edits rescale an item**
    - **Validates: Requirements 37.3**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p94.property`; commit `test(nutrition): add gram edit property test (P94)`

  - [~] 26.4 Write property test for review totals and save blockers
    - **Property 95: Review totals and save blockers**
    - **Validates: Requirements 37.4, 37.18**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p95.property`; commit `test(nutrition): add review totals property test (P95)`

  - [~] 26.5 Write property test for the consistency warning
    - **Property 96: Consistency warning**
    - **Validates: Requirements 37.5**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p96.property`; commit `test(nutrition): add consistency warning property test (P96)`

  - [~] 26.6 Write property test for Gemini HTTP status mapping
    - **Property 97: Gemini HTTP status mapping**
    - **Validates: Requirements 37.12, 37.13, 37.14**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p97.property`; commit `test(nutrition): add gemini status mapping property test (P97)`

  - [~] 26.7 Implement weight log validation and the Weight_Trend
    - `src/modules/nutrition/logic/weight.ts`: `trendAt`, `trendSeries` (uses entries before `from`, gaps as undefined), `validateWeightForm`, `weightRange(today, '30' | '90' | '180' | '365' | 'all')`.
    - Example tests: future date rejected; a single entry gives a trend equal to it.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/nutrition/logic`; commit `feat(nutrition): add weight validation and trend`
    - _Requirements: 38.1, 38.4, 38.5, 38.6, 38.7, 38.8, 38.9_

  - [~] 26.8 Write property test for weight form validation
    - **Property 98: Weight form validation**
    - **Validates: Requirements 38.1, 38.9**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p98.property`; commit `test(nutrition): add weight form property test (P98)`

  - [~] 26.9 Write property test for the weight trend definition
    - **Property 100: Weight trend definition**
    - **Validates: Requirements 38.4, 38.5**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p100.property`; commit `test(nutrition): add weight trend definition property test (P100)`

  - [~] 26.10 Write property test for weight trend bounds
    - **Property 101: Weight trend bounds**
    - **Validates: Requirements 38.7**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p101.property`; commit `test(nutrition): add weight trend bounds property test (P101)`

  - [~] 26.11 Write property test for constant weights
    - **Property 102: Constant weights give a constant trend**
    - **Validates: Requirements 38.8**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p102.property`; commit `test(nutrition): add constant trend property test (P102)`

  - [~] 26.12 Implement the Trend_Corrector
    - `src/modules/nutrition/logic/trend.ts`: `trendCorrection`, `correctedBurn`, `suggestionView`, `acceptedOffset(C, tdee)`.
    - Reference example test (R39.12, R74.5): L 21, I 2200, blocks 80.0 → 79.5 gives C = 2475.
    - Example tests: shortfall list when L < 14; out-of-range C; close-enough when within 100 kcal.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/nutrition/logic`; commit `feat(nutrition): add trend corrector`
    - _Requirements: 39.1, 39.2, 39.3, 39.4, 39.5, 39.6, 39.7, 39.8, 39.9, 39.10, 39.12, 39.13, 39.14, 39.15, 39.16_

  - [~] 26.13 Write property test for trend correction
    - **Property 103: Trend correction matches the reference**
    - **Validates: Requirements 39.1, 39.2, 39.3, 39.4, 39.5, 39.8**
    - Oracle in `src/test/oracles/trend.ts`.
    - Verify and commit: `npm run typecheck`; `npx vitest --run p103.property`; commit `test(nutrition): add trend correction property test (P103)`

  - [~] 26.14 Write property test for suggestion visibility
    - **Property 104: Suggestion visibility**
    - **Validates: Requirements 39.7, 39.10, 39.15, 39.16**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p104.property`; commit `test(nutrition): add suggestion visibility property test (P104)`

  - [~] 26.15 Write property test for zero weight change
    - **Property 105: Zero weight change keeps intake**
    - **Validates: Requirements 39.13**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p105.property`; commit `test(nutrition): add zero weight change property test (P105)`

  - [~] 26.16 Write property test for corrected burn relations
    - **Property 106: Corrected burn metamorphic relations**
    - **Validates: Requirements 39.14**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p106.property`; commit `test(nutrition): add corrected burn property test (P106)`

- [ ] 27. Nutrition data access, network clients and module wiring
  - [~] 27.1 Implement food log, Saved_Meal, day mark and weight data access
    - `src/modules/nutrition/data/food.ts`: add manual/portion/AI entries via `createIdempotent`, add Saved_Meal entries with one transaction that checks existing keys then `bulkAdd`, Saved_Meal CRUD, delete Food_Entry and Saved_Meal with `recordDiffUndo`, mark/unmark a day incomplete, live queries per date.
    - `src/modules/nutrition/data/weights.ts`: `saveWeight` (one transaction replacing any entry with the same date, Undo covers replacement), `deleteWeight` with Undo, live series.
    - Data tests: Saved_Meal add twice with the same action key adds once; weight replacement + Undo restores the old entry.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/nutrition/data`; commit `feat(nutrition): add food, saved meal and weight data access`
    - _Requirements: 11.1, 11.2, 31.3, 31.5, 31.6, 31.11, 38.2, 38.3, 38.10, 38.11, 64.2_

  - [~] 27.2 Write property test for one Weight_Entry per date
    - **Property 99: One Weight_Entry per date**
    - **Validates: Requirements 38.2**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p99.property`; commit `test(nutrition): add weight per date property test (P99)`

  - [~] 27.3 Implement the live energy hook
    - `src/modules/nutrition/data/useEnergy.ts`: one `liveQuery` reading Profile, nutrition settings, weights, `state.burnOffset` and `getCapability('trainingLog')?.listFinishedSessions()`, combined with `useToday()`; read failure yields `{ error }` with no partial values; `acceptBurnSuggestion`, `ignoreSuggestion`, `resetBurnOffset` writers.
    - Data tests: a new Weight_Entry recomputes BMR; missing capability falls back to the Profile hours.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/nutrition/data`; commit `feat(nutrition): add live energy computation`
    - _Requirements: 4.5, 29.3, 29.6, 29.11, 29.13, 39.9, 39.10, 39.11_

  - [~] 27.4 Implement the Open Food Facts client, Product_Cache and Food_Lookup flow
    - Design verification item 2: check with one live request (developer machine only, no Owner data) whether `fields=energy-kcal_100g,…` returns nutrient values; if not, switch `OFF.FIELDS` to `product_name,brands,serving_quantity,nutriments` and record the deviation from R34.2 in a code comment and the task summary. If the network is unavailable, keep the design field list and report that the check was not possible.
    - `src/modules/nutrition/net/off.ts` (GET with `credentials: 'omit'`, 10 s timeout, request token so late responses are ignored), `data/foodLookup.ts` (the design flowchart: unsupported barcode, cache hit, manual records never refetched, 30-day background revalidation, offline, not found, error with Retry), `data/products.ts` (manual product save).
    - Integration tests with mocked `fetch` (R74.8): cache hit with no request, stale revalidation, not found, missing kcal, offline, timeout with a late response ignored, manual record never refetched.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/nutrition`; commit `feat(nutrition): add open food facts lookup and product cache`
    - _Requirements: 3.2, 34.1, 34.2, 34.6, 34.7, 34.8, 34.9, 34.10, 34.11, 34.13, 34.14, 34.15, 65.2, 74.8_

  - [~] 27.5 Implement the Gemini client
    - Design verification item 1: confirm the current free-tier Flash model id on the Gemini models page and set `GEMINI_MODEL_ID`; note that a browser CORS check with `x-goog-api-key` needs the Owner's key on a device, so record it as a manual check if it cannot be done here.
    - `src/modules/nutrition/net/gemini.ts`: request exactly as in the design (key only in `x-goog-api-key`, image part, prompt, `responseSchema`), 45 s timeout, `AbortController` for cancel, fixed error strings, no logging of requests.
    - Integration tests with mocked `fetch` (R74.8): URL has no key, header and body shape, each HTTP status kind, network error, abort on cancel, 45 s timeout.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/nutrition`; commit `feat(nutrition): add gemini meal estimation client`
    - _Requirements: 3.2, 36.3, 36.4, 36.5, 36.10, 37.10, 37.12, 37.13, 37.14, 37.15, 37.16, 74.8_

  - [~] 27.6 Write property test for Gemini key leakage
    - **Property 92: The Gemini key never leaks**
    - **Validates: Requirements 36.5**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p92.property`; commit `test(nutrition): add gemini key leak property test (P92)`

  - [~] 27.7 Implement Nutrition backup and the full Nutrition ModuleDefinition
    - `src/modules/nutrition/data/backup.ts`: `exportData` (food entries, saved meals, day marks, products, weights, state, thumbnails as base64), `importData`, `backup.schema`, `sections()`.
    - `src/modules/nutrition/index.ts`: every route from the design list, each lazily loading a screen file under `src/modules/nutrition/ui/screens/` (create placeholders now; tasks 28.x replace them), `useCommandEntries` (Saved_Meals, "Nutrition" screen, "Log food", "Scan barcode", "Estimate meal from photo" with `needsNetwork`, "Log weight"), `settings.Section` (`ui/NutritionSettingsSection.tsx` placeholder), `DashboardCard` (`ui/NutritionDashboardCard.tsx` placeholder).
    - Example test: export → clear → import restores equal records for a small fixture state.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/nutrition`; commit `feat(nutrition): add nutrition backup and module wiring`
    - _Requirements: 2.1, 2.3, 2.7, 6.2, 8.4, 72.2_

- [ ] 28. Nutrition screens
  - [~] 28.1 Build the daily Food_Log, rings, day view and add-food form
    - Today screen (tab root) and `/nutrition/day/:date`: calorie and protein rings with "over" state, entries grouped by meal slot, delete with Undo, "Mark day incomplete", date navigation; add-food form (manual entry, slot, date, idempotent key per opened form, inline errors, failure Toast keeping the draft).
    - Component tests: adding an entry updates the ring within 100 ms (optimistic); double-tap save creates one entry.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/nutrition/ui`; commit `feat(nutrition): add daily food log and add-food form`
    - _Requirements: 11.6, 31.1, 31.2, 31.3, 31.6, 31.7, 31.9, 31.11, 32.1, 32.2, 32.3, 32.6, 32.7, 63.1_

  - [~] 28.2 Build Saved_Meals and the add-meal sheet
    - Saved_Meal list and editor (items, validation, delete with Undo) and the add-meal sheet with multiplier (0.25 steps, max shown from `maxMultiplier`, rejection message naming the first failing item).
    - Component test: a multiplier above the allowed maximum is rejected with the item name.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/nutrition/ui`; commit `feat(nutrition): add saved meals screens`
    - _Requirements: 31.3, 31.4, 31.5, 31.8, 31.10_

  - [~] 28.3 Build the Barcode_Scanner
    - `ui/BarcodeScanner.tsx` and `/nutrition/scan`: ZXing reader limited to EAN_13, EAN_8, UPC_A, UPC_E; ignore invalid reads; lock after the first valid read and look up exactly once; 10 s start timeout; denied (with iPhone Settings steps), no camera and in-use messages; stop all tracks on hide, unmount and close; restart when visible again with no lookup started; "Type barcode" entry with `validateTyped`.
    - Component tests with a mocked reader and `getUserMedia`: denied message; second valid read is ignored; tracks stop on unmount.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/nutrition/ui`; commit `feat(nutrition): add barcode scanner screen`
    - _Requirements: 33.1, 33.2, 33.3, 33.4, 33.5, 33.6, 33.8, 33.10_

  - [~] 28.4 Build the product and portion screen
    - `/nutrition/product/:barcode`: lookup states from `foodLookup`, offline message with Retry, manual product form when name or kcal is missing or not found, portion entry in grams or servings, live scaled values, save as a Food_Entry with source `barcode`.
    - Component tests: not-found opens the manual form with the barcode; servings convert to grams.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/nutrition/ui`; commit `feat(nutrition): add product lookup and portion screen`
    - _Requirements: 1.5, 34.1, 34.7, 34.8, 34.9, 34.11, 35.1, 35.2, 35.3, 35.4, 35.9, 35.10, 35.11_

  - [~] 28.5 Build the Meal_Estimator request flow
    - `/nutrition/estimate`: photo selection with `processImage` (1024 px, 0.8), the design state machine (no key checked first, then offline, then the one-time free-tier warning acknowledgement stored in `state.aiWarningAck`, pending with Cancel, error with Retry using the same photo), leaving the screen aborts the request.
    - Component tests: no key shows the key message before the offline check; Cancel discards a late response.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/nutrition/ui`; commit `feat(nutrition): add meal estimator request flow`
    - _Requirements: 36.1, 36.2, 36.6, 36.7, 36.8, 36.9, 36.10, 36.11, 36.12, 37.10, 37.11, 37.16_

  - [~] 28.6 Build the AI review screen with its component test
    - `ui/EstimateReview.tsx`: editable items (name, grams rescaling macros, kcal and macros), consistency warning, low-confidence banner, totals, slot picker, save blockers; one transaction saving the 256 px thumbnail once and one Food_Entry per item, skipping existing keys; save failure keeps items and keys; close discards.
    - Component test (R74.7): renders items, gram edit rescales, consistency warning, low-confidence banner, save disabled until a slot is chosen, double-tap save creates entries once, save failure keeps state.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/nutrition/ui`; commit `feat(nutrition): add AI estimate review screen`
    - _Requirements: 37.2, 37.3, 37.4, 37.5, 37.6, 37.7, 37.8, 37.9, 37.18, 37.19, 74.7_

  - [~] 28.7 Build the weight log, trend chart and trend suggestion
    - `/nutrition/weight`: weight form (date ≤ today, replace confirmation), list with delete and Undo, chart with entries and trend line (30/90/180/365 days, all), gaps for missing trend values; trend suggestion card using `suggestionView` with Accept and Ignore, shortfall list and out-of-range note.
    - Component tests: Accept stores the rounded Burn_Offset; Ignore hides the card for 7 days.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/nutrition/ui`; commit `feat(nutrition): add weight log, trend chart and burn suggestion`
    - _Requirements: 38.1, 38.2, 38.3, 38.4, 38.5, 38.9, 38.10, 38.11, 39.7, 39.8, 39.9, 39.10, 39.11, 39.15, 39.16_

  - [~] 28.8 Build the energy screen, Nutrition settings section and Nutrition DashboardCard
    - `/nutrition/energy`: BMR, factor, hours with source label, TDEE, Burn_Offset, Daily_Burn, Calorie_Target (floored note), Protein_Target, rounded for display; error panel with no partial values.
    - `NutritionSettingsSection.tsx`: Gemini key (masked or "Not set", always-visible free-tier warning), training-hours override, goal adjustments, protein factors per goal, Burn_Offset reset.
    - `NutritionDashboardCard.tsx`: today's kcal and protein rings or "Set up your profile" when no Profile, Skeleton and error panel.
    - Component tests: key shows only the last 4 characters; card shows no targets without a Profile.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/nutrition/ui`; commit `feat(nutrition): add energy screen, settings section and dashboard card`
    - _Requirements: 4.4, 5.2, 5.7, 29.6, 29.13, 30.2, 30.4, 30.9, 32.4, 32.5, 32.7, 32.8, 36.8, 39.11_

- [~] 29. Checkpoint: Nutrition module
  - Run `npm run typecheck`, `npx vitest --run` and `npm run build`; fix any failure and commit fixes with `fix(nutrition): …`.
  - Ensure all tests pass, ask the user if questions arise.

## Part 5: Chess module

- [ ] 30. Chess foundations: model, tips and board
  - [~] 30.1 Define Chess constants, types, zod schemas and generators
    - `src/modules/chess/constants.ts` (exactly the design constants), `schema.ts` (zod schemas for every Chess record type, `Tip`, `Puzzle` and the Chess backup data object), `types.ts`.
    - `src/test/arbitraries/chess.ts`: `arbPlayout(maxPlies)`, `arbGameJson`, `arbArchives`, `arbStoredEval`, `arbRepertoireOps`, `arbTips(n)`.
    - Example test: `arbPlayout` yields only legal chess.js moves; schemas accept generated records.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/chess`; commit `feat(chess): add chess constants, types, schemas and generators`
    - _Requirements: 8.4, 41.1, 57.11, 60.6_

  - [~] 30.2 Implement rating bands, daily tip rotation and the Tips_Library
    - `src/modules/chess/logic/bands.ts` (`ratingBand`, `chessRating`), `tips.ts` (`selectDailyTip`, `filterTips`).
    - `public/data/tips.json`: authored tips meeting R41.1 and R41.2 (at least 12 tips for each of the bands 800–999, 1000–1199, 1200–1399, 1400–1599 and at least 6 for each other band), topic tags from `TOPICS`, detector tags from `DETECTOR_IDS` so that every detector has tips in every band where possible.
    - Data test (R41.3): loads `tips.json`, validates every tip against criterion 1 and the per-band minimum counts.
    - Example tests: bands for 799, 800, 999, 1000, 1999, 2000.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/chess/logic`; commit `feat(chess): add rating bands, daily tips and tips library`
    - _Requirements: 40.9, 40.10, 40.11, 41.1, 41.2, 41.3, 41.4, 41.5, 41.6, 41.8, 41.9_

  - [~] 30.3 Write property test for rating bands
    - **Property 107: Rating bands partition ratings**
    - **Validates: Requirements 40.10, 40.11**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p107.property`; commit `test(chess): add rating band property test (P107)`

  - [~] 30.4 Write property test for daily tip rotation
    - **Property 108: Daily tip rotation**
    - **Validates: Requirements 41.4, 41.5, 41.6**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p108.property`; commit `test(chess): add daily tip rotation property test (P108)`

  - [~] 30.5 Implement free-board history
    - `src/modules/chess/logic/boardHistory.ts`: `play`, `undo`, `redo`, `reset`, `fenOf`, `loadInput` (FEN ≤ 100 characters, PGN ≤ 100,000 characters, PGN shows its final position).
    - Example tests: illegal move returns `null`; an oversized PGN is rejected with the limit message.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/chess/logic`; commit `feat(chess): add free board history`
    - _Requirements: 42.2, 42.3, 42.7, 42.8, 42.9, 42.10_

  - [~] 30.6 Write property test for legal move acceptance
    - **Property 109: Only legal moves are accepted**
    - **Validates: Requirements 42.2, 42.3**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p109.property`; commit `test(chess): add legal move property test (P109)`

  - [~] 30.7 Write property test for undo/redo
    - **Property 110: Undo/redo round trip**
    - **Validates: Requirements 42.10**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p110.property`; commit `test(chess): add board undo/redo property test (P110)`

  - [~] 30.8 Implement the interactive board component
    - `src/modules/chess/ui/board/ChessBoardView.tsx` (react-chessboard wrapper with `data-gesture="board"`, size from a `ResizeObserver` rounded down to a multiple of 8, drag and tap-tap input, legal target highlights, arrows, wrong-side and illegal moves snap back silently), `PromotionPicker.tsx` (sheet; dismiss cancels).
    - Component tests: tap-tap plays a legal move; a pawn to the last rank opens the picker and dismiss cancels.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/chess/ui`; commit `feat(chess): add interactive chessboard component`
    - _Requirements: 42.1, 42.3, 42.4, 42.5, 42.6, 69.4_

- [ ] 31. Chess.com client, Game_Sync, game logic and CORS_Proxy
  - [~] 31.1 Implement the ChessCom_Client
    - `src/modules/chess/net/chesscom.ts`: `createChessComClient` with the serial FIFO queue, offline short-circuit, `credentials: 'omit'`, lowercase usernames, 15 s timeout without retry, 429 waits of 1, 2 and 4 s, 404/410, 5xx, other status, non-JSON, direct `TypeError` → sticky proxy for the run or `network-direct-no-proxy`, proxy `TypeError` → `network-proxy`, `onUnreachable`, `resetRoute`; `net/messages.ts` with the exact R40.5 and R46 strings.
    - Integration tests with mocked `fetch` and fake timers (R74.8): 200, 404, 410, 429 with the three waits, 429 exhausted, 5xx, 15 s timeout, non-JSON body, CORS `TypeError` with and without proxy, proxy sticky for the run and reset on URL change.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/chess/net`; commit `feat(chess): add chess.com client with retries and proxy fallback`
    - _Requirements: 1.9, 3.2, 40.5, 46.1, 46.2, 46.3, 46.4, 46.5, 46.6, 46.7, 46.8, 46.9, 74.8_

  - [~] 31.2 Write property test for serial Chess.com requests
    - **Property 120: Chess.com requests are serial**
    - **Validates: Requirements 46.1**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p120.property`; commit `test(chess): add serial requests property test (P120)`

  - [~] 31.3 Implement pure Game_Sync and rating mapping logic
    - `src/modules/chess/logic/sync.ts`: `parseArchiveMonths`, `selectMonths`, `isMonthCompleteAt`, `mapGame`, `ownerResult`, `mapRating`, `mapStats`.
    - Example tests: `ownerResult` for every listed Chess.com result code plus an unknown code; `rules !== 'chess'` is ignored; missing uuid and url is skipped.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/chess/logic`; commit `feat(chess): add game sync mapping logic`
    - _Requirements: 11.4, 11.7, 43.3, 44.1, 44.2, 44.3, 44.4, 44.5, 44.6, 44.7, 44.8, 44.10_

  - [~] 31.4 Write property test for rating sanitising
    - **Property 111: Rating values are sanitised**
    - **Validates: Requirements 43.3**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p111.property`; commit `test(chess): add rating sanitising property test (P111)`

  - [~] 31.5 Write property test for archive months and selection
    - **Property 112: Archive months and month selection**
    - **Validates: Requirements 44.1, 44.2, 44.3**
    - Oracle in `src/test/oracles/months.ts`.
    - Verify and commit: `npm run typecheck`; `npx vitest --run p112.property`; commit `test(chess): add archive month selection property test (P112)`

  - [~] 31.6 Write property test for Owner colour matching
    - **Property 113: Owner colour matching ignores ASCII case**
    - **Validates: Requirements 44.7**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p113.property`; commit `test(chess): add owner colour property test (P113)`

  - [~] 31.7 Implement Game_Sync, ratings refresh and username verification
    - `src/modules/chess/data/gameSync.ts`: `runGameSync` (one run at a time, archives request, empty archives message, months ascending with "Syncing month N of M", one transaction per month upserting by id and marking complete months, stop at the first failure with cause and "N of M months", abort flag on hide, `lastSuccessAt`, result counts).
    - `data/ratings.ts`: `refreshRatings` (one `put` replacing all five values with `fetchedAt`), `verifyUsername` (store as typed; clear the ratings singleton in the same transaction when the folded name changes), SWR resources `chess:ratings` (1 h) and `chess:games` (6 h).
    - Data tests with a fake client: failure mid-run keeps committed months; 404 keeps stored ratings.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/chess/data`; commit `feat(chess): add game sync, ratings refresh and username verification`
    - _Requirements: 40.3, 40.4, 40.6, 40.7, 43.1, 43.2, 43.4, 43.5, 43.6, 44.9, 44.11, 44.12, 44.13, 44.14, 44.15, 44.16, 65.2, 65.4_

  - [~] 31.8 Write property test for Game_Sync idempotence
    - **Property 114: Game_Sync is idempotent**
    - **Validates: Requirements 44.9, 44.17**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p114.property`; commit `test(chess): add game sync idempotence property test (P114)`

  - [~] 31.9 Write property test for Game_Sync confluence
    - **Property 115: Game_Sync is confluent**
    - **Validates: Requirements 44.18**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p115.property`; commit `test(chess): add game sync confluence property test (P115)`

  - [~] 31.10 Write property test for no duplicate games
    - **Property 116: Game_Sync stores no duplicates**
    - **Validates: Requirements 44.19, 11.4, 11.7, 44.5, 44.6**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p116.property`; commit `test(chess): add no duplicate games property test (P116)`

  - [~] 31.11 Implement game list, clock parsing and rating history logic
    - `src/modules/chess/logic/games.ts`: `sortGames`, `filterGames`, `openingName`, `parseClocks`, `baseTimeSeconds`, `clocksAt`, `ratingPoints`, `printClockComment` (used by the round-trip property).
    - Example tests: `openingName` for the Caro-Kann ECO URL; daily time control has no base time.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/chess/logic`; commit `feat(chess): add game list, clocks and rating history logic`
    - _Requirements: 45.1, 45.2, 45.3, 45.6, 45.8_

  - [~] 31.12 Write property test for game list order and filters
    - **Property 117: Game list order and filters**
    - **Validates: Requirements 45.1, 45.3**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p117.property`; commit `test(chess): add game list property test (P117)`

  - [~] 31.13 Write property test for opening names
    - **Property 118: Opening names from ECO URLs**
    - **Validates: Requirements 45.2**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p118.property`; commit `test(chess): add opening name property test (P118)`

  - [~] 31.14 Write property test for clock comments
    - **Property 119: Clock comments round trip**
    - **Validates: Requirements 45.6**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p119.property`; commit `test(chess): add clock comment property test (P119)`

  - [~] 31.15 Implement the Cloudflare CORS_Proxy with tests and deploy guide
    - `worker/src/index.ts` (OPTIONS 204, non-GET 403, WHATWG path normalisation, only `/pub/` forwarded, status, body and content type kept, `Access-Control-Allow-Origin: ALLOWED_ORIGIN`), `worker/wrangler.toml` (`ALLOWED_ORIGIN` var), `worker/tsconfig.json` with `@cloudflare/workers-types`, `worker/README.md` (step-by-step free-tier deploy and where to paste the URL in Settings → Chess).
    - Add a `worker` project to `vitest.config.ts` `test.projects` (node environment).
    - `worker/test/index.test.ts` with a stubbed global `fetch` (R74.8): forwarded `/pub/player/x` GET, rejected POST, rejected `/pub/../admin` and `/%2e%2e/x`.
    - Verify and commit: `npm run typecheck`; `npx vitest --run worker`; commit `feat(chess): add cloudflare cors proxy worker`
    - _Requirements: 46.10, 46.11, 74.8_

  - [~] 31.16 Write property test for the proxy forwarding rule
    - **Property 121: The proxy forwards only GET under /pub/**
    - **Validates: Requirements 46.10**
    - Test file under `worker/test/`.
    - Verify and commit: `npm run typecheck`; `npx vitest --run p121.property`; commit `test(chess): add proxy forwarding property test (P121)`

- [ ] 32. Puzzles: build script, Glicko-2 and Puzzle_Trainer logic
  - [~] 32.1 Implement the Puzzle_Build_Script with fixture-based tests
    - `scripts/lib/puzzles.ts` (`parseRow`, `isCandidate`, `replayOk` with chess.js including promotion letters, `bucketOf`, `compareCandidates`, `selectPuzzles`), `scripts/build-puzzles.ts` (`--in`, `--out`, `--min-popularity 80`, `--min-plays 500`, streaming `readline`, bounded per-bucket arrays trimmed at 4,444 entries, counts per reason and bucket, temp file, gzip level 9 cap 3,145,728 bytes with an overridable cap parameter for tests, rename only on success, non-zero exit on missing input).
    - `scripts/fixtures/puzzles.csv`: about 200 rows covering every exclusion reason (malformed, illegal moves, rating out of range, low popularity, few plays) and every bucket.
    - `scripts/__tests__/build-puzzles.test.ts` (R74.6): two runs produce byte-identical output; missing input and an exceeded (lowered) cap exit non-zero and leave the previous output unchanged; printed counts match the fixture.
    - Verify and commit: `npm run typecheck`; `npx vitest --run scripts`; commit `feat(chess): add puzzle build script with fixture tests`
    - _Requirements: 47.1, 47.2, 47.3, 47.4, 47.5, 47.6, 47.7, 47.8, 74.6_

  - [~] 32.2 Write property test for puzzle selection
    - **Property 122: Puzzle selection rules**
    - **Validates: Requirements 47.1, 47.2, 47.4, 47.5**
    - Oracle in `src/test/oracles/puzzleSelection.ts`; test file under `scripts/__tests__/`.
    - Verify and commit: `npm run typecheck`; `npx vitest --run p122.property`; commit `test(chess): add puzzle selection property test (P122)`

  - [~] 32.3 Implement the Glicko2_Calculator
    - `src/modules/chess/logic/glicko2.ts`: `glicko2` (Illinois volatility iteration, `Glicko2NonConvergence` after `maxIter`), `clampRd`, `initialRating(chessRating)`, `displayRating`.
    - Reference example test (R49.5, R74.5): (1500, 200, 0.06) against win (1400, 30), loss (1550, 100), loss (1700, 300) → 1464.06 ± 0.01, RD 151.52 ± 0.01, σ 0.05999 ± 0.00001.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/chess/logic`; commit `feat(chess): add glicko-2 calculator`
    - _Requirements: 49.1, 49.2, 49.3, 49.4, 49.5, 49.8_

  - [~] 32.4 Write property test for Glicko-2 direction
    - **Property 125: Glicko-2 direction**
    - **Validates: Requirements 49.6**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p125.property`; commit `test(chess): add glicko-2 direction property test (P125)`

  - [~] 32.5 Write property test for Glicko-2 validity
    - **Property 126: Glicko-2 validity**
    - **Validates: Requirements 49.4, 49.7**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p126.property`; commit `test(chess): add glicko-2 validity property test (P126)`

  - [~] 32.6 Implement puzzle selection, scoring and theme statistics
    - `src/modules/chess/logic/puzzles.ts`: `pickPuzzle`, `reviewQueue`, `themeStats`, `puzzleReducer` (accept matching move or a legal non-matching mate, fail and revert, hint levels reset per Owner move, score decided once at the first of solve/fail/hint/show solution, "Show solution" steps).
    - Example tests: first hint decides score 0; a mate that differs from the solution solves.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/chess/logic`; commit `feat(chess): add puzzle selection and scoring logic`
    - _Requirements: 48.1, 48.2, 48.3, 48.4, 48.5, 48.6, 48.7, 48.8, 48.9, 50.1, 50.2, 50.3, 50.4, 50.5, 50.6_

  - [~] 32.7 Write property test for puzzle scoring
    - **Property 123: Puzzle scoring**
    - **Validates: Requirements 48.2, 48.5, 48.9**
    - Puzzles generated from a random playout position and a random legal continuation.
    - Verify and commit: `npm run typecheck`; `npx vitest --run p123.property`; commit `test(chess): add puzzle scoring property test (P123)`

  - [~] 32.8 Write property test for the puzzle pick window
    - **Property 127: Puzzle pick window**
    - **Validates: Requirements 50.1, 50.2**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p127.property`; commit `test(chess): add puzzle pick window property test (P127)`

  - [~] 32.9 Write property test for theme statistics
    - **Property 128: Theme statistics**
    - **Validates: Requirements 50.4, 50.5, 50.6**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p128.property`; commit `test(chess): add theme statistics property test (P128)`

  - [~] 32.10 Implement puzzle data loading and attempt recording
    - `src/modules/chess/data/puzzles.ts`: `loadPuzzles` (fetch `data/puzzles.json` once, parse with zod, "Puzzles could not be loaded." on failure), `recordAttempt` (one transaction, rated only when no stored attempt for the puzzle, initial rating from Chess_Rating with RD 350 and σ 0.06, clamped RD, idempotent on `idemKey`), `usePuzzleRating`, `useAttempts`.
    - Data tests: a retried attempt with the same key stores once and updates the rating once; a load failure stores nothing.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/chess/data`; commit `feat(chess): add puzzle loading and attempt recording`
    - _Requirements: 47.10, 48.10, 48.11, 48.12, 48.13, 49.2, 49.4_

  - [~] 32.11 Write property test for first-attempt rating
    - **Property 124: Only the first attempt is rated**
    - **Validates: Requirements 48.10**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p124.property`; commit `test(chess): add first attempt rating property test (P124)`

- [ ] 33. Openings: Repertoire, SM-2, drill and statistics
  - [~] 33.1 Implement the Repertoire model
    - `src/modules/chess/logic/repertoire.ts`: `positionKey`, `normaliseEp`, `expectedMoves`, `addMove` (added / exists / illegal / conflict), `replaceExpected`, `deleteBranch`, `deleteTree`, `linesOf`, `ownerPositions`, `validateExplanation`, `validateTreeName`.
    - Example tests: en passant field is "-" when no capture is legal; a conflicting Owner move returns the existing move, tree names and removed count.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/chess/logic`; commit `feat(chess): add opening repertoire model`
    - _Requirements: 51.3, 51.4, 51.5, 51.6, 51.7, 51.8, 51.9, 52.1_

  - [~] 33.2 Write property test for transpositions
    - **Property 129: Transpositions share a position key**
    - **Validates: Requirements 51.6**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p129.property`; commit `test(chess): add transposition property test (P129)`

  - [~] 33.3 Write property test for the repertoire invariant
    - **Property 130: Repertoire invariant**
    - **Validates: Requirements 51.5, 51.7, 51.8, 51.9**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p130.property`; commit `test(chess): add repertoire invariant property test (P130)`

  - [~] 33.4 Write property test for learn lines
    - **Property 131: Learn lines cover every leaf once**
    - **Validates: Requirements 52.1**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p131.property`; commit `test(chess): add learn lines property test (P131)`

  - [~] 33.5 Implement the SRS_Scheduler (SM-2)
    - `src/modules/chess/logic/sm2.ts`: `SRS_INITIAL`, `isValidSrs`, `sm2Review` (integer EF hundredths, interval cap, throws on invalid input).
    - Reference example test (R53.8, R74.5): three q = 5 reviews give intervals 1, 6, 17 and EF 2.6, 2.7, 2.8.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/chess/logic`; commit `feat(chess): add sm-2 scheduler`
    - _Requirements: 53.1, 53.2, 53.3, 53.4, 53.5, 53.6, 53.7, 53.8_

  - [~] 33.6 Write property test for SM-2 against the integer reference
    - **Property 134: SM-2 matches the integer reference**
    - **Validates: Requirements 53.2, 53.3, 53.5, 53.6**
    - Oracle in `src/test/oracles/sm2.ts`.
    - Verify and commit: `npm run typecheck`; `npx vitest --run p134.property`; commit `test(chess): add sm-2 reference property test (P134)`

  - [~] 33.7 Write property test for SM-2 input rejection
    - **Property 135: SM-2 rejects invalid input**
    - **Validates: Requirements 53.7**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p135.property`; commit `test(chess): add sm-2 invalid input property test (P135)`

  - [~] 33.8 Write property test for the SM-2 invariant
    - **Property 136: SM-2 invariant**
    - **Validates: Requirements 53.9**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p136.property`; commit `test(chess): add sm-2 invariant property test (P136)`

  - [~] 33.9 Write property test for SM-2 reset
    - **Property 137: SM-2 reset**
    - **Validates: Requirements 53.4, 53.10**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p137.property`; commit `test(chess): add sm-2 reset property test (P137)`

  - [~] 33.10 Write property test for the SM-2 fixed point
    - **Property 138: SM-2 fixed point at quality 4**
    - **Validates: Requirements 53.11**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p138.property`; commit `test(chess): add sm-2 fixed point property test (P138)`

  - [~] 33.11 Write property test for SM-2 interval growth
    - **Property 139: SM-2 intervals grow under passing reviews**
    - **Validates: Requirements 53.12**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p139.property`; commit `test(chess): add sm-2 interval growth property test (P139)`

  - [~] 33.12 Implement drill scheduling and opening statistics
    - `src/modules/chess/logic/drill.ts` (`buildDrillQueue`, `chooseReply`, `gradeFor`, `drillSummary`), `openingStats.ts` (`matchGame`, `treeAccuracy`, `mastery`, `scoreRows`, `deviationList`).
    - Example tests: new-position limit counts first reviews today; a game sharing 0 plies matches no tree.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/chess/logic`; commit `feat(chess): add drill scheduling and opening statistics`
    - _Requirements: 52.3, 52.4, 52.7, 52.9, 54.1, 54.2, 54.3, 54.4, 54.5, 54.6, 54.8, 54.9_

  - [~] 33.13 Write property test for drill reply choice
    - **Property 132: Drill reply choice**
    - **Validates: Requirements 52.3**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p132.property`; commit `test(chess): add drill reply property test (P132)`

  - [~] 33.14 Write property test for drill queue order
    - **Property 133: Drill queue order**
    - **Validates: Requirements 52.7**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p133.property`; commit `test(chess): add drill queue property test (P133)`

  - [~] 33.15 Write property test for opening matching
    - **Property 140: Opening matching**
    - **Validates: Requirements 54.3, 54.4, 54.8**
    - Oracle in `src/test/oracles/openingMatch.ts`.
    - Verify and commit: `npm run typecheck`; `npx vitest --run p140.property`; commit `test(chess): add opening matching property test (P140)`

  - [~] 33.16 Write property test for opening statistics
    - **Property 141: Opening statistics are percentages**
    - **Validates: Requirements 54.1, 54.2, 54.5, 54.9**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p141.property`; commit `test(chess): add opening statistics property test (P141)`

  - [~] 33.17 Implement the starter Repertoire and Repertoire data access
    - `public/data/repertoire-starter.json`: four trees as in R51.1 (Italian/Giuoco Piano and London for White, Caro-Kann and Two Knights for Black), each with a main line of at least 16 plies and at least 2 common opponent replies at the first 3 opponent-to-move positions, optional explanations ≤ 300 characters.
    - `src/modules/chess/data/repertoire.ts`: load the starter set through `addMove`, tree CRUD, add/replace/delete with `recordDiffUndo`, reset with confirmation data and Undo, grade transaction (`put` SRS + `add` review), session-local graded set.
    - Data test (R51.2): starter ply and reply counts and legality of every move.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/chess`; commit `feat(chess): add starter repertoire and repertoire data access`
    - _Requirements: 51.1, 51.2, 51.4, 51.8, 51.10, 51.11, 52.4, 52.6, 64.2, 64.3_

- [ ] 34. Engine, Move_Classifier, Mistake_Detectors and Game_Analyzer
  - [~] 34.1 Implement the Stockfish engine client
    - `src/modules/chess/engine/engineClient.ts`: `EngineTransport`, `createWorkerTransport` (worker URL from `ENGINE_FILES`), `EngineClient` (`start` with `uci`/`uciok`, Hash 16, `isready`/`readyok` within 10 s; `analyse` parsing the last `info` at the target depth, `score cp`/`score mate`, first 3 PV moves, resolving on `bestmove`, 60 s timeout; `ucinewgame` once per game; `stop` with 1 s grace then terminate; `restart`).
    - `src/test/helpers/mockEngine.ts`: deterministic mock transport that can fail at a chosen position.
    - Integration tests with the mock (R74.8): load failure, no `readyok` in 10 s, worker error, no `bestmove` within 60 s, stop within 1 s.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/chess/engine`; commit `feat(chess): add stockfish engine client`
    - _Requirements: 55.1, 55.2, 55.5, 55.6, 55.8, 55.9, 74.8_

  - [~] 34.2 Implement position building and move classification
    - `src/modules/chess/logic/analysis/positions.ts` (`buildPositions` with terminal checkmate and draw detection using the live game history), `classify.ts` (`winProb`, `winProbOf`, `drop`, `labelFor`, `classifyMove`).
    - Example tests: `winProb(0) = 50`; checkmate position is terminal; threshold drops 5, 10 and 15.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/chess/logic/analysis`; commit `feat(chess): add position builder and move classifier`
    - _Requirements: 55.3, 55.4, 56.1, 56.2, 56.3, 56.4, 56.5, 56.6, 56.7, 56.8, 56.9, 56.10_

  - [~] 34.3 Write property test for the Win_Probability formula
    - **Property 142: Win_Probability formula**
    - **Validates: Requirements 56.1, 56.8**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p142.property`; commit `test(chess): add win probability property test (P142)`

  - [~] 34.4 Write property test for label monotonicity
    - **Property 143: Labels are monotone in drop**
    - **Validates: Requirements 56.4, 56.9**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p143.property`; commit `test(chess): add label monotonicity property test (P143)`

  - [~] 34.5 Write property test for drop bounds
    - **Property 144: Drop bounds**
    - **Validates: Requirements 56.3, 56.10**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p144.property`; commit `test(chess): add drop bounds property test (P144)`

  - [~] 34.6 Write property test for best moves
    - **Property 145: The engine's best move is never labelled**
    - **Validates: Requirements 56.5, 56.6**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p145.property`; commit `test(chess): add best move label property test (P145)`

  - [~] 34.7 Implement board attack helpers and Game_Phase
    - `src/modules/chess/logic/analysis/attacks.ts` (`attackedSquares` with ray casting, `isDefended`, `value`), `phase.ts` (`gamePhase`).
    - Example tests: a bishop attack is blocked by a piece; an endgame position with 6 minors and majors.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/chess/logic/analysis`; commit `feat(chess): add attack helpers and game phase`
    - _Requirements: 57.1, 57.3_

  - [~] 34.8 Write property test for Game_Phase
    - **Property 146: Game phase**
    - **Validates: Requirements 57.1**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p146.property`; commit `test(chess): add game phase property test (P146)`

  - [~] 34.9 Implement Mistake_Detectors part 1: hanging piece, missed fork, missed mate
    - `src/modules/chess/logic/analysis/detectors/hangingPiece.ts`, `missedOpponentFork.ts`, `missedOpponentMate.ts` following the design rule table; Owner moves only; silent when an eval or label is missing; explanations naming pieces and squares.
    - `logic/analysis/__tests__/detectors.part1.fixtures.test.ts` (R57.13): at least one firing and one silent fixed position with fixed evaluations per detector.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/chess/logic/analysis`; commit `feat(chess): add hanging piece, missed fork and missed mate detectors`
    - _Requirements: 57.2, 57.3, 57.4, 57.5, 57.12, 57.13_

  - [~] 34.10 Implement Mistake_Detectors part 2: missed own tactic, delayed castling, early queen
    - `detectors/missedOwnTactic.ts` (mates as ±10,000, gain ≥ 200 cp), `delayedCastling.ts` (once, Owner's 12th move), `earlyQueen.ts` (once, first five Owner moves, non-capture).
    - `logic/analysis/__tests__/detectors.part2.fixtures.test.ts` (R57.13): one firing and one silent fixture per detector.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/chess/logic/analysis`; commit `feat(chess): add missed tactic, delayed castling and early queen detectors`
    - _Requirements: 57.2, 57.6, 57.7, 57.8, 57.12, 57.13_

  - [~] 34.11 Implement Mistake_Detectors part 3: endgame technique, time pressure and the detector runner
    - `detectors/endgameTechnique.ts` (rules (a) and (b), no double firing), `timePressure.ts` (non-daily, clock below 10 % of base, mistake or blunder), `logic/analysis/detectors.ts` (`runDetectors` sorted by ply then `DETECTOR_IDS` order).
    - `logic/analysis/__tests__/detectors.part3.fixtures.test.ts` (R57.13): one firing and one silent fixture per detector, plus a combined game for `runDetectors` ordering.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/chess/logic/analysis`; commit `feat(chess): add endgame and time pressure detectors and detector runner`
    - _Requirements: 57.2, 57.9, 57.10, 57.11, 57.12, 57.13_

  - [~] 34.12 Write property test for the detector invariant
    - **Property 147: Detectors fire only on Owner moves and are deterministic**
    - **Validates: Requirements 57.2, 57.11, 57.12**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p147.property`; commit `test(chess): add detector owner-only property test (P147)`

  - [~] 34.13 Implement the Game_Report builder
    - `src/modules/chess/logic/analysis/report.ts`: `buildReport` (counts, Owner move labels with best SAN, key mistakes with move numbers, rounded W before/after and up to 3 better moves by replay), `selectReportTips` (3 tips with detections, else 2; detector order by count then id order; no duplicates).
    - Example tests: move number format for White and Black; a game with no detections gets 2 tips.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/chess/logic/analysis`; commit `feat(chess): add game report builder`
    - _Requirements: 58.1, 58.2, 58.3, 58.4, 58.5, 58.8_

  - [~] 34.14 Write property test for key mistakes
    - **Property 148: Key mistakes**
    - **Validates: Requirements 58.2**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p148.property`; commit `test(chess): add key mistakes property test (P148)`

  - [~] 34.15 Write property test for report tip selection
    - **Property 149: Report tip selection**
    - **Validates: Requirements 58.4**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p149.property`; commit `test(chess): add report tip selection property test (P149)`

  - [~] 34.16 Implement the Pattern_Report
    - `src/modules/chess/logic/analysis/patterns.ts`: `patternReport` (scope and time-class filter, too-few below 5 games, game and loss shares per detector and move bucket, qualifying rule, sorting, text from a phrase table, Practice or Read tips action).
    - Example test: the R59.5 sentence "You hang pieces in moves 21–30 in 40 % of losses (4 of 10)".
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/chess/logic/analysis`; commit `feat(chess): add cross-game pattern report`
    - _Requirements: 59.1, 59.2, 59.3, 59.4, 59.5, 59.6, 59.7, 59.8_

  - [~] 34.17 Write property test for pattern shares
    - **Property 150: Pattern shares match the reference**
    - **Validates: Requirements 59.1, 59.3, 59.4**
    - Oracle in `src/test/oracles/patterns.ts`.
    - Verify and commit: `npm run typecheck`; `npx vitest --run p150.property`; commit `test(chess): add pattern shares property test (P150)`

  - [~] 34.18 Write property test for pattern share bounds
    - **Property 151: Pattern share bounds and dilution**
    - **Validates: Requirements 59.9**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p151.property`; commit `test(chess): add pattern bounds property test (P151)`

  - [~] 34.19 Implement Game_Analyzer part 1: queue and per-position evaluation loop
    - `src/modules/chess/engine/gameAnalyzer.ts`: `enqueue` (newest first, one game at a time, default queue of 10), per game `buildPositions` → read stored evals for (gameId, depth, version) → terminal positions stored without the engine → each missing position analysed and stored before the next → progress "N of T positions" → when complete, `buildReport` and one transaction storing the report and deleting reports and evals of other depth or version.
    - `data/analysisStore.ts` (`AnalysisStore` over `chess_evals` and `chess_reports`).
    - Integration tests with the mock engine: a second run reuses stored evals and sends no `go` for them; the outdated report is replaced.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/chess/engine`; commit `feat(chess): add game analyzer queue and evaluation loop`
    - _Requirements: 55.2, 55.3, 55.4, 55.5, 55.7, 55.11, 60.1, 60.2, 60.3, 60.4, 60.5_

  - [~] 34.20 Implement Game_Analyzer part 2: failures, cancel and pause
    - Worker error or timeout → restart and retry the same position once → second failure stops analysis and queue with "Analysis stopped: the engine stopped responding."; start failure message with Retry; storage failure stops analysis and queue keeping stored evals; `cancel` (stop engine within 1 s, clear queue, keep evals); `pause`/`resume` on `visibilitychange`.
    - Integration tests with the mock engine (R74.8): restart-and-retry succeeds; second failure stops the queue; cancel keeps evals; storage failure stops.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/chess/engine`; commit `feat(chess): add game analyzer failure handling, cancel and pause`
    - _Requirements: 55.6, 55.8, 55.9, 55.10, 60.7, 74.8_

  - [~] 34.21 Write property test for Analysis_Cache idempotence
    - **Property 152: Analysis cache idempotence**
    - **Validates: Requirements 60.4, 60.5, 55.2**
    - Verify and commit: `npm run typecheck`; `npx vitest --run p152.property`; commit `test(chess): add analysis cache property test (P152)`

- [ ] 35. Chess module wiring and screens
  - [~] 35.1 Implement Chess backup and the full Chess ModuleDefinition
    - `src/modules/chess/data/backup.ts`: `exportData` (games, sync state, ratings, puzzle attempts and rating, trees, SRS, reviews, tip state, evals, reports), `importData`, `backup.schema`, `sections()`.
    - `src/modules/chess/index.ts`: every route from the design list, each lazily loading a screen file under `src/modules/chess/ui/screens/` (create placeholders now; tasks 35.2–35.9 replace them), `useCommandEntries` (repertoire trees, "Chess" screen, "Next puzzle", "Drill openings", "Sync chess games" with `needsNetwork`), `settings.Section` (`ui/ChessSettingsSection.tsx` placeholder), `DashboardCard` (`ui/ChessDashboardCard.tsx` placeholder).
    - Example test: export → clear → import restores equal records including evals and reports.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/chess`; commit `feat(chess): add chess backup and module wiring`
    - _Requirements: 2.1, 2.3, 2.7, 8.4, 60.6, 72.2_

  - [~] 35.2 Build the Chess start screen and the tips browser
    - Start screen: daily tip with band, Chess.com ratings with age label and background refresh, "Using manual rating" note, Puzzle_Rating ("provisional" while RD > 110, "—" when none), due drill count, shortcuts.
    - Tips browser with band filter (default the Chess_Rating band) and topic filter, "No tips match" with "Clear filters", tip detail.
    - Component tests: daily tip stays the same after a band change on the same date; empty filter state.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/chess/ui`; commit `feat(chess): add chess start screen and tips browser`
    - _Requirements: 40.9, 41.4, 41.7, 41.8, 43.4, 43.5, 43.7, 43.8, 49.8, 65.1, 65.3, 65.4_

  - [~] 35.3 Build the free board screen
    - `/chess/board`: board with undo, redo, reset, flip, FEN/PGN load field with limits and error messages.
    - Component test: loading a PGN shows its final position; undo then redo returns to it.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/chess/ui`; commit `feat(chess): add free board screen`
    - _Requirements: 42.1, 42.7, 42.8, 42.9, 42.10_

  - [~] 35.4 Build the game list, Game_Viewer, rating history and sync UI
    - Game list with filters (time class, result, colour, opening), sync button with progress, result Toast and error with Retry, offline state; Game_Viewer stepping moves (buttons and arrow keys), clocks at each ply, Owner move marks from the stored report, unreadable PGN notice; rating history chart (rapid, 3 months default).
    - Component tests: arrow keys step the viewer; sync offline shows the offline message and disables the button.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/chess/ui`; commit `feat(chess): add game list, viewer and rating history`
    - _Requirements: 1.5, 44.12, 44.13, 44.14, 44.15, 44.16, 45.1, 45.2, 45.3, 45.4, 45.5, 45.6, 45.7, 45.8, 45.9, 73.1_

  - [~] 35.5 Build the Puzzle_Trainer and puzzle statistics screens
    - `/chess/puzzles`: opponent's first move after 300 ms, Owner moves through `puzzleReducer`, revert within 500 ms on failure, hints, "Show solution" at 500 ms steps, next puzzle, review queue, load failure with Retry; attempt recorded once with Retry on write failure.
    - `/chess/puzzles/stats`: Puzzle_Rating, theme statistics with accuracy.
    - Component tests: wrong move reverts and records score 0 once; load failure shows the message and stores nothing.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/chess/ui`; commit `feat(chess): add puzzle trainer and statistics screens`
    - _Requirements: 47.10, 48.1, 48.4, 48.6, 48.7, 48.8, 48.12, 48.13, 50.3, 50.4, 50.7_

  - [~] 35.6 Build the repertoire tree list, tree editor and learn mode
    - Tree list (create, rename, delete with Undo, reset to starter with confirmation and Undo, empty state), tree editor (play moves to add, conflict confirmation naming the existing move, trees and removed count, delete branch with Undo, explanation editing with the 300-character limit), learn mode walking every line.
    - Component tests: conflict confirmation cancel changes nothing; explanation over 300 characters is not stored.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/chess/ui`; commit `feat(chess): add repertoire editor and learn mode`
    - _Requirements: 51.3, 51.4, 51.8, 51.10, 51.11, 52.1, 52.2_

  - [~] 35.7 Build the drill and opening statistics screens
    - `/chess/drill`: queue from `buildDrillQueue`, opponent replies after 300 ms via `chooseReply`, first/second/failed grading once per position per session, summary; `/chess/openings/stats`: accuracy and mastery per tree, score rows, deviation list, Chess.com game link.
    - Component tests: a second try grades 3; summary shows accuracy and next due date.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/chess/ui`; commit `feat(chess): add drill and opening statistics screens`
    - _Requirements: 52.3, 52.4, 52.5, 52.6, 52.7, 52.8, 52.9, 52.10, 52.11, 54.1, 54.2, 54.5, 54.6, 54.7_

  - [~] 35.8 Build the analysis queue, Game_Report and Pattern_Report screens
    - `/chess/analysis`: analyse selected or last N games, progress "N of T positions", cancel, paused state, error messages with Retry; per-game report (counts, key mistakes with better moves on a board, detections, tips); `/chess/patterns`: scope and time-class selectors, too-few message, pattern list with Practice / Read tips actions.
    - Component tests with the mock engine: progress updates; cancel stops and keeps evals.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/chess/ui`; commit `feat(chess): add analysis, report and pattern screens`
    - _Requirements: 55.5, 55.6, 55.7, 55.10, 58.1, 58.2, 58.3, 58.6, 58.7, 59.2, 59.5, 59.6, 59.7_

  - [~] 35.9 Build the Chess settings section and the Chess DashboardCard
    - `ChessSettingsSection.tsx`: username with verification (stored only after a 200 response; not-found and network messages), proxy URL (reset the client route on change, link to `worker/README.md` on GitHub), rating source and manual rating.
    - `ChessDashboardCard.tsx`: one `liveQuery` over ratings, Puzzle_Rating, tip state and due drill count, no network calls, "Next puzzle" and "Drill openings" actions, Skeleton and error panel.
    - Component tests: an unverified username is not stored; the card makes no `fetch` call.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/chess/ui`; commit `feat(chess): add chess settings section and dashboard card`
    - _Requirements: 5.2, 40.1, 40.2, 40.3, 40.4, 40.5, 40.6, 40.7, 40.8, 46.7, 61.1, 61.2, 61.3, 61.4, 61.5_

- [~] 36. Checkpoint: Chess module
  - Run `npm run typecheck`, `npx vitest --run` and `npm run build`; fix any failure and commit fixes with `fix(chess): …`.
  - Ensure all tests pass, ask the user if questions arise.

## Part 6: Final integration

- [ ] 37. Generate the committed datasets from the real sources
  - [~] 37.1 Download free-exercise-db and generate the exercise library
    - Download the source into the gitignored `.data-src/`: `git clone --depth 1 https://github.com/yuhonas/free-exercise-db.git .data-src/free-exercise-db` (or the GitHub archive zip of the default branch if `git clone` is blocked).
    - Run `npm run data:exercises -- --src .data-src/free-exercise-db --out public/exercises`. Check the printed included and excluded counts, that `public/exercises/exercises.json` parses with the Gym `LibraryExercise` schema, and report the total size of `public/exercises/` in the task summary.
    - Confirm the free-exercise-db licence in the checkout matches the About entry from task 14.3.
    - If the download is impossible (no network, blocked host, or the script fails on the real data for a reason that cannot be fixed in this task), generate a small sample instead from the valid fixture records in `scripts/fixtures/free-exercise-db/` with the same script, add `public/exercises/SAMPLE-DATASET.md` stating clearly that this is a sample and not the full library, and add a "Datasets" section to `README.md` with the exact download and regeneration commands. Report the reason in the task summary.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/gym scripts`; commit `chore(data): generate exercise library from free-exercise-db` (or `chore(data): add labelled sample exercise dataset` for the fallback)
    - _Requirements: 13.1, 13.2, 13.5, 13.9, 5.4_

  - [~] 37.2 Download the Lichess puzzle database and generate the puzzle file
    - Check free disk space first (the compressed file is about 250 MB and the CSV is several times larger). Download `https://database.lichess.org/lichess_db_puzzle.csv.zst` into `.data-src/`.
    - Decompress with the `zstd` CLI if available, else with Node's built-in `zlib` zstd support when the installed Node version has it. If neither is available, treat it as "download impossible" below.
    - Run `npm run data:puzzles -- --in .data-src/lichess_db_puzzle.csv --out public/data/puzzles.json`. Check the printed rows read, puzzles per bucket and exclusions per reason, and that the gzip size is within 3 MB.
    - If the download or decompression is impossible, run the script on `scripts/fixtures/puzzles.csv` to produce a small valid `public/data/puzzles.json`, add `public/data/SAMPLE-PUZZLES.md` stating clearly that this is a sample, and extend the "Datasets" section of `README.md` with the exact download, decompression and regeneration commands. Report the reason in the task summary.
    - Delete the large files in `.data-src/` after a successful run only if the user agrees; they are gitignored either way.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/modules/chess scripts`; commit `chore(data): generate puzzle set from lichess database` (or `chore(data): add labelled sample puzzle dataset` for the fallback)
    - _Requirements: 47.1, 47.4, 47.5, 47.6, 47.7, 47.8, 47.9_

- [ ] 38. Cross-module properties and end-to-end wiring
  - [~] 38.1 Run the backup properties against the real Module_Registry
    - `src/test/arbitraries/appStateReal.ts`: `arbAppState` over core data and every table of the real Gym, Nutrition and Chess modules (built from the module arbitraries, each table possibly empty, Hebrew and emoji text, full-precision fractions, stored images).
    - Switch the Property 14, 15 and 16 tests from the generic test registry to `MODULES` and this generator; keep their tags and `numRuns` ≥ 100.
    - Verify and commit: `npm run typecheck`; `npx vitest --run p14.property p15.property p16.property`; commit `test(core): run backup properties against the real module registry`
    - _Requirements: 7.9, 8.1, 8.2, 8.5, 8.6_

  - [~] 38.2 Write property test for the per-module round trip
    - **Property 18: Per-module round trip**
    - **Validates: Requirements 8.4, 60.6**
    - For each registered module, generated valid data (Chess data includes evaluations and Game_Reports).
    - Verify and commit: `npm run typecheck`; `npx vitest --run p18.property`; commit `test(core): add per-module backup round trip property test (P18)`

  - [~] 38.3 Extend the idempotent-create property to every module create path
    - Extend the Property 20 test so its operations include Food_Entries (manual, Saved_Meal, AI review, portion), Weight_Entries, Saved_Meals, Routines, Custom_Exercises, puzzle attempts and Sets inside a Session, with adjacent, interleaved and concurrent repeats and differing field values.
    - Verify and commit: `npm run typecheck`; `npx vitest --run p20.property`; commit `test(core): extend idempotent create property to all module tables`
    - _Requirements: 11.1, 11.2, 11.3, 15.6, 37.8, 48.11_

  - [~] 38.4 Extend the undo-identity property to every destructive action
    - Extend the Property 23 test with: delete Set, remove Session Exercise, discard/delete Session, archive Exercise, delete Routine, Food_Entry, Saved_Meal or Weight_Entry, replace Weight_Entry, delete repertoire branch or tree, replace repertoire move, reset Repertoire, and backup import.
    - Verify and commit: `npm run typecheck`; `npx vitest --run p23.property`; commit `test(core): extend undo identity property to all destructive actions`
    - _Requirements: 64.2, 64.3, 7.11, 16.6, 18.6, 38.2, 38.3, 51.4, 51.8_

  - [~] 38.5 Add end-to-end wiring tests and verify the production build
    - `src/test/app.integration.test.tsx` rendering the real app on fake-indexeddb: first-run Profile, then tabs Home, Gym, Nutrition, Chess in order; three dashboard cards; Settings sections in order; the Command_Menu lists entries from core and every module; going offline disables Chess.com sync, Open Food Facts lookup and AI estimation with the offline message and re-enables them after the `online` event.
    - Extend `scripts/lib/checkDist.ts` so the build fails when the precache manifest misses `exercises/exercises.json`, `data/puzzles.json`, `data/tips.json`, `data/repertoire-starter.json` or the engine files, or includes `exercises/img/**`, `version.json` or `404.html`; add unit cases.
    - Run `npm run build` and confirm all dist checks pass.
    - Verify and commit: `npm run typecheck`; `npx vitest --run src/test scripts`; commit `test(app): add end-to-end wiring tests and precache checks`
    - _Requirements: 1.3, 1.5, 1.10, 2.3, 2.7, 5.1, 12.5, 47.9, 72.2_

- [~] 39. Final checkpoint: whole app
  - Run `npm run typecheck`, `npx vitest --run` and `npm run build` from a clean state (`npm ci` first); fix any failure and commit fixes with `fix(<scope>): …`.
  - Confirm `git status` shows no uncommitted changes other than task status updates in `tasks.md`, and that every commit since the initial one is on `feature/personal-lab`. Leave the branch unmerged and unpushed; ask the user before merging into `main` (a push to `main` deploys to GitHub Pages).
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Property-based test sub-tasks are required, not optional, because the Owner asked for no mistakes. All 152 design properties have their own sub-task; Properties 14, 15, 16, 20 and 23 are first written against generic test tables and then extended to the real modules in tasks 38.1, 38.3 and 38.4.
- Unit, example, component, integration and build-script tests are part of each implementation sub-task rather than separate optional tasks.
- Each sub-task references granular requirement criteria for traceability; checkpoints run the whole suite and the production build.
- Modules start as valid stubs in task 3.2 so the core, database and backup layers can be built and tested first. Each module's wiring task (20.5, 27.7, 35.1) declares every route against placeholder screens, so the later screen tasks only replace their own screen files and never edit the module definition in parallel.
- All npm dependencies are installed in task 1.3, so no later parallel task edits `package.json` (only 10.1 changes the `build` script).
- The design's manual on-device checklist (standalone launch, camera, sound, gestures, safe areas, engine speed) is not a coding task and is not in this plan; run it on the iPhone after deployment.
- Data scripts run on the developer PC and their outputs are committed, so CI never downloads source datasets.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3"] },
    { "id": 3, "tasks": ["1.4"] },
    { "id": 4, "tasks": ["2.1", "3.1"] },
    { "id": 5, "tasks": ["2.2", "2.3", "2.4", "2.5", "3.2"] },
    { "id": 6, "tasks": ["2.6", "3.3", "3.4", "4.1"] },
    { "id": 7, "tasks": ["4.2", "4.3", "4.4"] },
    { "id": 8, "tasks": ["4.5", "4.6", "5.1", "5.2", "6.1", "6.3", "8.1"] },
    { "id": 9, "tasks": ["5.3", "5.4", "5.5", "6.2", "6.4", "7.1", "7.6", "8.2"] },
    { "id": 10, "tasks": ["7.2", "9.1"] },
    { "id": 11, "tasks": ["7.3", "9.2"] },
    { "id": 12, "tasks": ["7.4", "7.5", "10.1"] },
    { "id": 13, "tasks": ["7.7", "7.8", "7.9", "7.10", "7.11", "7.12", "7.13", "7.14", "7.15", "7.16", "7.17", "7.18", "10.2"] },
    { "id": 14, "tasks": ["12.1", "12.2", "13.1"] },
    { "id": 15, "tasks": ["12.3", "12.4", "12.5", "12.6", "12.8", "12.11", "12.12", "13.2"] },
    { "id": 16, "tasks": ["12.7", "12.9", "12.10", "13.3"] },
    { "id": 17, "tasks": ["14.1"] },
    { "id": 18, "tasks": ["14.2"] },
    { "id": 19, "tasks": ["14.3"] },
    { "id": 20, "tasks": ["14.4"] },
    { "id": 21, "tasks": ["16.1"] },
    { "id": 22, "tasks": ["16.2", "17.1", "18.5", "18.6", "19.1", "19.7"] },
    { "id": 23, "tasks": ["16.3", "16.4", "17.2", "17.3", "17.4", "17.5", "17.6", "17.7", "17.8", "17.9", "17.10", "18.1", "18.8", "18.9", "18.13", "19.2", "19.3", "19.4", "19.5", "19.6", "19.8", "19.9", "19.10", "19.11", "19.12"] },
    { "id": 24, "tasks": ["17.11", "17.12", "17.13", "18.2", "18.3", "19.13"] },
    { "id": 25, "tasks": ["18.4", "18.7", "18.10", "18.11", "18.12", "19.14"] },
    { "id": 26, "tasks": ["18.14", "18.15", "18.16", "20.1", "20.2"] },
    { "id": 27, "tasks": ["20.3", "20.4"] },
    { "id": 28, "tasks": ["20.5", "20.8", "20.9"] },
    { "id": 29, "tasks": ["20.6", "20.7", "21.1", "21.3", "21.4"] },
    { "id": 30, "tasks": ["21.2", "21.5", "21.7"] },
    { "id": 31, "tasks": ["21.6", "21.8"] },
    { "id": 32, "tasks": ["21.9"] },
    { "id": 33, "tasks": ["23.1"] },
    { "id": 34, "tasks": ["23.2", "24.1", "24.8", "25.1", "26.1", "26.7"] },
    { "id": 35, "tasks": ["23.3", "23.4", "23.5", "23.6", "23.7", "23.8", "24.2", "24.3", "24.4", "24.5", "24.6", "24.7", "24.9", "24.10", "24.11", "25.2", "25.3", "25.4", "25.5", "25.6", "25.7", "25.8", "26.2", "26.3", "26.4", "26.5", "26.6", "26.8", "26.9", "26.10", "26.11", "26.12"] },
    { "id": 36, "tasks": ["26.13", "26.14", "26.15", "26.16", "27.1", "27.4", "27.5"] },
    { "id": 37, "tasks": ["27.2", "27.3", "27.6"] },
    { "id": 38, "tasks": ["27.7"] },
    { "id": 39, "tasks": ["28.1", "28.3", "28.5", "28.7"] },
    { "id": 40, "tasks": ["28.2", "28.4", "28.6", "28.8"] },
    { "id": 41, "tasks": ["30.1"] },
    { "id": 42, "tasks": ["30.2", "30.5", "31.1", "31.3", "31.11", "31.15", "32.1", "32.3", "32.6", "33.1", "33.5", "34.1", "34.2", "34.7"] },
    { "id": 43, "tasks": ["30.3", "30.4", "30.6", "30.7", "30.8", "31.2", "31.4", "31.5", "31.6", "31.7", "31.12", "31.13", "31.14", "31.16", "32.2", "32.4", "32.5", "32.7", "32.8", "32.9", "33.2", "33.3", "33.4", "33.6", "33.7", "33.8", "33.9", "33.10", "33.11", "33.12", "34.3", "34.4", "34.5", "34.6", "34.8", "34.9"] },
    { "id": 44, "tasks": ["31.8", "31.9", "31.10", "32.10", "33.13", "33.14", "33.15", "33.16", "33.17", "34.10"] },
    { "id": 45, "tasks": ["32.11", "34.11"] },
    { "id": 46, "tasks": ["34.12", "34.13", "34.16"] },
    { "id": 47, "tasks": ["34.14", "34.15", "34.17", "34.18", "34.19"] },
    { "id": 48, "tasks": ["34.20"] },
    { "id": 49, "tasks": ["34.21", "35.1"] },
    { "id": 50, "tasks": ["35.2", "35.3", "35.4", "35.5", "35.6", "35.7", "35.8", "35.9"] },
    { "id": 51, "tasks": ["37.1", "38.1", "38.3", "38.4"] },
    { "id": 52, "tasks": ["37.2", "38.2"] },
    { "id": 53, "tasks": ["38.5"] }
  ]
}
```
