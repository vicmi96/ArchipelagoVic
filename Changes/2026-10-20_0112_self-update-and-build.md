# ArchipelagoVic 2.8.0: ArchipelagoVic updates itself, and the installer includes everything

**Date:** 2026-10-20 01:12 (local time)
**Request:** "Can we add a function to auto-update/look for updates, that will check the github repo for updates and do it? Also make sure that the Build installer.cmd is working for all of those new features we added."

## Self-update

ArchipelagoVic checks **github.com/vicmi96/ArchipelagoVic** for a newer version of itself and installs it. How depends on how this copy runs:

| This copy | Where the update comes from | What Update does |
|---|---|---|
| Installed (Setup .exe) | the latest GitHub release | downloads `ArchipelagoVic-Setup-<version>.exe`, checks its SHA-256 against the checksum GitHub publishes for the file, runs it in its update mode (`--updated /S --force-run`: silent, over this install, starts the app when done), and quits |
| Portable .exe | the latest GitHub release | downloads `ArchipelagoVic-<version>-portable.exe`, checks it, puts it next to the old one, quits, and starts the new one with the same options |
| Run from a git checkout (`Start ArchipelagoVic.cmd`) | the branch it follows on GitHub (`origin/main`) | `git pull --ff-only`, then `npm install` if `package.json` changed, then restarts |
| Run from downloaded source files (no git) | the latest GitHub release | links to the release page |

**Safety:**
- **Checksum required.** A download is used only when its SHA-256 matches GitHub's published checksum; otherwise it's deleted and nothing is run.
- **GitHub only.** Downloads are only taken from GitHub.
- **Git copies.** Git refuses when there are uncommitted changes, or local commits GitHub doesn't have, and says so in plain words.

**When it checks:**
- **At startup,** at most every 12 hours. It can be turned off in Settings → "Check for ArchipelagoVic updates when it starts".
- **On request,** from Home → Updates → "Check now", or Settings → "Check for updates".
- **When one is found,** a toast appears, plus a row in Home → Updates ("ArchipelagoVic 2.8.1 is out (you have 2.8.0). Update…") and an Update… button in Settings.

**The update sheet shows:**
- what will happen (file name and size, or the number of new git changes);
- what will be cut off (a hosted server stops; rooms disconnect and reopen after the restart);
- the release notes or commit list;
- a download progress bar and the steps as they happen.

While it works, it can't be closed halfway; if it fails, it says why and offers Try again.

**Settings → "ArchipelagoVic updates"** says which kind of copy this is and when it last checked. The About line now shows the real version; it used to say "2.0".

## Build installer.cmd and the new features

- **Theme pictures were missing from the installer.**
  - Fix: they now ship inside the app, at `resources\theme-pictures` (`extraResources`).
  - The app looks in a `theme-pictures` folder next to the `.exe` first (your own pictures win), then in the shipped ones.
  - Before this, the packaged app only looked next to the `.exe`, where nothing put them; for the portable `.exe` they could never be found.
- **The installer's file name** is now `ArchipelagoVic-Setup-<version>.exe`, with no spaces, so the name stays the same when attached to a GitHub release. The updater looks for it there.
- **`npm run dist` uses `--publish never`,** so a build never tries to publish anything by itself.
- **Already included before this change:** the Games patch helper (`logic\apvic_logic\patcher.py`), Universal Tracker, the Games screen and the Quit button, through `logic/**/*` and `renderer/**/*`. The build test below confirms they work from inside `app.asar`.

## Files

- **`main.js`:**
  - "ArchipelagoVic's own updates" section: `installKind`, `selfCheck`, `downloadVerified`, `selfInstall` and the git/npm helpers;
  - IPC `self:check`, `self:setAuto` and `self:install`, with `self:progress` events;
  - a new portable copy is started as the old one exits (`launchAfterQuit`, released one-copy lock);
  - `themeFolders` (your folder, then the shipped pictures);
  - `execFile` import;
  - `APVIC_UPDATE_API`, for tests only.
