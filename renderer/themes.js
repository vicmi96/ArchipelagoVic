"use strict";
/* =========================================================
   Colour themes. Each theme sets the app's base colours (page,
   panels, lines, text, accent). Item colours keep their meaning
   in every theme: gold = key item, blue = useful, red = trap,
   grey = filler. They switch to their light or dark set to match.
   The series themes are colour palettes inspired by those shows;
   they use no artwork or logos.
   ========================================================= */
const THEMES = [
  // ---- Classic ----
  { id: "default", group: "Classic", name: "Archipelago", desc: "Teal and brass. Follows Auto, Light or Dark.", mode: null,
    swatch: ["#EDF1EF", "#2C6676", "#C08A1E", "#0E1A20"] },
  { id: "midnight", group: "Classic", name: "Midnight", desc: "Deep blue night with soft starlight accents.", mode: "dark",
    c: { paper: "#0B1020", surface: "#121A30", surface2: "#1A2440", line: "#2A3656", ink: "#E6EAF5", ink2: "#AEB8D2", ink3: "#8390B0", sea: "#8AB4FF", seaSoft: "#1B2A4D", brass: "#F2C46D", brassSoft: "#3A2F17" },
    backdrop: "radial-gradient(1200px 600px at 85% -10%, rgba(138,180,255,.10), transparent 60%)" },
  { id: "sepia", group: "Classic", name: "Parchment", desc: "Warm paper and rust ink, easy on the eyes.", mode: "light",
    c: { paper: "#F3ECDD", surface: "#FBF7EE", surface2: "#EADFC8", line: "#D8CBB0", ink: "#2B2117", ink2: "#5C4D3C", ink3: "#75644F", sea: "#8A4B2A", seaSoft: "#F1DCCB", brass: "#9C6B10", brassSoft: "#F3E2BD" } },
  { id: "forest", group: "Classic", name: "Forest", desc: "Dark pine with fresh green highlights.", mode: "dark",
    c: { paper: "#0F1A14", surface: "#15241B", surface2: "#1C3024", line: "#2C4434", ink: "#E2EDE4", ink2: "#A9C0AE", ink3: "#809A87", sea: "#7CCB92", seaSoft: "#1B3A26", brass: "#E0C068", brassSoft: "#3A3218" } },
  { id: "rose", group: "Classic", name: "Rosé", desc: "Blush pink with berry accents.", mode: "light",
    c: { paper: "#F7EEF0", surface: "#FFF9FA", surface2: "#F0DEE3", line: "#E0C6CE", ink: "#2A1A20", ink2: "#5D4650", ink3: "#7A616B", sea: "#B23A62", seaSoft: "#F6D9E2", brass: "#A86A12", brassSoft: "#F5E3C2" } },
  { id: "contrast", group: "Classic", name: "High contrast", desc: "Black and white with bright accents, for maximum readability.", mode: "dark",
    c: { paper: "#000000", surface: "#0A0A0A", surface2: "#1C1C1C", line: "#7A7A7A", ink: "#FFFFFF", ink2: "#E6E6E6", ink3: "#C4C4C4", sea: "#5CC8FF", seaSoft: "#0E2A3A", brass: "#FFD24A", brassSoft: "#3A2E00" } },

  // ---- Inspired by anime ----
  { id: "frieren", group: "Inspired by anime", name: "Frieren", series: "Frieren: Beyond Journey's End", desc: "Elven silver, meadow sage and a touch of old gold.", mode: "light",
    c: { paper: "#EEF1F2", surface: "#FAFBFC", surface2: "#E3E7EE", line: "#CDD3DE", ink: "#22283A", ink2: "#4F5873", ink3: "#666F89", sea: "#36705F", seaSoft: "#DCEAE5", brass: "#A88324", brassSoft: "#F1E6C6" },
    backdrop: "radial-gradient(900px 500px at 90% -10%, rgba(176,160,220,.18), transparent 60%), radial-gradient(800px 500px at -10% 110%, rgba(120,190,165,.14), transparent 60%)" },
  { id: "fma", group: "Inspired by anime", name: "Fullmetal Alchemist", series: "Fullmetal Alchemist: Brotherhood", desc: "Alchemist's crimson coat, automail steel and brass.", mode: "dark",
    c: { paper: "#141012", surface: "#1C1618", surface2: "#261D20", line: "#3D2E32", ink: "#F1E6E2", ink2: "#C6B1AB", ink3: "#9C8983", sea: "#E8695C", seaSoft: "#3D1B19", brass: "#D9B25B", brassSoft: "#3A2E16" },
    backdrop: "radial-gradient(1000px 520px at 100% 0%, rgba(232,105,92,.10), transparent 60%)" },
  { id: "onepiece", group: "Inspired by anime", name: "One Piece", series: "One Piece", desc: "Grand Line blue, straw-hat gold and sunny deck planks.", mode: "light",
    c: { paper: "#F4EEDC", surface: "#FFFBF0", surface2: "#EADFC2", line: "#D9C9A3", ink: "#1C2A3A", ink2: "#47566A", ink3: "#617084", sea: "#1F6FB2", seaSoft: "#D6E6F4", brass: "#B07C00", brassSoft: "#F7E7B8" },
    backdrop: "linear-gradient(180deg, rgba(31,111,178,.07), transparent 280px)" },
  { id: "naruto", group: "Inspired by anime", name: "Naruto", series: "Naruto", desc: "Bright ninja orange on warm cream, with deep navy.", mode: "light",
    c: { paper: "#FBF1E6", surface: "#FFF9F2", surface2: "#F3E1CE", line: "#E2C9AE", ink: "#1E2235", ink2: "#4A4F68", ink3: "#666B83", sea: "#B04E06", seaSoft: "#FBE0C8", brass: "#2F4A8A", brassSoft: "#DCE3F3" } },
  { id: "demonslayer", group: "Inspired by anime", name: "Demon Slayer", series: "Demon Slayer: Kimetsu no Yaiba", desc: "Checkered jade and charcoal, with a flicker of flame.", mode: "dark",
    c: { paper: "#0E1412", surface: "#141D1A", surface2: "#1B2723", line: "#2C3D37", ink: "#E6EFEA", ink2: "#ABC0B6", ink3: "#84998F", sea: "#4FB8A0", seaSoft: "#173A32", brass: "#F0A35A", brassSoft: "#3C2814" },
    backdrop: "repeating-conic-gradient(rgba(79,184,160,.035) 0 25%, transparent 0 50%) 0 0/48px 48px" },
  { id: "jjk", group: "Inspired by anime", name: "Jujutsu Kaisen", series: "Jujutsu Kaisen", desc: "Midnight uniform navy and crackling cursed-energy violet.", mode: "dark",
    c: { paper: "#0C0E1A", surface: "#121528", surface2: "#1A1E36", line: "#2B3152", ink: "#E7E8F5", ink2: "#ADB1D3", ink3: "#878CB2", sea: "#9F8CFF", seaSoft: "#251F4D", brass: "#7FD6FF", brassSoft: "#14324A" },
    backdrop: "radial-gradient(900px 500px at 80% -10%, rgba(159,140,255,.14), transparent 60%)" },
  { id: "eva", group: "Inspired by anime", name: "Evangelion", series: "Neon Genesis Evangelion", desc: "Unit purple, neon green and warning orange.", mode: "dark",
    c: { paper: "#120D1A", surface: "#1A1325", surface2: "#231A32", line: "#3A2C50", ink: "#EDE6F5", ink2: "#BBAED0", ink3: "#9487AB", sea: "#8EE05A", seaSoft: "#22351A", brass: "#FF9A3C", brassSoft: "#3F2614" },
    backdrop: "linear-gradient(135deg, rgba(142,224,90,.06), transparent 40%)" },
  { id: "sailormoon", group: "Inspired by anime", name: "Sailor Moon", series: "Sailor Moon", desc: "Pastel pink, sailor navy and moonlit gold.", mode: "light",
    c: { paper: "#FBEFF4", surface: "#FFF8FB", surface2: "#F5DCE7", line: "#EBC4D5", ink: "#1F2547", ink2: "#4A5078", ink3: "#666B91", sea: "#B42C68", seaSoft: "#F8D4E3", brass: "#A97A0E", brassSoft: "#F6E5BF" },
    backdrop: "radial-gradient(700px 400px at 95% 0%, rgba(240,200,90,.16), transparent 60%)" },
  { id: "bebop", group: "Inspired by anime", name: "Cowboy Bebop", series: "Cowboy Bebop", desc: "Smoky jazz-bar noir with teal and mustard.", mode: "dark",
    c: { paper: "#12161A", surface: "#191E23", surface2: "#21282E", line: "#343E47", ink: "#EDE9DF", ink2: "#BFB8A8", ink3: "#979080", sea: "#5FBFB3", seaSoft: "#173533", brass: "#E8B04A", brassSoft: "#3A2D14" } },
  { id: "aot", group: "Inspired by anime", name: "Attack on Titan", series: "Attack on Titan", desc: "Survey Corps olive and leather, with wings-of-freedom blue.", mode: "dark",
    c: { paper: "#15140F", surface: "#1D1B15", surface2: "#27241B", line: "#3D3829", ink: "#EEE9DC", ink2: "#C4BBA4", ink3: "#9C937D", sea: "#7FA7D6", seaSoft: "#1E2C3D", brass: "#C9A15A", brassSoft: "#3A2F18" } },
  { id: "spyfamily", group: "Inspired by anime", name: "Spy × Family", series: "Spy × Family", desc: "Elegant spy green, rosy pink and inky black.", mode: "light",
    c: { paper: "#F6F0EF", surface: "#FFFAF9", surface2: "#EFE1DF", line: "#DCC8C5", ink: "#1E1A1D", ink2: "#4F474C", ink3: "#6D6469", sea: "#2F6B55", seaSoft: "#D8EAE2", brass: "#B83A68", brassSoft: "#F6DCE5" },
    backdrop: "radial-gradient(700px 420px at 100% 0%, rgba(240,150,180,.14), transparent 60%)" },
];

