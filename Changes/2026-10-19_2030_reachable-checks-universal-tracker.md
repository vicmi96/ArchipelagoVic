# ArchipelagoVic 2.4.0: what you can reach right now

**Date:** 2026-10-19 20:30 (local time)
**Request:** a friend's feedback. With the Universal Tracker plugin, a check that needs the hookshot isn't shown until you have the hookshot. In other words, only checks you can actually get with what you have now.

## What it does

Checks left now marks every remaining check as one of:

- **Reachable**: you can get it with the items you have;
- **Glitched**: only reachable with glitches or tricks, for games that define them;
- **Not yet**: needs items you don't have.

How it shows up:
- Reachable checks are listed first.
- A new **"Only what I can reach"** checkbox hides everything else. It's remembered.
- A bar above the list says, for example, "83 of 131 remaining checks are reachable with what you have".
- The list updates by itself as items arrive.

The logic comes from **Universal Tracker** (UT) by FarisTheAncient, the same engine the plugin your friend uses. ArchipelagoVic runs it in the background without UT's window, so it isn't reimplemented and works for every game UT supports.

## How it works

1. **New helper add-on, `logic/apvic_logic/`.** It contains `__init__.py`, `bridge.py` and an `archipelago.json` manifest.
   - It registers a hidden Archipelago component, "ArchipelagoVic Logic".
   - It starts Universal Tracker's own tracker client with no window and wraps its update step. After every update, it prints one line of JSON (`APVIC {...}`) with the reachable location IDs, the glitched IDs and any problems.
   - If the world can't be built (no YAML, world not installed), it reports that right after connecting. Universal Tracker on its own would only log it.
   - It stops when ArchipelagoVic closes its input.
2. **ArchipelagoVic packs that folder** into `custom_worlds/apvic_logic.apworld`, but only when the file is missing or different.
3. **For each connected room tab, it starts one helper:**
   `ArchipelagoLauncherDebug.exe "ArchipelagoVic Logic" -- --nogui --connect <server> --name <slot> --yaml-dir <temp>`
   - It uses the debug launcher because that one has a console, so its output can be read.
   - Results go back to that room tab only.
   - The helper connects to the server as you, with the "Tracker" tag, like Universal Tracker does. Its "connected" and "disconnected" lines are hidden from the activity feed.
4. **Your YAML:**
   - ArchipelagoVic finds the YAML in your Players folder whose `name:` matches your slot. `{player}` and `{number}` name templates count as matches.
   - It copies only that player into a temporary folder for the tracker.
   - "Choose YAML…" uses any other file instead and is remembered per room.
5. **Helpers stop** when you disconnect, close the tab or quit. If a room reconnects on its own, the helper running for it is kept.

## Installing Universal Tracker

- If UT isn't installed, the bar offers **Install Universal Tracker**, after a confirmation. It downloads `tracker.apworld` from the newest `Tracker_v…` release on github.com/FarisTheAncient/Archipelago, checks that it really is the `tracker` world, and copies it into `custom_worlds`. Version 0.3.5 was tested.
- **"Not now"** turns the feature off. "Turn on" brings it back.
- **If UT is installed but won't load** with your Archipelago version, the bar offers to update it.
- **Update checks** now include Universal Tracker. That project publishes several things from one repository, so only releases whose tag starts with `Tracker_v` count.

## Messages you might see

- **Working:** "Working out your world's logic…" while it builds your world (big games can take a minute), then "Checking what you can reach…".
- **"Couldn't work out what you can reach":**
  - says when no YAML with your slot name was found;
  - offers "Choose YAML…", "Try again" and "Turn off";
  - "Details" shows Universal Tracker's own message.
- **World opted out:** if a game world asks trackers not to work out its logic, the bar says so and every check is shown.
- **Elsewhere:** in the browser-only `ArchipelagoClient.html` nothing changes, because it can't run Archipelago.

## Files

**New:**
- `logic/apvic_logic/__init__.py`
- `logic/apvic_logic/bridge.py`
- `logic/apvic_logic/archipelago.json`

**Changed:**
- `main.js`:
  - logic handlers (`logic:status`, `logic:installUT`, `logic:chooseYaml`, `logic:start`, `logic:stop`, `logic:refresh`);
  - `ensureBridge`, `findSlotYaml`, `utInstalled`;
  - helpers are stopped on quit;
  - IPC handlers can now see which window or tab called them;
  - releases filtered by tag prefix for update checks.
- `preload.js`: the `logic*` calls and `onLogicData`.
- `renderer/client.html`: the reachability bar and the "Only what I can reach" checkbox.
- `renderer/client.js`: the `Logic` state, `startLogic`/`stopLogic`, the bar, the Reach column with sorting and filter, and hiding the helper's join/leave lines.
- `renderer/styles.css`: the bar, the spinner and the Reach labels.
- `package.json`: version 2.4.0, and `logic/**/*` included in the installer.
- `README.md`, `ArchipelagoClient.html` (rebuilt).

## Tested

Run in the Electron app against a local server with the real Archipelago 0.6.8 code and the real `tracker.apworld` (v0.3.5):

**A Short Hike slot (Bob):**
- Before install, the install offer showed.
- Install worked, and 83 of 131 checks were reachable.
- After other players sent items, the numbers updated live (78 of 101, then all reachable).
- The filter worked.
- The helper's "connected" line didn't appear in the feed.

**Meritous slot (Alice) with no YAML in Players:**
- The bar showed the "no YAML named Alice" error.
- "Choose YAML…" then gave 18 of 74 reachable.

**Clean-up and regression:**
- Both helpers stopped when the app quit.
- The earlier tests (tabs, mini window, recap, YAML form, updates) still pass.
