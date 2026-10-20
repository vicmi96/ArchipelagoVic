# GitHub README, screenshots and a one-click git fix

**Date:** 2026-10-19 19:26 (local time)
**Requests:**
- "can we build a readme"
- "run the gitignore for me"

## README.md (rewritten for the GitHub page)

The README was rewritten as the repository's front page. The previous README had the right facts, but they were spread across version notes. Sections:

- **Header:** centred app icon, name, one-line pitch, a large screenshot of a room, and an unofficial-project note.
- **Contents:** links to every section.
- **Features**, in four groups:
  - following a game (feed, colours, tabs, key items still out there, alerts, history, quick commands, recap);
  - several rooms (tabs, mini window, tray);
  - archipelago.gg rooms (room links, live tracker, online hosting);
  - everything the official Launcher does (host, generate, YAML form, worlds, clients, patch files and links, update checks, icons).
- **Install:**
  - installer from GitHub Releases, including the SmartScreen note;
  - running from the source with `Start ArchipelagoVic.cmd`;
  - requirements (Windows 10/11, Archipelago 0.6.x).
- **Using it:** a table of every section, plus tips (game summaries, SteamGridDB key, browser-only client).
- **Screenshots:** recap, YAML form, online hosting and Worlds (light theme) in a 2×2 grid, plus the mini window.
- **Building from source:** `npm install` and `npm start`, then `Build installer.cmd` / `npm run dist` and what lands in `dist\`. It explains why `dist\` and `node_modules\` are git-ignored and to use GitHub Releases for builds instead. Also covers `npm run standalone`.
- **Troubleshooting:** missing electron.exe, a failed download, "Archipelago not found", sleeping archipelago.gg rooms, online hosting refusing custom games, where data is stored.
- **Project layout:** a tree of the files and folders with one line each.
- **License:** MIT © 2026 Victória Miranda (from LICENSE), with credit to Archipelago's contributors and to the owners of the game art.

## New docs/screenshots/

Six screenshots taken from the current version (2.3.1) in the test setup:
- `play.png`
- `recap.png`
- `mini-window.png`
- `yaml-form.png`
- `host-online.png`
- `worlds.png`

Together they're about 670 KB.

## New "Fix git (remove dist and node_modules).cmd"

Commands can't be typed into a terminal on your PC from this session, so this script does the `.gitignore` clean-up in one double-click. It:

1. Checks that git is installed and that `.gitignore` is present.
2. Runs `git rm -r --cached --ignore-unmatch dist node_modules`, which stops tracking those folders. Files on disk are untouched.
3. Runs `git add -A`, which stages `.gitignore` and anything else new or changed (this README, `docs/screenshots`, the patch notes). The script itself is left out.
4. Commits, depending on what's on GitHub:
   - if GitHub doesn't have a `main` branch yet, it amends the existing commit (`--amend --no-edit`), so the oversized files never reach GitHub;
   - otherwise it makes a new commit, "Stop tracking dist and node_modules".
5. Runs `git push -u origin main`.

It stops with a clear message if the commit or the push fails. It's safe to run again: once GitHub has the branch, a second run just commits and pushes whatever changed. You can delete the script once it has run.