const THEME_VARS = { paper: "--paper", surface: "--surface", surface2: "--surface-2", line: "--line", ink: "--ink", ink2: "--ink-2", ink3: "--ink-3", sea: "--sea", seaSoft: "--sea-soft", brass: "--brass", brassSoft: "--brass-soft" };
const themeById = id => THEMES.find(t => t.id === id) || THEMES[0];

// Pictures people add to themes themselves (saved on their PC by the app): { themeId: version }.
function themeArtMap(){ try { return JSON.parse(localStorage.getItem("apwc.themeArt")) || {}; } catch { return {}; } }
function setThemeArt(id, v){ const m = themeArtMap(); if (v) m[id] = v; else delete m[id]; try { localStorage.setItem("apwc.themeArt", JSON.stringify(m)); } catch {} }
const themeArtUrl = (id, v) => `apvic-icon://theme/${encodeURIComponent(id)}?v=${v}`;
// Pictures dropped into the theme-pictures folder, named after the theme: its id ("fma.png") or its name ("fullmetal-alchemist.png").
let THEME_FOLDER = { path: "", images: {} };
const themeSlug = s => String(s).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const themeFileNames = t => [...new Set([t.id, themeSlug(t.name)])];
async function loadThemeFolder(){ if (!window.apvic?.themeFolder) return; try { THEME_FOLDER = await window.apvic.themeFolder(); } catch {} }
function folderArtFor(t){ const stem = themeFileNames(t).find(n => THEME_FOLDER.images[n]); return stem ? { stem, url: `apvic-icon://themefolder/${stem}?v=${THEME_FOLDER.images[stem]}` } : null; }
// The picture for a theme: one chosen in Settings wins, otherwise one from the folder.
function themeArtFor(t){
  if (!window.apvic) return null;
  const v = themeArtMap()[t.id];
  if (v) return { kind: "chosen", url: themeArtUrl(t.id, v) };
  const f = folderArtFor(t);
  return f ? { kind: "folder", url: f.url, stem: f.stem } : null;
}

