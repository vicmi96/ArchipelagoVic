# ArchipelagoVic 2.5.2: theme-pictures folder

**Date:** 2026-10-19 22:50 (local time)
**Request:** "Find good pictures and download them, i will put them into the folder and you wire them with the themes."

The pictures themselves are yours to download; ArchipelagoVic doesn't fetch or ship character art. This change wires up a folder so that any picture you drop in is matched to its theme automatically.

## What's new

**New folder: `theme-pictures`** (in the project folder; next to `ArchipelagoVic.exe` when installed or portable).
- Name a picture after a theme and it becomes that theme's picture, shown at the bottom of the sidebar and in the theme's card.
- **Accepted names:** either the theme's short id or its name in lower case with dashes. Upper or lower case doesn't matter. For example:
  - `frieren.png`
  - `fma.png` or `fullmetal-alchemist.png`
  - `onepiece.jpg` or `one-piece.jpg`
  - `spyfamily.webp` or `spy-family.webp`
  - `theme-pictures/README.txt` lists every theme with its names.
- **Formats:** PNG, JPG, WebP, GIF or AVIF.
- **Picking up changes:** pictures are found when the app starts and every time you open Settings, so new ones appear without a restart.
- **Which picture wins:** a picture chosen with "Choose picture…" in Settings comes first. The button next to it then says "Use folder picture", which removes the chosen picture and goes back to the folder's.
- **Settings → Theme:**
  - the picture row says which file the theme is using;
  - when there's none, it says which file name to add;
  - a new **"Open theme-pictures folder"** button opens the folder (creating it if needed).

**Git:** `.gitignore` now ignores everything in `theme-pictures/` except `README.txt`, so your pictures are never committed or pushed to GitHub. The folder isn't included in the installer either.

## Files

**New:** `theme-pictures/README.txt`

**Changed:**
- `main.js`:
  - `themeFolder`, `themeFolderImages`, `themeFolderFile`;
  - the image protocol also serves folder pictures (`apvic-icon://themefolder/<name>`);
  - new handlers `theme:folder` and `theme:openFolder`.
- `preload.js`: `themeFolder` and `themeOpenFolder`.
- `renderer/themes.js`:
  - `loadThemeFolder`, `themeArtFor` (the chosen picture first, then the folder picture), and matching by id or name;
  - the picture row and card thumbnails use these.
- `renderer/client.js`: loads the folder pictures at start-up.
- `renderer/launcher.js`: Settings reloads the folder pictures each time it opens.
- `.gitignore`, `README.md`, `package.json` (2.5.2), `ArchipelagoClient.html` (rebuilt).

## Tested

Put test images in the folder as `one-piece.png` and `FMA.png` (upper case):
- One Piece and Fullmetal Alchemist each showed their picture, and Settings said "Using … from your theme-pictures folder".
- Naruto showed no picture and the hint "put one named naruto.png in your theme-pictures folder".
- Both cards showed thumbnails.
- No page errors.

The test images were removed afterwards.
