# Patch notes: colors that explain themselves (v1.1)

**Timestamp:** 2026-10-17 01:10 PDT
**Files changed:** `ArchipelagoClient.html`
**Based on:** `ArchipelagoClient.html` as staged from `C:\Claude\ArchipelagoVic` at 01:03. It was byte-identical to the v1.0 working copy, so the edits weren't made on a stale version.

## Why
Purple vs. blue item pills weren't self-explanatory. Purple also clashed with player name colors, and gold was used both for "you" and for warnings. Each color now has exactly one meaning, and the client explains it.

## Changed
- **Key items (progression) are now gold with a ★.** They used to be purple ◆. Gold reads as "valuable" without explanation.
  - Light theme: `#9A6200` on `#FBEBC2`.
  - Dark theme: `#F2C14E` on `#3B2E0E`.
- **The rest of the item scale:**
  - Useful stays blue ▲.
  - Trap stays red ✖.
  - Filler is now neutral grey ● (was blue-grey).
- **Item names:** "Progression" is renamed **"Key item"** everywhere: the legend, the "Key items only" filters, the Received tab's Type column and empty-state text.
- **Player colors live only in a small colored square.** Player names are now plain ink, so a player's color can't be mistaken for an item type. The dot became a 10px rounded square.
- **"You" highlighting moved from gold to teal:**
  - Rows that involve you have a teal edge and tint.
  - The "you" tag is teal.
  - The unread counter is teal.
  - Gold now means only "key item".
- **The spoiler banner in Checks left** is now neutral, with a dashed border (was gold).
- **Tooltips:** hovering an item pill shows a one-line explanation of its type, e.g. "Key item (progression): unlocks new areas or abilities…". The Type column cells in Received have the same tooltip.

## Added
- **"Reading the colors" guide.** This dialog explains:
  - each item type, with a sample pill and plain-language meaning;
  - player squares;
  - teal highlighted rows;
  - the four hint statuses (Priority, Not needed, Avoid, Found).

  It opens automatically the first time you connect, then stays out of the way. A `apwc.guideSeen` flag in browser storage remembers this.
- **Two ways to reopen the guide:**
  - a **Color guide** button in the header;
  - the legend in the Activity toolbar, which is now a button with a "?" badge.

## Tested
- Ran against a local Archipelago 0.6.9 server with the same 3-player test seed.
- Checked the light theme at 1400px and 390px, and the dark theme at 1400px.
- The guide dialog, Activity, Received, Checks left, Hints and Players tabs all render with no console errors.

## Rollback
The previous version is kept in the build workspace as `ArchipelagoClient.v1.html`. In your folder, v1.0 is described by `2026-10-17_0034_web-text-client-v1.md`.
