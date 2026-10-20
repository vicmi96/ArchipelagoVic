# ArchipelagoVic 2.3.1: close to tray, room page links remembered

**Date:** 2026-10-18 13:14 (local time)
**Request:**
- "Archipelago room page link just persist when I close the app."
- "Closing the app actually moves it to the tray."

## 1. Room page links persist across restarts

**Before:** the Room page field (for example `https://archipelago.gg/room/NAyxhB2IToeb25sMqOJBSw`) was empty after a restart. Only the server and slot were saved, so the tracker stopped working, and the saved port could be out of date once the room restarted.

**Now:**
- **What's saved:** each room tab saves its room link with its server and slot (`apvic.rooms` in the app's storage). Room tabs also send the link to the main window in their status messages.
- **Reopening:**
  - Reopened tabs get the link back. It's passed to the room page as a `room` URL parameter and in the join message.
  - New tabs pre-fill from the last room you joined, link included.
- **Connecting again:** the link is used to look up the room's current port again before connecting.
- **Stale links:**
  - Typing a server on a different host (for example `localhost:38281`) clears a room link that belongs to another server, so an old link can't redirect the connection.
  - A tab opened for a server with no link starts with the field empty.

**Files:**
- `renderer/client.js`:
  - the last connection is saved with its room;
  - the room link is read from `?room=`;
  - the join message sets or clears the room field;
  - a server field change on another host drops the room;
  - the status message includes `room`.
- `renderer/launcher.js`: `addRoom` passes `room`, `saveRooms` stores it, saving also happens when a tab's room changes, and `initRooms` restores it.

## 2. Closing the window keeps the app in the tray

**Closing the window:**
- The window's ✕ hides it to the notification area (tray). Rooms stay connected, alerts keep coming, and a hosted server keeps running.
- The first time on Windows, a tray balloon says it's still running and how to get it back.

**Tray icon:**
- Click or double-click opens the window.
- Right-click shows a menu built fresh each time:
  - "Open ArchipelagoVic";
  - "Mini window" / "Close mini window";
  - "Quit ArchipelagoVic", or "Quit (stops the server)" while you're hosting.
- Its tooltip shows how many rooms you're in and whether a server is running.

**Quitting:**
- Quitting from the tray (or from Windows sign-out or shutdown) still asks before stopping a running server. If you cancel, the app keeps running.
- **New setting:** Settings → Window → "Closing the window keeps ArchipelagoVic running in the tray". It's on by default. Turn it off to quit when you close the window.
- If the system has no tray, closing the window quits the app as before.

**Bringing the window back:** opening a second copy of ArchipelagoVic, clicking an `archipelago://` link, or clicking "Open" in the mini window now also brings back a window that's hidden in the tray.

**Files:**
- `main.js`:
  - Tray and nativeImage;
  - `showMain`, `quitApp`, `trayMenu`, `updateTrayMenu`, `createTray`;
  - the close handler hides to the tray unless quitting;
  - `before-quit` sets quitting;
  - an `app:setCloseToTray` handler;
  - `closeToTray` in the install info;
  - the tray menu refreshes when the mini window, rooms or server change.
- `preload.js`: `setCloseToTray`.
- `renderer/index.html` and `renderer/launcher.js`: the Settings → Window checkbox.

## Other

- Version 2.3.1 (`package.json`, README installer file names). README has a "New in 2.3.1" section.

## Tested

In the Electron app with a mock Archipelago install:
- **Tray:** closing the window hid it (the app kept running); quitting closed the app; with the setting off, closing quit the app.
- **Room links:** a room joined from a link was saved with its link and came back after a restart (server, slot and room page all filled in). Typing `localhost:38281` cleared the room link.
- **Regression:** the 2.3 test (tabs, mini window, recap, YAML form, updates) passed again.
