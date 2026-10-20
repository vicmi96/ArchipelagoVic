# ArchipelagoVic 2.6.2: theme pictures are part of the project

**Date:** 2026-10-20 00:42 (local time)
**Request:** "also remove the anime images folder from the git ignore, since i drew those"

## What changed

The anime theme pictures in `theme-pictures/` are your own drawings, so they're now tracked by git and can be pushed to GitHub with the project. Until now, everything in that folder except `README.txt` was git-ignored (2.5.2).

## Files

- **`.gitignore`:** removed the `theme-pictures/*` and `!theme-pictures/README.txt` rules and their comment. The ROM and patch-file rules are unchanged.
- **`theme-pictures/README.txt`:** no longer says the folder is git-ignored. It now says the pictures there are original drawings by the author, and that saving a picture with the same name replaces one.
- **`README.md`:**
  - the Theme paragraph no longer says "That folder is git-ignored"; it says the anime themes come with the author's drawings;
  - the project layout lists `theme-pictures/`.
- **`package.json`:** 2.6.2.
- **New in git:** 11 pictures, 26.5 MB in total (2.1–2.8 MB each, under GitHub's file-size limits): `attack-on-titan.png`, `cowboy-bebop.png`, `demon-slayer.png`, `evangelion.png`, `frieren.png`, `fullmetal-alchemist.png`, `jujutsu-kaisen.png`, `naruto.png`, `one-piece.png`, `sailor-moon.png` and `spy-family.png`.

## Tested

- `git check-ignore -v theme-pictures/frieren.png` reports nothing (exit code 1), so the file is no longer ignored, and `git status` lists all 11 pictures.
- ROMs are still ignored: nothing under `ROM/`, no `.gb` and no patch file is staged.

## Not changed

**The installer still doesn't include `theme-pictures/`.** Its file list in `package.json` → `build.files` doesn't have it. Running from the source, or adding it to that list, would ship the pictures.
