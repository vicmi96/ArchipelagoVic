"use strict";
/* =========================================================
   Archipelago web text client — single file, no dependencies.
   Speaks the AP network protocol directly over WebSocket.
   ========================================================= */

const CLIENT_VERSION = {major:0, minor:6, build:9, class:"Version"};
const HINT_STATUS = {0:"Unspecified",10:"Not needed",20:"Avoid",30:"Priority",40:"Found"};
const CLIENT_STATUS = {0:"Unknown",5:"Connected",10:"Ready",20:"Playing",30:"Goal reached"};
const MAX_FEED = 5000, MAX_RENDER = 600;

/* ---------- safe storage ---------- */
const store = {
  get(k, d){ try{ const v = localStorage.getItem(k); return v==null ? d : JSON.parse(v); }catch{ return d; } },
  set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); return true; }catch{ return false; } },
  del(k){ try{ localStorage.removeItem(k); }catch{} }
};

/* ---------- DOM helper ---------- */
function h(tag, props, ...kids){
  const el = document.createElement(tag);
  if (props) for (const [k,v] of Object.entries(props)){
    if (v==null || v===false) continue;
    if (k==="class") el.className = v;
    else if (k==="style") el.setAttribute("style", v);
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k==="text") el.textContent = v;
    else el.setAttribute(k, v===true ? "" : v);
  }
  for (const c of kids.flat(Infinity)){
    if (c==null || c===false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

/* ---------- state ---------- */
const S = {
  ws:null, url:"", server:"", slotName:"", password:"",
  manualClose:false, retry:0, retryTimer:null, everConnected:false,
  room:null, dp:{},          // game -> {items:Map, locs:Map, itemNames:[], locNames:[]}
  team:0, slot:0, players:new Map(), // slot -> {slot,name,alias,game,type,members}
  checked:new Set(), missing:new Set(), hintPoints:0,
  received:[], hints:[], feed:[], scouted:new Map(),
  status:new Map(), online:new Set(),
  pendingConnect:false, nextId:1, unread:0,
  itemCat:new Map(), locCat:new Map(), roomUrl:null
};
// Live data from the room's tracker on the Archipelago website (archipelago.gg rooms).
const Track = { base:null, roomId:null, tracker:null, totals:new Map(), players:new Map(), at:0, timer:null, error:null };
const UI = { tab:"activity", feedFilter:"all", feedPlayer:null, progOnly:false, feedQuery:"",
  recvMode:"grouped", recvProg:false, recvQuery:"", recvSort:{key:"last",dir:-1},
  chkMode:"missing", chkQuery:"", hintHideFound:true, hintQuery:"", recvCat:false, chkCat:false, recvFrom:"all" };

/* ---------- lookups ---------- */
function player(slot){ return S.players.get(slot); }
function gameOf(slot){ return slot===0 ? "Archipelago" : (player(slot)?.game || "Archipelago"); }
function pname(slot){ if (slot===0) return "Server"; const p = player(slot); return p ? (p.alias || p.name) : `Player ${slot}`; }
function lookup(kind, id, slot){
  const g = gameOf(slot);
  const pack = S.dp[g];
  const n = pack && pack[kind].get(id);
  if (n) return n;
  const ap = S.dp["Archipelago"]; const n2 = ap && ap[kind].get(id);
  if (n2) return n2;
  return `${kind==="items"?"Item":"Location"} #${id}`;
}
const itemName = (id, ownerSlot) => lookup("items", id, ownerSlot);
const locName  = (id, worldSlot) => lookup("locs", id, worldSlot);
function cls(flags){ flags|=0; if (flags & 4) return "trap"; if (flags & 1) return "prog"; if (flags & 2) return "useful"; return "filler"; }
const GLYPH = {prog:"★", useful:"▲", trap:"✖", filler:"●"};
const CLS_NAME = {prog:"Key item", useful:"Useful", trap:"Trap", filler:"Filler"};
const CLS_DESC = {
  prog:"Key item (progression): unlocks new areas or abilities. Someone needs it to move forward.",
  useful:"Useful: helps, but nobody is blocked without it.",
  trap:"Trap: a bad effect for whoever receives it.",
  filler:"Filler: currency, ammo, small upgrades. Nice to have."};
function hue(slot){ return Math.round((slot * 137.508 + 200) % 360); }

/* ---------- render atoms ---------- */
function chip(slot){
  if (slot===0) return h("span",{class:"chip server"},"Server");
  const me = slot===S.slot;
  return h("span",{class:"chip"+(me?" me":""), style:`--h:${hue(slot)}`, title:`${pname(slot)} — ${gameOf(slot)}`}, pname(slot));
}
function itemPill(id, owner, flags){
  const c = cls(flags);
  return h("span",{class:`item ${c}`, title:CLS_DESC[c]}, h("i",{class:"g","aria-hidden":"true"},GLYPH[c]), itemName(id, owner));
}
function arrow(){ return h("span",{class:"arrow","aria-label":"sent to"}, svgArrow()); }
function svgArrow(){
  const s = document.createElementNS("http://www.w3.org/2000/svg","svg");
  s.setAttribute("width","22"); s.setAttribute("height","10"); s.setAttribute("viewBox","0 0 22 10");
  s.innerHTML = '<path d="M1 5h18M15 1l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>';
  return s;
}
function fmtTime(t){ if (!t) return "earlier"; const d = new Date(t); return d.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}); }

/* generic JSONMessagePart renderer (for command results, joins, etc.) */
function renderParts(parts){
  const frag = document.createDocumentFragment();
  for (const p of parts || []){
    const t = p.type || "text";
    if (t==="player_id"){ frag.append(chip(+p.text)); }
    else if (t==="player_name"){ frag.append(h("b",null,p.text)); }
    else if (t==="item_id"){ frag.append(itemPill(+p.text, p.player, p.flags)); }
    else if (t==="item_name"){ const c=cls(p.flags); frag.append(h("span",{class:`item ${c}`},p.text)); }
    else if (t==="location_id"){ frag.append(h("span",{class:"loc"}, locName(+p.text, p.player))); }
    else if (t==="location_name" || t==="entrance_name"){ frag.append(h("span",{class:"loc"}, p.text)); }
    else if (t==="hint_status"){ frag.append(hintStatusPill(p.hint_status)); }
    else if (t==="color"){
      const c = p.color||""; const st = {red:"var(--bad)",green:"var(--ok)",yellow:"var(--warn)",blue:"var(--useful)",magenta:"var(--prog)",cyan:"var(--sea)"}[c.replace("_bg","")];
      frag.append(h("span",{style: c==="bold"?"font-weight:700": c==="underline"?"text-decoration:underline": st?`color:${st}`:null}, p.text));
    }
    else frag.append(document.createTextNode(p.text ?? ""));
  }
  return frag;
}
function hintStatusPill(s){
  const k = {40:"found",30:"prio",20:"avoid"}[s] || "";
  return h("span",{class:"status-pill "+k}, HINT_STATUS[s] ?? "Unspecified");
}

/* ---------- connection ---------- */
function buildUrls(addr){
  addr = addr.trim();
  if (/^wss?:\/\//i.test(addr)) return [addr];
  if (!/:\d+$/.test(addr)) addr += ":38281";
  const local = /^(localhost|127\.|0\.0\.0\.0|192\.168\.|10\.)/.test(addr);
  if (location.protocol === "https:") return ["wss://"+addr];
  return local ? ["ws://"+addr, "wss://"+addr] : ["wss://"+addr, "ws://"+addr];
}

function connect(){
  clearTimeout(S.retryTimer);
  const urls = buildUrls(S.server);
  setConn("wait");
  tryUrl(urls, 0);
}
function tryUrl(urls, i){
  if (i >= urls.length){ onFailed("Couldn't reach the server. Check the address and port, and that the room is still running."); return; }
  let opened = false;
  let ws;
  try { ws = new WebSocket(urls[i]); } catch(e){ tryUrl(urls, i+1); return; }
  S.ws = ws;
  ws.onopen = () => { opened = true; S.url = urls[i]; };
  ws.onmessage = ev => { let pk; try{ pk = JSON.parse(ev.data); }catch{ return; } for (const c of pk) handle(c); };
  ws.onerror = () => {};
  ws.onclose = () => {
    if (S.ws !== ws) return;
    if (!opened){ tryUrl(urls, i+1); return; }
    S.ws = null;
    if (S.manualClose) return;
    if (S.everConnected){ scheduleReconnect(); }
    else onFailed("The server closed the connection.");
  };
}
function send(...cmds){ if (S.ws && S.ws.readyState===1) S.ws.send(JSON.stringify(cmds)); }
function scheduleReconnect(){
  setConn("off");
  const delay = Math.min(30, 3 * 2**S.retry) * 1000; S.retry++;
  toast(`Connection lost. Reconnecting in ${delay/1000}s…`);
  S.retryTimer = setTimeout(connect, delay);
}
function onFailed(msg){
  setConn("off");
  if (!S.everConnected){ $("#connectError").textContent = msg; $("#connectBtn").disabled = false; $("#connectBtn").textContent = "Connect"; }
  else scheduleReconnect();
}
function setConn(state){
  const d = $("#connDot"); d.className = "status-dot " + state;
  d.title = {on:"Connected", wait:"Connecting…", off:"Disconnected"}[state];
}

/* ---------- packet handling ---------- */
function handle(c){
  switch(c.cmd){
    case "RoomInfo": onRoomInfo(c); break;
    case "DataPackage": onDataPackage(c); break;
    case "Connected": onConnected(c); break;
    case "ConnectionRefused": onRefused(c); break;
    case "ReceivedItems": onReceived(c); break;
    case "LocationInfo": onLocationInfo(c); break;
    case "RoomUpdate": onRoomUpdate(c); break;
    case "PrintJSON": onPrint(c); break;
    case "Retrieved": onRetrieved(c.keys || {}); break;
    case "SetReply": onRetrieved({[c.key]: c.value}); break;
    case "InvalidPacket": addFeed({kind:"sys", parts:[{text:`Server rejected a request: ${c.text||c.type}`}]}); break;
  }
}

function onRoomInfo(c){
  S.room = c;
  const games = new Set([...(c.games||[]), "Archipelago"]);
  const sums = c.datapackage_checksums || {};
  const need = [];
  for (const g of games){
    const cached = store.get("apwc.dp."+g, null);
    if (cached && sums[g] && cached.checksum === sums[g]) loadGame(g, cached);
    else need.push(g);
  }
  if (need.length){ S.pendingConnect = true; send({cmd:"GetDataPackage", games:need}); }
  else sendConnect();
}
function onDataPackage(c){
  for (const [g, data] of Object.entries(c.data?.games || {})){
    loadGame(g, data);
    store.set("apwc.dp."+g, {checksum:data.checksum, item_name_to_id:data.item_name_to_id, location_name_to_id:data.location_name_to_id});
  }
  if (S.pendingConnect){ S.pendingConnect = false; sendConnect(); }
  else rerenderAll();
}
function loadGame(g, data){
  const items = new Map(), locs = new Map();
  for (const [n,id] of Object.entries(data.item_name_to_id||{})) items.set(id, n);
  for (const [n,id] of Object.entries(data.location_name_to_id||{})) locs.set(id, n);
  S.dp[g] = {items, locs, itemNames:Object.keys(data.item_name_to_id||{}).sort(), locNames:Object.keys(data.location_name_to_id||{}).sort()};
}
function uuid(){
  let u = store.get("apwc.uuid", null);
  if (!u){ u = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2)).replace(/-/g,""); store.set("apwc.uuid", u); }
  return u;
}
function sendConnect(){
  send({cmd:"Connect", password:S.password, game:"", name:S.slotName, uuid:uuid(),
        version:CLIENT_VERSION, items_handling:0b111, tags:["AP","TextOnly"], slot_data:false});
}
function onRefused(c){
  const map = {InvalidSlot:"No player with that slot name is in this room.", InvalidPassword:"Wrong password, or the room needs one.",
               IncompatibleVersion:"This server's Archipelago version isn't compatible.", InvalidGame:"Slot name matched, but the game didn't.",
               InvalidItemsHandling:"The server refused the client settings."};
  const msg = (c.errors||[]).map(e=>map[e]||e).join(" ") || "The server refused the connection.";
  S.everConnected = false; S.manualClose = true; try{ S.ws?.close(); }catch{}
  showConnect(); $("#connectError").textContent = msg;
}
function onConnected(c){
  const firstTime = !S.everConnected;
  S.everConnected = true; S.retry = 0; S.manualClose = false;
  S.team = c.team; S.slot = c.slot;
  S.players.clear();
  const info = c.slot_info || {};
  for (const p of c.players || []){
    if (p.team !== c.team) continue;
    const si = info[p.slot] || info[String(p.slot)] || {};
    S.players.set(p.slot, {slot:p.slot, name:p.name, alias:p.alias, game:si.game || "", type:si.type ?? 1, members:si.group_members||[]});
  }
  for (const [k, si] of Object.entries(info)){ const s=+k; if (!S.players.has(s)) S.players.set(s,{slot:s,name:si.name,alias:si.name,game:si.game,type:si.type,members:si.group_members||[]}); }
  S.checked = new Set(c.checked_locations || []);
  S.missing = new Set(c.missing_locations || []);
  S.hintPoints = c.hint_points ?? 0;
  S.online.add(S.slot);
  const hk = `_read_hints_${S.team}_${S.slot}`;
  const sk = [...S.players.keys()].map(s => `_read_client_status_${S.team}_${s}`);
  const myGame = gameOf(S.slot);
  send({cmd:"Get", keys:[hk, ...sk, `_read_item_name_groups_${myGame}`, `_read_location_name_groups_${myGame}`]}, {cmd:"SetNotify", keys:[hk, ...sk]});
  if (firstTime && !S.feed.length) loadHistory();
  // remember room
  const rec = store.get("apwc.recent", []).filter(r => !(r.server===S.server && r.slot===S.slotName));
  rec.unshift({server:S.server, slot:S.slotName, game:gameOf(S.slot), room:S.roomUrl || undefined, t:Date.now()});
  store.set("apwc.recent", rec.slice(0,6));
  store.set("apwc.last", {server:S.server, slot:S.slotName, room:S.roomUrl || undefined});
  setConn("on");
  if (firstTime) showApp(); else toast("Reconnected.");
  if (store.get("apwc.scout."+roomKey(), false)) scout();
  startTracker();
  startLogic();
  rerenderAll();
}
function roomKey(){ return (S.room?.seed_name||"") + ":" + S.slot; }

