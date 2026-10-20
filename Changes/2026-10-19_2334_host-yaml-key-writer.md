# ArchipelagoVic 2.5.2: host.yaml key writer (Game profiles, step 2)

**Date:** 2026-10-19 23:34 (local time)
**Request:** "Go on to step 2 (the host.yaml key writer)." This is step 2 of Game profiles with a one-click Play button. Game profiles must set `bizhawkclient_options.emuhawk_path` and the game's base-ROM setting (for Pokémon, `pokemon_rb_options.red_rom_file` / `blue_rom_file`), so Archipelago's own flow uses the same EmuHawk and ROM. The rules:
- back up `host.yaml` as `host.yaml.apvic-backup` before the first edit;
- edit only the keys needed and keep the rest of the file, comments included, intact.

Nothing in the window calls the writer yet; game profiles will use it in step 3. The version stays 2.5.2 until the Play button lands.

## What changed

**`aplib.js`: `setYamlKeys(text, changes)`.** It changes a few `section → key` values in YAML text and leaves every other line exactly as it was. That includes comments, order, quoting style and line endings (CRLF stays CRLF).
- Only the key's own section is searched, at that section's first indentation level. So `rom_start` in `bizhawkclient_options` is never confused with the many other `rom_start` keys. (Step 1's quick test copy got this wrong with a plain text replace, so the writer had to handle it.)
- A comment after the value is kept. Quoted values with `#` or `'` inside are read correctly.
- New values are written as YAML double-quoted strings (`"C:\\Emu\\EmuHawk.exe"`), or as `true`/`false`/numbers/`null`.
- **A missing key** is added at the end of its section, before the comment that introduces the next section. **A missing section** is added at the end of the file.
- It refuses to replace a list or group setting (for example `sc2_options.terran_button_color`), and setting names must be plain names.
- **Setting a value that's already there changes nothing.**
- It returns what changed, with the old values as written.

**`aplib.js`: `writeYamlKeys(file, changes, backupFile)`** does the same on a file, which it reads fresh from disk each time:
- **Backup:** before the first real change, it copies the file to `backupFile`. An existing backup is never overwritten, so it keeps the person's own settings.
- **Writing:** it writes to `host.yaml.apvic-tmp` and renames that over `host.yaml`, so a crash can't leave a half-written file.
- **Nothing to change:** it writes nothing, not even the backup.

**`main.js`: `setHostKeys(changes)`.** This is the one function game profiles will call. It edits `<Archipelago folder>\host.yaml` and keeps `host.yaml.apvic-backup`. If `host.yaml` doesn't exist yet, it says so in plain language.

**`main.js`:** `hostYamlValue` and the Settings `host.yaml` editor (which keeps `host.yaml.bak`) are unchanged.

## Tested

The tests ran on copies of the real `host.yaml` in a temp folder (382 lines, CRLF), using a test script in the session's scratch folder. All 11 checks passed:
1. **Only the requested lines changed.** Setting `emuhawk_path` and `red_rom_file`, with paths containing spaces, brackets and backslashes, changed exactly those 2 lines (106 and 227). `rom_start: true`, which was asked for but already set, was untouched. The reported old values were `"None"` and `"Pokemon Red (UE) [S][!].gb"`.
2. **The rest of the file was kept.** Same line count, same number of CRLF endings, and every comment line identical.
3. **The backup is identical to the original.**
4. **A second change kept the first backup.**
5. **Setting the same value again wrote nothing:** the file's contents and modification time were unchanged.
6. **A missing key** went inside its section, right after `output_path`, before `# Options for MultiServer`.
7. **A missing section** was added at the end, with CRLF.
8. **A list setting** (`sc2_options.terran_button_color`) was refused.
9. **Trailing comments and tricky quoted values** were kept: `'it''s # here'   # keep me`, `"x\" # y" # c2`, `5 # c3`.
10. **`rom_start` in `bizhawkclient_options`** changed only that line, inside that section.
11. **Odd setting names** (`a: b`) were refused.

**Read back by Archipelago 0.6.8.** A fresh Pokémon Red test patch was generated, then the step 1 helper was run from the temp folder that held the edited `host.yaml` copy, without `--rom`:
- `--inspect` reported `romSetting = C:\Claude\ArchipelagoVic\ROM\Pokemon Red.gb`, so Archipelago parsed the file and read the path we wrote;
- patching then succeeded using only the `host.yaml` setting;
- the edited copy was byte-identical afterwards, so Archipelago didn't autosave over it.

**`emuhawk_path`** is written the same way, but nothing in Archipelago could be made to read it back without BizHawk installed. It gets checked in the real Play test.

**Your real `host.yaml`** was never edited: its hash is unchanged, and no `host.yaml.apvic-backup` exists yet. It will be created the first time a game profile is saved.

**Checks and clean-up:**
- `node --check` passes for `main.js` and `aplib.js`;
- the temp folder was deleted;
- no process I started is still running.
