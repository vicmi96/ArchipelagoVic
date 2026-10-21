"use strict";
/* =========================================================
   ArchipelagoVic launcher views. Uses helpers from client.js
   ($, $$, h, store, toast, askConfirm, cycleTheme, gameIcon…).
   Each room in Play is its own client.html page in a tab (iframe); they report status with postMessage.
   Without the Electron bridge (opened as a plain web page) only
   the Play view is shown.
   ========================================================= */
const API = window.apvic || null;
const L = { info:null, view:"home", server:{id:null, port:null, multidata:null}, gen:{id:null}, players:[], templates:[] };


/* ---------- rooms (tabs in Play) ---------- */
const Rooms = { list: [], active: null, seq: 1 };
function roomById(id){ return Rooms.list.find(r => r.id === id); }
function addRoom(prefill){
  const id = Rooms.seq++;
  const qs = new URLSearchParams();
  if (prefill?.server) qs.set("server", prefill.server);
  if (prefill?.slot) qs.set("slot", prefill.slot);
  if (prefill?.room) qs.set("room", prefill.room);
  const frame = h("iframe", { class: "room-frame", title: "Room", src: "client.html" + (qs.toString() ? "?" + qs : "") });
  const room = { id, frame, status: { connected: false }, prefill };
  frame.addEventListener("load", () => { if (room.prefill) frame.contentWindow.postMessage({ apv: "join", ...room.prefill }, "*"); room.prefill = null; }, { once: true });
  $("#roomFrames").append(frame);
  Rooms.list.push(room);
  selectRoom(id);
  return room;
}
function selectRoom(id){
  Rooms.active = id;
  for (const r of Rooms.list) r.frame.classList.toggle("active", r.id === id);
  renderRoomTabs();
}
async function closeRoom(id){
  const r = roomById(id); if (!r) return;
  if (r.status.connected && !(await askConfirm("Leave this room?", `You'll disconnect ${r.status.name || ""} from ${r.status.server || "the server"}. Your game client stays connected.`, "Leave"))) return;
  r.frame.remove();
  Rooms.list = Rooms.list.filter(x => x !== r);
  if (!Rooms.list.length) addRoom();
  else if (Rooms.active === id) selectRoom(Rooms.list[Rooms.list.length - 1].id);
  saveRooms(); renderRoomTabs(); updateMini(); renderRail();
}
// Join a room: reuse the open tab if it isn't in a room yet, otherwise open a new tab.
function joinRoom(prefill){
  showView("play");
  const cur = roomById(Rooms.active);
  if (cur && !cur.status.connected){
    selectRoom(cur.id);
    cur.frame.contentWindow?.postMessage({ apv: "join", ...prefill }, "*");
    return cur;
  }
  return addRoom(prefill);
}
// Play a game profile: turn a room link into the room's current address, let the main process check, patch and
// start EmuHawk and the BizHawk Client, then open the room in a Play tab so the activity feed shows too.
// onProgress gets { step, state, text } with step server | check | patch | emuhawk | client | room
// and state running | done | failed.
async function playGame(profileId, { patch, server, password } = {}, onProgress = () => {}){
  const input = String(server || "").trim();
  const link = parseRoomUrl(input) ? input : null;
  let address = input;
  if (link){
    onProgress({ step: "server", state: "running", text: "Waking the room and finding its port…" });
    try { address = await roomAddress(link); }
    catch (e) { onProgress({ step: "server", state: "failed", text: e.message }); throw e; }
  }
  const off = API.onPlayProgress(onProgress);
  let r;
  try { r = await API.play({ id: profileId, patch, server: address, serverInput: input, password }); }
  finally { off(); }
  onProgress({ step: "room", state: "running", text: "Opening the room…" });
  // Playing again while the room's tab is still connected: switch to that tab instead of opening a second one.
  const open = Rooms.list.find(x => x.status.connected && x.status.server === r.server && x.status.name === r.slot);
  if (open){ showView("play"); selectRoom(open.id); }
  else joinRoom({ server: r.server, slot: r.slot, room: link, password, connect: !!r.slot });
  onProgress({ step: "room", state: "done", text: `Following ${r.slot || "your slot"} in a Play tab${open ? " (already open)" : ""}.` });
  return r;
}
function renderRoomTabs(){
  const box = $("#roomTabs"); if (!box) return;
  box.replaceChildren(...Rooms.list.map((r, i) => {
    const st = r.status;
    const label = st.name ? st.name : `Room ${i + 1}`;
    return h("div", { class: "room-tab" + (r.id === Rooms.active ? " active" : ""), role: "tab", "aria-selected": String(r.id === Rooms.active) },
      h("button", { type: "button", class: "room-pick", title: st.connected ? `${st.name} · ${st.game} on ${st.server}` : "Not connected", onclick: () => selectRoom(r.id) },
        h("span", { class: "status-dot" + (st.connected ? " on" : "") }),
        st.game ? gameIcon(st.game) : null,
        h("span", { class: "room-label" }, label),
        st.unread && r.id !== Rooms.active ? h("span", { class: "count alert" }, st.unread) : null,
        st.waiting ? h("span", { class: "room-wait", title: "Key items still out there" }, "★" + st.waiting) : null),
      h("button", { type: "button", class: "room-close", title: "Close this tab", "aria-label": `Close ${label}`, onclick: () => closeRoom(r.id) }, "✕"));
  }));
}
function saveRooms(){
  store.set("apvic.rooms", Rooms.list.map(r => r.status.server ? { server: r.status.server, slot: r.status.name, room: r.status.room || undefined } : null).filter(Boolean));
}
window.addEventListener("message", e => {
  const r = Rooms.list.find(x => x.frame.contentWindow === e.source);
  if (!r || !e.data || e.data.apv !== "status") return;
  const was = r.status.connected, wasRoom = r.status.room;
  r.status = e.data;
  if (was !== r.status.connected || wasRoom !== r.status.room) saveRooms();
  renderRoomTabs(); updateMini();
  if (L.view === "home") renderHome();
  $("#railPlay").textContent = connectedRooms().length ? `● ${connectedRooms().length > 1 ? connectedRooms().length : "on"}` : "";
});
function connectedRooms(){ return Rooms.list.filter(r => r.status.connected); }
function initRooms(){
  $("#roomAdd").addEventListener("click", () => addRoom());
  $("#miniToggle").addEventListener("click", () => attempt(() => API.toggleMini()));
  const saved = store.get("apvic.rooms", []);
  if (saved.length) for (const s2 of saved.slice(0, 6)) addRoom({ server: s2.server, slot: s2.slot, room: s2.room });
  else addRoom();
  selectRoom(Rooms.list[0].id);
}
function updateMini(){
  if (!API) return;
  const rooms = Rooms.list.filter(r => r.status.name).map(r => ({ name: r.status.name, game: r.status.game, connected: r.status.connected, waiting: r.status.waiting, checks: r.status.checks, goal: r.status.goal, recent: r.status.recent || [] }));
  API.miniUpdate({ rooms }).catch(() => {});
}

/* ---------- navigation ---------- */
function showView(v){
  L.view = v;
  for (const s of $$(".views > .view")) s.classList.toggle("hidden", s.dataset.view !== v);
  for (const b of $$(".rail-item")) { if (b.dataset.view === v) b.setAttribute("aria-current","page"); else b.removeAttribute("aria-current"); }
  if (!API) return;
  ({ home:renderHome, games:renderGames, host:refreshHost, generate:refreshPlayers, worlds:refreshWorlds, tools:renderTools, settings:loadSettings })[v]?.();
}

/* ---------- Quit ---------- */
// Closing the window only hides ArchipelagoVic in the tray; this really quits.
// It asks first only when something would be cut off: connected rooms, or a server you're hosting.
let quitAsking = false;
async function quitArchipelagoVic(){
  if (quitAsking) return;
  const rooms = connectedRooms().length, server = !!L.server.id;
  if (rooms || server){
    quitAsking = true;
    const text = [
      server ? "The server you're hosting stops and everyone is disconnected. Progress is saved." : null,
      rooms ? `You leave ${rooms === 1 ? "your room" : `your ${rooms} rooms`}. ${rooms === 1 ? "It opens" : "They open"} again the next time you start ArchipelagoVic.` : null,
      "EmuHawk and the BizHawk Client keep running.",
    ].filter(Boolean).join(" ");
    const ok = await askConfirm("Quit ArchipelagoVic?", text, server ? "Stop server and quit" : "Quit");
    quitAsking = false;
    if (!ok) return;
  }
  await attempt(() => API.quit(true));
}

