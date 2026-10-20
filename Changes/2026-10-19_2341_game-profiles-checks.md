# ArchipelagoVic 2.5.2: game profiles, storage and checks (Game profiles, step 3)

**Date:** 2026-10-19 23:41 (local time)
**Request:** "Go on to step 3 (game profiles: storage, path and ROM checks)." This is step 3 of Game profiles with a one-click Play button. Each profile is saved in the app config with:
- the game;
- the path to EmuHawk.exe;
- the original ROM;
- the patch file (chosen per session);
- an optional default room link or server.

Every path is checked when saving and again before Play. The ROM's MD5 is compared with the hash the game expects, and a mismatch is explained in plain language: what it means and what to do.

This step adds the main-process side only. The profile screen comes in step 5, so the version stays 2.5.2 until the Play button lands.

## What a check reports

`checkProfile` returns one plain-language sentence for each field that's wrong (`emuhawk`, `rom`, `patch`, `server`). It also returns:
- the game;
- the ROM's size, MD5, cartridge title and name (when known);
- the patch's details;
- the hash(es) the ROM must have;
- the `host.yaml` setting that holds this game's ROM.

**EmuHawk:**
- it must be a full path;
- the file must be called `EmuHawk.exe`;
- it must exist.

If no path is set yet, the message says where to get BizHawk.

**Patch file** (optional when saving, because it changes every game):
- **It must exist and be an Archipelago patch.** A damaged or fake file gets "isn't an Archipelago patch file, or it's damaged. Download it again…".
- **Its game must match the profile's.** For example: "This patch is for Pokemon Red and Blue, but this profile is for Pokemon Emerald."
- **Patch types that aren't BizHawk built-ins** (custom worlds) are confirmed by asking Archipelago through the step 1 helper (`--inspect`).

**Which ROM is needed:**
1. the patch's own `base_checksum`;
2. otherwise, Archipelago's answer (the patch class's `hash`);
3. without a patch, the ROMs ArchipelagoVic knows for that game. For Pokémon, Red or Blue are both fine until a patch says which.

A ROM ArchipelagoVic recognizes also names the profile's game.

**ROM problems:**

| Situation | What it says |
|---|---|
| Wrong known ROM | "This is the Pokémon Blue (US/Europe) ROM, but this patch needs Pokémon Red (US/Europe). Choose your Pokémon Red ROM, or use a patch made for Pokémon Blue." |
| Already patched | Named `AP_…_P1_…` or sitting next to its own patch file: "…looks like a game Archipelago already patched. Patching needs the original, unpatched ROM." |
| Different Game Boy cartridge title | "Its cartridge title is "PKMN RED STAR", not "POKEMON RED", so it's a different game, a fan hack or a changed copy…" |
| Wrong size | "It's 2 MB, but Pokémon Red (US/Europe) is 1 MB. That usually means a different release (another region, a revision or a multi-game cartridge) or a hack." |
| Anything else | "It isn't an exact copy of … That usually means a different version or region (for example the Japanese release or a later revision), a copy that was already patched or changed, or a bad dump." |
| A `.zip`, `.7z` or `.rar` | "Unpack the ROM inside it first." |
| Missing or relative path | Says so. |

Every mismatch ends with "Use a clean copy of …, ideally dumped from your own cartridge." and gives the expected MD5 and the file's own MD5.

**Server:** it accepts `address:port` or an Archipelago room link (`https://…/room/<id>`). Anything else gets an example of the right form.

## Saving

**What `saveProfile` does:**
1. It keeps the profile even when something is wrong, so a half-finished profile (for example, BizHawk not installed yet) can be fixed later. The check results tell the window what to show.
2. It fills in the game from the patch or from a ROM it knows.
3. It writes only the parts that passed into `host.yaml`, through the step 2 writer: `bizhawkclient_options.emuhawk_path`, and the game's ROM setting (`pokemon_rb_options.red_rom_file` / `blue_rom_file`, or whatever the helper reports for other games). A bad EmuHawk path is never written.
4. If `host.yaml` can't be written, the profile is still saved, and the problem is reported.

