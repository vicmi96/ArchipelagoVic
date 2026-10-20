// ArchipelagoVic — Electron main process.
// Wraps an existing Archipelago install: launches its components, runs the
// server and generator with live consoles, and manages Players / custom_worlds.
"use strict";
const { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme, protocol, net, Menu, Tray, nativeImage } = require("electron");
const { pathToFileURL } = require("url");
const aplib = require("./aplib");
const path = require("path");
const fs = require("fs");
const fsp = fs.promises;
const { spawn } = require("child_process");
const COMPONENTS = require("./components.json");

const IS_WIN = process.platform === "win32";
const CONFIG_FILE = () => path.join(app.getPath("userData"), "config.json");
let config = {};
let win = null;
const procs = new Map(); // id -> {child, kind}
let procSeq = 1;
let art = null;            // game art cache (created when the app is ready)
let pendingUri = null;     // archipelago:// link the app was started with
let customComps = [];      // components registered by installed custom worlds
let mini = null;           // the always-on-top mini window
let miniData = { rooms: [] };
let tray = null;           // notification-area icon; closing the window hides it there
let quitting = false;      // true once the person chose Quit (tray menu, or close with tray turned off)

protocol.registerSchemesAsPrivileged([{ scheme: "apvic-icon", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);

/* ---------------- config ---------------- */
function loadConfig() {
  try { config = JSON.parse(fs.readFileSync(CONFIG_FILE(), "utf8")); } catch { config = {}; }
}
function saveConfig() {
  try { fs.mkdirSync(path.dirname(CONFIG_FILE()), { recursive: true }); fs.writeFileSync(CONFIG_FILE(), JSON.stringify(config, null, 2)); } catch {}
}

/* ---------------- Archipelago install ---------------- */
function isApDir(dir) {
  return !!dir && fs.existsSync(path.join(dir, "ArchipelagoLauncher.exe"));
}
function candidateDirs() {
  const env = process.env;
  return [
    env.APVIC_AP_PATH,
    config.apPath,
    "C:\\ProgramData\\Archipelago",
    env.ProgramFiles && path.join(env.ProgramFiles, "Archipelago"),
    env["ProgramFiles(x86)"] && path.join(env["ProgramFiles(x86)"], "Archipelago"),
    env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, "Archipelago"),
  ].filter(Boolean);
}
function apPath() {
  for (const d of candidateDirs()) if (isApDir(d)) return d;
  return null;
}
function requireAp() {
  const p = apPath();
  if (!p) throw new Error("Archipelago isn't installed where ArchipelagoVic can find it. Choose its folder in Settings.");
  return p;
}
// Resolve a path and make sure it stays inside the Archipelago folder.
function inside(base, ...parts) {
  const full = path.resolve(base, ...parts);
  const rel = path.relative(base, full);
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error("That path is outside the Archipelago folder.");
  return full;
}

// Minimal reader for the few host.yaml values we need (no YAML dependency).
function hostYamlValue(text, section, key) {
  const lines = text.split(/\r?\n/);
  let inSec = false;
  for (const line of lines) {
    if (/^\S/.test(line)) { inSec = line.replace(/:.*$/, "").trim() === section; continue; }
    if (!inSec) continue;
    const m = line.match(/^\s+([A-Za-z0-9_]+):\s*(.*)$/);
    if (m && m[1] === key) {
      let v = m[2].replace(/\s+#.*$/, "").trim();
      if (/^".*"$|^'.*'$/.test(v)) v = v.slice(1, -1);
      return v === "null" || v === "" ? null : v;
    }
  }
  return null;
}
async function folders() {
  const base = requireAp();
  let hostText = "";
  try { hostText = await fsp.readFile(path.join(base, "host.yaml"), "utf8"); } catch {}
  const out = hostYamlValue(hostText, "general_options", "output_path") || "output";
  const players = hostYamlValue(hostText, "generator", "player_files_path") || "Players";
  return {
    base,
    output: path.isAbsolute(out) ? out : path.join(base, out),
    players: path.isAbsolute(players) ? players : path.join(base, players),
    worlds: path.join(base, "custom_worlds"),
    logs: path.join(base, "logs"),
    hostYaml: path.join(base, "host.yaml"),
    hostText,
  };
}
// Set a few host.yaml settings for the person (game profiles: the base ROM, emuhawk_path), changing only those lines.
// The first time, their own host.yaml is kept as host.yaml.apvic-backup.
async function setHostKeys(changes) {
  const file = path.join(requireAp(), "host.yaml");
  if (!fs.existsSync(file)) throw new Error("Your Archipelago folder has no host.yaml yet. Open any Archipelago program once to create it.");
  return aplib.writeYamlKeys(file, changes, file + ".apvic-backup");
}

async function installInfo() {
  const base = apPath();
  if (!base) return { found: false, searched: candidateDirs() };
  let version = null;
  try { version = JSON.parse(await fsp.readFile(path.join(base, "manifest.json"), "utf8")).version.join("."); } catch {}
  const files = new Set(await fsp.readdir(base).catch(() => []));
  const f = await folders();
  const comps = COMPONENTS.map(c => ({ ...c, exe: c.frozen && files.has(c.frozen + ".exe") ? c.frozen + ".exe" : null }));
  const defaults = {
    port: hostYamlValue(f.hostText, "server_options", "port"),
    hint_cost: hostYamlValue(f.hostText, "server_options", "hint_cost"),
    release_mode: hostYamlValue(f.hostText, "server_options", "release_mode"),
    collect_mode: hostYamlValue(f.hostText, "server_options", "collect_mode"),
    remaining_mode: hostYamlValue(f.hostText, "server_options", "remaining_mode"),
    location_check_points: hostYamlValue(f.hostText, "server_options", "location_check_points"),
    spoiler: hostYamlValue(f.hostText, "generator", "spoiler"),
    race: hostYamlValue(f.hostText, "generator", "race"),
  };
  customComps = await scanCustomComponents(f.worlds);
  return { found: true, path: base, version, components: comps, customComponents: customComps, folders: { players: f.players, output: f.output, worlds: f.worlds, logs: f.logs }, defaults,
    artOnline: config.artOnline !== false, linksHandled: linksHandled(), hasSgdbKey: !!config.sgdbKey, closeToTray: config.closeToTray !== false };
}

async function scanCustomComponents(dir) {
  const out = [];
  for (const n of await fsp.readdir(dir).catch(() => [])) {
    if (!/\.apworld$/i.test(n)) continue;
    try { const i = aplib.inspectApworld(path.join(dir, n), apPath(), null); for (const c of i.components) if (!COMPONENTS.some(x => x.name === c)) out.push({ name: c, world: n, game: i.game }); } catch {}
  }
  return out;
}
function linksHandled() {
  try { return process.defaultApp ? app.isDefaultProtocolClient("archipelago", process.execPath, [app.getAppPath()]) : app.isDefaultProtocolClient("archipelago"); } catch { return false; }
}
// The Archipelago version string from manifest.json, e.g. "0.6.8"
async function apVersion() { try { return JSON.parse(await fsp.readFile(path.join(requireAp(), "manifest.json"), "utf8")).version.join("."); } catch { return null; } }

/* ---------------- process helpers ---------------- */
function childEnv() {
  return { ...process.env, PYTHONUNBUFFERED: "1", PYTHONIOENCODING: "utf-8" };
}
// Fire-and-forget launch of a GUI program (game clients, Options Creator…)
function launchDetached(exe, args, cwd) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(exe, args, { cwd, detached: true, stdio: "ignore", env: childEnv(), windowsHide: false });
    } catch (e) { reject(e); return; }
    child.once("error", reject);
    child.once("spawn", () => { child.unref(); resolve(true); });
  });
}
async function launchComponent(name, args = []) {
  const base = requireAp();
  const comp = COMPONENTS.find(c => c.name === name);
  if (comp && comp.native) throw new Error(`${name} is built into ArchipelagoVic.`);
  if (comp && comp.frozen && fs.existsSync(path.join(base, comp.frozen + ".exe")))
    return launchDetached(path.join(base, comp.frozen + ".exe"), args, base);
  // Python-only components (no program of their own) run inside Archipelago's runtime:
  // ArchipelagoLauncher.exe "<exact component name>" runs just that component, without the Launcher window.
  // Only known names are allowed, because an unknown name would make it open its full window instead.
  if (!comp && !customComps.some(c => c.name === name)) throw new Error(`"${name}" isn't a component of your Archipelago install.`);
  return launchDetached(path.join(base, "ArchipelagoLauncher.exe"), [name, ...args], base);
}
function patchHandler(suffix) {
  return COMPONENTS.find(c => (c.suffixes || []).includes(suffix) && !c.native) || null;
}

function send(channel, payload) { if (win && !win.isDestroyed()) win.webContents.send(channel, payload); }