function currentThemeId(){ try { return JSON.parse(localStorage.getItem("apwc.palette")) || "default"; } catch { return "default"; } }
function setThemeId(id){ try { localStorage.setItem("apwc.palette", JSON.stringify(id)); } catch {} }

// Applies the chosen theme to this page. `mode` is the Auto/Light/Dark choice used by the default theme.
function applyPalette(mode){
  const t = themeById(currentThemeId());
  const root = document.documentElement, st = root.style;
  for (const v of Object.values(THEME_VARS)) st.removeProperty(v);
  st.removeProperty("--backdrop"); st.removeProperty("--theme-art");
  if (!t.mode) {   // default: Auto / Light / Dark
    if (mode === "auto" || !mode) root.removeAttribute("data-theme"); else root.dataset.theme = mode;
  } else {
    root.dataset.theme = t.mode;
    for (const [k, v] of Object.entries(t.c)) st.setProperty(THEME_VARS[k], v);
    if (t.backdrop) st.setProperty("--backdrop", t.backdrop);
  }
  const art = themeArtFor(t);
  if (art) { st.setProperty("--theme-art", `url("${art.url}")`); root.dataset.art = "1"; }
  else delete root.dataset.art;
  root.dataset.palette = t.id;
  return t;
}
function themeSwatch(t){ return t.swatch || [t.c.paper, t.c.sea, t.c.brass, t.c.ink]; }

