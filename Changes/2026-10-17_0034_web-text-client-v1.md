# Patch notes: Archipelago web text client v1.0

**Timestamp:** 2026-10-17 00:34 PDT
**Files:** `ArchipelagoClient.html` (new), `Changes/2026-10-17_0034_web-text-client-v1.md` (new)

## Summary
New standalone text client that replaces the Kivy Text Client from the Archipelago Launcher. It's one self-contained HTML file with no install. It speaks the Archipelago network protocol directly over WebSocket, connecting as a `TextOnly` client so it never interferes with the game client on the same slot.

## Added
### Connection
- Connect screen with server address, slot name and password.
- Port defaults to 38281 when you leave it out. `wss://` is tried first for remote hosts and `ws://` first for localhost/LAN, and each falls back to the other.
- Plain-language errors for a bad slot name, wrong password, version mismatch or unreachable server.
- Remembers recent rooms (up to 6) and the last server/slot you used. You can forget a room with ✕.
- Auto-reconnect with backoff (3s → 30s) if the connection drops mid-session.
- Caches the data package per game, keyed by checksum, so reconnects are fast.
- URL params `?server=…&slot=…` prefill the form.

### Header
- Your slot, your game and connection status.
- Checks done (X / Y) with a progress meter.
- Items received, hint points, and hints affordable at the room's hint cost.

### Activity tab (replaces the old scrolling log)
- Each item transfer shows as a route: **Sender → Receiver [Item]**, with the location and whose world it's in on a second line. "Found their own" is shown when sender and receiver are the same.
- Every player gets a stable colour, used everywhere in the client. Your own name carries a "you" badge.
- Item pills are coloured by classification, each with its own glyph so they don't depend on colour alone: ◆ Progression, ▲ Useful, ✖ Trap, ● Filler.
- Rows that involve you are highlighted with a brass edge.
- Filters: All / Involving me / Items / Hints / Chat, a Progression-only toggle and free-text search.
- Player roster sidebar: click a player to see only what they sent or received.
- Join, leave and goal messages are rewritten in plain language, e.g. "Alice connected with a text client" or "Bob reached their goal".
- "Jump to latest" button appears when you've scrolled up.

### Received tab
- Grouped by item: count, who sent each copy and classification. Columns are sortable.
- "In order received" log: index, item, sender, where it was found, time.

### Checks left tab
- Remaining and done locations for your slot, with a progress bar and search.
- Optional **Reveal contents** button. It scouts your remaining locations (without creating hints) to show what item each one holds and who it's for, with progression listed first. It's off by default as a spoiler guard, and the choice is remembered per seed.

### Hints tab
- **Items you're waiting on:** hints for your items in other worlds. You can set the hint status (Priority / Not needed / Avoid / Unspecified) from a dropdown; it's sent to the server with `UpdateHint`.
- **Items in your world for others:** checks in your game that other players need.
- Live updates through `SetNotify` on `_read_hints_{team}_{slot}`. Found hints can be hidden.

### Players tab
- Each player's game, client status (Connected / Ready / Playing / Goal reached), whether they've been seen online, sent/received counts for this session, and a shortcut to their activity.

### Composer
- Chat, plus any server `!command`.
- Tab-completion of item names after `!hint` and of location names after `!hint_location`, using your game's data package.
- ↑/↓ recall your earlier lines.
- Local commands: `/clear` and `/help`.

### General
- Light, dark and auto themes (follows the OS), toggled from the header.
- Responsive down to phone width; keyboard-navigable tabs; visible focus; respects reduced motion.
- Unread counter on the Activity tab and in the browser tab title.

## Tested
- Tested against a local Archipelago 0.6.9 MultiServer with a 3-player seed (ChecksFinder, Meritous, A Short Hike). Simulated players sent checks, chat, `!hint` and a goal.
- Verified item routing, received items, scouting, hints, live client-status updates and goal.
- Checked light and dark themes at 1400px and the layout at 390px. No console errors.

## Known limits
- Online status only comes from join/leave events seen during this session; players already connected before you show "—".
- Sent/received counts on the Players tab cover this session only. The server doesn't send a history of item sends.
- Opened from disk, it can connect to both `ws://` and `wss://` servers. If it's ever hosted on an `https://` page, only `wss://` servers (such as archipelago.gg) will work.
