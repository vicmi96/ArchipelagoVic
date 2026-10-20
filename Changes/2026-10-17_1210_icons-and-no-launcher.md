# Patch notes: ArchipelagoVic 2.1, game pictures and no official Launcher

**Timestamp:** 2026-10-17 12:10 PDT
**Stale-copy check:** I staged all 10 existing files from `C:\Claude\ArchipelagoVic` and compared them byte for byte with what I delivered at 01:25, 10:18 and 11:40. They were identical, so there were no local edits to merge.

**Files:**
- **New:** `aplib.js`, `game-art.json`.
- **Changed:** `main.js`, `preload.js`, `package.json` (version 2.1.0; the build now includes the two new files), `components.json`, `renderer/index.html`, `renderer/styles.css`, `renderer/client.js`, `renderer/launcher.js`, `README.md`, `ArchipelagoClient.html` (rebuilt).

## Game pictures everywhere a game appears
- Pictures appear in these places:
  - **Play:** the header (your game), the player list beside Activity, the Players tab, and recent rooms on the connect screen.
  - **Home:** recent rooms.
  - **Generate:** the players table and every template.
  - **Clients & tools:** each client, using its game's picture. Archipelago's own icon is used for general tools.
  - **Worlds:** installed worlds and the build list.
  - **Dialogs:** the patch, APWorld and room-link dialogs.
- **Where pictures come from:** `game-art.json` maps all 82 games in Archipelago 0.6.8, plus Oxygen Not Included, to a Steam app or a Wikipedia article. A game that isn't listed (a new custom world) is searched on Steam by exact name, then on Wikipedia. "Archipelago" uses `data\icon.png` from your install.
- **How they're stored:** downloaded once into `%APPDATA%\ArchipelagoVic\game-art` and served to the window through a private `apvic-icon://` address. Failed lookups are retried after 7 days.
- **Games with no art** (ChecksFinder, APQuest, Meritous, Paint, Yacht Dice…) get a lettered tile with a color fixed per game. The tile also shows while a picture is loading, so there are no empty boxes.
- **Right-click any picture** → "Use my own picture…" or "Reset picture". The menu also says where the current picture came from.
- **Settings → "Download game pictures from Steam and Wikipedia"** turns downloads off. Pictures you already have stay.

## The official Launcher is no longer used
**Now built into ArchipelagoVic:**
- **Install APWorld**, with a confirmation dialog first. The checks are the same as Archipelago's installer:
  - it's a zip with exactly one world folder named like the file, containing `__init__.py`.
  - It also reads `archipelago.json` for game, version, minimum/maximum Archipelago version and authors.
  - It warns if your Archipelago is too old or new, or if the name clashes with a built-in world.
  - It shows "Update" when replacing an installed copy, and lists any components the world adds.
- **Open patch file.** It reads the patch's `archipelago.json` and shows the game, slot, server and which client handles it. It then hands the file straight to that client's own program (e.g. `ArchipelagoOoTClient.exe file.apz5`). "Also follow it here" connects the text client to the same slot at the same time.
- **Build APWorlds.** It lists world folders from custom_worlds and built-in worlds, honors `data\GLOBAL.apignore` plus each world's `.apignore`, and writes the manifest the official tool writes. Output goes to `build\apworlds`. If it can't read a world's game name, it asks for it.
- **archipelago:// room links.** Settings → "Open archipelago:// room links in ArchipelagoVic". A link shows a "Join this room?" dialog with game, slot, server and whether a password is included. "Join here" connects the text client; "Start <client>" also starts that game's client for clients that support links.
  - Only one ArchipelagoVic window runs; a second link goes to the open window.
  - Turning the setting off hands links back to the official Launcher.
- **Drop files anywhere:** patch files open the patch dialog, `.apworld` files open the install dialog, and `.yaml` files are added to Players.
- Already built in from before: the Text Client, Host, Generate, host.yaml, Browse files and community links.

**Still run inside Archipelago's runtime, with no Launcher window:**
- 12 Python-only game clients: APQuest, Civ6, Factorio, Gauntlet Legends, Jak and Daxter, KH1, KH2, Link's Awakening DX, The Messenger, Saving Princess, Starcraft 2, The Wind Waker, Wargroove.
- Generate Template Options and Export Datapackage.
- Components added by custom worlds. ArchipelagoVic finds these by reading the world's code for `Component("…")`.

These are Python programs inside Archipelago with game-specific emulator or game-bridge code, and Archipelago doesn't ship a separate program for them. ArchipelagoVic starts them with `ArchipelagoLauncher.exe "<exact name>"`, which runs only that component. They're marked "runs in Archipelago" in Clients & tools.

**Safety:** ArchipelagoVic refuses to pass a built-in feature or an unknown name to `ArchipelagoLauncher.exe`, because an unknown name makes it open the full Launcher window. The free-text "start component by name" box was removed for the same reason; custom-world components are listed instead.

## Tested
- Ran end to end in Electron 44.4.5 against the mock Archipelago folder (wrapping real Archipelago 0.6.8 server and generator code).
- **Room link:** started the app with `archipelago://Vic:@localhost:38281?game=ChecksFinder`. The dialog appeared, "Join here" connected, and the header showed the game tile.
- **APWorld install:** used the real `oni.apworld` v0.9.11 release file. The dialog showed "Oxygen Not Included, v7.0.0, needs 0.6.4+, by ShadowKitty42" with the Steam picture, and the file was copied to custom_worlds.
- **Build:** built a test world folder. The `.apworld` held `__init__.py` and the manifest, and `__pycache__` and a `.sfc` ROM were excluded by GLOBAL.apignore.
- **Patch routing:** a test `.apz5` patch went straight to `ArchipelagoOoTClient.exe <file>`. SNI Client started its own program; Factorio Client started through the runtime.
- **Guards:** passing "Install APWorld" or an unknown name to the launcher was refused.
- **Pictures:** Steam pictures downloaded and displayed (A Hat in Time, A Short Hike, Civilization VI, Factorio, Oxygen Not Included). Wikipedia is blocked in my test environment, so those games showed lettered tiles there; on your PC they'll download.
- The earlier generate → host → join → reconnect test still passes.