function onReceived(c){
  if (c.index === 0) S.received = [];
  const now = S.received.length === 0 && c.index === 0 ? 0 : Date.now();
  let i = c.index;
  for (const it of c.items || []){
    if (S.received.some(r => r.index === i)) { i++; continue; }
    S.received.push({index:i++, item:it.item, location:it.location, from:it.player, flags:it.flags, t:now});
  }
  if (now && UI.tab !== "received"){ S.unread += (c.items||[]).length; }
  renderHeader(); if (UI.tab==="received") renderReceived();
}
function onLocationInfo(c){
  for (const it of c.locations || []) S.scouted.set(it.location, it);
  if (UI.tab==="checks") renderChecks();
}
function onRoomUpdate(c){
  if ("hint_points" in c) S.hintPoints = c.hint_points;
  if (c.hint_cost != null && S.room) S.room.hint_cost = c.hint_cost;
  if (c.permissions && S.room) S.room.permissions = c.permissions;
  if (c.checked_locations) for (const l of c.checked_locations){ S.checked.add(l); S.missing.delete(l); }
  if (c.players) for (const p of c.players){ const e = S.players.get(p.slot); if (e && p.team===S.team) e.alias = p.alias; }
  renderHeader();
  if (UI.tab==="checks") renderChecks();
  if (c.players) { renderRoster(); rerenderAll(); }
}
function onRetrieved(keys){
  for (const [k, v] of Object.entries(keys)){
    if (k.startsWith("_read_hints_")){ S.hints = (v||[]); renderHeader(); if (UI.tab==="hints") renderHints(); }
    else if (k.startsWith("_read_client_status_")){ const slot = +k.split("_").pop(); S.status.set(slot, v||0); updateCmdbar(); }
    else if (k.startsWith("_read_item_name_groups_")){ S.itemCat = groupIndex(v, S.dp[gameOf(S.slot)]?.itemNames); syncCatToggles(); if (UI.tab==="received") renderReceived(); }
    else if (k.startsWith("_read_location_name_groups_")){ S.locCat = groupIndex(v, S.dp[gameOf(S.slot)]?.locNames); syncCatToggles(); if (UI.tab==="checks") renderChecks(); }
  }
  renderRoster(); if (UI.tab==="players") renderPlayers();
}

function onPrint(c){
  const t = c.type;
  if (t==="ItemSend" || t==="ItemCheat"){
    const it = c.item || {};
    addFeed({kind:"item", cheat:t==="ItemCheat", from:it.player, to:c.receiving, item:it.item, loc:it.location, flags:it.flags});
    if (c.receiving===S.slot && it.player!==S.slot){
      const p = alertPrefs(), key = (it.flags & 1) && !(it.flags & 4);
      if ((key && p.keyItem) || p.anyItem)
        alertUser(it.flags & 4 ? "trap" : key ? "key" : "item", `${itemName(it.item, S.slot)} from ${pname(it.player)}`, `${CLS_NAME[cls(it.flags)]} · found at ${locName(it.location, it.player)}`);
    }
  } else if (t==="Hint"){
    const it = c.item || {};
    addFeed({kind:"hint", from:it.player, to:c.receiving, item:it.item, loc:it.location, flags:it.flags, found:!!c.found, parts:c.data});
    if (c.receiving===S.slot && !c.found && alertPrefs().hint)
      alertUser("item", `Hint: your ${itemName(it.item, S.slot)}`, `At ${locName(it.location, it.player)} in ${pname(it.player)}'s world`);
  } else if (t==="Chat"){
    const msg = c.message ?? textOf(c.data);
    addFeed({kind:"chat", slot:c.slot, msg});
    if (c.slot!==S.slot && alertPrefs().mention && mentionsMe(msg)) alertUser("item", `${pname(c.slot)} mentioned you`, msg);
  } else if (t==="ServerChat"){
    addFeed({kind:"chat", slot:0, msg:c.message ?? textOf(c.data)});
  } else {
    if (t==="Join" && c.team===S.team) { S.online.add(c.slot); renderRoster(); }
    if (t==="Part" && c.team===S.team && c.slot!==S.slot) { S.online.delete(c.slot); renderRoster(); }
    if (t==="Goal" && c.team===S.team && c.slot===S.slot && !store.get("apwc.recapShown."+roomKey(), false)){ store.set("apwc.recapShown."+roomKey(), true); setTimeout(() => openRecap(true), 800); }
    if (t==="Goal" && c.team===S.team){ S.status.set(c.slot, 30); if (c.slot!==S.slot && alertPrefs().goal) alertUser("item", `${pname(c.slot)} reached their goal`, gameOf(c.slot)); updateCmdbar(); }
    if (t==="Join" || t==="Part" || t==="Goal") refreshStatuses();
    const quiet = t==="TagsChanged";
    let parts = c.data;
    if ((t==="Join" || t==="Part") && c.slot!=null){
      const tags = c.tags || [];
      const how = tags.includes("TextOnly") ? " with a text client" : tags.includes("Tracker") ? " with a tracker" : tags.includes("HintGame") ? " with a hint game" : "";
      parts = [{type:"player_id", text:String(c.slot)}, {text: t==="Join" ? ` connected${how}` : " disconnected"}];
    } else if (t==="Goal" && c.slot!=null){
      parts = [{type:"player_id", text:String(c.slot)}, {type:"color", color:"bold", text:" reached their goal"}];
    }
    // ArchipelagoVic's own logic helper connects as you with the "Tracker" tag; that isn't news.
    const ownHelper = (t==="Join" || t==="Part") && c.slot===S.slot && (c.tags||[]).includes("Tracker") && Logic.key;
    if (!ownHelper) addFeed({kind:"sys", sub:t||"", slot:c.slot, parts, quiet});
  }
  if (UI.tab==="players") renderPlayers();
}
let statusTimer;
function refreshStatuses(){
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => send({cmd:"Get", keys:[...S.players.keys()].map(s => `_read_client_status_${S.team}_${s}`)}), 400);
}
function textOf(parts){ return (parts||[]).map(p=>p.text||"").join(""); }

