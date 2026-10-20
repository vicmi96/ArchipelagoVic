# ArchipelagoVic 2.5.2: ROMs and patch files are never committed

**Date:** 2026-10-19 23:24 (local time)
**Request:** "add the .gitignore rules, unpack the .gb files into ROM\, and carry on up to the plan." This is the first step of the Game profiles / Play button work. The full request asks for `ROM/`, the ROM file types and patch files to be git-ignored, because ROMs must never be committed.

The version stays 2.5.2. It will be bumped, and the README updated, when the Game profiles feature itself lands.

## What changed

**`.gitignore`** now ignores:
- the whole `ROM/` folder;
- ROM files anywhere: `*.gb`, `*.gbc`, `*.gba`, `*.sfc`, `*.smc`, `*.nes`, `*.z64`, `*.n64`, `*.iso`, `*.bin`. This also covers patched ROMs, which Archipelago writes with the ROM's own extension;
- Archipelago patch files: `*.ap*` (`.apred`, `.apblue`, …);
- generated games: `AP_*.zip`.

**`.apworld` files are kept.** `*.ap*` would also match `.apworld`, and `logic/universal-tracker/tracker.apworld` is committed. So the rule `!*.apworld` keeps apworlds tracked.

**`ROM\` (not in git):** unpacked the `.gb` from each zip that was already there:
- `Pokemon Red.gb`;
- `Pokemon - Blue Version (USA, Europe) (SGB Enhanced).gb`.

The zips and the zipped `readme.html` were left as they were.

## Tested

- **ROM hashes** after unpacking:
  - `Pokemon Red.gb` = `3d45c1ee9abd5738df46d2bdda8b57dc`, the original Pokémon Red (US/Europe);
  - the Blue file = `50927e843568814f7ed45ec4f944bd8b`, the original Pokémon Blue.
- **Earlier files that didn't match** (since removed from `ROM\`):
  - `Pokemon Red-Blue 2-in-1 (Unl) [S].gb`: a 2 MB bootleg, MD5 `c16d65c7…c791`;
  - `red-star-2020-08-18.gb`: the "Red Star" fan hack, MD5 `543bff08…3373`.
- **`git check-ignore -v`:**
  - `ROM/Pokemon Red.gb` is ignored by `ROM/`;
  - `test.apred` is ignored by `*.ap*`;
  - `logic/universal-tracker/tracker.apworld` is not ignored.
- **Nothing in `ROM/` was ever tracked:** `git ls-files ROM` is empty, and before this change `git status` listed `ROM/` as untracked only. No history change is needed.
- **After the change,** `git status` no longer lists `ROM/`.
