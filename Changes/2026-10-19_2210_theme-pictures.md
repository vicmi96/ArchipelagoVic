# ArchipelagoVic 2.5.1: your own picture for each theme

**Date:** 2026-10-19 22:10 (local time)
**Request:** "Those themes with animes, put some pictures of their main characters in the theme"

## Why the characters aren't bundled

The characters and their official artwork belong to their studios and publishers. ArchipelagoVic can't ship copies of them or drawings of them. Instead, every theme now has a picture slot that you fill with an image of your choice (a favourite character, fan art, a screenshot…). The image stays on your PC and is never uploaded or shared.

## What's new

- **Settings → Theme** now starts with **"Picture for <theme>"**, which applies to the selected theme:
  - "Choose picture…" opens a file picker (PNG, JPG, WebP, GIF or AVIF, up to 20 MB);
  - "Change picture…" replaces it;
  - "Remove" deletes it.
- **Where the picture shows:**
  - at the bottom of the sidebar, under the menu, fading in from the top so it blends with the sidebar;
  - in that theme's card in the picker, so you can see which themes have one.
- **Each theme keeps its own picture.** Switching themes switches pictures, and themes without one show no picture.
- **Narrow windows:** when the sidebar collapses to icons, the picture is hidden.
- **Other windows:** they update immediately when a picture is added or removed.

## How it works

- `main.js`:
  - pictures are copied to `%APPDATA%\ArchipelagoVic\theme-art\<theme>.<ext>`;
  - they're served to the window as `apvic-icon://theme/<theme>`;
  - new handlers `theme:pickImage` and `theme:clearImage` check the theme name, file type and size.
- `preload.js`: `themePickImage` and `themeClearImage`.
- `renderer/themes.js`:
  - remembers which themes have a picture, with a version number so a changed picture shows right away;
  - `applyPalette` sets the picture for the current theme;
  - the picker has the picture row and the card thumbnails.
- `renderer/index.html`: a picture area in the sidebar.
- `renderer/styles.css`: the sidebar picture, the picture row and the card thumbnail.
- `renderer/client.js`: windows also refresh when pictures change.
- `README.md`, `package.json` (2.5.1), `ArchipelagoClient.html` (rebuilt).

## Tested

In the Electron app with a test image:
1. Chose Frieren, then "Choose picture…". The file was saved to `theme-art/frieren.png` and appeared at the bottom of the sidebar on every page and in the Frieren card.
2. Switched to One Piece: no picture.
3. Switched back and clicked Remove: the picture and file were gone.
4. No page errors.