/* ---------- feed ---------- */
function involvesMe(e){ return e.kind!=="divider" && (e.from===S.slot || e.to===S.slot || e.slot===S.slot); }
function matchesFeed(e){
  const f = UI.feedFilter;
  if (e.kind==="divider") return f==="all" && !UI.progOnly && UI.feedPlayer==null && !UI.feedQuery;
  if (f==="mine" && !involvesMe(e) && !(e.kind==="sys" && e.sub==="CommandResult")) return false;
  if (f==="items" && e.kind!=="item") return false;
  if (f==="hints" && e.kind!=="hint") return false;
  if (f==="chat" && e.kind!=="chat") return false;
  if (e.quiet && f!=="all") return false;
  if (UI.progOnly && (e.kind!=="item" && e.kind!=="hint" || !(e.flags & 1))) return false;
  if (UI.feedPlayer!=null && !(e.from===UI.feedPlayer || e.to===UI.feedPlayer || e.slot===UI.feedPlayer)) return false;
  if (UI.feedQuery){ if (!feedText(e).toLowerCase().includes(UI.feedQuery)) return false; }
  return true;
}
function feedText(e){
  if (e._txt) return e._txt;
  let s = "";
  if (e.kind==="item" || e.kind==="hint") s = [pname(e.from), pname(e.to), itemName(e.item, e.to), locName(e.loc, e.from)].join(" ");
  else if (e.kind==="chat") s = pname(e.slot) + " " + e.msg;
  else s = (e.parts||[]).map(p => p.type==="player_id" ? pname(+p.text) : p.type==="item_id" ? itemName(+p.text,p.player) : p.type==="location_id" ? locName(+p.text,p.player) : (p.text||"")).join("");
  return (e._txt = s);
}
function addFeed(e){
  e.id = S.nextId++; e.t = Date.now();
  S.feed.push(e);
  if (S.feed.length > MAX_FEED) S.feed.splice(0, S.feed.length - MAX_FEED);
  saveHistory();
  if (UI.tab !== "activity" && involvesMe(e) && (e.kind==="item"||e.kind==="hint"||e.kind==="chat")){ S.unread++; renderHeader(); }
  if (UI.tab==="activity" && matchesFeed(e)){
    const sc = $("#feedScroll"); const atBottom = sc.scrollHeight - sc.scrollTop - sc.clientHeight < 60;
    const ol = $("#feed"); ol.append(evNode(e));
    while (ol.children.length > MAX_RENDER) ol.firstChild.remove();
    $("#feedEmpty").classList.add("hidden");
    if (atBottom) sc.scrollTop = sc.scrollHeight; else $("#jumpBtn").classList.remove("hidden");
  }
}
function evNode(e){
  if (e.kind==="divider") return h("li",{class:"ev ev-divider"}, e.text);
  const mine = involvesMe(e) && e.kind!=="sys";
  const li = h("li",{class:`ev ev-${e.kind}${mine?" mine":""}`}, h("time",null,fmtTime(e.t)));
  const body = h("div",{class:"body"});
  if (e.kind==="item"){
    if (e.from===e.to){
      body.append(h("div",{class:"route"}, chip(e.from), h("span",{class:"muted"}, e.from===S.slot ? "found your own" : "found their own"), itemPill(e.item, e.to, e.flags)));
    } else {
      body.append(h("div",{class:"route"}, chip(e.from), arrow(), chip(e.to), itemPill(e.item, e.to, e.flags)));
    }
    body.append(h("div",{class:"sub"}, e.cheat ? "Granted by command" : ["at ", h("span",{class:"loc"}, locName(e.loc, e.from)), e.from===S.slot ? " in your world" : ` in ${pname(e.from)}'s world`]));
  } else if (e.kind==="hint"){
    body.append(h("div",{class:"route"}, h("span",{class:"tag"},"Hint"), itemPill(e.item, e.to, e.flags), h("span",{class:"muted"},"for"), chip(e.to),
      e.found ? h("span",{class:"status-pill found"},"Found") : null));
    body.append(h("div",{class:"sub"}, "is at ", h("span",{class:"loc"}, locName(e.loc, e.from)), e.from===S.slot ? " in your world" : [" in ", chip(e.from), "'s world"]));
  } else if (e.kind==="chat"){
    body.append(chip(e.slot), ": ", h("span",{class:"msg"}, e.msg));
  } else {
    body.append(renderParts(e.parts));
  }
  li.append(body);
  return li;
}
function renderFeed(){
  const ol = $("#feed"); ol.replaceChildren();
  const list = S.feed.filter(matchesFeed).slice(-MAX_RENDER);
  for (const e of list) ol.append(evNode(e));
  $("#feedEmpty").classList.toggle("hidden", list.length>0);
  const sc = $("#feedScroll"); sc.scrollTop = sc.scrollHeight; $("#jumpBtn").classList.add("hidden");
}
function renderRoster(){
  const ul = $("#roster"); ul.replaceChildren();
  const all = h("li",null,h("button",{"aria-pressed":String(UI.feedPlayer==null), onclick:()=>{UI.feedPlayer=null;renderRoster();renderFeed();}}, h("span",{style:"font-weight:600"},"Everyone")));
  ul.append(all);
  for (const p of sortedPlayers()){
    const on = S.online.has(p.slot);
    ul.append(h("li",null,h("button",{"aria-pressed":String(UI.feedPlayer===p.slot), onclick:()=>{UI.feedPlayer = UI.feedPlayer===p.slot?null:p.slot; renderRoster(); renderFeed();}},
      chip(p.slot), h("span",{class:"g2"}, gameIcon(p.game), h("span",null, p.game + (S.status.get(p.slot)===30?" · goal":"") + (on?" · online":""))))));
  // (the roster's own click filters by player; right-click a roster icon for "About this game")
  }
}
function sortedPlayers(){ return [...S.players.values()].filter(p=>p.type!==2).sort((a,b)=> (b.slot===S.slot)-(a.slot===S.slot) || a.slot-b.slot); }

/* ---------- header ---------- */
function hintCost(){
  const hc = S.room?.hint_cost || 0; if (!hc) return 0;
  const total = S.checked.size + S.missing.size;
  return Math.max(1, Math.floor(hc * 0.01 * total));
}
function renderHeader(){
  if (!S.slot) return;
  $("#meName").textContent = pname(S.slot);
  if ($("#meGame").textContent !== gameOf(S.slot)) $("#meIcon").replaceChildren(gameIcon(gameOf(S.slot), "lg") || "");
  $("#meGame").textContent = gameOf(S.slot);
  $("#meGame").dataset.gameInfo = gameOf(S.slot);
  const total = S.checked.size + S.missing.size, done = S.checked.size;
  $("#statChecks").textContent = `${done} / ${total}`;
  $("#statMeter").style.width = total ? (100*done/total)+"%" : "0";
  $("#statReceived").textContent = S.received.length;
  const fromOthers = S.received.filter(r => srcKind(r.from)==="other").length;
  $("#statReceivedLbl").textContent = S.received.length ? `Items received · ${fromOthers} from others` : "Items received";
  const cost = hintCost();
  $("#statHints").textContent = cost ? `${S.hintPoints} pts` : S.hintPoints;
  $("#statHintsLbl").textContent = cost ? `${Math.floor(S.hintPoints/cost)} hint${Math.floor(S.hintPoints/cost)===1?"":"s"} available (cost ${cost})` : "Hint points";
  $("#statRoom").textContent = S.server;
  $("#cntReceived").textContent = S.received.length;
  $("#cntChecks").textContent = S.missing.size;
  const openForMe = S.hints.filter(x=>!x.found).length;
  $("#cntHints").textContent = openForMe;
  $("#cntPlayers").textContent = sortedPlayers().length;
  const ca = $("#cntActivity");
  ca.textContent = S.unread; ca.classList.toggle("hidden", !S.unread || UI.tab==="activity"); ca.classList.add("alert");
  document.title = (S.unread ? `(${S.unread}) ` : "") + `${pname(S.slot)} · Archipelago Client`;
  $("#hintCostLbl").textContent = cost ? `You have ${S.hintPoints} points. A hint costs ${cost}.` : "";
  const waiting = waitingKeyItems();
  $("#statWaiting").textContent = waiting.length;
  $("#waitingStat").classList.toggle("has", waiting.length>0);
  $("#waitingStat").title = waiting.length ? "Hinted key items you haven't received yet:\n" + waiting.slice(0,12).map(x=>`• ${itemName(x.item,S.slot)} — ${locName(x.location,x.finding_player)} (${pname(x.finding_player)})`).join("\n") + (waiting.length>12?`\n…and ${waiting.length-12} more`:"") + "\nClick to open Hints." : "No hinted key items are waiting for you. Use !hint to find where one is.";
  updateCmdbar();
  postStatus();
}

/* ---------- Received ---------- */
/* Where a received item came from: another player, your own world, or the server (starting items, !getitem). */
function srcKind(from){ return from===S.slot ? "self" : from===0 ? "server" : "other"; }
function srcLabel(from){ const k = srcKind(from); return k==="self" ? "Found in your world" : k==="server" ? "Starting item" : pname(from); }
function srcNode(from){
  const k = srcKind(from);
  if (k==="self") return h("span",{class:"src-self", title:"One of your own items, found at a location in your own game. Archipelago still counts it as received."}, "Found in your world");
  if (k==="server") return h("span",{class:"src-server", title:"Given by the server: starting inventory or a !getitem command."}, "Starting item");
  return chip(from);
}
function renderReceived(){
  const body = $("#recvBody"); body.replaceChildren();
  const q = UI.recvQuery;
  const kindOk = r => UI.recvFrom==="all" || (UI.recvFrom==="others" ? srcKind(r.from)==="other" : srcKind(r.from)!=="other");
  let rows = S.received.filter(r => kindOk(r) && (!UI.recvProg || (r.flags & 1)) && (!q || (itemName(r.item,S.slot)+" "+srcLabel(r.from)+" "+locName(r.location,r.from)).toLowerCase().includes(q)));
  if (!S.received.length){ body.append(h("div",{class:"empty"},h("b",null,"No items yet"),"Items sent to you, and your own items you find in your world, collect here.")); return; }
  if (!rows.length){ body.append(h("div",{class:"empty"},h("b",null,"No matches"), UI.recvFrom==="others" ? "No other player has sent you anything that matches yet." : UI.recvFrom==="self" ? "You haven't found any of your own items that match yet." : "Try a different search or turn off the key items filter.")); return; }
  if (UI.recvMode==="log"){
    const tb = h("tbody");
    for (const r of [...rows].reverse()){
      const k = srcKind(r.from);
      tb.append(h("tr",null, h("td",{class:"num muted"}, r.index+1), h("td",null,itemPill(r.item,S.slot,r.flags)), h("td",null,srcNode(r.from)),
        h("td",{class:"muted"}, k==="server" ? "—" : [locName(r.location, r.from), k==="other" ? ` (${pname(r.from)}'s world)` : ""]), h("td",{class:"num muted r"}, fmtTime(r.t))));
    }
    body.append(h("table",{class:"grid"}, h("thead",null,h("tr",null,h("th",null,"#"),h("th",null,"Item"),h("th",null,"Came from"),h("th",null,"Location"),h("th",{class:"r"},"Time"))), tb));
  } else {
    const groups = new Map();
    for (const r of rows){
      const k = r.item; let g = groups.get(k);
      if (!g){ g = {item:r.item, flags:r.flags, n:0, from:new Map(), last:-1}; groups.set(k,g); }
      g.n++; g.from.set(r.from, (g.from.get(r.from)||0)+1); g.last = Math.max(g.last, r.index); g.flags |= r.flags;
    }
    const srt = UI.recvSort; const rank = {prog:0,useful:1,filler:2,trap:3};
    const list = [...groups.values()].sort((a,b)=>{
      let v = 0;
      if (srt.key==="name") v = itemName(a.item,S.slot).localeCompare(itemName(b.item,S.slot));
      else if (srt.key==="n") v = a.n-b.n;
      else if (srt.key==="cls") v = rank[cls(a.flags)]-rank[cls(b.flags)];
      else v = a.last-b.last;
      return v*srt.dir;
    });
    const th = (key,label,extra) => h("th",{class:"sortable"+(extra?" "+extra:""), onclick:()=>{ UI.recvSort = {key, dir: UI.recvSort.key===key ? -UI.recvSort.dir : (key==="name"||key==="cls"?1:-1)}; renderReceived(); }},
      label + (UI.recvSort.key===key ? (UI.recvSort.dir>0?" ↑":" ↓") : ""));
    const tb = h("tbody");
    const useCat = UI.recvCat && S.itemCat.size;
    if (useCat) list.sort((a,b)=> catCmp(catOf(S.itemCat, itemName(a.item,S.slot)), catOf(S.itemCat, itemName(b.item,S.slot))));
    let lastCat = null;
    for (const g of list){
      if (useCat){ const c = catOf(S.itemCat, itemName(g.item,S.slot)); if (c!==lastCat){ lastCat=c; tb.append(h("tr",{class:"cat-h"}, h("td",{colspan:"4"}, c))); } }
      const senders = [...g.from.entries()].sort((a,b)=>b[1]-a[1]);
      tb.append(h("tr",null, h("td",null,itemPill(g.item,S.slot,g.flags)), h("td",{class:"num r"}, h("b",null,"×"+g.n)),
        h("td",null, h("div",{style:"display:flex;gap:4px 12px;flex-wrap:wrap"}, senders.map(([s,n]) => h("span",null, srcNode(s), n>1?h("span",{class:"muted num"}," ×"+n):null)))),
        h("td",{class:"muted", title:CLS_DESC[cls(g.flags)]}, CLS_NAME[cls(g.flags)])));
    }
    body.append(h("table",{class:"grid"}, h("thead",null,h("tr",null, th("name","Item"), th("n","Count","r"), h("th",null,"Came from"), th("cls","Type"))), tb));
  }
}