// Long-running console program with streamed output (Server, Generate)
function runConsole(kind, exe, args, cwd, { keepStdin = true } = {}) {
  for (const [, p] of procs) if (p.kind === kind) throw new Error(kind === "server" ? "A server is already running. Stop it first." : "Generation is already running.");
  const id = procSeq++;
  const child = spawn(exe, args, { cwd, env: childEnv(), windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  const rec = { child, kind, started: Date.now(), args };
  procs.set(id, rec); updateTrayMenu();
  const pipe = stream => stream.on("data", buf => send("proc:data", { id, kind, text: buf.toString("utf8") }));
  pipe(child.stdout); pipe(child.stderr);
  child.on("error", e => send("proc:data", { id, kind, text: `\n[ArchipelagoVic] Couldn't start ${path.basename(exe)}: ${e.message}\n` }));
  child.on("exit", async (code, signal) => {
    procs.delete(id); updateTrayMenu();
    let result = null;
    if (kind === "generate" && code === 0) result = await newestOutput(rec.started).catch(() => null);
    send("proc:exit", { id, kind, code, signal, result });
  });
  if (!keepStdin) child.stdin.end();
  return id;
}
async function newestOutput(since = 0) {
  const f = await folders();
  const list = await listOutput();
  const fresh = list.filter(x => x.mtime >= since - 2000);
  return (fresh[0] || null);
}
async function listOutput() {
  const f = await folders();
  const names = await fsp.readdir(f.output).catch(() => []);
  const out = [];
  for (const n of names) {
    if (!/\.(zip|archipelago)$/i.test(n)) continue;
    const st = await fsp.stat(path.join(f.output, n)).catch(() => null);
    if (st && st.isFile()) out.push({ name: n, path: path.join(f.output, n), size: st.size, mtime: st.mtimeMs });
  }
  return out.sort((a, b) => b.mtime - a.mtime);
}

/* ---------------- YAML player files ---------------- */
function summarizeYaml(text) {
  const name = (text.match(/^name:\s*["']?([^"'\r\n#]+?)["']?\s*(#.*)?$/m) || [])[1] || null;
  let game = (text.match(/^game:\s*["']?([^"'\r\n#]+?)["']?\s*(#.*)?$/m) || [])[1] || null;
  if (!game && /^game:\s*(#.*)?$/m.test(text)) game = "Several games (weighted)";
  const docs = text.split(/^---\s*$/m).filter(d => /^name:/m.test(d)).length;
  return { name, game, slots: Math.max(1, docs) };
}
async function listYamls(dir) {
  const names = await fsp.readdir(dir).catch(() => []);
  const out = [];
  for (const n of names) {
    if (!/\.ya?ml$/i.test(n)) continue;
    const full = path.join(dir, n);
    const st = await fsp.stat(full).catch(() => null);
    if (!st || !st.isFile()) continue;
    let text = ""; try { text = await fsp.readFile(full, "utf8"); } catch {}
    out.push({ file: n, path: full, mtime: st.mtimeMs, ...summarizeYaml(text) });
  }
  return out.sort((a, b) => a.file.localeCompare(b.file));
}
async function uniqueTarget(dir, fileName) {
  const ext = path.extname(fileName), stem = path.basename(fileName, ext);
  let target = path.join(dir, fileName), i = 2;
  while (fs.existsSync(target)) target = path.join(dir, `${stem} (${i++})${ext}`);
  return target;
}

/* ---------------- IPC ---------------- */
function handle(channel, fn) {
  ipcMain.handle(channel, async (_e, ...args) => {
    try { return { ok: true, value: await fn.apply(_e, args) }; }   // regular functions get the IPC event as `this`
    catch (e) { return { ok: false, error: e.message || String(e) }; }
  });
}

function registerIpc() {
  handle("ap:info", installInfo);
  handle("ap:choosePath", async () => {
    const r = await dialog.showOpenDialog(win, { title: "Choose your Archipelago folder", properties: ["openDirectory"] });
    if (r.canceled || !r.filePaths[0]) return null;
    if (!isApDir(r.filePaths[0])) throw new Error("That folder doesn't contain ArchipelagoLauncher.exe.");
    config.apPath = r.filePaths[0]; saveConfig();
    return installInfo();
  });
  handle("ap:launch", (name, args) => launchComponent(String(name), Array.isArray(args) ? args.map(String) : []));
  const pick = async (title, filters, multi) => {
    const r = await dialog.showOpenDialog(win, { title, properties: multi ? ["openFile", "multiSelections"] : ["openFile"], filters });
    return r.canceled ? null : (multi ? r.filePaths : r.filePaths[0]);
  };
  handle("ap:inspectPatch", async (file) => {
    requireAp();
    if (!file) {
      const suffixes = [...new Set(COMPONENTS.flatMap(c => c.suffixes || []))].filter(s => s !== ".apworld" && s !== ".archipelago" && s !== ".zip").map(s => s.replace(/^\./, ""));
      file = await pick("Open a patch file", [{ name: "Archipelago patch files", extensions: suffixes }, { name: "All files", extensions: ["*"] }]);
      if (!file) return null;
    }
    const info = aplib.inspectPatch(file);
    const h = patchHandler(info.suffix);
    info.handler = h ? { name: h.name, game: h.game, ownProgram: !!h.frozen } : null;
    return info;
  });
  handle("ap:openPatch", async (file) => {
    const base = requireAp();
    const h = patchHandler(path.extname(String(file)).toLowerCase());
    if (!h) throw new Error("No client in your Archipelago install opens this kind of patch file.");
    if (h.frozen && fs.existsSync(path.join(base, h.frozen + ".exe"))) await launchDetached(path.join(base, h.frozen + ".exe"), [String(file)], base);
    else await launchDetached(path.join(base, "ArchipelagoLauncher.exe"), [String(file)], base); // runtime picks the client by file type
    return h.name;
  });
  handle("ap:inspectApworld", async (file) => {
    const base = requireAp();
    if (!file) { file = await pick("Install APWorld", [{ name: "APWorld", extensions: ["apworld"] }]); if (!file) return null; }
    return aplib.inspectApworld(String(file), base, await apVersion());
  });
  handle("ap:installApworld", async (file) => {
    const base = requireAp();
    const info = aplib.inspectApworld(String(file), base, await apVersion());
    if (path.resolve(info.file) === path.resolve(info.target)) throw new Error("That APWorld is already the installed copy.");
    await fsp.mkdir(path.dirname(info.target), { recursive: true });
    await fsp.copyFile(info.file, info.target);
    customComps = await scanCustomComponents(path.join(base, "custom_worlds"));
    return { module: info.module, game: info.game };
  });
  handle("ap:looseWorlds", async () => aplib.looseWorlds(requireAp()));
  handle("ap:buildApworld", async (dir, game) => {
    const base = requireAp();
    const full = path.resolve(String(dir));
    const okRoots = [path.join(base, "custom_worlds"), path.join(base, "lib", "worlds")];
    if (!okRoots.some(r => path.dirname(full) === r)) throw new Error("Only world folders in custom_worlds or lib\\worlds can be built.");
    return aplib.buildApworld(base, full, game || null);
  });
  handle("art:menu", async (game, kind) => new Promise(resolve => {
    kind = kind === "cover" ? "cover" : "icon";
    const what = kind === "icon" ? "icon" : "cover picture";
    const src = art.source(String(game), kind);
    const menu = Menu.buildFromTemplate([
      { label: `${game}`, enabled: false },
      { label: src ? `${kind === "icon" ? "Icon" : "Cover"} from ${src}` : `No ${what} found online`, enabled: false },
      { type: "separator" },
      { label: "About this game…", click: () => resolve("info") },
      { label: `Use my own ${what}…`, click: async () => {
          const f = await pick(`${kind === "icon" ? "Icon" : "Cover picture"} for ${game}`, [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif", "ico"] }]);
          if (f) { try { await art.setCustom(String(game), f, kind); resolve("changed"); } catch (e) { dialog.showErrorBox("Couldn't use that picture", e.message); resolve(null); } }
          else resolve(null);
        } },
      { label: `Reset ${what} (look it up again)`, click: async () => { await art.resetCustom(String(game), kind); resolve("changed"); } },
    ]);
    menu.popup({ window: win, callback: () => setTimeout(() => resolve(null), 50) });
  }));
  handle("art:setOnline", async (on) => { config.artOnline = !!on; saveConfig(); return config.artOnline; });
  handle("app:setCloseToTray", async (on) => { config.closeToTray = !!on; saveConfig(); if (on) createTray(); else if (tray) { tray.destroy(); tray = null; } return config.closeToTray; });
  handle("art:sgdbKey", async (k) => {
    k = String(k || "").trim();
    if (k && !/^[A-Za-z0-9]{16,64}$/.test(k)) throw new Error("That doesn't look like a SteamGridDB API key (letters and numbers only).");
    config.sgdbKey = k; saveConfig(); art.retryMissingIcons();
    return !!k;
  });
  handle("game:info", async (game) => {
    game = String(game);
    const i = await art.info(game);
    const ART = require("./game-art.json");
    const builtin = (ART._builtin || []).includes(game);
    const links = [...(i.links || [])];
    if (builtin) links.unshift({ label: "Archipelago game page", url: `https://archipelago.gg/games/${encodeURIComponent(game)}/info/en` });
    return { ...i, game, builtin, links };
  });
  handle("app:pendingUri", async () => { const u = pendingUri; pendingUri = null; return u; });
  handle("app:handleLinks", async (on) => {
    const ok = on
      ? (process.defaultApp ? app.setAsDefaultProtocolClient("archipelago", process.execPath, [app.getAppPath()]) : app.setAsDefaultProtocolClient("archipelago"))
      : (process.defaultApp ? app.removeAsDefaultProtocolClient("archipelago", process.execPath, [app.getAppPath()]) : app.removeAsDefaultProtocolClient("archipelago"));
    if (!ok) throw new Error("Windows didn't accept the change.");
    return linksHandled();
  });
  handle("ap:listWorlds", async () => {
    const f = await folders();
    const names = await fsp.readdir(f.worlds).catch(() => []);
    const out = [];
    for (const n of names) {
      if (!/\.apworld$/i.test(n)) continue;
      const st = await fsp.stat(path.join(f.worlds, n)).catch(() => null);
      if (!st) continue;
      let game = null, version = null;
      try { const i = aplib.inspectApworld(path.join(f.worlds, n), f.base, null); game = i.game; version = i.worldVersion; } catch {}
      out.push({ file: n, size: st.size, mtime: st.mtimeMs, game, version });
    }
    return out.sort((a, b) => a.file.localeCompare(b.file));
  });
  handle("ap:removeWorld", async (file) => {
    const f = await folders();
    const full = inside(f.worlds, path.basename(String(file)));
    await shell.trashItem(full);
    return true;
  });
  handle("ap:listPlayers", async () => {
    const f = await folders();
    return { players: await listYamls(f.players), templates: await listYamls(path.join(f.players, "Templates")) };
  });
  handle("ap:addPlayers", async (files) => {
    const f = await folders();
    if (!files || !files.length) {
      const r = await dialog.showOpenDialog(win, { title: "Add player YAMLs", properties: ["openFile", "multiSelections"], filters: [{ name: "YAML", extensions: ["yaml", "yml"] }] });
      if (r.canceled) return [];
      files = r.filePaths;
    }
    await fsp.mkdir(f.players, { recursive: true });
    const added = [];
    for (const src of files) {
      if (!/\.ya?ml$/i.test(src)) throw new Error(`${path.basename(src)} isn't a YAML file.`);
      const target = await uniqueTarget(f.players, path.basename(src));
      await fsp.copyFile(src, target);
      added.push(path.basename(target));
    }
    return added;
  });
  handle("ap:useTemplate", async (templateFile, newName) => {
    const f = await folders();
    const src = inside(path.join(f.players, "Templates"), path.basename(String(templateFile)));
    let text = await fsp.readFile(src, "utf8");
    if (newName) text = text.replace(/^name:.*$/m, `name: ${String(newName).replace(/[\r\n]/g, "").slice(0, 16)}`);
    const target = await uniqueTarget(f.players, path.basename(src));
    await fsp.writeFile(target, text, "utf8");
    return path.basename(target);
  });
  handle("ap:removePlayer", async (file) => {
    const f = await folders();
    await shell.trashItem(inside(f.players, path.basename(String(file))));
    return true;
  });
  handle("ap:readFile", async (which, file) => {
    const f = await folders();
    const full = which === "host" ? f.hostYaml : which === "template" ? inside(path.join(f.players, "Templates"), path.basename(String(file))) : inside(f.players, path.basename(String(file)));
    return await fsp.readFile(full, "utf8");
  });
  handle("ap:writeFile", async (which, file, text) => {
    const f = await folders();
    if (which !== "host" && which !== "player") throw new Error("That file can't be edited here.");
    const full = which === "host" ? f.hostYaml : inside(f.players, path.basename(String(file)));
    if (fs.existsSync(full)) await fsp.copyFile(full, full + ".bak");
    await fsp.writeFile(full, String(text), "utf8");
    return true;
  });
  handle("ap:listOutput", listOutput);
  handle("ap:pickMultidata", async () => {
    const f = await folders();
    const r = await dialog.showOpenDialog(win, { title: "Choose a generated multiworld", defaultPath: f.output, properties: ["openFile"], filters: [{ name: "Multiworld", extensions: ["zip", "archipelago"] }] });
    return r.canceled ? null : r.filePaths[0];
  });
  handle("ap:open", async (which) => {
    const f = await folders();
    const map = { base: f.base, players: f.players, output: f.output, worlds: f.worlds, logs: f.logs, host: f.hostYaml, templates: path.join(f.players, "Templates"), build: path.join(f.base, "build", "apworlds") };
    const target = map[which];
    if (!target) throw new Error("Unknown folder.");
    await fsp.mkdir(which === "host" ? path.dirname(target) : target, { recursive: true }).catch(() => {});
    const err = await shell.openPath(target);
    if (err) throw new Error(err);
    return true;
  });
  handle("ap:showItem", async (full) => { const f = await folders(); shell.showItemInFolder(inside(f.base, String(full))); return true; });
  handle("app:openExternal", async (url) => {
    if (!/^https:\/\//i.test(String(url))) throw new Error("Only https links can be opened.");
    await shell.openExternal(String(url)); return true;
  });

  handle("server:start", async (opts = {}) => {
    const base = requireAp();
    const exe = path.join(base, "ArchipelagoServer.exe");
    if (!opts.multidata) throw new Error("Choose a generated multiworld (.zip or .archipelago) first.");
    const args = [String(opts.multidata)];
    const add = (flag, v) => { if (v !== undefined && v !== null && v !== "") args.push(flag, String(v)); };
    add("--port", opts.port);
    add("--password", opts.password);
    add("--server_password", opts.server_password);
    add("--hint_cost", opts.hint_cost);
    add("--location_check_points", opts.location_check_points);
    add("--release_mode", opts.release_mode);
    add("--collect_mode", opts.collect_mode);
    add("--remaining_mode", opts.remaining_mode);
    add("--auto_shutdown", opts.auto_shutdown);
    if (opts.disable_item_cheat) args.push("--disable_item_cheat");
    return runConsole("server", exe, args, base);
  });
  handle("generate:start", async (opts = {}) => {
    const f = await folders();
    const exe = path.join(f.base, "ArchipelagoGenerate.exe");
    const args = ["--player_files_path", f.players, "--outputpath", f.output];
    if (opts.seed) args.push("--seed", String(parseInt(opts.seed, 10)));
    if (opts.spoiler !== undefined && opts.spoiler !== "") args.push("--spoiler", String(opts.spoiler));
    if (opts.race) args.push("--race");
    if (opts.skip_prog_balancing) args.push("--skip_prog_balancing");
    await fsp.mkdir(f.output, { recursive: true });
    return runConsole("generate", exe, args, f.base, { keepStdin: false });
  });
  handle("proc:write", async (id, text) => {
    const p = procs.get(id); if (!p) throw new Error("That program isn't running.");
    p.child.stdin.write(String(text).replace(/\r?\n?$/, "\n"));
    return true;
  });
  handle("proc:stop", async (id) => {
    const p = procs.get(id); if (!p) return false;
    if (p.kind === "server") { try { p.child.stdin.write("/exit\n"); } catch {} }
    const child = p.child;
    setTimeout(() => { if (procs.has(id)) killTree(child); }, p.kind === "server" ? 6000 : 0);
    return true;
  });
  handle("proc:list", async () => [...procs.entries()].map(([id, p]) => ({ id, kind: p.kind, started: p.started, args: p.args })));
  handle("win:flash", async () => { if (win && !win.isFocused()) win.flashFrame(true); return true; });
  // Read-only access to an Archipelago website's public API (room status, trackers) and room pages.
  const webGet = async (url, wantJson) => {
    const u = new URL(String(url));
    if (u.protocol !== "https:") throw new Error("Only https addresses are allowed.");
    if (wantJson ? !u.pathname.startsWith("/api/") : !/^\/room\//.test(u.pathname)) throw new Error("That address isn't an Archipelago room or API page.");
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20000);
    try {
      const r = await net.fetch(u.toString(), { headers: { "User-Agent": "ArchipelagoVic/2.3" }, signal: ctl.signal });
      if (!r.ok) throw new Error(`The website answered ${r.status}.`);
      return wantJson ? await r.json() : true;
    } finally { clearTimeout(t); }
  };
  handle("web:json", (url) => webGet(url, true));
  handle("web:touch", (url) => webGet(url, false));
  // Generate on the Archipelago website and open a room there (no port forwarding needed).
  handle("online:host", async () => {
    const f = await folders();
    const ART = require("./game-art.json");
    const builtin = new Set(ART._builtin || []);
    const yamls = (await listYamls(f.players));
    if (!yamls.length) throw new Error("Add at least one player YAML first.");
    const custom = [...new Set(yamls.map(y => y.game).filter(g => g && !/weighted/.test(g) && !builtin.has(g)))];
    if (custom.length) throw new Error(`archipelago.gg can only generate games that ship with Archipelago. These need your PC instead: ${custom.join(", ")}. Use Generate and Host on this PC for them.`);
    const base = (config.webhost || "https://archipelago.gg").replace(/\/$/, "");
    const progress = (stage, text) => send("online:progress", { stage, text });
    progress("upload", `Uploading ${yamls.length} YAML file${yamls.length === 1 ? "" : "s"} to ${new URL(base).host}…`);
    const zip = aplib.writeZip(await Promise.all(yamls.map(async y => ({ name: y.file, data: await fsp.readFile(y.path) }))));
    const boundary = "----ArchipelagoVic" + Date.now().toString(16);
    const body = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="players.zip"\r\nContent-Type: application/zip\r\n\r\n`), zip, Buffer.from(`\r\n--${boundary}--\r\n`)]);
    const res = await net.fetch(`${base}/api/generate`, { method: "POST", headers: { "Content-Type": `multipart/form-data; boundary=${boundary}`, "User-Agent": "ArchipelagoVic/2.3" }, body });
    let j = {}; try { j = await res.json(); } catch {}
    if (!res.ok || !j.encoded) throw new Error(`The website couldn't generate it: ${[j.text, typeof j.detail === "string" ? j.detail : ""].filter(Boolean).join(" — ") || res.status}`);
    progress("generating", "Generating on the website. This usually takes under a minute…");
    const statusUrl = `${base}/api/status/${j.encoded}`;
    const t0 = Date.now();
    for (;;) {
      if (Date.now() - t0 > 15 * 60000) throw new Error("Generation is taking longer than 15 minutes. Check the website later: " + `${base}/wait/${j.encoded}`);
      await new Promise(r => setTimeout(r, 3000));
      const s2 = await net.fetch(statusUrl).catch(() => null);
      if (!s2) continue;
      if (s2.status === 201) break;
      if (s2.status === 500 || s2.status === 404) { let e = {}; try { e = await s2.json(); } catch {} throw new Error(`Generation failed on the website (${e.text || s2.status}). Open ${base}/wait/${j.encoded} for the details.`); }
    }
    progress("room", "Opening a room…");
    // Electron's net.fetch hides where a redirect went, so read the redirect ourselves with Node's fetch.
    const nr = await fetch(`${base}/new_room/${j.encoded}`, { redirect: "manual", headers: { "User-Agent": "ArchipelagoVic/2.3" } }).catch(() => null);
    const m = (nr?.headers.get("location") || nr?.url || "").match(/\/room\/([A-Za-z0-9_-]+)/);
    if (!m) throw new Error("The seed was generated, but opening a room failed. Open " + `${base}/seed/${j.encoded}` + " and select Create New Room.");
    const roomUrl = `${base}/room/${m[1]}`;
    progress("start", "Starting the room…");
    let st = null;
    for (let i = 0; i < 20; i++) {
      st = await net.fetch(`${base}/api/room_status/${m[1]}`).then(r => r.ok ? r.json() : null).catch(() => null);
      if (st?.last_port) break;
      if (i === 3) await net.fetch(roomUrl).catch(() => {});
      await new Promise(r => setTimeout(r, 2000));
    }
    const server = st?.last_port ? `${new URL(base).hostname}:${st.last_port}` : null;
    progress("done", server ? `Room ready at ${server}.` : "Room created; it will start when someone opens its page.");
    return { roomUrl, server, seedUrl: `${base}/seed/${j.encoded}`, players: (st?.players || yamls.map(y => [y.name, y.game])) };
  });
  handle("app:copy", async (text) => { require("electron").clipboard.writeText(String(text)); return true; });
  // ---- update checks (GitHub releases) ----
  const UT_REPO = "FarisTheAncient/Archipelago";
  const DEFAULT_REPOS = { oni: "ShadowKitty42/ONI-Archipelago", tracker: UT_REPO };
  // Projects that publish several things from one repository: only releases whose tag starts like this count.
  const TAG_PREFIX = { [UT_REPO]: /^Tracker_v/i };
  const repos = () => ({ ...DEFAULT_REPOS, ...(config.worldRepos || {}) });
  const gh = async (pathname) => {
    const r = await net.fetch(`https://api.github.com${pathname}`, { headers: { "User-Agent": "ArchipelagoVic/2.3", Accept: "application/vnd.github+json" } });
    if (r.status === 403 || r.status === 429) throw new Error("GitHub's hourly limit for update checks was reached. Try again later.");
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`Couldn't reach GitHub to check for updates (${r.status}).`);
    return r.json();
  };
  const latestRelease = async (repo, assetRe = /\.apworld$/i) => {
    const prefix = TAG_PREFIX[repo];
    if (!prefix) return gh(`/repos/${repo}/releases/latest`);
    const list = await gh(`/repos/${repo}/releases?per_page=30`);
    return (list || []).find(r => !r.draft && !r.prerelease && prefix.test(r.tag_name || "") && (r.assets || []).some(a => assetRe.test(a.name))) || null;
  };
  async function checkUpdates() {
    const base = requireAp();
    const out = { checked: Date.now(), app: app.getVersion(), archipelago: null, worlds: [], errors: [] };
    try {
      const rel = await gh("/repos/ArchipelagoMW/Archipelago/releases/latest");
      const cur = await apVersion();
      if (rel && cur) {
        const latest = String(rel.tag_name || "").replace(/^v/, "");
        const newer = aplib.cmpVersion(aplib.parseVersion(latest) || [0], aplib.parseVersion(cur) || [0]) > 0;
        out.archipelago = { current: cur, latest, newer, url: rel.html_url, published: rel.published_at };
      }
    } catch (e) { out.errors.push(/fetch|net::/i.test(e.message) ? "Couldn't reach GitHub to check for updates. Check your internet connection." : e.message); }
    const dir = path.join(base, "custom_worlds");
    for (const n of await fsp.readdir(dir).catch(() => [])) {
      if (!/\.apworld$/i.test(n)) continue;
      const mod = n.replace(/\.apworld$/i, "");
      const repo = repos()[mod];
      const st = await fsp.stat(path.join(dir, n)).catch(() => null);
      let game = null, version = null;
      try { const i = aplib.inspectApworld(path.join(dir, n), base, null); game = i.game; version = i.worldVersion; } catch {}
      const w = { module: mod, file: n, game, version, repo: repo || null };
      if (repo && st) {
        try {
          const rel = await latestRelease(repo);
          const asset = rel && (rel.assets || []).find(a => a.name === n) || rel && (rel.assets || []).find(a => /\.apworld$/i.test(a.name));
          if (asset) Object.assign(w, { tag: rel.tag_name, releaseUrl: rel.html_url, published: rel.published_at, assetUrl: asset.browser_download_url, assetName: asset.name,
            newer: asset.size !== st.size && Date.parse(asset.updated_at || rel.published_at) > st.mtimeMs - 864e5 });
          else w.note = "That project's latest release has no .apworld file.";
        } catch (e) { w.note = /fetch|net::/i.test(e.message) ? "Couldn't reach GitHub." : e.message; }
      }
      out.worlds.push(w);
    }
    config.updates = out; saveConfig();
    return out;
  }
  handle("updates:check", async (force) => {
    if (!force && config.updates && !config.updates.errors?.length && Date.now() - config.updates.checked < 12 * 3600e3) return config.updates;
    return checkUpdates();
  });
  handle("updates:setRepo", async (mod, repo) => {
    repo = String(repo || "").trim().replace(/^https:\/\/github\.com\//, "").replace(/\/$/, "");
    if (repo && !/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error("Enter the GitHub project as owner/name, e.g. ShadowKitty42/ONI-Archipelago.");
    config.worldRepos = { ...(config.worldRepos || {}), [String(mod)]: repo || undefined };
    saveConfig();
    return checkUpdates();
  });
  handle("updates:installWorld", async (mod) => {
    const base = requireAp();
    const w = (config.updates?.worlds || []).find(x => x.module === mod && x.assetUrl);
    if (!w) throw new Error("No update found for that world. Check for updates first.");
    if (!/^https:\/\/github\.com\//.test(w.assetUrl)) throw new Error("Updates are only downloaded from GitHub.");
    const r = await net.fetch(w.assetUrl, { headers: { "User-Agent": "ArchipelagoVic/2.3" } });
    if (!r.ok) throw new Error(`Download failed (${r.status}).`);
    const tmp = path.join(app.getPath("temp"), `apvic-${Date.now()}-${path.basename(w.assetName)}`);
    await fsp.writeFile(tmp, Buffer.from(await r.arrayBuffer()));
    try {
      const info = aplib.inspectApworld(tmp, base, await apVersion());
      if (info.module !== mod) throw new Error(`The download is a different world (${info.module}), so it wasn't installed.`);
      await fsp.copyFile(info.file, info.target);
      customComps = await scanCustomComponents(path.join(base, "custom_worlds"));
      await checkUpdates();
      return { module: mod, game: info.game, version: info.worldVersion, tag: w.tag, warnings: info.warnings };
    } finally { fsp.unlink(tmp).catch(() => {}); }
  });
  // ---- what's in logic (runs Universal Tracker's logic through the ArchipelagoVic Logic helper) ----
  handle("logic:status", async () => {
    const base = requireAp();
    return { ut: utInstalled(base), debugExe: fs.existsSync(debugLauncher(base)) };
  });
  // Repair: Universal Tracker is installed but won't load (usually too old or too new for this Archipelago).
  handle("logic:installUT", async () => { await installBundledUT(requireAp(), true); return { tag: BUNDLED_UT_VERSION }; });
  handle("logic:chooseYaml", async function () {
    const owner = BrowserWindow.fromWebContents(this.sender) || win;
    const f = await folders().catch(() => null);
    const r = await dialog.showOpenDialog(owner, { title: "Choose your player YAML", defaultPath: f?.players, properties: ["openFile"], filters: [{ name: "Player YAML", extensions: ["yaml", "yml"] }] });
    return r.canceled ? null : r.filePaths[0];
  });
  handle("logic:start", async function (opts = {}) {
    const frame = this.senderFrame;
    const base = requireAp();
    const exe = debugLauncher(base);
    if (!fs.existsSync(exe)) throw new Error("Your Archipelago install has no ArchipelagoLauncherDebug.exe, which this needs. Reinstall Archipelago 0.6.2 or newer.");
    if (!utInstalled(base)) await installBundledUT(base, false);   // built in: set up silently the first time
    const server = String(opts.server || "").trim(), slot = String(opts.slot || "").trim();
    if (!server || !slot) throw new Error("Connect to a room first.");
    await ensureBridge(base);
    const yaml = await findSlotYaml(slot, opts.yamlFile || null);
    const tmp = await fsp.mkdtemp(path.join(app.getPath("temp"), "apvic-logic-"));
    if (yaml) await fsp.writeFile(path.join(tmp, "player.yaml"), yaml.text, "utf8");
    const args = ["ArchipelagoVic Logic", "--", "--nogui", "--connect", server, "--name", slot, "--yaml-dir", tmp];
    if (opts.password) args.push("--password", String(opts.password));
    const id = logicSeq++;
    const child = spawn(exe, args, { cwd: base, env: childEnv(), windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    const rec = { id, child, frame, buf: "", tmp, tail: [] };
    logicProcs.set(id, rec);
    const deliver = msg => {
      try { if (frame.isDestroyed?.() || frame.detached) throw 0; frame.send("logic:data", { id, ...msg }); }
      catch { stopLogic(id); }
    };
    const keep = line => { if (line.trim()) { rec.tail.push(line.slice(0, 500)); if (rec.tail.length > 40) rec.tail.shift(); } };
    child.stdout.on("data", d => {
      rec.buf += d.toString("utf8");
      let i;
      while ((i = rec.buf.indexOf("\n")) >= 0) {
        const line = rec.buf.slice(0, i).replace(/\r$/, ""); rec.buf = rec.buf.slice(i + 1);
        if (line.startsWith("APVIC ")) { try { deliver(JSON.parse(line.slice(6))); } catch {} }
        else keep(line);
      }
    });
    child.stderr.on("data", d => d.toString("utf8").split(/\r?\n/).forEach(keep));
    child.on("error", e => deliver({ type: "error", code: "spawn", text: `Couldn't start Archipelago: ${e.message}` }));
    child.on("exit", code => {
      logicProcs.delete(id);
      fsp.rm(tmp, { recursive: true, force: true }).catch(() => {});
      if (!rec.stopping) deliver({ type: "exit", code, tail: rec.tail.slice(-15).join("\n") });
    });
    return { id, yaml: yaml ? { file: yaml.file, name: yaml.name } : null };
  });
  handle("logic:stop", async (id) => { stopLogic(id); return true; });
  handle("logic:refresh", async (id) => { const r = logicProcs.get(id); try { r?.child.stdin.write("refresh\n"); } catch {} return !!r; });

  // ---- game profiles ----
  handle("profile:list", async () => profileList());
  handle("profile:check", async (x) => checkProfile(normalizeProfile(typeof x === "string" ? { id: x } : x)));
  handle("profile:save", async (x) => saveProfile(x || {}));
  handle("profile:remove", async (id) => { config.profiles = profileList().filter(p => p.id !== id); saveConfig(); return true; });
  handle("play:start", async function (opts = {}) {
    if (playing) throw new Error("A game is already starting. Wait for it to finish.");
    const sender = this.sender;
    const progress = (step, state, text) => { try { if (!sender.isDestroyed()) sender.send("play:progress", { step, state, text }); } catch {} };
    const started = [];
    playing = true;
    try { return await playProfile(opts, progress, started); }
    catch (e) { for (const c of started) killTree(c); throw e; }   // leave nothing half-started
    finally { playing = false; }
  });
  handle("profile:pick", async function (kind, current) {
    const owner = BrowserWindow.fromWebContents(this.sender) || win;
    const what = {
      emuhawk: { title: "Choose EmuHawk.exe (BizHawk)", filters: [{ name: "EmuHawk", extensions: ["exe"] }] },
      rom: { title: "Choose the original ROM", filters: [{ name: "ROM files", extensions: ROM_EXTENSIONS }, { name: "All files", extensions: ["*"] }] },
      patch: { title: "Choose this game's patch file", filters: [{ name: "Archipelago patch files", extensions: [...BIZHAWK_SUFFIXES].map(s => s.slice(1)) }, { name: "All files", extensions: ["*"] }] },
    }[kind];
    if (!what) throw new Error("Unknown file.");
    const cur = cleanPath(current);
    const r = await dialog.showOpenDialog(owner, { title: what.title, properties: ["openFile"], filters: what.filters, defaultPath: cur && path.isAbsolute(cur) ? cur : undefined });
    return r.canceled ? null : r.filePaths[0];
  });

  handle("theme:pickImage", async function (id) {
    if (!/^[a-z0-9-]{1,40}$/.test(id || "")) throw new Error("Unknown theme.");
    const owner = BrowserWindow.fromWebContents(this.sender) || win;
    const r = await dialog.showOpenDialog(owner, { title: "Choose a picture for this theme", properties: ["openFile"], filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif", "avif"] }] });
    if (r.canceled) return null;
    const src = r.filePaths[0];
    if (!IMG_EXT.test(src)) throw new Error("Choose a PNG, JPG, WebP, GIF or AVIF image.");
    const st = await fsp.stat(src);
    if (st.size > 20 * 1024 * 1024) throw new Error("That picture is over 20 MB. Choose a smaller one.");
    await fsp.mkdir(themeArtDir(), { recursive: true });
    await clearThemeArt(id);
    await fsp.copyFile(src, path.join(themeArtDir(), id + path.extname(src).toLowerCase()));
    return { v: Date.now() };
  });
  handle("theme:folder", async () => ({ path: themeFolder(), images: themeFolderImages() }));
  handle("theme:openFolder", async () => {
    const dir = themeFolder();
    await fsp.mkdir(dir, { recursive: true });
    const err = await shell.openPath(dir);
    if (err) throw new Error(err);
    return dir;
  });
  handle("theme:clearImage", async (id) => { if (/^[a-z0-9-]{1,40}$/.test(id || "")) await clearThemeArt(id); return true; });

  handle("mini:toggle", async () => { if (mini && !mini.isDestroyed()) { mini.close(); return false; } createMini(); return true; });
  handle("mini:update", async (data) => { miniData = data || { rooms: [] }; updateTrayMenu(); if (mini && !mini.isDestroyed()) mini.webContents.send("mini:data", miniData); return true; });
  handle("mini:get", async () => miniData);
  handle("mini:close", async () => { if (mini && !mini.isDestroyed()) mini.close(); return true; });
  handle("mini:focusMain", async () => { showMain(); return true; });
}

function killTree(child) {
  if (!child || child.exitCode !== null) return;
  if (IS_WIN) { try { spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true }); } catch {} }
  else { try { child.kill("SIGTERM"); } catch {} }
}

/* ---------------- theme pictures (the person's own images, one per theme) ---------------- */
const themeArtDir = () => path.join(app.getPath("userData"), "theme-art");
const IMG_EXT = /\.(png|jpe?g|webp|gif|avif)$/i;
function themeArtFile(id) {
  if (!/^[a-z0-9-]{1,40}$/.test(id || "")) return null;
  try { const n = fs.readdirSync(themeArtDir()).find(f => f.replace(IMG_EXT, "") === id && IMG_EXT.test(f)); return n ? path.join(themeArtDir(), n) : null; } catch { return null; }
}
// The theme-pictures folder: images named after a theme ("frieren.png", "one-piece.jpg") are used for that theme.
// Next to the project files when run from source, next to the program when installed.
function themeFolder() {
  if (!app.isPackaged) return path.join(__dirname, "theme-pictures");
  return path.join(process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(process.execPath), "theme-pictures");
}
function themeFolderImages() {
  const out = {};
  try {
    for (const f of fs.readdirSync(themeFolder())) {
      if (!IMG_EXT.test(f)) continue;
      const stem = f.replace(IMG_EXT, "").toLowerCase();
      if (!/^[a-z0-9-]{1,60}$/.test(stem)) continue;
      out[stem] = Math.round(fs.statSync(path.join(themeFolder(), f)).mtimeMs);
    }
  } catch {}
  return out;
}
function themeFolderFile(stem) {
  if (!/^[a-z0-9-]{1,60}$/.test(stem || "")) return null;
  try { const n = fs.readdirSync(themeFolder()).find(f => IMG_EXT.test(f) && f.replace(IMG_EXT, "").toLowerCase() === stem); return n ? path.join(themeFolder(), n) : null; } catch { return null; }
}
async function clearThemeArt(id) {
  for (const f of await fsp.readdir(themeArtDir()).catch(() => [])) if (f.replace(IMG_EXT, "") === id && IMG_EXT.test(f)) await fsp.unlink(path.join(themeArtDir(), f)).catch(() => {});
}

/* ---------------- in-logic helper ---------------- */
const logicProcs = new Map();   // id -> { child, frame, tmp, tail }
let logicSeq = 1;
const debugLauncher = base => path.join(base, "ArchipelagoLauncherDebug.exe");
// Universal Tracker (MIT, by FarisTheAncient) ships inside ArchipelagoVic; see logic/universal-tracker/LICENSE.txt.
const BUNDLED_UT = path.join(__dirname, "logic", "universal-tracker", "tracker.apworld");
const BUNDLED_UT_VERSION = "v0.3.5";
function utFiles(base) {
  try { return fs.readdirSync(path.join(base, "custom_worlds")).filter(n => /^tracker\b.*\.apworld$/i.test(n)); } catch { return []; }
}
async function installBundledUT(base, replace) {
  const dir = path.join(base, "custom_worlds");
  await fsp.mkdir(dir, { recursive: true });
  const data = await fsp.readFile(BUNDLED_UT);
  const existing = utFiles(base);
  if (existing.length && !replace) return;
  // Replace the copy that failed to load in place (one tracker world only), keeping a backup Archipelago won't load.
  for (const n of existing.slice(1)) await fsp.rename(path.join(dir, n), path.join(dir, n + ".bak")).catch(() => {});
  const target = path.join(dir, existing[0] || "tracker.apworld");
  if (existing[0]) await fsp.copyFile(target, target + ".bak").catch(() => {});
  await fsp.writeFile(target, data);
  customComps = await scanCustomComponents(dir).catch(() => customComps);
}
function utInstalled(base) {
  // Universal Tracker installs as custom_worlds/tracker.apworld (sometimes renamed, e.g. "tracker (1).apworld").
  const cw = path.join(base, "custom_worlds");
  let names = [];
  try { names = fs.readdirSync(cw); } catch {}
  return names.some(n => /^tracker\b.*\.apworld$/i.test(n)) || fs.existsSync(path.join(cw, "tracker", "__init__.py")) || fs.existsSync(path.join(base, "lib", "worlds", "tracker"));
}
// The helpers (Logic and Patch) ship as plain files in logic/ and are packed into custom_worlds/apvic_logic.apworld when it's missing or out of date.
function bridgeZip() {
  const dir = path.join(__dirname, "logic", "apvic_logic");
  return aplib.writeZip(["__init__.py", "bridge.py", "patcher.py", "archipelago.json"].map(n => ({ name: `apvic_logic/${n}`, data: fs.readFileSync(path.join(dir, n)) })));
}
async function ensureBridge(base) {
  const target = path.join(base, "custom_worlds", "apvic_logic.apworld");
  const want = bridgeZip();
  const have = await fsp.readFile(target).catch(() => null);
  if (have && have.equals(want)) return;
  await fsp.mkdir(path.dirname(target), { recursive: true });
  await fsp.writeFile(target, want);
}
// The player YAML for a slot: from a file the person picked, or the one in the Players folder whose name matches.
async function findSlotYaml(slot, pickedFile) {
  const matches = (template, name) => {
    const t = String(template || "").replace(/\s+#.*$/, "").trim().replace(/^(['"])(.*)\1$/, "$2");
    if (!t) return false;
    if (t === name) return true;
    const re = new RegExp("^" + t.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/\{(player|PLAYER|number|NUMBER)\}/g, "\\d*") + "$");
    return /\{(player|PLAYER|number|NUMBER)\}/.test(t) && re.test(name);
  };
  const docsOf = text => text.replace(/\r\n/g, "\n").split(/^---\s*$/m).filter(d => /^name:/m.test(d));
  const pick = (file, text) => {
    const docs = docsOf(text);
    const doc = docs.find(d => matches((d.match(/^name:(.*)$/m) || [])[1], slot)) || (pickedFile && docs.length === 1 ? docs[0] : null);
    if (!doc) return null;
    // Use the exact slot name so the tracker can find this player.
    return { file, name: slot, text: doc.replace(/^name:.*$/m, `name: ${JSON.stringify(slot)}`) };
  };
  if (pickedFile) {
    const text = await fsp.readFile(pickedFile, "utf8");
    const r = pick(pickedFile, text);
    if (!r) throw new Error(`That file has no player named ${slot}.`);
    return r;
  }
  const f = await folders().catch(() => null);
  if (!f) return null;
  for (const n of (await fsp.readdir(f.players).catch(() => [])).filter(n => /\.ya?ml$/i.test(n)).sort()) {
    const text = await fsp.readFile(path.join(f.players, n), "utf8").catch(() => "");
    const r = pick(path.join(f.players, n), text);
    if (r) return r;
  }
  return null;
}
function stopLogic(id) {
  const r = logicProcs.get(id);
  if (!r) return;
  r.stopping = true;
  try { r.child.stdin.end("quit\n"); } catch {}
  setTimeout(() => killTree(r.child), 4000);
}
function stopAllLogic() { for (const id of [...logicProcs.keys()]) stopLogic(id); }

/* ---------------- game profiles (one-click Play for BizHawk games) ---------------- */
const BIZHAWK_SUFFIXES = new Set((COMPONENTS.find(c => c.name === "BizHawk Client") || {}).suffixes || []);
const ROM_EXTENSIONS = ["gb", "gbc", "gba", "nes", "sfc", "smc", "z64", "n64", "v64", "nds", "md", "gen", "sms", "gg", "pce", "iso", "bin", "cue"];
const profileList = () => (Array.isArray(config.profiles) ? config.profiles : []);
const cleanPath = v => String(v || "").trim().replace(/^"(.*)"$/, "$1") || null;

// ROM facts (size, MD5, title) are cached by path, size and time, so a big ROM is only read once.
async function cachedRomFacts(file) {
  const st = await fsp.stat(file);
  const cache = config.romFacts || {};
  const c = cache[file];
  if (c && c.size === st.size && c.mtime === st.mtimeMs) return c;
  const f = await aplib.romFacts(file);
  const keep = Object.keys(cache).filter(k => k !== file).slice(-49);
  config.romFacts = { ...Object.fromEntries(keep.map(k => [k, cache[k]])), [file]: f };
  saveConfig();
  return f;
}

// Runs the hidden "ArchipelagoVic Patch" helper (logic/apvic_logic/patcher.py) and returns its APVIC message.
async function runPatchHelper(args, timeoutMs = 120000) {
  const base = requireAp();
  const exe = debugLauncher(base);
  if (!fs.existsSync(exe)) throw new Error("Your Archipelago install has no ArchipelagoLauncherDebug.exe, which patching needs. Reinstall Archipelago 0.6.2 or newer.");
  await ensureBridge(base);
  return new Promise((resolve, reject) => {
    const child = spawn(exe, ["ArchipelagoVic Patch", "--", ...args], { cwd: base, env: childEnv(), windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    child.stdin.end();
    let out = "", err = "";
    const timer = setTimeout(() => { killTree(child); reject(new Error("Archipelago took more than two minutes to patch the game, so it was stopped.")); }, timeoutMs);
    child.stdout.on("data", d => { out += d.toString("utf8"); });
    child.stderr.on("data", d => { err = (err + d.toString("utf8")).slice(-4000); });
    child.on("error", e => { clearTimeout(timer); reject(new Error(`Couldn't start Archipelago: ${e.message}`)); });
    child.on("exit", () => {
      clearTimeout(timer);
      const line = out.split(/\r?\n/).find(l => l.startsWith("APVIC "));
      if (!line) return reject(new Error(`Archipelago stopped without an answer. ${err.trim().split(/\r?\n/).slice(-3).join(" ")}`.trim()));
      try { resolve(JSON.parse(line.slice(6))); } catch { reject(new Error("Archipelago's answer couldn't be read.")); }
    });
  });
}

// A server address (host:port) or an Archipelago room link. Returns a problem, or null when it's fine (or empty).
function serverProblem(s) {
  s = String(s || "").trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) {
    try { if (/^\/room\/[A-Za-z0-9_-]+\/?$/.test(new URL(s).pathname)) return null; } catch {}
    return "That link isn't an Archipelago room link. Room links look like https://archipelago.gg/room/…";
  }
  const m = s.replace(/^wss?:\/\//i, "").match(/^([^\s:/]+)(?::(\d{1,5}))?$/);
  if (!m || (m[2] && +m[2] > 65535)) return "Type the server as address:port (for example localhost:38281 or archipelago.gg:38281), or paste a room link.";
  return null;
}

// Checks every path in a profile. problems has one plain-language sentence per field that's wrong:
// emuhawk, rom, patch, server. Also reports the ROM's facts, the patch, the hashes it needs and its host.yaml setting.
async function checkProfile(p) {
  const problems = {};
  const out = { problems, game: p.game || null, rom: null, patch: null, expected: [], romSetting: null };
  const isFile = f => { try { return fs.statSync(f).isFile(); } catch { return false; } };

  if (!p.emuhawk) problems.emuhawk = "Choose EmuHawk.exe. If BizHawk isn't installed yet, download it from tasvideos.org/BizHawk and unpack it anywhere.";
  else if (!path.isAbsolute(p.emuhawk)) problems.emuhawk = "Use the full path to EmuHawk.exe, starting with the drive (C:\\…).";
  else if (!/^emuhawk\.exe$/i.test(path.basename(p.emuhawk))) problems.emuhawk = "Choose EmuHawk.exe itself: the program inside your BizHawk folder.";
  else if (!isFile(p.emuhawk)) problems.emuhawk = `EmuHawk.exe isn't at ${p.emuhawk}. Choose where it is now.`;

  let inspected = null;
  const inspect = async () => (inspected ??= await runPatchHelper(["--inspect", p.patch]).catch(e => ({ type: "error", text: e.message })));
  if (p.patch) {
    if (!path.isAbsolute(p.patch) || !isFile(p.patch)) problems.patch = `The patch file ${p.patch} isn't there. Choose this game's patch file again.`;
    else {
      try {
        out.patch = aplib.inspectPatch(p.patch);
        out.game = out.game || out.patch.game;
        if (p.game && out.patch.game && out.patch.game !== p.game) problems.patch = `This patch is for ${out.patch.game}, but this profile is for ${p.game}. Choose a ${p.game} patch, or make a profile for ${out.patch.game}.`;
        else if (!BIZHAWK_SUFFIXES.has(out.patch.suffix)) {
          const m = await inspect();
          if (m.type !== "inspect") problems.patch = m.code === "no-handler" ? `Your Archipelago install has no game that uses ${out.patch.suffix} patch files. Install the game's .apworld first.` : `Archipelago couldn't read this patch: ${m.text}`;
        }
      } catch (e) {
        problems.patch = /archipelago\.json|zip/i.test(e.message) ? `${path.basename(p.patch)} isn't an Archipelago patch file, or it's damaged. Download it again from the room or the generated game.` : `Couldn't read the patch file: ${e.message}`;
      }
    }
  }

  let facts = null;
  if (!p.rom) problems.rom = "Choose the original ROM of the game.";
  else if (!path.isAbsolute(p.rom) || !isFile(p.rom)) problems.rom = `The ROM isn't at ${p.rom}. Choose where it is now.`;
  else if (/\.(zip|7z|rar)$/i.test(p.rom)) problems.rom = "That's a compressed archive. Unpack the ROM inside it first, then choose the unpacked file.";
  else {
    try {
      facts = await cachedRomFacts(p.rom);
      out.rom = { size: facts.size, md5: facts.md5, title: facts.title, known: aplib.KNOWN_ROMS[facts.md5]?.name || null };
      out.game = out.game || aplib.KNOWN_ROMS[facts.md5]?.game || null;   // a ROM we know names its game
    } catch (e) { problems.rom = `Couldn't read the ROM: ${e.message}`; }
  }

  // Which original ROM(s) are needed: the patch says (base_checksum); otherwise ask Archipelago; without a patch, the ROMs we know for this game.
  if (out.patch && !problems.patch) {
    let md5 = out.patch.baseChecksum;
    if (!md5) { const m = await inspect(); md5 = m.type === "inspect" ? m.expectedHash : null; }
    if (md5) out.expected = [{ md5, ...(aplib.KNOWN_ROMS[md5] || {}) }];
  } else if (!p.patch) out.expected = aplib.knownRomsFor(out.game);
  if (facts && out.expected.length && !out.expected.some(w => w.md5 === facts.md5)) problems.rom = aplib.romMismatch(p.rom, facts, out.expected, out.game);

  // Where Archipelago keeps this ROM in host.yaml, so its own tools use the same one.
  if (out.rom && !problems.rom) {
    const k = aplib.KNOWN_ROMS[out.rom.md5];
    if (k) out.romSetting = { section: k.section, key: k.key };
    else if (out.patch && !problems.patch) { const m = await inspect(); if (m.type === "inspect" && m.romSection && m.romKey) out.romSetting = { section: m.romSection, key: m.romKey }; }
  }

  const sp = serverProblem(p.server);
  if (sp) problems.server = sp;
  out.ok = !Object.keys(problems).length;
  return out;
}

function normalizeProfile(x = {}) {
  const old = profileList().find(p => p.id === x.id) || {};
  const pick = k => (x[k] !== undefined ? x[k] : old[k]);
  return {
    id: old.id || `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    game: String(pick("game") || "").trim().slice(0, 120) || null,
    emuhawk: cleanPath(pick("emuhawk")),
    rom: cleanPath(pick("rom")),
    patch: cleanPath(pick("patch")),
    server: String(pick("server") || "").trim().slice(0, 300) || null,
    lastServer: old.lastServer || null,
  };
}

// Saves a profile even when something is wrong (so it can be fixed later), and puts the parts that are right into host.yaml.
async function saveProfile(x) {
  const p = normalizeProfile(x);
  const check = await checkProfile(p);
  if (!p.game && check.game) p.game = check.game;
  const changes = [];
  if (p.emuhawk && !check.problems.emuhawk) changes.push({ section: "bizhawkclient_options", key: "emuhawk_path", value: p.emuhawk });
  if (check.romSetting) changes.push({ ...check.romSetting, value: p.rom });
  let hostChanges = [], hostError = null;
  if (changes.length) { try { hostChanges = await setHostKeys(changes); } catch (e) { hostError = `Saved, but host.yaml couldn't be updated: ${e.message}`; } }
  const list = profileList().filter(q => q.id !== p.id);
  const at = profileList().findIndex(q => q.id === p.id);
  list.splice(at < 0 ? list.length : at, 0, p);
  config.profiles = list; saveConfig();
  return { profile: p, check, hostChanges, hostError };
}

/* ---------------- Play: patch the game, start EmuHawk and the BizHawk Client ---------------- */
// Steps, in order. The window resolves a room link to its address before "server" (roomAddress), and opens
// the room tab after "client" (step "room"). If any step fails, everything this run started is closed again.
let playing = false;

// True when something accepts connections at host:port (the Archipelago server is a WebSocket server).
function serverAnswers(server, ms = 6000) {
  const m = String(server).replace(/^wss?:\/\//i, "").match(/^([^\s:/]+)(?::(\d+))?$/);
  if (!m) return Promise.resolve(false);
  return new Promise(resolve => {
    const s = require("net").connect({ host: m[1], port: +(m[2] || 38281) });
    const done = ok => { s.destroy(); resolve(ok); };
    s.setTimeout(ms, () => done(false));
    s.once("connect", () => done(true));
    s.once("error", () => done(false));
  });
}
// Starts a program and waits a moment to make sure it didn't close straight away.
function startAndWatch(exe, args, cwd, settleMs = 2500) {
  return new Promise((resolve, reject) => {
    let child, settled = false;
    const end = (fn, v) => { if (!settled) { settled = true; fn(v); } };
    try { child = spawn(exe, args, { cwd, detached: true, stdio: "ignore", env: childEnv(), windowsHide: false }); } catch (e) { reject(e); return; }
    child.once("error", e => end(reject, e));
    child.once("exit", code => end(reject, new Error(`it closed straight away (exit code ${code})`)));
    child.once("spawn", () => setTimeout(() => { child.unref(); end(resolve, child); }, settleMs));
  });
}
function patchHelperProblem(m) {
  if (m.code === "hash-mismatch") return `${m.text} Choose the original ROM in this game's profile.`;
  if (m.code === "crash") return `Archipelago couldn't patch the game: ${m.text}`;
  return m.text || "Archipelago couldn't patch the game.";
}
const fileStamp = f => { const s = fs.statSync(f); return `${s.size}:${Math.round(s.mtimeMs)}`; };

async function playProfile(opts, progress, started) {
  const base = requireAp();
  const saved = profileList().find(q => q.id === opts.id);
  if (!saved) throw new Error("That game profile doesn't exist any more.");
  const p = normalizeProfile({ id: saved.id, patch: opts.patch !== undefined ? opts.patch : saved.patch });
  const fail = (step, text) => { progress(step, "failed", text); throw new Error(text); };

  // 1. the room answers (a room link was already turned into address:port by the window)
  const server = String(opts.server || "").trim().replace(/^wss?:\/\//i, "");
  if (!server) fail("server", "Type the room's address (address:port), or paste its room link.");
  const sp = serverProblem(server) || (/^https?:/i.test(server) ? "Room links have to be turned into an address first." : null);
  if (sp) fail("server", sp);
  progress("server", "running", `Looking for the room at ${server}…`);
  if (!(await serverAnswers(server)))
    fail("server", `Nothing answered at ${server}. Check that the room is running and the port is right. archipelago.gg rooms get a new port when they restart, so paste the room link instead of the address.`);
  progress("server", "done", `The room at ${server} is running.`);

  // 2. EmuHawk, the ROM and the patch
  progress("check", "running", "Checking EmuHawk, the ROM and the patch…");
  if (!p.patch) fail("check", "Choose this game's patch file (.apred, .apblue…). Every generated game has a new one.");
  const check = await checkProfile(p);
  const bad = ["emuhawk", "patch", "rom"].map(k => check.problems[k]).filter(Boolean);
  if (bad.length) fail("check", bad.join(" "));
  const lua = path.join(base, "data", "lua", "connector_bizhawk_generic.lua");
  const clientExe = path.join(base, "ArchipelagoBizHawkClient.exe");
  if (!fs.existsSync(lua)) fail("check", "Your Archipelago install has no BizHawk connector script (data\\lua\\connector_bizhawk_generic.lua). Reinstall Archipelago.");
  if (!fs.existsSync(clientExe)) fail("check", "Your Archipelago install has no ArchipelagoBizHawkClient.exe. Reinstall Archipelago.");
  const slot = check.patch.playerName || "";
  progress("check", "done", `${check.rom.known || path.basename(p.rom)}, and the ${check.game} patch${slot ? ` for ${slot}` : ""}.`);

  // 3. patch, unless the patched game from this patch and this ROM is already there
  let output = check.patch.resultEnding ? p.patch.replace(/\.[^.\\/]+$/, "") + check.patch.resultEnding : null;
  const prev = output && (config.patched || {})[output];
  if (prev && fs.existsSync(output) && prev.patch === fileStamp(p.patch) && prev.rom === check.rom.md5 && prev.out === fileStamp(output)) {
    progress("patch", "done", `Already patched: ${path.basename(output)}.`);
  } else {
    progress("patch", "running", "Patching your ROM…");
    let m;
    try { m = await runPatchHelper(["--rom", p.rom, p.patch]); } catch (e) { fail("patch", e.message); }
    if (m.type !== "patched") fail("patch", patchHelperProblem(m));
    output = m.written;
    const keep = Object.entries(config.patched || {}).filter(([k]) => k !== output).slice(-19);
    config.patched = { ...Object.fromEntries(keep), [output]: { patch: fileStamp(p.patch), rom: check.rom.md5, out: fileStamp(output) } };
    saveConfig();
    progress("patch", "done", `Patched: ${path.basename(output)}, next to the patch file.`);
  }

  // 4. EmuHawk with the connector script and the patched game
  progress("emuhawk", "running", "Starting EmuHawk with the Archipelago connector…");
  let emu;
  try { emu = await startAndWatch(p.emuhawk, [`--lua=${lua}`, output], path.dirname(p.emuhawk)); }
  catch (e) { fail("emuhawk", `EmuHawk didn't start: ${e.message}. Try opening EmuHawk.exe yourself once. On a new PC, BizHawk may first need its prerequisites installer (in the BizHawk download).`); }
  started.push(emu);
  progress("emuhawk", "done", `EmuHawk is running ${path.basename(output)}.`);

  // 5. the BizHawk Client, connected to the address we checked. Not given the patch file: its stored
  //    server would replace --connect (worlds/_bizhawk/context.py), and that port goes stale when a room restarts.
  progress("client", "running", `Starting the BizHawk Client for ${server}…`);
  const args = ["--connect", server];
  if (opts.password) args.push("--password", String(opts.password));
  let cl;
  try { cl = await startAndWatch(clientExe, args, base); }
  catch (e) { fail("client", `The BizHawk Client didn't start: ${e.message}.`); }
  started.push(cl);
  progress("client", "done", "The BizHawk Client is running. It finds EmuHawk and connects to the room by itself.");

  // Remember the patch and the room for next time.
  const i = profileList().findIndex(q => q.id === p.id);
  if (i >= 0) { config.profiles[i] = { ...config.profiles[i], patch: p.patch, lastServer: String(opts.serverInput || server).trim() }; saveConfig(); }
  return { server, slot, game: check.game, output, emuhawkPid: emu.pid, clientPid: cl.pid };
}

/* ---------------- mini window ---------------- */
function createMini() {
  const b = config.miniBounds || { width: 320, height: 300 };
  mini = new BrowserWindow({
    ...b, minWidth: 240, minHeight: 150, frame: false, alwaysOnTop: true, skipTaskbar: false, title: "ArchipelagoVic mini", icon: path.join(__dirname, "renderer", "icon.png"),
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#0E1A20" : "#EDF1EF", fullscreenable: false, maximizable: false,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  mini.setAlwaysOnTop(true, "screen-saver");   // stays above borderless-fullscreen games
  mini.setVisibleOnAllWorkspaces(true);
  mini.loadFile(path.join(__dirname, "renderer", "mini.html"));
  const save = () => { if (mini && !mini.isDestroyed()) { config.miniBounds = mini.getBounds(); saveConfig(); } };
  mini.on("moved", save); mini.on("resized", save);
  mini.on("closed", () => { mini = null; send("mini:state", false); updateTrayMenu(); });
  send("mini:state", true); updateTrayMenu();
}

/* ---------------- tray ---------------- */
function showMain() {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show(); win.focus();
}
function quitApp() { quitting = true; app.quit(); }
function updateTrayMenu() {
  if (!tray) return;
  const connected = (miniData.rooms || []).filter(r => r.connected);
  const server = [...procs.values()].some(p => p.kind === "server");
  tray.setToolTip(["ArchipelagoVic", connected.length ? `In ${connected.length} room${connected.length === 1 ? "" : "s"}` : null, server ? "Server running" : null].filter(Boolean).join(" · "));
  if (!IS_WIN) tray.setContextMenu(trayMenu());
}
function trayMenu() {
  const miniOpen = !!(mini && !mini.isDestroyed());
  const server = [...procs.values()].some(p => p.kind === "server");
  return Menu.buildFromTemplate([
    { label: "Open ArchipelagoVic", click: showMain },
    { label: miniOpen ? "Close mini window" : "Mini window", click: () => { if (miniOpen) mini.close(); else createMini(); } },
    { type: "separator" },
    { label: server ? "Quit (stops the server)" : "Quit ArchipelagoVic", click: quitApp },
  ]);
}
function createTray() {
  if (tray) return;
  try {
    const img = nativeImage.createFromPath(path.join(__dirname, "renderer", IS_WIN ? "icon.ico" : "icon.png"));
    tray = new Tray(IS_WIN ? img : img.resize({ width: 22, height: 22 }));
    tray.on("click", showMain);
    tray.on("double-click", showMain);
    if (IS_WIN) tray.on("right-click", () => { updateTrayMenu(); tray.popUpContextMenu(trayMenu()); });   // built fresh so it shows what's running now
    updateTrayMenu();
  } catch { tray = null; }   // no notification area (some Linux desktops): closing then quits as before
}

/* ---------------- window ---------------- */
function createWindow() {
  const b = config.bounds || { width: 1320, height: 860 };
  win = new BrowserWindow({
    ...b, minWidth: 940, minHeight: 600,
    title: "ArchipelagoVic",
    icon: path.join(__dirname, "renderer", "icon.png"),
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#0E1A20" : "#EDF1EF",
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true, nodeIntegrationInSubFrames: true },
  });
  if (config.maximized) win.maximize();
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
  win.on("focus", () => win.flashFrame(false));
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => { if (!url.startsWith("file://")) { e.preventDefault(); if (/^https:\/\//.test(url)) shell.openExternal(url); } });
  win.on("close", (e) => {
    config.maximized = win.isMaximized();
    if (!config.maximized) config.bounds = win.getBounds();
    saveConfig();
    // Closing the window keeps ArchipelagoVic running in the tray (rooms stay connected, alerts keep coming).
    if (!quitting && tray && config.closeToTray !== false) {
      e.preventDefault();
      win.hide();
      if (!config.trayHintShown && IS_WIN) {
        config.trayHintShown = true; saveConfig();
        try { tray.displayBalloon({ iconType: "info", title: "ArchipelagoVic is still running", content: "Your rooms stay connected. Click this icon to open it again, or right-click it to quit." }); } catch {}
      }
      return;
    }
    const server = [...procs.values()].find(p => p.kind === "server");
    if (server && !win._confirmedClose) {
      if (!win.isVisible()) showMain();
      const choice = dialog.showMessageBoxSync(win, { type: "question", buttons: ["Stop server and quit", "Cancel"], defaultId: 1, cancelId: 1,
        title: "Server still running", message: "Your Archipelago server is still running.", detail: "Quitting ArchipelagoVic stops it and disconnects everyone. Progress is saved." });
      if (choice !== 0) { e.preventDefault(); quitting = false; return; }
      win._confirmedClose = true;
    }
    for (const [, p] of procs) { try { if (p.kind === "server") p.child.stdin.write("/exit\n"); } catch {} setTimeout(() => killTree(p.child), 1500); }
    if (mini && !mini.isDestroyed()) mini.close();
  });
}

app.setAppUserModelId("com.vic.archipelagovic");
const findUri = argv => (argv || []).find(a => /^archipelago:\/\//i.test(a)) || null;
if (!app.requestSingleInstanceLock()) { app.quit(); }
else {
  pendingUri = findUri(process.argv);
  app.on("second-instance", (_e, argv) => {
    const uri = findUri(argv);
    showMain();
    if (uri) send("uri:open", uri);
  });
  app.whenReady().then(() => {
    loadConfig();
    art = aplib.createArt({ dir: path.join(app.getPath("userData"), "game-art"), net, apBase: apPath, online: () => config.artOnline !== false, sgdbKey: () => config.sgdbKey || "" });
    protocol.handle("apvic-icon", async (req) => {
      try {
        const u = new URL(req.url);   // apvic-icon://icon/<game>, apvic-icon://cover/<game> or apvic-icon://theme/<theme id>
        if (u.hostname === "themefolder") {
          const f = themeFolderFile(decodeURIComponent(u.pathname.replace(/^\//, "")));
          return f ? net.fetch(pathToFileURL(f).toString()) : new Response(null, { status: 404 });
        }
        if (u.hostname === "theme") {
          const f = themeArtFile(decodeURIComponent(u.pathname.replace(/^\//, "")));
          return f ? net.fetch(pathToFileURL(f).toString()) : new Response(null, { status: 404 });
        }
        const game = decodeURIComponent(u.pathname.replace(/^\//, ""));
        const kind = u.hostname === "cover" ? "cover" : "icon";
        const file = game && await art.resolve(game, kind);
        if (!file) return new Response(null, { status: 404 });
        return net.fetch(pathToFileURL(file).toString());
      } catch { return new Response(null, { status: 404 }); }
    });
    registerIpc();
    createWindow();
    if (config.closeToTray !== false) createTray();
  });
}
app.on("before-quit", () => { quitting = true; });
app.on("will-quit", () => { for (const r of logicProcs.values()) { try { r.child.stdin.end("quit\n"); } catch {} killTree(r.child); } });
app.on("window-all-closed", () => app.quit());
