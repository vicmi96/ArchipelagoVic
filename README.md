<p align="center">
  <img src="renderer/icon.png" width="96" alt="ArchipelagoVic icon">
</p>

<h1 align="center">ArchipelagoVic</h1>

<p align="center">
  A friendlier launcher and text client for <a href="https://archipelago.gg">Archipelago</a> multiworld randomizers.<br>
  See who sent what to whom, what's still out there, and everyone's progress, in one window.
</p>

<p align="center">
  <img src="docs/screenshots/play.png" alt="ArchipelagoVic following a room: activity feed with colour-coded items, player list and stats" width="900">
</p>

ArchipelagoVic replaces the official Archipelago Launcher and its text client. It uses the Archipelago install already on your PC (found automatically in `C:\ProgramData\Archipelago`) for the server, the generator and the game clients, so you never need to open the official Launcher.

> Unofficial fan project. Not affiliated with or endorsed by the Archipelago team.

## Contents

- [Features](#features)
- [Install](#install)
- [Using it](#using-it)
- [Screenshots](#screenshots)
- [Building from source](#building-from-source)
- [Troubleshooting](#troubleshooting)
- [Project layout](#project-layout)
- [License](#license)

## Features

**Following a game**
- **Readable activity feed.** Every line says who found what for whom and where ("Vic → Bob · Fishing Journal, at Tile 2 in Vic's world"). Items found in your own world are labelled as yours.
- **Colours that mean something.** ★ gold for key items someone needs to progress, ▲ blue for useful, ✖ red for traps, ● grey for filler. A colour guide sits right next to the feed.
- **Received, Checks left, Hints and Players tabs**, with search, filters by player, and "key items only".
- **What you can reach right now.** Checks left marks every remaining check as *Reachable*, *Glitched* or *Not yet*, based on the items you have, and "Only what I can reach" hides the rest. It's built in, so there's nothing to install: ArchipelagoVic carries [Universal Tracker](https://github.com/FarisTheAncient/Archipelago/releases)'s logic engine, sets it up the first time, and runs it in the background.
- **"Key items still out there."** Your hinted key items that haven't been found yet, front and centre.
- **Alerts** (sound, flashing taskbar, desktop notification) when a key item arrives or someone hints for something in your world.
- **History survives reconnects.** Everything you've seen in a room is kept and shown again when you rejoin.
- **Quick commands:** Ask for a hint, Items left in my world, Everyone's progress, Collect and Release (with confirmation), plus Tab-completion for item and location names.
- **Game recap.** Checks over time, who sent you the most, your first key item. It opens by itself when you reach your goal.

**Several rooms, and staying out of the way**
- **One tab per room.** Play several games at once, each with its own unread count and ★ waiting items. Open rooms come back the next time you start the app.
- **Mini window** that stays on top of borderless-fullscreen games and shows every room's checks and the latest items you got.
- **Lives in the tray.** Closing the window keeps your rooms connected. You can turn this off in Settings.
- **Quit** at the bottom of the sidebar (or Ctrl+Q) really closes ArchipelagoVic. If you're in a room or hosting a server, it asks first.

**One-click Play for BizHawk games** (Pokémon Red and Blue, and other games the BizHawk Client plays)
- **Set a game up once** in the BizHawk tab: where EmuHawk.exe is and your original ROM. There's no game name to type: ArchipelagoVic reads it from the ROM or the patch file (for example "Pokemon Red and Blue · Pokémon Red (US/Europe)"). It checks every path and the ROM's MD5. If the ROM is wrong, it says why in plain words (another version or region, already patched, a hack or a bad dump) and what to do.
- **Press Play** and choose the room (address or archipelago.gg room link, the last one is filled in) and this game's patch file. ArchipelagoVic then:
  1. checks the room is running;
  2. patches your ROM (skipped when it's already done);
  3. starts EmuHawk with the Archipelago connector script;
  4. starts the BizHawk Client connected to the room;
  5. opens the room in a Play tab, so you see the activity feed too.

  A list shows each step as it happens. If one fails, it says why and closes anything it had started.
- **Uses the room's current port.** The BizHawk Client is started with the room's address instead of the patch file, because a patch remembers the port the room had when it was made, and archipelago.gg rooms get a new port when they restart.

**archipelago.gg rooms**
- **Paste a room link** (`https://archipelago.gg/room/…`). ArchipelagoVic wakes the room, finds its port and remembers the link.
- **Live tracker.** In link rooms, the Players tab shows everyone's real progress from the website: checks done, items received, last active.
- **Generate and host on archipelago.gg** in one click: no port forwarding, just send your friends the room link. This only works for games that ship with Archipelago.

**Everything the official Launcher does**
- **Host** a multiworld on your PC with a live server console and quick server commands.
- **Generate** from your Players folder, with spoiler and race options, then host it in one click.
- **Edit player YAMLs in a form**: dropdowns, number boxes, option descriptions and search. Comments are kept, and a raw text view is one click away.
- **Worlds:** install `.apworld` files (it checks the game, the Archipelago version it needs and clashes with built-in worlds), update them from GitHub, remove them, and build `.apworld` files from world folders.
- **Clients & tools:** every game client, tool and adjuster in your install, including ones custom worlds add. Python-only clients start inside Archipelago's own runtime, with no Launcher window.
- **Patch files and `archipelago://` links** open straight into the right client.
- **Update checks** for Archipelago and your custom worlds.
- **ArchipelagoVic updates itself.** It looks for a new version when it starts (at most every 12 hours; you can turn this off in Settings) and shows it in Home → Updates. **Update…** then does the rest:
  - **installed copy:** downloads the new installer from GitHub, checks it against GitHub's checksum, installs it and restarts;
  - **portable copy:** downloads the new portable `.exe` next to the old one, checks it and starts it;
  - **copy run from a git checkout:** runs `git pull` (and `npm install` when needed) and restarts. It refuses if you have uncommitted changes.
- **Game icons and summaries** (from Steam, SteamGridDB and Wikipedia).
- **17 colour themes** (Settings → Theme):
  - general ones: Archipelago with Auto/Light/Dark, Midnight, Parchment, Forest, Rosé and High contrast;
  - palettes inspired by anime: Frieren, Fullmetal Alchemist, One Piece, Naruto, Demon Slayer, Jujutsu Kaisen, Evangelion, Sailor Moon, Cowboy Bebop, Attack on Titan and Spy × Family.

  Every theme recolours the whole app, room tabs and the mini window, and keeps item colours meaning the same thing. You can give any theme your own picture (a favourite character, fan art…), shown at the bottom of the sidebar. Use "Choose picture…" in Settings, or drop images named after the themes (`frieren.png`, `one-piece.jpg`…) into the `theme-pictures` folder; `theme-pictures/README.txt` lists the names. The anime themes come with original drawings by the author in that folder; save your own picture under the same name to replace one.

## Install

### Option 1: installer

Download **`ArchipelagoVic-Setup-<version>.exe`** from the [Releases page](https://github.com/vicmi96/ArchipelagoVic/releases) and run it. The portable `.exe` from the same page runs without installing.

Windows SmartScreen may warn the first time because the installer isn't code-signed. Choose **More info → Run anyway**.

### Option 2: run from the source

1. Install [Node.js LTS](https://nodejs.org) (once).
2. Download or clone this repository.
3. Double-click **`Start ArchipelagoVic.cmd`**. The first run downloads Electron (about a minute); after that it opens straight away.

### Requirements

- Windows 10 or 11.
- [Archipelago](https://github.com/ArchipelagoMW/Archipelago/releases) 0.6.x installed, for hosting, generating and game clients. Just following a game works without it.

## Using it

| Section | What it's for |
|---|---|
| **Home** | Right now (your rooms, the server, updates), common tasks as tiles, recent rooms, community links. Drop a patch file, `.apworld` or YAML anywhere on the window. |
| **Play** | The text client, one tab per room. Type a server address (`archipelago.gg:38281`) or paste a room link, enter your slot name, then Connect. |
| **BizHawk** | One-click Play for BizHawk games: add a game once (EmuHawk.exe and your original ROM), then Play patches, starts EmuHawk and the BizHawk Client, and joins the room. |
| **Host** | Runs `ArchipelagoServer.exe` on a generated game. "Join this game" connects you to it. |
| **Generate** | Your Players folder (add, edit, remove, start from a template). "Generate on this PC" or "Generate and host on archipelago.gg". |
| **Worlds** | Install, update, remove and build `.apworld` files. |
| **Clients & tools** | Start any game client or tool from your Archipelago install. |
| **Settings** | Archipelago folder, `host.yaml` (a backup is kept), tray behaviour, `archipelago://` links, game pictures, SteamGridDB key, alerts and theme. |

**Tips**
- **Reachable checks** work out of the box. Most games need the YAML you made for your slot. ArchipelagoVic looks in your Players folder for one with your slot name; if it isn't there, use "Choose YAML…".
- Click any game's name or icon for its summary: cover, genre, developer, release date and links. Right-click an icon to use your own picture.
- Games that aren't on Steam (Zelda, Pokémon…) need a free [SteamGridDB API key](https://www.steamgriddb.com/profile/preferences/api) for their icon. Add it under Settings.
- Just want the text client in a browser? Open `ArchipelagoClient.html`. It needs no install, but it can't host, generate, launch anything or use room links.

### How Play patches your game

Play patches with a small hidden helper, **ArchipelagoVic Patch** (`logic/apvic_logic/patcher.py`). It runs inside your Archipelago install's own runtime (`ArchipelagoLauncherDebug.exe "ArchipelagoVic Patch"`), calls Archipelago's own patch code and writes the patched game next to the patch file, as Archipelago does. No Archipelago window or file picker opens, and it never rewrites `host.yaml`.

The other way, opening the patch with the BizHawk Client, was tried and not used:
- it always opens the client's window;
- it connects to the server stored in the patch, which goes stale when a room restarts;
- it shows a pop-up if patching fails.

Saving a game also sets these in `host.yaml`, so Archipelago's own tools use the same files:
- `bizhawkclient_options.emuhawk_path`;
- the game's ROM setting, for example `pokemon_rb_options.red_rom_file`.

Only those lines change; comments and everything else stay. The first time, your original is kept as `host.yaml.apvic-backup`.

## Screenshots

| | |
|---|---|
| ![Recap shown when you reach your goal](docs/screenshots/recap.png) | ![Player YAML in the form editor](docs/screenshots/yaml-form.png) |
| **Recap** when you reach your goal | **YAML form editor** with option search |
| ![Generate and host on archipelago.gg](docs/screenshots/host-online.png) | ![Worlds with update checks](docs/screenshots/worlds.png) |
| **Generate and host on archipelago.gg** | **Worlds** with update checks (light theme) |

<p align="center"><img src="docs/screenshots/mini-window.png" alt="Always-on-top mini window" width="320"><br><b>Mini window</b>, always on top</p>

## Building from source

```bat
npm install
npm start
```

**Build the installer:** double-click **`Build installer.cmd`**, or run `npm run dist`. It writes these to `dist\`:
- `ArchipelagoVic-Setup-<version>.exe` (installer);
- `ArchipelagoVic-<version>-portable.exe` (portable);
- `win-unpacked\` (the unpacked app).

The build includes everything ArchipelagoVic needs:
- the BizHawk tab's patch helper and the built-in Universal Tracker (`logic\`);
- the theme pictures, inside the app's `resources\theme-pictures`. A `theme-pictures` folder next to the `.exe` can still override them.

`dist\` and `node_modules\` are in `.gitignore` because they're over GitHub's 100 MB file limit. To share a build, attach the Setup `.exe` to a [GitHub Release](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository) instead.

**Publishing an update:**
1. Bump `version` in `package.json` and build.
2. On GitHub, create a release whose tag is that version (for example `v2.8.0`).
3. Attach `ArchipelagoVic-Setup-<version>.exe` and `ArchipelagoVic-<version>-portable.exe` to it.

Installed and portable copies find the new release by themselves; copies run from git update from `main`. GitHub publishes a SHA-256 checksum for every attached file, and ArchipelagoVic only installs a download that matches it.

**Rebuild the browser-only client:** `npm run standalone` regenerates `ArchipelagoClient.html` from `renderer/`.

## Troubleshooting

- **"Windows cannot find node_modules\electron\dist\electron.exe".** npm installed Electron's package but skipped its download. Run `Start ArchipelagoVic.cmd` again; it finishes the download itself. To do it by hand: `node node_modules\electron\install.js`.
- **The Electron download fails.** Check your internet connection and whether antivirus is blocking it, then run the start file again.
- **"Archipelago not found".** Settings → Change folder, then pick the folder that contains `ArchipelagoLauncher.exe`.
- **Can't connect to an archipelago.gg room.** Rooms go to sleep after a while. Paste the room link instead of the address, and ArchipelagoVic wakes the room and finds its new port.
- **Hosting online says a game isn't supported.** archipelago.gg can only generate games that ship with Archipelago. Generate and host games from custom `.apworld` files on your PC.
- **"Couldn't work out what you can reach".** Usually the YAML is missing or doesn't match the game you're playing. Use "Choose YAML…" and pick the YAML you made for that slot. "Details" shows Universal Tracker's own message. A few game worlds ask trackers not to work out their logic, and ArchipelagoVic respects that.
- **The BizHawk tab says the ROM isn't right.** Archipelago patches need the exact original game; the message says what's different. A ROM inside a `.zip` has to be unpacked first. Choose the unpatched ROM, not the `AP_…` file Archipelago made.
- **The BizHawk tab can't find EmuHawk.** Install BizHawk from [tasvideos.org/BizHawk](https://tasvideos.org/BizHawk) (it's a zip you unpack anywhere), then choose `EmuHawk.exe` in the game's Edit. On a new PC, run BizHawk's prerequisites installer once if EmuHawk closes straight away.
- **The BizHawk Client doesn't say "Connected".** It connects to EmuHawk through the connector script. In EmuHawk, Tools → Lua Console should list `connector_bizhawk_generic.lua` as running.
- **Checks don't show up in the feed.** Look for one of these:
  - **EmuHawk isn't set to run in the background.** Tick Config → Customize → "Run in background". Without it EmuHawk pauses when you click another window, and the BizHawk Client loses it ("Connection timed out").
  - **The game is still on its title screen.** Checks are only sent once you're in the game (Pokémon: after New Game or Continue).
  - **The BizHawk Client window was closed.** It's Archipelago's own program and the bridge between EmuHawk and the room, so keep it open while you play.
- **An installed or portable copy says it has nothing to update to.** Those copies only update from GitHub **Releases**, not from commits pushed to `main`. Publish a release (see "Publishing an update" above), then use Home → Updates → Check now.
- **Where's my data?** Settings, saved rooms, history, game pictures and game profiles are in `%APPDATA%\ArchipelagoVic`.

## Project layout

```
main.js                 Electron main process: runs Archipelago programs, files, tray, updates
preload.js              The fixed set of actions the window may ask the main process for
aplib.js                Zip, APWorld and patch handling; game icons, covers and summaries
components.json         Every Archipelago Launcher component and how ArchipelagoVic runs it
game-art.json           Where each game's picture comes from (Steam app or Wikipedia article)
logic/apvic_logic/      Small Archipelago add-on with two hidden helpers: Universal Tracker's logic
                        without its window (bridge.py), and patching for Play (patcher.py)
logic/universal-tracker/  Built-in copy of Universal Tracker (tracker.apworld) and its MIT license
                        (installed into custom_worlds as apvic_logic.apworld when needed)
renderer/
  index.html, launcher.js   Main window: Home, Play tabs, BizHawk, Host, Generate, Worlds, Tools, Settings
  client.html, client.js    One room (the text client); also the browser-only client
  mini.html, mini.js        Always-on-top mini window
  yamlform.js               Form editor for player YAMLs
  themes.js                 Colour themes and the theme picker
  styles.css                Shared styles (light and dark)
  icon.png, icon.ico        App icon
tools/build-standalone.js   Builds ArchipelagoClient.html
Changes/                    Timestamped patch notes for every change
docs/screenshots/           Images used in this README
theme-pictures/             Theme pictures (original drawings by the author) and the file names each theme uses
ROM/                        Your own ROMs for testing (git-ignored: ROMs are never committed)
```

## License

[MIT](LICENSE) © 2026 Victória Miranda.

Archipelago is © its contributors and released under the MIT License. The built-in [Universal Tracker](https://github.com/FarisTheAncient/Archipelago) is by FarisTheAncient and contributors, also MIT (see `logic/universal-tracker/LICENSE.txt`). Game names, icons and cover art belong to their respective owners and are downloaded to your PC only for display.
