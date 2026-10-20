"use strict";
/* =========================================================
   Form view for Archipelago player YAMLs.
   Works on the file's own lines so comments, order and anything
   it doesn't understand are kept exactly as written.
   ========================================================= */
const YF = (() => {
  const unq = v => String(v ?? "").trim().replace(/^(['"])(.*)\1$/, "$2");
  const human = k => { const t = String(k).replace(/_/g, " ").replace(/-/g, " "); return t.charAt(0).toUpperCase() + t.slice(1); };
  const indentOf = l => l.match(/^ */)[0].length;

  function parse(text){
    const lines = text.replace(/\r\n/g, "\n").split("\n");
    const top = {};
    lines.forEach((l, i) => { const m = l.match(/^(name|description|game):(.*)$/); if (m && !top[m[1]]) top[m[1]] = { i, value: unq(m[2].replace(/\s+#.*$/, "")) }; });
    const out = { lines, top, groups: [], error: null };
    if (!top.game) { out.error = "This file has no game: line, so only the text view is available."; return out; }
    const game = top.game.value;
    if (!game) { out.error = "This file chooses between several games by weight. Edit it in the text view."; return out; }
    const gi = lines.findIndex(l => !/^\s/.test(l) && [game + ":", `'${game}':`, `"${game}":`].includes(l.replace(/\s+#.*$/, "").trimEnd()));
    if (gi < 0) { out.error = `This file has no "${game}:" section with options.`; return out; }
    out.game = game;
    let group = { title: "Options", options: [] }; out.groups.push(group);
    let i = gi + 1;
    while (i < lines.length) {
      const l = lines[i];
      if (l.trim() && !/^\s/.test(l) && !l.startsWith("#")) break;          // next top-level key ends the game section
      const head = l.match(/^ {2}# (.+?) #\s*$/);
      if (head && /^ {2}#+\s*$/.test(lines[i - 1] || "")) { group = { title: head[1].trim(), options: [] }; out.groups.push(group); i++; continue; }
      const om = l.match(/^ {2}([^\s#'"][^:]*|'[^']+'|"[^"]+"):(.*)$/);
      if (!om) { i++; continue; }
      const opt = { key: unq(om[1]), line: i, inline: om[2].replace(/\s+#.*$/, "").trim(), desc: [], choices: [], raw: [], bodyStart: i + 1, bodyEnd: i + 1 };
      let j = i + 1;
      while (j < lines.length && (!lines[j].trim() || indentOf(lines[j]) >= 4)) {
        const b = lines[j];
        if (!b.trim()) { if (j + 1 < lines.length && lines[j + 1].trim() && indentOf(lines[j + 1]) < 4) break; j++; continue; }
        const c = b.match(/^ {4}#\s?(.*)$/);
        const ch = b.match(/^( {4})([^#\s][^:]*?):\s*(-?\d+(?:\.\d+)?)\s*(#.*)?$/);
        if (c) opt.desc.push(c[1]);
        else if (ch && opt.raw.length === 0) opt.choices.push({ i: j, raw: ch[2], key: unq(ch[2]), weight: Number(ch[3]), comment: ch[4] || "" });
        else opt.raw.push(j);
        j++;
      }
      opt.bodyEnd = j;
      const min = opt.desc.join("\n").match(/Minimum value is (-?\d+)/), max = opt.desc.join("\n").match(/Maximum value is (-?\d+)/);
      if (min && max) opt.range = [Number(min[1]), Number(max[1])];
      opt.kind = opt.inline ? "inline" : opt.raw.length ? "raw" : opt.choices.length ? "choice" : "raw";
      group.options.push(opt);
      i = j;
    }
    out.groups = out.groups.filter(g => g.options.length);
    return out;
  }

  // Edits (all return new text)
  function setTop(model, field, value){
    const L = [...model.lines];
    const v = String(value).replace(/[\r\n]/g, " ");
    if (model.top[field]) L[model.top[field].i] = `${field}: ${v}`;
    else L.splice(0, 0, `${field}: ${v}`);
    return L.join("\n");
  }
  function choose(model, opt, key){
    const L = [...model.lines];
    for (const c of opt.choices) L[c.i] = `    ${c.raw}: ${c.key === key ? 50 : 0}${c.comment ? " " + c.comment : ""}`;
    return L.join("\n");
  }
  function setNumber(model, opt, n){
    const exact = opt.choices.find(c => /^-?\d+$/.test(c.key) && Number(c.key) === n);
    if (exact) return choose(model, opt, exact.key);
    const L = [...model.lines];
    const num = opt.choices.find(c => /^-?\d+$/.test(c.key));
    for (const c of opt.choices) L[c.i] = `    ${c.raw}: 0${c.comment ? " " + c.comment : ""}`;
    if (num) L[num.i] = `    ${n}: 50`;
    else L.splice(opt.choices.length ? opt.choices[0].i : opt.bodyEnd, 0, `    ${n}: 50`);
    return L.join("\n");
  }
  function setInline(model, opt, value){
    const L = [...model.lines];
    L[opt.line] = `  ${model.lines[opt.line].match(/^ {2}([^:]+):/)[1]}: ${value}`;
    return L.join("\n");
  }
  function setRaw(model, opt, text){
    const L = [...model.lines];
    const first = opt.raw.length ? opt.raw[0] : opt.bodyEnd, last = opt.raw.length ? opt.raw[opt.raw.length - 1] : opt.bodyEnd - 1;
    const body = String(text).replace(/\r\n/g, "\n").split("\n").filter((x, k, a) => x.trim() || k < a.length - 1).map(x => "    " + x);
    L.splice(first, Math.max(0, last - first + 1), ...(body.length ? body : ["    []"]));
    return L.join("\n");
  }

  function render(container, text, onChange){
    const model = parse(text);
    container.replaceChildren();
    if (model.error) { container.append(h("div", { class: "empty", style: "text-align:left;padding:20px 4px" }, h("b", null, "Use the text view for this file"), model.error)); return model; }
    const commit = t => onChange(t);
    // Slot name + description
    const name = h("input", { class: "input", maxlength: "16", value: model.top.name?.value || "", "aria-label": "Slot name" });
    name.addEventListener("change", () => commit(setTop(model, "name", name.value.trim() || "Player")));
    const desc = h("input", { class: "input", value: model.top.description?.value || "", "aria-label": "Description" });
    desc.addEventListener("change", () => commit(setTop(model, "description", desc.value.trim())));
    container.append(h("div", { class: "yf-top" },
      gameIcon(model.game, "lg"), h("div", { class: "yf-game" }, h("b", null, model.game), h("span", { class: "muted" }, "Game")),
      h("label", { class: "field" }, h("span", null, "Slot name"), name),
      h("label", { class: "field" }, h("span", null, "Description"), desc)));
    const search = h("input", { class: "input search", type: "search", placeholder: "Find an option", "aria-label": "Find an option" });
    container.append(search);
    const list = h("div", { class: "yf-list" });
    container.append(list);
    for (const g of model.groups) {
      const sec = h("section", { class: "yf-group" }, h("h3", null, g.title));
      for (const o of g.options) sec.append(optionRow(model, o, commit));
      list.append(sec);
    }
    search.addEventListener("input", () => {
      const q = search.value.trim().toLowerCase();
      for (const row of list.querySelectorAll(".yf-opt")) row.classList.toggle("hidden", q && !row.dataset.search.includes(q));
      for (const sec of list.querySelectorAll(".yf-group")) sec.classList.toggle("hidden", ![...sec.querySelectorAll(".yf-opt")].some(r => !r.classList.contains("hidden")));
    });
    return model;
  }

  function optionRow(model, o, commit){
    const descText = o.desc.filter(d => !/^(You can define additional values|Minimum value is|Maximum value is)/.test(d)).join("\n").trim();
    const first = descText.split(/\n\s*\n|\n(?=\S)/)[0] || "";
    const row = h("div", { class: "yf-opt", "data-search": (o.key + " " + descText).toLowerCase() });
    const label = h("div", { class: "yf-label" }, h("b", null, human(o.key)), h("code", null, o.key));
    let control;
    if (o.kind === "choice") {
      const on = o.choices.filter(c => c.weight > 0);
      if (on.length > 1) {
        const total = on.reduce((a, c) => a + c.weight, 0);
        control = h("div", { class: "yf-weighted" },
          h("span", null, "Random by weight: ", on.map(c => `${human(c.key)} ${Math.round(100 * c.weight / total)}%`).join(", ")),
          h("button", { type: "button", class: "btn small", onclick: () => commit(choose(model, o, on.sort((a, b) => b.weight - a.weight)[0].key)) }, "Pick one instead"));
      } else {
        const sel = h("select", { class: "input", "aria-label": human(o.key) },
          !on.length ? h("option", { value: "", selected: true }, "—") : null,
          o.choices.map(c => h("option", { value: c.key, selected: on[0] && c.key === on[0].key }, /^-?\d+$/.test(c.key) ? c.key : human(c.key) + (c.comment ? "  " + c.comment.replace(/^#\s*/, "(") + ")" : ""))));
        sel.addEventListener("change", () => sel.value && commit(choose(model, o, sel.value)));
        control = [sel];
        if (o.range) {
          const cur = on[0] && /^-?\d+$/.test(on[0].key) ? on[0].key : "";
          const num = h("input", { class: "input yf-num", type: "number", min: o.range[0], max: o.range[1], value: cur, placeholder: `${o.range[0]}–${o.range[1]}`, "aria-label": `${human(o.key)} number` });
          num.addEventListener("change", () => {
            const n = Math.round(Number(num.value));
            if (!Number.isFinite(n) || n < o.range[0] || n > o.range[1]) { toast(`Pick a number from ${o.range[0]} to ${o.range[1]}.`); return; }
            commit(setNumber(model, o, n));
          });
          control.push(h("span", { class: "muted" }, "or"), num);
        }
        control = h("div", { class: "yf-ctl" }, control);
      }
    } else if (o.kind === "inline") {
      const inp = h("input", { class: "input", value: o.inline, "aria-label": human(o.key) });
      inp.addEventListener("change", () => commit(setInline(model, o, inp.value.trim() || "''")));
      control = inp;
    } else {
      const ta = h("textarea", { class: "input mono yf-raw", rows: Math.min(8, Math.max(2, o.raw.length)), spellcheck: "false", "aria-label": human(o.key) }, o.raw.map(i => model.lines[i].replace(/^ {4}/, "")).join("\n"));
      ta.addEventListener("change", () => commit(setRaw(model, o, ta.value)));
      control = ta;
    }
    row.append(label, control);
    if (first) {
      const more = descText.length > first.length + 2;
      const d = h("div", { class: "yf-desc" }, first);
      if (more) {
        const btn = h("button", { type: "button", class: "linkish" }, "More");
        btn.addEventListener("click", () => { d.textContent = descText; d.classList.add("open"); });
        d.append(" ", btn);
      }
      row.append(d);
    }
    return row;
  }
  return { parse, render, choose, setNumber, setInline, setRaw, setTop };
})();
