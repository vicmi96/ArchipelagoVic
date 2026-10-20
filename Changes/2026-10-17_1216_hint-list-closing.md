# Patch notes: "Ask for a hint…" list no longer closes by itself

**Timestamp:** 2026-10-17 12:16 PDT
**Files changed:** `renderer/client.js`, `ArchipelagoClient.html` (rebuilt)
**Stale-copy check:** I staged both from `C:\Claude\ArchipelagoVic`. They were byte-identical to the 12:10 release.

## Problem
Clicking **Ask for a hint…** opened the list of your item names, which closed again about 0.1 s later, before you could click anything.

Cause: clicking the button briefly takes focus away from the chat box. The chat box's "hide the list when you leave the box" timer, started by that moment of lost focus, then fired right after the button had opened the list and put focus back.

## Fix
The timer now hides the list only if focus has really left the chat box by the time it fires. Clicking an entry, Tab and the arrow keys work as before.

## Tested
- Ran against a local Archipelago server with the standalone build and clicked "Ask for a hint…".
- The list was still open after 50, 200 and 600 ms.
- Clicking "Map Width" filled in `!hint Map Width` and closed the list. Enter sent it, and the server's hint ("Map Width for Vic is at Permit Guy Bribe in Bob's world") appeared in Activity.