// Theme cards: a small preview of each theme (page, panel, accent button, text) to click.
function renderThemePicker(box, onPick){
  const cur = currentThemeId();

  box.replaceChildren();
  if (window.apvic?.themePickImage) {
    // The picture slot for the selected theme: the person's own image, shown at the bottom of the sidebar.
    const t = themeById(cur), art = themeArtFor(t), has = art?.kind === "chosen";
    const pick = async () => { try { const r = await window.apvic.themePickImage(t.id); if (r) { setThemeArt(t.id, r.v); onPick?.(t); renderThemePicker(box, onPick); } } catch (e) { (typeof toast === "function" ? toast : alert)(e.message); } };
    const clear = async () => { try { await window.apvic.themeClearImage(t.id); } catch {} setThemeArt(t.id, null); onPick?.(t); renderThemePicker(box, onPick); };
    const openFolder = async () => { try { await window.apvic.themeOpenFolder(); } catch (e) { (typeof toast === "function" ? toast : alert)(e.message); } };
    const names = themeFileNames(t).map(n => n + ".png").join(" or ");
    box.append(h("div", { class: "theme-art-row" },
      art ? h("span", { class: "theme-art-thumb", style: `background-image:url("${art.url}")` }) : h("span", { class: "theme-art-thumb empty" }, "+"),
      h("span", { class: "grow" }, h("b", null, `Picture for ${t.name}`),
        h("span", { class: "muted" }, has ? " Your chosen picture, shown at the bottom of the sidebar."
          : art ? ` Using ${art.stem} from your theme-pictures folder.`
          : ` Choose a picture, or put one named ${names} in your theme-pictures folder. Pictures stay on this PC.`)),
      h("button", { type: "button", class: "btn small" + (art ? "" : " primary"), onclick: pick }, art ? "Change picture…" : "Choose picture…"),
      has ? h("button", { type: "button", class: "btn small ghost", onclick: clear }, THEME_FOLDER.images && folderArtFor(t) ? "Use folder picture" : "Remove") : null,
      window.apvic.themeOpenFolder ? h("button", { type: "button", class: "btn small ghost", onclick: openFolder }, "Open theme-pictures folder") : null));
  }
  for (const group of [...new Set(THEMES.map(t => t.group))]) {
    box.append(h("h4", { class: "theme-group" }, group));
    const grid = h("div", { class: "theme-grid", role: "radiogroup", "aria-label": group });
    for (const t of THEMES.filter(x => x.group === group)) {
      const c = t.c || { paper: "#EDF1EF", surface: "#F8FAF9", line: "#C9D3D0", ink: "#16252D", ink3: "#73868B", sea: "#2C6676", brass: "#C08A1E" };
      const card = h("button", { type: "button", class: "theme-card" + (t.id === cur ? " on" : ""), role: "radio", "aria-checked": String(t.id === cur), title: t.series ? `Colours inspired by ${t.series}` : t.desc,
          onclick: () => { setThemeId(t.id); onPick?.(t); renderThemePicker(box, onPick); } },
        h("span", { class: "theme-prev", style: `background:${c.paper}${t.backdrop ? ";background-image:" + t.backdrop : ""};border-color:${c.line}` },
          themeArtFor(t) ? h("span", { class: "tp-art", style: `background-image:url("${themeArtFor(t).url}")` }) : null,
          h("span", { class: "tp-panel", style: `background:${c.surface};border-color:${c.line}` },
            h("i", { style: `background:${c.ink}` }), h("i", { style: `background:${c.ink3};width:60%` }),
            h("b", { style: `background:${c.sea}` }), h("em", { style: `background:${c.brass}` }))),
        h("span", { class: "theme-name" }, t.name, t.id === "default" ? h("span", { class: "muted" }, " · Auto / Light / Dark") : null),
        h("span", { class: "theme-desc muted" }, t.desc));
      grid.append(card);
    }
    box.append(grid);
  }
}