/* ---------- small helpers ---------- */
async function attempt(fn, okMsg){
  try { const r = await fn(); if (okMsg) toast(typeof okMsg === "function" ? okMsg(r) : okMsg); return r; }
  catch (e) { toast(e.message || String(e)); return undefined; }
}
function fmtSize(n){ return n > 1048576 ? (n/1048576).toFixed(1)+" MB" : Math.max(1, Math.round(n/1024))+" KB"; }
function fmtWhen(ms){ const d = new Date(ms); return d.toLocaleDateString([], {month:"short", day:"numeric"}) + " " + d.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"}); }
function compByName(n){ return L.info?.components?.find(c => c.name === n); }
function emptyRow(title, text){ return h("div",{class:"empty",style:"padding:22px 18px;text-align:left"}, h("b",null,title), text); }

/* ---------- init ---------- */
async function initLauncher(){
  // global wiring
  $$(".rail-item").forEach(b => b.addEventListener("click", () => showView(b.dataset.view)));
  document.addEventListener("click", e => {
    const t = e.target.closest("[data-go],[data-action],[data-open],[data-launch],[data-ext]");
    if (!t) return;
    if (t.dataset.go){ e.preventDefault(); showView(t.dataset.go); }
    else if (t.dataset.open){ e.preventDefault(); attempt(() => API.open(t.dataset.open)); }
    else if (t.dataset.launch){ e.preventDefault(); launch(t.dataset.launch); }
    else if (t.hasAttribute("data-ext")){ e.preventDefault(); attempt(() => API.openExternal(t.getAttribute("href"))); }
    else if (t.dataset.action === "openPatch"){ openPatchFlow(); }
    else if (t.dataset.action === "choosePath"){ attempt(async () => { const i = await API.choosePath(); if (i) { L.info = i; afterInfo(); toast("Archipelago folder updated."); } }); }
  });
  API.onProcData(onProcData);
  API.onProcExit(onProcExit);
  wireHost(); wireGenerate(); wireWorlds(); wireTools(); wireGames(); wireSettings(); initRooms();
  $("#railQuit").addEventListener("click", quitArchipelagoVic);
  API.onQuitAsk(quitArchipelagoVic);   // Ctrl+Q, from anywhere in the window (also inside a room tab)
  API.onUri(u => handleUri(u));
  document.addEventListener("dragover", e => e.preventDefault());
  document.addEventListener("drop", e => {   // drop a patch file anywhere outside a drop zone
    if (e.target.closest(".dropzone")) return;
    e.preventDefault();
    const p = [...e.dataTransfer.files].map(f => API.pathForFile(f)).find(Boolean);
    if (!p) return;
    if (/\.apworld$/i.test(p)) installApworldFlow(p);
    else if (/\.ya?ml$/i.test(p)) attempt(() => API.addPlayers([p]), r => `Added ${r.join(", ")} to Players`).then(refreshPlayers);
    else openPatchFlow(p);
  });
  // keep track of programs already running (e.g. after a window reload)
  try { for (const p of await API.running()) { if (p.kind === "server") setServerRunning(p.id, true); if (p.kind === "generate") setGenRunning(p.id, true); } } catch {}
  await loadInfo();
  showView("home");
  try { const u = await API.pendingUri(); if (u) handleUri(u); } catch {}
  refreshSelf(false, true);   // ArchipelagoVic's own updates (also without Archipelago installed)
  if (L.info?.found) refreshUpdates(false);
  API.onMiniState(on => $("#miniToggle").classList.toggle("on", !!on));
}
async function loadInfo(){
  try { L.info = await API.info(); } catch (e) { L.info = {found:false}; }
  afterInfo();
}
function afterInfo(){
  const i = L.info;
  const found = !!i?.found;
  $("#installWarn").classList.toggle("hidden", found);
  $$("[data-needs-ap]").forEach(b => { b.disabled = !found; b.title = found ? "" : "Needs your Archipelago install"; });
  $("#homeInstall").textContent = found ? `Archipelago ${i.version || ""} · ${i.path}` : "Archipelago not found";
  $("#railFoot").textContent = found ? `Archipelago ${i.version || "?"}` : "Archipelago not found";
  $("#sInstall").textContent = found ? `Version ${i.version || "unknown"} at ${i.path}` : `Not found. Looked in: ${(i?.searched||[]).join(", ")}`;
  if (found){
    const d = i.defaults || {};
    $("#hPort").placeholder = d.port || "38281";
    $("#hHint").placeholder = d.hint_cost != null ? `${d.hint_cost} (host.yaml)` : "10";
    $("#hPoints").placeholder = d.location_check_points != null ? `${d.location_check_points} (host.yaml)` : "1";
  }
}
async function launch(name, args){
  if (!L.info?.found){ toast("Archipelago wasn't found. Choose its folder in Settings."); return; }
  await attempt(() => API.launch(name, args || []), `Starting ${name}…`);
}

/* ---------- Home ---------- */
function renderHome(){
  const ul = $("#homeRecent"); ul.replaceChildren();
  const rec = store.get("apwc.recent", []);
  if (!rec.length) ul.append(h("li",{class:"muted"},"Rooms you join show up here."));
  for (const r of rec.slice(0, 6)){
    ul.append(h("li",null, r.game ? gameIcon(r.game) : null, h("span",{class:"grow"}, h("b",null,r.slot), " on ", r.server, r.game ? h("span",{class:"muted"}," · "+r.game) : null),
      h("button",{class:"btn small", onclick:() => joinRoom({ server: r.server, slot: r.slot, room: r.room || null })}, "Join")));
  }
  const run = $("#homeRunning"); run.replaceChildren();
  for (const r of connectedRooms()) run.append(h("li",null, gameIcon(r.status.game), h("span",{class:"grow"}, "Playing as ", h("b",null,r.status.name), " on ", r.status.server), h("button",{class:"btn small", onclick:() => { showView("play"); selectRoom(r.id); }},"Open")));
  if (L.server.id) run.append(h("li",null, h("span",{class:"grow"}, "Server on port ", h("b",null, L.server.port || "38281")), h("button",{class:"btn small", onclick:() => showView("host")},"Open")));
  if (L.gen.id) run.append(h("li",null, h("span",{class:"grow"}, "Generating a multiworld…"), h("button",{class:"btn small", onclick:() => showView("generate")},"Open")));
  if (!run.children.length) run.append(h("li",{class:"muted"},"Nothing running."));
}

/* ---------- updates ---------- */
async function refreshUpdates(force){
  const box = $("#homeUpdates");
  if (!L.info?.found){ renderUpdates(); return; }
  if (force) box.replaceChildren(h("li",{class:"muted"},"Checking…"));
  try { L.updates = await API.checkUpdates(!!force); L.updatesError = null; } catch (e) { L.updatesError = "Couldn't check: " + e.message; }
  renderUpdates();
  if (L.view === "worlds") refreshWorlds();
}
// Home → Updates: ArchipelagoVic itself first, then Archipelago and your custom worlds.
function renderUpdates(){
  const box = $("#homeUpdates");
  const u = L.updates || { worlds: [] };
  const rows = [];
  const s = L.self;
  if (s?.newer) rows.push(h("li",null, h("img",{class:"gicon", src:"icon.png", alt:""}),
    h("span",{class:"grow"}, h("b",null, `ArchipelagoVic ${s.latest}`), s.kind === "git" ? ` · ${s.behind} new change${s.behind === 1 ? "" : "s"} on GitHub.` : ` is out (you have ${s.current}).`),
    (s.kind === "git" || s.asset) ? h("button",{class:"btn small primary", type:"button", onclick:() => openSelfUpdate(s)}, "Update…") : h("a",{class:"btn small", href:s.url || `https://github.com/${s.repo}/releases`, "data-ext":""}, "Get it")));
  if (L.updatesError) rows.push(h("li",{class:"muted"}, L.updatesError));
  if (u.archipelago?.newer) rows.push(h("li",null, gameIcon("Archipelago"), h("span",{class:"grow"}, h("b",null,`Archipelago ${u.archipelago.latest}`), ` is out (you have ${u.archipelago.current}).`),
    h("a",{class:"btn small", href:u.archipelago.url, "data-ext":""}, "Get it")));
  for (const w of u.worlds.filter(x => x.newer)) rows.push(h("li",null, gameIcon(w.game || w.module), h("span",{class:"grow"}, h("b",null, w.game || w.module), ` ${w.tag} is out.`),
    h("button",{class:"btn small primary", type:"button", onclick:() => updateWorld(w)}, "Update")));
  const checked = u.checked || s?.checked;
  const when = checked ? new Date(checked).toLocaleString([], {month:"short", day:"numeric", hour:"2-digit", minute:"2-digit"}) : null;
  if (u.errors?.length) rows.push(h("li",{class:"muted"}, u.errors[0]));
  else if (L.selfError) rows.push(h("li",{class:"muted"}, L.selfError));
  else if (!rows.length) rows.push(h("li",{class:"muted"}, when ? `Everything is up to date. Checked ${when}.` : "Not checked yet."));
  const ver = [s?.current || u.app ? `ArchipelagoVic ${s?.current || u.app}` : null, u.archipelago ? `Archipelago ${u.archipelago.current}` : L.info?.version ? `Archipelago ${L.info.version}` : null].filter(Boolean).join(" · ");
  if (ver) rows.push(h("li",{class:"muted small-note"}, ver));
  rows.push(h("li",null, h("button",{class:"linkish", type:"button", onclick:() => { refreshSelf(true); refreshUpdates(true); }}, "Check now")));
  box.replaceChildren(...rows);
}

/* ---------- ArchipelagoVic's own updates ---------- */
// startup: the check when the app opens (skipped when turned off in Settings; at most every 12 hours).
async function refreshSelf(force, startup){
  if (force) $("#sSelfState").textContent = "Checking for ArchipelagoVic updates…";
  try { L.self = await API.selfCheck(!!force, !!startup); L.selfError = null; }
  catch (e) { L.selfError = e.message; if (force && L.view === "settings") toast(e.message); }
  renderSelfSettings(); renderUpdates();
  if (startup && L.self?.newer && !L.self.skipped) toast(`ArchipelagoVic ${L.self.latest} is available. See Home → Updates.`);
}
const SELF_HOW = {
  installed: "This copy is installed; it updates from ArchipelagoVic's releases on GitHub.",
  portable: "This is the portable copy; it updates from ArchipelagoVic's releases on GitHub.",
  git: "This copy runs from a git checkout; it updates with git pull from GitHub.",
  source: "This copy runs from downloaded source files; get new versions from GitHub.",
};
function renderSelfSettings(){
  const st = $("#sSelfState"); if (!st) return;
  const u = L.self;
  if (L.selfError) st.textContent = L.selfError;
  else if (!u || u.skipped && !u.checked) st.textContent = `${u ? SELF_HOW[u.kind] + " " : ""}Not checked yet.`;
  else if (u.newer) st.textContent = `ArchipelagoVic ${u.latest} is available (you have ${u.current}). ${u.note || SELF_HOW[u.kind]}`;
  else st.textContent = `${u.note || `You have the newest ArchipelagoVic (${u.current}).`} ${u.note ? "" : SELF_HOW[u.kind]} Checked ${fmtWhen(u.checked)}.`.replace(/\s+/g, " ");
  $("#sSelfUpdate").classList.toggle("hidden", !(u?.newer && (u.kind === "git" || u.asset)));
  $("#sSelfAuto").checked = u?.auto !== false;
}
// The update sheet: what will happen, what's new, then progress until ArchipelagoVic restarts.
function openSelfUpdate(u){
  const d = $("#sheetDlg");
  if (d.open) return;
  const rooms = connectedRooms().length, server = !!L.server.id;
  const how = u.kind === "git"
    ? `Runs git pull to get ${u.behind} new change${u.behind === 1 ? "" : "s"} from GitHub, installs new npm packages if any, then restarts ArchipelagoVic.`
    : u.kind === "portable"
      ? `Downloads ${u.asset.name} (${fmtSize(u.asset.size)}) from GitHub next to this copy, checks it against GitHub's checksum and starts it. You can delete the old .exe afterwards.`
      : `Downloads ${u.asset.name} (${fmtSize(u.asset.size)}) from GitHub, checks it against GitHub's checksum, installs it over this copy and starts ArchipelagoVic again.`;
  const cut = [server ? "The server you're hosting stops. Progress is saved." : null, rooms ? `${rooms === 1 ? "Your room disconnects and opens" : `Your ${rooms} rooms disconnect and open`} again after the restart.` : null].filter(Boolean).join(" ");
  const status = h("p",{class:"small-note", "aria-live":"polite"});
  const bar = h("progress",{class:"self-bar hidden", max:"1", value:"0"});
  const go = h("button",{class:"btn primary", type:"button"}, "Update and restart");
  const cancel = h("button",{class:"btn", value:""}, "Cancel");
  const x = $("#sheetDlg .guide-head button");
  let busy = false;
  go.addEventListener("click", async () => {
    busy = true; go.disabled = cancel.disabled = x.disabled = true;
    status.className = "small-note"; status.textContent = "Starting…";
    const off = API.onSelfProgress(p => {
      if (p.stage === "download"){ bar.classList.remove("hidden"); if (p.total){ bar.max = p.total; bar.value = p.got; } status.textContent = `Downloading… ${fmtSize(p.got)}${p.total ? ` of ${fmtSize(p.total)}` : ""}`; }
      else status.textContent = { pull: "Getting the changes (git pull)…", npm: "Installing new packages (npm install)…",
        start: u.kind === "installed" ? "Checked. Installing; ArchipelagoVic closes now and opens again by itself in a moment." : "Checked. Starting the new version…",
        restart: "Restarting ArchipelagoVic…" }[p.stage] || status.textContent;
    });
    try { await API.selfInstall(); }
    catch (e) { status.className = "small-note problem"; status.textContent = e.message; go.textContent = "Try again"; busy = false; go.disabled = cancel.disabled = x.disabled = false; }
    finally { off(); }
  });
  $("#sheetTitle").textContent = "Update ArchipelagoVic";
  $("#sheetBody").replaceChildren(h("div",{class:"play-sheet"},
    h("div",{class:"sheet-head"}, h("img",{class:"gicon xl", src:"icon.png", alt:""}), h("div",null, h("b",null, `ArchipelagoVic ${u.latest}`), h("div",{class:"muted"}, `You have ${u.current}${u.published ? ` · released ${fmtWhen(Date.parse(u.published))}` : ""}`))),
    h("dl",{class:"kv"}, h("dt",null,"What happens"), h("dd",null, how), cut ? [h("dt",null,"Before you update"), h("dd",null, cut)] : null),
    u.notes ? h("details",{class:"more", open:true}, h("summary",null, u.kind === "git" ? "Changes" : "What's new"), h("pre",{class:"self-notes"}, u.notes)) : null,
    bar, status));
  $("#sheetActions").replaceChildren(cancel, go);
  d.onclose = null;
  d.oncancel = e => { if (busy) e.preventDefault(); };
  d.returnValue = "";
  d.showModal();
  go.focus();
}
async function updateWorld(w){
  if (!(await askConfirm(`Update ${w.game || w.module}?`, `Downloads ${w.assetName} (${w.tag}) from github.com/${w.repo} and replaces your installed copy. Restart any open Archipelago programs afterwards.`, "Update"))) return;
  const r = await attempt(() => API.updateWorld(w.module));
  if (r){ toast(`Updated ${r.game || r.module} to ${r.tag}.${r.warnings?.length ? " " + r.warnings[0] : ""}`); await loadInfo(); refreshUpdates(false); refreshWorlds(); }
}

/* ---------- console output ---------- */
function appendLog(el, text, cls){
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  const clean = String(text).replace(/\x1b\[[0-9;]*m/g, "");
  if (cls){ el.append(h("span",{class:cls}, clean)); }
  else {
    // colour obvious errors
    for (const line of clean.split(/(?<=\n)/)){
      if (/\b(error|exception|traceback)\b/i.test(line)) el.append(h("span",{class:"err"}, line));
      else el.append(document.createTextNode(line));
    }
  }
  while (el.childNodes.length > 4000) el.firstChild.remove();
  if (atBottom) el.scrollTop = el.scrollHeight;
}
function onProcData(d){
  if (d.kind === "server"){
    appendLog($("#hLog"), d.text);
    const m = d.text.match(/Hosting game at ([^\s]+?):(\d+)/);
    if (m) $("#hState").textContent = `Running · ${m[1]}:${m[2]}`;
  } else if (d.kind === "generate") appendLog($("#gLog"), d.text);
}
function onProcExit(d){
  if (d.kind === "server"){
    appendLog($("#hLog"), `\n[Server stopped${d.code ? `, exit code ${d.code}` : ""}]\n`, "note");
    setServerRunning(null, false);
  } else if (d.kind === "generate"){
    setGenRunning(null, false);
    const box = $("#gResult"); box.classList.remove("hidden", "bad"); box.replaceChildren();
    if (d.code === 0 && d.result){
      box.append(h("div",null, "Generated ", h("b",null,d.result.name), ` (${fmtSize(d.result.size)}).`),
        h("div",{class:"row-actions"},
          h("button",{class:"btn primary small", onclick:() => { L.server.multidata = d.result.path; showView("host"); }}, "Host this game"),
          h("button",{class:"btn small", onclick:() => attempt(() => API.open("output"))}, "Open output folder")));
      appendLog($("#gLog"), `\n[Done: ${d.result.name}]\n`, "note");
    } else {
      box.classList.add("bad");
      box.append(h("div",null, h("b",null,"Generation failed. "), "The output above says why. Most often a YAML has a typo or names a game that isn't installed."));
      appendLog($("#gLog"), `\n[Generator exited with code ${d.code}]\n`, "note");
    }
  }
  renderRail();
}
function renderRail(){
  $("#railHost").textContent = L.server.id ? "● live" : "";
  $("#railGen").textContent = L.gen.id ? "working" : ""; $("#railGen").classList.toggle("busy", !!L.gen.id);
  const n = connectedRooms().length;
  $("#railPlay").textContent = n ? `● ${n > 1 ? n : "on"}` : "";
  if (L.view === "home") renderHome();
}
setInterval(() => { if (API) renderRail(); }, 4000);

/* ---------- Host ---------- */
function wireHost(){
  $("#hBrowse").addEventListener("click", async () => { const p = await attempt(() => API.pickMultidata()); if (p){ L.server.multidata = p; refreshHost(); } });
  $("#hRefresh").addEventListener("click", refreshHost);
  $("#hostForm").addEventListener("submit", async e => {
    e.preventDefault();
    const multidata = $("#hMulti").value;
    const opts = {
      multidata, port: $("#hPort").value.trim(), password: $("#hPass").value, server_password: $("#hAdmin").value,
      hint_cost: $("#hHint").value.trim(), location_check_points: $("#hPoints").value.trim(),
      release_mode: $("#hRelease").value, collect_mode: $("#hCollect").value, remaining_mode: $("#hRemaining").value,
      auto_shutdown: $("#hShutdown").value.trim(), disable_item_cheat: $("#hNoCheat").checked,
    };
    for (const k of ["port","hint_cost","location_check_points","auto_shutdown"]) if (opts[k] && !/^\d+$/.test(opts[k])) { toast("Port, hint cost, points and auto-stop must be whole numbers."); return; }
    $("#hLog").replaceChildren();
    const id = await attempt(() => API.startServer(opts));
    if (id){ L.server.port = opts.port || L.info?.defaults?.port || "38281"; setServerRunning(id, true); $("#hState").textContent = "Starting…";
      store.set("apvic.hostPrefs", {port:opts.port, hint_cost:opts.hint_cost, release_mode:opts.release_mode, collect_mode:opts.collect_mode, remaining_mode:opts.remaining_mode, location_check_points:opts.location_check_points, auto_shutdown:opts.auto_shutdown, disable_item_cheat:opts.disable_item_cheat}); }
  });
  $("#hStop").addEventListener("click", async () => {
    if (!L.server.id) return;
    if (!(await askConfirm("Stop the server?", "Everyone gets disconnected. Progress is saved, and you can start it again later from the same file.", "Stop server"))) return;
    $("#hState").textContent = "Stopping…";
    attempt(() => API.stop(L.server.id));
  });
  $("#hJoin").addEventListener("click", () => joinRoom({ server: `localhost:${L.server.port || "38281"}` }));
  $("#hCmdForm").addEventListener("submit", e => { e.preventDefault(); sendServerCmd($("#hCmd").value); });
  $$("[data-scmd]").forEach(b => b.addEventListener("click", () => sendServerCmd(b.dataset.scmd)));
  const p = store.get("apvic.hostPrefs", null);
  if (p){ $("#hPort").value = p.port||""; $("#hHint").value = p.hint_cost||""; $("#hRelease").value = p.release_mode||""; $("#hCollect").value = p.collect_mode||""; $("#hRemaining").value = p.remaining_mode||""; $("#hPoints").value = p.location_check_points||""; $("#hShutdown").value = p.auto_shutdown||""; $("#hNoCheat").checked = !!p.disable_item_cheat; }
}
function sendServerCmd(text){
  text = (text||"").trim(); if (!text || !L.server.id) return;
  appendLog($("#hLog"), `> ${text}\n`, "note");
  attempt(() => API.write(L.server.id, text));
  $("#hCmd").value = "";
}
function setServerRunning(id, on){
  L.server.id = on ? id : null;
  $("#hStart").disabled = on; $("#hStop").disabled = !on; $("#hJoin").disabled = !on;
  $("#hCmd").disabled = !on; $("#hCmdSend").disabled = !on;
  $$("[data-scmd]").forEach(b => b.disabled = !on);
  for (const id2 of ["hMulti","hPort","hPass","hAdmin","hHint","hPoints","hRelease","hCollect","hRemaining","hShutdown","hNoCheat","hBrowse"]) $("#"+id2).disabled = on;
  if (!on) $("#hState").textContent = "Not running";
  renderRail();
}
async function refreshHost(){
  if (!L.info?.found) return;
  const list = (await attempt(() => API.listOutput())) || [];
  const sel = $("#hMulti"); const prev = L.server.multidata || sel.value;
  sel.replaceChildren();
  const all = [...list];
  if (prev && !all.some(x => x.path === prev)) all.unshift({name: prev.split(/[\\/]/).pop(), path: prev, mtime: Date.now(), size: 0});
  if (!all.length) sel.append(h("option",{value:""},"No generated games yet. Generate one or Browse…"));
  for (const x of all) sel.append(h("option",{value:x.path, selected: x.path===prev}, `${x.name}${x.size ? " · " + fmtWhen(x.mtime) : ""}`));
  L.server.multidata = sel.value || null;
}

/* ---------- Generate ---------- */
function wireGenerate(){
  $("#gAdd").addEventListener("click", () => attempt(() => API.addPlayers(), r => r?.length ? `Added ${r.join(", ")}` : null).then(refreshPlayers));
  $("#gReload").addEventListener("click", refreshPlayers);
  $("#gTemplates").addEventListener("click", async () => { await launch("Generate Template Options"); setTimeout(refreshPlayers, 6000); });
  $("#gTplSearch").addEventListener("input", renderTemplates);
  $("#gStart").addEventListener("click", async () => {
    if (!L.players.length){ toast("Add at least one player YAML first."); return; }
    $("#gLog").replaceChildren(); $("#gResult").classList.add("hidden");
    const opts = { seed: $("#gSeed").value.trim(), spoiler: $("#gSpoiler").value, race: $("#gRace").checked, skip_prog_balancing: $("#gNoBalance").checked };
    if (opts.seed && !/^\d+$/.test(opts.seed)) { toast("The seed has to be a whole number."); return; }
    const id = await attempt(() => API.startGenerate(opts));
    if (id) setGenRunning(id, true);
  });
  dropTarget($("#gDrop"), /\.ya?ml$/i, files => attempt(() => API.addPlayers(files), r => `Added ${r.join(", ")}`).then(refreshPlayers));
  API.onOnlineProgress(d => { const el = $("#gOnlineState"); el.classList.remove("hidden"); el.textContent = d.text; });
  $("#gOnline").addEventListener("click", hostOnline);
  const last = store.get("apvic.lastOnline", null);
  if (last) showOnlineResult(last, true);
}
async function hostOnline(){
  if (!L.players.length){ toast("Add at least one player YAML first."); return; }
  if (!(await askConfirm("Host on archipelago.gg?", `Your ${L.players.length} player YAML file${L.players.length === 1 ? "" : "s"} will be uploaded to archipelago.gg, generated there, and a room opened. Anyone with the room link can see the room page.`, "Upload and host"))) return;
  const btn = $("#gOnline"); btn.disabled = true; $("#gOnlineResult").classList.add("hidden");
  try {
    const r = await API.hostOnline();
    store.set("apvic.lastOnline", { ...r, at: Date.now() });
    showOnlineResult(r, false);
  } catch (e) {
    const box = $("#gOnlineResult"); box.classList.remove("hidden"); box.classList.add("bad");
    box.replaceChildren(h("b",null,"Couldn't host online. "), e.message);
    $("#gOnlineState").classList.add("hidden");
  } finally { btn.disabled = false; }
}
function showOnlineResult(r, previous){
  const box = $("#gOnlineResult"); box.classList.remove("hidden", "bad");
  box.replaceChildren(
    h("div",null, h("b",null, previous ? "Your last online room: " : "Room ready. "), h("a",{href:r.roomUrl, "data-ext":""}, r.roomUrl.replace(/^https:\/\//, ""))),
    r.server ? h("div",{class:"muted"}, "Server: ", h("b",{class:"mono"}, r.server)) : h("div",{class:"muted"}, "The room starts when someone opens its page."),
    h("div",{class:"row-actions"},
      h("button",{class:"btn primary small", type:"button", onclick:() => joinRoom({ server: r.server || r.roomUrl, room: r.roomUrl })}, "Join the room"),
      h("button",{class:"btn small", type:"button", onclick:() => attempt(() => API.copy(r.roomUrl), "Room link copied. Send it to your friends.")}, "Copy room link")));
  if (!previous) $("#gOnlineState").classList.add("hidden");
}
function setGenRunning(id, on){
  L.gen.id = on ? id : null;
  $("#gStart").disabled = on; $("#gState").textContent = on ? "Working…" : "Idle";
  renderRail();
}
async function refreshPlayers(){
  if (!L.info?.found) return;
  const r = await attempt(() => API.listPlayers());
  if (!r) return;
  L.players = r.players; L.templates = r.templates;
  const slots = L.players.reduce((n, p) => n + (p.slots||1), 0);
  $("#gCount").textContent = L.players.length ? `${slots} player${slots===1?"":"s"} from ${L.players.length} file${L.players.length===1?"":"s"}` : "No players yet";
  const box = $("#gPlayers"); box.replaceChildren();
  if (!L.players.length){ box.append(emptyRow("No player files", "Add the YAML each player sent you, or start from a template below.")); }
  else {
    const tb = h("tbody");
    for (const p of L.players){
      tb.append(h("tr",null,
        h("td",null, h("b",null, p.name || "—"), p.slots > 1 ? h("span",{class:"muted"}, ` +${p.slots-1} more`) : null),
        h("td",null, p.game && !/weighted/.test(p.game) ? withGame(p.game) : (p.game || h("span",{class:"muted"},"Unknown"))),
        h("td",{class:"muted"}, p.file),
        h("td",{class:"r"},
          h("button",{class:"btn ghost small", onclick:() => editPlayer(p.file)}, "Edit"),
          h("button",{class:"btn ghost small", onclick:async () => { if (await askConfirm("Remove this player?", `${p.file} moves to the Recycle Bin.`, "Remove")) attempt(() => API.removePlayer(p.file), "Moved to the Recycle Bin.").then(refreshPlayers); }}, "Remove"))));
    }
    box.append(h("table",{class:"grid"}, h("thead",null,h("tr",null,h("th",null,"Slot name"),h("th",null,"Game"),h("th",null,"File"),h("th",null,""))), tb));
  }
  renderTemplates();
}
function renderTemplates(){
  const box = $("#gTpl"); box.replaceChildren();
  if (!L.templates.length){ box.append(emptyRow("No templates yet", "Select Create templates to write a default YAML for every installed game. It takes a few seconds, then select Refresh.")); return; }
  const q = $("#gTplSearch").value.trim().toLowerCase();
  const list = L.templates.filter(t => !q || (t.game||t.file).toLowerCase().includes(q));
  const grid = h("div",{class:"tpl-grid"});
  for (const t of list){
    const g = t.game && !/weighted/.test(t.game) ? t.game : t.file.replace(/\.ya?ml$/i,"");
    grid.append(h("button",{type:"button", title:`Copy ${t.file} into Players`, onclick:() => useTemplate(t)}, gameIcon(g), h("span",null,g)));
  }
  box.append(list.length ? grid : emptyRow("No match", "Try another game name."));
}
async function useTemplate(t){
  const name = await askConfirm(`New ${t.game || "player"} YAML`, "This copies the template into your Players folder. Pick the slot name the player will connect with (16 characters max).", "Create", {label:"Slot name", value:""});
  if (name === null) return;
  const file = await attempt(() => API.useTemplate(t.file, name || null));
  if (file){ await refreshPlayers(); editPlayer(file); }
}
async function editPlayer(file){
  const text = await attempt(() => API.readFile("player", file));
  if (text == null) return;
  const saved = await openEditor(file, "Changes are saved to your Players folder. A backup of the old version is kept as .bak.", text, { form: true });
  if (saved != null) attempt(() => API.writeFile("player", file, saved), "Saved.").then(refreshPlayers);
}
// Edit a file in a dialog. With {form:true}, YAMLs open in the form view (falls back to text if the file isn't a normal player YAML).
function openEditor(title, note, text, opts = {}){
  return new Promise(resolve => {
    const d = $("#editorDlg"), ta = $("#editorText"), formBox = $("#editorForm"), seg = $("#editorMode");
    let current = text;
    $("#editorTitle").textContent = title; $("#editorNote").textContent = note; ta.value = text;
    const renderForm = () => YF.render(formBox, current, t => { const top = formBox.scrollTop; current = t; ta.value = t; renderForm(); formBox.scrollTop = top; });
    const setMode = m => {
      if (m === "form") { current = ta.value; renderForm(); }
      else ta.value = current;
      formBox.classList.toggle("hidden", m !== "form"); ta.classList.toggle("hidden", m === "form");
      for (const b of seg.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.m === m));
      d._mode = m;
    };
    seg.classList.toggle("hidden", !opts.form);
    seg.onclick = e => { const b = e.target.closest("button[data-m]"); if (b) setMode(b.dataset.m); };
    const usable = opts.form && !YF.parse(text).error;
    setMode(usable ? "form" : "text");
    d.returnValue = "";
    d.onclose = () => resolve(d.returnValue === "save" ? (d._mode === "form" ? current : ta.value) : null);
    d.showModal(); if (!usable) ta.focus();
  });
}
function dropTarget(el, re, onFiles){
  el.addEventListener("dragover", e => { if ([...e.dataTransfer.items].some(i => i.kind === "file")) { e.preventDefault(); el.classList.add("drag"); } });
  el.addEventListener("dragleave", e => { if (!el.contains(e.relatedTarget)) el.classList.remove("drag"); });
  el.addEventListener("drop", e => {
    e.preventDefault(); el.classList.remove("drag");
    const paths = [...e.dataTransfer.files].map(f => API.pathForFile(f)).filter(p => p && re.test(p));
    if (paths.length) onFiles(paths); else toast("Those files aren't the right type here.");
  });
}

/* ---------- Worlds ---------- */
function wireWorlds(){
  $("#wInstall").addEventListener("click", () => installApworldFlow());
  $("#wReload").addEventListener("click", refreshWorlds);
  $("#wBuildLoad").addEventListener("click", renderBuildList);
  dropTarget($("#wDrop"), /\.apworld$/i, async files => { for (const f of files) await installApworldFlow(f); });
}
async function refreshWorlds(){
  if (!L.info?.found) return;
  const list = await attempt(() => API.listWorlds());
  const box = $("#wList"); box.replaceChildren();
  if (!list) return;
  if (!list.length){ box.append(emptyRow("No custom worlds installed", "Games built into Archipelago don't need one.")); return; }
  const tb = h("tbody");
  for (const w of list){
    const name = w.game || w.file.replace(/\.apworld$/i,"");
    const up = (L.updates?.worlds || []).find(x => x.file === w.file) || {};
    const upCell = h("td",null,
      up.newer ? h("button",{class:"btn small primary", type:"button", onclick:() => updateWorld(up)}, `Update to ${up.tag}`) : up.repo ? h("span",{class:"muted"}, up.tag ? "Up to date" : (up.note || "—")) : null,
      h("button",{class:"linkish", type:"button", style:"margin-left:8px", title:"The GitHub project this world's releases come from", onclick:async () => {
        const repo = await askConfirm(`Updates for ${name}`, "Which GitHub project publishes this world? ArchipelagoVic checks its latest release for a newer .apworld. Leave it empty to stop checking.", "Save", {label:"GitHub project (owner/name)", value: up.repo || ""});
        if (repo === null) return;
        const u = await attempt(() => API.setWorldRepo(w.file.replace(/\.apworld$/i, ""), repo), "Saved.");
        if (u){ L.updates = u; refreshWorlds(); refreshUpdates(false); }
      }}, up.repo ? up.repo : "Set update source"));
    tb.append(h("tr",null, h("td",null, withGame(name, h("b",null,name))), h("td",{class:"muted"}, w.version ? "v" + w.version : "—"), upCell, h("td",{class:"muted"}, w.file), h("td",{class:"muted num"}, fmtSize(w.size)), h("td",{class:"muted"}, fmtWhen(w.mtime)),
      h("td",{class:"r"}, h("button",{class:"btn ghost small", onclick:async () => { if (await askConfirm("Remove this world?", `${w.file} moves to the Recycle Bin. Games that use it can't be generated or hosted until it's installed again.`, "Remove")) attempt(() => API.removeWorld(w.file), "Moved to the Recycle Bin.").then(() => { refreshWorlds(); loadInfo(); }); }}, "Remove"))));
  }
  box.append(h("table",{class:"grid", style:"margin-top:12px"}, h("thead",null,h("tr",null,h("th",null,"Game"),h("th",null,"Version"),h("th",null,"Updates"),h("th",null,"File"),h("th",null,"Size"),h("th",null,"Installed"),h("th",null,""))), tb));
}
async function installApworldFlow(file){
  const info = await attempt(() => API.inspectApworld(file || null));
  if (!info) return;
  const body = h("div",null,
    h("div",{class:"sheet-head"}, coverImg(info.game || info.module, "xl"), h("div",null, h("b",null, info.game || info.module), h("div",{class:"muted"}, info.file.split(/[\\/]/).pop()))),
    h("dl",{class:"kv"},
      h("dt",null,"World"), h("dd",null, info.module),
      h("dt",null,"Version"), h("dd",null, info.worldVersion || "Not stated"),
      info.minAp ? [h("dt",null,"Needs Archipelago"), h("dd",null, info.minAp + " or newer")] : null,
      info.authors ? [h("dt",null,"By"), h("dd",null, [].concat(info.authors).join(", "))] : null,
      info.existing ? [h("dt",null,"Replaces"), h("dd",null, "the installed copy" + (info.existing.version ? ` (v${info.existing.version})` : ""))] : null,
      info.components?.length ? [h("dt",null,"Adds"), h("dd",null, info.components.join(", "))] : null),
    info.warnings.length ? h("ul",{class:"warn-list"}, info.warnings.map(w => h("li",null,w))) : null);
  const choice = await sheet(info.existing ? "Update this world?" : "Install this world?", body, [{label:"Cancel", value:""}, {label: info.existing ? "Update" : "Install", value:"go", primary:true}]);
  if (choice !== "go") return;
  const r = await attempt(() => API.installApworld(info.file));
  if (r){ toast(`Installed ${r.game || r.module}. Restart any Archipelago program that's already open to use it.`); refreshWorlds(); loadInfo(); }
}
async function renderBuildList(){
  const box = $("#wBuild"); box.replaceChildren(h("span",{class:"muted"},"Looking for world folders…"));
  const list = await attempt(() => API.looseWorlds());
  box.replaceChildren();
  if (!list) return;
  if (!list.length){ box.append(emptyRow("No world folders found", "Put a world's folder (the one with __init__.py) in custom_worlds to build it.")); return; }
  const wrap = h("div",{class:"build-list"});
  for (const w of list.sort((a,b) => (a.where === "custom" ? 0 : 1) - (b.where === "custom" ? 0 : 1) || a.module.localeCompare(b.module))){
    wrap.append(h("div",{class:"row"}, gameIcon(w.game || w.module), h("span",{class:"grow"}, h("b",null, w.game || w.module), h("span",{class:"muted"}, `  ${w.module} · ${w.where === "custom" ? "custom_worlds" : "built-in"}`)),
      h("button",{class:"btn small", onclick:async () => {
        let game = w.game;
        if (!game){ game = await askConfirm(`Build ${w.module}`, "ArchipelagoVic couldn't read this world's game name from its files. Type it exactly as Archipelago shows it.", "Build", {label:"Game name", value:""}); if (!game) return; }
        const r = await attempt(() => API.buildApworld(w.path, game));
        if (r) toast(`Built ${r.file.split(/[\\/]/).pop()} (${r.count} files).`);
      }}, "Build")));
  }
  box.append(wrap);
}
async function openPatchFlow(file){
  if (!L.info?.found){ toast("Archipelago wasn't found. Choose its folder in Settings."); return; }
  const info = await attempt(() => API.inspectPatch(file || null));
  if (!info) return;
  const game = info.game || info.handler?.game;
  const body = h("div",null,
    h("div",{class:"sheet-head"}, coverImg(game || "Archipelago", "xl"), h("div",null, h("b",null, game || "Unknown game"), h("div",{class:"muted"}, info.file.split(/[\\/]/).pop()))),
    h("dl",{class:"kv"},
      h("dt",null,"Slot"), h("dd",null, info.playerName || "—"),
      h("dt",null,"Server"), h("dd",null, info.server || "Not included. You'll enter it in the client."),
      h("dt",null,"Opens with"), h("dd",null, info.handler ? info.handler.name : "No client in your install handles this file")),
    info.handler ? h("p",{class:"muted"}, "The client patches your game, starts it if it can, and connects to the server.") : null);
  const actions = [{label:"Close", value:""}];
  if (info.server && info.playerName) actions.push({label:"Also follow it here", value:"both"});
  if (info.handler) actions.push({label:`Open with ${info.handler.name}`, value:"open", primary:true});
  const choice = await sheet("Open patch file", body, actions);
  if (choice === "open" || choice === "both"){
    const name = await attempt(() => API.openPatch(info.file));
    if (name) toast(`Starting ${name}…`);
  }
  if (choice === "both") joinRoom({ server: info.server, slot: info.playerName, connect: true });
}
function sheet(title, body, actions){
  return new Promise(resolve => {
    const d = $("#sheetDlg");
    $("#sheetTitle").textContent = title;
    $("#sheetBody").replaceChildren(body);
    $("#sheetActions").replaceChildren(...actions.map(a => h("button",{class:"btn" + (a.primary ? " primary" : ""), value:a.value}, a.label)));
    d.returnValue = "";
    d.onclose = () => resolve(d.returnValue || "");
    d.showModal();
  });
}

/* ---------- archipelago:// room links ---------- */
async function handleUri(uri){
  let u; try { u = new URL(uri); } catch { toast("That room link couldn't be read."); return; }
  const slot = decodeURIComponent(u.username || ""), pass = decodeURIComponent(u.password || "");
  const host = u.hostname + (u.port ? ":" + u.port : "");
  const game = u.searchParams.get("game");
  const clients = (L.info?.components || []).filter(c => c.uri && c.game === game);
  const body = h("div",null,
    h("div",{class:"sheet-head"}, coverImg(game || "Archipelago", "xl"), h("div",null, h("b",null, slot || "Room link"), h("div",{class:"muted"}, game || ""))),
    h("dl",{class:"kv"}, h("dt",null,"Server"), h("dd",null, host), h("dt",null,"Slot"), h("dd",null, slot || "—"), h("dt",null,"Password"), h("dd",null, pass ? "Included" : "None")),
    clients.length ? h("p",{class:"muted"}, `You can also start ${clients.map(c => c.name).join(" or ")} connected to this room.`) : null);
  const actions = [{label:"Cancel", value:""}];
  for (const c of clients) actions.push({label:`Start ${c.name}`, value:"c:" + c.name});
  actions.push({label:"Join here", value:"join", primary:true});
  const choice = await sheet("Join this room?", body, actions);
  if (choice.startsWith("c:")) await launch(choice.slice(2), [uri]);
  if (choice === "join" || choice.startsWith("c:")){
    joinRoom({ server: host, slot, password: pass, connect: true });
  }
}

/* ---------- Clients & tools ---------- */
const TYPE_TITLES = {CLIENT:"Game clients", TOOL:"Tools", ADJUSTER:"Adjusters (change sprites, music and more on a patched ROM)", MISC:"Archipelago"};
function wireTools(){ $("#tSearch").addEventListener("input", renderTools); }
function toolRow(name, game, desc, extra, onStart){
  return h("div",{class:"tool-row"}, gameIcon(game || "Archipelago", "lg"),
    h("div",null, h("b",null,name), extra, desc ? h("p",null,desc) : null),
    h("button",{class:"btn small", onclick:onStart}, "Start"));
}
function renderTools(){
  const box = $("#tList"); box.replaceChildren();
  if (!L.info?.found){ box.append(emptyRow("Archipelago not found", "Choose its folder in Settings to start clients.")); return; }
  const q = $("#tSearch").value.trim().toLowerCase();
  const match = (...parts) => !q || parts.join(" ").toLowerCase().includes(q);
  const comps = L.info.components.filter(c => !c.native && match(c.name, c.desc, c.game, (c.suffixes||[]).join(" ")));
  for (const type of ["CLIENT","TOOL","ADJUSTER","MISC"]){
    const list = comps.filter(c => c.type === type).sort((a,b) => a.name.localeCompare(b.name));
    if (!list.length) continue;
    const g = h("section",{class:"tool-group"}, h("h3",null, TYPE_TITLES[type]));
    for (const c of list){
      const desc = (c.desc || (type === "CLIENT" && c.game ? `Connects ${c.game} to a multiworld.` : "")).split("\n")[0];
      const ft = c.suffixes?.length ? h("div",{class:"ft"}, "Opens " + c.suffixes.join(", ") + " files") : null;
      const note = c.exe ? null : h("span",{class:"tag-note", title:"This one is Python code inside Archipelago, so it runs in Archipelago's own runtime. The Launcher window doesn't open."}, "runs in Archipelago");
      g.append(toolRow(c.name, c.game, desc, [note, ft], () => launch(c.name)));
    }
    box.append(g);
  }
  const custom = (L.info.customComponents || []).filter(c => match(c.name, c.game, c.world));
  if (custom.length){
    const g = h("section",{class:"tool-group"}, h("h3",null, "From your custom worlds"));
    for (const c of custom) g.append(toolRow(c.name, c.game, `Added by ${c.world}.`, h("span",{class:"tag-note"}, "runs in Archipelago"), () => launch(c.name)));
    box.append(g);
  }
  if (!box.children.length) box.append(emptyRow("No match", "Try another name."));
}

/* ---------- Games (one-click Play for BizHawk games) ---------- */
const PLAY_STEPS = [
  ["server", "Find the room"], ["check", "Check EmuHawk, the ROM and the patch"], ["patch", "Patch the ROM"],
  ["emuhawk", "Start EmuHawk"], ["client", "Start the BizHawk Client"], ["room", "Open the room here"]];
const G = { list: [], checks: {} };
const fileName = f => f ? String(f).split(/[\\/]/).pop() : "";
function wireGames(){ $("#pAdd").addEventListener("click", () => editProfile(null)); }
async function renderGames(){
  const box = $("#pList");
  if (!L.info?.found){ box.replaceChildren(emptyRow("Archipelago not found", "Choose its folder in Settings to play games from here.")); return; }
  G.list = (await attempt(() => API.profiles())) || [];
  if (!G.list.length){ box.replaceChildren(emptyRow("No games yet", "Add a game once: where EmuHawk is and your original ROM. After that, Play patches, starts and connects everything.")); return; }
  box.replaceChildren(...G.list.map(profileCard));
  for (const p of G.list) API.profileCheck(p.id).then(c => { G.checks[p.id] = c; $(`[data-profile="${p.id}"]`)?.replaceWith(profileCard(p)); }).catch(() => {});
}
function profileCard(p){
  const c = G.checks[p.id];
  const n = c ? Object.keys(c.problems).length : 0;
  const blocked = !!(c && (c.problems.emuhawk || c.problems.rom));
  const state = !c ? h("p",{class:"state"}, h("span",{class:"spin"}), "Checking…")
    : n ? h("p",{class:"state bad"}, n === 1 ? "1 thing to fix" : `${n} things to fix`, blocked ? " before you can play." : ".")
    : h("p",{class:"state ok"}, p.patch ? "Ready to play." : "Ready. Choose this game's patch file when you press Play.");
  const row = (label, value, problem) => [h("dt",null,label), h("dd",null, value, problem ? h("div",{class:"problem"}, problem) : null)];
  const game = c?.game || p.game;   // detected from the patch or the ROM
  return h("article",{class:"profile-card", "data-profile": p.id},
    gameIcon(game || "Archipelago", "lg"),
    h("div",{class:"grow"},
      h("h2",null, game || "Game not known yet"), state,
      h("dl",{class:"kv"},
        row("EmuHawk", p.emuhawk || "Not set", c?.problems.emuhawk),
        row("ROM", c?.rom?.known || fileName(p.rom) || "Not set", c?.problems.rom),
        row("Patch", p.patch ? fileName(p.patch) + (c?.patch?.playerName ? ` · slot ${c.patch.playerName}` : "") : "Chosen when you play", c?.problems.patch),
        (p.lastServer || p.server) ? row("Room", p.lastServer || p.server, c?.problems.server) : null)),
    h("div",{class:"acts"},
      h("button",{class:"btn primary", type:"button", disabled: blocked, title: blocked ? "Fix the lines in red first (Edit)" : null, onclick:() => openPlay(p)}, "Play"),
      h("button",{class:"btn small", type:"button", onclick:() => editProfile(p)}, "Edit"),
      h("button",{class:"btn ghost small", type:"button", onclick:() => removeProfile(p)}, "Remove")));
}
// A file field with Browse…, or a plain text field, plus a line for its problem.
function profileField(key, label, placeholder, pick, value, onChange){
  const input = h("input",{class:"input" + (pick ? " mono" : ""), id:`pf-${key}`, value: value || "", placeholder, spellcheck:"false", autocomplete:"off", "aria-describedby":`pf-${key}-note`});
  const note = h("div",{class:"problem", id:`pf-${key}-note`, "aria-live":"polite"});
  input.addEventListener("change", onChange);
  input.addEventListener("keydown", e => { if (e.key === "Enter") e.preventDefault(); });   // Enter would close the dialog
  const browse = pick ? h("button",{class:"btn small", type:"button", onclick: async () => { const f = await attempt(() => API.profilePick(pick, input.value)); if (f){ input.value = f; onChange(); } }}, "Browse…") : null;
  return { input, note, el: h("div",{class:"field"}, h("label",{for:`pf-${key}`}, label), pick ? h("div",{class:"row-input", style:"margin-top:0"}, input, browse) : input, note) };
}
async function editProfile(p){
  const status = h("p",{class:"small-note muted", "aria-live":"polite"});
  let seq = 0;
  const f = {};
  const values = () => Object.fromEntries(Object.entries(f).map(([k, x]) => [k, x.input.value.trim()]));
  const check = async () => {
    const n = ++seq;
    status.className = "small-note muted"; status.replaceChildren(h("span",{class:"spin"}), " Checking…");
    let c; try { c = await API.profileCheck({ ...values(), id: p?.id }); } catch (e) { c = { problems: {}, error: e.message }; }
    if (n !== seq) return;
    for (const [k, x] of Object.entries(f)) { x.note.textContent = c.problems?.[k] || ""; x.input.setAttribute("aria-invalid", c.problems?.[k] ? "true" : "false"); }
    showGame(c);
    status.className = "small-note " + (c.error || !c.ok ? "problem" : "ok-note");
    status.textContent = c.error || (c.ok ? `Everything checks out${c.rom?.known ? `: ${c.rom.known}` : ""}.` : "Fix the lines in red, or save now and fix them later.");
  };
  f.emuhawk = profileField("emuhawk", "EmuHawk.exe (BizHawk)", "C:\\BizHawk\\EmuHawk.exe", "emuhawk", p?.emuhawk, check);
  f.rom = profileField("rom", "Original ROM (not patched)", "The unpatched game, for example Pokemon Red.gb", "rom", p?.rom, check);
  f.patch = profileField("patch", "Patch file (optional)", "You can also choose it each time you play", "patch", p?.patch, check);
  f.server = profileField("server", "Default room (optional)", "archipelago.gg room link, or address:port", null, p?.server, check);
  // The game isn't typed: it's read from the patch file, or from the ROM when ArchipelagoVic knows it.
  const gameOut = h("output",{class:"detected", id:"pf-game", "aria-live":"polite"});
  function showGame(c){
    if (c?.game) gameOut.replaceChildren(gameIcon(c.game), h("b",null, c.game), c.rom?.known ? h("span",{class:"muted"}, ` · ${c.rom.known}`) : null);
    else gameOut.replaceChildren(h("span",{class:"muted"}, "Found automatically from your ROM or patch file."));
  }
  showGame(p?.game ? { game: p.game } : null);
  const body = h("div",{class:"profile-form"},
    f.emuhawk.el,
    h("p",{class:"muted small-note", style:"margin:-4px 0 4px"}, "No BizHawk yet? Download it from ", h("a",{href:"https://tasvideos.org/BizHawk", "data-ext":true}, "tasvideos.org/BizHawk"), " and unpack it anywhere."),
    f.rom.el, f.patch.el, f.server.el,
    h("div",{class:"field"}, h("label",{for:"pf-game"}, "Game"), gameOut),
    status);
  const done = sheet(p ? `Edit ${p.game || "game"}` : "Add a game", body, [{label:"Cancel", value:""}, {label:"Save", value:"save", primary:true}]);
  if (p) check();
  if (await done !== "save") return;
  const r = await attempt(() => API.profileSave({ ...values(), id: p?.id }));
  if (!r) return;
  const n = Object.keys(r.check.problems).length;
  const host = r.hostChanges.length ? ` host.yaml now uses ${r.hostChanges.map(x => x.key === "emuhawk_path" ? "this EmuHawk" : "this ROM").join(" and ")} too.` : "";
  toast(r.hostError || (n ? `Saved. ${n === 1 ? "1 thing" : `${n} things`} to fix before you can play.` : `Saved.${host}`));
  G.checks[r.profile.id] = r.check;
  renderGames();
}
async function removeProfile(p){
  if (!(await askConfirm("Remove this game?", `${p.game || "This game"} is removed from BizHawk. Your ROM, patch files and host.yaml stay as they are.`, "Remove"))) return;
  await attempt(() => API.profileRemove(p.id));
  delete G.checks[p.id];
  renderGames();
}
// The Play sheet: room and patch for this session, then the progress of each step.
function openPlay(p){
  const d = $("#sheetDlg");
  if (d.open) return;
  const server = h("input",{class:"input", id:"pl-server", value: p.lastServer || p.server || "", placeholder:"archipelago.gg room link, or address:port", spellcheck:"false", autocomplete:"off"});
  const patch = h("input",{class:"input mono", id:"pl-patch", value: p.patch || "", placeholder:"This game's .apred / .apblue file", spellcheck:"false", autocomplete:"off"});
  const pass = h("input",{class:"input", id:"pl-pass", type:"password", placeholder:"None", autocomplete:"off"});
  const browse = h("button",{class:"btn small", type:"button", onclick: async () => { const f = await attempt(() => API.profilePick("patch", patch.value)); if (f) patch.value = f; }}, "Browse…");
  const steps = h("ol",{class:"play-steps", "aria-label":"Progress"}, PLAY_STEPS.map(([k, label]) =>
    h("li",{class:"pending", "data-step":k}, h("span",{class:"ic", "aria-hidden":"true"}), h("div",null, h("b",null,label), h("div",{class:"t", "aria-live":"polite"})))));
  const setStep = ({ step, state, text }) => {
    const li = steps.querySelector(`[data-step="${step}"]`); if (!li) return;
    li.className = state;
    li.querySelector(".ic").textContent = state === "done" ? "✓" : state === "failed" ? "✕" : "";
    li.querySelector(".t").textContent = text || "";
  };
  const msg = h("p",{class:"small-note", "aria-live":"assertive"});
  const playBtn = h("button",{class:"btn primary", type:"button"}, "Play");
  const closeBtn = h("button",{class:"btn", value:""}, "Cancel");
  const inputs = [server, patch, pass, browse, $("#sheetDlg .guide-head button")];   // the ✕ too: no closing halfway
  for (const i of [server, patch, pass]) i.addEventListener("keydown", e => { if (e.key === "Enter"){ e.preventDefault(); playBtn.click(); } });
  let running = false;
  playBtn.addEventListener("click", async () => {
    if (running) return;
    running = true; playBtn.disabled = closeBtn.disabled = true; inputs.forEach(i => i.disabled = true);
    msg.className = "small-note"; msg.textContent = "";
    for (const [k] of PLAY_STEPS) setStep({ step: k, state: "pending" });
    try {
      const r = await playGame(p.id, { patch: patch.value.trim() || null, server: server.value.trim(), password: pass.value || undefined }, setStep);
      msg.className = "small-note ok-note";
      msg.textContent = `You're in as ${r.slot || "your slot"}. In EmuHawk, start or continue your game: checks are only sent once you're in the game, not on the title screen. Keep EmuHawk and the BizHawk Client window open while you play, and tick EmuHawk's Config → Customize → "Run in background", or EmuHawk pauses (and the client drops) when you click another window. The activity feed is in the Play tab.`;
      playBtn.hidden = true; closeBtn.textContent = "Close";
      renderGames();
    } catch (e) {
      msg.className = "small-note problem";
      msg.textContent = steps.querySelector("li.failed") ? "Nothing was left running. Fix what the red step says, then try again." : e.message;
      playBtn.textContent = "Try again";
    } finally { running = false; playBtn.disabled = closeBtn.disabled = false; inputs.forEach(i => i.disabled = false); }
  });
  const game = G.checks[p.id]?.game || p.game;
  $("#sheetTitle").textContent = `Play ${game || ""}`.trim();
  $("#sheetBody").replaceChildren(h("div",{class:"play-sheet"},
    h("div",{class:"sheet-head"}, coverImg(game || "Archipelago", "xl"), h("div",null, h("b",null, game || "Game"), h("div",{class:"muted"}, "Patches your ROM, starts EmuHawk and the BizHawk Client, then joins the room."))),
    h("div",{class:"field"}, h("label",{for:"pl-server"}, "Room"), server),
    h("div",{class:"field"}, h("label",{for:"pl-patch"}, "Patch file"), h("div",{class:"row-input", style:"margin-top:0"}, patch, browse)),
    h("details",{class:"more"}, h("summary",null,"Room password"), h("div",{class:"field"}, h("label",{for:"pl-pass"}, "Password"), pass)),
    steps, msg));
  $("#sheetActions").replaceChildren(closeBtn, playBtn);
  d.onclose = null;
  d.oncancel = e => { if (running) e.preventDefault(); };
  d.returnValue = "";
  d.showModal();
  (server.value ? playBtn : server).focus();
}

/* ---------- Settings ---------- */
let hostOriginal = "";
function wireSettings(){
  $("#sHostSave").addEventListener("click", async () => {
    if (!(await askConfirm("Save host.yaml?", "Archipelago reads this file when its programs start. The current version is kept as host.yaml.bak.", "Save"))) return;
    const ok = await attempt(() => API.writeFile("host", null, $("#sHost").value), "host.yaml saved.");
    if (ok){ hostOriginal = $("#sHost").value; loadInfo(); }
  });
  $("#sHostRevert").addEventListener("click", () => { $("#sHost").value = hostOriginal; });
  $("#sAlerts").addEventListener("click", openAlerts);
  $("#sSelfCheck").addEventListener("click", () => refreshSelf(true));
  $("#sSelfUpdate").addEventListener("click", () => L.self && openSelfUpdate(L.self));
  $("#sSelfAuto").addEventListener("change", e => attempt(() => API.selfSetAuto(e.target.checked), on => { if (L.self) L.self.auto = on; return on ? "ArchipelagoVic will look for updates when it starts." : "ArchipelagoVic won't look for updates by itself. Use Check for updates."; }));
  $("#sSgdbSave").addEventListener("click", async () => {
    const k = $("#sSgdb").value.trim();
    const r = await attempt(() => API.setSgdbKey(k), on => on ? "SteamGridDB key saved. Missing icons will be looked up again." : "SteamGridDB key removed.");
    if (r !== undefined){ L.info.hasSgdbKey = r; $("#sSgdb").value = ""; $("#sSgdb").placeholder = r ? "Key saved (paste a new one to replace it)" : "SteamGridDB API key"; }
  });
  $("#sTray").addEventListener("change", e => attempt(() => API.setCloseToTray(e.target.checked), on => { L.info.closeToTray = on; return on ? "Closing the window now keeps ArchipelagoVic in the tray." : "Closing the window now quits ArchipelagoVic."; }));
  $("#sArt").addEventListener("change", e => attempt(() => API.setArtOnline(e.target.checked), on => on ? "Game pictures will download as needed." : "Game pictures won't be downloaded. Ones you already have stay."));
  $("#sLinks").addEventListener("change", async e => {
    const r = await attempt(() => API.handleLinks(e.target.checked), on => on ? "archipelago:// links now open in ArchipelagoVic." : "archipelago:// links go back to the official Launcher.");
    if (r === undefined) e.target.checked = !e.target.checked;
  });
}
async function loadSettings(){
  loadThemeFolder().then(renderThemeUI);   // picks up pictures added to the theme-pictures folder
  $("#sAbout").textContent = `ArchipelagoVic ${L.self?.current || ""}. Joining games works without Archipelago installed; everything else uses your install.`.replace("  ", " ");
  renderSelfSettings();
  $("#sArt").checked = L.info?.artOnline !== false;
  $("#sTray").checked = L.info?.closeToTray !== false;
  $("#sSgdb").placeholder = L.info?.hasSgdbKey ? "Key saved (paste a new one to replace it)" : "SteamGridDB API key";
  $("#sLinks").checked = !!L.info?.linksHandled;
  if (!L.info?.found){ $("#sHost").value = ""; $("#sHost").disabled = true; return; }
  $("#sHost").disabled = false;
  const t = await attempt(() => API.readFile("host"));
  if (t != null){ hostOriginal = t; $("#sHost").value = t; }
}

// Start (at the end so every const above is initialised first)
if (!API){
  // Opened as a plain web page: send people to the stand-alone client instead.
  location.replace("client.html");
} else {
  initLauncher();
}
