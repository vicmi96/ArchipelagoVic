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
  ({ home:renderHome, host:refreshHost, generate:refreshPlayers, worlds:refreshWorlds, tools:renderTools, settings:loadSettings })[v]?.();
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
  wireHost(); wireGenerate(); wireWorlds(); wireTools(); wireSettings(); initRooms();
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
  if (!L.info?.found) return;
  const box = $("#homeUpdates");
  if (force) box.replaceChildren(h("li",{class:"muted"},"Checking…"));
  let u; try { u = await API.checkUpdates(!!force); } catch (e) { box.replaceChildren(h("li",{class:"muted"}, "Couldn't check: " + e.message)); return; }
  L.updates = u;
  const rows = [];
  if (u.archipelago?.newer) rows.push(h("li",null, gameIcon("Archipelago"), h("span",{class:"grow"}, h("b",null,`Archipelago ${u.archipelago.latest}`), ` is out (you have ${u.archipelago.current}).`),
    h("a",{class:"btn small", href:u.archipelago.url, "data-ext":""}, "Get it")));
  for (const w of u.worlds.filter(x => x.newer)) rows.push(h("li",null, gameIcon(w.game || w.module), h("span",{class:"grow"}, h("b",null, w.game || w.module), ` ${w.tag} is out.`),
    h("button",{class:"btn small primary", type:"button", onclick:() => updateWorld(w)}, "Update")));
  const when = new Date(u.checked).toLocaleString([], {month:"short", day:"numeric", hour:"2-digit", minute:"2-digit"});
  if (u.errors?.length) rows.push(h("li",{class:"muted"}, u.errors[0]));
  else if (!rows.length) rows.push(h("li",{class:"muted"}, `Everything is up to date. Checked ${when}.`));
  const ver = [u.app ? `ArchipelagoVic ${u.app}` : null, u.archipelago ? `Archipelago ${u.archipelago.current}` : L.info?.version ? `Archipelago ${L.info.version}` : null].filter(Boolean).join(" · ");
  if (ver) rows.push(h("li",{class:"muted small-note"}, ver));
  rows.push(h("li",null, h("button",{class:"linkish", type:"button", onclick:() => refreshUpdates(true)}, "Check now")));
  box.replaceChildren(...rows);
  if (L.view === "worlds") refreshWorlds();
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
  $("#sTheme").addEventListener("click", cycleTheme);
}
async function loadSettings(){
  applyTheme();
  $("#sAbout").textContent = "ArchipelagoVic 2.0. Joining games works without Archipelago installed; everything else uses your install.";
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