- **`preload.js`:** `selfCheck`, `selfSetAuto`, `selfInstall` and `onSelfProgress`.
- **`renderer/launcher.js`:**
  - `refreshSelf`, `renderSelfSettings`, `openSelfUpdate` and `SELF_HOW`;
  - Home → Updates is now `renderUpdates`, with ArchipelagoVic first; it shows even without Archipelago installed;
  - the startup check;
  - Settings wiring and the real version in About.
- **`renderer/index.html`:** Settings → "ArchipelagoVic updates" (state line, Check for updates, Update…, the startup check box).
- **`renderer/styles.css`:** `.self-bar` and `.self-notes`.
- **`package.json`:** version 2.8.0, `extraResources` (theme pictures), the NSIS `artifactName`, and `--publish never`.
- **`README.md`:**
  - the self-update feature;
  - the new installer name;
  - what the build includes;
  - "Publishing an update".
- **`ArchipelagoClient.html`:** rebuilt.

## Tested

**`Build installer.cmd` (run as-is, twice):**
- exit 0, about 70 s each time;
- output: `dist\ArchipelagoVic-Setup-2.8.0.exe` (138 MB), `dist\ArchipelagoVic-2.8.0-portable.exe` (138 MB) and `win-unpacked\`;
- 11 pictures in `win-unpacked\resources\theme-pictures`.

**The built app (`win-unpacked\ArchipelagoVic.exe`, its own settings folder): 9 of 9 passed.**
- It runs from `app.asar`, as version 2.8.0, recognised as an installed copy.
- The update check answered: "ArchipelagoVic has no releases on GitHub yet". That's true today: the repository has no releases.
- All 11 theme pictures are found from `resources`.
- The Games rail item and the Quit button exist.
- The Host view hosted a generated Pokémon Red game, and a game profile with the real EmuHawk saved with no problems.
- Play ran all six steps, including patching, with the helper packed from inside `app.asar`. The BizHawk Client log showed "Connected", "Connected to BizHawk" and "Running handler for Pokemon Red and Blue"; the room tab connected.

**Portable update** (the built portable `.exe`; a local stand-in for GitHub's releases API through `APVIC_UPDATE_API`; a fake "2.8.1" release whose file was a renamed copy of the 2.8.0 portable):
- **Wrong checksum:** refused with "The download doesn't match the checksum GitHub published, so it wasn't used." No file was placed, and the app kept running.
- **Right checksum, first try:** downloaded, checked, and `ArchipelagoVic-2.8.1-portable.exe` placed next to the old one; the app quit. **But the new copy didn't start.** It was started while the old copy was still closing, so it hit the "only one copy" lock (and reached your own open ArchipelagoVic window instead, which may have come to the front). Fixed: the new copy is started as the old one exits, after it releases the lock, with the same options.
- **Right checksum, after the fix (rebuilt):** the old copy quit, and `ArchipelagoVic-2.8.1-portable.exe` was running with the same `--user-data-dir` and debugging options.

**Git-checkout update** (all throwaway copies in a temp folder, never your real checkout): a fake "GitHub" repo, an app copy cloned from it (with this work committed), and a newer commit pushed from a third clone (version 2.8.1 plus a README line).
- **With an uncommitted change:** "This copy has changes that aren't committed, so git can't update it. Commit or put them aside first." Nothing changed.
- **Clean:** it ran `git pull` and `npm install` (package.json changed; `node_modules\electron` appeared), then restarted by itself. The copy is now at the remote's commit, and the restarted app reports version 2.8.1 with nothing newer.
- **The update sheet and Settings line** read: "Runs git pull to get 1 new change from GitHub…", "This copy runs from a git checkout; it updates with git pull from GitHub."

**`node --check`:** passes for `main.js`, `preload.js` and `renderer/launcher.js`.

## Not tested

- **The installed copy's update.** That runs the downloaded Setup in its update mode, which needs ArchipelagoVic installed on this PC. The download and checksum steps are the same code tested with the portable copy.
- **A real GitHub release.** There isn't one yet; the first one has to be published on GitHub (see "Publishing an update" in the README).

## Clean-up

**Removed:** every test copy, server, EmuHawk, BizHawk Client and stand-in GitHub server; the temp folders; and the update download folder.

**Kept:** `dist\` holds the new 2.8.0 build (git-ignored), next to the old 2.4.1 files.
