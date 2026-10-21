# ArchipelagoVic 2.8.3: Home says why there's no update, instead of "up to date"

**Date:** 2026-10-21 09:20 (local time)
**Request:** "is the update working? i installed the 2.8.1 to test if it would update to 2.8.2, after pushing it to github, and it says it's already the latest version"

## What was going on

**The updater worked as designed, but Home misreported it.**
- **Installed and portable copies update only from GitHub Releases.** The repository has none yet: GitHub's API returned 0 releases, 0 tags, and 404 for `releases/latest`. Pushing commits to `main` updates copies run from git, not installed ones.
- **The installed 2.8.1 checked correctly.** It saved "ArchipelagoVic has no releases on GitHub yet" (in its `config.json`, `selfUpdate.note`).
- **Home hid that note** and showed "Everything is up to date. Checked 21 Oct, 09:17." That was misleading; only Settings showed the note.

## What changed

- **Home → Updates now shows ArchipelagoVic's note** whenever it couldn't look for an update, and never hides it behind "up to date". When Archipelago and your worlds have nothing new, that's said separately: "Archipelago and your worlds are up to date. Checked …"
- **The note now reads** "No ArchipelagoVic release is published on GitHub yet, so this copy has nothing to update to."
- **README troubleshooting:** "An installed or portable copy says it has nothing to update to", explaining Releases versus pushing to `main`.

## Files

- **`renderer/launcher.js`:** `renderUpdates` shows the self-update note and separates "Archipelago and your worlds are up to date".
- **`main.js`:** the no-releases note's wording.
- **`README.md`:** the troubleshooting entry.
- **`package.json`:** 2.8.3.

## Tested

- **`Build installer.cmd`** (exit 0) built `dist\ArchipelagoVic-Setup-2.8.3.exe` and `dist\ArchipelagoVic-2.8.3-portable.exe`.
- **The built app** (`win-unpacked`, its own settings folder) reports version 2.8.3, as an installed copy. Home → Updates reads: "No ArchipelagoVic release is published on GitHub yet, so this copy has nothing to update to. | Archipelago and your worlds are up to date. Checked 21 Oct, 09:19. | ArchipelagoVic 2.8.3 · Archipelago 0.6.8 | Check now".
- **`node --check`** passes for `main.js` and `renderer/launcher.js`.

**Not tested yet:** the real installed-copy update. It needs a published release. The next step is to publish release `v2.8.3` with the two 2.8.3 files, then press Check now in the installed 2.8.1.
