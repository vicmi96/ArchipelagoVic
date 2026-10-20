# ArchipelagoVic 2.4.1: reachable checks are built in, nothing to install

**Date:** 2026-10-19 20:48 (local time)
**Request:** "can we make that universal tracker, an actual native functionality without having to install anything?"

## What changed

Reachable checks now work out of the box:
- There's no "Install Universal Tracker" offer, no confirmation and no download.
- The first time you open a room, Checks left just shows "Working out your world's logic…" and then the counts.

## Why it still uses Universal Tracker's engine

What's reachable depends on each game's own rules, and those exist only as the Python world code inside Archipelago, one per game: 80+ built-in games plus every custom `.apworld`. Re-writing all of them in ArchipelagoVic isn't realistic and would drift out of date. So ArchipelagoVic now **ships** the engine and sets it up itself, instead of asking you to install it.

## How it works

- **The built-in copy:** `logic/universal-tracker/tracker.apworld` (Universal Tracker v0.3.5, byte-identical to the official release) ships inside ArchipelagoVic and the installer.
- **Its license:** Universal Tracker is MIT-licensed. Its license is included as `logic/universal-tracker/LICENSE.txt` and credited in the README.
- **First room:** if no Universal Tracker is in your `custom_worlds` folder, ArchipelagoVic copies the built-in one there silently (`installBundledUT`).
- **Your own copy is kept:** if you already have a Universal Tracker there, ArchipelagoVic uses yours.
- **Automatic repair:** if your copy won't load with your Archipelago version (for example, an old Universal Tracker on a newer Archipelago), ArchipelagoVic replaces it with the built-in one once and tries again. The old file is kept as `tracker.apworld.bak`, which Archipelago ignores. Any extra copies such as `tracker (1).apworld` are renamed to `.bak` too, so only one is loaded.
- **If even the built-in one can't load,** the bar says so and has "Repair" and "Turn off" buttons.
- **Newer versions:** Home → Updates still offers newer Universal Tracker releases from GitHub, if you want them.

## Files

**New:**
- `logic/universal-tracker/tracker.apworld`
- `logic/universal-tracker/LICENSE.txt`

**Changed:**
- `main.js`:
  - `BUNDLED_UT`, `utFiles` and `installBundledUT`;
  - `logic:start` sets up the built-in copy when none is installed;
  - `logic:installUT` now restores the built-in copy instead of downloading.
- `renderer/client.js`:
  - the install offer and confirmation are removed;
  - automatic one-time repair when the tracker can't load;
  - a "Couldn't load the tracker" state with Repair and Turn off;
  - a credit tooltip on "Logic by Universal Tracker".
- `README.md`: reachable checks are described as built in; the project layout and license credit are updated.
- `package.json`: version 2.4.1. (`logic/**/*` was already included in the installer.)
- `ArchipelagoClient.html`: rebuilt.

## Tested

In the Electron app against a local server with the real Archipelago 0.6.8 code:

**Clean install (no Universal Tracker anywhere):**
- Opening a room went straight to "83 of 131 remaining checks are reachable" with no prompts.
- `tracker.apworld` appeared in `custom_worlds`.
- Live updates as other players sent items worked, and the filter worked.
- The missing-YAML message and "Choose YAML…" for another slot worked.

**Broken Universal Tracker (a `tracker.apworld` that fails to import):**
- It was replaced automatically, the counts appeared, and `tracker.apworld.bak` was kept.
- The new `tracker.apworld` is identical to the built-in one.

**Clean-up:** both background helpers stopped when the app quit.
