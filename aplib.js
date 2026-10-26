// ArchipelagoVic native helpers (main process only):
// zip read/write, APWorld + patch inspection, APWorld building, game art.
"use strict";
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const zlib = require("zlib");

/* ================= zip ================= */
function readZip(buf) {
  let i = buf.length - 22;
  const min = Math.max(0, buf.length - 65557);
  for (; i >= min; i--) if (buf.readUInt32LE(i) === 0x06054b50) break;
  if (i < min) throw new Error("This file isn't a zip archive, or it's damaged.");
  const count = buf.readUInt16LE(i + 10);
  let p = buf.readUInt32LE(i + 16);
  const entries = new Map();
  for (let k = 0; k < count; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("The archive's file list is damaged.");
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), size = buf.readUInt32LE(p + 24);
    const nl = buf.readUInt16LE(p + 28), el = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    entries.set(buf.toString("utf8", p + 46, p + 46 + nl), { method, csize, size, off });
    p += 46 + nl + el + cl;
  }
  return {
    names: [...entries.keys()],
    has: n => entries.has(n),
    read(name) {
      const e = entries.get(name); if (!e) return null;
      const nl = buf.readUInt16LE(e.off + 26), el = buf.readUInt16LE(e.off + 28);
      const data = buf.subarray(e.off + 30 + nl + el, e.off + 30 + nl + el + e.csize);
      if (e.method === 0) return Buffer.from(data);
      if (e.method === 8) return zlib.inflateRawSync(data);
      throw new Error(`Unsupported compression in ${name}.`);
    },
    json(name) { const b = this.read(name); return b ? JSON.parse(b.toString("utf8")) : null; },
  };
}
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function writeZip(files) {
  const parts = [], central = []; let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name.replace(/\\/g, "/"), "utf8");
    const raw = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data);
    const comp = zlib.deflateRawSync(raw, { level: 9 });
    const crc = crc32(raw);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(8, 8);
    lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0x21, 12); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18);
    lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(8, 10);
    ch.writeUInt16LE(0, 12); ch.writeUInt16LE(0x21, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(raw.length, 24);
    ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(offset, 42);
    parts.push(lh, name, comp); central.push(ch, name);
    offset += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}

/* ================= versions ================= */
function parseVersion(v) { if (!v) return null; const m = String(v).match(/(\d+)(?:\.(\d+))?(?:\.(\d+))?/); return m ? [+m[1], +(m[2] || 0), +(m[3] || 0)] : null; }
function cmpVersion(a, b) { for (let i = 0; i < 3; i++) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) - (b[i] || 0); return 0; }