/* ---------- Checks left ---------- */
function scout(){
  if (!S.missing.size) return;
  store.set("apwc.scout."+roomKey(), true);
  send({cmd:"LocationScouts", locations:[...S.missing], create_as_hint:0});
  $("#scoutBtn").textContent = "Contents shown"; $("#scoutBtn").disabled = true;
}
function renderChecks(){
  const total = S.checked.size + S.missing.size, done = S.checked.size;
  $("#chkLbl").textContent = `${done} of ${total} checks done · ${S.missing.size} left`;
  $("#chkPct").textContent = total ? Math.round(100*done/total)+"%" : "0%";
  $("#chkBar").style.width = total ? (100*done/total)+"%" : "0";
  const revealed = S.scouted.size>0;
  $("#scoutBar").classList.toggle("hidden", revealed || UI.chkMode!=="missing" || !S.missing.size);
  const body = $("#chkBody"); body.replaceChildren();
  const ids = [...(UI.chkMode==="missing" ? S.missing : S.checked)];
  const q = UI.chkQuery;
  renderLogicBar();
  const logic = Logic.state === "ready" && UI.chkMode === "missing";
  const reach = id => Logic.inLogic.has(id) ? 0 : Logic.glitched.has(id) ? 1 : 2;
  let rows = ids.map(id => ({id, name:locName(id, S.slot), sc:S.scouted.get(id)}));
  if (logic && UI.chkLogic) rows = rows.filter(r => reach(r.id) === 0);
  if (q) rows = rows.filter(r => (r.name + (r.sc ? " "+itemName(r.sc.item,r.sc.player)+" "+pname(r.sc.player) : "")).toLowerCase().includes(q));
  const rank = f => f==null ? 9 : ({prog:0,useful:1,filler:2,trap:3})[cls(f)];
  const useCat = UI.chkCat && S.locCat.size;
  rows.sort((a,b)=> (useCat ? catCmp(catOf(S.locCat,a.name), catOf(S.locCat,b.name)) : 0) || (logic ? reach(a.id)-reach(b.id) : 0) || (revealed && UI.chkMode==="missing" ? rank(a.sc?.flags)-rank(b.sc?.flags) : 0) || a.name.localeCompare(b.name, undefined, {numeric:true}));
  if (!ids.length){
    body.append(h("div",{class:"empty"}, h("b",null, UI.chkMode==="missing" ? "Every check is done" : "No checks done yet"), UI.chkMode==="missing" ? "Nothing left to find in your world." : "Locations you check in your game appear here."));
    return;
  }
  if (!rows.length){
    if (logic && UI.chkLogic && !q) body.append(h("div",{class:"empty"},h("b",null,"Nothing you can reach right now"),"Wait for items from other players, or untick “Only what I can reach” to see every check."));
    else body.append(h("div",{class:"empty"},h("b",null,"No matches"),"Try a different search."));
    return;
  }
  const showContents = revealed && UI.chkMode==="missing";
  const tb = h("tbody");
  let lastCat = null;
  for (const r of rows){
    if (useCat){ const c = catOf(S.locCat, r.name); if (c!==lastCat){ lastCat=c; tb.append(h("tr",{class:"cat-h"}, h("td",{colspan: String((showContents?3:1) + (logic?1:0))}, c))); } }
    const rc = logic ? reach(r.id) : null;
    tb.append(h("tr",{class: rc===2 ? "unreachable" : null},
      logic ? h("td",{class:"reach-cell"}, h("span",{class:"reach " + ["ok","glitch","no"][rc], title:["You can reach this now","Reachable with glitches or tricks","Needs items you don't have yet"][rc]}, ["Reachable","Glitched","Not yet"][rc])) : null,
      h("td",null,r.name),
      showContents ? h("td",null, r.sc ? itemPill(r.sc.item, r.sc.player, r.sc.flags) : h("span",{class:"muted"},"—")) : null,
      showContents ? h("td",null, r.sc ? chip(r.sc.player) : null) : null));
  }
  body.append(h("table",{class:"grid"}, h("thead",null,h("tr",null, logic ? h("th",null,"Reach") : null, h("th",null,"Location"), showContents?h("th",null,"Holds"):null, showContents?h("th",null,"For"):null)), tb));
}

/* ---------- Hints ---------- */
function renderHints(){
  const body = $("#hintBody"); body.replaceChildren();
  const q = UI.hintQuery;
  const txt = x => [itemName(x.item,x.receiving_player), locName(x.location,x.finding_player), pname(x.finding_player), pname(x.receiving_player), x.entrance||""].join(" ").toLowerCase();
  const all = S.hints.filter(x => (!UI.hintHideFound || !x.found) && (!q || txt(x).includes(q)));
  const forMe = all.filter(x => x.receiving_player===S.slot);
  const inMine = all.filter(x => x.finding_player===S.slot && x.receiving_player!==S.slot);
  if (!S.hints.length){
    body.append(h("div",{class:"empty"}, h("b",null,"No hints yet"), "Type ", h("b",null,"!hint item name"), " below to find out where something you need is."));
    return;
  }
  const order = x => x.found ? 9 : ({30:0,0:1,10:2,20:3})[x.status ?? 0] ?? 1;
  const section = (title, note, list, receiverView) => {
    body.append(h("div",{class:"section-h"}, h("h2",null,title), h("p",null,note)));
    if (!list.length){ body.append(h("div",{class:"empty",style:"padding:16px 18px;text-align:left"}, "None.")); return; }
    const tb = h("tbody");
    for (const x of [...list].sort((a,b)=>order(a)-order(b))){
      let statusCell;
      if (receiverView && !x.found){
        const sel = h("select",{class:"hs","aria-label":"Hint status", onchange:e=>{ send({cmd:"UpdateHint", player:x.finding_player, location:x.location, status:+e.target.value}); }},
          [0,30,10,20].map(v => h("option",{value:v, selected: (x.status??0)===v}, HINT_STATUS[v])));
        statusCell = sel;
      } else statusCell = hintStatusPill(x.found ? 40 : (x.status ?? 0));
      tb.append(h("tr",null,
        h("td",null,itemPill(x.item, x.receiving_player, x.item_flags)),
        h("td",null, receiverView ? chip(x.finding_player) : chip(x.receiving_player)),
        h("td",null, locName(x.location, x.finding_player), x.entrance && x.entrance!=="Vanilla" ? h("div",{class:"sub"},"via "+x.entrance) : null),
        h("td",null,statusCell)));
    }
    body.append(h("table",{class:"grid"}, h("thead",null,h("tr",null,h("th",null,"Item"),h("th",null, receiverView?"In whose world":"For"),h("th",null,"Location"),h("th",null,"Status"))), tb));
  };
  section("Items you're waiting on", "Where your items are hiding in other worlds.", forMe, true);
  section("Items in your world for others", "Checks in your game that other players need.", inMine, false);
}

