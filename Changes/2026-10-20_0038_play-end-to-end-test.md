# ArchipelagoVic 2.6.1: real end-to-end test of Play, and fixes from it (Game profiles, step 6)

**Date:** 2026-10-20 00:38 (local time)
**Request:** "download BizHawk-2.11.1-win-x64.zip from the official GitHub release, check its hash, unpack it to C:\BizHawk-2.11.1, then run the real end-to-end test." This is the testing part of Game profiles with a one-click Play button. Each of these has to be confirmed, saying how:
- EmuHawk opens with the game and the Lua script;
- the BizHawk Client reports "Connected";
- the room tab shows the slot online;
- a location check made in-game appears in the feed.

Then the error paths (wrong ROM, missing EmuHawk, room not running), and at the end: close everything, restore `host.yaml` except the feature's keys, delete temp files.

## BizHawk install

1. **Downloaded** `BizHawk-2.11.1-win-x64.zip` (97,984,101 bytes) from github.com/TASEmulators/BizHawk, release 2.11.1, after you approved it.
2. **Checked its SHA-256:** `dd7cbd5e205b09c5bce6afabc4f8aa525acc0bbeb9753b198a8db3fe6a5e5717`, which matches the `sha256:` digest GitHub publishes for that file.
3. **Unblocked and unpacked it to `C:\BizHawk-2.11.1`.** No file kept a "from the internet" mark, and `EmuHawk.exe` reports version 2.11.1.0.
4. **Deleted the zip.**

**Prerequisites** were already on this PC (.NET Framework 4.8.1 and the Visual C++ 2015–2022 runtime), so no installer was run. Archipelago's connector script supports BizHawk 2.7–2.11.

## How the test ran

- **Test YAML:** single player, Pokémon Red, `trap_percentage: 0`. Generated with `ArchipelagoGenerate.exe` into a temp folder (seed `78651639654775134922`). From the spoiler, the first checks are right at the start: **Player's House 2F – Player's PC** (TM17 Submission) and **Route 1 – Free Sample Man**.
- **A test copy of ArchipelagoVic** was started with its own settings folder, so your open ArchipelagoVic window and its archipelago.gg room weren't touched. It was driven through its real screens over the DevTools protocol:
  1. the **Host** view hosted the game on `localhost:38281`;
  2. **Games → Add a game** used `C:\BizHawk-2.11.1\EmuHawk.exe` and `ROM\Pokemon Red.gb`;
  3. **Play** ran with the room `localhost:38281` and the generated `.apred`.

## Results

| What | How it was verified | Result |
|---|---|---|
| Add a game | the form's status line (screenshot) | "Everything checks out: Pokémon Red (US/Europe)." |
| `host.yaml` on save | file diff | only `emuhawk_path` changed (`"None"` → `"C:\\BizHawk-2.11.1\\EmuHawk.exe"`); `red_rom_file` was already set in step 3 |
| Play | progress list | all six steps done; patched game written next to the patch |
| **EmuHawk opens with the game and the Lua** | Windows process list; your confirmation; my screenshot | command line `EmuHawk.exe --lua=C:\ProgramData\Archipelago\data\lua\connector_bizhawk_generic.lua …\AP_78651639654775134922_P1_VicTest.gb`. You confirmed the game showed and the Lua Console had the connector running; my screenshot showed "Pokémon Archipelago – Red Version" |
| **BizHawk Client "Connected"** | its log in `C:\ProgramData\Archipelago\logs`, and its window title | "Connected", "Connected to BizHawk", "Running handler for Pokemon Red and Blue"; title "Archipelago BizHawk Client 0.6.8 \| Connected to: ws://localhost:38281". Command line `--connect localhost:38281`, no patch file |
| **Room tab shows the slot online** | the tab's status, and a screenshot | connected as VicTest; Players list shows "Pokemon Red and Blue · online"; the server logged "VicTest (Team #1) playing Pokemon Red and Blue has joined" |
| **In-game check in the feed** | server log, client log, feed screenshot | see below |

### The in-game check

**The first two attempts didn't reach the server.** The logs and screenshots showed why:
1. **EmuHawk lost contact with the client.** The client logged "Lost connection to BizHawk: Connection timed out" at 00:26:57. EmuHawk was then closed normally at 00:27:00 (it wrote its config and save; Windows logged no crash), and the client window at 00:27:06. You confirmed you closed them. The Pokémon setup guide in the install explains the timeout: without EmuHawk's Config → Customize → "Run in background", EmuHawk pauses when another window is clicked.
2. **After Play was started again, my screenshots showed the game still on its title screen.** The Pokémon client sends nothing until a game is loaded: `GameStatus` 0 means "Do not handle anything before game save is loaded" (`worlds/pokemon_rb/client.py:134-137`, 0.6.8).