**Where profiles live:** `config.profiles`, in `%APPDATA%\ArchipelagoVic\config.json`. Each profile has an `id`, `game`, `emuhawk`, `rom`, `patch`, `server` and `lastServer` (`lastServer` is for Play's pre-fill).

**Saving again** with the same `id` keeps the profile's place and the fields that weren't sent.

**ROM MD5s are cached** in `config.romFacts`, by path, size and modification time (50 entries at most). So a large ROM is only read once.

## Files

**`aplib.js`:**
- `inspectPatch` now also returns `baseChecksum` and `resultEnding`;
- new: `KNOWN_ROMS` (Pokémon Red and Blue: name, cartridge title, size, patch ending and `host.yaml` setting), `knownRomsFor`, `romFacts` (a streamed MD5 plus the Game Boy title), `romMismatch` (the plain-language messages) and `hasPatchNextTo`.

**`main.js`:**
- new "game profiles" section: `BIZHAWK_SUFFIXES`, `ROM_EXTENSIONS`, `cachedRomFacts`, `runPatchHelper` (runs the step 1 helper hidden, two-minute limit), `serverProblem`, `checkProfile`, `normalizeProfile` and `saveProfile`;
- IPC: `profile:list`, `profile:check`, `profile:save`, `profile:remove` and `profile:pick`. `profile:pick` is a file picker for EmuHawk.exe, the ROM or the patch, starting from the current path.

**`preload.js`:** `profiles`, `profileCheck`, `profileSave`, `profileRemove` and `profilePick`.

## Tested

The tests ran in a separate test copy of the app, started with `--user-data-dir` pointing to a temp folder, so your open ArchipelagoVic window, its rooms and its settings weren't used. Each check called `window.apvic.profileCheck` / `profileSave` in that window over the DevTools protocol, so the real IPC path was tested.

**28 of 28 passed** on the final run. The first run had 3 failures, all with one cause: a profile with no game and no patch didn't take the game from a ROM ArchipelagoVic recognizes. It was fixed by reading the ROM first. A test that sent a fan-hack ROM with no game was also wrong, and now sends the profile's game.

| # | Test | Result |
|---|---|---|
| 1 | Red ROM only | only EmuHawk is reported, ROM named "Pokémon Red (US/Europe)", setting `red_rom_file` |
| 2 | Blue ROM, no patch | fine, `blue_rom_file`, game "Pokemon Red and Blue" |
| 3 | Red ROM + Red patch (generated this session) + EmuHawk | fine, expected hash taken from the patch |
| 4 | Blue ROM with a Red patch | Blue-vs-Red message |
| 5 | Red with one byte changed (temp copy) | "isn't an exact copy", MD5 `5e088b3b…` |
| 6 | Red with its cartridge title changed to "PKMN RED STAR" (temp copy) | title message |
| 7 | Same file with no game and no patch | no hash check possible yet, no error |
| 8 | Red twice over (2 MB, temp copy) | size message |
| 9 | The patched game next to its patch | "already patched" |
| 10 | The Red `.zip` in `ROM\` | "unpack it first" (the zip was only read) |
| 11 | Missing ROM and EmuHawk paths | both reported |
| 12 | `notepad.exe` as EmuHawk | reported |
| 13 | Relative EmuHawk path | reported |
| 14 | Red patch in an "Emerald" profile | game mismatch |
| 15 | A text file named `.apred` | not a patch |
| 16 | A patch renamed `.apxyz` | Archipelago asked; "no game that uses .apxyz" |
| 17 | Missing patch | reported |
| 18–20 | `localhost:38281`, `archipelago.gg:59509`, `https://archipelago.gg/room/AbC-12_x` | accepted |
| 21–23 | `foo bar`, `localhost:99999`, a `/seed/` link | refused |
| 24 | Save with a bad EmuHawk path and the Red ROM | saved, game filled in, no `host.yaml` error |
| 25 | `host.yaml` after save | has the ROM path; `emuhawk_path` still `"None"` |
| 26 | List | shows the profile |
| 27 | Saving again by id | keeps the server, changes nothing in `host.yaml` |
| 28 | Remove | the list is empty |

## Your real host.yaml

The first save test made the feature's intended change:
- `host.yaml.apvic-backup` was created, byte-identical to your original;
- exactly one line changed (383 lines before and after). Line 227, `red_rom_file`, went from `"Pokemon Red (UE) [S][!].gb"` (a file that didn't exist) to `"C:\\Claude\\ArchipelagoVic\\ROM\\Pokemon Red.gb"`;
- `emuhawk_path` is still `"None"`. It will be set when you save a profile with your real EmuHawk;
- later runs changed nothing more.

## Not tested

- The profile screen, which doesn't exist yet (step 5).
- A real EmuHawk path. BizHawk isn't installed; an empty stand-in `EmuHawk.exe` in the temp folder was used for "path is fine", and it was never saved.

## Side effects and clean-up

- **Your open window came to the front once.** The first attempt to start the test copy used the wrong way to separate its settings, so it ran into the app's "only one copy" lock. All that does is bring the open window forward; nothing else happened.
- **Nothing left over:**
  - the temp folder was deleted: the test patch, the patched game, the broken ROM copies, the stand-in EmuHawk and the test copy's settings;
  - no test processes are left;
  - your own `config.json` has no profiles.
