# Patch notes: "Found in your world" instead of "sent by you"

**Timestamp:** 2026-10-17 11:40 PDT
**Files changed:** `renderer/client.js`, `renderer/index.html`, `renderer/styles.css`, `ArchipelagoClient.html` (rebuilt from renderer/)
**Stale-copy check:** I staged all four from `C:\Claude\ArchipelagoVic` first. They were byte-identical to the 01:25 release, so there were no local edits to merge.

## Problem
The Received tab listed many items as sent by "Victoria (you)", which looked like you were sending things to yourself.

What was really happening: in Archipelago, when one of *your* items is placed at a location in *your own* game, you still "receive" it from the server once you check that location. The server records the sender as your own slot. In Oxygen Not Included that covers every research that unlocks one of your own buildings, e.g. Planter Box, Super Computer and Gas Vent. The client showed that sender slot as a player name.

## Changed
- **"Came from" column (Received, both views).** It replaces "Sent by" and now shows:
  - **Found in your world**, with a teal ring marker, for your own items found in your own game. The tooltip explains why Archipelago counts them as received.
  - **Starting item**, with a grey marker, for items from the server itself (slot 0: starting inventory or `!getitem`).
  - the player's colored square and name for items another player sent.
- **New filter**: *From anyone*, *Sent by other players* or *Found in my own world*. It's remembered between sessions.
- **"In order received" view:** the location column now reads e.g. "Tile 1 (Vic's world)" for items from others and just the location name for your own. It shows "—" for starting items.
- **Header stat:** now reads "Items received · N from others", so the count of real gifts is visible at a glance. The tooltip notes the total includes your own finds.
- **Activity feed:** your own finds now read "found your own" instead of "found their own".
- **Search:** in Received you can now search for "found in your world" or "starting item".

## Tested
- Ran the standalone build against a local Archipelago server with the 3-player test seed, connected as the Meritous slot after simulated play.
  - Grouped view: an item received from several places lists each source separately, e.g. "Found in your world ×3, Bob".
  - Log view and the "Sent by other players" filter both worked.
  - The header showed "14 · 7 from others".
- No console errors.
