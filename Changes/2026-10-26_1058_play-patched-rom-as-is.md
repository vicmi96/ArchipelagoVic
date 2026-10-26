# ArchipelagoVic 2.9.1: play an already patched ROM as it is

**Date:** 2026-10-26 10:58 (local time)
**Request:** A tester's report, passed on: Pokémon Red works now, but Zelda 2 and Kirby: Nightmare in Dreamland "are the sort where you patch the file once and it creates a new ROM file. If you put them in with the patch, it complains that there's a patch and it doesn't need a patch. If you take out the patch, you can save it, but if you try to run it, it prompts for the patch."

## Why it happened

**A game profile only knew one way to play:** original ROM + patch file, patched on every new patch. The tester had the patched game (the `AP_…` file a patch makes) and wanted to play that.

- **With the patched ROM and the patch,** the ROM check compared the ROM's MD5 with the original the patch needs. The patched game never matches, so the ROM line said it "looks like a game Archipelago already patched" and asked for the original.
- **With the patched ROM and no patch,** nothing was wrong to check, so the profile saved, but Play always stopped at "Choose this game's patch file".

## What changed

- **A ROM that's already patched is played as it is.** Play skips patching ("Not needed: … is played as it is.") and starts EmuHawk with that ROM. This happens when:
  - **no patch file is chosen,** and the ROM isn't an original ArchipelagoVic knows (Pokémon Red and Blue are the ones it knows); or
  - **the ROM has the same name as the chosen patch file,** so it's that patch's output (`AP_1_P1_Vic.apz2` → `AP_1_P1_Vic.nes`).
- **The game and slot still show** when the patch file is still next to the patched ROM: they're read from it.
- **A patched ROM is never written into `host.yaml`** as the game's original ROM.
- **An original ROM without a patch** still can't be played. Play now says why: "Pokémon Red (US/Europe) is an original ROM, so it needs this game's patch file…".
- **A patched ROM from a different patch** still gets an error on the ROM line, which now gives both ways out: clear the patch file to play that ROM as it is, or choose the original ROM to play this patch.
- **Wording on the BizHawk tab:**
  - the ROM field is "ROM" ("The original game, or one Archipelago already patched"), no longer "Original ROM (not patched)";
  - the Patch field says to leave it empty for a ROM that's already patched;
  - a card for such a ROM says "Ready to play this ROM as it is", and its Patch line reads "None: the ROM is already patched", with the slot when known;
  - the Play sheet says it "Patches your ROM if it needs it".

## Files

- **`aplib.js`:** `fileStem` and `patchNextTo` (the patch file next to a ROM); `hasPatchNextTo` uses it; the clearer "already patched" message.
- **`main.js`:**
  - `checkProfile` reports `asIs` and `slot`, skips the MD5 check for a ROM played as it is, and gives it no `host.yaml` setting;
  - `playProfile` plays an `asIs` ROM without patching, and asks for a patch only for an original ROM.
- **`renderer/launcher.js`:** the BizHawk tab wording above.
- **`README.md`:** the BizHawk feature list and the troubleshooting line.
- **`package.json`:** 2.9.1.

## Tested

A test script loaded the real `main.js` with Electron stubbed out, then ran `checkProfile` and `playProfile` on test files in a temp folder: the Red ROM from `ROM\`, a made-up Red patch `AP_1_P1_Vic.apred`, its "patched" ROM (the Red ROM with one byte changed), a second patched ROM from "another seed", and an unknown `Zelda II.nes`. Play ran against a local test port, with the EmuHawk and BizHawk Client starts recorded instead of run.

**11 of 11 passed:**
1. **Original ROM + patch:** fine, patched as before; `host.yaml` setting `red_rom_file`.
2. **Patched ROM + its own patch:** fine, played as it is, slot Vic, no `host.yaml` setting.
3. **Patched ROM, no patch (patch still next to it):** fine, game "Pokemon Red and Blue" and slot Vic read from that patch.
4. **Patched ROM from another seed + patch:** ROM error with both ways out.
5. **Original ROM, no patch:** the check is fine (the patch is chosen at Play).
6. **Blue ROM + Red patch:** the same error as before.
7. **Unknown ROM, no patch:** fine, played as it is.
8. **No ROM:** "Choose the game's ROM: the original, or a game Archipelago already patched."
9. **Play, patched ROM with no patch:** patching skipped; EmuHawk got `--lua=…connector_bizhawk_generic.lua AP_1_P1_Vic.gb`; the client got `--connect`.
10. **Play, unknown ROM with no patch:** started as it is.
11. **Play, original ROM with no patch:** stops at the check step with the new message; nothing was started.

**Also checked:** `node --check` passes for `main.js`, `aplib.js` and `renderer/launcher.js`.

**Not tested:** real Zelda II and Kirby: Nightmare in Dreamland ROMs and patches (not on this PC), and the BizHawk tab on screen.