/* ---------- room tracker (archipelago.gg) ---------- */
function parseRoomUrl(u){
  try { const x = new URL(String(u).trim()); const m = x.pathname.match(/\/room\/([A-Za-z0-9_-]{6,})/); return (x.protocol === "https:" && m) ? { base: `${x.protocol}//${x.host}`, host: x.hostname, id: m[1] } : null; }
  catch { return null; }
}
async function webJson(url){
  if (!window.apvic?.webJson) throw new Error("Room links work in the ArchipelagoVic app.");
  return window.apvic.webJson(url);
}
// Server address for a room link. Opening the room page starts the room if it has gone to sleep.
async function roomAddress(url){
  const r = parseRoomUrl(url);
  if (!window.apvic?.webJson) throw new Error("Room links work in the ArchipelagoVic app. Here, type the server address (archipelago.gg:port) instead.");
  let st = await webJson(`${r.base}/api/room_status/${r.id}`).catch(() => null);
  if (!st) throw new Error("That room wasn't found. Check the link.");
  if (!st.last_port) {
    try { await window.apvic.webTouch(`${r.base}/room/${r.id}`); } catch {}
    for (let i = 0; i < 10 && !st.last_port; i++) { await new Promise(res => setTimeout(res, 2000)); st = await webJson(`${r.base}/api/room_status/${r.id}`).catch(() => st); }
  }
  if (!st.last_port) throw new Error("The room hasn't started yet. Open its page in a browser, then try again.");
  return `${r.host}:${st.last_port}`;
}
async function startTracker(){
  stopTracker();
  const r = S.roomUrl && parseRoomUrl(S.roomUrl);
  if (!r || !window.apvic) return;
  Track.base = r.base; Track.roomId = r.id;
  try {
    const st = await webJson(`${r.base}/api/room_status/${r.id}`);
    Track.tracker = st.tracker;
    const stat = await webJson(`${r.base}/api/static_tracker/${st.tracker}`).catch(() => null);
    Track.totals = new Map((stat?.player_locations_total || []).filter(x => x.team === S.team).map(x => [x.player, x.total_locations]));
  } catch (err) { Track.error = err.message; if (UI.tab === "players") renderPlayers(); return; }
  const tick = async () => {
    try {
      const d = await webJson(`${Track.base}/api/tracker/${Track.tracker}`);
      const byPlayer = new Map();
      const get = p => { if (!byPlayer.has(p)) byPlayer.set(p, {}); return byPlayer.get(p); };
      for (const x of d.player_checks_done || []) if (x.team === S.team) get(x.player).checks = (x.locations || []).length;
      for (const x of d.player_items_received || []) if (x.team === S.team) get(x.player).items = (x.items || []).length;
      for (const x of d.activity_timers || []) if (x.team === S.team && x.time) get(x.player).active = Date.parse(x.time);
      for (const x of d.connection_timers || []) if (x.team === S.team && x.time) get(x.player).connected = Date.parse(x.time);
      for (const x of d.player_status || []) if (x.team === S.team) { get(x.player).status = x.status; if (!S.status.has(x.player) || !S.status.get(x.player)) S.status.set(x.player, x.status); }
      Track.players = byPlayer; Track.at = Date.now(); Track.error = null;
    } catch (err) { Track.error = err.message; }
    if (UI.tab === "players") renderPlayers();
  };
  await tick();
  Track.timer = setInterval(tick, 60000);   // the website refreshes this data once a minute
}
/* ---------- What you can reach (Universal Tracker's logic, in the ArchipelagoVic app) ---------- */
const Logic = { id:null, key:null, state:"off", inLogic:new Set(), glitched:new Set(), notes:[], detail:"", log:[], yaml:null, yamlFile:null, gen:0, repaired:false };
const logicInApp = () => !!window.apvic?.logicStart;
async function startLogic(force = false){
  if (!logicInApp() || !S.slot) { renderLogicBar(); return; }
  const key = `${S.server}|${S.slotName}`;
  if (!force && Logic.id && Logic.key === key && Logic.state !== "error") return;   // already running for this room (e.g. after a reconnect)
  stopLogic();
  if (!store.get("apwc.logic", true)) { renderLogicBar(); return; }
  const gen = Logic.gen;
  Logic.yamlFile = store.get("apwc.logicYaml." + roomKey(), null);
  Object.assign(Logic, { key, state:"starting", detail:"", log:[], notes:[] });
  renderLogicBar();
  try {
    const r = await window.apvic.logicStart({ server:S.server, slot:S.slotName, password:S.password || "", yamlFile:Logic.yamlFile });
    if (gen !== Logic.gen) { if (r?.id) window.apvic.logicStop(r.id).catch(()=>{}); return; }
    Logic.id = r.id; Logic.yaml = r.yaml; Logic.state = "generating";
  } catch (e) {
    if (gen !== Logic.gen) return;
    Logic.state = "error"; Logic.detail = e.message;
    if (Logic.yamlFile && /no player named/i.test(e.message)) store.set("apwc.logicYaml." + roomKey(), null);
  }
  renderLogicBar(); refreshChecksView();
}
function stopLogic(){
  Logic.gen++;
  if (Logic.id && window.apvic?.logicStop) window.apvic.logicStop(Logic.id).catch(()=>{});
  Object.assign(Logic, { id:null, key:null, state:"off", inLogic:new Set(), glitched:new Set(), notes:[], yaml:null });
}
function onLogicData(d){
  if (!d || d.id !== Logic.id) return;
  if (d.type === "status") Logic.state = d.stage === "generating" ? "generating" : "connecting";
  else if (d.type === "logic") {
    Logic.inLogic = new Set(d.inLogic || []); Logic.glitched = new Set(d.glitched || []); Logic.notes = d.notes || [];
    if (d.disabled) Logic.state = "unsupported";
    else if (!d.ready) { Logic.state = "error"; Logic.detail = d.genError || ""; }
    else Logic.state = "ready";
  }
  else if (d.type === "log") Logic.log = [...Logic.log, d.text].slice(-8);
  else if (d.type === "error") {
    Logic.state = d.code === "ut-missing" ? "needs-ut" : "error"; Logic.detail = d.text || "";
    // A Universal Tracker you installed yourself that won't load with this Archipelago: swap in the built-in one once.
    if (d.code === "ut-missing" && !Logic.repaired) { Logic.repaired = true; repairUT(); return; }
  }
  else if (d.type === "exit") {
    Logic.id = null;
    if (!["error", "needs-ut", "unsupported"].includes(Logic.state)) { Logic.state = "error"; Logic.detail = d.tail || `It stopped unexpectedly (code ${d.code}).`; }
  }
  renderLogicBar(); refreshChecksView();
}
function refreshChecksView(){ if (UI.tab === "checks") renderChecks(); else renderLogicBar(); }
async function repairUT(){
  Logic.state = "starting"; renderLogicBar();
  try { await window.apvic.logicInstallUT(); }
  catch (e) { Logic.state = "needs-ut"; Logic.detail = e.message; renderLogicBar(); return; }
  startLogic(true);
}
async function chooseLogicYaml(){
  let p; try { p = await window.apvic.logicChooseYaml(); } catch (e) { toast(e.message); return; }
  if (!p) return;
  store.set("apwc.logicYaml." + roomKey(), p);
  startLogic(true);
}
function renderLogicBar(){
  const bar = $("#logicBar"); if (!bar) return;
  $("#chkLogicWrap")?.classList.toggle("hidden", Logic.state !== "ready");
  if (!logicInApp() || !S.slot || UI.chkMode !== "missing" || !S.missing.size) { bar.classList.add("hidden"); return; }
  bar.classList.remove("hidden");
  const btn = (label, fn, primary) => h("button", { class: "btn small" + (primary ? " primary" : ""), type: "button", onclick: fn }, label);
  const off = () => { store.set("apwc.logic", false); stopLogic(); UI.chkLogic = false; $("#chkLogic").checked = false; renderChecks(); };
  let kids;
  if (Logic.state === "off") kids = [h("span", { class: "grow" }, "See which of your remaining checks you can reach right now."), btn("Turn on", () => { store.set("apwc.logic", true); startLogic(true); }, true)];
  else if (Logic.state === "needs-ut") kids = [h("span", { class: "logic-dot bad", "aria-hidden": "true" }),
      h("span", { class: "grow" }, h("b", null, "Couldn't load the tracker. "), "The Universal Tracker in your custom_worlds folder doesn't work with this version of Archipelago, and replacing it with the built-in one didn't help.",
        Logic.detail ? h("details", { class: "logic-details" }, h("summary", null, "Details"), h("pre", { class: "mono" }, Logic.detail.slice(-3000))) : null),
      btn("Repair", () => { Logic.repaired = true; repairUT(); }, true), btn("Turn off", off)];
  else if (["starting", "generating", "connecting"].includes(Logic.state)) kids = [h("span", { class: "spin", "aria-hidden": "true" }),
      h("span", { class: "grow" }, Logic.state === "connecting" ? "Checking what you can reach…" : "Working out your world's logic… Big games can take a minute.")];
  else if (Logic.state === "ready") {
    const left = [...S.missing], n = left.filter(id => Logic.inLogic.has(id)).length, g = left.filter(id => Logic.glitched.has(id)).length;
    kids = [h("span", { class: "logic-dot ok", "aria-hidden": "true" }),
      h("span", { class: "grow" }, h("b", null, `${n} of ${left.length}`), " remaining checks are reachable with what you have", g ? ` · ${g} more with glitches` : "", "."),
      h("span", { class: "muted small-note", title: "Built into ArchipelagoVic. Universal Tracker is by FarisTheAncient (MIT license)." }, "Logic by Universal Tracker"), btn("Turn off", off)];
  }
  else if (Logic.state === "unsupported") kids = [h("span", { class: "grow" }, `The ${gameOf(S.slot)} world asks trackers not to work out its logic, so every check is shown.`), btn("Turn off", off)];
  else {
    const details = [Logic.detail, ...Logic.notes, ...Logic.log].filter(Boolean).join("\n").slice(-3000);
    kids = [h("span", { class: "logic-dot bad", "aria-hidden": "true" }),
      h("span", { class: "grow" }, h("b", null, "Couldn't work out what you can reach. "),
        !Logic.yaml ? `There's no YAML named ${S.slotName} in your Players folder. Most games need the YAML you made for this slot, so choose it.`
                    : `Using ${Logic.yaml.file.split(/[\\/]/).pop()}. Universal Tracker couldn't build ${gameOf(S.slot)} from it.`,
        details ? h("details", { class: "logic-details" }, h("summary", null, "Details"), h("pre", { class: "mono" }, details)) : null),
      btn("Choose YAML…", chooseLogicYaml, !Logic.yaml), btn("Try again", () => startLogic(true)), btn("Turn off", off)];
  }
  bar.className = "logic-bar" + (Logic.state === "ready" ? " ok" : Logic.state === "error" ? " bad" : "");
  bar.replaceChildren(...kids.filter(Boolean));
}

function stopTracker(){ clearInterval(Track.timer); Object.assign(Track, { base:null, roomId:null, tracker:null, totals:new Map(), players:new Map(), at:0, timer:null, error:null }); }
function agoText(t){
  if (!t) return "—";
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 90) return "just now"; if (s < 3600) return `${Math.round(s / 60)} min ago`; if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
}

/* ---------- Players ---------- */
function renderPlayers(){
  const body = $("#playersBody"); body.replaceChildren();
  const live = Track.at > 0;
  const tb = h("tbody");
  for (const p of sortedPlayers()){
    const t = Track.players.get(p.slot) || {};
    const st = (live && t.status != null) ? t.status : (S.status.get(p.slot) ?? 0);
    const cl = st===30 ? "goal" : st>=10 ? "playing" : "";
    const sent = S.feed.filter(e=>e.kind==="item" && e.from===p.slot && e.to!==p.slot).length;
    const got = S.feed.filter(e=>e.kind==="item" && e.to===p.slot && e.from!==p.slot).length;
    const total = Track.totals.get(p.slot);
    const done = t.checks ?? (p.slot === S.slot ? S.checked.size : null);
    const pct = total ? Math.round(100 * (done || 0) / total) : null;
    tb.append(h("tr",null, h("td",null,chip(p.slot)), h("td",null,withGame(p.game)),
      h("td",null,h("span",{class:"status-pill "+cl}, CLIENT_STATUS[st] ?? "Unknown")),
      live ? h("td",null, h("div",{class:"prog-cell"}, total ? [h("div",{class:"mini-bar"}, h("i",{style:`width:${pct}%`})), h("span",{class:"num"}, `${done}/${total}`)] : h("span",{class:"num"}, done ?? "—"))) : null,
      live ? h("td",{class:"muted", title: t.active ? new Date(t.active).toLocaleString() : ""}, agoText(t.active)) : h("td",null, S.online.has(p.slot) ? h("span",{class:"online"},"Online") : h("span",{class:"muted"},"—")),
      live ? h("td",{class:"num r"}, t.items ?? "—") : [h("td",{class:"num r"}, sent), h("td",{class:"num r"}, got)],
      h("td",{class:"r"}, h("button",{class:"btn ghost",onclick:()=>{UI.feedPlayer=p.slot; UI.feedFilter="all"; syncSeg("#feedFilter","f","all"); selectTab("activity"); renderRoster();}},"Show activity"))));
  }
  const note = live ? `Live from the room's tracker on ${new URL(Track.base).host}, updated ${agoText(Track.at)}. Refreshes every minute.`
    : Track.error ? `Couldn't read the room's tracker: ${Track.error}`
    : S.roomUrl ? "Loading the room's tracker…"
    : "Add the room page link when you connect to see everyone's checks and activity.";
  body.append(h("div",{class:"section-h"}, h("h2",null,"Players in this room"), h("p",null, note),
    S.roomUrl ? h("a",{class:"btn small", href:S.roomUrl, target:"_blank", rel:"noopener", style:"margin-left:auto"}, "Open room page") : null));
  const heads = live ? ["Player","Game","Status","Checks","Last active",["Items received","r"],""] : ["Player","Game","Status","Seen online",["Sent","r"],["Received","r"],""];
  body.append(h("table",{class:"grid"}, h("thead",null,h("tr",null, heads.map(x => Array.isArray(x) ? h("th",{class:x[1]},x[0]) : h("th",null,x)))), tb));
}

/* ---------- tabs & view switching ---------- */
function selectTab(t){
  UI.tab = t;
  for (const b of $$("#tabs button")) b.setAttribute("aria-selected", String(b.dataset.tab===t));
  for (const p of $$("main > .panel")) p.classList.toggle("hidden", p.dataset.panel!==t);
  if (t==="activity" || t==="received") S.unread = 0;
  rerender(t); renderHeader();
}
function rerender(t){
  ({activity:()=>{renderFeed();renderRoster();}, received:renderReceived, checks:renderChecks, hints:renderHints, players:renderPlayers})[t]?.();
}
function rerenderAll(){ for (const e of S.feed) delete e._txt; renderHeader(); rerender(UI.tab); renderRoster(); }
function showApp(){
  $("#connectView").classList.add("hidden"); $("#appView").classList.remove("hidden"); selectTab("activity"); $("#sayInput").focus();
  if (!store.get("apwc.guideSeen", false)){ store.set("apwc.guideSeen", true); try{ $("#guide").showModal(); }catch{} }
}
function showConnect(){
  $("#appView").classList.add("hidden"); $("#connectView").classList.remove("hidden");
  postStatus();
  $("#connectBtn").disabled = false; $("#connectBtn").textContent = "Connect"; renderRecent();
}
function syncSeg(sel, attr, val){ for (const b of $$(sel+" button")) b.setAttribute("aria-pressed", String(b.dataset[attr]===val)); }

