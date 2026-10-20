"use strict";
/* Always-on-top mini window: your rooms and the latest items you received. */
const MAPI = window.apvic;
function ago(t){ if (!t) return ""; const s = Math.max(0, (Date.now() - t) / 1000); return s < 60 ? "now" : s < 3600 ? Math.floor(s / 60) + "m" : Math.floor(s / 3600) + "h"; }
let last = { rooms: [] };
function renderMini(d){
  last = d || last;
  const rooms = last.rooms || [];
  $("#miniRooms").replaceChildren(...rooms.map(r => h("div", { class: "mini-room" },
    h("span", { class: "status-dot" + (r.connected ? " on" : "") }), gameIcon(r.game),
    h("b", null, r.name),
    r.checks ? h("span", { class: "muted" }, `${r.checks[0]}/${r.checks[1]}`) : null,
    r.goal ? h("span", { class: "status-pill goal" }, "Goal") : r.waiting ? h("span", { class: "mini-wait", title: "Hinted key items still out there" }, `★ ${r.waiting} out there`) : null)));
  const multi = rooms.length > 1;
  const items = rooms.flatMap(r => (r.recent || []).map(x => ({ ...x, room: r.name }))).sort((a, b) => (b.t || 0) - (a.t || 0)).slice(0, 8);
  $("#miniItems").replaceChildren(...items.map(x => h("li", null,
    h("span", { class: `item ${x.cls}`, title: CLS_DESC[x.cls] }, h("i", { class: "g" }, GLYPH[x.cls]), x.item),
    h("span", { class: "mini-from" }, "from ", x.from, multi ? ` → ${x.room}` : ""),
    h("span", { class: "mini-ago" }, ago(x.t)))));
  if (rooms.length && !items.length) $("#miniItems").replaceChildren(h("li", { class: "muted" }, "No items from other players yet."));
  $("#miniEmpty").classList.toggle("hidden", rooms.length > 0);
}
if (MAPI){
  MAPI.onMiniData(renderMini);
  MAPI.miniGet().then(renderMini).catch(() => {});
  $("#miniClose").addEventListener("click", () => MAPI.miniClose());
  $("#miniOpen").addEventListener("click", () => MAPI.focusMain());
  setInterval(() => renderMini(), 30000);   // refresh the "2m ago" labels
}
