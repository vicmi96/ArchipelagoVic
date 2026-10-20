# Patch notes: real game icons, and game summaries (v2.2)

**Timestamp:** 2026-10-17 12:28 PDT
**Files changed:** `aplib.js`, `main.js`, `preload.js`, `game-art.json`, `README.md`, `renderer/index.html`, `renderer/styles.css`, `renderer/client.js`, `renderer/launcher.js`, `ArchipelagoClient.html` (rebuilt)
**Stale-copy check:** I staged all 10 from `C:\Claude\ArchipelagoVic` and compared them byte for byte with the 12:10 and 12:16 releases. They were identical.

## Icons are now real icons
Before, the small square in each list was the game's cover art, cropped. Now it's the game's actual icon:
1. **Your own icon**, if you set one (right-click → "Use my own icon…").
2. **SteamGridDB**, once you add your free API key in Settings → "Icons for games that aren't on Steam".
   - Steam games are matched by Steam app id; everything else by name search.
   - It picks the official icon first, then PNGs, square ones and the highest-voted. NSFW and joke icons are skipped.
   - Saving a key re-tries every game that had no icon.
3. **Steam's own app icon**, for Steam games, with no key needed:
   - the client icon (.ico, up to 256 px) via api.steamcmd.net;
   - otherwise the 32 px community icon via Steam's ICommunityService.
4. **Otherwise a lettered tile.** Without a SteamGridDB key, non-Steam games are re-tried daily; with a key, weekly.

Steam games that aren't in `game-art.json` (e.g. custom worlds) are matched through Steam's store search by exact name. The result is cached for 30 days.

## Game summaries
- **Open it** by clicking any game name or icon: in the Players tab, the Play header, Generate's players table, Worlds and Clients & tools. You can also right-click any icon or cover → "About this game…".
- **What it shows:**
  - the cover art (the pictures 2.1 used as icons);
  - title, a one-line description (e.g. "2019 video game") and genre tags;
  - developer, publisher, release date, series and platforms;
  - a summary paragraph;
  - who in the current room plays it;
  - links to the Archipelago game page (built-in games only), the Steam store page and Wikipedia.
- **Sources:**
  - Steam's store details: genres, developer, publisher, release date, platforms, short description.
  - The Wikipedia summary: description and summary paragraph.
  - Wikidata: genre, developer, publisher, platforms, series and first release date for games that aren't on Steam.
- Summaries are cached for 30 days in `game-art\info`.
- The patch, APWorld and room-link dialogs now show the cover instead of the icon.
- Right-clicking a cover offers "Use my own cover picture…" separately from the icon.

## Other
- Covers already downloaded by 2.1 are kept as covers; nothing is downloaded twice.
- `game-art.json` now also lists the 82 built-in game names (`_builtin`), used for the Archipelago game page link.
- Fixed a page helper that only flattened one level of nested lists. It printed "[object HTMLElement]" in the new summary's facts and "In this room" lines; no existing screen was affected.

## Tested
- Ran in Electron 44.4.5 against the mock install with a live Archipelago 0.6.8 server.
- **Icons:** A Short Hike, A Hat in Time, Civilization VI and Factorio got their real Steam app icons (A Short Hike's at 256 px). ChecksFinder, Meritous, APQuest, Adventure, Gauntlet Legends and Jak showed lettered tiles, as expected without a SteamGridDB key.
- **A Short Hike summary:** "2019 video game", Adventure and Indie, "In this room: Bob", developer and publisher adamgryu, released 30 Jul 2019, Windows/macOS/Linux, the Wikipedia summary, and links to the Archipelago page, Steam and Wikipedia.
- **Oxygen Not Included summary** (opened from Worlds): Klei Entertainment, Indie and Simulation, with the Wikipedia summary.
- **SteamGridDB:** I couldn't test it here, since it needs your key. It runs the first time you save one in Settings.
- The earlier test suites (generate → host → join → reconnect; APWorld install, build, patch routing, room link) still pass.