/* ---------- composer ---------- */
const history = store.get("apwc.history", []); let histPos = -1;
let sugg = {items:[], idx:0, prefix:""};
function onSay(ev){
  ev.preventDefault();
  const inp = $("#sayInput"); const text = inp.value.trim(); if (!text) return;
  hideSuggest();
  history.unshift(text); history.splice(50); store.set("apwc.history", history); histPos = -1;
  inp.value = "";
  if (text==="/clear"){ S.feed = []; store.del(histKey()); renderFeed(); return; }
  if (text==="/help"){ addFeed({kind:"sys", parts:[{text:"Local: /clear empties the activity log. Server commands start with ! — try !help, !hint <item>, !hint_location <location>, !remaining, !status."}]}); return; }
  send({cmd:"Say", text});
}
function updateSuggest(){
  const v = $("#sayInput").value;
  const m = v.match(/^!(hint_location|hint)\s+(.*)$/i);
  if (!m || !S.dp[gameOf(S.slot)]){ hideSuggest(); return; }
  const isLoc = m[1].toLowerCase()==="hint_location";
  const q = m[2].toLowerCase();
  const pool = isLoc ? S.dp[gameOf(S.slot)].locNames : S.dp[gameOf(S.slot)].itemNames;
  const starts = [], contains = [];
  for (const n of pool){ const l = n.toLowerCase(); if (l.startsWith(q)) starts.push(n); else if (q && l.includes(q)) contains.push(n); if (starts.length>12) break; }
  const items = [...starts, ...contains].slice(0, 10);
  if (!items.length || (items.length===1 && items[0].toLowerCase()===q)){ hideSuggest(); return; }
  sugg = {items, idx:0, prefix:"!"+m[1]+" ", isLoc};
  const ul = $("#suggest"); ul.replaceChildren();
  items.forEach((n,i)=> ul.append(h("li",{role:"option","aria-selected":String(i===0), onmousedown:e=>{e.preventDefault(); acceptSuggest(i);}}, n, h("small",null,isLoc?"location":"item"))));
  ul.classList.remove("hidden");
}
function hideSuggest(){ $("#suggest").classList.add("hidden"); sugg.items = []; }
function acceptSuggest(i){ $("#sayInput").value = sugg.prefix + sugg.items[i]; hideSuggest(); $("#sayInput").focus(); }
function onSayKey(e){
  const open = sugg.items.length && !$("#suggest").classList.contains("hidden");
  if (open && e.key==="Tab"){ e.preventDefault(); acceptSuggest(sugg.idx); return; }
  if (open && (e.key==="ArrowDown" || e.key==="ArrowUp")){
    e.preventDefault(); sugg.idx = (sugg.idx + (e.key==="ArrowDown"?1:-1) + sugg.items.length) % sugg.items.length;
    $$("#suggest li").forEach((li,i)=>li.setAttribute("aria-selected", String(i===sugg.idx))); return;
  }
  if (open && e.key==="Escape"){ hideSuggest(); return; }
  if (!open && e.key==="ArrowUp" && history.length){ e.preventDefault(); histPos = Math.min(history.length-1, histPos+1); e.target.value = history[histPos]; }
  if (!open && e.key==="ArrowDown"){ e.preventDefault(); histPos = Math.max(-1, histPos-1); e.target.value = histPos<0 ? "" : history[histPos]; }
}

/* ---------- alerts ---------- */
const ALERT_DEFAULTS = {keyItem:true, anyItem:false, hint:true, mention:true, goal:false, sound:true, desktop:true};
function alertPrefs(){ return {...ALERT_DEFAULTS, ...store.get("apwc.alerts", {})}; }
function openAlerts(){ const p = alertPrefs(); $$("[data-alert]").forEach(cb => cb.checked = !!p[cb.dataset.alert]); $("#alertsDlg").showModal(); }
let audioCtx = null;
function chime(kind){
  try{
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const t0 = audioCtx.currentTime;
    const notes = kind==="key" ? [660, 880, 1175] : kind==="trap" ? [330, 247] : [784, 988];
    notes.forEach((f, i) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain(), t = t0 + i*0.11;
      o.type = kind==="trap" ? "triangle" : "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t+0.02); g.gain.exponentialRampToValueAtTime(0.0001, t+0.38);
      o.connect(g).connect(audioCtx.destination); o.start(t); o.stop(t+0.42);
    });
  }catch{}
}
function alertUser(kind, title, body){
  const p = alertPrefs();
  if (p.sound) chime(kind);
  const away = document.hidden || !document.hasFocus();
  if (p.desktop && away && "Notification" in window){
    const show = () => { try{ const n = new Notification(title, {body, silent:true}); n.onclick = () => window.focus(); }catch{} };
    if (Notification.permission==="granted") show();
    else if (Notification.permission!=="denied") Notification.requestPermission().then(r => { if (r==="granted") show(); });
  }
  if (away && window.apvic) window.apvic.flash().catch(()=>{});
}
function mentionsMe(msg){
  const names = [player(S.slot)?.alias, player(S.slot)?.name].filter(Boolean);
  return names.some(n => new RegExp(`(^|[^\\w])${n.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}($|[^\\w])`, "i").test(msg||""));
}

/* ---------- waiting-on ---------- */
function waitingKeyItems(){
  const seen = new Set();
  return S.hints.filter(x => x.receiving_player===S.slot && !x.found && (x.item_flags & 1) && x.finding_player!==S.slot)
    .filter(x => { const k = x.finding_player+":"+x.location; if (seen.has(k)) return false; seen.add(k); return true; });
}

/* ---------- history ---------- */
function histKey(){ return `apwc.hist.${S.room?.seed_name || "unknown"}.${S.team}.${S.slot}`; }
let histTimer = null;
function saveHistory(){
  if (!S.slot) return;
  clearTimeout(histTimer);
  histTimer = setTimeout(() => {
    const key = histKey();
    const keep = S.feed.filter(e => e.kind!=="divider").slice(-2000).map(({_txt, ...e}) => e);
    if (!store.set(key, keep)) store.set(key, keep.slice(-400));
    const idx = store.get("apwc.hist.index", []).filter(k => k!==key); idx.unshift(key);
    for (const old of idx.slice(12)) store.del(old);
    store.set("apwc.hist.index", idx.slice(0, 12));
  }, 1200);
}
function loadHistory(){
  const old = store.get(histKey(), null);
  if (!Array.isArray(old) || !old.length) return;
  S.feed = old;
  S.nextId = old.reduce((m, e) => Math.max(m, e.id||0), 0) + 1;
  S.feed.push({kind:"divider", id:S.nextId++, t:Date.now(), text:`Earlier sessions above · reconnected ${new Date().toLocaleString([], {dateStyle:"medium", timeStyle:"short"})}`});
}

/* ---------- game categories ---------- */
function groupIndex(groups, allNames){
  const total = (allNames && allNames.length) || 1;
  const entries = Object.entries(groups || {})
    .filter(([g, list]) => g!=="Everything" && Array.isArray(list) && list.length && list.length < total*0.9)
    .sort((a, b) => a[1].length - b[1].length);
  const m = new Map();
  for (const [g, list] of entries) for (const n of list) if (!m.has(n)) m.set(n, g);
  return m;
}
function catOf(map, name){ return map.get(name) || "Other"; }
function catCmp(a, b){ return (a==="Other") - (b==="Other") || a.localeCompare(b); }
function syncCatToggles(){
  const r = $("#recvCat"), c = $("#chkCat");
  r.disabled = !S.itemCat.size; r.parentElement.title = S.itemCat.size ? "" : "This game doesn't define item categories.";
  c.disabled = !S.locCat.size; c.parentElement.title = S.locCat.size ? "" : "This game doesn't define location areas.";
}

/* ---------- quick commands ---------- */
function permAllowed(name){
  const v = S.room?.permissions?.[name];
  if (typeof v !== "number") return {ok:true};
  const goal = S.status.get(S.slot)===30;
  if (v & 1) return {ok:true};
  if (v & 2) return goal ? {ok:true} : {ok:false, why:"This room allows it only after you reach your goal."};
  return {ok:false, why:"This room has turned it off."};
}
function updateCmdbar(){
  for (const name of ["remaining","release","collect"]){
    const b = $(`#cmdbar [data-cmd="${name}"]`); if (!b) continue;
    const a = permAllowed(name);
    b.disabled = !a.ok;
    b.title = a.ok ? b.dataset.tip || b.title : a.why;
    if (!b.dataset.tip) b.dataset.tip = b.getAttribute("title");
  }
}
async function runQuickCommand(cmd){
  if (cmd==="hint"){ const i = $("#sayInput"); i.value = "!hint "; i.focus(); updateSuggest(); return; }
  if (cmd==="remaining"){ send({cmd:"Say", text:"!remaining"}); return; }
  if (cmd==="status"){ send({cmd:"Say", text:"!status"}); return; }
  if (cmd==="collect"){
    if (await askConfirm("Collect your items?", "Every item still waiting for you in other worlds is sent to you now. Other players' games are not affected.", "Collect")) send({cmd:"Say", text:"!collect"});
    return;
  }
  if (cmd==="release"){
    if (await askConfirm("Release your world?", "Every item left in your world goes to its owners right away. You can't undo this.", "Release")) send({cmd:"Say", text:"!release"});
  }
}

