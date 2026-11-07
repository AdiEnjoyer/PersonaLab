# Requirements Document

## Introduction

PersonalLab is a modular, data-driven self-improvement tracking app for a single user (the Owner) on iPhone. The UI is in English. The app is a React + TypeScript Progressive Web App installed through Safari "Add to Home Screen", runs full-screen, works offline, and stores all data locally on the phone. It must cost nothing to build, host and use.

The app ships with three modules (Gym, Nutrition, Chess) on top of a shared core (profile, settings, backup, updates, navigation, dashboard, command menu). Every module plugs into a module registry, so future modules (Sleep is next) can be added without rewriting the app.

Decided stack (recorded here as a constraint, detailed in the design): Vite, React, TypeScript, Tailwind, React Router, vite-plugin-pwa, Dexie (IndexedDB), Recharts, chess.js, react-chessboard, Stockfish WASM (single-threaded, in a Web Worker), ZXing (barcode), Vitest, React Testing Library, fake-indexeddb, fast-check. Hosting: GitHub Pages, deployed by GitHub Actions.

The Owner asked for no mistakes. Calculations are therefore specified with exact formulas, constants and rounding rules so that each one can be checked by property-based or example tests.

## Conventions

These conventions apply to every requirement unless a requirement states otherwise.

- **Units**: mass in kilograms (kg), body height in centimetres (cm), food mass in grams (g), energy in kilocalories (kcal), durations in seconds or minutes as stated.
- **Local_Date**: the calendar date in the phone's current time zone. A day starts at local midnight.
- **ISO week**: a week starting Monday 00:00 local time.
- **Rounding**: "round" means round half away from zero. Stored values keep full precision. Rounding applies only to displayed values and to values the requirement explicitly says are rounded. Totals are computed from unrounded values and rounded once.
- **Configuration constants**: every threshold named in these requirements (for example the 10/20 set thresholds or the 5/10/15 win-probability thresholds) lives in one constants file per module so that it can be changed in one place.
- **Material values** (chess): pawn 1, knight 3, bishop 3, rook 5, queen 9, king not counted.

## Glossary

- **Owner**: the single person who uses the app. There are no accounts and no login.
- **App**: the PersonalLab Progressive Web App as a whole.
- **App_Shell**: the HTML, JavaScript, CSS, fonts, icons and bundled data files needed to start the App.
- **Service_Worker**: the App's service worker that precaches the App_Shell and serves cached responses offline.
- **Local_Database**: the IndexedDB database the App uses through Dexie.
- **Module**: a self-contained feature area (Gym, Nutrition, Chess, and future modules such as Sleep).
- **ModuleDefinition**: the object each Module exports: `id`, `name`, `icon`, `routes`, `DashboardCard`, database table declarations, `exportData()`, `importData()`, and optional command menu entries.
- **Module_Registry**: the single list of registered ModuleDefinitions that navigation, the Home_Dashboard, the Backup_Service and the Command_Menu read.
- **Home_Dashboard**: the start screen that shows one DashboardCard per registered Module.
- **Profile**: the Owner's age, sex (male or female), height, weight, weekly training hours, and goal (cut, maintain or bulk).
- **Settings_Screen**: the screen where the Owner edits Profile, API key, Chess.com username, proxy URL, reminder interval and other preferences.
- **Backup_Service**: the core component that exports and imports Backup_Files.
- **Backup_File**: one versioned JSON file containing core data and every registered Module's data.
- **Schema_Version**: the integer version of the Backup_File format.
- **Update_Service**: the component that detects a new deployed App version and prompts the Owner.
- **Idempotency_Key**: a unique identifier attached to a create operation so that repeating the operation with the same key creates no additional record.
- **Toast**: a short message shown at the bottom of the screen, optionally with an action button.
- **Undo_Toast**: a Toast with an "Undo" action shown after a destructive action.
- **Bottom_Sheet**: a panel that slides up from the bottom of the screen and can be dismissed by swiping down.
- **Command_Menu**: a searchable sheet that lists exercises, routines, screens and actions and jumps to the selected one.
- **Skeleton**: a placeholder that mimics the layout of content while it loads.
- **BlurHash**: a short string encoding a blurred preview of an image, shown until the image loads.
- **Deployment_Pipeline**: the GitHub Actions workflow that tests, builds and deploys the App to GitHub Pages.
- **Gym_Module**: the Module for exercises, routines, workout sessions, records and split analysis.
- **Exercise**: a movement with a name, primary muscles, secondary muscles, equipment, instructions and zero or more photos.
- **Library_Exercise**: an Exercise imported from free-exercise-db.
- **Custom_Exercise**: an Exercise created by the Owner.
- **Exercise_Build_Script**: the build-time script that converts free-exercise-db into the App's exercise data and image files.
- **Exercise_Library**: the screen and data set listing all non-archived Exercises.
- **Routine**: an ordered list of Routine_Items with a name.
- **Routine_Item**: an Exercise in a Routine with target sets (integer) and a rep range (minimum and maximum reps).
- **Session**: one workout. A Session is either Active (in progress) or Finished.
- **Set**: one entry in a Session with weight (kg), reps, and a completed flag.
- **Completed_Set**: a Set whose completed flag is true and whose reps value is at least 1.
- **Session_Logger**: the Gym_Module screen and logic for recording an Active Session.
- **Rest_Timer**: the countdown shown between Sets.
- **E1RM**: estimated one-rep maximum computed with the Epley formula.
- **Set_Volume**: weight × reps of one Completed_Set.
- **PR**: personal record (weight PR, E1RM PR or rep PR, as defined in Requirement 24).
- **PR_Detector**: the pure function that decides which Completed_Sets are PRs.
- **Split_Analyzer**: the pure functions that compute weekly sets per muscle and the training-balance flags.
- **Analysis_Window**: the 7 consecutive Local_Dates the Split_Analyzer evaluates. The default window ends today.
- **Nutrition_Module**: the Module for energy targets, food logging, barcode scanning, AI meal estimation and body weight.
- **Energy_Calculator**: the pure functions that compute BMR, TDEE, Daily_Burn and targets.
- **BMR**: basal metabolic rate in kcal/day from the Mifflin-St Jeor formula.
- **TDEE**: total daily energy expenditure = BMR × Activity_Factor.
- **Activity_Factor**: the multiplier selected from Effective_Training_Hours.
- **Logged_Training_Hours**: weekly hours derived from Finished Sessions (Requirement 29).
- **Effective_Training_Hours**: the weekly training hours the Energy_Calculator uses (manual override, Logged_Training_Hours, or Profile value).
- **Burn_Offset**: a kcal/day correction the Owner accepted from the Trend_Corrector. Defaults to 0.
- **Daily_Burn**: TDEE + Burn_Offset.
- **Calorie_Target**: the daily kcal target after goal adjustment.
- **Protein_Target**: the daily protein target in grams.
- **Current_Weight**: the most recent Weight_Entry value, or the Profile weight when no Weight_Entry exists.
- **Food_Entry**: one logged food item with name, kcal, protein, carbs, fat, optional grams, meal slot, Local_Date, source and Idempotency_Key.
- **Food_Log**: all Food_Entries.
- **Saved_Meal**: a named, reusable group of food items.
- **Logged_Day**: a Local_Date with at least one Food_Entry that the Owner has not marked as incomplete.
- **Barcode_Scanner**: the camera screen that reads product barcodes with ZXing.
- **Food_Lookup**: the client that queries Open Food Facts by barcode.
- **Product_Cache**: the Local_Database store of looked-up and manually entered products keyed by barcode.
- **Portion_Calculator**: the pure functions that scale per-100 g nutrient values to a portion.
- **Meal_Estimator**: the component that sends a meal photo to Google Gemini Flash and parses the structured result.
- **Gemini_Key**: the Owner's own Google AI Studio API key.
- **Weight_Entry**: one body-weight value for one Local_Date.
- **Weight_Trend**: the 7-day trailing moving average of Weight_Entries.
- **Trend_Corrector**: the pure function that compares average intake with weight change and suggests a corrected Daily_Burn.
- **Chess_Module**: the Module for chess tips, Chess.com data, puzzles, openings and game analysis.
- **Chess_Rating**: the rating the Chess_Module uses to pick Rating_Bands (Requirement 40).
- **Rating_Band**: a rating interval used to group tips: below 800, 800–999, 1000–1199, 1200–1399, 1400–1599, 1600–1799, 1800–1999, 2000 and above.
- **Tips_Library**: the bundled, authored set of chess tips tagged by Rating_Band and topic.
- **ChessCom_Client**: the client for the Chess.com public API.
- **CORS_Proxy**: an optional free Cloudflare Worker that forwards requests to the Chess.com public API.
- **Game_Record**: one synced Chess.com game including its PGN.
- **Game_Sync**: the process that downloads new Game_Records.
- **Game_Viewer**: the screen that steps through the moves of a Game_Record.
- **Puzzle_Build_Script**: the build-time script that extracts the bundled puzzle subset from the Lichess puzzle database.
- **Puzzle**: a bundled Lichess puzzle with id, FEN, solution moves, rating, rating deviation and themes.
- **Puzzle_Trainer**: the screen and logic for solving Puzzles.
- **Puzzle_Rating**: the Owner's in-app Glicko-2 rating (rating, rating deviation, volatility) for Puzzles.
- **Glicko2_Calculator**: the pure function that updates a Glicko-2 rating.
- **Repertoire**: the Owner's opening move trees, one tree per opening and colour.
- **Repertoire_Position**: a position in a Repertoire where the Owner is to move, keyed by the first four fields of its FEN.
- **Opening_Trainer**: the screen and logic for learning and drilling the Repertoire.
- **SRS_Scheduler**: the pure SM-2 spaced-repetition function.
- **Engine**: Stockfish WASM, single-threaded, running in a Web Worker.
- **Analysis_Depth**: the fixed search depth the Engine uses for game analysis. Default 12.
- **Win_Probability**: the expected score in percent (0–100) for the side to move, derived from the Engine evaluation.
- **Move_Classifier**: the pure function that labels a move as inaccuracy, mistake or blunder.
- **Mistake_Detectors**: the rule-based pure functions that recognise mistake patterns (Requirement 57).
- **Game_Analyzer**: the component that runs the Engine, the Move_Classifier and the Mistake_Detectors over a Game_Record.
- **Game_Report**: the per-game analysis output.
- **Pattern_Report**: the cross-game summary of recurring mistakes.
- **Analysis_Cache**: the Local_Database store of completed Game_Reports.
- **Game_Phase**: opening, middlegame or endgame, as defined in Requirement 57.

## Requirements

---

## Part A: Core platform

### Requirement 1: Installable offline app

**User Story:** As the Owner, I want to install PersonalLab on my iPhone home screen and use it without a connection, so that it feels like a native app and works anywhere.

#### Acceptance Criteria

1. THE App SHALL provide a web app manifest with `name` and `short_name` set to "PersonalLab", `display` set to `standalone`, `start_url` and `scope` both inside the deployed GitHub Pages base path, and PNG home-screen icons of 180×180 px and 512×512 px, with the 180×180 px icon also referenced as the page's apple-touch-icon.
2. WHEN the Owner launches the App from the iPhone home screen icon, THE App SHALL render full-screen in standalone mode with no Safari address bar, toolbar or tab bar visible, and SHALL keep every navigation to a URL inside the deployed base path in standalone mode.
3. WHEN the Service_Worker finishes installing after the App has been loaded once while online, THE Service_Worker SHALL have precached every App_Shell file listed in the build's precache manifest, so that each of those files is served from the cache with no network request.
4. WHILE the device has no network connection, THE App SHALL start from the home screen icon and display the Home_Dashboard within 3 seconds, and SHALL provide every feature except those listed in criterion 5, including reading and writing the Local_Database.
5. WHILE the device has no network connection, THE App SHALL show an "offline" message on each feature that needs the network (Chess.com sync, Open Food Facts lookups of barcodes not in the Product_Cache, AI meal estimation, and Exercise photos that have not been cached), SHALL disable the control that starts that feature's network request, and SHALL keep any input the Owner has already entered on that screen.
6. WHEN the App starts for the first time, THE App SHALL request persistent storage through `navigator.storage.persist()` without blocking start-up, and SHALL record the result as "granted", "not granted", or "not supported" when the Storage API is unavailable or the call fails.
7. WHEN the Owner opens the Settings_Screen, THE Settings_Screen SHALL show the persistent storage status as "granted", "not granted" or "not supported" (read from `navigator.storage.persisted()` when available, otherwise the result recorded in criterion 6), and SHALL show "Offline ready: yes" only if every App_Shell file is precached, otherwise "Offline ready: no".
8. IF precaching of any App_Shell file fails, THEN THE Service_Worker SHALL keep serving the previously complete cache (or the network if no complete cache exists), SHALL retry the full precache on the next App start while online, and THE App SHALL continue to work online in the meantime.
9. IF a network request for a feature listed in criterion 5 fails because the network is unreachable while the device reports a connection, THEN THE App SHALL show the same "offline" message as criterion 5 and SHALL keep the Owner's input on that screen.
10. WHEN the network connection returns, THE App SHALL remove every "offline" message and re-enable the controls disabled by criterion 5 within 5 seconds, without the Owner restarting the App.

### Requirement 2: Modular architecture and module registry

**User Story:** As the Owner, I want features organised as independent modules, so that new modules such as Sleep can be added later without rewriting the app.

#### Acceptance Criteria

1. THE App SHALL define a ModuleDefinition type with the required fields `id`, `name`, `icon`, `routes`, `DashboardCard`, database table declarations, `exportData()` and `importData()`, and an optional list of Command_Menu entries, so that a ModuleDefinition missing any required field fails TypeScript type checking.
2. THE Module_Registry SHALL contain exactly the ModuleDefinitions of the Gym_Module, the Nutrition_Module and the Chess_Module, in that order.
3. WHEN the App starts, THE App SHALL build one navigation tab, the declared routes, one Home_Dashboard card and the declared Command_Menu entries for each Module in the Module_Registry, ordered by the Module's position in the Module_Registry list (first entry first), and a Module that declares no Command_Menu entries SHALL contribute no Command_Menu entries without causing an error.
4. WHEN the Owner exports a Backup_File, THE Backup_Service SHALL call `exportData()` exactly once for each Module in the Module_Registry, in registry order, and SHALL write each result into that Module's entry in the Backup_File (Requirement 6).
5. IF at start-up any ModuleDefinition `id` in the Module_Registry is not 1 to 20 characters long, made only of lowercase letters a–z and digits 0–9, and starting with a letter, or two or more ModuleDefinitions share the same `id` (exact, case-sensitive comparison), or two or more ModuleDefinitions declare the same route path, THEN THE App SHALL stop start-up, render no navigation tabs, Module routes, Home_Dashboard cards or Command_Menu entries, leave the Local_Database unchanged, and show a full-screen error that names every invalid `id`, every duplicated `id`, and every duplicated route path together with the `id`s that declare it.
6. THE App SHALL name every Module database table as the Module `id`, followed by an underscore, followed by the table name (for example, the `sessions` table of a Module with `id` `gym` is named `gym_sessions`).
7. WHEN a ModuleDefinition with a unique valid `id`, at least one route, a DashboardCard, at least one database table and at least one Command_Menu entry is added to the Module_Registry, THE App SHALL show the new Module's navigation tab, serve its routes, show its Home_Dashboard card, list its Command_Menu entries and include its entry in exported Backup_Files, with source changes limited to the new Module's own code, the Module_Registry list and the Local_Database schema version declaration.
8. THE core source code (all App source code outside Module code) SHALL import Module code only through the Module_Registry, so that a static scan of import statements finds no core source file other than the Module_Registry that imports Module code.
9. IF any Module's `exportData()` throws an error or returns a rejected promise during an export, THEN THE Backup_Service SHALL produce no Backup_File, leave the last backup time unchanged, leave the Local_Database unchanged, and show an error message that names the failing Module `id`.
10. IF a Module's DashboardCard throws an error while rendering, THEN THE Home_Dashboard SHALL show, in that card's position, a placeholder naming the Module's `name` and stating that the card failed to load, and SHALL render every other Module's card normally.

### Requirement 3: Local data storage and schema migration

**User Story:** As the Owner, I want my data kept on my phone and preserved across app updates, so that I never lose my history.

#### Acceptance Criteria

1. THE App SHALL store all Owner data in the Local_Database on the device and keep no copy on any server. Owner data means the Profile, every value set on the Settings_Screen (including the Gemini_Key, Chess.com username and proxy URL), and every record of every registered Module.
2. THE App SHALL send Owner data off the device only in the requests listed here. Each request SHALL carry only the data listed for it:
   - Chess.com username lookups and Game_Sync requests, sent to the Chess.com public API or to the CORS_Proxy at the configured proxy URL, carry only the Chess.com username and the archive periods requested.
   - Open Food Facts lookups carry only the scanned or typed barcode.
   - Gemini meal photo estimation requests carry only the meal photo the Owner submitted for that estimate and the Gemini_Key.
   - Backup_File sharing happens only after the Owner starts an export or share action.

   All other network requests, including App_Shell and Update_Service fetches, SHALL carry no Owner data. The App SHALL send no analytics, telemetry or crash reports.
3. WHEN the App opens the Local_Database and the stored Local_Database schema version is lower than the App's declared Local_Database schema version, THE App SHALL do the following before the Home_Dashboard or any Module screen reads or writes Owner data:
   - Run every declared migration from the stored version + 1 up to the App's declared version, once each, in ascending version order, as one all-or-nothing upgrade.
   - Make sure every record present before the upgrade is present afterwards, with its values preserved or transformed exactly as the migrations declare.
   - Delete only the records that a migration explicitly declares for deletion.
4. IF a Local_Database migration throws an error, or is interrupted before it completes (including when the App is closed during the migration), THEN THE App SHALL:
   - leave the Local_Database at its pre-upgrade schema version, with every record unchanged;
   - show a blocking error screen instead of the Home_Dashboard, indicating that the data update failed and that no data was lost;
   - offer a Backup_File export that contains every record present before the upgrade;
   - attempt the migration again the next time the App starts.
5. IF a Local_Database write fails, including when the device storage quota is exceeded, THEN THE App SHALL:
   - keep every record that write would have created, changed or deleted in its previously stored state, including when the write covers more than one record;
   - stop showing the unsaved change as stored data;
   - show an error Toast indicating that the change was not saved, and indicating that device storage is full when the cause is an exceeded quota.
6. IF the Local_Database cannot be opened when the App starts for any reason other than a migration failure, THEN THE App SHALL:
   - show a blocking error screen instead of the Home_Dashboard, indicating that local storage is unavailable;
   - neither delete nor overwrite any existing Local_Database data;
   - offer a retry action that attempts to open the Local_Database again.
7. IF the stored Local_Database schema version is higher than the App's declared Local_Database schema version, THEN THE App SHALL:
   - make no change to the Local_Database;
   - show a blocking error screen instead of the Home_Dashboard, indicating that the data was saved by a newer App version and that the Owner should reload the App to update it.

### Requirement 4: Profile

**User Story:** As the Owner, I want to enter my body data and goal, so that the app can compute my energy and protein targets.

#### Acceptance Criteria

1. THE Settings_Screen SHALL let the Owner set six Profile fields: age (integer years), sex (male or female), height (cm), weight (kg), weekly training hours, and goal (cut, maintain or bulk). The Owner picks sex and goal from those fixed options and does not type them.
2. THE Settings_Screen SHALL accept the following values, with both bounds inclusive: age as an integer from 13 to 100; height as an integer from 100 to 250 cm; weight from 30.0 to 300.0 kg in steps of 0.1 kg; and weekly training hours from 0 to 40 in steps of 0.5 h.
3. IF the Owner saves the Profile while any field is empty, not a number, outside its range in criterion 2, or more precise than criterion 2 allows (for example 70.25 kg, 175.5 cm or 3.2 h), THEN THE Settings_Screen SHALL show the accepted range and step next to each invalid field, save none of the changed fields, leave the saved Profile unchanged, and keep the Owner's entered values in the form so they can be corrected.
4. WHEN the App starts and no Profile exists in the Local_Database, THE App SHALL show a first-run screen with all six Profile fields empty, check them against criteria 2 and 3 when the Owner saves, and not show Calorie_Target or Protein_Target until a Profile with all six fields valid has been saved.
5. WHEN the Owner saves a Profile change that passes criteria 2 and 3, THE Energy_Calculator SHALL recompute BMR, TDEE, Daily_Burn, Calorie_Target and Protein_Target from the saved Profile, using Current_Weight and Effective_Training_Hours as defined in the Glossary. After the save, every screen that shows these values SHALL show the recomputed values. A changed Profile weight therefore changes BMR only while no Weight_Entry exists. A changed Profile weekly training hours value changes TDEE only when Effective_Training_Hours uses the Profile value.
6. WHEN the Owner saves a Profile that passes criteria 2 and 3, THE App SHALL store all six fields in the Local_Database, so that the Settings_Screen shows the same values after the App is closed and reopened.
7. IF writing the Profile to the Local_Database fails, THEN THE Settings_Screen SHALL show a Toast saying the Profile was not saved, keep the previously stored Profile and the existing targets unchanged, and keep the Owner's entered values in the form.
8. IF the App is closed before the Owner saves a valid Profile on the first-run screen, THEN THE App SHALL store no partial Profile and SHALL show the first-run screen with all fields empty at the next start.

### Requirement 5: Settings

**User Story:** As the Owner, I want one place for preferences and credentials, so that I can configure the app without editing code.

#### Acceptance Criteria

1. THE Settings_Screen SHALL show the sections Profile, Backup, Gym, Nutrition, Chess and About in this order.
2. THE Settings_Screen SHALL let the Owner set the following settings, each in the named section and limited to the listed accepted values:
   - Profile section: the Profile fields with the ranges of Requirement 4.
   - Backup section: the backup reminder interval, which is 3, 7, 14 or 30 days, or off. The default is 7 days (Requirement 9).
   - Gym section: the default rest time, from 30 to 600 seconds in 15-second steps. The default is 90 seconds (Requirement 20). The rest timer sound is an on/off switch; the default is on.
   - Nutrition section: the Gemini_Key, which is either empty or 1 to 200 characters with no whitespace after leading and trailing whitespace is removed. The default is empty.
   - Nutrition section: the manual training-hours override, which is an on/off switch plus a value from 0 to 40 hours in 0.5-hour steps. The default is off.
   - Nutrition section: the protein factor, which is either "goal default" (the per-goal default of Requirement 30) or a value from 1.6 to 2.2 g/kg in 0.1 steps. The default is "goal default".
   - Chess section: the Chess.com username, in the format of Requirement 40. The default is "AdiChessLarper".
   - Chess section: the CORS_Proxy URL, which is either empty (meaning not configured) or an absolute URL starting with "https://" of at most 2048 characters. The default is empty.
   - Chess section: the Chess_Rating source, which is "Chess.com Rapid" or "Manual", with the manual rating from 100 to 3000. The defaults are "Chess.com Rapid" and 1100 (Requirement 40).
3. THE Settings_Screen SHALL display in the About section the App version, which is the same version string the Update_Service compares, and the build date in UTC as YYYY-MM-DD. Both values are fixed at build time and are shown while the device is offline.
4. THE About section SHALL list the following projects. Each entry SHALL show the project name, the licence name and a link to the project or licence page: free-exercise-db (Unlicense), the Lichess puzzle database (CC0), Open Food Facts (ODbL), Stockfish (GPLv3, with an additional link to its source code), chess.js (BSD-2-Clause) and react-chessboard (MIT).
5. WHEN the Owner commits a setting change with an accepted value, THE Settings_Screen SHALL store the value in the Local_Database without a reload and keep it after the App is closed and reopened. A text field is committed when the Owner leaves the field or taps "Done"; a choice is committed when the Owner selects an option. The username is stored only after the verification of Requirement 40. THE App SHALL use the stored value from the next operation that reads it, and a running Rest_Timer SHALL keep its current end time.
6. IF the Owner enters a setting value outside its accepted values, THEN THE Settings_Screen SHALL show the accepted values next to the field, store nothing, and keep the previously saved value.
7. WHILE a Gemini_Key is stored, THE Settings_Screen SHALL show the key masked with only its last 4 characters visible. WHILE no Gemini_Key is stored, THE Settings_Screen SHALL show "Not set" in place of the key.

### Requirement 6: Backup export

**User Story:** As the Owner, I want to export all my data to one file, so that I can keep a copy in Files or iCloud.

#### Acceptance Criteria

1. WHEN the Owner taps "Export backup", THE Backup_Service SHALL create one Backup_File containing: a format identifier `"personallab-backup"`, the Schema_Version, the App version, the export timestamp in ISO 8601 UTC with seconds and a `Z` suffix, the core data (Profile and settings except the Gemini_Key), and one entry per registered Module in Module_Registry order containing the Module `id`, the Module data version, and the output of the Module's `exportData()`. A Module with no records SHALL still have an entry, holding the empty output of its `exportData()`.
2. THE Backup_Service SHALL include every stored image (Custom_Exercise photos and meal thumbnails) inside the Backup_File as a base64 string together with its MIME type, such that decoding the base64 string yields bytes identical to the stored image.
3. THE Backup_Service SHALL exclude the Gemini_Key from every Backup_File, such that the Gemini_Key value appears nowhere in the Backup_File text, and SHALL leave the stored Gemini_Key unchanged on the phone.
4. THE Backup_Service SHALL encode the Backup_File as UTF-8 JSON and name it `personallab-backup-YYYY-MM-DD-HHmm.json`, where the date and the zero-padded 24-hour time are the export timestamp converted to local time (for example, an export at 09:05 local time on 7 March 2025 is named `personallab-backup-2025-03-07-0905.json`).
5. WHERE the Web Share API reports that it can share the Backup_File, THE Backup_Service SHALL open the iOS share sheet with the Backup_File.
6. WHERE the Web Share API cannot share the Backup_File, THE Backup_Service SHALL start a download of the Backup_File under the file name defined in criterion 4.
7. WHEN an export completes, meaning the share sheet reports a successful share or the download of criterion 6 or criterion 9 has started, THE Backup_Service SHALL record the export timestamp written in that Backup_File as the last backup time.
8. IF the Owner dismisses the share sheet without sharing or saving the Backup_File, THEN THE Backup_Service SHALL leave the last backup time unchanged and SHALL show no error message.
9. IF the share sheet fails for a reason other than the Owner dismissing it, THEN THE Backup_Service SHALL start a download of the Backup_File under the file name defined in criterion 4.
10. IF reading the core data, reading a stored image, or any Module's `exportData()` fails during an export, THEN THE Backup_Service SHALL stop the export without sharing or downloading any file, SHALL show an error Toast naming the failed part (core data, images, or the Module `id`), and SHALL leave the last backup time and the Local_Database contents unchanged.

### Requirement 7: Backup import

**User Story:** As the Owner, I want to restore a backup file, so that I can recover my data on a new phone or after data loss.

#### Acceptance Criteria

1. WHEN the Owner selects a file for import, THE Backup_Service SHALL validate the file before changing any stored data. Validation runs in this order: JSON parsing (criterion 2), format identifier and Schema_Version presence (criterion 3), Schema_Version and Module data version support (criterion 4), migration (criterion 6), then record validation (criterion 5). Validation stops at the first check that fails. A rejected file leaves the Local_Database unchanged and produces no confirmation.
2. IF the selected file is empty (0 bytes) or is not valid JSON, THEN THE Backup_Service SHALL reject the file with the message "This file is not a PersonalLab backup (not valid JSON)."
3. IF the parsed file lacks the format identifier `"personallab-backup"`, or lacks a Schema_Version that is an integer greater than or equal to 1, THEN THE Backup_Service SHALL reject the file with the message "This file is not a PersonalLab backup."
4. IF the Backup_File Schema_Version is greater than the Schema_Version the App supports, or a registered Module's entry has a Module data version greater than the version that Module supports, THEN THE Backup_Service SHALL reject the file with a message that states the file version and the supported version (and, for a Module entry, the Module `id`) and asks the Owner to update the App.
5. IF any record in the Backup_File fails schema validation, THEN THE Backup_Service SHALL reject the file with a message naming the section (core data or the Module `id`), the 1-based position of the record within that section, and the invalid field of the first invalid record. "First" means file order: core data first, then Module entries in the order they appear in the file, then records in array order.
6. WHEN a Backup_File that passed criteria 2 to 4 has a Schema_Version lower than the supported Schema_Version, THE Backup_Service SHALL migrate the parsed content in memory, one version step at a time, up to the supported Schema_Version before record validation, without modifying the selected file.
7. IF the Backup_File contains data for a Module `id` that is not in the Module_Registry, THEN THE Backup_Service SHALL skip that Module's data without validating it, list the skipped Module `id` in the confirmation of criterion 8, and list it again in the import result Toast shown after the import transaction commits.
8. WHEN a Backup_File passes validation, THE Backup_Service SHALL show a confirmation with a confirm action and a cancel action. The confirmation shows the export timestamp converted to local date and time, the record count of each registered Module present in the file, and the names of registered Modules absent from the file, marked as unchanged. It also warns that the current core data and the data of the listed Modules will be replaced.
9. WHEN the Owner confirms an import, THE Backup_Service SHALL, inside a single Local_Database transaction, replace the core data with the file's core data while keeping the currently stored Gemini_Key, and replace all records of each registered Module present in the file with that Module's records from the file, so that no pre-import record of those Modules remains. Data of registered Modules absent from the file stays unchanged.
10. IF the import transaction fails, THEN THE Backup_Service SHALL leave the stored data exactly as it was before the import, show an error message stating the failure reason, and show no Undo_Toast.
11. WHEN the import transaction of criterion 9 commits, THE Backup_Service SHALL show an Undo_Toast for 6 seconds (Requirement 64). Tapping "Undo" restores the snapshot of the pre-import data, taken before the transaction started, so that the Local_Database equals its pre-import state. The snapshot is discarded when the Undo_Toast closes.
12. WHEN the Owner cancels the confirmation of criterion 8 or dismisses the file picker without selecting a file, THE Backup_Service SHALL leave the Local_Database unchanged and show no Undo_Toast.
13. IF migrating a Backup_File to the supported Schema_Version fails, THEN THE Backup_Service SHALL reject the file with a message stating the file's Schema_Version and that the file could not be upgraded, and leave the Local_Database unchanged.
14. IF the selected file cannot be read from the device, THEN THE Backup_Service SHALL reject the import with an error message stating that the file could not be read, and leave the Local_Database unchanged.