/* ================= APWorld ================= */
function topDirs(zip) { return [...new Set(zip.names.filter(n => n.includes("/")).map(n => n.split("/")[0]))].filter(d => d && d !== "__MACOSX"); }
function inspectApworld(file, apBase, apVersion) {
  if (!/\.apworld$/i.test(file)) throw new Error("That isn't an .apworld file.");
  const zip = readZip(fs.readFileSync(file));
  const dirs = topDirs(zip);
  const stem = path.basename(file, path.extname(file));
  if (dirs.length !== 1 || !stem.includes(dirs[0])) throw new Error("This APWorld looks invalid or damaged: it should contain exactly one world folder named like the file.");
  const mod = dirs[0];
  if (!zip.has(`${mod}/__init__.py`) && !zip.has(`${mod}/__init__.pyc`)) throw new Error("This archive isn't an APWorld: its world folder has no __init__.py.");
  const manifest = zip.json(`${mod}/archipelago.json`) || zip.json("archipelago.json") || {};
  let game = manifest.game || null;
  if (!game) { const src = zip.read(`${mod}/__init__.py`); if (src) game = guessGame(src.toString("utf8")); }
  const warnings = [];
  const cur = parseVersion(apVersion);
  const minV = parseVersion(manifest.minimum_ap_version), maxV = parseVersion(manifest.maximum_ap_version);
  if (cur && minV && cmpVersion(cur, minV) < 0) warnings.push(`It needs Archipelago ${manifest.minimum_ap_version} or newer. You have ${apVersion}.`);
  if (cur && maxV && cmpVersion(cur, maxV) > 0) warnings.push(`It supports Archipelago up to ${manifest.maximum_ap_version}. You have ${apVersion}.`);
  const libWorlds = path.join(apBase, "lib", "worlds");
  const builtin = fs.existsSync(path.join(libWorlds, mod + ".apworld")) || fs.existsSync(path.join(libWorlds, mod));
  if (builtin) warnings.push(`Archipelago already includes "${mod}" as a built-in world. A custom copy with the same name can clash with it.`);
  const target = path.join(apBase, "custom_worlds", mod + ".apworld");
  let existing = null;
  if (fs.existsSync(target)) {
    try { const ez = readZip(fs.readFileSync(target)); const em = ez.json(`${mod}/archipelago.json`) || {}; existing = { version: em.world_version || null }; } catch { existing = { version: null }; }
  }
  return { file, module: mod, game, worldVersion: manifest.world_version || null, minAp: manifest.minimum_ap_version || null,
    authors: manifest.authors || null, warnings, builtin, existing, target, components: findComponents(zip, mod) };
}
function guessGame(src) {
  const m = src.match(/^\s+game\s*(?::\s*[\w\[\].]+\s*)?=\s*["']([^"'\n]+)["']/m);
  return m ? m[1] : null;
}
// Launcher components a world registers, e.g. Component("Universal Tracker", ...)
function findComponents(zip, mod) {
  const out = new Set();
  for (const n of zip.names) {
    if (!n.startsWith(mod + "/") || !n.endsWith(".py")) continue;
    let src; try { src = zip.read(n).toString("utf8"); } catch { continue; }
    if (!/LauncherComponents|components\.append/.test(src)) continue;
    for (const m of src.matchAll(/\bComponent\(\s*(?:display_name\s*=\s*)?["']([^"'\n]{2,60})["']/g)) out.add(m[1]);
  }
  return [...out];
}

/* ================= patch files ================= */
function inspectPatch(file) {
  const zip = readZip(fs.readFileSync(file));
  let manifest = zip.json("archipelago.json");
  if (!manifest) { const alt = zip.names.find(n => n.endsWith("archipelago.json")); if (alt) manifest = zip.json(alt); }
  if (!manifest) throw new Error("This doesn't look like an Archipelago patch file (no archipelago.json inside).");
  return { file, suffix: path.extname(file).toLowerCase(), game: manifest.game || null, player: manifest.player ?? null,
    playerName: manifest.player_name || null, server: manifest.server || null, patchEnding: manifest.patch_file_ending || null,
    // the MD5 of the original ROM this patch needs, and the patched game's file ending (procedure patches only)
    baseChecksum: typeof manifest.base_checksum === "string" ? manifest.base_checksum.toLowerCase() : null, resultEnding: manifest.result_file_ending || null };
}

/* ================= original ROMs ================= */
// ROMs ArchipelagoVic knows by name, by MD5: what they are and where Archipelago keeps them in host.yaml.
const KNOWN_ROMS = {
  "3d45c1ee9abd5738df46d2bdda8b57dc": { game: "Pokemon Red and Blue", name: "Pokémon Red (US/Europe)", title: "POKEMON RED", size: 1048576, patch: ".apred", section: "pokemon_rb_options", key: "red_rom_file" },
  "50927e843568814f7ed45ec4f944bd8b": { game: "Pokemon Red and Blue", name: "Pokémon Blue (US/Europe)", title: "POKEMON BLUE", size: 1048576, patch: ".apblue", section: "pokemon_rb_options", key: "blue_rom_file" },
};
const knownRomsFor = game => Object.entries(KNOWN_ROMS).filter(([, k]) => k.game === game).map(([md5, k]) => ({ md5, ...k }));
// Size, MD5 and (Game Boy) cartridge title of a ROM file.
async function romFacts(file) {
  const st = await fsp.stat(file);
  const hash = require("crypto").createHash("md5");
  const head = [];
  let got = 0;
  await new Promise((resolve, reject) => {
    fs.createReadStream(file).on("data", b => { hash.update(b); if (got < 0x150) { head.push(b.subarray(0, 0x150 - got)); got += b.length; } }).on("end", resolve).on("error", reject);
  });
  const h = Buffer.concat(head);
  let title = null;
  if (/\.gbc?$/i.test(file) && h.length >= 0x144) title = h.subarray(0x134, 0x144).toString("latin1").replace(/\0.*$/s, "").trim() || null;
  return { size: st.size, mtime: st.mtimeMs, md5: hash.digest("hex"), title };
}
const fmtSize = n => n >= 1048576 ? `${+(n / 1048576).toFixed(n % 1048576 ? 1 : 0)} MB` : `${Math.round(n / 1024)} KB`;
// Plain-language explanation of why a ROM isn't the one needed. facts: from romFacts; wanted: [{ md5, name?, title?, size? }].
function romMismatch(file, facts, wanted, game) {
  const need = wanted.length === 1 && wanted[0].name ? wanted[0].name : wanted.some(w => w.name) ? wanted.filter(w => w.name).map(w => w.name).join(" or ") : `the original ROM ${game || "this game"} needs`;
  const base = path.basename(file);
  const other = KNOWN_ROMS[facts.md5];
  let why;
  if (other && other.game === game) why = `This is the ${other.name} ROM, but this patch needs ${need}. Choose your ${need} ROM, or use a patch made for ${other.name.replace(/ \(.*\)$/, "")}.`;
  else if (other) why = `This is the ${other.name} ROM, which is for ${other.game}, not ${game || "this game"}. Choose ${need} instead.`;
  else if (/^AP_\d+_P\d+/i.test(base) || hasPatchNextTo(file))
    why = `${base} looks like a game Archipelago already patched, from a different patch file. To play ${base} as it is, clear the patch file. To play this patch, choose your ${need} ROM instead: patching needs the original, unpatched ROM.`;
  else {
    const w = wanted.find(x => x.title);
    if (w && facts.title && facts.title !== w.title) why = `Its cartridge title is "${facts.title}", not "${w.title}", so it's a different game, a fan hack or a changed copy, not ${need}.`;
    else if (wanted.every(x => x.size) && !wanted.some(x => x.size === facts.size)) why = `It's ${fmtSize(facts.size)}, but ${need} is ${fmtSize(wanted[0].size)}. That usually means a different release (another region, a revision or a multi-game cartridge) or a hack.`;
    else why = `It isn't an exact copy of ${need}. That usually means a different version or region (for example the Japanese release or a later revision), a copy that was already patched or changed, or a bad dump.`;
    why += ` Use a clean copy of ${need}, ideally dumped from your own cartridge.`;
  }
  return `${why} (Expected MD5 ${wanted.map(x => x.md5).join(" or ")}; this file's is ${facts.md5}.)`;
}
// A file's name without its folder and ending, in lower case: a patched game has the same stem as its patch.
const fileStem = file => path.basename(String(file)).replace(/\.[^.]+$/, "").toLowerCase();
// The Archipelago patch file with the same name next to this ROM (the ROM is that patch's output), or null.
function patchNextTo(file) {
  try {
    const n = fs.readdirSync(path.dirname(file)).find(n => /\.ap[a-z0-9]+$/i.test(n) && !/\.apworld$/i.test(n) && fileStem(n) === fileStem(file));
    return n ? path.join(path.dirname(file), n) : null;
  } catch { return null; }
}
const hasPatchNextTo = file => !!patchNextTo(file);

/* ================= host.yaml ================= */
// Change a few "section: key: value" settings in a YAML text such as host.yaml and leave every other
// line (comments, order, quoting, line endings) exactly as it was. Only plain values can be set.
// changes: [{ section, key, value }] with value a string, number, boolean or null.
// Returns { text, changed: [{ section, key, from, to }] }; "from" is the old value as written (null if the key was added).
function setYamlKeys(text, changes) {
  const eol = /\r\n/.test(text) ? "\r\n" : "\n";
  const lines = String(text).split(/\r?\n/);
  const fmt = v => v === null || v === undefined ? "null" : typeof v === "boolean" || typeof v === "number" ? String(v) : JSON.stringify(String(v));
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Split "value   # comment" into its value and the rest, respecting quotes.
  const splitValue = rest => {
    let end = rest.length;
    if (rest.startsWith('"')) { for (let i = 1; i < rest.length; i++) { if (rest[i] === "\\") i++; else if (rest[i] === '"') { end = i + 1; break; } } }
    else if (rest.startsWith("'")) { for (let i = 1; i < rest.length; i++) { if (rest[i] === "'" && rest[i + 1] === "'") i++; else if (rest[i] === "'") { end = i + 1; break; } } }
    else { const m = rest.match(/\s+#/); if (m) end = m.index; }
    return [rest.slice(0, end).trimEnd(), rest.slice(end)];
  };
  const changed = [];
  for (const { section, key, value } of changes) {
    if (!/^[A-Za-z0-9_]+$/.test(section) || !/^[A-Za-z0-9_]+$/.test(key)) throw new Error(`"${section}.${key}" isn't a setting name.`);
    const to = fmt(value);
    const head = lines.findIndex(l => new RegExp(`^${esc(section)}:\\s*(#.*)?$`).test(l));
    if (head < 0) {
      while (lines.length && lines[lines.length - 1] === "") lines.pop();
      lines.push(`${section}:`, `  ${key}: ${to}`, "");
      changed.push({ section, key, from: null, to });
      continue;
    }
    // The section's lines run until the next top-level line that isn't a comment.
    let end = head + 1;
    while (end < lines.length && !/^[^\s#]/.test(lines[end])) end++;
    const indents = lines.slice(head + 1, end).map(l => l.match(/^(\s+)[A-Za-z0-9_]+:/)).filter(Boolean).map(m => m[1]);
    const indent = indents.length ? indents.reduce((a, b) => (b.length < a.length ? b : a)) : "  ";
    const keyRe = new RegExp(`^${esc(indent)}${esc(key)}:(\\s*)(.*)$`);
    const at = lines.slice(head + 1, end).findIndex(l => keyRe.test(l));
    if (at < 0) {
      // Add the key after the section's last setting line, before any comment that introduces the next section.
      let last = end - 1;
      while (last > head && (lines[last].trim() === "" || /^#/.test(lines[last]))) last--;
      lines.splice(last + 1, 0, `${indent}${key}: ${to}`);
      changed.push({ section, key, from: null, to });
      continue;
    }
    const i = head + 1 + at;
    const [, gap, rest] = lines[i].match(keyRe);
    const [old, comment] = splitValue(rest);
    const next = lines[i + 1];
    if (old === "" && next !== undefined && next.match(/^\s*/)[0].length > indent.length && next.trim() && !next.trim().startsWith("#"))
      throw new Error(`${section}.${key} is a list or group in host.yaml, so ArchipelagoVic won't change it.`);
    if (old === to) continue;
    lines[i] = `${indent}${key}:${gap || " "}${to}${comment}`;
    changed.push({ section, key, from: old, to });
  }
  return { text: lines.join(eol), changed };
}
// The same on a file, read fresh from disk. Before its first change the file is copied to backupFile
// (an existing backup is never overwritten, so it keeps the person's own settings). Returns the changes.
async function writeYamlKeys(file, changes, backupFile) {
  const text = await fsp.readFile(file, "utf8");
  const r = setYamlKeys(text, changes);
  if (!r.changed.length) return [];
  if (backupFile && !fs.existsSync(backupFile)) await fsp.copyFile(file, backupFile);
  const tmp = file + ".apvic-tmp";
  await fsp.writeFile(tmp, r.text, "utf8");
  await fsp.rename(tmp, file);
  return r.changed;
}

/* ================= build APWorlds ================= */
function ignoreMatcher(lines) {
  const rules = [];
  for (let raw of lines) {
    let line = raw.replace(/\r$/, ""); if (!line.trim() || line.trim().startsWith("#")) continue;
    let neg = false; if (line.startsWith("!")) { neg = true; line = line.slice(1); }
    let dirOnly = false; if (line.endsWith("/")) { dirOnly = true; line = line.slice(0, -1); }
    const anchored = line.startsWith("/") || line.slice(0, -1).includes("/");
    line = line.replace(/^\//, "");
    let re = line.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*\/?/g, "\u0000").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]").replace(/\u0000/g, ".*");
    re = anchored ? `^${re}(/.*)?$` : `(^|/)${re}(/.*)?$`;
    rules.push({ re: new RegExp(re), neg, dirOnly });
  }
  return (rel, isDir) => { let ignored = false; for (const r of rules) { if (r.dirOnly && !isDir) continue; if (r.re.test(rel)) ignored = !r.neg; } return ignored; };
}
async function looseWorlds(apBase) {
  const out = [];
  for (const [where, dir] of [["custom", path.join(apBase, "custom_worlds")], ["built-in", path.join(apBase, "lib", "worlds")]]) {
    const names = await fsp.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const d of names) {
      if (!d.isDirectory() || d.name.startsWith("_") || d.name === "generic") continue;
      const full = path.join(dir, d.name);
      if (!fs.existsSync(path.join(full, "__init__.py")) && !fs.existsSync(path.join(full, "__init__.pyc"))) continue;
      let game = null;
      try { game = JSON.parse(await fsp.readFile(path.join(full, "archipelago.json"), "utf8")).game || null; } catch {}
      if (!game) { try { game = guessGame(await fsp.readFile(path.join(full, "__init__.py"), "utf8")); } catch {} }
      out.push({ module: d.name, where, path: full, game });
    }
  }
  return out;
}
async function buildApworld(apBase, worldDir, game) {
  const mod = path.basename(worldDir);
  const globalIgnore = await fsp.readFile(path.join(apBase, "data", "GLOBAL.apignore"), "utf8").catch(() => "__pycache__\n/archipelago.json\n/.apignore\n/.git\n/.gitignore\n");
  const local = await fsp.readFile(path.join(worldDir, ".apignore"), "utf8").catch(() => "");
  const ignored = ignoreMatcher((globalIgnore + "\n" + local).split("\n"));
  let manifest = {};
  try { manifest = JSON.parse(await fsp.readFile(path.join(worldDir, "archipelago.json"), "utf8")); } catch {}
  manifest.game = manifest.game || game;
  if (!manifest.game) throw new Error(`Couldn't tell which game "${mod}" is. Enter its game name and try again.`);
  manifest.compatible_version = 7; manifest.version = 7;
  const files = [];
  async function walk(dir, rel) {
    for (const d of await fsp.readdir(dir, { withFileTypes: true })) {
      const r = rel ? `${rel}/${d.name}` : d.name;
      if (ignored(r, d.isDirectory())) continue;
      if (d.isDirectory()) await walk(path.join(dir, d.name), r);
      else if (d.isFile()) files.push({ name: `${mod}/${r}`, data: await fsp.readFile(path.join(dir, d.name)) });
    }
  }
  await walk(worldDir, "");
  files.push({ name: `${mod}/archipelago.json`, data: Buffer.from(JSON.stringify(manifest)) });
  const outDir = path.join(apBase, "build", "apworlds");
  await fsp.mkdir(outDir, { recursive: true });
  const out = path.join(outDir, mod + ".apworld");
  await fsp.writeFile(out, writeZip(files));
  return { file: out, count: files.length, game: manifest.game };
}

/* ================= game art, icons and info ================= */
const ART = (() => { try { return require("./game-art.json"); } catch { return {}; } })();
function slug(s) { return String(s).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "game"; }
function norm(s) { return String(s).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, ""); }
const IMG_EXT = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico"];

// kind: "icon" = small square app icon, "cover" = box art / store art used in the game summary.
function createArt({ dir, net, apBase, online, sgdbKey }) {
  for (const d of ["custom", "icons", "info"]) fs.mkdirSync(path.join(dir, d), { recursive: true });
  const indexFile = path.join(dir, "index.json");
  let index = {}; try { index = JSON.parse(fs.readFileSync(indexFile, "utf8")); } catch {}
  const saveIndex = () => { try { fs.writeFileSync(indexFile, JSON.stringify(index, null, 1)); } catch {} };
  const inflight = new Map();
  let active = 0; const queue = [];
  const limit = fn => new Promise((res, rej) => { const run = () => { active++; fn().then(res, rej).finally(() => { active--; queue.shift()?.(); }); }; active < 3 ? run() : queue.push(run); });
  const UA = { "User-Agent": "ArchipelagoVic/2.2 (personal Archipelago launcher)" };
  // 2.1 stored covers under the bare game name; keep them as covers instead of downloading again.
  let migrated = false;
  for (const k of Object.keys(index)) if (!/^(icon|cover|steamid):/.test(k)) { if (!index["cover:" + k]) index["cover:" + k] = index[k]; delete index[k]; migrated = true; }
  if (migrated) saveIndex();

  async function getJson(url, headers) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 12000);
    try { const r = await net.fetch(url, { headers: { ...UA, ...(headers || {}) }, signal: ctl.signal }); if (!r.ok) return null; return await r.json(); }
    catch { return null; } finally { clearTimeout(t); }
  }
  async function getImage(url, minBytes = 300) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 15000);
    try {
      const r = await net.fetch(url, { headers: UA, signal: ctl.signal });
      if (!r.ok) return null;
      const type = r.headers.get("content-type") || "";
      if (!type.startsWith("image/") && !/\.ico(\?|$)/i.test(url)) return null;
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < minBytes) return null;
      const ext = type.includes("png") ? ".png" : type.includes("webp") ? ".webp" : (type.includes("icon") || /\.ico(\?|$)/i.test(url)) ? ".ico" : ".jpg";
      return { buf, ext };
    } catch { return null; } finally { clearTimeout(t); }
  }

  /* ---- Steam ---- */
  const steamIds = new Map();
  async function steamId(game) {
    const hint = ART[game] || {};
    if (hint.steam) return hint.steam;
    if (hint.none) return null;
    if (steamIds.has(game)) return steamIds.get(game);
    if (index[`steamid:${game}`] && Date.now() - index[`steamid:${game}`].ts < 30 * 864e5) return index[`steamid:${game}`].id;
    const j = await getJson(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(game)}&l=english&cc=CA`);
    const items = j?.items || [];
    const hit = items.find(it => norm(it.name) === norm(game)) || items.find(it => norm(it.name).startsWith(norm(game)) && norm(game).length >= 5);
    const id = hit ? hit.id : null;
    steamIds.set(game, id); index[`steamid:${game}`] = { id, ts: Date.now() }; saveIndex();
    return id;
  }
  async function steamCover(id) {
    for (const u of [`https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${id}/library_600x900.jpg`,
                     `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/library_600x900.jpg`,
                     `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${id}/header.jpg`,
                     `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/header.jpg`]) {
      const img = await getImage(u, 800); if (img) return { ...img, src: `Steam` };
    }
    return null;
  }
  async function steamIcon(id) {
    // Steam's own app icon. clienticon (.ico, up to 256px) is sharpest; "icon" is the 32px community icon.
    const cmd = await getJson(`https://api.steamcmd.net/v1/info/${id}`);
    const common = cmd?.data?.[id]?.common || {};
    const cands = [];
    if (common.clienticon) cands.push(`https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/apps/${id}/${common.clienticon}.ico`);
    let hash = common.icon;
    if (!hash) { const c = await getJson(`https://api.steampowered.com/ICommunityService/GetApps/v1/?appids%5B0%5D=${id}`); hash = c?.response?.apps?.[0]?.icon; }
    if (hash) cands.push(`https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/apps/${id}/${hash}.jpg`);
    for (const u of cands) { const img = await getImage(u); if (img) return { ...img, src: "Steam" }; }
    return null;
  }
  /* ---- SteamGridDB (needs the user's free API key) ---- */
  async function sgdbIcon(game, sid) {
    const k = sgdbKey(); if (!k) return null;
    const auth = { Authorization: `Bearer ${k}` };
    let list = null;
    if (sid) list = (await getJson(`https://www.steamgriddb.com/api/v2/icons/steam/${sid}?nsfw=false&humor=false`, auth))?.data;
    if (!list || !list.length) {
      const term = (ART[game] && ART[game].sgdb) || game;
      const found = (await getJson(`https://www.steamgriddb.com/api/v2/search/autocomplete/${encodeURIComponent(term)}`, auth))?.data || [];
      const g = found.find(x => norm(x.name) === norm(term)) || found[0];
      if (g) list = (await getJson(`https://www.steamgriddb.com/api/v2/icons/game/${g.id}?nsfw=false&humor=false`, auth))?.data;
    }
    if (!list || !list.length) return null;
    const score = x => (x.style === "official" ? 1000 : 0) + (x.mime === "image/png" ? 100 : 0) + (x.score || 0) + (Math.abs((x.width || 0) - (x.height || 0)) < 4 ? 50 : 0);
    for (const ic of [...list].filter(x => !x.nsfw && !x.humor).sort((a, b) => score(b) - score(a)).slice(0, 3)) {
      const img = (ic.thumb && await getImage(ic.thumb)) || await getImage(ic.url);
      if (img) return { ...img, src: "SteamGridDB" };
    }
    return null;
  }
  /* ---- Wikipedia / Wikidata ---- */
  async function wikiSummary(game) {
    const hint = ART[game] || {};
    const titles = hint.wiki ? [hint.wiki] : hint.none ? [] : [`${game} (video game)`, game];
    for (const t of titles) {
      const j = await getJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(t.replace(/ /g, "_"))}`);
      if (!j || j.type === "disambiguation") continue;
      if (!hint.wiki && !/game/i.test(j.description || "")) continue;
      return j;
    }
    return null;
  }
  async function wikiCover(game) {
    const j = await wikiSummary(game);
    if (!j?.thumbnail?.source) return null;
    const img = await getImage(j.thumbnail.source, 800);
    return img ? { ...img, src: "Wikipedia" } : null;
  }

  /* ---- lookups ---- */
  async function lookup(game, kind) {
    const hint = ART[game] || {};
    if (hint.none) return null;
    const sid = await steamId(game);
    if (kind === "icon") {
      return (await sgdbIcon(game, sid)) || (sid ? await steamIcon(sid) : null);
    }
    return (sid ? await steamCover(sid) : null) || (await wikiCover(game));
  }
  function customFile(game, kind) {
    const base = path.join(dir, "custom", (kind === "icon" ? "icon-" : "") + slug(game));
    for (const ext of IMG_EXT) if (fs.existsSync(base + ext)) return base + ext;
    return null;
  }
  async function resolve(game, kind = "icon") {
    const custom = customFile(game, kind); if (custom) return custom;
    const hint = ART[game] || {};
    if (hint.local && apBase()) { const f = path.join(apBase(), hint.local); if (fs.existsSync(f)) return f; }
    const ik = `${kind}:${game}`;
    const rec = index[ik];
    const sub = kind === "icon" ? "icons" : "";
    if (rec && rec.file && fs.existsSync(path.join(dir, sub, rec.file))) return path.join(dir, sub, rec.file);
    if (rec && !rec.file && Date.now() - rec.ts < (rec.retryDays || 7) * 864e5) return null;
    if (!online()) return null;
    if (inflight.has(ik)) return inflight.get(ik);
    const p = limit(async () => {
      const art = await lookup(game, kind).catch(() => null);
      if (!art) { index[ik] = { file: null, ts: Date.now(), retryDays: kind === "icon" && !sgdbKey() ? 1 : 7 }; saveIndex(); return null; }
      const file = slug(game) + art.ext;
      await fsp.writeFile(path.join(dir, sub, file), art.buf);
      index[ik] = { file, src: art.src, ts: Date.now() }; saveIndex();
      return path.join(dir, sub, file);
    }).finally(() => inflight.delete(ik));
    inflight.set(ik, p);
    return p;
  }
  async function setCustom(game, src, kind = "icon") {
    const ext = (path.extname(src) || ".png").toLowerCase();
    if (!IMG_EXT.includes(ext)) throw new Error("Pick a PNG, JPG, WebP, GIF or ICO image.");
    const old = customFile(game, kind); if (old) await fsp.unlink(old).catch(() => {});
    await fsp.copyFile(src, path.join(dir, "custom", (kind === "icon" ? "icon-" : "") + slug(game) + ext));
  }
  async function resetCustom(game, kind = "icon") {
    const old = customFile(game, kind); if (old) await fsp.unlink(old).catch(() => {});
    const ik = `${kind}:${game}`;
    if (index[ik]) { const f = index[ik].file; if (f) await fsp.unlink(path.join(dir, kind === "icon" ? "icons" : "", f)).catch(() => {}); delete index[ik]; saveIndex(); }
  }
  // Forget failed icon lookups, e.g. after a SteamGridDB key was added.
  function retryMissingIcons() { for (const k of Object.keys(index)) if (k.startsWith("icon:") && !index[k].file) delete index[k]; saveIndex(); }
  function source(game, kind = "icon") { return customFile(game, kind) ? "your picture" : (index[`${kind}:${game}`]?.src || null); }

  /* ---- game summary ---- */
  async function wikidataFacts(qid) {
    const ent = (await getJson(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`))?.entities?.[qid];
    if (!ent) return {};
    const ids = p => (ent.claims?.[p] || []).map(c => c.mainsnak?.datavalue?.value?.id).filter(Boolean);
    const want = { genres: ids("P136"), developers: ids("P178"), publishers: ids("P123"), platforms: ids("P400"), series: ids("P179") };
    const all = [...new Set(Object.values(want).flat())].slice(0, 45);
    const labels = {};
    if (all.length) {
      const j = await getJson(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${all.join("|")}&props=labels&languages=en&format=json&origin=*`);
      for (const [id, e] of Object.entries(j?.entities || {})) labels[id] = e.labels?.en?.value;
    }
    const lab = list => list.map(id => labels[id]).filter(Boolean);
    const dates = (ent.claims?.P577 || []).map(c => c.mainsnak?.datavalue?.value?.time).filter(Boolean).sort();
    return { genres: lab(want.genres), developers: lab(want.developers), publishers: lab(want.publishers), platforms: lab(want.platforms), series: lab(want.series),
      released: dates[0] ? dates[0].replace(/^\+/, "").slice(0, 10).replace(/-00-00$|-00$/, "") : null };
  }
  async function info(game) {
    const file = path.join(dir, "info", slug(game) + ".json");
    try { const c = JSON.parse(await fsp.readFile(file, "utf8")); if (Date.now() - c.ts < 30 * 864e5) return c; } catch {}
    if (!online()) return { game, offline: true };
    const hint = ART[game] || {};
    const out = { game, ts: Date.now(), genres: [], developers: [], publishers: [], platforms: [], links: [] };
    if (!hint.none && !hint.local) {
      const sid = await steamId(game);
      if (sid) {
        const d = (await getJson(`https://store.steampowered.com/api/appdetails?appids=${sid}&l=english&cc=CA`))?.[sid]?.data;
        if (d) {
          out.title = d.name; out.steamSummary = (d.short_description || "").replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").trim();
          out.genres = (d.genres || []).map(g => g.description); out.developers = d.developers || []; out.publishers = d.publishers || [];
          out.released = d.release_date?.date || null;
          out.platforms = Object.entries(d.platforms || {}).filter(([, v]) => v).map(([k]) => ({ windows: "Windows", mac: "macOS", linux: "Linux" }[k] || k));
          out.links.push({ label: "Steam store page", url: `https://store.steampowered.com/app/${sid}/` });
        }
      }
      const w = await wikiSummary(game);
      if (w) {
        out.title = out.title || w.title; out.description = w.description || null; out.summary = w.extract || null;
        if (w.content_urls?.desktop?.page) out.links.push({ label: "Wikipedia", url: w.content_urls.desktop.page });
        if (w.wikibase_item) {
          const f = await wikidataFacts(w.wikibase_item).catch(() => ({}));
          for (const k of ["genres", "developers", "publishers", "platforms"]) if (!out[k].length && f[k]?.length) out[k] = f[k];
          if (f.genres?.length && out.genres.length && !sid) out.genres = f.genres;
          if (!out.released && f.released) out.released = f.released;
          if (f.series?.length) out.series = f.series;
        }
      }
    }
    if (!out.summary && out.steamSummary) out.summary = out.steamSummary;
    await fsp.writeFile(file, JSON.stringify(out)).catch(() => {});
    return out;
  }
  return { resolve, setCustom, resetCustom, retryMissingIcons, source, info };
}

module.exports = { readZip, writeZip, crc32, inspectApworld, inspectPatch, KNOWN_ROMS, knownRomsFor, romFacts, romMismatch, fileStem, patchNextTo, setYamlKeys, writeYamlKeys, looseWorlds, buildApworld, createArt, parseVersion, cmpVersion };