/* ---------- game pictures ---------- */
const artBust = new Map();
function monogram(game, size){
  const words = String(game || "?").replace(/[^A-Za-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
  const text = (words.length > 1 ? words[0][0] + words[1][0] : (words[0] || "?").slice(0, 2)).toUpperCase();
  let hash = 0; for (const ch of String(game)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return h("span", {class:`gicon mono${size ? " " + size : ""}`, style:`--gh:${hash % 360}`, "data-game":game, title:game, "aria-hidden":"true"}, text);
}
// Shows the lettered tile right away and swaps in the real picture once it has loaded.
// kind "icon" = the game's square app icon; "cover" = its box art (used in the game summary).
function artImg(game, size, kind){
  if (!game) return null;
  const tile = monogram(game, size);
  tile.dataset.kind = kind;
  if (!window.apvic) return tile;
  const v = artBust.get(kind + ":" + game);
  const img = h("img", {class:`gicon${kind === "cover" ? " cover" : ""}${size ? " " + size : ""}`, alt:"", decoding:"async", "data-game":game, "data-kind":kind, title:game});
  img.addEventListener("load", () => { if (tile.isConnected) tile.replaceWith(img); }, {once:true});
  img.src = `apvic-icon://${kind}/${encodeURIComponent(game)}${v ? "?v=" + v : ""}`;
  return tile;
}
function gameIcon(game, size){ return artImg(game, size, "icon"); }
function coverImg(game, size){ return artImg(game, size, "cover"); }
// A game's icon and name; both open the game summary.
function withGame(game, text){
  if (!game) return text ?? "";
  return h("span",{class:"with-icon"}, gameIcon(game), h("button",{type:"button", class:"game-link", "data-game-info":game, title:`About ${game}`}, text ?? game));
}
document.addEventListener("contextmenu", async e => {
  const el = e.target.closest(".gicon[data-game]");
  if (!el || !window.apvic) return;
  e.preventDefault();
  const game = el.dataset.game, kind = el.dataset.kind === "cover" ? "cover" : "icon";
  let r = null; try { r = await window.apvic.artMenu(game, kind); } catch {}
  if (r === "info") { openGameInfo(game); return; }
  if (r !== "changed") return;
  artBust.set(kind + ":" + game, Date.now());
  for (const old of document.querySelectorAll(`.gicon[data-game="${CSS.escape(game)}"][data-kind="${kind}"]`)){
    const size = ["xxl","xl","lg"].find(c => old.classList.contains(c)) || null;
    old.replaceWith(artImg(game, size, kind));
  }
});
// Click a game's name or icon to see what the game is.
document.addEventListener("click", e => {
  const t = e.target.closest("[data-game-info], .gicon[data-game][data-kind='icon']");
  if (!t || t.closest("button:not(.game-link)") || t.closest("#gameDlg")) return;
  e.preventDefault();
  openGameInfo(t.dataset.gameInfo || t.dataset.game);
});
async function openGameInfo(game){
  const d = $("#gameDlg");
  const body = $("#gameBody");
  const playing = [...S.players.values()].filter(p => p.game === game && p.type !== 2);
  const head = h("div",{class:"game-head"}, coverImg(game, "xxl"),
    h("div",{class:"game-title"}, h("h2",{id:"gameTitle"}, game), h("p",{class:"muted", id:"gameDesc"}, "Looking up this game…"),
      h("div",{class:"chips", id:"gameGenres"}),
      playing.length ? h("p",{class:"game-room"}, "In this room: ", playing.map((p, i) => [i ? ", " : "", chip(p.slot)])) : null));
  body.replaceChildren(head, h("div",{id:"gameMore"}));
  if (!d.open) d.showModal();
  if (!window.apvic){ $("#gameDesc").textContent = "Game details are available in the ArchipelagoVic app."; return; }
  let i; try { i = await window.apvic.gameInfo(game); } catch (err) { $("#gameDesc").textContent = "Couldn't look this game up: " + err.message; return; }
  if (!d.open || $("#gameTitle")?.textContent !== game) return;
  $("#gameDesc").textContent = i.offline ? "Game details are turned off in Settings." : (i.description ? i.description[0].toUpperCase() + i.description.slice(1) : (i.title && i.title !== game ? i.title : ""));
  $("#gameGenres").replaceChildren(...(i.genres || []).slice(0, 6).map(g => h("span",{class:"chip-tag"}, g)));
  const facts = [["Developer", (i.developers||[]).join(", ")], ["Publisher", (i.publishers||[]).join(", ")], ["Released", i.released], ["Series", (i.series||[]).join(", ")], ["Platforms", (i.platforms||[]).slice(0, 8).join(", ")]].filter(([, v]) => v);
  $("#gameMore").replaceChildren(
    facts.length ? h("dl",{class:"kv"}, facts.map(([k, v]) => [h("dt",null,k), h("dd",null,v)])) : null,
    i.summary ? h("p",{class:"game-summary"}, i.summary) : h("p",{class:"muted"}, i.offline ? "" : "No summary found for this game. Custom or fan-made games often don't have one."),
    (i.links || []).length ? h("div",{class:"row-actions"}, i.links.map(l => h("a",{class:"btn small", href:l.url, "data-ext":"", target:"_blank", rel:"noopener"}, l.label))) : null);
}

/* ---------- dialogs ---------- */
function askConfirm(title, text, okLabel = "OK", prompt = null){
  return new Promise(resolve => {
    const d = $("#confirmDlg");
    $("#confirmTitle").textContent = title; $("#confirmText").textContent = text; $("#confirmOk").textContent = okLabel;
    const pw = $("#promptWrap");
    if (prompt){ pw.classList.remove("hidden"); $("#promptLabel").textContent = prompt.label; $("#promptInput").value = prompt.value || ""; }
    else pw.classList.add("hidden");
    d.returnValue = "";
    d.onclose = () => resolve(d.returnValue==="ok" ? (prompt ? $("#promptInput").value.trim() : true) : null);
    d.showModal();
    if (prompt) { $("#promptInput").focus(); $("#promptInput").select(); }
  });
}

/* ---------- API for the launcher ---------- */
window.APClient = {
  prefill(server, slot){ if (server) $("#fServer").value = server; if (slot!=null) $("#fSlot").value = slot; },
  connected(){ return !!(S.ws && S.slot); },
  summary(){ return S.slot ? {name:pname(S.slot), game:gameOf(S.slot), server:S.server} : null; },
  recent(){ return store.get("apwc.recent", []); },
  connectNow(){ $("#connectForm").requestSubmit(); }
};

/* ---------- recap ---------- */
function fmtDuration(ms){
  const m = Math.round(ms / 60000); if (m < 60) return `${m} min`;
  const hrs = Math.floor(m / 60), mm = m % 60; if (hrs < 48) return `${hrs} h ${mm} min`;
  return `${Math.round(hrs / 24)} days`;
}
function openRecap(auto){
  if (!S.slot) return;
  const me = S.slot, goal = S.status.get(me) === 30;
  const total = S.checked.size + S.missing.size;
  const fromOthers = S.received.filter(r => r.from !== me && r.from !== 0);
  const keyFromOthers = fromOthers.filter(r => (r.flags & 1) && !(r.flags & 4));
  const senders = new Map(); for (const r of fromOthers) senders.set(r.from, (senders.get(r.from) || 0) + 1);
  const top = [...senders.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const firstKey = [...keyFromOthers].sort((a, b) => a.index - b.index)[0];
  const myChecks = S.feed.filter(e => e.kind === "item" && e.from === me && e.t);
  const sentToOthers = myChecks.filter(e => e.to !== me).length;
  const times = S.feed.filter(e => e.t).map(e => e.t);
  const start = times.length ? Math.min(...times) : null;
  const goalEv = S.feed.find(e => e.kind === "sys" && e.sub === "Goal" && e.slot === me);
  const end = goalEv ? goalEv.t : Date.now();
  const tiles = [
    ["Checks done", `${S.checked.size} / ${total}`],
    ["Items received", `${fromOthers.length} from others`],
    ["Key items received", String(keyFromOthers.length)],
    ["Items you sent out", `${sentToOthers}`],
    ["Hints about your items", String(S.hints.filter(x => x.receiving_player === me).length)],
    ["Time followed", start ? fmtDuration(end - start) : "—"],
  ];
  const body = $("#recapBody");
  body.replaceChildren(...[
    h("div",{class:"recap-head"}, gameIcon(gameOf(me), "lg"), h("div",null, h("b",null, pname(me)), h("div",{class:"muted"}, gameOf(me) + (goal ? " · goal reached" : "")))),
    goal && auto ? h("p",{class:"recap-cheer"}, "You reached your goal. Here's how it went.") : null,
    h("div",{class:"recap-tiles"}, tiles.map(([k, v]) => h("div",{class:"recap-tile"}, h("span",null,k), h("b",{class:"num"},v)))),
    h("h3",null,"Your checks over time"),
    checksChart(myChecks, start, end),
    h("p",{class:"muted small-note"}, "From the events ArchipelagoVic has seen in this room, including earlier sessions it saved."),
    h("div",{class:"recap-cols"},
      h("section",null, h("h3",null,"Who sent you the most"),
        top.length ? h("ol",{class:"recap-bars"}, top.map(([slot, n]) => h("li",null, chip(slot), h("span",{class:"bar"}, h("i",{style:`width:${Math.round(100 * n / top[0][1])}%`})), h("b",{class:"num"}, n))))
          : h("p",{class:"muted"},"No one has sent you anything yet.")),
      h("section",null, h("h3",null,"Firsts"),
        h("dl",{class:"kv"},
          h("dt",null,"First key item"), h("dd",null, firstKey ? [itemPill(firstKey.item, me, firstKey.flags), " from ", chip(firstKey.from)] : "None yet"),
          h("dt",null,"Biggest helper"), h("dd",null, top[0] ? [chip(top[0][0]), ` (${top[0][1]} ${top[0][1] === 1 ? "item" : "items"})`] : "—"),
          h("dt",null,"Started following"), h("dd",null, start ? new Date(start).toLocaleString([], {dateStyle:"medium", timeStyle:"short"}) : "—"),
          goalEv ? [h("dt",null,"Goal reached"), h("dd",null, new Date(goalEv.t).toLocaleString([], {dateStyle:"medium", timeStyle:"short"}))] : null)))].filter(Boolean));
  $("#recapDlg").showModal();
}
// Cumulative checks over time: one teal line, hover shows the count at that moment.
function checksChart(events, start, end){
  // Same day: show times. Longer games: show dates.
  const sameDay = new Date(start).toDateString() === new Date(Math.max(end, events.at(-1)?.t || end)).toDateString();
  const tickLabel = t => sameDay ? new Date(t).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"}) : new Date(t).toLocaleDateString([], {month:"short", day:"numeric"});
  if (events.length < 2 || !start) return h("p",{class:"muted"}, "Not enough history yet. The chart fills in as you check locations.");
  const W = 640, H = 170, P = { l: 36, r: 12, t: 10, b: 24 };
  const t0 = start, t1 = Math.max(end, events[events.length - 1].t), n = events.length;
  const x = t => P.l + (W - P.l - P.r) * (t - t0) / Math.max(1, t1 - t0);
  const y = v => H - P.b - (H - P.t - P.b) * v / n;
  const pts = [[x(t0), y(0)], ...events.map((e, i) => [x(e.t), y(i + 1)]), [x(t1), y(n)]];
  const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.setAttribute("class", "recap-chart"); svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `Checks over time: ${n} checks between ${new Date(t0).toLocaleString()} and ${new Date(t1).toLocaleString()}`);
  const ticks = [0, Math.round(n / 2), n];
  svg.innerHTML = ticks.map(v => `<line x1="${P.l}" x2="${W - P.r}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${P.l - 6}" y="${y(v) + 4}" class="tick" text-anchor="end">${v}</text>`).join("")
    + `<text x="${P.l}" y="${H - 6}" class="tick">${tickLabel(t0)}</text>`
    + `<text x="${W - P.r}" y="${H - 6}" class="tick" text-anchor="end">${tickLabel(t1)}</text>`
    + `<path d="${d}" class="line"/><line class="cross hidden" y1="${P.t}" y2="${H - P.b}"/><circle class="dot hidden" r="4"/>`;
  const wrap = h("div",{class:"recap-chart-wrap"}); wrap.append(svg);
  const tip = h("div",{class:"recap-tip hidden"}); wrap.append(tip);
  const cross = svg.querySelector(".cross"), dot = svg.querySelector(".dot");
  svg.addEventListener("mousemove", ev => {
    const r = svg.getBoundingClientRect(); const px = (ev.clientX - r.left) * W / r.width;
    const t = t0 + (px - P.l) / (W - P.l - P.r) * (t1 - t0);
    let k = 0; while (k < n && events[k].t <= t) k++;
    const cx = Math.min(Math.max(px, P.l), W - P.r);
    cross.setAttribute("x1", cx); cross.setAttribute("x2", cx); dot.setAttribute("cx", cx); dot.setAttribute("cy", y(k));
    cross.classList.remove("hidden"); dot.classList.remove("hidden"); tip.classList.remove("hidden");
    tip.textContent = `${k} check${k === 1 ? "" : "s"} by ${new Date(Math.min(Math.max(t, t0), t1)).toLocaleString([], {month:"short", day:"numeric", hour:"2-digit", minute:"2-digit"})}`;
    tip.style.left = `${100 * cx / W}%`;
  });
  svg.addEventListener("mouseleave", () => { cross.classList.add("hidden"); dot.classList.add("hidden"); tip.classList.add("hidden"); });
  return wrap;
}

/* ---------- tab bridge ---------- */
let statusTimer2 = null;
function postStatus(){
  if (window.parent === window) return;
  clearTimeout(statusTimer2);
  statusTimer2 = setTimeout(() => {
    const on = !!(S.ws && S.slot);
    const recent = !S.slot ? [] : S.received.filter(r => srcKind(r.from) === "other").slice(-8).reverse()
      .map(r => ({ item: itemName(r.item, S.slot), flags: r.flags, cls: cls(r.flags), from: pname(r.from), t: r.t }));
    window.parent.postMessage({ apv: "status", connected: on, name: S.slot ? pname(S.slot) : null, game: S.slot ? gameOf(S.slot) : null,
      server: S.server || null, room: S.roomUrl || null, unread: S.unread, waiting: S.slot ? waitingKeyItems().length : 0, recent,
      checks: S.slot ? [S.checked.size, S.checked.size + S.missing.size] : null, goal: S.slot ? S.status.get(S.slot) === 30 : false }, "*");
  }, 250);
}

/* ---------- misc ---------- */
let toastTimer;
function toast(msg){ const t=$("#toast"); t.textContent=msg; t.classList.remove("hidden"); clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.add("hidden"),3500); }
function applyTheme(){ const t = store.get("apwc.theme","auto"); if (t==="auto") document.documentElement.removeAttribute("data-theme"); else document.documentElement.dataset.theme = t; const lbl = {auto:"Theme: auto",light:"Theme: light",dark:"Theme: dark"}[t]; $$("#themeBtn, #sTheme").forEach(b => b.textContent = lbl); }
function cycleTheme(){ const order=["auto","light","dark"]; const t = store.get("apwc.theme","auto"); store.set("apwc.theme", order[(order.indexOf(t)+1)%3]); applyTheme(); }
function renderRecent(){
  const rec = store.get("apwc.recent", []); const ul = $("#recentList"); ul.replaceChildren();
  $("#recentWrap").classList.toggle("hidden", !rec.length);
  for (const r of rec){
    ul.append(h("li",null, h("button",{class:"pick",type:"button",onclick:()=>{ $("#fServer").value=r.server; $("#fSlot").value=r.slot; $("#fRoom").value=r.room||""; $("#fPass").focus(); }},
      h("span",{class:"with-icon"}, r.game ? gameIcon(r.game) : null, h("span",null,h("b",null,r.slot)," on ",r.server)), h("span",null,r.game||"")),
      h("button",{class:"btn ghost",type:"button",title:"Forget this room","aria-label":`Forget ${r.slot} on ${r.server}`,onclick:()=>{ store.set("apwc.recent", store.get("apwc.recent",[]).filter(x=>!(x.server===r.server&&x.slot===r.slot))); renderRecent(); }},"✕")));
  }
}
function resetSession(){
  Object.assign(S, {room:null, team:0, slot:0, checked:new Set(), missing:new Set(), hintPoints:0, received:[], hints:[], feed:[], scouted:new Map(), status:new Map(), online:new Set(), everConnected:false, retry:0, unread:0});
  S.players.clear(); UI.feedPlayer = null;
  stopTracker();
  stopLogic();
  $("#scoutBtn").textContent = "Reveal contents"; $("#scoutBtn").disabled = false;
}

/* ---------- wiring ---------- */
// client.js runs in two places: as a room page (client.html, one per tab, or standalone in a browser)
// and as a helper library inside the ArchipelagoVic main window (no room UI there).
const CLIENT_UI = !!document.getElementById("connectForm");
const IN_FRAME = window.parent !== window;

// shared by both
$$("[data-guide]").forEach(b => b.addEventListener("click", () => $("#guide").showModal()));
$("#alertTest")?.addEventListener("click", () => { const d = alertPrefs(); alertUser("key", "Hookshot from Alice", "Key item · this is what an alert looks like"); if (d.desktop && "Notification" in window && Notification.permission==="granted" && document.hasFocus()) { try{ new Notification("Hookshot from Alice", {body:"Desktop notifications are on.", silent:true}); }catch{} } });
$$("[data-alert]").forEach(cb => cb.addEventListener("change", () => { const p = alertPrefs(); p[cb.dataset.alert] = cb.checked; store.set("apwc.alerts", p); if (cb.dataset.alert==="desktop" && cb.checked && "Notification" in window && Notification.permission==="default") Notification.requestPermission(); }));
$("#promptInput")?.addEventListener("keydown", e => { if (e.key==="Enter"){ e.preventDefault(); $("#confirmDlg").close("ok"); } });
applyTheme();
window.addEventListener("storage", e => { if (e.key === "apwc.theme") applyTheme(); });

if (CLIENT_UI) {
  $("#connectForm").addEventListener("submit", async e => {
    e.preventDefault();
    resetSession();
    $("#connectError").textContent = ""; $("#connectBtn").disabled = true; $("#connectBtn").textContent = "Connecting…";
    // A room page link can go in either box; work out the server address from it.
    const pasted = parseRoomUrl($("#fServer").value) ? $("#fServer").value.trim() : null;
    if (pasted) { $("#fRoom").value = pasted; }
    S.roomUrl = $("#fRoom").value.trim() || null;
    if (S.roomUrl && !parseRoomUrl(S.roomUrl)) { $("#connectError").textContent = "The room page should look like https://archipelago.gg/room/…"; $("#connectBtn").disabled = false; $("#connectBtn").textContent = "Connect"; return; }
    if (pasted) {
      $("#connectBtn").textContent = "Finding the room…";
      try { $("#fServer").value = await roomAddress(S.roomUrl); }
      catch (err) { $("#connectError").textContent = err.message; $("#connectBtn").disabled = false; $("#connectBtn").textContent = "Connect"; return; }
      $("#connectBtn").textContent = "Connecting…";
    }
    S.server = $("#fServer").value.trim(); S.slotName = $("#fSlot").value.trim(); S.password = $("#fPass").value;
    S.manualClose = false;
    try{ S.ws?.close(); }catch{}
    connect();
  });
  $("#disconnectBtn").addEventListener("click", () => { S.manualClose = true; clearTimeout(S.retryTimer); try{ S.ws?.close(); }catch{}; S.ws=null; showConnect(); document.title="Archipelago Client"; });
  $("#themeBtn").addEventListener("click", cycleTheme);
  $$("#tabs button").forEach(b => b.addEventListener("click", () => selectTab(b.dataset.tab)));
  $("#tabs").addEventListener("keydown", e => {
    if (e.key!=="ArrowRight" && e.key!=="ArrowLeft") return;
    const bs = $$("#tabs button"); const i = bs.findIndex(b=>b.dataset.tab===UI.tab);
    const n = bs[(i + (e.key==="ArrowRight"?1:-1) + bs.length) % bs.length]; selectTab(n.dataset.tab); n.focus();
  });
  $$("#feedFilter button").forEach(b => b.addEventListener("click", () => { UI.feedFilter = b.dataset.f; syncSeg("#feedFilter","f",UI.feedFilter); renderFeed(); }));
  $("#progOnly").addEventListener("change", e => { UI.progOnly = e.target.checked; renderFeed(); });
  $("#feedSearch").addEventListener("input", e => { UI.feedQuery = e.target.value.trim().toLowerCase(); renderFeed(); });
  $("#feedScroll").addEventListener("scroll", e => { const sc=e.target; if (sc.scrollHeight - sc.scrollTop - sc.clientHeight < 60) $("#jumpBtn").classList.add("hidden"); });
  $("#jumpBtn").addEventListener("click", () => { const sc=$("#feedScroll"); sc.scrollTop = sc.scrollHeight; });
  $$("#recvMode button").forEach(b => b.addEventListener("click", () => { UI.recvMode = b.dataset.m; syncSeg("#recvMode","m",UI.recvMode); renderReceived(); }));
  $("#recvProg").addEventListener("change", e => { UI.recvProg = e.target.checked; renderReceived(); });
  $("#recvSearch").addEventListener("input", e => { UI.recvQuery = e.target.value.trim().toLowerCase(); renderReceived(); });
  $$("#chkMode button").forEach(b => b.addEventListener("click", () => { UI.chkMode = b.dataset.m; syncSeg("#chkMode","m",UI.chkMode); renderChecks(); }));
  $("#chkSearch").addEventListener("input", e => { UI.chkQuery = e.target.value.trim().toLowerCase(); renderChecks(); });
  $("#scoutBtn").addEventListener("click", scout);
  $("#recvFrom").addEventListener("change", e => { UI.recvFrom = e.target.value; store.set("apwc.recvFrom", UI.recvFrom); renderReceived(); });
  UI.recvFrom = store.get("apwc.recvFrom", "all"); $("#recvFrom").value = UI.recvFrom;
  $("#recvCat").addEventListener("change", e => { UI.recvCat = e.target.checked; store.set("apwc.recvCat", UI.recvCat); renderReceived(); });
  $("#chkCat").addEventListener("change", e => { UI.chkCat = e.target.checked; store.set("apwc.chkCat", UI.chkCat); renderChecks(); });
  UI.chkLogic = store.get("apwc.chkLogic", false); $("#chkLogic").checked = UI.chkLogic;
  $("#chkLogic").addEventListener("change", e => { UI.chkLogic = e.target.checked; store.set("apwc.chkLogic", UI.chkLogic); renderChecks(); });
  window.apvic?.onLogicData?.(onLogicData);
  $("#waitingStat").addEventListener("click", () => { UI.hintHideFound = true; $("#hintHideFound").checked = true; selectTab("hints"); });
  $("#alertsBtn").addEventListener("click", openAlerts);
  $("#recapBtn").addEventListener("click", () => openRecap(false));
  $$("#cmdbar [data-cmd]").forEach(b => b.addEventListener("click", () => runQuickCommand(b.dataset.cmd)));
  UI.recvCat = store.get("apwc.recvCat", false); $("#recvCat").checked = UI.recvCat;
  UI.chkCat = store.get("apwc.chkCat", false); $("#chkCat").checked = UI.chkCat;
  $("#hintHideFound").addEventListener("change", e => { UI.hintHideFound = e.target.checked; renderHints(); });
  $("#hintSearch").addEventListener("input", e => { UI.hintQuery = e.target.value.trim().toLowerCase(); renderHints(); });
  $("#sayForm").addEventListener("submit", onSay);
  $("#sayInput").addEventListener("input", updateSuggest);
  $("#sayInput").addEventListener("keydown", onSayKey);
  // Hide the list only if focus really left the chat box (clicking "Ask for a hint…" blurs it for a moment).
  $("#sayInput").addEventListener("blur", () => setTimeout(() => { if (document.activeElement !== $("#sayInput")) hideSuggest(); }, 150));

  (() => {
    const last = store.get("apwc.last", null);
    if (last){ $("#fServer").value = last.server; $("#fSlot").value = last.slot; $("#fRoom").value = last.room || ""; }
    const qs = new URLSearchParams(location.search);
    if (qs.get("server")) { $("#fServer").value = qs.get("server"); $("#fRoom").value = qs.get("room") || ""; }
    if (qs.get("slot")) $("#fSlot").value = qs.get("slot");
    // Typing a server on another host drops a room link that belongs to a different server.
    $("#fServer").addEventListener("input", () => {
      const r = parseRoomUrl($("#fRoom").value.trim()); const host = $("#fServer").value.trim().replace(/^wss?:\/\//, "").split(":")[0].toLowerCase();
      if (r && host && !/^https?:/.test($("#fServer").value.trim()) && host !== r.host.toLowerCase()) $("#fRoom").value = "";
    });
    renderRecent();
  })();

  // Talk to the ArchipelagoVic window when this room is one of its tabs.
  if (IN_FRAME) {
    window.addEventListener("message", e => {
      if (e.source !== window.parent || !e.data || e.data.apv !== "join") return;
      const d = e.data;
      if (S.ws && S.slot) return;          // already in a room; the window opens a new tab instead
      if (d.server) $("#fServer").value = d.server;
      if (d.slot != null) $("#fSlot").value = d.slot;
      if (d.password != null) $("#fPass").value = d.password;
      if ($("#fRoom") && (d.room || d.server)) $("#fRoom").value = d.room || "";
      if (d.connect && $("#fServer").value && $("#fSlot").value) $("#connectForm").requestSubmit();
      else ($("#fSlot").value ? $("#fPass") : $("#fSlot")).focus();
    });
    postStatus();
  }
}