### Requirement 8: Backup round trip and idempotent import

**User Story:** As the Owner, I want export and import to be lossless, so that a restored backup is exactly what I saved.

#### Acceptance Criteria

1. FOR ALL valid App data states S, where a valid App data state is one in which every core and Module record passes the Backup_File schema validation of Requirement 7 criterion 5, WHEN S is exported to Backup_File F1, the Local_Database is cleared, F1 is imported, and the resulting state is exported to Backup_File F2, THE Backup_Service SHALL produce an F2 whose parsed JSON equals the parsed JSON of F1 in every field except the export timestamp, with arrays compared element by element in order, numbers compared by exact value, and record primary keys, Idempotency_Keys, base64 image data and image MIME types included in the comparison (round-trip property).
2. FOR ALL valid Backup_Files B, where a valid Backup_File is one that passes every check in Requirement 7 criteria 2 to 5, and FOR ALL starting Local_Database states, WHEN B is imported once from the starting state and, separately, B is imported twice in succession from the same starting state, THE Backup_Service SHALL produce identical core data and identical records in every registered Module table in both outcomes, with the same record count per table and the pre-import snapshot of Requirement 7 criterion 11 excluded from the comparison (idempotence property).
3. FOR ALL valid Backup_Files B whose Schema_Version equals the Schema_Version the App supports, WHEN the Backup_Service parses B into its in-memory backup value P and serialises P to JSON, THE Backup_Service SHALL produce JSON that parses to a value equal to P, with arrays compared in order and numbers compared by exact value (parse/print round-trip property).
4. FOR ALL registered Modules M and all valid data D of M, WHEN M's tables hold D, `M.exportData()` returns value E, M's tables are cleared, and `M.importData(E)` is called, THE Module M SHALL hold records equal to D, including primary keys and with optional fields that are absent in D still absent rather than set to null, and a further call to `M.exportData()` SHALL return a value equal to E (per-module round-trip property).
5. THE Backup_Service SHALL satisfy criteria 1, 2 and 4, each checked by a fast-check property test with at least 100 generated cases, for generated states that include: every Module table empty; text fields containing non-ASCII characters, including Hebrew letters and emoji; numbers with fractional parts at full stored precision; and records with stored images.
6. WHEN the Owner confirms an import, THE Backup_Service SHALL leave the stored Gemini_Key unchanged, because Backup_Files do not contain the Gemini_Key.
7. IF a newly created Backup_File fails any check in Requirement 7 criteria 2 to 5, THEN THE Backup_Service SHALL not share or download the file, SHALL keep the last backup time unchanged, and SHALL show an error message naming the first invalid record's section and field.

### Requirement 9: Backup reminders

**User Story:** As the Owner, I want to be reminded to back up, so that I do not lose weeks of data.

#### Acceptance Criteria