**Third attempt (you asked me to press the buttons):**
1. **I accidentally opened a second EmuHawk.** Asking computer use to bring "Emuhawk" forward started a second, empty EmuHawk (process 48992). I closed it straight away; it never had a game loaded.
2. **I focused the real EmuHawk** (process 29516) and played the new game's intro: name RED, a preset rival name. The room was visible on screen.
3. **I took the item from the PC:** the PC showed "TM17 ×1", and the game said "Withdrew TM17."

**Result:**
- **Server log, 00:35:49:** `(Team #1) VicTest sent TM17 Submission to VicTest (Player's House 2F - Player's PC)`.
- **BizHawk Client log:** "VicTest found their TM17 Submission (Player's House 2F - Player's PC)".
- **Feed (screenshot):** "00:35 VicTest (you) found your own ▲ TM17 Submission, at Player's House 2F - Player's PC in your world". The counter went from 0 / 161 to 1 / 161, and Received showed 1.

### Error paths with the real EmuHawk

Each ran through `playGame`, the same code the Play button uses. The number of running EmuHawks and BizHawk Clients was counted before and after each one.

| Case | Result |
|---|---|
| Wrong ROM (Red with one byte changed, made in the temp folder) | stopped at "Check…" with "It isn't an exact copy of Pokémon Red (US/Europe)… (Expected MD5 3d45c1ee…; this file's is 5e088b3b…)". Nothing started |
| Missing EmuHawk (`C:\BizHawk-gone\EmuHawk.exe`) | stopped at "Check…" with "EmuHawk.exe isn't at C:\BizHawk-gone\EmuHawk.exe. Choose where it is now." Nothing started |
| Room not running (`localhost:38282`) | stopped at "Find the room" with "Nothing answered at localhost:38282… paste the room link instead of the address." Nothing started |

## Fixes from this test

- **Playing again opened a second room tab** (two "VicTest" tabs in the screenshot). `playGame` now switches to the room's tab when one is already connected to the same server and slot ("Following VicTest in a Play tab (already open)."). **Tested:** with a connected VicTest tab, Play again kept 2 tabs at 2. The first attempt at this test was invalid, because the tabs hadn't reconnected yet after the window reload.
- **The note after a successful Play** now says:
  - start or continue your game, because checks only go out once you're in it;
  - keep EmuHawk and the BizHawk Client window open;
  - tick EmuHawk's "Run in background".
- **README troubleshooting:** new entry "Checks don't show up in the feed", with those three causes.

## Known limitation, not fixed

**Pressing Play while that game's EmuHawk is already running starts a second EmuHawk and BizHawk Client.** It happened twice during these tests. Each pair connected, but two at once is confusing. A follow-up could reuse the running ones, and could run the BizHawk Client without its window (it has a `--nogui` mode) so there's no extra window to close by mistake.

## Files

- **`renderer/launcher.js`:**
  - `playGame` reuses an open, connected room tab;
  - new wording for the note after a successful Play.
- **`README.md`:** troubleshooting entry "Checks don't show up in the feed".
- **`package.json`:** 2.6.1.

## Clean-up

**Closed** everything the tests started:
- the test server, stopped through the test window's Host view;
- 3 EmuHawks and 3 BizHawk Clients;
- the test ArchipelagoVic window;
- the empty EmuHawk I opened by mistake.

Your own ArchipelagoVic window kept running and wasn't touched.

**Deleted:**
- the temp folder: test game, patch, patched ROM, settings and the one-byte-changed copy;
- the test game's files in BizHawk: `Gameboy\SaveRAM\AP 78651639654775134922 P1 VicTest.SaveRAM` and `Gameboy\State\…QuickSave0.State`.

**`host.yaml` compared with `host.yaml.apvic-backup` (your original):** 383 lines in both, and only the feature's two keys differ, as intended:
- line 106: `emuhawk_path: "C:\\BizHawk-2.11.1\\EmuHawk.exe"`;
- line 227: `red_rom_file: "C:\\Claude\\ArchipelagoVic\\ROM\\Pokemon Red.gb"`.

`rom_start` and every other line are unchanged, so nothing needed restoring.

**Left in place:**
- **BizHawk at `C:\BizHawk-2.11.1`,** with your "Run in background" setting.
- **Archipelago's own log files** from the test runs, in `C:\ProgramData\Archipelago\logs`.
