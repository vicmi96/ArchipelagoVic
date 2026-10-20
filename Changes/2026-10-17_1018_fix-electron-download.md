# Patch notes: start script finishes Electron's download

**Timestamp:** 2026-10-17 10:18 PDT
**Files changed:** `Start ArchipelagoVic.cmd`, `README.md`
**Stale-copy check:** I staged both files from `C:\Claude\ArchipelagoVic` first. They were byte-identical to the 01:25 release, so there were no local edits to merge.

## Problem
On first run, `npm install` added the `electron` package but didn't run its install script. That script is what downloads the actual Electron program into `node_modules\electron\dist`. Every later run reported "up to date", and the start script then tried to open `dist\electron.exe`, which didn't exist. Windows showed "Windows cannot find 'node_modules\electron\dist\electron.exe'".

What was in your folder confirms this: `node_modules\electron` has `install.js`, `checksums.json` and so on, but no `dist` folder and no `path.txt`. That's exactly what npm leaves when install scripts are skipped (`ignore-scripts`, or a download that failed on the first try).

## Fix
`Start ArchipelagoVic.cmd` now checks things in order:
1. If `electron.exe` is there, it starts the app straight away. Nothing else changes.
2. If Node.js is missing, it says so and points to nodejs.org.
3. If the electron package isn't installed, it runs `npm install`.
4. If the package is there but the program isn't, it runs Electron's download step directly: `node node_modules\electron\install.js`.
5. If it still can't find the program, it stops with a clear message. The message suggests checking your connection and antivirus, and it reports when npm's `ignore-scripts` setting is on. It no longer launches a missing file.

## README
I added an "If it won't start" section with this error and the manual command.

## Tested
- I reproduced your exact folder state on Linux by running `npm install --ignore-scripts`. That gives the same file list and no `dist`.
- Running `node node_modules/electron/install.js` then downloaded and unpacked Electron 44.4.5 into `dist`.
- The `.cmd` itself can only run on Windows, so the first double-click on your PC is its real test.