1. THE Settings_Screen SHALL let the Owner set the backup reminder interval to exactly one of 3, 7, 14 or 30 days, or off, and SHALL use 7 days while the Owner has never changed the setting.
2. WHILE the backup reminder interval is 3, 7, 14 or 30 days and no "Remind me later" snooze is active, WHEN the Home_Dashboard is shown, a last backup time is recorded, more than (interval × 24) hours have passed since the last backup time, and at least one record of core data or of any registered Module's data has been created, updated or deleted in the Local_Database after the last backup time, THE Home_Dashboard SHALL show a reminder banner with an "Export now" action and a "Remind me later" action. Changes to the Gemini_Key and to the reminder's own state (last backup time, snooze end time) do not count as data changes.
3. WHILE the backup reminder interval is 3, 7, 14 or 30 days and no "Remind me later" snooze is active, WHEN the Home_Dashboard is shown, no last backup time is recorded, and the earliest record stored in the Local_Database (core data or any registered Module's data) was created more than 72 hours before the current time, THE Home_Dashboard SHALL show the same reminder banner.
4. WHEN the Owner taps "Remind me later" on the banner, THE Home_Dashboard SHALL hide the banner and SHALL NOT show it again until 24 hours after the tap, including after the App is closed and restarted. After those 24 hours, the next time the Home_Dashboard is shown it SHALL check criteria 2 and 3 again.
5. WHEN the Owner taps "Export now" on the banner, THE Backup_Service SHALL run the same export as "Export backup" in Requirement 6.
6. WHEN an export started from the banner completes and the last backup time is recorded (Requirement 6, criterion 7), THE Home_Dashboard SHALL hide the banner.
7. IF an export started from the banner fails, or the Owner dismisses the share sheet without saving or sharing the Backup_File, THEN THE Backup_Service SHALL leave the last backup time unchanged and THE Home_Dashboard SHALL keep showing the banner. If the export failed, THE App SHALL also show an error Toast stating that the backup was not created.

### Requirement 10: App update prompt

**User Story:** As the Owner, I want to know when a new version is available, so that I get fixes without losing work.

#### Acceptance Criteria

1. WHEN the Service_Worker finishes installing a new deployed App version and that version is waiting to activate, THE Update_Service SHALL show a Toast "A new version is available" with a "Reload" action that stays visible until the Owner taps "Reload" or dismisses it.
2. WHEN the Owner dismisses the Toast of criterion 1 without tapping "Reload", THE Update_Service SHALL keep the current version running and SHALL show the Toast again the next time the App starts or returns to the foreground while the new version is still waiting.
3. THE Update_Service SHALL NOT reload a running App unless the Owner taps "Reload", and SHALL activate a waiting version only when the Owner taps "Reload" or when the App starts after every App window has been closed.
4. WHEN the Owner taps "Reload" while a Session is Active, THE Update_Service SHALL wait until every change to the Active Session has been written to the Local_Database before activating the new version and reloading, so that after the reload the Session is still Active and Requirement 21 criterion 2 restores every Exercise, Set value, completed flag and Rest_Timer state as it was at the tap.
5. IF writing the Active Session to the Local_Database fails or does not finish within 5 seconds of the Owner tapping "Reload", THEN THE Update_Service SHALL cancel the reload, keep the Active Session in memory unchanged, show an error Toast saying the workout could not be saved and the update was postponed, and show the Toast of criterion 1 again.
6. WHEN the App starts or returns to the foreground, and either no update check has completed yet or at least 1 hour has passed since the last completed update check, THE Update_Service SHALL check for a new version.
7. IF the device is offline, the update check fails, or no response arrives within 10 seconds, THEN THE Update_Service SHALL keep running the current version, show no Toast or error message, and leave the time of the last completed update check unchanged so that the next App start or return to the foreground checks again.

### Requirement 11: Idempotency keys

**User Story:** As the Owner, I want double taps and retries to never create duplicates, so that my logs stay accurate.

#### Acceptance Criteria

1. WHEN the UI creates a draft of a Set, Food_Entry, Weight_Entry, Saved_Meal, Routine, Custom_Exercise or puzzle attempt, THE App SHALL assign that draft an Idempotency_Key that differs from every Idempotency_Key already stored in the Local_Database, and SHALL attach that same Idempotency_Key to every create operation submitted for that draft, including repeated taps and retries.
2. WHEN a create operation is received with an Idempotency_Key that already exists in the target table, or that matches a create operation for the same table that has not finished writing, THE App SHALL return the existing (or in-progress) record unchanged, create no new record, and leave exactly one record with that Idempotency_Key in the table, even if the field values of the repeated operation differ from the stored record.
3. FOR ALL sequences of create operations, applying each operation between 1 and 5 times, with the repeats placed either directly after each other or interleaved with other operations, SHALL produce the same Local_Database contents as applying each operation exactly once, and every repeat SHALL return the same record as the first application (idempotence property).
4. WHEN the Game_Sync stores a Game_Record, THE Game_Sync SHALL use the Chess.com game `uuid` as the Idempotency_Key of that Game_Record, or the game URL when `uuid` is absent or an empty string, so that downloading the same game again in a later Game_Sync creates no second Game_Record.
5. IF a create operation for any record type listed in criterion 1 is received without an Idempotency_Key or with an empty Idempotency_Key, THEN THE App SHALL reject the operation, return an error to the caller indicating the missing key, and write no record to the Local_Database.
6. IF a create operation fails to write to the Local_Database, THEN THE App SHALL keep the draft with its entered field values and its original Idempotency_Key, show a Toast indicating that the save failed, and reuse that same Idempotency_Key when the Owner retries the save.
7. IF a game returned by the Chess.com public API has neither a non-empty `uuid` nor a non-empty URL, THEN THE Game_Sync SHALL skip that game, store no Game_Record for it, and continue syncing the remaining games.

### Requirement 12: Hosting and deployment

**User Story:** As the Owner, I want the app hosted and deployed for free, so that I can use it without paying or running a server.

#### Acceptance Criteria

1. WHEN a commit is pushed to the `main` branch of the GitHub repository, THE Deployment_Pipeline SHALL start one run for that commit, and pushes to any other branch SHALL NOT start a deployment.
2. WHEN a Deployment_Pipeline run starts, THE Deployment_Pipeline SHALL run these steps in this order: the TypeScript type check, the full Vitest test suite in single-run (non-watch) mode including every property-based test, and the production build. Each step SHALL start only after the previous step has succeeded.
3. IF the type check reports any error, any test fails, the test step finds zero test files, the build fails, or the deploy step fails, THEN THE Deployment_Pipeline SHALL mark the run as failed in GitHub Actions, deploy nothing, and leave the previously deployed App version live and unchanged on GitHub Pages.
4. WHEN the type check, all tests and the build of a run succeed, THE Deployment_Pipeline SHALL deploy to GitHub Pages the build output produced from that run's commit, and the deployed site SHALL contain only that build output.
5. THE App build SHALL prefix every asset URL, every route, the web manifest start URL and the Service_Worker scope with the GitHub Pages repository base path (`/<repository-name>/`), so that no built file references a root-relative URL outside that base path.
6. WHEN the Owner opens or reloads any App route URL under the base path directly while online, THE App SHALL display that same route with the same route parameters, and no GitHub Pages 404 page SHALL appear.
7. THE App and the Deployment_Pipeline SHALL require no paid plan, payment method or billing account, and the App SHALL send network requests only to its own GitHub Pages origin, the Chess.com public API, Open Food Facts, the Gemini API (free tier) and the CORS_Proxy on the Cloudflare Workers free tier.
8. IF a new Deployment_Pipeline run starts while an earlier run for an older `main` commit is still in progress, THEN THE Deployment_Pipeline SHALL ensure the older commit's build output never replaces a deployment of the newer commit, so that GitHub Pages ends up serving the newest `main` commit whose checks passed.
9. THE GitHub repository and the deployed build output SHALL contain no Gemini_Key, API key, token or other secret, because the repository is public. The Gemini_Key SHALL exist only in the Local_Database on the phone.
10. WHILE the device has no network connection, WHEN the Owner opens or reloads any App route URL under the base path after the App_Shell has been precached, THE App SHALL display that same route from the App_Shell served by the Service_Worker.

---

## Part B: Gym module

### Requirement 13: Exercise data build

**User Story:** As the Owner, I want a ready-made exercise library with photos, so that I can pick exercises without typing them in.

#### Acceptance Criteria

1. THE Exercise_Build_Script SHALL convert the free-exercise-db data set into one exercise data file that lists the Library_Exercises in ascending order of id, in which each Library_Exercise has: the free-exercise-db id unchanged as its id, the name with leading and trailing whitespace removed, primary muscles (1 or more), secondary muscles (0 or more), one equipment value, category, level, instructions as an ordered list of steps in source order, image file paths (0 or more), and one BlurHash per image file path. A source record whose equipment is missing or null SHALL get the equipment value "other".
2. THE Exercise_Build_Script SHALL resize every exercise image so that its longest side is at most 600 px, keep the width-to-height ratio of the source image (within 1 px of rounding), and leave images whose longest side is already 600 px or less at their original size without enlarging them.
3. THE Exercise_Build_Script SHALL accept as primary and secondary muscle values only the names of the fixed free-exercise-db muscle list (abdominals, abductors, adductors, biceps, calves, chest, forearms, glutes, hamstrings, lats, lower back, middle back, neck, quadriceps, shoulders, traps, triceps), compared after removing leading and trailing whitespace and ignoring case, and SHALL store each muscle exactly as spelled in that list.
4. IF a source record has a missing id, an id that is empty after removing whitespace, a missing name, a name that is empty after removing whitespace, or a missing or empty primary muscle list, THEN THE Exercise_Build_Script SHALL exclude that record from the output, print its id (or its position in the source when the id is missing) together with the reason, continue with the remaining records, and print the number of included and excluded records when it finishes.
5. FOR ALL runs of the Exercise_Build_Script on the same free-exercise-db source files with the same script version, THE Exercise_Build_Script SHALL produce byte-identical output, covering the exercise data file, every resized image file and every BlurHash (determinism property).
6. WHEN an exercise image is requested while online and the response succeeds, THE Service_Worker SHALL store the image in a runtime cache that has no expiry time and no maximum entry count, and SHALL serve the cached copy for every later request of that image, online or offline, without a network request. The Service_Worker SHALL NOT cache failed responses. WHILE an exercise image is neither cached nor loadable (for example offline), THE App SHALL show the image's BlurHash in its place and no error message.
7. WHEN the Owner taps "Download all exercise photos" in the Settings_Screen, THE App SHALL request every Library_Exercise image that is not yet in the runtime cache of criterion 6 and store each successful download in that cache. While the download runs, THE App SHALL show progress as "N of M", where M is the total number of Library_Exercise images and N is the number of them cached so far (including images cached before the tap), and SHALL disable the button. When all M images are cached, THE App SHALL show a Toast saying all exercise photos are available offline.
8. IF two source records have the same id, or a source record has a muscle value not in the list of criterion 3, an equipment value other than missing, null or one of (body only, machine, other, foam roll, kettlebells, dumbbell, cable, barbell, bands, medicine ball, exercise ball, e-z curl bar), a category other than one of (strength, stretching, plyometrics, strongman, powerlifting, cardio, olympic weightlifting), or a level other than one of (beginner, intermediate, expert), THEN THE Exercise_Build_Script SHALL print the record id, the field and the offending value, exit with a non-zero status, and leave all previously generated output files unchanged.
9. IF an image file listed by a source record is missing or cannot be decoded as an image, THEN THE Exercise_Build_Script SHALL leave that image and its BlurHash out of the Library_Exercise, print the record id and the image path, and keep the Library_Exercise with its remaining images, including when no image remains.
10. IF one or more image downloads started by criterion 7 fail, including because the device is offline or no response arrives within 30 seconds, or an image cannot be stored because device storage is full, THEN THE App SHALL keep every image already cached, stop requesting further images once storage is full, show a Toast stating how many of the M images are cached and that the rest could not be downloaded, and re-enable the button so that tapping it again requests only the images that are still not cached.

### Requirement 14: Exercise library browsing

**User Story:** As the Owner, I want to search and filter exercises by muscle and equipment, so that I can find the right exercise quickly.

#### Acceptance Criteria

1. THE Exercise_Library SHALL list every non-archived Exercise (Library_Exercises and Custom_Exercises) sorted by name in ascending alphabetical order, ignoring case and diacritics, with Custom_Exercises placed before Library_Exercises when two names are equal after that comparison. Each row SHALL show the Exercise's first photo, name, primary muscles and equipment, and an Exercise with zero photos SHALL show a placeholder image in place of the photo.
2. WHEN the Owner types in the search field, THE Exercise_Library SHALL trim leading and trailing whitespace from the search text and show only the Exercises whose names contain the trimmed text as a substring, ignoring case and diacritics. The list SHALL update within 150 ms of the keystroke for a library of up to 1,000 Exercises. The search field SHALL accept at most 100 characters, and a search text that is empty after trimming SHALL apply no search filter.
3. WHEN the Owner selects one or more muscles from the muscle filter, THE Exercise_Library SHALL show only the Exercises whose primary muscles include at least one selected muscle. The muscle filter SHALL offer every muscle that appears as a primary or secondary muscle of at least one non-archived Exercise, in alphabetical order, and selecting no muscle SHALL apply no muscle filter.
4. WHILE the "include secondary muscles" toggle is on, THE Exercise_Library SHALL show only the Exercises whose primary or secondary muscles include at least one selected muscle. The toggle SHALL be off when the Exercise_Library first opens in a new app launch.
5. WHEN the Owner selects one or more equipment types from the equipment filter, THE Exercise_Library SHALL show only the Exercises whose equipment is one of the selected types. The equipment filter SHALL offer every equipment type of at least one non-archived Exercise, in alphabetical order. Selecting no equipment type SHALL apply no equipment filter.
6. FOR ALL combinations of search text, muscle selection, equipment selection and "include secondary muscles" toggle state, THE Exercise_Library result SHALL equal the intersection of the results of each filter applied alone, in the sort order defined in criterion 1 (intersection property).
7. WHEN the Owner opens an Exercise, THE Exercise_Library SHALL show all of its photos in stored order, its primary and secondary muscles, equipment, instructions, and a link to the Owner's history for that Exercise. An Exercise with zero photos SHALL show one placeholder image, and an Exercise with no secondary muscles SHALL show "None" in the secondary muscles field.
8. IF the current search text and filter selections match no Exercise, THEN THE Exercise_Library SHALL show "No exercises match" with a "Clear filters" action. Selecting "Clear filters" SHALL empty the search field, deselect all muscles and equipment types, leave the "include secondary muscles" toggle unchanged, and show the full list defined in criterion 1.
9. IF an Exercise photo fails to load, including while the phone is offline and the photo is not cached, THEN THE Exercise_Library SHALL show the placeholder image in its place and keep the rest of the row or detail screen visible and usable.
10. WHEN the Owner returns from an opened Exercise to the Exercise_Library, THE Exercise_Library SHALL restore the search text, muscle selections, equipment selections, "include secondary muscles" toggle state and list scroll position that were in place before the Exercise was opened.

### Requirement 15: Custom exercises

**User Story:** As the Owner, I want to add my own exercises with a photo, so that machines and variations from my gym are in the library.

#### Acceptance Criteria

1. THE Gym_Module SHALL let the Owner create a Custom_Exercise with a name of 1 to 80 characters after leading and trailing whitespace are removed, at least one primary muscle, zero or more secondary muscles, exactly one equipment type, and zero or one photo, where muscles and equipment types are chosen from the same lists the Library_Exercises use and no muscle is selected as both primary and secondary.
2. WHEN the Owner chooses to add a photo, THE Gym_Module SHALL offer two sources: the camera and the photo library.
3. WHEN the Owner adds a photo, THE Gym_Module SHALL store in the Local_Database a copy with the original orientation applied to the pixels, its aspect ratio preserved, its longest side scaled down to at most 1024 px (images already at or below 1024 px keep their dimensions and are not upscaled), re-encoded as JPEG with no metadata from the original, together with a BlurHash computed from the stored copy.
4. IF the trimmed name of a Custom_Exercise being created or renamed equals the trimmed name of any other non-archived Exercise, ignoring letter case, THEN THE Gym_Module SHALL show a warning naming the existing Exercise, SHALL save only after the Owner confirms, and, if the Owner cancels, SHALL save nothing and keep the form open with all entered values.
5. THE Gym_Module SHALL let the Owner edit every field of a Custom_Exercise, including replacing or removing its photo, under the same rules that apply at creation (criteria 1, 3, 4, 7, 8 and 9).
6. WHEN a Custom_Exercise is created or edited and saved, THE Gym_Module SHALL store exactly one Custom_Exercise per Idempotency_Key, so that repeated taps on save or a retried save create no additional Custom_Exercise, and the Exercise_Library, the routine picker and the Command_Menu SHALL list the Custom_Exercise with its saved values the next time each is shown, without an App restart.
7. IF the Owner attempts to save while the trimmed name is empty or longer than 80 characters, no primary muscle is selected, or no equipment type is selected, THEN THE Gym_Module SHALL not save, SHALL mark each failing field with a message stating the rule it breaks, and SHALL keep all entered values.
8. IF camera access is denied or unavailable, or the chosen photo cannot be decoded, resized or stored, THEN THE Gym_Module SHALL show an error message indicating which of these failures occurred, SHALL keep the photo library option available, SHALL keep all other entered values, and SHALL leave the previously attached photo (or no photo) unchanged.
9. IF the Local_Database write fails while saving a Custom_Exercise, THEN THE Gym_Module SHALL show an error message indicating that the save failed, SHALL leave no new or partially changed Custom_Exercise in the Local_Database, and SHALL keep the form open with all entered values so that a retry reuses the same Idempotency_Key.

### Requirement 16: Safe exercise deletion

**User Story:** As the Owner, I want deleting an exercise to keep my history and routines consistent, so that nothing breaks or disappears by accident.

#### Acceptance Criteria

1. THE Gym_Module SHALL offer a "Delete" action on each Custom_Exercise and a "Hide" action on each Library_Exercise. Both actions archive the Exercise: they mark it as archived and keep the Exercise record, including its photos, in the Local_Database. An Exercise that no Routine uses is archived without a confirmation step.
2. WHEN the Owner requests to archive an Exercise that one or more Routines use, THE Gym_Module SHALL show a confirmation with a confirm action and a cancel action that lists the name of each such Routine with the number of its Routine_Items that will be removed. The Gym_Module archives the Exercise only after the Owner confirms. If the Owner cancels, the Local_Database stays unchanged and no Undo_Toast is shown.
3. WHEN an Exercise is archived, THE Gym_Module SHALL, in a single Local_Database transaction, mark the Exercise as archived and remove every Routine_Item that references it. After that, the Gym_Module removes the Exercise from the Exercise_Library list and its search and muscle-filter results, from the Exercise pickers of the routine builder and the Session_Logger, and from the Command_Menu, and shows an Undo_Toast for 6 seconds (Requirement 64). A Routine that loses all its Routine_Items is kept with zero Routine_Items.
4. WHEN an Exercise is archived, THE Gym_Module SHALL keep every Session, Set, PR and chart point that references the Exercise with unchanged values, and SHALL keep including those Sets in PR_Detector results, charts and Split_Analyzer weekly set counts.
5. WHILE an Exercise is archived, THE Gym_Module SHALL display the Exercise name followed by " (archived)" on every screen that shows a Session, Set, PR or chart referencing that Exercise.
6. WHEN the Owner taps "Undo" on the Undo_Toast of criterion 3 before it closes, THE Gym_Module SHALL mark the Exercise as not archived and re-insert every Routine_Item removed by that archive into its original Routine, at its original index and with its original target sets and rep range, so that the Local_Database equals its state before the archive (Requirement 64 criterion 3).
7. THE Gym_Module SHALL keep these invariants after every committed Local_Database write, including archive, Undo, restore and Backup_File import: no Routine_Item references an archived Exercise, and every Set references an existing Exercise record.
8. THE Settings_Screen SHALL list every archived Exercise sorted alphabetically by name, each with a "Restore" action, and SHALL show an empty-state message when no Exercise is archived.
9. WHEN the Owner taps "Restore" on an archived Exercise in the Settings_Screen, THE Gym_Module SHALL mark the Exercise as not archived, show it again in the Exercise_Library, the Exercise pickers and the Command_Menu, and stop appending " (archived)" to its name. A restore SHALL NOT re-add the Routine_Items that the archive removed.
10. IF the Local_Database write for an archive, an Undo of an archive, or a restore fails, THEN THE Gym_Module SHALL leave the Local_Database exactly as it was before that write, show an error Toast stating which action failed, and show no Undo_Toast.
11. WHILE a Session is Active, WHEN an Exercise that the Active Session contains is archived, THE Session_Logger SHALL keep that Exercise and all its Sets in the Active Session, display its name followed by " (archived)", and keep letting the Owner add and edit Sets for it until the Session is Finished.

### Requirement 17: Routine builder

**User Story:** As the Owner, I want to build and edit workout routines, so that I can start planned sessions in one tap.

#### Acceptance Criteria

1. WHEN the Owner saves a new Routine whose name has 1 to 60 characters after leading and trailing whitespace is removed, THE Gym_Module SHALL store the Routine with the trimmed name and 0 to 50 Routine_Items. Two Routines may have the same name.
2. WHEN the Owner adds exercises to a Routine, THE Gym_Module SHALL show a photo picker grid that lists only non-archived Exercises, supports the search and filters of Requirement 14, lets the Owner select at most (50 − the Routine's current number of Routine_Items) Exercises at once, and disables selection of further Exercises when that number is reached.
3. THE Gym_Module SHALL let the Owner set for each Routine_Item a target sets value that is an integer from 1 to 10, a rep range minimum and maximum that are each integers from 1 to 100, and an optional rest time from 15 to 600 seconds in 15-second steps. A newly added Routine_Item has 3 target sets, a rep range of 8–12 and no rest time.
4. IF the Owner enters a rep range minimum greater than the maximum, THEN THE Gym_Module SHALL show "Minimum reps must not exceed maximum reps", keep the previously stored minimum and maximum, and store no change to the Routine_Item.
5. THE Gym_Module SHALL let the Owner reorder Routine_Items by dragging a handle, which places the item at the drop position, and by "Move up" and "Move down" actions, which move the item by exactly one position. "Move up" is disabled for the first Routine_Item and "Move down" is disabled for the last.
6. FOR ALL Routines and all sequences of reorder operations, THE Gym_Module SHALL keep the same multiset of Routine_Items with their settings unchanged (reorder invariant).
7. WHEN the Owner renames a Routine, changes a Routine_Item's settings, adds Routine_Items, removes Routine_Items or reorders Routine_Items, THE Gym_Module SHALL store the change in the Local_Database and show the changed Routine in the Routine list and the Command_Menu. Sessions already started from the Routine keep their Exercises, Sets and recorded Routine name unchanged.
8. WHEN the Owner deletes a Routine, THE Gym_Module SHALL remove the Routine from the Routine list and the Command_Menu, show an Undo_Toast for 6 seconds (Requirement 64), and keep every Active or Finished Session started from the Routine with the Routine name recorded when that Session started.
9. IF the Owner saves a new Routine or a rename whose name is empty or longer than 60 characters after leading and trailing whitespace is removed, THEN THE Gym_Module SHALL show an error message stating that the name must have 1 to 60 characters, store nothing, and keep the entered text in the name field.
10. IF the Owner enters a target sets value, rep range minimum, rep range maximum or rest time that is not an integer, is outside its range in criterion 3, or (for rest time) is not a multiple of 15 seconds, THEN THE Gym_Module SHALL show an error message stating the allowed range for that field, keep the previously stored value, and store no change to the Routine_Item.
11. WHEN the Owner confirms the picker selection, THE Gym_Module SHALL append one Routine_Item per selected Exercise to the end of the Routine in the order the Exercises were selected, with the defaults of criterion 3, and SHALL also accept an Exercise that is already in the Routine as an additional Routine_Item. Closing the picker without confirming leaves the Routine unchanged.

### Requirement 18: Starting and editing an Active Session

**User Story:** As the Owner, I want to start a workout from a routine or from scratch and change it while training, so that logging matches what I actually do.

#### Acceptance Criteria

1. WHEN the Owner starts a Session from a Routine that has at least one Routine_Item, THE Session_Logger SHALL create an Active Session with one Exercise entry per Routine_Item, in Routine order. Each entry SHALL carry the Routine_Item's rep range and rest time and have as many draft Sets as the Routine_Item's target sets (1 to 10), pre-filled according to Requirement 19 criteria 2 to 4. Editing or deleting the Routine afterwards SHALL NOT change the Active Session.
2. WHEN the Owner starts an empty Session, or starts a Session from a Routine that has no Routine_Items, THE Session_Logger SHALL create an Active Session with no Exercises and show the action for adding Exercises.
3. WHEN the Owner selects one or more Exercises in the exercise picker during an Active Session, THE Session_Logger SHALL append each selected Exercise that is not yet in the Active Session to the end of the Session, in selection order, with one draft Set pre-filled according to Requirement 19 criteria 2 to 4. For a selected Exercise that is already in the Active Session, THE Session_Logger SHALL append one draft Set to the existing entry and SHALL NOT add a second entry. The picker lists only non-archived Exercises and supports the search and filters of Requirement 14.
4. WHEN the Owner taps "Add set" on an Exercise in the Active Session, THE Session_Logger SHALL append one draft Set to the end of that Exercise's Sets, pre-filled according to Requirement 19 criteria 2 to 4, and leave all other Sets unchanged. "Add set" SHALL be disabled while the Exercise has 20 Sets.
5. WHEN a Session is created, THE Session_Logger SHALL record the start timestamp as the device date and time at which the Session is created. For a Session started from a Routine, it SHALL also record a reference to the Routine and the Routine's name at that moment.
6. IF the Owner starts a Session, from a Routine or empty, while another Session is Active, THEN THE Session_Logger SHALL create no new Session and offer "Resume current session", "Discard current session" and "Cancel". "Resume current session" opens the Session_Logger with the existing Active Session unchanged. "Discard current session" shows a confirmation that states how many Completed_Sets will be deleted. When the Owner confirms, the Session_Logger deletes the Active Session and all its Sets, creates the Session the Owner asked for, and shows an Undo_Toast for 6 seconds. Tapping "Undo" deletes the new Session and restores the discarded Session as Active with all its values. Cancelling either dialog leaves the Active Session unchanged and creates no Session.
7. THE Gym_Module SHALL keep at most one Session in the Active state in the Local_Database at all times. This SHALL hold even when the start action is tapped several times before the first Session is created, and when a start is triggered from two App windows. Any start request that would create a second Active Session SHALL be handled as described in criterion 6.
8. WHEN the Owner removes a Set (draft or completed) or removes an Exercise from the Active Session, THE Session_Logger SHALL remove the Set, or the Exercise with all its Sets, keep the remaining Exercises and Sets in their order, and show an Undo_Toast for 6 seconds (Requirement 64). Tapping "Undo" SHALL restore every removed Set at its original position with its weight, reps, completed flag and completion timestamp. Removing the last Set of an Exercise SHALL leave the Exercise in the Session with no Sets.
9. WHEN the Owner reorders Exercises in the Active Session by dragging a handle or with "Move up" and "Move down", THE Session_Logger SHALL change only the position of the moved Exercise and keep every Exercise's Sets, Set order, Set values and completed flags unchanged. "Move up" SHALL be disabled on the first Exercise and "Move down" on the last.
10. IF writing a new Session to the Local_Database fails when the Owner starts a Session, THEN THE Session_Logger SHALL leave no new Session in the Local_Database, return to the screen where the Owner tapped start, and show an error Toast saying that the workout could not be started and giving the reason.

### Requirement 19: Set entry and pre-fill

**User Story:** As the Owner, I want weight and reps pre-filled from my last session, so that logging takes as few taps as possible.

#### Acceptance Criteria

1. THE Session_Logger SHALL accept a weight from 0 to 1000 kg inclusive with at most two decimal places, accepting either "." or "," as the decimal separator, and reps as an integer from 0 to 100 inclusive.
2. WHEN a draft Set is created for an Exercise that has Completed_Sets in a Finished Session, THE Session_Logger SHALL pre-fill the n-th draft Set of that Exercise in the Active Session (counted in row order, first row = 1) with the weight and reps of the n-th Completed_Set of that Exercise (counted in logged order) in the Finished Session with the latest finish timestamp that contains at least one Completed_Set of that Exercise.
3. WHEN a draft Set is created for an Exercise and the Finished Session selected in criterion 2 contains fewer than n Completed_Sets of that Exercise, THE Session_Logger SHALL pre-fill the n-th draft Set with the weight and reps of the last Completed_Set of that Exercise in that Finished Session.
4. WHEN a draft Set is created for an Exercise with no Completed_Sets in any Finished Session, THE Session_Logger SHALL leave the weight empty and pre-fill reps with the minimum reps of the Routine_Item when the draft Set belongs to a Routine_Item, or leave reps empty when it does not.
5. WHILE a weight or reps field holds a pre-filled value that the Owner has not edited and the Set is not completed, THE Session_Logger SHALL display that field's value in a style that differs from Owner-entered values in text colour or opacity, applied per field so that editing one field changes only that field to the Owner-entered style.
6. THE Session_Logger SHALL show next to the n-th Set row of an Exercise the weight and reps of the n-th Completed_Set of that Exercise in the Finished Session selected in criterion 2, formatted as "<weight> kg × <reps>" with the weight shown to at most two decimal places and trailing zeros removed, or a dash when no such Completed_Set exists.
7. WHEN the Owner taps the complete button of a Set whose weight is a valid value from 0 to 1000 kg and whose reps is a valid integer from 1 to 100, whether those values were entered by the Owner or pre-filled, THE Session_Logger SHALL mark the Set as completed and record the current local date and time as the completion timestamp.
8. IF the Owner taps the complete button of a Set whose weight is empty or invalid, or whose reps is empty, invalid or below 1, THEN THE Session_Logger SHALL highlight each such field, keep the Set not completed, record no completion timestamp, and leave the values in both fields unchanged.
9. IF the Owner enters a non-numeric weight, a weight outside 0 to 1000 kg, a weight with more than two decimal places, a non-integer reps value, or a reps value outside 0 to 100, THEN THE Session_Logger SHALL highlight that field as invalid, not store the entered value as the Set's weight or reps, and keep the Set not completed until the field holds a valid value.
10. WHEN the Owner completes a Set that still shows pre-filled values, THE Session_Logger SHALL store those pre-filled values as the Set's weight and reps and display them in the Owner-entered style.

### Requirement 20: Rest timer

**User Story:** As the Owner, I want a rest timer between sets, so that I rest for a consistent time.

#### Acceptance Criteria

1. WHEN a Set is marked completed during an Active Session, THE Rest_Timer SHALL start a countdown whose end timestamp is the completion time plus the rest time of that Set's Routine_Item. THE Rest_Timer SHALL use the default rest time instead when the Routine_Item has no rest time, when the Session was started empty, or when the Exercise was added during the Session. The new countdown SHALL replace any countdown that is running or showing the zero alert, so that at most one countdown exists at a time.
2. THE Settings_Screen SHALL let the Owner set the default rest time from 30 to 600 seconds in 15-second steps. The default is 90 seconds.
3. WHEN a countdown starts or its end timestamp changes, THE Rest_Timer SHALL store the end timestamp in the Local_Database. It SHALL compute the remaining time as the end timestamp minus the current time, so that after the App is backgrounded, closed or reopened the displayed remaining time differs from that value by at most 1 second. THE Rest_Timer SHALL display the remaining time as M:SS rounded up to the next whole second, and SHALL update the display at least once per second while the Rest_Timer is visible.
4. WHILE a countdown is running, THE Rest_Timer SHALL provide "−15 s", "+15 s" and "Skip" actions. "−15 s" SHALL move the end timestamp 15 seconds earlier, and if 15 seconds or fewer remain it SHALL end the countdown immediately as in criterion 5. "+15 s" SHALL set the remaining time to the remaining time plus 15 seconds, capped at 600 seconds. "Skip" SHALL stop the countdown and hide it, with no visual alert and no sound.
5. WHEN the countdown reaches zero, THE Rest_Timer SHALL show 0:00 and a visual alert indicating that rest is over, on the Session_Logger and on the compact Rest_Timer. The alert SHALL stay until the Owner dismisses it, marks another Set completed, or the Session ends. If the end timestamp passed while the App was backgrounded or closed, THE Rest_Timer SHALL show the alert when the App returns to the foreground.
6. WHERE the rest timer sound is enabled, WHEN the countdown reaches zero while the App is in the foreground, THE Rest_Timer SHALL play one sound lasting at most 2 seconds. THE Rest_Timer SHALL play no sound for a countdown that reached zero while the App was backgrounded or closed.
7. WHILE a Session is Active and the Owner views any screen other than the Session_Logger, THE App SHALL show a link that opens the Session_Logger of the Active Session. While a countdown is running or showing the zero alert, the link SHALL also show a compact Rest_Timer with the remaining time as M:SS, or the zero alert of criterion 5.
8. IF the sound of criterion 6 fails to play, THEN THE Rest_Timer SHALL still show the visual alert of criterion 5 and SHALL show no error message.
9. WHEN the Active Session is finished or discarded, THE Rest_Timer SHALL stop any countdown, remove its stored end timestamp, and show no alert and play no sound for that countdown.

### Requirement 21: Autosave and resume

**User Story:** As the Owner, I want my workout saved continuously, so that closing the app or a crash never loses sets.

#### Acceptance Criteria

1. WHEN the Owner changes an Active Session, THE Session_Logger SHALL commit the change to the Local_Database within 500 ms of the change and store the time of the change as the Active Session's last-change timestamp. A change is any of these: adding, removing or reordering an Exercise; adding or removing a Set; editing a Set's weight or reps; changing a Set's completed flag; starting the Rest_Timer, adjusting it with "−15 s" or "+15 s", or skipping it.
2. WHEN the App starts (cold start or page reload) while a Session is Active and no more than 10,800 seconds (3 hours) have passed since the Active Session's last-change timestamp, THE App SHALL show a prompt with a "Resume" action. Choosing "Resume" opens the Session_Logger and restores the start timestamp, every Exercise in its order, and every Set in its order with its weight, reps, completed flag and completion timestamp. It also restores the Rest_Timer end timestamp, and the remaining time is computed as in Requirement 20 criterion 3. If that end timestamp has already passed, no countdown runs and no Rest_Timer alert or sound plays. Dismissing the prompt leaves the Session Active and unchanged.
3. THE Session_Logger SHALL satisfy the persistence round-trip property. FOR ALL sequences of the changes listed in criterion 1 made to an Active Session, reloading the Active Session from the Local_Database after the last committed write SHALL produce a state equal to the in-memory state. Equal means the same start timestamp, the same Exercises in the same order, the same Sets in the same order with the same weight, reps, completed flag and completion timestamp, and the same Rest_Timer end timestamp.
4. WHEN the App starts while a Session is Active and more than 10,800 seconds (3 hours) have passed since the Active Session's last-change timestamp, THE Session_Logger SHALL show a prompt with the actions "Finish at last set time", "Resume" and "Discard". "Resume" behaves as in criterion 2. "Discard" deletes the Session and all its Sets and shows an Undo_Toast for 6 seconds (Requirement 64). Dismissing the prompt without choosing an action leaves the Session Active and unchanged, and the App shows the prompt again at the next App start.
5. WHEN the Owner chooses "Finish at last set time", THE Session_Logger SHALL finish the Session as Requirement 22 specifies. The finish timestamp is the latest completion timestamp among all Completed_Sets of the Session, in any Exercise, and Requirement 22 criterion 3 applies to any draft Sets that are not completed.
6. IF the Active Session contains no Completed_Set when the prompt of criterion 4 is shown, THEN THE Session_Logger SHALL leave out the "Finish at last set time" action and show only "Resume" and "Discard".
7. IF committing a change from criterion 1 to the Local_Database fails, THEN THE Session_Logger SHALL handle the failure as Requirement 3 criterion 5 and Requirement 63 criterion 2 specify. The Session stays Active, the Session_Logger stays open and shows the last stored state of the Active Session, and the last-change timestamp keeps the value from the last successful commit.

### Requirement 22: Finishing a session

**User Story:** As the Owner, I want a summary when I finish, so that I see what I achieved.

#### Acceptance Criteria

1. WHEN the Owner taps "Finish" in an Active Session and confirms every prompt that criteria 3 and 4 require, THE Session_Logger SHALL, in a single Local_Database write that also includes every change not yet persisted under Requirement 21 criterion 1, set the finish timestamp to the time of that confirmation (or to the time of the tap when no prompt is required), mark the Session as Finished, and stop the Rest_Timer. Repeated taps on "Finish" produce exactly one finish timestamp. Requirement 21 criterion 5 overrides the finish timestamp when the Owner chooses "Finish at last set time".
2. THE Gym_Module SHALL compute Session duration as the finish timestamp minus the start timestamp, or as 0 when the finish timestamp is earlier than the start timestamp, and SHALL display the duration in hours and minutes, rounded to the nearest whole minute.
3. WHEN the Owner taps "Finish" in an Active Session that contains at least one Completed_Set and at least one Set that is not a Completed_Set, THE Session_Logger SHALL show a confirmation with a confirm action and a cancel action. The confirmation states how many Sets are not Completed_Sets and that they will be discarded. On confirm, in the same Local_Database write as criterion 1, the Session_Logger deletes exactly those Sets and removes from the Session every Exercise left with no Set.
4. IF the Owner taps "Finish" in an Active Session with no Completed_Sets, THEN THE Session_Logger SHALL show a prompt stating that the Session has no Completed_Sets, with a "Discard session" action and a "Keep logging" action and no save action. "Discard session" deletes the Session and all its Sets, shows an Undo_Toast (Requirement 64), and shows no summary.
5. WHEN a Session becomes Finished, THE Session_Logger SHALL show a summary containing: the duration (criterion 2); the number of Completed_Sets; the total volume, equal to the sum of Set_Volume over all Completed_Sets of the Session and displayed rounded to the nearest whole kg; for each Exercise with at least one Completed_Set in the Session, in Session order, the top set, shown as weight × reps and defined as the Completed_Set with the highest E1RM, with ties broken first by higher weight and then by earlier completion timestamp; and every Completed_Set of the Session that the PR_Detector marks as a PR, shown with its Exercise name, weight × reps and one label per PR type.
6. WHEN the Owner edits the weight or reps of a Set of a Finished Session, or deletes such a Set, THE Gym_Module SHALL accept only values within the ranges of Requirement 19 criterion 1, show an Undo_Toast for each deletion (Requirement 64), and recompute PR marks (Requirement 24 criterion 8), charts, Split_Analyzer results and the values of criteria 5 and 8 for every Session they depend on, so that every screen displayed after the change shows the recomputed values. If an edited value is outside those ranges, the Gym_Module keeps the stored value and highlights the field.
7. IF the Owner cancels the confirmation of criterion 3 or chooses "Keep logging" in the prompt of criterion 4, THEN THE Session_Logger SHALL keep the Session Active with every Exercise, Set, weight, reps value, completed flag and Rest_Timer state unchanged.
8. WHEN the summary of criterion 5 is shown, THE Session_Logger SHALL show for each Exercise with at least one Completed_Set in the Session the volume change. The volume change is the Exercise's volume in this Session minus its volume in the most recent Finished Session that has an earlier start timestamp and contains at least one Completed_Set of that Exercise. It is displayed as a signed value in kg rounded to the nearest whole kg, plus the percentage change rounded to the nearest whole percent when the earlier volume is greater than 0. When no such earlier Session exists, the summary shows a "first session" label for that Exercise instead of a change.
9. IF the Local_Database write of criterion 1 fails, THEN THE Session_Logger SHALL keep the Session Active with every Exercise, Set, value and completed flag unchanged, including the Sets that criterion 3 would discard, show an error Toast indicating that finishing the Session failed, and show no summary.

### Requirement 23: Strength metrics

**User Story:** As the Owner, I want estimated 1RM and volume calculated correctly, so that my progress charts are trustworthy.

#### Acceptance Criteria

1. THE Gym_Module SHALL compute the E1RM of a Completed_Set with weight w (kg) and reps r (an integer from 1 to 100) as w × (1 + r / 30) when r ≥ 2, and as exactly w when r = 1, and SHALL keep the E1RM unrounded.
2. THE Gym_Module SHALL display E1RM rounded to the nearest 0.1 kg with exactly one decimal place (for example 100 kg × 5 reps shows 116.7 kg), and SHALL use the unrounded E1RM for every comparison, best-E1RM selection and PR decision.
3. THE Gym_Module SHALL compute Set_Volume as w × r, the volume of an Exercise in a Session as the sum of Set_Volume over that Exercise's Completed_Sets in that Session, and the total volume of a Session as the sum of Set_Volume over all Completed_Sets in that Session.
4. THE Gym_Module SHALL compute the top weight of an Exercise in a Session as the maximum weight among that Exercise's Completed_Sets in that Session, and the best E1RM of an Exercise in a Session as the maximum unrounded E1RM among those same Completed_Sets.
5. THE Gym_Module SHALL include only Completed_Sets in E1RM, best E1RM, volume, top weight, PR and Split_Analyzer calculations, so that a Set whose completed flag is false or whose reps are 0 adds 0 to every volume and does not change any maximum.
6. FOR ALL weights w from 0 to 1000 kg with up to two decimal places and all integer reps r from 1 to 100, E1RM(w, r) SHALL be greater than or equal to w, E1RM(0, r) SHALL equal 0, and E1RM SHALL be non-decreasing in w and in r (monotonicity property).
7. FOR ALL lists of 0 to 200 Completed_Sets with weights from 0 to 1000 kg and reps from 1 to 100, the volume of the list SHALL be 0 when the list is empty, SHALL not depend on the order of the Completed_Sets, and SHALL equal the sum of the volumes of the parts of any partition of the list within an absolute tolerance of 0.001 kg (additivity property).
8. THE Gym_Module SHALL display Exercise volume and Session total volume rounded to the nearest whole kg, and SHALL display top weight at the precision the Owner entered it, with up to two decimal places and no trailing zeros (for example 100 kg, 102.5 kg, 1.25 kg).
9. IF an Exercise has no Completed_Sets in a Session, THEN THE Gym_Module SHALL report that Exercise's volume in that Session as 0, report no top weight and no best E1RM for it (no value, not 0), and plot no point for that Session on that Exercise's charts.
10. IF a stored Set has a weight that is not a finite number from 0 to 1000 kg, or reps that are not an integer from 0 to 100, THEN THE Gym_Module SHALL leave that Set out of every calculation in this requirement and in PR and Split_Analyzer calculations, so that no result is NaN, infinite or negative.

### Requirement 24: Personal record detection

**User Story:** As the Owner, I want records highlighted while I log, so that I notice and celebrate progress.

#### Acceptance Criteria

1. THE PR_Detector SHALL evaluate each Completed_Set s of an Exercise against the prior sets P, defined as every Completed_Set of the same Exercise, in Finished Sessions or in the Active Session, that comes before s in completion order. Completion order SHALL sort Completed_Sets by completion timestamp ascending, then sort Completed_Sets with equal completion timestamps by Session start timestamp ascending, then by Set position within the Session ascending.
2. WHEN the PR_Detector evaluates a Completed_Set s whose P is not empty and the weight of s is strictly greater than the maximum weight in P, THE PR_Detector SHALL mark s as a weight PR.
3. WHEN the PR_Detector evaluates a Completed_Set s whose P is not empty and the E1RM of s, computed as in Requirement 23 criterion 1, exceeds the maximum E1RM in P by more than 0.001 kg, THE PR_Detector SHALL mark s as an E1RM PR.
4. WHEN the PR_Detector evaluates a Completed_Set s whose P contains at least one Completed_Set with weight greater than or equal to the weight of s, and the reps of s are strictly greater than the maximum reps among those Completed_Sets, THE PR_Detector SHALL mark s as a rep PR.
5. WHEN P is empty, THE PR_Detector SHALL mark no PR for s.
6. THE PR_Detector SHALL treat as not a PR a weight equal to the maximum weight in P, a reps value equal to the maximum reps used in criterion 4, and an E1RM that differs from the maximum E1RM in P by 0.001 kg or less. The 0.001 kg tolerance SHALL be stored in the Gym_Module constants file.
7. WHEN the Owner marks a Set completed and the PR_Detector marks it with one or more PR types, THE Session_Logger SHALL, within 200 ms of the tap, highlight the Set row and show one label naming each marked PR type (weight PR, E1RM PR, rep PR).
8. WHEN any of these events affects a Set of an Exercise, THE PR_Detector SHALL recompute the PR marks of every remaining Completed_Set of that Exercise in all Sessions: the weight or reps of a Completed_Set is edited, a Set is marked completed or un-completed, a Set is deleted or restored through an Undo_Toast, or a Session containing the Set is deleted or discarded.
9. FOR ALL histories of Completed_Sets of one Exercise, the PR marks computed incrementally (each Completed_Set evaluated when it is completed, in completion order, with no later edits or deletions) SHALL equal the PR marks computed from the full history in one pass. The one-pass result SHALL be the same for every order in which the history is passed to the PR_Detector (model-based property).
10. FOR ALL histories of Completed_Sets of one Exercise with at least one Completed_Set, the maximum weight in the history SHALL equal the weight of the first Completed_Set in completion order or the weight of a Completed_Set marked as a weight PR (metamorphic property).
11. IF a Set is not a Completed_Set (completed flag false, or reps below 1), THEN THE PR_Detector SHALL mark no PR for that Set and SHALL leave it out of P for every other Set.
12. THE PR_Detector SHALL mark a Completed_Set with every PR type whose condition in criteria 2 to 4 holds, so a single Completed_Set can carry 0, 1, 2 or 3 PR types.
13. WHEN a recomputation under criterion 8 changes the PR marks of a Set row shown in the Session_Logger, THE Session_Logger SHALL add or remove that row's highlight and PR labels within 200 ms of the change.

### Requirement 25: History and progress charts

**User Story:** As the Owner, I want to see past workouts and per-exercise charts, so that I can track long-term progress.

#### Acceptance Criteria

1. THE Gym_Module SHALL list every Finished Session, and no Active Session, sorted by start timestamp from newest to oldest. Each row SHALL show the Local_Date of the start timestamp, the recorded Routine name (or "Empty session" when the Session was not started from a Routine), the duration rounded to the nearest whole minute, the number of Completed_Sets, and the total volume. Total volume is the sum of Set_Volume over all Completed_Sets of the Session, shown in kg rounded to the nearest whole kg.
2. WHEN the Owner opens a Finished Session from the history list, THE Gym_Module SHALL show every Exercise of the Session in Session order. Each Exercise SHALL show its Completed_Sets in logged order with weight and reps, and one label for each weight PR, E1RM PR and rep PR that the PR_Detector assigns to that Completed_Set.
3. WHEN the Owner opens the progress chart of an Exercise, THE Gym_Module SHALL plot one point per Finished Session that contains at least one Completed_Set of that Exercise. Each point SHALL be placed at the Local_Date of the Session's start timestamp, in start timestamp order. Its value SHALL be the selected metric: top weight (Requirement 23, criterion 4), best E1RM (Requirement 23, criterion 4), or Exercise volume (Requirement 23, criterion 3), displayed rounded to 0.1 kg. Best E1RM SHALL be selected by default.
4. THE Gym_Module SHALL provide chart ranges of 1 month, 3 months, 6 months, 1 year and all time, with 3 months selected by default. A range of n months (1 year = 12 months) SHALL include the points whose Session start Local_Date is on or after the same day of the month n calendar months before today. When that day does not exist in that month, the range SHALL start on the last day of that month. All time SHALL include every point.
5. THE Gym_Module SHALL mark a chart point with a marker distinct from unmarked points when its Session contains at least one Completed_Set of that Exercise that the PR_Detector marks as a weight PR or E1RM PR. Points whose Sessions contain only rep PRs, or no PRs, SHALL stay unmarked.
6. IF fewer than 2 Finished Sessions contain a Completed_Set of the Exercise, THEN THE Gym_Module SHALL show "Log this exercise in 2 sessions to see a chart" instead of the chart.
7. IF at least 2 Finished Sessions contain a Completed_Set of the Exercise and the selected chart range contains no points, THEN THE Gym_Module SHALL show a message saying that no sessions fall in the selected range in place of the chart, and SHALL keep the range and metric selectors available.
8. IF no Finished Session exists, THEN THE Gym_Module SHALL show a message saying that no workouts have been finished yet in place of the history list.

### Requirement 26: Split analysis volume counting

**User Story:** As the Owner, I want weekly sets per muscle counted consistently, so that I can judge whether my split is balanced.

#### Acceptance Criteria

1. THE Split_Analyzer SHALL compute, for each muscle m in the muscle list defined in the Gym_Module constants file and for a given Analysis_Window, the weekly sets of m as the sum over every Completed_Set in every Finished Session whose start time falls on one of the Analysis_Window's 7 Local_Dates of: 1 when m is a primary muscle of the Set's Exercise, 0.5 when m is a secondary but not a primary muscle of that Exercise, and 0 otherwise. Each muscle counts at most once per Set, even if it appears more than once in the Exercise's muscle lists. A Completed_Set counts whatever its weight, including 0 kg. The Split_Analyzer uses the Exercise's primary and secondary muscles as stored at the time of computation.
2. THE Split_Analyzer SHALL classify each muscle's unrounded weekly sets as "low" when below 10 (including 0 and 9.5), "in range" when from 10 to 20 inclusive, and "high" when above 20 (including 20.5). The weekly sets value SHALL be displayed without rounding, so that 9.5 is shown as 9.5.
3. WHEN the Owner opens the split analysis view, THE Split_Analyzer SHALL use as the Analysis_Window the 7 consecutive Local_Dates ending on the current Local_Date.
4. WHILE a Session is Active, THE Split_Analyzer SHALL exclude all of that Session's Sets from weekly sets. WHEN that Session becomes Finished, THE Split_Analyzer SHALL include its Completed_Sets the next time it computes weekly sets for an Analysis_Window that contains the Session's start Local_Date.
5. FOR ALL lists of Completed_Sets in Finished Sessions started within the Analysis_Window, the sum of weekly sets over all muscles in the muscle list SHALL equal the sum over those Sets of (the number of distinct primary muscles in the muscle list + 0.5 × the number of distinct secondary muscles in the muscle list that are not primary) (conservation property).
6. FOR ALL lists of Completed_Sets and all permutations of the list, THE Split_Analyzer SHALL produce identical weekly sets and identical classifications for every muscle (order-independence property).
7. FOR ALL lists of Completed_Sets, adding one Completed_Set in a Finished Session started within the Analysis_Window SHALL leave every muscle's weekly sets unchanged or higher, and SHALL raise the weekly sets of every muscle listed in the added Set's Exercise by exactly 1 (primary) or 0.5 (secondary but not primary) (monotonicity property).
8. THE Split_Analyzer SHALL be implemented as pure functions that take the Sessions, Exercises and the window's end Local_Date as inputs, and that return identical output for identical inputs without reading the clock or the Local_Database. Every threshold (10, 20), the window length (7 Local_Dates), the step size (7 days) and the muscle list SHALL be defined in one Gym_Module constants file.
9. WHEN the Owner taps the "previous week" control, THE Split_Analyzer SHALL move the Analysis_Window 7 Local_Dates earlier and recompute weekly sets and classifications for every muscle. A window with no Completed_Sets SHALL report 0 weekly sets ("low") for every muscle.
10. WHEN the Owner taps the "next week" control, THE Split_Analyzer SHALL move the Analysis_Window 7 Local_Dates later and recompute. IF the Analysis_Window already ends on the current Local_Date, THEN THE Split_Analyzer SHALL disable the "next week" control and leave the window unchanged.
11. IF a Completed_Set references an Exercise that cannot be found, or an Exercise lists a muscle that is not in the muscle list, THEN THE Split_Analyzer SHALL count 0 for that Set or that muscle, continue computing all other muscles without raising an error, and leave the stored Session and Exercise data unchanged.

### Requirement 27: Split analysis flags

**User Story:** As the Owner, I want clear flags about untrained muscles and imbalances, so that I know what to change in my training.

#### Acceptance Criteria

1. THE Split_Analyzer SHALL evaluate flags only for the tracked muscles: chest, shoulders, triceps, biceps, lats, middle back, traps, lower back, abdominals, quadriceps, hamstrings, glutes and calves. The tracked muscle list is a configuration constant. THE Split_Analyzer SHALL produce no flag for a muscle that is not in the tracked muscle list.
2. WHILE the Analysis_Window contains at least 1 Finished Session, IF a tracked muscle has 0 weekly sets in the Analysis_Window, THEN THE Split_Analyzer SHALL flag the muscle as untrained.
3. THE Split_Analyzer SHALL compute push sets as the weekly sets of chest + shoulders + triceps and pull sets as the weekly sets of lats + middle back + biceps.
4. IF push sets and pull sets are both greater than 0 and the unrounded larger value divided by the unrounded smaller value is greater than 1.5, THEN THE Split_Analyzer SHALL flag a push/pull imbalance that names the larger side and shows the ratio rounded to 0.1. A ratio of exactly 1.5 or lower SHALL produce no push/pull flag.
5. IF quadriceps weekly sets and hamstrings weekly sets are both greater than 0 and the unrounded larger value divided by the unrounded smaller value is greater than 1.5, THEN THE Split_Analyzer SHALL flag a quad/hamstring imbalance that names the larger side and shows the ratio rounded to 0.1. A ratio of exactly 1.5 or lower SHALL produce no quad/hamstring flag.
6. THE Split_Analyzer SHALL compute each tracked muscle's training frequency as the number of distinct Local_Dates in the Analysis_Window on which a Finished Session started that contains at least one Completed_Set whose Exercise lists the muscle as a primary muscle. Sets of the Active Session and sets where the muscle is only a secondary muscle SHALL NOT count toward training frequency.
7. IF a tracked muscle has at least 1 weekly set and a training frequency of exactly 1, THEN THE Split_Analyzer SHALL flag the muscle as trained once per week. A muscle with a training frequency of 0 SHALL NOT receive this flag, even when secondary-muscle sets give it weekly sets.
8. THE Split_Analyzer SHALL report the number of Finished Sessions started within the Analysis_Window, selecting Sessions the same way as Requirement 26 criterion 1.
9. THE Split_Analyzer SHALL include in each flag message the values the flag is based on. Weekly sets SHALL be shown with at most one decimal place (for example "9.5"), and ratios SHALL be shown with one decimal place followed by "×", for example "Push 18 sets vs pull 9 sets (2.0×)". Untrained flags SHALL state 0 sets. Trained-once-per-week flags SHALL state the muscle's weekly sets and a frequency of 1 day.
10. IF exactly one value of a compared pair (push sets and pull sets, or quadriceps weekly sets and hamstrings weekly sets) is 0, THEN THE Split_Analyzer SHALL flag the matching imbalance, name the non-zero side, and show both set counts with no ratio.
11. IF the Analysis_Window contains 0 Finished Sessions, THEN THE Split_Analyzer SHALL produce no flags and SHALL return an empty-state message stating that no workouts were finished in the Analysis_Window, together with a Finished Session count of 0.
12. THE Split_Analyzer SHALL return flags in this fixed order: untrained flags, then the push/pull imbalance flag, then the quad/hamstring imbalance flag, then trained-once-per-week flags. Within each flag type, muscles SHALL follow the order of the tracked muscle list.

### Requirement 28: Gym dashboard card

**User Story:** As the Owner, I want a gym summary on the home screen, so that I see my training status at a glance.

#### Acceptance Criteria

1. WHEN the Home_Dashboard is displayed, THE Gym_Module DashboardCard SHALL show values read from the Local_Database at that moment: (a) the number of Finished Sessions whose start timestamp falls within the 7 Local_Dates ending today; (b) for the Finished Session with the latest finish timestamp, the Local_Date of its start timestamp and its recorded Routine name, or "Empty session" if it was started without a Routine; (c) the number of distinct tracked muscles (Requirement 27) whose weekly sets in the default Analysis_Window are below 10. Muscles flagged as untrained are included in (c), and each muscle is counted once. The Analysis_Window selected on the split analysis screen does not affect (c).
2. WHILE a Session is Active, THE Gym_Module DashboardCard SHALL show a "Resume workout" action that opens the Session_Logger for the Active Session. It SHALL also show the elapsed time, computed as the current time minus the Session's stored start timestamp and truncated to whole seconds. The elapsed time SHALL be formatted M:SS below 1 hour and H:MM:SS from 1 hour, and SHALL update at least once per second while the card is visible.
3. WHILE no Session is Active, THE Gym_Module DashboardCard SHALL show a "Start workout" action and no elapsed time. The action SHALL open the same start choice as the Command_Menu "Start workout" action, which lists every Routine and an empty Session (Requirement 18).
4. WHEN the Owner taps the Gym_Module DashboardCard outside its actions, THE App SHALL open the Gym_Module start screen.
5. IF no Finished Session exists, THEN THE Gym_Module DashboardCard SHALL show 0 as the session count, "No workouts yet" in place of the last Finished Session, and the number of tracked muscles as the low-or-untrained count.
6. IF the Local_Database read for the Gym_Module DashboardCard fails, THEN THE Gym_Module DashboardCard SHALL show an error message saying the gym summary could not be loaded, along with a "Retry" action that repeats the read. The other DashboardCards on the Home_Dashboard SHALL stay displayed, and no Gym_Module data SHALL be changed.

---

## Part C: Nutrition module

### Requirement 29: BMR and TDEE

**User Story:** As the Owner, I want my daily calorie burn estimated from my body data and logged training, so that my targets reflect what I actually do.

#### Acceptance Criteria

1. THE Energy_Calculator SHALL compute BMR with the Mifflin-St Jeor formula, using the sex, height and age of the saved Profile (Requirement 4) and with W = Current_Weight in kg, H = height in cm and A = age in integer years. When Weight_Entries exist, Current_Weight is the value of the Weight_Entry with the latest Local_Date that is not after today. The formulas are: for male, BMR = 10 × W + 6.25 × H − 5 × A + 5; for female, BMR = 10 × W + 6.25 × H − 5 × A − 161.
2. THE Energy_Calculator SHALL compute Logged_Training_Hours as follows. Let F be the Local_Date of the start timestamp of the earliest Finished Session. Let N = (number of days from F to today) + 1, clamped to the range 7 to 28 inclusive, so that N = 7 when F is after today. The window is the N Local_Dates from today − (N − 1) through today inclusive. Each Finished Session whose start timestamp falls on a Local_Date in the window contributes its duration (Requirement 22, criterion 2) in hours, with negative durations counted as 0 and durations above 4 hours counted as 4 hours. Logged_Training_Hours = (sum of contributions) × 7 / N. Active Sessions contribute nothing.
3. THE Energy_Calculator SHALL set Effective_Training_Hours using the first rule that applies: (a) if the manual training-hours override switch (Requirement 5) is on, the override value; (b) if at least one Finished Session has a start timestamp on a Local_Date from today − 27 through today inclusive, Logged_Training_Hours; (c) otherwise, the Profile weekly training hours. The source of Effective_Training_Hours is "override", "logged" or "profile" for rules (a), (b) and (c) respectively.
4. THE Energy_Calculator SHALL select the Activity_Factor from the unrounded Effective_Training_Hours h, where h ≥ 0: 1.2 when h < 1; 1.375 when 1 ≤ h < 3; 1.55 when 3 ≤ h < 5; 1.725 when 5 ≤ h < 8; 1.9 when h ≥ 8. For example, h = 0.99 selects 1.2 and h = 1 selects 1.375.
5. THE Energy_Calculator SHALL compute TDEE as the unrounded BMR × Activity_Factor and Daily_Burn as the unrounded TDEE + Burn_Offset, with no intermediate rounding.
6. THE Nutrition_Module SHALL display, on the screen that shows the energy targets, BMR, TDEE and Daily_Burn each rounded to the nearest whole kcal, the Activity_Factor as one of the exact values 1.2, 1.375, 1.55, 1.725 or 1.9, Effective_Training_Hours rounded to 1 decimal place, and the source label of Effective_Training_Hours ("override", "logged" or "profile") as defined in criterion 3.
7. WHEN a male Owner has W = 80, H = 180 and A = 30, THE Energy_Calculator SHALL compute BMR = 1780 (reference example).
8. WHEN a female Owner has W = 60, H = 165 and A = 25, THE Energy_Calculator SHALL compute BMR = 1345.25 (reference example).
9. FOR ALL valid Profiles (Requirement 4, criterion 2) and Current_Weight values from 30.0 to 300.0 kg, where each changed value stays within those ranges: increasing W by 1 kg SHALL increase BMR by 10, increasing H by 1 cm SHALL increase BMR by 6.25, increasing A by 1 year SHALL decrease BMR by 5, and the male BMR SHALL exceed the female BMR for the same W, H and A by 166, each difference within an absolute tolerance of 1e-9 kcal (metamorphic properties).
10. FOR ALL valid Profiles and all Effective_Training_Hours values h1 ≤ h2 from 0 to 40 hours, with the same BMR, TDEE at h2 SHALL be greater than or equal to TDEE at h1 (monotonicity property).
11. WHEN a Session becomes Finished, a Finished Session or one of its Sets is edited or deleted, a Weight_Entry is added, edited or deleted, the manual training-hours override switch or value is changed, Burn_Offset changes, or the Local_Date changes, THE Energy_Calculator SHALL recompute BMR, Logged_Training_Hours, Effective_Training_Hours, Activity_Factor, TDEE and Daily_Burn, and every Nutrition_Module screen that shows these values SHALL show the recomputed values without the Owner reloading the App.
12. WHEN the earliest Finished Session started 3 days before today (N = 7) and the window contains Finished Sessions of 1 h, 1.5 h and 5 h, THE Energy_Calculator SHALL compute Logged_Training_Hours = 6.5 and Activity_Factor = 1.725; and WHEN the earliest Finished Session started 60 days before today (N = 28) and the window's capped durations sum to 12 h, THE Energy_Calculator SHALL compute Logged_Training_Hours = 3.0 and Activity_Factor = 1.55 (reference examples).
13. IF reading the Profile, Weight_Entries, Finished Sessions or Settings from the Local_Database fails, THEN THE Nutrition_Module SHALL show an error message stating that the energy values could not be computed, SHALL NOT show BMR, TDEE or Daily_Burn values computed from partial data, and SHALL leave the stored data unchanged.

### Requirement 30: Calorie and protein targets

**User Story:** As the Owner, I want calorie and protein targets matched to my goal, so that I know how much to eat each day.

#### Acceptance Criteria

1. THE Energy_Calculator SHALL keep a separate goal adjustment for each goal, with defaults of −500 kcal for cut, 0 kcal for maintain and +300 kcal for bulk, and SHALL use the adjustment of the goal currently set in the Profile.
2. THE Settings_Screen SHALL let the Owner set two values separately for each goal (cut, maintain, bulk): the goal adjustment, as any multiple of 50 kcal from −1000 to +1000 kcal inclusive, and the protein factor, as any multiple of 0.1 g/kg from 1.6 to 2.2 g/kg inclusive. Each saved value SHALL take effect from the next Calorie_Target and Protein_Target computation.
3. THE Energy_Calculator SHALL compute Calorie_Target as the unrounded Daily_Burn plus the goal adjustment of the current goal, rounded to the nearest whole kcal, and SHALL then apply criterion 4.
4. IF the rounded value from criterion 3 is less than 1500 kcal and the Profile sex is male, or less than 1200 kcal and the Profile sex is female, THEN THE Energy_Calculator SHALL set Calorie_Target to 1500 kcal (male) or 1200 kcal (female).
5. THE Energy_Calculator SHALL keep a separate protein factor for each goal, with defaults of 2.2 g/kg for cut, 1.8 g/kg for maintain and 1.6 g/kg for bulk, and SHALL use the factor of the goal currently set in the Profile.
6. THE Energy_Calculator SHALL compute Protein_Target as Current_Weight × protein factor, rounded to the nearest whole gram.
7. FOR ALL Current_Weight values from 30 to 300 kg and all allowed protein factors, Protein_Target / Current_Weight SHALL lie within [1.6 − 0.5 / Current_Weight, 2.2 + 0.5 / Current_Weight] (bounds property).
8. WHILE Calorie_Target equals a floor set by criterion 4, THE Nutrition_Module SHALL show a warning next to every displayed Calorie_Target that says the target was raised to the floor and gives the floor value. THE Nutrition_Module SHALL remove the warning at the next computation in which criterion 4 does not apply.
9. IF the Owner enters a goal adjustment outside −1000 to +1000 kcal or not a multiple of 50 kcal, or a protein factor outside 1.6 to 2.2 g/kg or not a multiple of 0.1 g/kg, THEN THE Settings_Screen SHALL reject the value, keep the previously saved value, and show an error indicating the allowed range and step.
10. FOR ALL Daily_Burn values from 0 to 10000 kcal, all allowed goal adjustments and both sexes, Calorie_Target SHALL be a whole number equal to max(round(Daily_Burn + goal adjustment), floor), where floor is 1500 kcal for male and 1200 kcal for female (floor property).

### Requirement 31: Daily food log and saved meals

**User Story:** As the Owner, I want to log foods and reuse meals I eat often, so that daily tracking is fast.

#### Acceptance Criteria

1. WHEN the Owner opens the Food_Log, THE Nutrition_Module SHALL show today's Local_Date with its Food_Entries grouped under the meal slots in the order breakfast, lunch, dinner, snacks, entries within a slot in creation order. It SHALL also show daily totals of kcal, protein, carbs and fat, computed from unrounded values and displayed rounded to whole numbers, with a total of 0 for a day that has no Food_Entries. Previous-day and next-day controls SHALL each change the shown Local_Date by exactly one calendar day and refresh the entries and totals for that date.
2. WHEN the Owner saves the add-food form, THE Nutrition_Module SHALL create one Food_Entry with source "manual", the shown Local_Date, and the meal slot chosen in the form (default: the slot whose add control was tapped). The entry SHALL have a name of 1 to 80 characters after leading and trailing whitespace is trimmed, kcal from 0 to 5000 (required), protein, carbs and fat from 0 to 500 g each (0 when left empty), and grams that are either empty or from 0.1 to 5000 g. Every numeric field SHALL accept at most 1 decimal place. The form SHALL use one Idempotency_Key per opened form, so that repeated taps on save create one Food_Entry.
3. WHEN the Owner saves an edited Food_Entry, THE Nutrition_Module SHALL replace its name, kcal, protein, carbs, fat, grams and meal slot with the edited values under the field rules of criterion 2, keep its Local_Date, source and Idempotency_Key unchanged, and update the daily totals.
4. WHEN the Owner saves the create or edit form of a Saved_Meal, THE Nutrition_Module SHALL store the Saved_Meal with a name of 1 to 80 characters after trimming and 1 to 50 food items. Each item SHALL have the name, kcal, protein, carbs, fat and grams fields and ranges of criterion 2. Items are either entered in the form or copied from Food_Entries the Owner selected on the shown Local_Date, and copied items SHALL take the values those Food_Entries had at the moment of saving.
5. WHEN the Owner adds a Saved_Meal to the shown Local_Date with a chosen meal slot and a multiplier from 0.25 to 10 in 0.25 steps (default 1), THE Nutrition_Module SHALL create, in a single Local_Database transaction, one Food_Entry per item. Each entry SHALL have the item's name, the chosen meal slot and Local_Date, source "saved meal", and kcal, protein, carbs, fat and grams equal to the item's values multiplied by the multiplier. An item with empty grams SHALL yield an entry with empty grams. The add action SHALL use one Idempotency_Key, so that repeated taps create each Food_Entry once.
6. WHEN the Owner edits or deletes a Saved_Meal, THE Nutrition_Module SHALL leave the name, kcal, protein, carbs, fat, grams, meal slot and Local_Date of every Food_Entry already created from that Saved_Meal unchanged.
7. WHEN the Owner toggles the "incomplete" mark on the shown Local_Date, THE Nutrition_Module SHALL store the new mark state. While the mark is set, the date SHALL show an incomplete indicator and be excluded from Logged_Days, whatever its number of Food_Entries. When the mark is removed, the date SHALL count as a Logged_Day again if it has at least one Food_Entry.
8. FOR ALL Saved_Meals with 1 to 50 items within the ranges of criterion 2, and FOR ALL multipliers k from 0.25 to 10 in 0.25 steps that criterion 10 accepts, THE Nutrition_Module SHALL create exactly one Food_Entry per item. The sum of each of kcal, protein, carbs, fat and grams (counting only items with grams) over the created Food_Entries SHALL differ from k × the corresponding Saved_Meal total by at most 0.000001 (scaling property).
9. IF, when the Owner taps save on the add or edit form of a Food_Entry or a Saved_Meal, a required field is empty, a value is outside its range, a numeric value has more than 1 decimal place, or a Saved_Meal has 0 or more than 50 items, THEN THE Nutrition_Module SHALL save nothing, show an error next to each invalid field stating the allowed range or count, and keep every entered value in the form.
10. IF any kcal, protein, carbs, fat or grams value scaled by criterion 5 would exceed the maximum of criterion 2 (5000 kcal, 500 g, 5000 g), THEN THE Nutrition_Module SHALL create no Food_Entry, show an error naming the first item that exceeds the limit and the largest multiplier in 0.25 steps that keeps every item within the limits, and keep the chosen multiplier and meal slot in the form.
11. WHEN the Owner deletes a Food_Entry or a Saved_Meal, THE Nutrition_Module SHALL remove it from the shown list immediately, remove a deleted Food_Entry's values from the daily totals, and show an Undo_Toast for 6 seconds as defined in Requirement 64.

### Requirement 32: Progress rings and nutrition dashboard card

**User Story:** As the Owner, I want rings for calories and protein, so that I see at a glance how much is left today.

#### Acceptance Criteria

1. THE Nutrition_Module SHALL show, on the screen that displays today's Food_Log, a calorie ring filled to the fraction min(1, today's kcal total / Calorie_Target) and a protein ring filled to the fraction min(1, today's protein total / Protein_Target). Today's totals are the unrounded sums over all Food_Entries whose Local_Date is today, across all meal slots. A total of 0 shows an empty ring.
2. IF a daily total, rounded as in Criterion 3, is greater than its target, rounded the same way, THEN THE Nutrition_Module SHALL show that ring as a full ring in an "over target" style. That style SHALL differ from the within-target style in colour and SHALL carry a text label. In place of the remaining amount, the Nutrition_Module SHALL state the amount over, computed as the rounded total minus the rounded target.
3. THE Nutrition_Module SHALL show beside each ring the consumed amount, the target, and the remaining amount, computed as rounded target − rounded consumed. kcal values SHALL be rounded to whole kcal and protein values to whole grams. The remaining amount is never negative. IF the rounded consumed amount equals the rounded target, the remaining amount SHALL show 0 and the ring SHALL be full in the within-target style.
4. THE Nutrition_Module DashboardCard SHALL show today's calorie and protein rings and an "Add food" action. The rings SHALL use the same fill fractions, over-target style and rounded consumed, target, remaining and over amounts as Criteria 1–3.
5. WHEN the Owner taps the Nutrition_Module DashboardCard outside its actions, THE App SHALL open today's Food_Log.
6. IF Calorie_Target or Protein_Target cannot be computed because a required Profile field is missing, or the computed target is 0 or less, THEN THE Nutrition_Module SHALL show the affected ring empty on both the Food_Log screen and the DashboardCard. It SHALL show the consumed amount without a target, remaining amount or over amount, and SHALL show an action that opens the Settings_Screen.
7. WHEN a Food_Entry dated today is added, edited, deleted or restored through an Undo_Toast, OR Calorie_Target or Protein_Target changes, OR the current Local_Date changes while the App is open or on return to the foreground, THE Nutrition_Module SHALL update the rings and amounts on the Food_Log screen and the DashboardCard within 1 second without a page reload. After a date change, the totals SHALL be those of the new Local_Date.
8. WHEN the Owner taps the "Add food" action on the Nutrition_Module DashboardCard, THE App SHALL open the food-entry flow with today's Local_Date preselected.

### Requirement 33: Barcode scanning

**User Story:** As the Owner, I want to scan food barcodes, so that I can log packaged food without typing.

#### Acceptance Criteria

1. WHEN the Owner opens the Barcode_Scanner, THE Barcode_Scanner SHALL request the rear-facing camera, show its live preview, scan continuously for EAN-13, EAN-8, UPC-A and UPC-E barcodes, ignore every other barcode type, and show a "Type barcode" action that opens the barcode entry field.
2. WHEN the Barcode_Scanner decodes a barcode with a valid check digit, THE Barcode_Scanner SHALL stop the camera, ignore any further decode results from that scan, normalise the barcode as defined in criterion 9, and start exactly one Food_Lookup for the normalised barcode.
3. IF a decoded barcode has an invalid check digit, THEN THE Barcode_Scanner SHALL discard the result without showing an error, keep the camera running, and continue scanning.
4. IF camera access is denied, the device reports no camera, the camera is in use by another app, or the camera stream has not started within 10 seconds of the request, THEN THE Barcode_Scanner SHALL stop any started camera track and show a message naming which of these causes occurred, the steps to allow camera access in the iPhone Settings app (when access was denied), a "Try again" action that repeats the camera request, and the barcode entry field.
5. WHEN the Owner submits a typed barcode, THE Barcode_Scanner SHALL remove spaces and hyphens and SHALL start the Food_Lookup for the normalised barcode only if the result is 13 digits valid as EAN-13, 12 digits valid as UPC-A, or 8 digits valid as EAN-8 or, failing that, valid as UPC-E with a first digit of 0 or 1.
6. WHEN the Owner closes the Barcode_Scanner, navigates away from it, or the App becomes hidden (moved to the background or phone locked) while the camera is running, THE Barcode_Scanner SHALL stop scanning and stop every camera track within 1 second.
7. FOR ALL digit strings of length 7, 11 or 12, appending the computed GS1 mod-10 check digit SHALL produce a valid EAN-8, UPC-A or EAN-13 barcode respectively, and replacing any single digit of a valid barcode with a different digit SHALL produce an invalid barcode; FOR ALL valid UPC-E barcodes, expansion to UPC-A SHALL produce a valid UPC-A barcode with the same check digit (check-digit property).
8. IF a typed barcode contains characters other than digits, spaces and hyphens, has a digit count other than 8, 12 or 13, or fails the check-digit validation in criterion 5, THEN THE Barcode_Scanner SHALL keep the typed text in the field, show an inline error indicating which check failed, and start no Food_Lookup.
9. THE Barcode_Scanner SHALL normalise every accepted barcode before starting the Food_Lookup as follows: EAN-13 unchanged, UPC-A prefixed with one "0", UPC-E expanded to UPC-A and then prefixed with one "0", and EAN-8 unchanged.
10. WHEN the App becomes visible again and the Barcode_Scanner is still open with no Food_Lookup started, THE Barcode_Scanner SHALL request the rear-facing camera again and resume scanning.

### Requirement 34: Open Food Facts lookup and product cache

**User Story:** As the Owner, I want scanned products looked up and remembered, so that repeat scans work offline and missing products can still be logged.

#### Acceptance Criteria

1. WHEN a Food_Lookup starts and the barcode is in the Product_Cache, THE Food_Lookup SHALL show the cached product without waiting for any network request to complete.
2. WHEN a Food_Lookup starts while the device reports a network connection, and either the barcode is not in the Product_Cache or the cached record has source "Open Food Facts" and a fetch time more than 30 × 24 hours before the current time, THE Food_Lookup SHALL send one request to `https://world.openfoodfacts.org/api/v2/product/{barcode}.json` that asks only for the fields `product_name`, `brands`, `energy-kcal_100g`, `energy-kj_100g`, `proteins_100g`, `carbohydrates_100g`, `fat_100g` and `serving_quantity`.
3. THE Food_Lookup SHALL map product name, brand, `energy-kcal_100g`, `proteins_100g`, `carbohydrates_100g`, `fat_100g` and `serving_quantity` (grams per serving) into a product record. It SHALL trim leading and trailing whitespace from the name and the brand and treat an empty result as missing. It SHALL treat `serving_quantity` as missing unless it is a finite number greater than 0.
4. WHEN the Food_Lookup maps a product whose `energy-kcal_100g` is missing under criterion 5 and whose `energy-kj_100g` is not missing, THE Food_Lookup SHALL set kcal per 100 g to `energy-kj_100g` / 4.184 without rounding the stored value.
5. THE Food_Lookup SHALL treat a nutrient value (`energy-kcal_100g`, `energy-kj_100g`, `proteins_100g`, `carbohydrates_100g`, `fat_100g`) as missing if it is absent, null, an empty string, a string that does not parse in full as a decimal number with "." as the decimal separator, not finite, or negative. It SHALL also treat as missing any kcal per 100 g above 1000, any `energy-kj_100g` above 4184, and any protein, carbohydrate or fat value above 100 g per 100 g.
6. WHEN a request returns a product, THE Food_Lookup SHALL store the mapped product record in the Product_Cache with source "Open Food Facts" and the fetch time, replacing any earlier "Open Food Facts" record for the same barcode so that the Product_Cache holds at most one record per barcode. If that barcode's cached product is on screen, THE Food_Lookup SHALL replace the shown values with the new ones.
7. IF Open Food Facts reports that no product exists for the barcode and the barcode is not in the Product_Cache, THEN THE Food_Lookup SHALL write nothing to the Product_Cache and SHALL open the manual product form with the barcode filled in and every other field empty.
8. IF the product returned by Open Food Facts, or the product found in the Product_Cache, has kcal per 100 g missing or product name missing, THEN THE Food_Lookup SHALL open the manual product form with the barcode and every non-missing field filled in.
9. WHEN the Owner saves the manual product form and every value passes criterion 15, THE Food_Lookup SHALL store the product in the Product_Cache under its barcode with source "manual", replacing any "Open Food Facts" record for that barcode, so that the next Food_Lookup for that barcode shows the product under criterion 1 without sending a request.
10. THE Food_Lookup SHALL send no Open Food Facts request for a barcode whose Product_Cache record has source "manual", and SHALL never overwrite or delete that record during a Food_Lookup.
11. IF the barcode is not in the Product_Cache and the device reports no network connection, the request fails, the response cannot be read as an Open Food Facts product response, or no response arrives within 10 seconds of sending the request, THEN THE Food_Lookup SHALL show a message stating which of these occurred (offline, request failed, or timed out), a "Retry" action that restarts the Food_Lookup for the same barcode, and the manual product form with the barcode filled in. In this case it SHALL write nothing to the Product_Cache and SHALL ignore any response that arrives after the 10 seconds.
12. FOR ALL Open Food Facts product JSON values, including values with absent fields, wrong types, numeric strings and out-of-range numbers, mapping to a product record SHALL produce kcal per 100 g that is finite and between 0 and 1000 or missing, protein, carbohydrates and fat that are each finite and between 0 and 100 or missing, and `serving_quantity` that is finite and greater than 0 or missing (validity property).
13. IF a revalidation request for a cached "Open Food Facts" product fails, gets no response within 10 seconds, reports that the product does not exist, or returns a product whose kcal per 100 g is missing, THEN THE Food_Lookup SHALL keep showing the cached product, leave the cached record and its fetch time unchanged, and show no error message.
14. IF the barcode passed to the Food_Lookup is not a string of 8 to 14 decimal digits, THEN THE Food_Lookup SHALL send no request, write nothing to the Product_Cache, and show a message stating that the barcode is not a supported product barcode.
15. IF the Owner saves the manual product form with a name that is empty after trimming or longer than 100 characters, a missing kcal per 100 g, or any entered nutrient or serving value that criterion 3 or criterion 5 would treat as missing, THEN THE Food_Lookup SHALL store nothing, keep every entered value in the form, and mark each invalid field with a message stating the allowed range.

### Requirement 35: Portion scaling

**User Story:** As the Owner, I want to log a portion in grams or servings, so that the logged nutrition matches what I ate.

#### Acceptance Criteria

1. WHEN the Owner enters a valid portion of g grams, THE Portion_Calculator SHALL compute each of kcal, protein, carbs and fat as (unrounded value per 100 g from the product record) × g / 100.
2. WHERE the product's `serving_quantity` is a finite number greater than 0, THE Portion_Calculator SHALL offer a servings input next to the grams input and SHALL convert s servings to g = s × `serving_quantity` grams. If `serving_quantity` is missing, 0, negative or not a finite number, only the grams input is shown.
3. THE Portion_Calculator SHALL accept a grams value from 1 to 5000 inclusive with at most 1 decimal place, and a servings value from 0.25 to 20 inclusive that is a multiple of 0.25 and whose converted grams (s × `serving_quantity`) are from 1 to 5000 inclusive.
4. WHILE a valid portion is entered, THE Nutrition_Module SHALL display the portion kcal rounded to a whole kcal and the portion protein, carbs and fat rounded to 0.1 g, with "round" as defined in Conventions.
5. FOR ALL products, scaling 100 g SHALL return each per-100 g value within a relative tolerance of 1e-9, and SHALL return every missing per-100 g value as missing (identity property).
6. FOR ALL products and gram amounts a and b with a ≥ 1, b ≥ 1 and a + b ≤ 5000, scaling (a + b) grams SHALL equal scaling a grams plus scaling b grams within a relative tolerance of 1e-9, where values x and y are within relative tolerance t when |x − y| ≤ t × max(|x|, |y|) (linearity property).
7. FOR ALL products with `serving_quantity` q > 0 and valid servings values s with 1 ≤ s × q ≤ 5000, scaling s servings SHALL equal scaling s × q grams within a relative tolerance of 1e-9 (servings equivalence property).
8. FOR ALL products whose per-100 g values are finite and non-negative or missing, and all valid portions, every scaled value SHALL be finite and non-negative, or missing.
9. IF a product's protein, carbs or fat value per 100 g is missing, THEN THE Portion_Calculator SHALL return that nutrient as missing (not as 0) for every portion, and THE Nutrition_Module SHALL display it as a dash and store it as missing in the Food_Entry.
10. IF the grams value is empty, not a number, has more than 1 decimal place, or is outside 1–5000, or the servings value is empty, not a multiple of 0.25, outside 0.25–20, or converts to grams outside 1–5000, THEN THE Nutrition_Module SHALL show an inline error stating the allowed range, SHALL disable saving the Food_Entry, and SHALL keep the Owner's other inputs and all existing Food_Entries unchanged.
11. WHEN the Owner saves a valid portion, THE Nutrition_Module SHALL create one Food_Entry that stores the unrounded scaled kcal, protein, carbs and fat, the product barcode, and the portion in grams, where a servings input is stored as the converted grams s × `serving_quantity`.

### Requirement 36: AI meal estimation request

**User Story:** As the Owner, I want to photograph a meal and get an estimate, so that I can log meals without packaging.

#### Acceptance Criteria

1. THE Meal_Estimator SHALL offer exactly two ways to provide a meal photo: "Take photo", which opens the camera, and "Choose from library", which opens the photo library. The Meal_Estimator SHALL accept exactly one photo per estimate, in any image format Safari can decode, including JPEG, PNG and HEIC. It SHALL provide no text-description input. When the Owner selects a new photo, the new photo SHALL replace the previously selected one.
2. WHEN the Owner selects a photo, THE Meal_Estimator SHALL first apply the photo's orientation so that the result displays upright. It SHALL then scale the photo, keeping the aspect ratio, so that its longest side is the smaller of the original longest side and 1024 px. A photo whose longest side is 1024 px or less SHALL not be enlarged. The other side SHALL be the original other side × (new longest side / original longest side), rounded to the nearest whole pixel. Finally the Meal_Estimator SHALL re-encode the result as JPEG at quality 0.8 with no EXIF, GPS or other metadata from the original file.
3. WHEN the Owner taps "Estimate" and the checks of Requirement 37 criteria 10 and 11 pass, THE Meal_Estimator SHALL send one request to the Google Gemini Flash `generateContent` endpoint. The request SHALL contain the resized photo of criterion 2, a fixed instruction prompt read from one configuration constant, and a JSON response schema containing `items` (each with `name`, `grams`, `kcal`, `protein_g`, `carbs_g`, `fat_g`) and `confidence` (one of `low`, `medium`, `high`). The request SHALL contain no other Owner data, such as Profile values or Food_Entries.
4. THE Meal_Estimator SHALL read the Gemini model id from one configuration constant.
5. THE App SHALL store the Gemini_Key only in the Local_Database on the device. It SHALL send the Gemini_Key only in HTTPS requests to the Google Gemini API, and never in the request URL. The Gemini_Key value SHALL appear nowhere outside the Local_Database and those requests: not in browser console output, error messages, Toasts or Backup_Files. On screen, the key appears only in the masked form of Requirement 5 criterion 7.
6. THE Settings_Screen SHALL let the Owner enter, replace and delete the Gemini_Key. The values it accepts are those of Requirement 5 criterion 2. WHEN the Owner deletes the Gemini_Key, THE Settings_Screen SHALL remove it from the Local_Database and show "Not set", so that the next estimate request produces the message of Requirement 37 criterion 11.
7. WHEN the Owner taps "Estimate", no free-tier warning acknowledgement is stored in the Local_Database, and the checks of Requirement 37 criteria 10 and 11 pass, THE Meal_Estimator SHALL show a warning that Google may use data sent through the free tier to improve its products. The warning SHALL have an "I understand" action and a "Cancel" action, and the Meal_Estimator SHALL send no request while the warning is open. Tapping "I understand" SHALL store the acknowledgement in the Local_Database and then send the request of criterion 3. Tapping "Cancel" or dismissing the warning SHALL send no request, store no acknowledgement and keep the selected photo. After an acknowledgement is stored, the warning SHALL not be shown again before requests.
8. THE Settings_Screen SHALL show the free-tier data warning of criterion 7 next to the Gemini_Key field at all times, whether or not a Gemini_Key is stored and whether or not the warning has been acknowledged.
9. WHILE an estimate request is pending, THE Meal_Estimator SHALL show a progress indicator and a "Cancel" action. IF no complete response has arrived 45 seconds after the request was sent, THEN THE Meal_Estimator SHALL abort the request and show the timeout error of Requirement 37 criterion 14.
10. WHEN the Owner taps "Cancel" while an estimate request is pending, or leaves the Meal_Estimator screen while a request is pending, THE Meal_Estimator SHALL abort the request. It SHALL show no error message, create no Food_Entry and keep the selected photo. If a response to the aborted request arrives later, the Meal_Estimator SHALL discard it without showing it.
11. IF the selected file cannot be decoded as an image, or the resize and re-encode of criterion 2 fails, THEN THE Meal_Estimator SHALL show an error message indicating the photo could not be read and send no request. It SHALL keep the previously selected valid photo if one exists, and otherwise show no photo.
12. WHILE an estimate request is pending, THE Meal_Estimator SHALL disable "Estimate" and photo selection, so that at most one estimate request is in flight at any time.

### Requirement 37: AI meal estimation review and errors

**User Story:** As the Owner, I want to review and correct the AI estimate before saving, and get clear errors when it fails, so that wrong estimates never enter my log silently.

#### Acceptance Criteria

1. WHEN a response with an HTTP success status arrives, THE Meal_Estimator SHALL accept the response if and only if its text parses as JSON matching the response schema of Requirement 36 criterion 3, `items` contains 1 to 20 items, every `name` contains at least one non-whitespace character, every `grams`, `kcal`, `protein_g`, `carbs_g` and `fat_g` value is a finite number greater than or equal to 0, every `grams` value is at most 3000, every `kcal` value is at most 5000, every `protein_g`, `carbs_g` and `fat_g` value is at most 500, and `confidence` is one of `low`, `medium` or `high`. Fields not listed in the schema SHALL be ignored, and a success response with no text content SHALL fail this validation.
2. WHEN a response is accepted, THE Meal_Estimator SHALL show an editable review screen that lists each item's name, grams, kcal, protein, carbs and fat, and also shows the meal totals of kcal, protein, carbs and fat, the confidence level, and a meal slot selector offering breakfast, lunch, dinner and snacks with no slot pre-selected. Grams and kcal SHALL be displayed rounded to whole numbers, and protein, carbs and fat rounded to 0.1 g.
3. WHEN the Owner changes an item's grams to a new value from 1 to 5000, THE Meal_Estimator SHALL multiply the item's unrounded kcal, protein, carbs and fat by new grams / old grams if the old grams value is greater than 0, and SHALL leave kcal, protein, carbs and fat unchanged if the old grams value is 0.
4. THE Meal_Estimator SHALL let the Owner, on the review screen, edit each item's name, grams, kcal, protein, carbs and fat, remove any item, and add an item with an empty name and every number set to 0 while the screen holds fewer than 20 items. After every add, remove or edit, THE Meal_Estimator SHALL recompute the meal totals from the unrounded item values.
5. WHILE an item's unrounded kcal differs from 4 × protein + 4 × carbs + 9 × fat by more than 20 % of the item's kcal and by more than 50 kcal, THE Meal_Estimator SHALL show a consistency warning on that item, re-evaluating the condition after every edit of that item. The warning SHALL NOT disable "Save".
6. IF the accepted response has confidence `low`, THEN THE Meal_Estimator SHALL show a banner on the review screen asking the Owner to check the values, keep the banner visible until the review screen closes, and leave "Save" unaffected by the banner.
7. WHEN the Owner taps "Save" and criterion 18 does not disable it, THE Meal_Estimator SHALL create, in one Local_Database transaction, one Food_Entry per review-screen item. Each Food_Entry SHALL hold the item's name and its unrounded grams, kcal, protein, carbs and fat as edited, source "ai", the confidence level of the accepted response, the selected meal slot, the Local_Date shown in the Food_Log when the Owner started the estimate, and the same thumbnail of the photo (aspect ratio kept, longest side at most 256 px) with its BlurHash. After the transaction succeeds, THE Meal_Estimator SHALL close the review screen and show the Food_Log of that Local_Date.
8. WHEN the review screen creates an item, either from the accepted response or through the Owner's add action, THE Meal_Estimator SHALL assign that item its own Idempotency_Key as defined in Requirement 11 criterion 1 and reuse that key for every save attempt from that review screen, so that repeated taps on "Save" and retries create each Food_Entry exactly once.
9. WHEN the Owner closes the review screen by any means other than a successful "Save", THE Meal_Estimator SHALL create no Food_Entry and no thumbnail, and SHALL discard the response and all edits.
10. IF the browser reports no network connection when the Owner requests an estimate or taps "Retry", THEN THE Meal_Estimator SHALL show "You are offline. AI estimates need a connection.", send no request, and keep the selected photo.
11. IF no Gemini_Key is stored when the Owner requests an estimate or taps "Retry", THEN THE Meal_Estimator SHALL show "Add your Gemini API key in Settings" with a link to the Settings_Screen, send no request, and apply this check before the offline check of criterion 10.
12. IF the Gemini API returns HTTP 400, 401 or 403, THEN THE Meal_Estimator SHALL show "Your Gemini API key was rejected. Check it in Settings." with a link to the Settings_Screen and no "Retry" action.
13. IF the Gemini API returns HTTP 429, THEN THE Meal_Estimator SHALL show "Free-tier limit reached. Try again later." with a "Retry" action.
14. IF the Gemini API returns HTTP 5xx or any other non-success status except 400, 401, 403 and 429, the request fails with a network error, or the request is aborted after 45 seconds under Requirement 36 criterion 9, THEN THE Meal_Estimator SHALL show "The AI service did not respond." with a "Retry" action.
15. IF a response fails the validation of criterion 1, THEN THE Meal_Estimator SHALL show "The AI returned an unusable answer." with "Retry" and "Enter manually" actions. "Enter manually" SHALL open the manual Food_Entry form of Requirement 31 criterion 2 for the same Local_Date and SHALL create no Food_Entry by itself.
16. IF any error of criteria 10 to 15 occurs, THEN THE Meal_Estimator SHALL keep the resized photo of Requirement 36 criterion 2 until the Owner selects another photo or leaves the Meal_Estimator, so that "Retry" sends that same photo with the same prompt without asking the Owner to choose a photo again.
17. FOR ALL JSON values, the response validator SHALL accept exactly the values that satisfy criterion 1 (validator property).
18. IF the review screen holds 0 items, no meal slot is selected, or any item has a name that is empty after trimming whitespace or longer than 80 characters, grams outside 1 to 5000, kcal outside 0 to 5000, or protein, carbs or fat outside 0 to 500 g, THEN THE Meal_Estimator SHALL disable "Save" and mark each invalid field or missing selection.
19. IF the Local_Database transaction of criterion 7 fails, THEN THE Meal_Estimator SHALL create none of the Food_Entries, keep the review screen open with all items, edits, the selected meal slot and every item's Idempotency_Key, and show a Toast indicating that saving failed.

### Requirement 38: Body-weight log and trend

**User Story:** As the Owner, I want to log my weight and see a smoothed trend, so that daily fluctuations don't mislead me.

#### Acceptance Criteria

1. THE Nutrition_Module SHALL let the Owner add a Weight_Entry with a Local_Date, which defaults to today's Local_Date and must not be later than today, and a weight from 30.0 to 300.0 kg inclusive with at most one decimal place; THE Nutrition_Module SHALL display weights and Weight_Trend values rounded to 0.1 kg.
2. WHEN the Owner adds or edits a Weight_Entry so that its Local_Date already has another Weight_Entry, THE Nutrition_Module SHALL replace that other Weight_Entry so that the Local_Date keeps exactly one Weight_Entry, and show an Undo_Toast whose Undo action restores the replaced Weight_Entry's weight for that Local_Date.
3. THE Nutrition_Module SHALL let the Owner change the weight and the Local_Date of an existing Weight_Entry under the same limits as criterion 1, and delete a Weight_Entry with an Undo_Toast whose Undo action restores the deleted Weight_Entry with its original Local_Date and weight.
4. THE Nutrition_Module SHALL compute Weight_Trend for a Local_Date d as the arithmetic mean of the unrounded weights of all Weight_Entries dated from d − 6 calendar days to d inclusive, including entries dated before the start of the displayed chart range, and leave Weight_Trend undefined for d when that range has no Weight_Entry.
5. THE Nutrition_Module SHALL show a chart with one point per Weight_Entry and a Weight_Trend line covering every Local_Date in the selected range where Weight_Trend is defined, with a gap where it is undefined. The selectable ranges SHALL be the last 30, 90, 180 and 365 Local_Dates ending today, plus all time, which runs from the earliest Weight_Entry to today.
6. WHEN a Weight_Entry is added, edited, replaced, deleted or restored by Undo, THE Energy_Calculator SHALL set Current_Weight to the weight of the Weight_Entry with the latest Local_Date, or to the Profile weight when no Weight_Entry remains, and recompute every value that depends on Current_Weight before any screen showing those values next renders.
7. FOR ALL series of Weight_Entries, each defined Weight_Trend value for Local_Date d SHALL lie within 1e-9 kg of the closed interval between the minimum and maximum weights of the Weight_Entries dated d − 6 to d (bounds property).
8. FOR ALL series of Weight_Entries that all have the same weight, every defined Weight_Trend value SHALL be within 1e-9 kg of that weight (constant property).
9. IF the Owner submits a new or edited Weight_Entry with an empty weight, a weight below 30.0 kg or above 300.0 kg, a weight with more than one decimal place, or a Local_Date later than today's Local_Date, THEN THE Nutrition_Module SHALL reject the submission, leave all stored Weight_Entries unchanged, keep the entered values in the form, and show an inline error that names the invalid field and its allowed range.
10. IF saving an add, edit, replacement, delete or Undo of a Weight_Entry to the Local_Database fails, THEN THE Nutrition_Module SHALL leave the stored Weight_Entries, Current_Weight and every value that depends on Current_Weight as they were before the operation, and show a Toast indicating that the change was not saved.
11. IF the selected chart range contains no Weight_Entry, THEN THE Nutrition_Module SHALL show, in place of the chart, an empty-state message and an action that opens the add Weight_Entry form.

### Requirement 39: Burn correction from weight trend

**User Story:** As the Owner, I want the app to check its burn estimate against my real weight change, so that my targets get more accurate over time.

#### Acceptance Criteria

1. WHEN the Nutrition_Module is displayed, or a Weight_Entry or Food_Entry is added, edited or deleted, or a Local_Date is marked or unmarked as incomplete, THE Trend_Corrector SHALL recompute from the current Local_Database data using a window that ends yesterday and covers the Local_Dates from yesterday − (L − 1) to yesterday inclusive. L = min(28, number of days from the earliest Weight_Entry date to yesterday inclusive), and L = 0 when no Weight_Entry is dated on or before yesterday. Weight_Entries and Food_Entries dated today are excluded from the window.
2. THE Trend_Corrector SHALL define the first block as the first 7 days of the window and the last block as the last 7 days of the window.
3. THE Trend_Corrector SHALL treat the suggestion conditions as met only when all of these hold: L ≥ 14; the first block contains Weight_Entries on at least 3 distinct Local_Dates; the last block contains Weight_Entries on at least 3 distinct Local_Dates; and the window contains at least ⌈0.8 × L⌉ Logged_Days.
4. THE Trend_Corrector SHALL compute average intake I in kcal as the sum of the unrounded kcal of all Food_Entries on Logged_Days in the window, divided by the number of Logged_Days in the window. Food_Entries on window dates that are not Logged_Days are excluded from both the sum and the count.
5. THE Trend_Corrector SHALL compute ΔW in kg as the unrounded mean of the last block's Weight_Entry values minus the unrounded mean of the first block's Weight_Entry values, and SHALL compute D = L − 7 days. With L between 14 and 28, D is between 7 and 21.
6. THE Trend_Corrector SHALL compute the corrected burn as C = I − ΔW × 7700 / D.
7. WHILE the suggestion conditions of criterion 3 hold, |C − Daily_Burn| ≥ 100 kcal, 1200 kcal ≤ C ≤ 5000 kcal, and no Ignore period from criterion 10 is active, THE Nutrition_Module SHALL show a suggestion with "Accept" and "Ignore" actions. The suggestion SHALL show C rounded to the nearest whole kcal, I rounded to the nearest whole kcal, ΔW in kg rounded to 2 decimal places with its sign, and D and L as integers. The comparisons SHALL use unrounded C and Daily_Burn = current TDEE + current Burn_Offset.
8. WHILE the suggestion conditions of criterion 3 do not hold, THE Nutrition_Module SHALL show no suggestion and SHALL list each shortfall: 14 − L more days of weight history when L < 14; when L ≥ 14, 3 minus the number of Weight_Entry dates in the first block if that number is below 3, and the same for the last block; and ⌈0.8 × L⌉ minus the number of Logged_Days in the window when that result is above 0.
9. WHEN the Owner taps "Accept", THE Energy_Calculator SHALL replace the existing Burn_Offset (not add to it) with C − TDEE, using the unrounded C and TDEE at the moment of the tap, rounded to the nearest whole kcal. THE Energy_Calculator SHALL also persist the new Burn_Offset in the Local_Database.
10. WHEN the Owner taps "Ignore", THE Nutrition_Module SHALL hide the suggestion, leave Burn_Offset unchanged, and show no suggestion until the start of the Local_Date 7 days after the Local_Date of the tap. The Ignore period SHALL persist across App restarts.
11. WHEN the Owner taps the Burn_Offset reset action on the Settings_Screen, THE Energy_Calculator SHALL set Burn_Offset to 0 and persist it in the Local_Database, so that Daily_Burn equals TDEE.
12. WHEN L = 21, I = 2200 kcal, the first block mean is 80.0 kg and the last block mean is 79.5 kg, THE Trend_Corrector SHALL compute C = 2475 kcal (reference example).
13. FOR ALL inputs with 14 ≤ L ≤ 28 and I > 0 where ΔW = 0, C SHALL equal I (fixed-point property).
14. FOR ALL inputs with 14 ≤ L ≤ 28, C SHALL be strictly decreasing in ΔW, and increasing I by k kcal SHALL increase C by exactly k kcal (metamorphic properties).
15. IF the suggestion conditions of criterion 3 hold and C < 1200 kcal or C > 5000 kcal, THEN THE Nutrition_Module SHALL show no suggestion, SHALL show a message saying the computed burn is outside 1200–5000 kcal and the logged food or weight data may be incomplete, and SHALL leave Burn_Offset unchanged.
16. IF the suggestion conditions of criterion 3 hold, 1200 kcal ≤ C ≤ 5000 kcal, and |C − Daily_Burn| < 100 kcal, THEN THE Nutrition_Module SHALL show no suggestion and no shortfall list, and SHALL leave Burn_Offset unchanged.

---

## Part D: Chess module

### Requirement 40: Chess profile and rating bands

**User Story:** As the Owner, I want the chess module to know my username and rating, so that content matches my level.

#### Acceptance Criteria

1. THE Chess_Module SHALL use "AdiChessLarper" as the Chess.com username while the Owner has never stored another username, and THE Settings_Screen SHALL let the Owner change the username in the Chess section (Requirement 5 criterion 2).
2. IF the Owner commits a username that, after leading and trailing whitespace is removed, is not 3 to 25 characters long or contains a character other than the ASCII letters a–z and A–Z, the digits 0–9, "_" and "-", THEN THE Settings_Screen SHALL show the allowed format next to the field, send no request, keep the previously stored username, and keep the entered text in the field.
3. WHEN the Owner commits a username that passes criterion 2 and differs from the stored username, THE ChessCom_Client SHALL send one request to `/pub/player/{username}` with the username converted to lowercase, following the network rules of Requirement 46. WHILE that request is pending, THE Settings_Screen SHALL show a progress indicator next to the field and ignore further commits of the field, so that at most one verification request is in flight.
4. WHEN the verification request returns HTTP 200 with a JSON body, THE Settings_Screen SHALL store the trimmed username exactly as the Owner typed it (letter case kept) and show it as the stored username.
5. IF the verification request returns HTTP 404 or HTTP 410, THEN THE Settings_Screen SHALL show "Chess.com user not found", store nothing, keep the previously stored username, and keep the entered text in the field.
6. IF the username cannot be verified because the device is offline, the request fails with a network error, times out, receives HTTP 429 after the retries of Requirement 46 criterion 2, receives HTTP 5xx or any other non-200 status not covered by criterion 5, or returns a body that is not JSON, THEN THE Settings_Screen SHALL store nothing, keep the previously stored username, keep the entered text in the field, and show the message that Requirement 46 defines for that failure together with a "Retry" action that repeats the verification.
7. WHEN a username that differs from the previous one ignoring letter case is stored, THE Chess_Module SHALL clear the stored Chess.com ratings of Requirement 43 (so that they show "No rating" until the next refresh), keep every stored Game_Record, and track the month-complete marks of Requirement 44 separately per username (compared ignoring case), so that Game_Sync for the new username requests every month of its own archive list.
8. THE Chess_Module SHALL store a manual rating that is an integer from 100 to 3000 inclusive, with a default of 1100. An entered value outside that range or not an integer SHALL be handled as Requirement 5 criterion 6 specifies.
9. THE Chess_Module SHALL set Chess_Rating to the stored Chess.com Rapid rating (Requirement 43) WHILE the Chess_Rating source is "Chess.com Rapid" and a Rapid rating is stored, and to the manual rating otherwise. The default source is "Chess.com Rapid". WHILE the source is "Chess.com Rapid" and no Rapid rating is stored, THE Settings_Screen SHALL show "Using manual rating: no Chess.com Rapid rating stored" next to the source selector.
10. THE Chess_Module SHALL map an integer rating r to a Rating_Band as follows: "below 800" when r < 800; for 800 ≤ r ≤ 1999, the band from 200 × ⌊r / 200⌋ to 200 × ⌊r / 200⌋ + 199 inclusive (for example 999 maps to 800–999 and 1000 maps to 1000–1199); "2000 and above" when r ≥ 2000. Bands SHALL be displayed with an en dash, for example "1000–1199".
11. FOR ALL integer ratings r from 0 to 4000 (a range that covers the manual range 100 to 3000 and Chess.com ratings outside it), THE Chess_Module SHALL map r to exactly one of the 8 Rating_Bands of the Glossary, that band SHALL contain r, and the band's position in the Glossary order SHALL be non-decreasing in r (partition property).

### Requirement 41: Tips library and daily tip

**User Story:** As the Owner, I want a daily tip suited to my rating, so that I learn something useful every day.

#### Acceptance Criteria

1. THE Tips_Library SHALL be one bundled data file in which every tip has: an id that is a non-empty string unique within the Tips_Library; exactly one Rating_Band; 1 or more topic tags taken from a fixed topic list defined in the Chess_Module constants file; a title of 1 to 80 characters; a body of 1 to 800 characters; and 0 or more Mistake_Detector ids from the list of Requirement 57 criterion 11. The order of tips in the file is the Tips_Library order.
2. THE Tips_Library SHALL contain at least 12 tips for each of the bands 800–999, 1000–1199, 1200–1399 and 1400–1599, and at least 6 tips for each of the bands below 800, 1600–1799, 1800–1999 and 2000 and above.
3. THE test suite SHALL contain a test that loads the Tips_Library file and fails if any tip breaks criterion 1 or any band breaks the minimum counts of criterion 2.
4. WHEN the daily tip is first displayed on a Local_Date, THE Chess_Module SHALL select one tip from the Rating_Band of the Chess_Rating at that moment and store the Local_Date and the tip id in the Local_Database. For the rest of that Local_Date THE Chess_Module SHALL show the stored tip, including after a restart and after the Chess_Rating moves to another Rating_Band.
5. THE Chess_Module SHALL keep, for each Rating_Band, the set of tip ids shown in the band's current cycle. The tip selected by criterion 4 SHALL be the first tip in Tips_Library order of that band whose id is not in that set. When every tip of the band is in the set, THE Chess_Module SHALL empty the set and select the band's first tip. A band's set SHALL be kept unchanged while the Chess_Rating is in another band, and tip ids no longer in the Tips_Library SHALL be ignored.
6. FOR ALL Rating_Bands with n tips (n from 1 to 50), all starting cycle sets, and all sequences of 1 to 200 tip-selecting Local_Dates on which the Chess_Rating's band is chosen from the 8 Rating_Bands, the tips selected for one band SHALL repeat no tip until every tip of that band has been selected since the last emptying of its set, and n consecutive selections in one band starting from an empty set SHALL be n distinct tips (no-repeat property).
7. THE Chess_Module SHALL show the daily tip's title and body on the Chess_Module start screen, together with its Rating_Band.
8. THE Chess_Module SHALL let the Owner browse tips with a Rating_Band filter (default: the band of the Chess_Rating) and a topic filter (default: all topics), listing matching tips in Tips_Library order. Opening a tip SHALL show its title, body, Rating_Band and topic tags. IF no tip matches the filters, THEN THE Chess_Module SHALL show "No tips match" with a "Clear filters" action.
9. IF storing the daily tip selection of criterion 4 fails, THEN THE Chess_Module SHALL still show the selected tip, leave the stored cycle sets unchanged, and repeat the selection and the write the next time the daily tip is displayed, so that the same tip is selected again on that Local_Date.

### Requirement 42: Interactive board

**User Story:** As the Owner, I want a touch-friendly chessboard, so that I can play through positions, puzzles and openings.

#### Acceptance Criteria

1. THE Chess_Module SHALL provide a board that accepts a move by dragging a piece from its origin square to a target square, and by tapping the origin square and then the target square. Tapping the selected piece again SHALL deselect it, tapping another piece of the side allowed to move SHALL select that piece instead, and tapping any other square that is not a legal target SHALL deselect the piece without a move.
2. THE Chess_Module SHALL accept only moves that chess.js reports as legal in the current position, and only for the side allowed to move on the current screen: the side to move on the free board, and only the Owner's side in the Puzzle_Trainer and the Opening_Trainer.
3. IF the Owner attempts an illegal move or moves a piece of a side that is not allowed to move, THEN THE Chess_Module SHALL return the piece to its origin square and leave the position, the move list and the redo list unchanged, with no error message.
4. WHEN the Owner moves a pawn to the last rank, THE Chess_Module SHALL show a promotion picker offering queen, rook, bishop and knight, and SHALL complete the move with the chosen piece. IF the Owner dismisses the picker without choosing, THEN THE Chess_Module SHALL cancel the move and leave the position unchanged.
5. THE Chess_Module SHALL highlight the origin and target squares of the last move played, and, WHILE a piece is selected or being dragged, every legal target square of that piece.
6. THE Chess_Module SHALL draw the board as a square with 8 equal square cells whose side length in CSS px is the largest whole number that fits both the content width and the available height inside the safe-area insets, so that all 64 squares are visible without scrolling in portrait and landscape orientation.
7. THE Chess_Module SHALL provide a free board screen with these controls: "Undo" takes back the last move; "Redo" replays the last undone move; any new move after an Undo empties the redo list; "Reset" sets the standard start position and empties the move list and the redo list; "Flip" turns the board 180° without changing the position. "Undo" SHALL be disabled when the move list is empty and "Redo" when the redo list is empty.
8. THE free board screen SHALL load a position from FEN text of at most 100 characters, and a game from PGN text of at most 100,000 characters. Loading a FEN SHALL set that position and empty the move list and the redo list. Loading a PGN SHALL set the move list to the PGN main line (comments and variations ignored), show its final position, and empty the redo list, so that "Undo" steps back through the game.
9. IF the Owner loads FEN or PGN text that is empty after trimming whitespace, longer than the limit of criterion 8, or rejected by chess.js, THEN THE Chess_Module SHALL show the parse error (the chess.js error message, or "Enter a FEN or PGN" for empty text, or the length limit), keep the current position, the move list and the redo list unchanged, and keep the entered text in the input.
10. FOR ALL sequences of 0 to 200 legal moves played from the start position (generated by random legal playouts) and all k from 0 to the sequence length, undoing k moves and then redoing k moves SHALL produce the same FEN and the same move list as before the undos (undo/redo round-trip property).

### Requirement 43: Chess.com ratings

**User Story:** As the Owner, I want my current Chess.com ratings in the app, so that I can track them next to my training.

#### Acceptance Criteria

1. WHEN the Chess_Module refreshes ratings (on the schedule of Requirement 65 criterion 2, or when the Owner taps "Retry"), THE ChessCom_Client SHALL send one request to `/pub/player/{username}/stats` with the stored username in lowercase, following Requirement 46.
2. WHEN the stats request returns HTTP 200 with a JSON body, THE Chess_Module SHALL, in one Local_Database write, replace all five stored values with `chess_rapid.last.rating`, `chess_blitz.last.rating`, `chess_bullet.last.rating`, `tactics.highest.rating` and `tactics.lowest.rating` from that response, and store the time of the response as the time of the last successful refresh.
3. THE Chess_Module SHALL treat a rating value as absent when it is missing, null, not a finite number, or outside 0 to 4000, and SHALL round a non-integer value to the nearest whole number before storing it.
4. WHILE a rating category is absent from the stored values, including before the first successful refresh, THE Chess_Module SHALL show "No rating" for that category.
5. THE Chess_Module SHALL show the stored ratings with an age label stating the time since the last successful refresh, as Requirement 65 criterion 1 defines, and SHALL refresh them in the background as Requirement 65 criteria 2 to 4 define.
6. IF the stats request returns HTTP 404 or HTTP 410, THEN THE Chess_Module SHALL keep the stored ratings, show "Chess.com user not found" with a link to the Chess section of the Settings_Screen, and leave the time of the last successful refresh unchanged.
7. IF the stats request fails for any other reason listed in Requirement 46 (offline, network error, timeout, HTTP 429 after retries, HTTP 5xx or another non-200 status, or a body that is not JSON), THEN THE Chess_Module SHALL keep the stored ratings and their age label, and show the "Couldn't refresh" indicator of Requirement 65 criterion 4, or the offline message of Requirement 1 criterion 5 when the device is offline.
8. IF the Local_Database write of criterion 2 fails, THEN THE Chess_Module SHALL keep the previously stored ratings and refresh time, show them on screen, and handle the failure as Requirement 3 criterion 5 specifies.

### Requirement 44: Incremental game sync

**User Story:** As the Owner, I want my Chess.com games downloaded without duplicates, so that history and analysis are complete and correct.

#### Acceptance Criteria

1. WHEN Game_Sync runs, THE ChessCom_Client SHALL first request `/pub/player/{username}/games/archives` with the stored username in lowercase, and SHALL read each entry of the `archives` array whose last two path segments are a four-digit year and a two-digit month (01–12) as one archive month. Entries that do not match SHALL be ignored. THE ChessCom_Client SHALL then request the path `/pub/player/{username}/games/{YYYY}/{MM}` of every archive month selected by criterion 2, in ascending month order, one at a time (Requirement 46 criterion 1).
2. THE Game_Sync SHALL select for download every archive month that is not marked complete for the stored username, and SHALL always select the current month (the month of the current UTC date) when it is listed and the latest listed month in which a Game_Record of that username is stored.
3. WHEN the Game_Sync has processed every game of a downloaded archive month under criteria 5 to 9, and that archive response was received more than 24 hours after the end of that month in UTC, THE Game_Sync SHALL mark the month complete for the stored username. Months marked complete are not downloaded again except under criterion 2.
4. THE Game_Sync SHALL store for each game: the Idempotency_Key (Requirement 11 criterion 4), `uuid`, `url`, `pgn`, `time_class`, `time_control`, `end_time` (Unix seconds), `rated`, the `username`, `rating` and `result` of both `white` and `black`, the opening URL `eco`, the username the game was synced for, the Owner's colour (criterion 7) and the Owner's result (criterion 8).
5. THE Game_Sync SHALL store only games whose `rules` value is `chess`, and SHALL skip games with any other `rules` value without counting them as errors.
6. IF a game with `rules` = `chess` has no Idempotency_Key (Requirement 11 criterion 7), has an `end_time` that is not a finite number, or lacks a `white` or `black` username, THEN THE Game_Sync SHALL skip that game, continue with the remaining games, and add it to the skipped count shown when the sync ends.
7. THE Game_Sync SHALL set the Owner's colour to white when `white.username` equals the synced username ignoring ASCII letter case, and to black when `black.username` does. IF neither username matches, THEN THE Game_Sync SHALL skip the game as in criterion 6.
8. THE Game_Sync SHALL map the Owner's Chess.com result code to win (`win`), loss (`checkmated`, `resigned`, `timeout`, `abandoned`, `lose`, `bughousepartnerlose`) or draw (`agreed`, `repetition`, `stalemate`, `insufficient`, `50move`, `timevsinsufficient`). Any other code SHALL be stored as result "unknown", shown as "?" in the game list, and excluded from every win, loss, draw and score count (Requirements 54 and 59).
9. THE Game_Sync SHALL insert or update each game by its Idempotency_Key (Requirement 11 criteria 2 and 4). An update SHALL replace the stored Chess.com fields of criterion 4 with the downloaded values and keep the Game_Record's primary key and its Analysis_Cache entries.
10. IF a game's PGN is empty or chess.js cannot parse it, THEN THE Game_Sync SHALL store the Game_Record with a "PGN unreadable" flag. THE Game_Viewer SHALL show "This game's moves could not be read." for that game, and THE Game_Analyzer SHALL not offer analysis for it.
11. THE Game_Sync SHALL write the games of one archive month in one Local_Database transaction, so that each month is stored completely or not at all.
12. IF the Game_Sync stops before every selected month is processed, because a request fails after the handling of Requirement 46, a Local_Database write fails, or the App is closed or moved to the background, THEN THE Game_Sync SHALL keep the Game_Records of every month whose transaction committed, leave each unprocessed month not complete, leave the time of the last successful Game_Sync unchanged, and show an error stating the cause, the months processed out of months to process, and a "Retry" action. The next run SHALL download the unprocessed months under criterion 2.
13. WHEN every selected month has been processed, THE Game_Sync SHALL store the current time as the time of the last successful Game_Sync and show a Toast "Synced: N new games", where N is the number of Game_Records created (not updated) in that run, followed by ", M skipped" when M ≥ 1 games were skipped under criteria 6 and 7.
14. IF the archives request returns HTTP 200 with an empty `archives` array, THEN THE Game_Sync SHALL store the time of the last successful Game_Sync, store nothing else, and show "No games found for {username} on Chess.com". IF the archives request returns HTTP 404 or HTTP 410, THEN THE Game_Sync SHALL stop, store nothing, and show "Chess.com user not found".
15. WHEN the Owner opens the Chess_Module while the device is online, no Game_Sync is running, and no successful Game_Sync exists or the last successful Game_Sync is more than 6 hours old (Requirement 65 criterion 2), THE Game_Sync SHALL start in the background.
16. THE Chess_Module SHALL provide a "Sync games" action, also reachable through the Command_Menu entry "Sync chess games", that starts Game_Sync. WHILE a Game_Sync is running, THE Chess_Module SHALL show progress as "Syncing month N of M", where M is the number of months selected by criterion 2 and N the number processed so far, and further taps on "Sync games" SHALL start no second Game_Sync. WHILE the device is offline, "Sync games" SHALL be disabled as Requirement 1 criterion 5 specifies.
17. FOR ALL sets of 0 to 24 mocked monthly archive responses with 0 to 50 games each, including games with `rules` other than `chess`, games with an empty `uuid` and a non-empty URL, games with neither, and the same game repeated in two months with identical content, running Game_Sync twice SHALL produce the same stored Game_Records, compared field by field, as running Game_Sync once (idempotence property).
18. FOR ALL sets of mocked monthly archive responses generated as in criterion 17 and all permutations of the month processing order, THE Game_Sync SHALL produce the same stored Game_Records, compared field by field (confluence property).
19. FOR ALL sets of mocked monthly archive responses generated as in criterion 17, the number of stored Game_Records SHALL equal the number of distinct Idempotency_Keys among the games with `rules` = `chess` that criteria 6 and 7 do not skip (no-duplicates property).

### Requirement 45: Game list, game viewer and rating history

**User Story:** As the Owner, I want to browse and replay my games and see my rating over time, so that I can review my play.

#### Acceptance Criteria

1. THE Chess_Module SHALL list Game_Records sorted by `end_time` from newest to oldest, with equal `end_time` values sorted by Idempotency_Key ascending. Each row SHALL show the Local_Date of `end_time`, the time class, the Owner's colour, the Owner's result ("Win", "Loss", "Draw" or "?"), the opponent's username and rating, the opening name (criterion 2), and the analysis status: "Not analysed", "Analysing", "Analysed", "Outdated" (Requirement 60 criterion 3) or "Cannot analyse" (Requirement 44 criterion 10).
2. THE Chess_Module SHALL derive the opening name from the last path segment of the `eco` URL by percent-decoding it and replacing every "-" with a space (for example `https://www.chess.com/openings/Caro-Kann-Defense` gives "Caro Kann Defense"). IF the `eco` URL is missing or its last path segment is empty, THEN THE Chess_Module SHALL use "Unknown opening".
3. THE Chess_Module SHALL let the Owner filter the game list by time class (all, rapid, blitz, bullet, daily), result (all, win, loss, draw), colour (all, white, black) and opening name (all, or one opening name present in the stored Game_Records, listed alphabetically). The list SHALL show exactly the Game_Records that satisfy every selected filter, in the order of criterion 1.
4. IF no Game_Record is stored, THEN THE Chess_Module SHALL show an empty-state message with the "Sync games" action of Requirement 44 criterion 16. IF Game_Records are stored but none matches the filters, THEN THE Chess_Module SHALL show "No games match" with a "Clear filters" action that resets every filter to "all".
5. WHEN the Owner opens a Game_Record with a readable PGN, THE Game_Viewer SHALL show the start position with the Owner's colour at the bottom of the board, "First", "Previous", "Next" and "Last" controls, and a move list in which tapping a move shows the position after that move. "First" and "Previous" SHALL be disabled at the start position, and "Next" and "Last" at the final position.
6. WHERE the PGN contains `[%clk H:MM:SS]` or `[%clk H:MM:SS.s]` comments and the time class is not daily, THE Game_Viewer SHALL show both players' remaining clock time at the shown position. For each player this is the clock value recorded with that player's latest move up to the shown position, or the base time of `time_control` before that player's first move. Clock times SHALL be truncated to whole seconds and formatted M:SS below 1 hour and H:MM:SS from 1 hour.
7. WHERE a Game_Report exists for the game (current or outdated), THE Game_Viewer SHALL mark each Owner move labelled inaccuracy, mistake or blunder (Requirement 56) in the move list with a label naming the class, and SHALL show the Engine's best move in SAN when the Owner selects a marked move.
8. THE Chess_Module SHALL show a rating history chart per time class (rapid, blitz, bullet, daily; default rapid) with one point per rated Game_Record of that time class, placed at its `end_time` and valued at the Owner's rating recorded in that game. Unrated Game_Records SHALL not be plotted. The chart SHALL offer the ranges 1 month, 3 months (default), 1 year and all time, with month ranges computed as in Requirement 25 criterion 4.
9. IF the selected time class has fewer than 2 rated Game_Records, THEN THE Chess_Module SHALL show "Play at least 2 rated games in this time class to see a chart" in place of the chart. IF it has 2 or more but the selected range contains none, THEN THE Chess_Module SHALL show a message saying that no games fall in the selected range, and keep the time class and range selectors available.

### Requirement 46: Chess.com network access and CORS proxy

**User Story:** As the Owner, I want Chess.com requests to work reliably from the phone, so that sync does not fail because of browser restrictions or rate limits.

#### Acceptance Criteria

1. THE ChessCom_Client SHALL send at most one request to Chess.com (directly or through the CORS_Proxy) at a time, and SHALL queue further requests and send them in the order they were made.
2. IF Chess.com returns HTTP 429, THEN THE ChessCom_Client SHALL retry the same request up to 3 times, waiting 1 second before the first retry, 2 seconds before the second and 4 seconds before the third. IF the third retry also returns HTTP 429, THEN THE ChessCom_Client SHALL report "Chess.com is limiting requests. Try again later."
3. THE ChessCom_Client SHALL abort each attempt that has not received a complete response within 15 seconds of being sent, SHALL not retry it automatically, and SHALL report "Chess.com did not respond. Try again later."
4. IF Chess.com returns HTTP 5xx, THEN THE ChessCom_Client SHALL not retry automatically and SHALL report "Chess.com is unavailable (HTTP {status}). Try again later." IF Chess.com returns HTTP 404 or HTTP 410, THEN THE ChessCom_Client SHALL report "Chess.com user not found". IF a response with HTTP 200 has a body that is not JSON, THEN THE ChessCom_Client SHALL report "Chess.com sent an unreadable response."
5. THE ChessCom_Client SHALL send each request first to `https://api.chess.com` directly, as a GET request with credentials omitted and with no headers or query parameters other than those needed for the path, so that the request carries only the data that Requirement 3 criterion 2 allows.
6. WHILE the device reports no network connection, THE ChessCom_Client SHALL send no request and THE Chess_Module SHALL show the offline message of Requirement 1 criterion 5.
7. IF a direct request fails with a network or CORS error while the device reports a network connection and a CORS_Proxy URL is stored, THEN THE ChessCom_Client SHALL send the same request once to the stored proxy URL (without a trailing "/") followed by the same path, and SHALL send every later request of the App run through the CORS_Proxy. Changing or clearing the proxy URL in the Settings_Screen SHALL make the next request go directly to Chess.com first again.
8. IF a request through the CORS_Proxy fails with a network or CORS error, THEN THE Chess_Module SHALL show the offline message of Requirement 1 criterion 9 followed by "If you are online, check the CORS proxy URL in Settings." with a link to the Chess section of the Settings_Screen.
9. IF a direct request fails with a network or CORS error while the device reports a network connection and no CORS_Proxy URL is stored, THEN THE Chess_Module SHALL show "Could not reach Chess.com. You may be offline, or this browser blocks direct requests to Chess.com and a CORS proxy is needed." with a link to the CORS_Proxy setup instructions of criterion 11.
10. THE CORS_Proxy SHALL forward a request to `https://api.chess.com` with the same path and query only when the method is GET and the normalised path starts with `/pub/`. It SHALL return the upstream status code and body unchanged with an `Access-Control-Allow-Origin` header set to the App origin configured at deployment, and SHALL answer every other method or path, including paths that leave `/pub/` after normalisation of "..", with HTTP 403 and no upstream request.
11. THE repository SHALL contain the CORS_Proxy source code, tests for criterion 10 (a forwarded `/pub/` GET, a rejected POST, and a rejected path outside `/pub/`), and step-by-step instructions for deploying the CORS_Proxy on the Cloudflare Workers free tier and entering its URL in the Settings_Screen.

### Requirement 47: Puzzle data build

**User Story:** As the Owner, I want a bundled set of puzzles at my level, so that I can train offline.

#### Acceptance Criteria

1. THE Puzzle_Build_Script SHALL read the Lichess puzzle database CSV (columns PuzzleId, FEN, Moves, Rating, RatingDeviation, Popularity, NbPlays, Themes) and keep as candidates the rows with an integer Rating from 700 to 1600 inclusive, Popularity greater than or equal to the minimum popularity parameter (default 80), and NbPlays greater than or equal to the minimum plays parameter (default 500).
2. IF a row has a missing PuzzleId, a FEN or Rating that cannot be parsed, a RatingDeviation that is not a positive number, or fewer than 2 moves, THEN THE Puzzle_Build_Script SHALL exclude that row and count it under the reason "malformed row".
3. THE Puzzle_Build_Script SHALL replay every candidate with chess.js from its FEN, playing each UCI move including its promotion letter, and SHALL exclude each candidate whose FEN is rejected or any of whose moves is illegal, counting it under the reason "illegal moves". Replay SHALL happen before the selection of criterion 4.
4. THE Puzzle_Build_Script SHALL select at most 10,000 Puzzles spread evenly across the 9 rating buckets 700–799, 800–899, …, 1400–1499 and 1500–1600 (the last bucket includes 1600). Each bucket SHALL contribute at most ⌊10,000 / 9⌋ = 1,111 Puzzles, chosen by Popularity descending, then NbPlays descending, then PuzzleId ascending. A bucket with fewer valid candidates SHALL contribute all of them, and its unused share SHALL not be given to other buckets.
5. THE Puzzle_Build_Script SHALL write one puzzle data file listing the selected Puzzles sorted by rating ascending and then id ascending, each with id, FEN, solution moves as a list of UCI strings (the first move is the opponent's move of Requirement 48 criterion 1), rating, rating deviation and themes (the Themes column split on spaces).
6. WHEN the Puzzle_Build_Script finishes, it SHALL print the number of rows read, the number of Puzzles written per bucket, and the number of rows excluded per reason.
7. FOR ALL runs of the Puzzle_Build_Script with byte-identical input and identical parameters, THE Puzzle_Build_Script SHALL produce a byte-identical puzzle data file (determinism property).
8. IF the gzip-compressed puzzle data file (compression level 9) is larger than 3 MB (3,145,728 bytes), or the input file is missing or unreadable, THEN THE Puzzle_Build_Script SHALL print the reason, exit with a non-zero status, and leave the previously generated puzzle data file unchanged.
9. THE Service_Worker SHALL precache the puzzle data file as part of the App_Shell (Requirement 1 criterion 3), so that the Puzzle_Trainer works offline.
10. IF the App cannot load or parse the puzzle data file, THEN THE Puzzle_Trainer SHALL show "Puzzles could not be loaded." with a "Retry" action, store no attempt, leave the Puzzle_Rating unchanged, and keep every other chess feature available.

### Requirement 48: Puzzle solving

**User Story:** As the Owner, I want to solve puzzles with feedback and hints, so that I improve my tactics.

#### Acceptance Criteria

1. WHEN a Puzzle starts, THE Puzzle_Trainer SHALL load the Puzzle FEN, orient the board with the side that is not to move in the FEN (the Owner's side) at the bottom, and play the first solution move as the opponent's move 300 ms after the board is shown. The Owner SHALL be unable to move until that move has been played.
2. WHEN the Owner plays a move whose origin square, target square and promotion piece (for promotions) equal the next expected solution move, THE Puzzle_Trainer SHALL accept the move.
3. WHEN the Owner plays a legal move that is not the expected move but delivers checkmate, THE Puzzle_Trainer SHALL accept the move and mark the Puzzle solved.
4. WHEN the Owner's move is accepted and solution moves remain, THE Puzzle_Trainer SHALL play the next opponent solution move 300 ms after the Owner's move.
5. WHEN the Owner's move is accepted and no solution moves remain, THE Puzzle_Trainer SHALL mark the Puzzle solved and show "Solved" with a "Next puzzle" action.
6. WHEN the Owner plays a legal move that criteria 2 and 3 do not accept, THE Puzzle_Trainer SHALL mark the attempt as failed, show the move as wrong, return the board to the position before the move within 500 ms, and offer "Try again" and "Show solution". "Try again" SHALL let the Owner play again from that position. Illegal moves are handled by Requirement 42 criterion 3 and do not fail the attempt.
7. WHEN the Owner taps "Hint" for the first time before an Owner move, THE Puzzle_Trainer SHALL highlight the origin square of the expected move, and WHEN the Owner taps "Hint" a second time before the same move, THE Puzzle_Trainer SHALL show the expected move as an arrow. Further taps before the same move SHALL have no effect. The hint level SHALL start again at the first level for each later Owner move. The number of hints used SHALL be the number of "Hint" taps that had an effect.
8. WHEN the Owner taps "Show solution", THE Puzzle_Trainer SHALL play every remaining solution move, both sides, one at a time at 500 ms intervals, and then end the Puzzle as not solved.
9. THE Puzzle_Trainer SHALL score the first attempt at each Puzzle as 1 when the Owner solves the Puzzle with no failed move, no hint and no shown solution, and as 0 otherwise. The score is decided at the first of these events: the Puzzle is solved (score 1), or the first failed move, first effective hint or "Show solution" occurs (score 0).
10. THE Puzzle_Trainer SHALL treat an attempt as rated only when no attempt with the same Puzzle id is stored, and SHALL update the Puzzle_Rating (Requirement 49) only for rated attempts. Later attempts, including "Try again" and the review of Requirement 50 criterion 3, SHALL be stored as unrated and leave the Puzzle_Rating unchanged.
11. WHEN the score of an attempt is decided under criterion 9, THE Puzzle_Trainer SHALL store, in one Local_Database transaction, the attempt with the Puzzle id, the timestamp, the score, the hints used so far, the rated flag, the Puzzle_Rating (rating, rating deviation, volatility) before and after, and the Idempotency_Key of the attempt (Requirement 11 criterion 1), together with the updated Puzzle_Rating for a rated attempt. Repeated submissions with the same Idempotency_Key SHALL store one attempt and update the Puzzle_Rating once.
12. IF the Owner leaves a Puzzle, or the App is closed or reloaded, before the score of the attempt is decided, THEN THE Puzzle_Trainer SHALL store no attempt and leave the Puzzle_Rating unchanged, and the Puzzle SHALL stay unattempted.
13. IF the transaction of criterion 11 fails, THEN THE Puzzle_Trainer SHALL leave the stored attempts and the Puzzle_Rating unchanged, show an error Toast stating that the result was not saved with a "Retry" action that repeats the transaction with the same Idempotency_Key, and let the Owner continue the Puzzle on screen.

### Requirement 49: Glicko-2 puzzle rating

**User Story:** As the Owner, I want an accurate in-app puzzle rating, so that puzzle difficulty follows my real level.

#### Acceptance Criteria

1. THE Glicko2_Calculator SHALL implement the Glicko-2 algorithm as published by Glickman ("Example of the Glicko-2 system"), with the scale factor 173.7178, system constant τ = 0.5, and the Illinois iteration for the new volatility with convergence tolerance ε = 0.000001. THE Glicko2_Calculator SHALL accept a rating period with 1 or more games and SHALL keep every value unrounded.
2. WHEN the first Puzzle attempt is about to be scored and no Puzzle_Rating is stored, THE Chess_Module SHALL initialise the Puzzle_Rating to rating = the Chess_Rating at that moment, rating deviation = 350 and volatility = 0.06. Later changes of the Chess_Rating SHALL leave the Puzzle_Rating unchanged.
3. WHEN the score of a rated attempt is decided (Requirement 48 criterion 9), THE Glicko2_Calculator SHALL update the Puzzle_Rating as one rating period containing one game against an opponent with the Puzzle's rating and rating deviation, with score 1 or 0 as decided. THE Glicko2_Calculator SHALL apply no rating-deviation increase for time that passes without attempts.
4. THE Chess_Module SHALL clamp the Puzzle_Rating rating deviation to the range 60 to 350 inclusive after each update, with both bounds defined in the Chess_Module constants file.
5. WHEN a player with rating 1500, rating deviation 200 and volatility 0.06 plays one rating period with a win against (1400, 30), a loss against (1550, 100) and a loss against (1700, 300), THE Glicko2_Calculator SHALL return a rating within 0.01 of 1464.06, a rating deviation within 0.01 of 151.52 and a volatility within 0.00001 of 0.05999, before the clamp of criterion 4 (reference example from Glickman's paper).
6. FOR ALL ratings from 100 to 3000, rating deviations from 60 to 350, volatilities from 0.03 to 0.1, opponent ratings from 100 to 3000 and opponent rating deviations from 30 to 500, a one-game rating period with score 1 SHALL produce a new rating strictly greater than the old rating and a period with score 0 SHALL produce a new rating strictly lower than the old rating (direction property).
7. FOR ALL inputs in the ranges of criterion 6 and both scores, THE Glicko2_Calculator SHALL return a finite rating, a finite rating deviation that lies within 60 to 350 after the clamp of criterion 4, and a finite volatility greater than 0, and the volatility iteration SHALL terminate within 100 iterations (validity property).
8. THE Chess_Module SHALL display the Puzzle_Rating rating rounded to a whole number, and SHALL label it "provisional" WHILE the unrounded rating deviation is greater than 110. WHILE no Puzzle_Rating is stored, THE Chess_Module SHALL show "—" in place of the Puzzle_Rating.

### Requirement 50: Puzzle selection, themes and statistics

**User Story:** As the Owner, I want puzzles near my rating and practice by theme, so that training is neither too easy nor too hard.

#### Acceptance Criteria

1. WHEN the Owner requests the next Puzzle, THE Puzzle_Trainer SHALL choose uniformly at random among the unattempted Puzzles of the pool (Puzzles with no stored attempt) whose rating r satisfies |r − R| ≤ w, where R is the unrounded Puzzle_Rating rating (or the Chess_Rating while no Puzzle_Rating is stored) and w is the smallest value in the sequence 100, 200, 300, … for which at least one unattempted Puzzle of the pool qualifies. The random source SHALL be injectable so that tests can fix it.
2. WHERE the Owner has chosen one or more themes (from the theme list or through Requirement 59 criterion 6), THE Puzzle_Trainer SHALL use as the pool of criterion 1 only the Puzzles tagged with at least one chosen theme. Otherwise the pool is every bundled Puzzle.
3. IF every Puzzle in the pool has been attempted, THEN THE Puzzle_Trainer SHALL offer a review, in random order, of the Puzzles of the pool whose rated attempt has score 0, as unrated practice (Requirement 48 criterion 10). IF no such Puzzle exists, THEN THE Puzzle_Trainer SHALL show "You have solved every puzzle in this set."
4. THE Puzzle_Trainer SHALL show, for each theme with at least one rated attempt, the number of rated attempts, the number of rated attempts with score 1, and the accuracy = 100 × (score-1 attempts) / (rated attempts) rounded to a whole percent. Unrated attempts SHALL not count.
5. THE Puzzle_Trainer SHALL count each rated attempt toward every theme of its Puzzle.
6. THE Puzzle_Trainer SHALL list the themes with at least 5 rated attempts ordered by unrounded accuracy ascending, then by number of rated attempts descending, then by theme name ascending, each with a "Practice" action that starts theme practice (criterion 2) for that theme.
7. THE Puzzle_Trainer SHALL show a Puzzle_Rating history chart with one point per rated attempt, placed at the attempt timestamp and valued at the rating after the attempt rounded to a whole number. IF fewer than 2 rated attempts are stored, THEN THE Puzzle_Trainer SHALL show "Solve at least 2 puzzles to see a chart" in place of the chart, and IF no rated attempt is stored, THEN the theme statistics of criteria 4 and 6 SHALL be replaced by "Solve puzzles to see theme statistics".

### Requirement 51: Opening repertoire

**User Story:** As the Owner, I want a starter repertoire I can edit, so that I learn openings that fit my level.

#### Acceptance Criteria

1. THE Opening_Trainer SHALL ship a starter Repertoire with four trees, each starting from the standard start position: Italian Game / Giuoco Piano for White (1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5 4.c3), London System for White (1.d4 with Bf4), Caro-Kann Defence for Black (1.e4 c6), and Italian Game / Two Knights Defence for Black (1.e4 e5 2.Nf3 Nc6 3.Bc4 Nf6).
2. THE starter Repertoire SHALL give each tree a main line of at least 16 plies (8 moves by each side), and SHALL give each of the first 3 positions on that main line where the opponent is to move at least 2 opponent replies, chosen as the most common replies at authoring time. A test SHALL check the ply count and the reply counts.
3. THE Opening_Trainer SHALL let each move in a tree carry an optional explanation of 1 to 300 characters after leading and trailing whitespace is removed. IF the Owner saves a longer explanation, THEN THE Opening_Trainer SHALL store nothing, show the 300-character limit, and keep the entered text.
4. THE Opening_Trainer SHALL let the Owner: add a move at any position of a tree by playing it on the board; delete a branch (a move and every move after it); edit explanations; create a tree with a name of 1 to 60 characters after trimming and a colour; rename a tree under the same name rule; delete a tree; and reset to the starter Repertoire. Deleting a branch, deleting a tree and resetting SHALL each show an Undo_Toast for 6 seconds (Requirement 64). Resetting SHALL first show a confirmation stating that every tree and its review history will be replaced, and SHALL change nothing if the Owner cancels.
5. THE Opening_Trainer SHALL accept only moves that chess.js reports as legal when editing a tree (Requirement 42 criterion 2).
6. THE Opening_Trainer SHALL key each Repertoire_Position by its colour and the first four fields of its FEN (piece placement, side to move, castling rights, en passant square), with the en passant field set to "-" unless an en passant capture is legal in the position, so that transpositions within one colour share one Repertoire_Position and one SRS state.
7. THE Opening_Trainer SHALL keep at most one expected Owner move per Repertoire_Position, across all trees of that colour.
8. WHEN the Owner adds an Owner move at a Repertoire_Position that already has a different expected move, THE Opening_Trainer SHALL show a confirmation that names the existing move, the trees of that colour that contain the position, and the number of moves that will be removed. On confirm, THE Opening_Trainer SHALL replace the existing move and the moves after it with the new move at every occurrence of that Repertoire_Position in that colour's trees, and show an Undo_Toast for 6 seconds (Requirement 64). On cancel, THE Opening_Trainer SHALL make no change.
9. FOR ALL sequences of 1 to 100 edit operations (add move, delete branch, replace under criterion 8, delete tree, reset, and Undo of each) applied to generated repertoires, every move in every tree SHALL be legal from its parent position, and every Repertoire_Position SHALL have at most one expected Owner move across the trees of its colour (repertoire invariant).
10. IF a Local_Database write for any change of criteria 3, 4 or 8 fails, THEN THE Opening_Trainer SHALL leave the stored Repertoire and SRS states unchanged and handle the failure as Requirement 63 criterion 2 specifies.
11. IF no tree is stored, THEN THE Opening_Trainer SHALL show an empty-state message with "Create tree" and "Reset to starter repertoire" actions.

### Requirement 52: Opening learn and drill modes

**User Story:** As the Owner, I want to learn lines and then drill them from memory, so that I remember my openings in real games.

#### Acceptance Criteria

1. WHILE in learn mode, THE Opening_Trainer SHALL step through the lines of the chosen tree (a line is a path from the root to a leaf, taken in depth-first order with earlier-added moves first), play each opponent move 300 ms after the previous move, show each move's explanation, and show the expected Owner move as an arrow before the Owner plays it. IF the Owner plays another move, THEN THE Opening_Trainer SHALL return the piece as in Requirement 42 criterion 3 and keep the arrow. Learn mode SHALL change no SRS state.
2. WHILE in drill mode, THE Opening_Trainer SHALL play the opponent moves from the tree 300 ms after the previous move, show no arrows, and require the Owner to play the expected move at each Repertoire_Position.
3. WHILE in drill mode and the current position has several opponent replies in the tree, THE Opening_Trainer SHALL choose uniformly at random among the replies after which the line still reaches at least one Repertoire_Position in the drill queue of criterion 7, and SHALL choose uniformly at random among all replies when no reply does. The random source SHALL be injectable so that tests can fix it.
4. WHILE in drill mode, THE Opening_Trainer SHALL grade each Repertoire_Position the Owner answers with SM-2 quality 5 when the first try is correct, 3 when the first try is wrong and the second try is correct, and 1 when the second try is wrong or the Owner taps "Show move". A Repertoire_Position SHALL be graded at most once per drill session, also when a transposition reaches it again.
5. WHEN the Owner's first try is wrong, THE Opening_Trainer SHALL return the board to the position before the move within 500 ms and allow one more try. WHEN the second try is wrong or the Owner taps "Show move", THE Opening_Trainer SHALL show the expected move as an arrow and continue after the Owner plays it.
6. WHEN each grade is given, THE Opening_Trainer SHALL store, in one Local_Database transaction, the updated SRS state of the Repertoire_Position (Requirement 53) and a review record with the Repertoire_Position key, the Local_Date and the quality q. IF that transaction fails, THEN THE Opening_Trainer SHALL leave the SRS state unchanged, show an error Toast stating that the review was not saved, and keep the Repertoire_Position in the drill queue.
7. THE Opening_Trainer SHALL build the drill queue of the current Local_Date from every Repertoire_Position whose due date is on or before today, ordered by due date ascending, then by tree creation order, then by ply depth ascending, followed by new Repertoire_Positions (never reviewed) in the same tree and depth order, limited so that at most 10 Repertoire_Positions receive their first review per Local_Date. The limit of 10 SHALL be a constant in the Chess_Module constants file.
8. WHEN a drilled line reaches a leaf of the tree, THE Opening_Trainer SHALL mark the line complete and offer the next line that reaches a Repertoire_Position still in the drill queue. WHEN no such line remains, or the Owner taps "End", the drill session ends.
9. WHEN a drill session ends, THE Opening_Trainer SHALL show the number of Repertoire_Positions graded in the session, the first-try accuracy as 100 × (grades with q = 5) / (grades) rounded to a whole percent (or "—" when no position was graded), and the next due date, which is the earliest due date among all Repertoire_Positions shown as a Local_Date, or "None" when no Repertoire_Position has a due date.
10. IF the drill queue is empty when the Owner opens drill mode, THEN THE Opening_Trainer SHALL show "Nothing due today", the next due date as in criterion 9, and a "Learn" action that opens learn mode.
11. IF the App is closed, reloaded or moved to the background during a drill session, THEN THE Opening_Trainer SHALL keep every grade stored under criterion 6, and every Repertoire_Position not yet graded SHALL stay in the drill queue.

### Requirement 53: SM-2 spaced repetition

**User Story:** As the Owner, I want reviews scheduled by spaced repetition, so that I review each position just before I would forget it.

#### Acceptance Criteria

1. THE SRS_Scheduler SHALL initialise each Repertoire_Position with easiness factor EF = 2.5, repetitions n = 0, interval I = 0 days and no due date.
2. WHEN a review has quality q ≥ 3, THE SRS_Scheduler SHALL set the new interval to 1 day when n = 0, to 6 days when n = 1, and to ⌈I × EF⌉ days when n ≥ 2, using the EF value before this review's update, capped at 36,500 days (a constant in the Chess_Module constants file), and then increase n by 1.
3. WHEN a review has quality q ≥ 3, THE SRS_Scheduler SHALL set EF to max(1.3, EF + 0.1 − (5 − q) × (0.08 + (5 − q) × 0.02)), so that q = 5 adds 0.1, q = 4 adds 0 and q = 3 subtracts 0.14.
4. WHEN a review has quality q < 3, THE SRS_Scheduler SHALL set n to 0 and the interval to 1 day, and leave EF unchanged.
5. THE SRS_Scheduler SHALL store EF as the integer E = EF × 100 and compute with integers only: E_new = max(130, E + 10 − (5 − q) × (8 + (5 − q) × 2)) and ⌈I × EF⌉ = ⌊(I × E + 99) / 100⌋, so that floating-point error cannot change EF or an interval.
6. THE SRS_Scheduler SHALL set the due date to the Local_Date of the review plus the new interval in calendar days.
7. IF the SRS_Scheduler receives a quality that is not an integer from 0 to 5, or a state that is not valid (a valid state has an integer E from 130 upward, an integer n from 0 upward, an integer I from 0 to 36,500, and I ≥ 1 whenever n ≥ 1), THEN THE SRS_Scheduler SHALL throw an error and return no new state, and the caller SHALL store nothing.
8. WHEN a new Repertoire_Position receives three reviews with q = 5, THE SRS_Scheduler SHALL produce intervals of 1, 6 and 17 days and EF values of 2.6, 2.7 and 2.8 (reference example).
9. FOR ALL valid states of criterion 7 with E from 130 to 400 and n from 0 to 20, and all sequences of 1 to 50 reviews with q from 0 to 5, EF SHALL stay at or above 1.3 and every interval SHALL be an integer from 1 to 36,500 (invariant).
10. FOR ALL valid states and all q from 0 to 2, the new interval SHALL be 1 day, n SHALL be 0 and EF SHALL be unchanged (reset property).
11. FOR ALL valid states, a review with q = 4 SHALL leave EF unchanged (fixed-point property).
12. FOR ALL sequences of 1 to 50 reviews that all have q from 3 to 5, starting from the initial state of criterion 1, the intervals SHALL be non-decreasing (monotonicity property).

### Requirement 54: Opening statistics and Chess.com link

**User Story:** As the Owner, I want to see how my openings perform in my real games, so that I know which lines to study.

#### Acceptance Criteria

1. THE Opening_Trainer SHALL show for each tree the first-try accuracy of the drill review records (Requirement 52 criterion 6) whose Local_Date is from today − 29 to today inclusive and whose Repertoire_Position occurs in the tree, computed as 100 × (records with q = 5) / (records) and rounded to a whole percent. A shared Repertoire_Position counts for every tree that contains it. IF a tree has no such record, THEN THE Opening_Trainer SHALL show "No drills in the last 30 days" for that tree.
2. THE Opening_Trainer SHALL show for each tree a mastery score equal to 100 × (Repertoire_Positions of the tree with an interval of at least 21 days) / (Repertoire_Positions of the tree), rounded to a whole percent, or "—" when the tree has no Repertoire_Position.
3. THE Chess_Module SHALL match each Game_Record with a readable PGN against the trees of the Owner's colour in that game. For each tree, the shared prefix length k is the number of plies obtained by following the game's moves from the tree root while each move exists in the tree. The game SHALL be matched to the tree with the largest k, choosing the earliest-created tree on a tie, and SHALL be matched to no tree when the largest k is 0.
4. FOR a matched game, THE Chess_Module SHALL record the exit ply k + 1 when the game has more than k plies, and the exit reason: "line ended" when the tree has no move after ply k, "Owner left" when ply k + 1 is an Owner move, and "opponent left" otherwise. A game with no more than k plies SHALL be recorded as "ended in repertoire" with no exit ply.
5. THE Chess_Module SHALL show, for each tree and for each Chess.com opening name (Requirement 45 criterion 2), the number of matched games and the score = 100 × (wins + 0.5 × draws) / (wins + draws + losses) rounded to a whole percent, with games of result "unknown" excluded from both. Rows SHALL be sorted by number of games descending and then by name ascending. A row with no counted game SHALL show "—" as the score.
6. THE Chess_Module SHALL list up to 10 Repertoire_Positions at which matched games have exit reason "Owner left", sorted by the number of such games descending and then by the latest `end_time` of those games descending, each with the number of games and a "Drill" action that opens drill mode (Requirement 52) on the lines of that tree that pass through the Repertoire_Position.
7. WHEN Game_Records are added or updated by Game_Sync, or a tree is edited, THE Chess_Module SHALL recompute criteria 3 to 6 before the statistics screen next renders.
8. FOR ALL generated repertoires with 1 to 4 trees per colour and all root-to-leaf lines of length k from 1 to 30 plies that no other tree of the same colour shares for k or more plies, a game of the Owner's colour whose first k plies equal the line and that continues past ply k SHALL be matched to that line's tree with exit ply k + 1 and exit reason "line ended" (matching property).
9. FOR ALL sets of 0 to 500 Game_Records with any mix of win, loss, draw and unknown results, every opening score, first-try accuracy and mastery score SHALL be either "—" or a value from 0 % to 100 % inclusive (bounds property).

### Requirement 55: Engine evaluation

**User Story:** As the Owner, I want my games evaluated by a real engine on the phone, so that mistakes are found without paid services.

#### Acceptance Criteria

1. THE Engine SHALL run single-threaded in a Web Worker, from files precached with the App_Shell so that analysis works offline, and SHALL search every position with a single principal variation to the fixed Analysis_Depth defined in one constant in the Chess_Module constants file (default 12).
2. WHEN the Game_Analyzer analyses a Game_Record with a readable PGN of P plies, THE Game_Analyzer SHALL evaluate each of the P + 1 positions from the start position to the final position once and store for each position, from the point of view of the side to move: the evaluation as an integer number of centipawns or as mate in n (n > 0 when the side to move mates, n < 0 when it is mated), the best move in UCI notation, and the first 3 moves of the principal variation (fewer when the principal variation is shorter).
3. WHEN a position is checkmate, THE Game_Analyzer SHALL store it as mated, which gives Win_Probability 0 to the side to move (Requirement 56 criterion 2), without calling the Engine.
4. WHEN chess.js reports a position as stalemate, insufficient material, threefold repetition (using the game's move history) or a draw under the 50-move rule, THE Game_Analyzer SHALL store it as a draw with Win_Probability 50, without calling the Engine.
5. WHILE an analysis runs, THE Chess_Module SHALL show progress as "N of T positions", where T = P + 1 and N counts the positions with a stored evaluation, including positions stored before an interruption. THE Engine search SHALL run only in the Web Worker, so that the App responds to taps during analysis within 100 ms.
6. WHEN the Owner taps "Cancel" during an analysis, THE Game_Analyzer SHALL stop the Engine search within 1 second, cancel every queued game, keep every evaluation already stored (Requirement 60 criterion 4), and show the game's status as "Not analysed".
7. THE Chess_Module SHALL let the Owner queue analysis of the N most recent Game_Records (by `end_time`) that have no Game_Report and a readable PGN, with N an integer from 1 to 50 (default 10), processed one game at a time from newest to oldest. When fewer than N such games exist, all of them SHALL be queued. When none exists, THE Chess_Module SHALL show "All synced games are analysed." WHILE an analysis runs, the queue action SHALL be disabled, so that repeated taps create one queue.
8. IF the Web Worker or the WASM file fails to load, or the Engine does not confirm it is ready within 10 seconds of starting, THEN THE Chess_Module SHALL show "The analysis engine could not start on this device." with a "Retry" action, start no analysis, keep every stored evaluation, and keep every other chess feature available.
9. IF the Web Worker reports an error during an analysis, or the Engine returns no best move within 60 seconds for one position, THEN THE Game_Analyzer SHALL terminate the Web Worker, start a new one, and evaluate that position again once. IF that second attempt also fails, THEN THE Game_Analyzer SHALL stop the analysis and the queue, keep every stored evaluation, and show "Analysis stopped: the engine stopped responding." with a "Retry" action.
10. WHEN the App becomes hidden during an analysis, THE Game_Analyzer SHALL pause the analysis. WHEN the App becomes visible again, THE Game_Analyzer SHALL restart the Web Worker if it no longer responds (without counting this as a failure under criterion 9) and continue the same game from the first position without a stored evaluation, then continue the queue.
11. IF the App is closed or reloaded during an analysis, THEN THE Game_Analyzer SHALL not restart the analysis by itself. WHEN the Owner next requests analysis of that game, THE Game_Analyzer SHALL continue from the first position without a stored evaluation.

### Requirement 56: Move classification by win probability

**User Story:** As the Owner, I want each move labelled by how much it lost, so that I see my inaccuracies, mistakes and blunders.

#### Acceptance Criteria

1. THE Move_Classifier SHALL compute Win_Probability for an evaluation of cp centipawns for the side to move as W(cp) = 50 + 50 × (2 / (1 + exp(−0.00368208 × cp)) − 1), unrounded.
2. THE Move_Classifier SHALL set W = 100 when the side to move has a forced mate (mate in n with n > 0), W = 0 when the side to move is being mated (n < 0) or is checkmated, and W = 50 for a position stored as a draw (Requirement 55 criterion 4).
3. THE Move_Classifier SHALL compute, for a move by player M, W_before = W of the position before the move (M to move), W_after = 100 − W of the position after the move (opponent to move), and drop = max(0, W_before − W_after), all unrounded.
4. THE Move_Classifier SHALL compare the unrounded drop with the thresholds and label a move a blunder when drop ≥ 15, a mistake when 10 ≤ drop < 15, an inaccuracy when 5 ≤ drop < 10, and give no label when drop < 5.
5. WHEN the played move equals the Engine's best move for the position before it (same origin square, target square and promotion piece), THE Move_Classifier SHALL give no label, whatever the drop.
6. IF the position before or after a move has no stored evaluation, THEN THE Move_Classifier SHALL give that move no label and report the move as not evaluated.
7. THE Move_Classifier SHALL define the thresholds 5, 10 and 15 in one constant in the Chess_Module constants file, and SHALL display Win_Probability values rounded to a whole percent.
8. FOR ALL integer cp from −5000 to 5000, W(0) SHALL equal 50 exactly, |W(−cp) − (100 − W(cp))| SHALL be at most 1e-9, 0 < W(cp) < 100 SHALL hold, and W(cp + 1) > W(cp) SHALL hold for cp up to 4999; and FOR ALL finite cp, 0 ≤ W(cp) ≤ 100 SHALL hold (formula properties).
9. FOR ALL pairs of drops d1 ≤ d2 from 0 to 100, generated to include the exact thresholds 5, 10 and 15 and values within 1e-9 of them, the label severity of d1 SHALL be less than or equal to the label severity of d2, where severity is 0 for no label, 1 for inaccuracy, 2 for mistake and 3 for blunder (monotonicity property).
10. FOR ALL pairs of evaluations (each an integer cp from −5000 to 5000, a mate in n with n from −30 to 30 and n ≠ 0, checkmated, or draw), the drop of criterion 3 SHALL lie from 0 to 100 inclusive (bounds property).

### Requirement 57: Mistake detectors

**User Story:** As the Owner, I want my mistakes explained by recognisable patterns, so that I understand why a move was bad.

#### Acceptance Criteria

1. THE Game_Analyzer SHALL assign each position a Game_Phase: endgame when the total number of queens, rooks, bishops and knights of both sides is at most 6; opening when the position is not an endgame and its full-move number is at most 12; middlegame otherwise. The Game_Phase of a move SHALL be the Game_Phase of the position before the move.
2. THE Mistake_Detectors SHALL evaluate only the Owner's moves and SHALL be pure functions of the move list, the stored evaluations, the Move_Classifier labels, the clock data, the time control and the Owner's result. In these criteria, a piece is defended when at least one piece of its own side attacks its square, piece values are the material values of the Conventions, and the king has no value. A detector that needs an evaluation or a label that is not stored SHALL stay silent for that move.
3. WHEN an Owner move is labelled mistake or blunder and the Engine's best move in the position after it captures an Owner piece of value 3 or more that, in that position, is undefended or has a higher value than the capturing piece, THE Mistake_Detectors SHALL report "hanging piece" on the Owner move.
4. WHEN an Owner move is labelled mistake or blunder and the Engine's best move in the position after it moves an opponent piece to a square from which that piece, after the move, attacks at least two targets, where a target is the Owner's king or an Owner piece of value 3 or more that is undefended or has a higher value than the attacking piece, THE Mistake_Detectors SHALL report "missed opponent fork" on the Owner move.
5. WHEN the evaluation of the position before an Owner move is not a forced mate against the Owner and the evaluation of the position after the move is a forced mate for the opponent, THE Mistake_Detectors SHALL report "missed opponent mate" on the Owner move.
6. WHEN an Owner move is labelled mistake or blunder and, in the position before it, the Engine showed either a forced mate for the Owner, or a best move that is a capture, a check or a fork (criterion 4 with the sides swapped) and whose evaluation is at least 200 centipawns better for the Owner than the evaluation after the played move (with the opponent's evaluation negated to the Owner's point of view), THE Mistake_Detectors SHALL report "missed own tactic" on the Owner move. For this comparison a mate for the Owner SHALL count as +10,000 centipawns and a mate against the Owner as −10,000 centipawns.
7. WHEN the Owner makes the Owner's 12th move, the Owner has made no castling move in moves 1 to 12, and the Owner's king stands on its starting square (e1 for White, e8 for Black) after that move, THE Mistake_Detectors SHALL report "delayed castling" once, on that move. A game that ends before the Owner's 12th move SHALL get no "delayed castling" detection.
8. WHEN the Owner makes a queen move that is not a capture within the Owner's first 5 moves, THE Mistake_Detectors SHALL report "early queen" once per game, on the first such move.
9. WHEN an Owner move whose Game_Phase is endgame is labelled mistake or blunder, THE Mistake_Detectors SHALL report "endgame technique" on that move. WHEN the Owner's Win_Probability at the first endgame position of the game (100 − W when the opponent is to move there) is at least 75 and the Owner's result is draw or loss, THE Mistake_Detectors SHALL also report "endgame technique" once, on the Owner's first move in the endgame phase, unless that move already has this detection.
10. WHERE the move carries a `[%clk]` value and the time class is not daily, WHEN an Owner move labelled mistake or blunder has a `[%clk]` value below 10 % of the base time of `time_control` (the number of seconds before any "+"), THE Mistake_Detectors SHALL report "time pressure" on that move.
11. THE Mistake_Detectors SHALL use the detector ids `hanging-piece`, `missed-opponent-fork`, `missed-opponent-mate`, `missed-own-tactic`, `delayed-castling`, `early-queen`, `endgame-technique` and `time-pressure`, in this order, and SHALL record for each detection the detector id, the ply (1 = White's first move), the full-move number, the Game_Phase and a one-sentence explanation that names the pieces and squares involved.
12. FOR ALL games of 1 to 150 plies generated by random legal playouts, with randomly generated evaluations, labels and clock values and either Owner colour, every detection SHALL be on a ply of an Owner move, and running the Mistake_Detectors twice on the same input SHALL return identical detections (Owner-only invariant and determinism property).
13. THE test suite SHALL contain, for each detector, at least one fixed game position (FEN or PGN with fixed evaluations) where the detector fires and one where the detector stays silent.

### Requirement 58: Per-game report

**User Story:** As the Owner, I want a short report for each game, so that I learn the main lessons without reading every move.

#### Acceptance Criteria

1. WHEN every position of a Game_Record has a stored evaluation (Requirement 60 criterion 4), THE Game_Analyzer SHALL produce a Game_Report containing the counts of the Owner's moves labelled inaccuracy, mistake and blunder, every detection of Requirement 57, the key mistakes of criterion 2, the tips of criterion 4 and the Rating_Band used for those tips.
2. THE Game_Report SHALL select as key mistakes up to 3 Owner moves labelled mistake or blunder, taking the largest unrounded drops first and the earlier ply first on equal drops, and SHALL show them in ply order.
3. THE Game_Report SHALL show for each key mistake: the move number ("14." for a White move, "14…" for a Black move); the played move in SAN; the Owner's Win_Probability before and after the move rounded to whole percents; the better idea as the Engine's best move in SAN followed by the next moves of its principal variation, up to 3 moves in total; and the names of the detectors that fired on the move.
4. THE Game_Analyzer SHALL select tips from the Tips_Library band of the Chess_Rating at the time the Game_Report is produced: 3 tips when the game has at least one detection, otherwise 2. It SHALL first take tips tagged with a detector that fired in the game, taking detectors by number of detections in the game descending and then in the order of Requirement 57 criterion 11, and tips of one detector in Tips_Library order. It SHALL fill the remaining places with tips of the band that have no detector tag, then with any other tip of the band, in Tips_Library order. No tip SHALL appear twice in one Game_Report.
5. WHEN the Owner taps a key mistake, THE Game_Viewer SHALL open the game at the position before that move.
6. IF the game has no Owner move labelled mistake or blunder, THEN THE Game_Report SHALL state "No mistakes or blunders found" in place of the key mistakes and SHALL include the tips of criterion 4.
7. THE Game_Analyzer SHALL produce Game_Reports only from the Engine, the Move_Classifier, the Mistake_Detectors and the Tips_Library, with no AI service and no network request.
8. THE Game_Report SHALL keep the tips and Rating_Band stored when it was produced, so that a later change of the Chess_Rating does not change a stored Game_Report.

### Requirement 59: Cross-game recurring patterns

**User Story:** As the Owner, I want to see mistakes I repeat across games and practise them, so that I fix my biggest weaknesses.

#### Acceptance Criteria

1. THE Pattern_Report SHALL let the Owner choose the scope: the last 20, the last 50 or all Game_Records that have a Game_Report (current or outdated, Requirement 60 criterion 3), counted by `end_time` from newest, after applying a time class filter (all, rapid, blitz, bullet, daily; default all). The default scope is the last 20.
2. WHILE fewer than 5 Game_Records with a Game_Report are in the selected scope, THE Pattern_Report SHALL show "Analyse at least 5 games to see patterns (N analysed)", where N is the number in scope, and show no pattern.
3. THE Pattern_Report SHALL compute, for each detector d of Requirement 57 criterion 11 and each move-number bucket b (full moves 1–10, 11–20, 21–30, 31 and later, by the full-move number of the detection): the game share = 100 × (games in scope with at least one detection of d in b) / (games in scope); and the loss share = 100 × (losses in scope with at least one detection of d in b) / (losses in scope), which is undefined when the scope has no loss. Games with result "unknown" count as games but not as losses.
4. THE Pattern_Report SHALL treat a share as qualifying when its unrounded value is at least 25 and its numerator is at least 3. For each pair (d, b), THE Pattern_Report SHALL show at most one pattern: the qualifying share with the higher unrounded value, taking the loss share when both are equal. Patterns SHALL be sorted by unrounded share descending, then numerator descending, then detector order, then bucket order.
5. THE Pattern_Report SHALL phrase each pattern with its numbers and the percentage rounded to a whole number, using the bucket wording "in moves 1–10", "in moves 11–20", "in moves 21–30" or "after move 30", for example "You hang pieces in moves 21–30 in 40 % of losses (4 of 10)".
6. THE Pattern_Report SHALL link detectors to Puzzle themes with this mapping, defined as one constant in the Chess_Module constants file: `hanging-piece` to `hangingPiece`; `missed-opponent-fork` to `fork`; `missed-opponent-mate` to `mateIn1` and `mateIn2`; `missed-own-tactic` to `fork`, `pin`, `skewer` and `discoveredAttack`; `endgame-technique` to `endgame`. WHEN the Owner taps "Practice" on a pattern whose detector has linked themes, THE Puzzle_Trainer SHALL open theme practice for all linked themes (Requirement 50 criterion 2).
7. WHEN a pattern's detector has no linked theme, THE Pattern_Report SHALL show a "Read tips" action that lists the Tips_Library tips tagged with that detector id, from the band of the Chess_Rating first and then from the other bands in Glossary order.
8. WHEN a Game_Report is stored, replaced or marked outdated, or the scope or filter changes, THE Pattern_Report SHALL recompute every share before it next renders.
9. FOR ALL sets of 0 to 200 Game_Reports with 0 to 20 detections each (random detector, full-move number from 1 to 100) and random results, every defined share SHALL lie from 0 to 100 inclusive; and, with the scope set to all games, adding a Game_Report with no detections SHALL leave every share that was defined before the addition unchanged or lower, with shares compared within an absolute tolerance of 1e-9 (bounds and metamorphic property).

### Requirement 60: Analysis cache

**User Story:** As the Owner, I want each game analysed only once, so that I don't wait or drain the battery twice.

#### Acceptance Criteria

1. THE Analysis_Cache SHALL store per-position evaluations and Game_Reports keyed by the game's Idempotency_Key, the Analysis_Depth and the analyser version, where the analyser version is an integer constant in the Chess_Module constants file that is increased whenever the Engine build, the Move_Classifier, the Mistake_Detectors or the Game_Report rules change.
2. WHEN the Owner opens a Game_Record that has a Game_Report for the current Analysis_Depth and analyser version, THE Chess_Module SHALL show the cached Game_Report without starting the Engine.
3. WHILE a Game_Record's only Game_Report has an Analysis_Depth or analyser version different from the current ones, THE Chess_Module SHALL show that Game_Report with an "Outdated" label and a "Re-analyse" action, and SHALL re-analyse the game only when the Owner taps "Re-analyse" or queues it. WHEN the new Game_Report is stored, THE Analysis_Cache SHALL delete the outdated Game_Report and its evaluations in the same transaction, so that each Game_Record has at most one Game_Report.
4. THE Analysis_Cache SHALL store each per-position evaluation before the Game_Analyzer sends the next position to the Engine, and SHALL store a Game_Report only when every position of the game has a stored evaluation.
5. FOR ALL Game_Records of 1 to 200 plies and all interruption points (cancel, Engine failure, App hidden, or none), requesting analysis, interrupting, and requesting analysis again until a Game_Report is stored, and then requesting analysis once more, SHALL send no position to the mocked Engine after an evaluation of that position is stored, SHALL send the final request no position at all, and SHALL end with exactly one stored evaluation per position (idempotence property, tested with a mocked Engine).
6. THE Backup_Service SHALL include the Analysis_Cache, both evaluations and Game_Reports, in Backup_Files as part of the Chess_Module entry (Requirement 6 criterion 1).
7. IF storing an evaluation or a Game_Report fails, THEN THE Game_Analyzer SHALL stop the analysis and the queue, keep every evaluation stored before the failure, and handle the failure as Requirement 3 criterion 5 specifies.

### Requirement 61: Chess dashboard card

**User Story:** As the Owner, I want a chess summary on the home screen, so that I see my ratings and today's tasks.

#### Acceptance Criteria

1. WHEN the Home_Dashboard is displayed, THE Chess_Module DashboardCard SHALL show values read from the Local_Database at that moment: the stored Chess.com Rapid, Blitz and Bullet ratings ("No rating" for an absent category, Requirement 43 criterion 4) with the age label of Requirement 65 criterion 1; the Puzzle_Rating as Requirement 49 criterion 8 displays it; the title of today's daily tip (Requirement 41 criterion 4); and the number of Repertoire_Positions whose due date is on or before today.
2. THE Chess_Module DashboardCard SHALL send no network request itself and SHALL update its values within 1 second when a refresh, Game_Sync, puzzle attempt or drill review changes them while the card is visible.
3. THE Chess_Module DashboardCard SHALL provide a "Next puzzle" action that opens the Puzzle_Trainer with the Puzzle chosen by Requirement 50 criterion 1 and no theme, and a "Drill openings" action that opens drill mode with the drill queue of Requirement 52 criterion 7 (or the message of Requirement 52 criterion 10 when the queue is empty).
4. WHEN the Owner taps the Chess_Module DashboardCard outside its actions, THE App SHALL open the Chess_Module start screen.
5. IF the Local_Database read for the Chess_Module DashboardCard fails, THEN THE Chess_Module DashboardCard SHALL show an error message saying the chess summary could not be loaded, along with a "Retry" action that repeats the read. The other DashboardCards SHALL stay displayed, and no Chess_Module data SHALL be changed.

---

## Part E: UI and UX

### Requirement 62: Skeleton loaders

**User Story:** As the Owner, I want placeholders while content loads, so that screens don't flash or jump.

#### Acceptance Criteria

1. WHEN a screen's data is not available 150 ms after the navigation to that screen started, THE App SHALL show a Skeleton with the layout of the expected content: the same headers, cards and chart areas, and as many list rows as fit in the visible area.
2. WHEN a screen's data becomes available within 150 ms of the start of the navigation, THE App SHALL render the content without ever showing a Skeleton.
3. WHEN the data arrives after a Skeleton was shown, THE App SHALL replace the Skeleton with content whose outer width and height differ from the Skeleton's by at most 1 CSS px for each fixed-size area (header, card, chart), so that elements outside the replaced area move by at most 1 CSS px. Once shown, a Skeleton SHALL stay visible for at least 200 ms, so that it does not flash.
4. IF loading a screen's data fails, THEN THE App SHALL replace the Skeleton with that screen's error message and a "Retry" action, and SHALL not show the Skeleton indefinitely.
5. WHERE cached remote data exists (Requirement 65), THE App SHALL show the cached data instead of a Skeleton. WHILE reduced motion is requested, Skeletons SHALL be static, with no shimmer or pulse animation (Requirement 67 criterion 3).

### Requirement 63: Optimistic updates

**User Story:** As the Owner, I want my taps reflected instantly, so that the app feels fast.

#### Acceptance Criteria

1. WHEN the Owner creates, edits or deletes a record in the Local_Database, THE App SHALL show the change on screen within 100 ms of the tap, before the Local_Database write completes.
2. IF the Local_Database write fails, THEN THE App SHALL revert the UI to the state read back from the Local_Database, show an error Toast with the reason as Requirement 3 criterion 5 specifies, and keep the Owner's draft and its Idempotency_Key for a retry (Requirement 11 criterion 6). WHEN the failed write was a delete, THE App SHALL close its Undo_Toast and show the error Toast instead.
3. THE App SHALL apply the Local_Database writes of one record in the order the Owner made the changes. WHEN all pending writes have settled, the UI SHALL show exactly the stored state, including when some of the writes failed.
4. FOR ALL sequences of 1 to 50 create, edit and delete operations with any subset of writes made to fail (tested with fake-indexeddb and injected failures), after every write has settled the state shown by the UI SHALL equal the state stored in the Local_Database (optimistic consistency property).
5. THE App SHALL apply this requirement only to Local_Database writes. Network operations (Game_Sync, rating refresh, Food_Lookup, Meal_Estimator) SHALL show their pending state until they complete, as their own requirements specify.

### Requirement 64: Undo toasts for destructive actions

**User Story:** As the Owner, I want to undo deletions, so that a slip of the finger never costs me data.

#### Acceptance Criteria

1. WHEN one of these destructive actions has been written to the Local_Database, THE App SHALL show an Undo_Toast that names the action (for example "Food entry deleted") and stays visible for 6 seconds: deleting a Set, removing a Session Exercise, discarding or deleting a Session, archiving an Exercise, deleting a Routine, a Food_Entry, a Saved_Meal or a Weight_Entry, replacing a Weight_Entry (Requirement 38 criterion 2), deleting a repertoire branch or tree, replacing a repertoire move (Requirement 51 criterion 8), resetting the Repertoire, and replacing data by import (Requirement 7 criterion 11).
2. WHEN the Owner taps "Undo" before the Undo_Toast closes, THE App SHALL restore, in one Local_Database transaction, every record the action deleted or changed with its original values, primary key, Idempotency_Key, relations and position, show the restored state within 100 ms of the tap, and close the Undo_Toast. "Undo" SHALL be disabled after the first tap, so that repeated taps restore once.
3. FOR ALL generated App data states and every destructive action of criterion 1 applicable to that state, performing the action and then Undo SHALL produce a Local_Database state identical to the state before the action, comparing every table record by record including primary keys and Idempotency_Keys (undo identity property).
4. WHEN a second destructive action occurs while an Undo_Toast is shown, THE App SHALL finalise the first action (discard its undo data, so that it can no longer be undone) and show a new Undo_Toast for the second action, so that at most one Undo_Toast is shown at a time.
5. THE App SHALL let the Owner dismiss an Undo_Toast by swiping it away, which finalises the action at once.
6. THE App SHALL count the 6 seconds from the moment the Undo_Toast appears, keep the Undo_Toast visible across navigation between screens during that time, and finalise the action when the time ends. IF the App is closed or reloaded while an Undo_Toast is shown, THEN the action SHALL stay written and can no longer be undone.
7. IF the Undo transaction fails, THEN THE App SHALL keep the Local_Database in the state after the action, close the Undo_Toast, and show an error Toast "Could not undo" with the reason (Requirement 3 criterion 5).

### Requirement 65: Stale-while-revalidate for remote data

**User Story:** As the Owner, I want cached data shown at once and refreshed in the background, so that I never wait on the network for data I already have.

#### Acceptance Criteria

1. WHEN the Owner opens a screen showing Chess.com ratings, Chess.com games or a cached Open Food Facts product, THE App SHALL show the cached data without waiting for any network request, with a label stating the time since the last successful fetch: "Updated just now" below 1 minute, "Updated N min ago" below 60 minutes, "Updated N h ago" below 24 hours, and "Updated N d ago" from 24 hours, with N rounded down. A fetch time later than the current time SHALL show "Updated just now". THE App SHALL update the label at least once per minute while it is visible.
2. WHILE the device reports a network connection, WHEN the screen of criterion 1 is shown and the time since the last successful fetch is more than the freshness limit (Chess.com ratings 1 hour, Chess.com games 6 hours as Requirement 44 criterion 15 specifies, Open Food Facts products 30 × 24 hours as Requirement 34 criterion 2 specifies), THE App SHALL request fresh data in the background. At most one background request per data item SHALL be in flight at a time, so that reopening the screen starts no duplicate request.
3. WHEN fresh data arrives, THE App SHALL update the shown values and the age label within 1 second, without a full-screen loading state and without changing the scroll position.
4. IF a background refresh of Chess.com ratings or Chess.com games fails (offline during the request, network error, timeout, HTTP error or unreadable response, as Requirement 46 defines), THEN THE App SHALL keep the cached data and its age label on screen and show a small "Couldn't refresh" indicator with a "Retry" action that sends the request once more. The indicator SHALL disappear when a refresh succeeds. A failed revalidation of an Open Food Facts product SHALL instead follow Requirement 34 criterion 13 and show no message.
5. WHILE the device reports no network connection, THE App SHALL show the cached data with its age label and the offline message of Requirement 1 criterion 5, and SHALL show no "Couldn't refresh" indicator.
6. IF no cached data exists, THEN THE App SHALL show a Skeleton (Requirement 62) while the first request runs, and SHALL handle its failure as the feature's own requirement specifies (Requirements 34, 43 and 44).

### Requirement 66: Image placeholders

**User Story:** As the Owner, I want blurred previews while photos load, so that lists look complete immediately.

#### Acceptance Criteria

1. WHILE an Exercise photo or meal thumbnail is loading, THE App SHALL show the image's decoded BlurHash filling the image's box, which has the final dimensions from the layout before the image loads, so that loading the image moves no other element.
2. WHEN the image has loaded, THE App SHALL replace the BlurHash with the image using a 200 ms opacity fade, or with no fade WHILE reduced motion is requested.
3. IF an image fails to load, including while the device is offline and the image is not cached (Requirement 13 criterion 6), THEN THE App SHALL keep the BlurHash and show a small placeholder icon on it, or show a neutral placeholder image when the image has no BlurHash or its BlurHash cannot be decoded. The placeholder of Requirement 14 criterion 9 is the one defined here, and the neutral placeholder image is also the one shown for an Exercise with zero photos (Requirement 14 criteria 1 and 7). THE App SHALL show no error message or Toast for a failed image.

### Requirement 67: Screen transitions and reduced motion

**User Story:** As the Owner, I want smooth transitions between screens that respect my motion settings, so that navigation feels native and comfortable.

#### Acceptance Criteria

1. WHERE the browser supports the View Transitions API (`document.startViewTransition` exists), THE App SHALL animate route changes with view transitions that last at most 250 ms.
2. WHERE the browser does not support the View Transitions API, THE App SHALL animate route changes with a CSS fallback that lasts at most 250 ms.
3. WHILE the system setting prefers-reduced-motion is "reduce", THE App SHALL replace movement animations, including route transitions, Bottom_Sheet and Toast slides, the settle animations of Requirements 68 and 69, ring fills, board piece animations and Skeleton shimmer, with instant changes or opacity fades of at most 150 ms. Content that follows the Owner's finger during a drag SHALL keep following it.
4. WHEN the prefers-reduced-motion setting changes while the App runs, THE App SHALL apply the new setting from the next animation that starts, without a reload.
5. WHEN the Owner starts a new navigation during a running transition, THE App SHALL end the running transition at once and start the new navigation from the current visual state, so that the screen shown at the end is the one of the last navigation.
6. WHEN a back navigation completes through the edge swipe of Requirement 69, THE App SHALL show the previous screen without an additional route transition.
7. IF a view transition fails or is rejected by the browser, THEN THE App SHALL complete the navigation without animation and show no error message.

### Requirement 68: Bottom sheets and interruptible animations

**User Story:** As the Owner, I want sheets I can swipe away and animations I can grab mid-way, so that the app responds to my finger like iOS does.

#### Acceptance Criteria

1. WHEN the Owner drags a Bottom_Sheet downward, THE Bottom_Sheet SHALL move down by the same distance as the finger. Dragging upward SHALL not move the Bottom_Sheet above its open position.
2. WHEN a downward drag starts inside scrollable content of a Bottom_Sheet that is not scrolled to its top, THE Bottom_Sheet SHALL scroll the content until it reaches its top and only then move the Bottom_Sheet with the finger.
3. WHEN the Owner releases a Bottom_Sheet after dragging it down by more than 25 % of its height, or with a downward velocity above 0.5 px/ms measured over the last 100 ms of the drag, THE Bottom_Sheet SHALL dismiss.
4. WHEN the Owner releases a Bottom_Sheet that does not meet the dismissal condition of criterion 3, THE Bottom_Sheet SHALL animate back to its open position within 250 ms.
5. WHEN the Owner touches a Bottom_Sheet during its open, close or return animation, THE Bottom_Sheet SHALL stop at its current position and follow the finger from there.
6. WHEN the Owner taps the backdrop of a Bottom_Sheet, THE Bottom_Sheet SHALL dismiss.
7. IF the Owner dismisses a Bottom_Sheet that contains unsaved input, by swipe, backdrop tap or Escape (Requirement 73), THEN THE Bottom_Sheet SHALL return to its open position and ask "Discard changes?" with "Discard" and "Keep editing" actions. "Discard" SHALL close the Bottom_Sheet and drop the input. "Keep editing" SHALL keep the Bottom_Sheet open with every entered value.
8. THE App SHALL make every gesture-driven animation (Bottom_Sheets, the edge swipe back of Requirement 69, Toast swipe) interruptible by a new touch, starting from the current visual position.

### Requirement 69: iOS edge swipe back

**User Story:** As the Owner, I want to swipe from the left edge to go back, so that navigation works like other iPhone apps.

#### Acceptance Criteria

1. WHEN the Owner starts a touch at most 20 CSS px from the left screen edge on a screen that has a previous screen in the App's navigation history, and the first 10 CSS px of movement are more horizontal (to the right) than vertical, THE App SHALL move the current screen right by the same distance as the finger and reveal the previous screen beneath it. A touch whose first 10 CSS px of movement are more vertical SHALL be handled as a scroll.
2. WHEN the Owner releases after dragging more than 35 % of the screen width, or with a rightward velocity above 0.5 px/ms measured over the last 100 ms of the drag, THE App SHALL navigate back.
3. WHEN the Owner releases without meeting the condition of criterion 2, THE App SHALL animate the current screen back into place within 250 ms and stay on the current screen.
4. WHEN a touch starts on a chessboard, THE App SHALL handle the touch as a board interaction (Requirement 42) and not as an edge swipe, also within 20 CSS px of the left edge.
5. WHILE a tab's root screen is shown, THE App SHALL keep the screen in place during left-edge drags.
6. IF the current screen holds unsaved form input when a release meets the condition of criterion 2, THEN THE App SHALL return the screen to its place and ask for confirmation as Requirement 68 criterion 7 specifies, and SHALL navigate back only after "Discard". The Session_Logger has no unsaved input because Requirement 21 saves every change.

### Requirement 70: Touch targets and safe areas

**User Story:** As the Owner, I want large tap areas and nothing hidden behind the notch or home bar, so that the app is easy to use one-handed.

#### Acceptance Criteria

1. THE App SHALL give every interactive element a touch area of at least 44 × 44 CSS px, extending the touch area beyond the visible element where the visible element is smaller, without letting the touch areas of two elements overlap. Chessboard squares are excluded; their size follows Requirement 42 criterion 6.
2. THE App SHALL set `viewport-fit=cover` and pad content with the `env(safe-area-inset-top)`, `-right`, `-bottom` and `-left` values so that no content or control lies under the status bar, notch, Dynamic Island or home indicator, in portrait and landscape orientation.
3. THE App SHALL place the bottom navigation bar, Toasts and the bottom edge of Bottom_Sheet content above the home indicator area, by at least the `env(safe-area-inset-bottom)` value.

### Requirement 71: Typography and shape

**User Story:** As the Owner, I want numbers that don't jump and tidy headlines and corners, so that the app looks polished.

#### Acceptance Criteria

1. THE App SHALL render weights, reps, kcal, macros, ratings, timers, clock times, durations and percentages with tabular numerals (`font-variant-numeric: tabular-nums`), so that a changing value keeps the width of each digit.
2. THE App SHALL apply balanced text wrapping (`text-wrap: balance`) to headings. WHERE the browser does not support it, headings SHALL wrap normally.
3. WHERE the browser supports continuous (squircle) corner shapes, detected with a CSS `@supports` check, THE App SHALL render cards, Bottom_Sheets, buttons and images with continuous corners.
4. WHERE the browser does not support continuous corner shapes, THE App SHALL render those elements with standard rounded corners (`border-radius`) of the same radius.

### Requirement 72: Command menu

**User Story:** As the Owner, I want one search to jump to anything, so that I reach any exercise, routine, screen or action in seconds.

#### Acceptance Criteria

1. THE App SHALL provide a search button in the header of every screen that opens the Command_Menu as a Bottom_Sheet with the search field focused.
2. THE Command_Menu SHALL list the core screens (Home_Dashboard, Settings_Screen) and the core action "Export backup", and the entries declared by every registered Module (Requirement 2 criterion 3), including every non-archived Exercise, every Routine, every Saved_Meal, every repertoire tree, each Module's start screen, and the actions "Start workout", "Log food", "Scan barcode", "Estimate meal from photo", "Log weight", "Next puzzle", "Drill openings" and "Sync chess games". Each entry SHALL show its name and its type (for example "Exercise" or "Action").
3. WHEN the Owner types a query, THE Command_Menu SHALL remove leading and trailing whitespace from the query (at most 100 characters), compare ignoring case and diacritics, and place each matching entry in the highest of these match classes: (1) the name starts with the query; (2) a word of the name starts with the query, where words are separated by spaces, "-", "/", "(" or ")"; (3) the name contains the query; (4) the name contains the non-space characters of the query in order. Entries in no class SHALL not be shown. Within a class, entries SHALL be sorted alphabetically by name ignoring case and diacritics, then by type, then by id.
4. WHEN the Owner types a query, THE Command_Menu SHALL show the updated results within 100 ms of the keystroke for a list of 2,000 entries.
5. WHILE the query is empty, THE Command_Menu SHALL show under "Recent" the up to 5 most recently selected entries that still exist, most recent first, followed by every other entry grouped by type and sorted alphabetically within each type. The recent list SHALL be stored in the Local_Database.
6. WHEN the Owner selects an entry, THE Command_Menu SHALL close, record the entry as most recently selected, and navigate to the entry or run the action. An action that needs the network SHALL behave as its own control does, including the offline message of Requirement 1 criterion 5.
7. IF no entry matches the query, THEN THE Command_Menu SHALL show "No results".
8. IF the selected entry's target no longer exists (for example a Routine deleted in another window), THEN THE Command_Menu SHALL stay open, remove the entry from the list, and show a Toast "This item no longer exists".
9. FOR ALL entry lists of 0 to 2,000 entries with names of 1 to 80 characters (including Hebrew letters, emoji, diacritics and repeated names) and all queries of 1 to 20 characters, every shown entry SHALL match the query, every matching entry SHALL be shown exactly once, every entry in a higher match class SHALL appear before every entry in a lower match class, and entries within a class SHALL follow the order of criterion 3 (ranking property).

### Requirement 73: Keyboard shortcut hints

**User Story:** As the Owner, I want keyboard shortcuts when I use a hardware keyboard, without clutter when I don't, so that the screen stays clean on touch.

#### Acceptance Criteria

1. THE App SHALL support these shortcuts: Cmd+K or Ctrl+K opens the Command_Menu from any screen, including while a text field has focus, and prevents the browser's default action; Escape closes the topmost Bottom_Sheet or the Command_Menu, subject to Requirement 68 criterion 7; Left Arrow and Right Arrow act as "Previous" and "Next" in the Game_Viewer (Requirement 45 criterion 5) while no text-entry element has focus.
2. WHEN a keydown event occurs while no text-entry element has focus, THE App SHALL treat a hardware keyboard as present for the rest of the App run. This state SHALL not be stored, so that each App start begins with no hardware keyboard detected.
3. WHILE a hardware keyboard is treated as present, THE App SHALL show shortcut hints ("⌘K", "Esc", "←", "→") next to the controls that have shortcuts.
4. WHILE no hardware keyboard has been detected in the App run, THE App SHALL hide every shortcut hint. The shortcuts of criterion 1 SHALL work whether or not a hardware keyboard has been detected.

---

## Part F: Quality

### Requirement 74: Automated tests

**User Story:** As the Owner, I want the calculations proven by automated tests, so that the app has no silent maths mistakes.

#### Acceptance Criteria

1. THE project SHALL run its tests with Vitest in single-run mode (`vitest --run`), using React Testing Library for components, fake-indexeddb for Local_Database tests, and fast-check for property-based tests. The Deployment_Pipeline runs this suite as Requirement 12 criterion 2 specifies.
2. THE project SHALL implement every calculation with a stated formula, threshold or property as a pure function with no UI or Local_Database imports, and the test suite SHALL contain a static import scan that fails if a module holding such a function imports UI or Local_Database code.
3. THE test suite SHALL contain, for every acceptance criterion marked as a property, invariant or round trip in this document, a fast-check property test with at least 100 generated cases (`numRuns` ≥ 100) that uses the generator ranges and numeric tolerances stated in that criterion and exact equality where the criterion states no tolerance. This covers: backup round trips and import idempotence (Requirement 8), create idempotence (11), Exercise_Library filter intersection (14), routine reorder (17), Active Session persistence round trip (21), E1RM and volume (23), PR detection (24), split volume counting (26), BMR and TDEE (29), targets (30), Saved_Meal scaling (31), barcode check digit (33), Open Food Facts mapping (34), portion scaling (35), AI response validation (37), weight trend (38), trend correction (39), rating bands (40), daily tip rotation (41), board undo and redo (42), Game_Sync idempotence, confluence and no-duplicates (44), Glicko-2 direction and validity (49), the repertoire invariant (51), SM-2 (53), opening matching and bounds (54), Win_Probability, classification and drop bounds (56), the Mistake_Detectors Owner-only invariant (57), pattern shares (59), Analysis_Cache idempotence (60), optimistic consistency (63), undo identity (64) and Command_Menu ranking (72).
4. WHEN a property test fails, THE test run SHALL report the fast-check seed and the shrunk counterexample, so that the failure can be reproduced.
5. THE test suite SHALL contain example tests for every reference example in this document: Mifflin-St Jeor and Logged_Training_Hours (Requirement 29 criteria 7, 8 and 12), trend correction (39 criterion 12), Glicko-2 (49 criterion 5) and SM-2 (53 criterion 8).
6. THE test suite SHALL check the determinism properties of the Exercise_Build_Script (Requirement 13 criterion 5) and the Puzzle_Build_Script (Requirement 47 criterion 7) by running each script twice on the same small fixture input and comparing the outputs byte by byte.
7. THE test suite SHALL contain component tests for: Session logging with autosave and resume (Requirement 21), Backup_File rejection messages (Requirement 7), and the AI review screen (Requirement 37).
8. THE test suite SHALL test the ChessCom_Client, CORS_Proxy, Food_Lookup, Meal_Estimator and Engine integrations against mocked responses and a mocked Web Worker, with no live network or Engine calls. The ChessCom_Client tests SHALL cover HTTP 200, 404, 410, 429 with the retry waits of Requirement 46 criterion 2 (using fake timers), 5xx, the 15-second timeout, a non-JSON body, and the CORS_Proxy fallback. The Engine tests SHALL cover a load failure, a Web Worker error, and a position with no best move within 60 seconds (Requirement 55 criteria 8 and 9).

---

## Out of scope

These items are excluded from this spec. The architecture of Requirement 2 must allow the first two to be added later.

- Sleep module (next planned module).
- Other future modules.
- Apple Health or any other health-platform integration.
- Accounts, login, cloud sync between devices, and multiple users. One-time-code autofill is excluded because there is no login.
- Push notifications. Backup reminders are in-app banners.
- Android-specific behaviour, including predictive back (iOS edge swipe is used instead).
- Hover menus and the Amazon "safe triangle" (touch device, no hover menus).
- Text-based AI meal estimation, and any AI in chess analysis.
- Imperial units.

## Risks and notes

- **Workspace path**: the project path contains Hebrew characters and sits under OneDrive. Node tooling, Vite, WASM file copying, git hooks and OneDrive sync locks on `node_modules` may fail there. If tooling breaks, move the project to an ASCII path outside OneDrive such as `C:\dev\PersonalLab`.
- **GitHub Pages on a free account** serves sites only from public repositories. The repository will therefore be public, so it must never contain secrets (the Gemini_Key stays on the phone). A public repository also satisfies the Stockfish GPLv3 source-availability requirement.
- **iOS storage**: Safari and the installed home-screen app keep separate storage. The Owner should install the App first and use it only from the home screen. Deleting the home-screen app deletes its data, so backups matter.
- **Camera in standalone mode**: iOS camera access from installed web apps has had bugs in some iOS versions. Photo capture falls back to the system file picker, and barcode entry falls back to typing.
- **Engine performance**: single-threaded Stockfish on an iPhone may take one to several minutes per game at depth 12, and iOS pauses work in the background. The depth is one constant so it can be tuned, and analysis resumes where it stopped.
- **Engine size**: the Stockfish WASM and network file add several megabytes to the App_Shell precache.
- **Gemini free tier**: limits, data-use terms and model names can change. The model id is one constant. Browser access to the Gemini API with a key must be confirmed during design.
- **Chess.com API**: CORS behaviour, rate limits and response fields may change. The CORS_Proxy is the fallback.
- **Open Food Facts data**: coverage of local (Israeli) products and data quality vary. Manual entry with caching covers gaps. Open Food Facts data is ODbL and needs attribution.
- **Platform support**: the View Transitions API needs a recent Safari, and continuous corner shapes are not supported in Safari at the time of writing. Both have fallbacks. Hardware keyboard detection is a heuristic.
- **SPA routing on GitHub Pages**: deep-link reloads need a 404 fallback page or hash routing. The choice is made in design.
- **Bundle size**: exercise images are cached on demand rather than precached. The puzzle file is capped at 3 MB gzip.
- **Starter repertoire overlap**: Caro-Kann and the Two Knights Defence both answer 1.e4. This is the Owner's choice, and the Owner can edit it. The starter set has no Black defence against 1.d4.
- **Licence names to verify**: the licence names in Requirement 5 criterion 4 (free-exercise-db Unlicense, Lichess puzzle database CC0, chess.js BSD-2-Clause, react-chessboard MIT) must be checked against each project's licence file during implementation.
- **Settings limits chosen during refinement**: Gemini_Key at most 200 characters, CORS_Proxy URL at most 2048 characters, key mask showing the last 4 characters, and a "goal default" protein factor option (Requirement 5).
- **Decisions made during refinement to confirm with the Owner**: missing equipment maps to "other"; one photo per Custom_Exercise; logging may continue for an Exercise archived during an Active Session; caps of 50 Routine_Items per Routine and 20 Sets per Exercise; "." and "," accepted as decimal separators; a Gym-section rest timer sound switch (default on) is needed by Requirement 20; E1RM PR tolerance 0.001 kg; split analysis uses the Exercise's current muscle lists; one short logged Session in 28 days makes Effective_Training_Hours "logged"; separate protein factor per goal; Saved_Meal adds are rejected when scaling exceeds manual-entry limits; UPC codes normalised to 13 digits; Open Food Facts plausibility caps; the AI free-tier warning is acknowledged once; one Idempotency_Key per AI review item; weight chart ranges of 30/90/180/365 days. Decisions for Requirements 40–74:
  - Chess.com username: every change is verified, including a change of letter case only; HTTP 410 is treated like 404; changing to a different username clears stored ratings, keeps old Game_Records, and keeps month-complete marks per username (Requirements 40, 43).
  - A "Using manual rating" note is shown when the source is Chess.com Rapid but no Rapid rating is stored (Requirement 40).
  - Tip title at most 80 and body at most 800 characters; daily tips rotate in Tips_Library file order per band, with a per-band "shown" set (Requirement 41).
  - Free board input limits: FEN 100 characters, PGN 100,000 characters; loading a PGN shows its final position (Requirement 42).
  - Game_Sync: a month is marked complete only when its archive was fetched more than 24 hours after the month ended (UTC); each month is written in one transaction; the run stops at the first failed request; unknown result codes become "unknown" and are left out of scores; unreadable PGNs are stored but flagged (Requirement 44).
  - Rating history chart defaults: rapid, 3 months (Requirement 45).
  - Chess.com 5xx and timeouts are not retried automatically; a failed CORS_Proxy request shows the offline message plus a hint to check the proxy URL (Requirement 46).
  - Puzzle build defaults: minimum popularity 80, minimum plays 500; 9 buckets of at most 1,111 Puzzles with no redistribution; gzip level 9; build fails if over 3 MB (Requirement 47).
  - Puzzles: the rated result is saved as soon as the score is decided (first wrong move, first hint or "Show solution"); leaving before that records nothing; hints reset per Owner move; "Show solution" plays moves at 500 ms intervals (Requirement 48).
  - Glicko-2: no rating-deviation growth for time without attempts; reference-example tolerances ±0.01 rating and deviation, ±0.00001 volatility (Requirement 49).
  - Repertoire: replacing an expected move removes the old move and its continuation in every tree of that colour; repertoire reset and move replacement get an Undo_Toast; the 10 new positions per day limit is a constant, not a Setting, because Requirement 5 lists no such setting (Requirements 51, 52, 64).
  - Drill: every answered position is graded at most once per session, including positions not due; opponent moves play after 300 ms (Requirement 52).
  - SM-2: EF stored as integer hundredths; intervals capped at 36,500 days (Requirement 53).
  - Opening statistics: a game matches no tree when it shares 0 plies; the deviation list shows the top 10 positions (Requirement 54).
  - Engine: 10-second start timeout, 60-second per-position timeout with one automatic restart; analysis pauses when the App is hidden and is not resumed automatically after a reload; queue default N = 10 (Requirement 55).
  - The Game_Viewer marks only the Owner's moves (Requirement 45 criterion 7).
  - Detectors: "early queen" and "delayed castling" fire at most once per game; "time pressure" uses the clock value recorded with the move; detector ids are fixed kebab-case strings (Requirement 57).
  - Game_Report has 3 tips when the game has any detection, otherwise 2 (Requirement 58).
  - Pattern_Report includes outdated Game_Reports, default scope last 20, and shows one pattern per detector and bucket (Requirement 59). The example sentence was changed to the bucket wording ("in moves 21–30").
  - Analysis_Cache keeps one Game_Report per game; the outdated one is deleted when the new one is stored (Requirement 60). The Glossary entry for Analysis_Cache does not mention per-position evaluations and was left unchanged as instructed.
  - UI: a shown Skeleton stays at least 200 ms; view transitions last at most 250 ms; a left-edge back swipe on a screen with unsaved input asks for confirmation; chessboard squares are exempt from the 44 px touch-target rule; the Command_Menu recent list is stored in the Local_Database (Requirements 62, 67, 69, 70, 72).
  - Image failures show the BlurHash with a small icon, which this spec treats as the placeholder image of Requirement 14 criterion 9 (Requirement 66).

## Prerequisites

- Node.js LTS installed on the Windows PC.
- Git installed, and a free GitHub account with a public repository and GitHub Pages enabled.
- A free Gemini API key from Google AI Studio.
- Optional: a free Cloudflare account, needed only if the CORS_Proxy is required.
- An iPhone with a recent iOS version and Safari, to install the App from the GitHub Pages URL. HTTPS on GitHub Pages is required for the camera and the Service_Worker. No Mac is needed.
