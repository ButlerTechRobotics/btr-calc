import * as K from "./core.js";

const APP_VERSION = "1.0.0";
const FEEDBACK_FORM = { url: "https://docs.google.com/forms/d/e/1FAIpQLSfihwn0PhqjO7_eB-7FL9mABb6EAt8gyWebTeqDKisLRPVrhw/viewform",
  fields: { type: "entry.1585987477", message: "entry.1619535286", name: "entry.1839315041", details: "entry.1766221737" } };

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const f3 = (v) => (isFinite(v) ? v.toFixed(3) : "—");
const f2 = (v) => (isFinite(v) ? v.toFixed(2) : "—");
const f1 = (v) => (isFinite(v) ? v.toFixed(1) : "—");
const num = (el, d) => { const v = parseFloat(el.value); return isFinite(v) ? v : d; };
const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
let toastT;
function toast(msg) { const t = $("toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), 2200); }
function download(name, text, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const STAGE_COLORS = ["--s1", "--s2", "--s3", "--s4", "--s5", "--s6"];

// ---------------------------------------------------------------- data
const P = await fetch("./wcp-parts.json").then((r) => r.json());
const BY_SKU = new Map();
for (const k of ["gears", "pulleys", "belts", "sprockets", "chain", "bearings"]) for (const p of P[k]) BY_SKU.set(p.sku, p);
const MOTORS = Object.fromEntries(P.motors.map((m) => [m.id, m]));
$("version").textContent = "BTR Calc v" + APP_VERSION;
$("dataNote").textContent = `WCP parts list read from wcproducts.com on ${P.updated}. Check prices and stock before ordering.`;

// Which part bores fit a shaft
const SHAFTS = {
  // A rounded-hex shaft fits a sharp-hex bore, but a sharp-hex shaft won't go into a rounded-hex bore.
  "1/2hex": { label: '1/2" hex', fits: ["1/2hex"], radius: 0.29, bearing: "WCP-0783" },
  "1/2hex-r": { label: '1/2" rounded hex', fits: ["1/2hex", "1/2hex-r"], radius: 0.28, bearing: "WCP-0785" },
  "3/8hex": { label: '3/8" hex', fits: ["3/8hex"], radius: 0.22, bearing: "WCP-1507" },
  "3/8hex-r": { label: '3/8" rounded hex', fits: ["3/8hex", "3/8hex-r"], radius: 0.21, bearing: "WCP-0784" },
  splinexl: { label: "SplineXL", fits: ["splinexl"], radius: 0.6, bearing: null },
  splinexs: { label: "SplineXS (Kraken)", fits: ["splinexs"], radius: 0.16 },
  "8mmkey": { label: "8 mm keyed", fits: ["8mmkey"], radius: 0.16 },
  falcon: { label: "Falcon spline", fits: ["falcon"], radius: 0.16 },
};
const SHAFT_HOLE_DEFAULT = { splinexl: 1.5 };   // SplineXL runs in bearing blocks; the plate hole is up to you
const EFF = { gear: 0.97, belt: 0.98, chain: 0.97 };
const PLD = { HTD5: K.BELT.HTD5.pld, GT2: K.BELT.GT2.pld };

// ---------------------------------------------------------------- tabs
function showTab(name) {
  for (const b of document.querySelectorAll("nav.tabs button")) b.setAttribute("aria-selected", String(b.dataset.tab === name));
  for (const v of document.querySelectorAll(".view")) v.hidden = v.id !== "view-" + name;
  store.set("btr.calc.tab", name);
  if (location.hash.startsWith("#d=") && name !== "gearbox") history.replaceState(null, "", location.pathname);
}
for (const b of document.querySelectorAll("nav.tabs button")) b.addEventListener("click", () => showTab(b.dataset.tab));

// ---------------------------------------------------------------- drawing helpers (SVG, inches, y up)
function svgFrame(bounds, pad = 0.4, maxW = 900) {
  const [minx, miny, maxx, maxy] = bounds;
  const w = maxx - minx + 2 * pad, h = maxy - miny + 2 * pad;
  const X = (x) => x - minx + pad, Y = (y) => maxy - y + pad;
  return { w, h, X, Y, open: `<svg class="draw" viewBox="0 0 ${w.toFixed(4)} ${h.toFixed(4)}" style="max-height:${Math.max(260, Math.min(620, 900 * h / w))}px" role="img">`, close: "</svg>" };
}
const circ = (F, c, r, attrs) => `<circle cx="${F.X(c[0]).toFixed(4)}" cy="${F.Y(c[1]).toFixed(4)}" r="${Math.max(r, 0.001).toFixed(4)}" vector-effect="non-scaling-stroke" ${attrs}/>`;
const line = (F, a, b, attrs) => `<line x1="${F.X(a[0]).toFixed(4)}" y1="${F.Y(a[1]).toFixed(4)}" x2="${F.X(b[0]).toFixed(4)}" y2="${F.Y(b[1]).toFixed(4)}" vector-effect="non-scaling-stroke" ${attrs}/>`;
const text = (F, p, s, size, attrs = "") => `<text x="${F.X(p[0]).toFixed(4)}" y="${F.Y(p[1]).toFixed(4)}" font-size="${size}" ${attrs}>${esc(s)}</text>`;
// outer tangent lines of two circles (for belts/chains)
function tangents(c1, r1, c2, r2) {
  const dx = c2[0] - c1[0], dy = c2[1] - c1[1], d = Math.hypot(dx, dy);
  if (d <= Math.abs(r2 - r1)) return [];
  const a = Math.atan2(dy, dx), b = Math.acos((r1 - r2) / d);
  return [a + b, a - b].map((t) => [[c1[0] + r1 * Math.cos(t), c1[1] + r1 * Math.sin(t)], [c2[0] + r2 * Math.cos(t), c2[1] + r2 * Math.sin(t)]]);
}
function pairDrawing(c, a, b, kind) {
  // a, b: {r (pitch), od, label}; kind: gear | belt | chain
  const ra = Math.max(a.r, a.od / 2), rb = Math.max(b.r, b.od / 2);
  const F = svgFrame([-ra, -Math.max(ra, rb), c + rb, Math.max(ra, rb)], 0.35);
  const s1 = css("--s1"), s2 = css("--s2"), ink = css("--plate-line");
  let s = F.open;
  if (kind !== "gear") for (const [p, q] of tangents([0, 0], a.r, [c, 0], b.r)) s += line(F, p, q, `stroke="${ink}" stroke-width="2"`);
  s += circ(F, [0, 0], a.od / 2, `fill="${s1}22" stroke="${s1}" stroke-width="1.5"`) + circ(F, [0, 0], a.r, `fill="none" stroke="${s1}" stroke-dasharray="4 3" stroke-width="1"`);
  s += circ(F, [c, 0], b.od / 2, `fill="${s2}22" stroke="${s2}" stroke-width="1.5"`) + circ(F, [c, 0], b.r, `fill="none" stroke="${s2}" stroke-dasharray="4 3" stroke-width="1"`);
  s += circ(F, [0, 0], 0.04, `fill="${ink}"`) + circ(F, [c, 0], 0.04, `fill="${ink}"`);
  s += line(F, [0, -Math.max(ra, rb) - 0.15], [c, -Math.max(ra, rb) - 0.15], `stroke="${ink}" stroke-width="1"`);
  s += text(F, [c / 2, -Math.max(ra, rb) - 0.08], `${f3(c)}"`, Math.max(0.18, c / 30), `text-anchor="middle" fill="${css("--ink")}"`);
  s += text(F, [0, a.od / 2 + 0.08], a.label, Math.max(0.18, c / 30), `text-anchor="middle" fill="${s1}"`);
  s += text(F, [c, b.od / 2 + 0.08], b.label, Math.max(0.18, c / 30), `text-anchor="middle" fill="${s2}"`);
  return s + F.close;
}
function skuList(parts, empty = "Not a WCP size.") {
  if (!parts.length) return `<div class="skus">${esc(empty)}</div>`;
  return `<div class="skus">${parts.slice(0, 8).map((p) => `<div><a href="${p.url}" target="_blank" rel="noopener">${p.sku}</a> ${esc(p.name)}${p.price ? ` · $${p.price.toFixed(2)}` : ""}</div>`).join("")}${parts.length > 8 ? `<div>…and ${parts.length - 8} more in the WCP parts tab</div>` : ""}</div>`;
}
const msgs = (el, list) => { el.innerHTML = list.map((m) => `<li class="${m.level || ""}">${esc(m.text || m)}</li>`).join(""); };
const stat = (v, label) => `<div class="stat"><b>${v}</b><span>${label}</span></div>`;

// ---------------------------------------------------------------- CHAIN tab
function chainSetup() {
  const saved = JSON.parse(store.get("btr.calc.chain") || "null") || { size: "25", a: 16, b: 32, c: 6, extra: 0 };
  $("chSize").value = saved.size; $("chA").value = saved.a; $("chB").value = saved.b; $("chC").value = saved.c; $("chExtra").value = saved.extra;
  for (const id of ["chSize", "chA", "chB", "chC", "chExtra"]) $(id).addEventListener("input", chainRender);
  chainRender();
}
function chainRender() {
  const size = $("chSize").value, pitch = K.CHAIN_PITCH[size];
  const a = Math.round(num($("chA"), 16)), b = Math.round(num($("chB"), 32)), c = num($("chC"), 6), extra = num($("chExtra"), 0);
  store.set("btr.calc.chain", JSON.stringify({ size, a, b, c, extra }));
  const chainKey = size === "25H" ? "25" : size;
  const teeth = [...new Set(P.sprockets.filter((s) => s.chain === chainKey).map((s) => s.teeth))].sort((x, y) => x - y);
  $("chTeeth").innerHTML = teeth.map((t) => `<option value="${t}">`).join("");
  $("chSkus").innerHTML = `<p class="muted" style="margin:10px 0 2px">WCP sprockets, ${a}t:</p>` + skuList(P.sprockets.filter((s) => s.chain === chainKey && s.teeth === a)) +
    `<p class="muted" style="margin:10px 0 2px">WCP sprockets, ${b}t:</p>` + skuList(P.sprockets.filter((s) => s.chain === chainKey && s.teeth === b));
  if (!(a >= 6 && b >= 6 && c > 0)) { $("chTable").innerHTML = ""; return; }
  const { ideal, options } = K.chainOptions(a, b, c, pitch);
  const best = options.find((o) => o.even) || options[0];
  $("chStats").innerHTML = stat(`${f2(Math.max(a, b) / Math.min(a, b))}:1`, a <= b ? "reduction" : "overdrive") + stat(f1(ideal), "links at target") +
    (best ? stat(best.links, "links (best even)") + stat(f3(best.C + extra) + '"', "centre distance") : "");
  $("chTable").innerHTML = `<tr><th class="num">Links</th><th></th><th class="num">Centre distance</th><th class="num">vs target</th><th class="num">Chain length</th><th class="num">Wrap on ${Math.min(a, b)}t</th></tr>` +
    options.slice(0, 6).sort((x, y) => x.links - y.links).map((o) => `<tr class="${o === best ? "best" : ""}"><td class="num">${o.links}</td><td>${o.even ? '<span class="pill ok">even</span>' : '<span class="pill warn">needs half link</span>'}</td><td class="num">${f3(o.C + extra)}" <span class="muted">(${f1((o.C + extra) * 25.4)} mm)</span></td><td class="num">${o.delta >= 0 ? "+" : ""}${f3(o.delta)}"</td><td class="num">${f2(o.links * pitch)}"</td><td class="num">${o.run ? f1(o.run.wrapDeg) + "°" : "—"}</td></tr>`).join("");
  msgs($("chWarn"), best && best.run ? best.run.warnings.map((t) => ({ text: t })) : []);
  if (best && best.run) {
    const [s, l] = a <= b ? [a, b] : [b, a];
    $("chDraw").innerHTML = pairDrawing(best.C + extra, { r: K.sprocketPD(a, pitch) / 2, od: K.sprocketOD(a, pitch), label: `${a}t` }, { r: K.sprocketPD(b, pitch) / 2, od: K.sprocketOD(b, pitch), label: `${b}t` }, "chain") +
      `<p class="muted" style="font-size:12.5px;margin:6px 0 0">Pitch diameters ${f3(K.sprocketPD(s, pitch))}" and ${f3(K.sprocketPD(l, pitch))}". Outside diameters about ${f3(K.sprocketOD(s, pitch))}" and ${f3(K.sprocketOD(l, pitch))}".</p>`;
  }
}

// ---------------------------------------------------------------- BELT tab
function beltSetup() {
  const saved = JSON.parse(store.get("btr.calc.belt") || "null") || { profile: "HTD5", width: 9, a: 18, b: 36, c: 5, extra: 0 };
  $("btProfile").value = saved.profile; $("btWidth").value = saved.width; $("btA").value = saved.a; $("btB").value = saved.b; $("btC").value = saved.c; $("btExtra").value = saved.extra;
  for (const id of ["btProfile", "btWidth", "btA", "btB", "btC", "btExtra"]) $(id).addEventListener("input", beltRender);
  beltRender();
}
function beltRender() {
  const profile = $("btProfile").value, width = +$("btWidth").value;
  const a = Math.round(num($("btA"), 18)), b = Math.round(num($("btB"), 36)), c = num($("btC"), 5), extra = num($("btExtra"), 0);
  store.set("btr.calc.belt", JSON.stringify({ profile, width, a, b, c, extra }));
  const pulleys = P.pulleys.filter((p) => p.profile === profile && p.widthMm === width);
  $("btTeeth").innerHTML = [...new Set(pulleys.map((p) => p.teeth))].sort((x, y) => x - y).map((t) => `<option value="${t}">`).join("");
  $("btSkus").innerHTML = `<p class="muted" style="margin:10px 0 2px">WCP pulleys, ${a}t × ${width} mm:</p>` + skuList(pulleys.filter((p) => p.teeth === a)) +
    `<p class="muted" style="margin:10px 0 2px">WCP pulleys, ${b}t × ${width} mm:</p>` + skuList(pulleys.filter((p) => p.teeth === b));
  if (!(a >= 8 && b >= 8 && c > 0)) return;
  const belts = P.belts.filter((x) => x.profile === profile && x.widthMm === width && !x.double);
  const { ideal, options } = K.beltOptions(a, b, c, profile, belts, extra);
  const best = options[0];
  $("btStats").innerHTML = stat(`${f2(Math.max(a, b) / Math.min(a, b))}:1`, a <= b ? "reduction" : "overdrive") + stat(f1(ideal), "belt teeth at target") +
    (best ? stat(best.belt.teeth + "t", "closest WCP belt") + stat(f3(best.C) + '"', "centre distance") : stat("—", "no WCP belt fits"));
  $("btTable").innerHTML = `<tr><th>Belt</th><th class="num">Centre distance</th><th class="num">vs target</th><th class="num">Teeth in mesh</th><th></th></tr>` +
    options.slice(0, 6).map((o) => `<tr class="${o === best ? "best" : ""}"><td><a href="${o.belt.url}" target="_blank" rel="noopener" class="mono">${o.belt.sku}</a> ${o.belt.teeth}t</td><td class="num">${f3(o.C)}" <span class="muted">(${f1(o.C * 25.4)} mm)</span></td><td class="num">${o.delta >= 0 ? "+" : ""}${f3(o.delta)}"</td><td class="num">${f1(o.run.inMesh)}</td><td>${o.run.warnings.length ? '<span class="pill warn">check</span>' : ""}</td></tr>`).join("");
  msgs($("btWarn"), best ? best.run.warnings.map((t) => ({ text: t })) : [{ text: "No WCP belt of this profile and width works for these pulleys.", level: "bad" }]);
  if (best) {
    const pm = K.BELT[profile].pitchMm;
    $("btDraw").innerHTML = pairDrawing(best.C, { r: K.pulleyPD(a, pm) / 2, od: K.pulleyOD(a, profile), label: `${a}t` }, { r: K.pulleyPD(b, pm) / 2, od: K.pulleyOD(b, profile), label: `${b}t` }, "belt") +
      `<p class="muted" style="font-size:12.5px;margin:6px 0 0">Pitch diameters ${f3(K.pulleyPD(a, pm))}" and ${f3(K.pulleyPD(b, pm))}".</p>`;
  }
}

// ---------------------------------------------------------------- GEARS tab
function gearsSetup() {
  const saved = JSON.parse(store.get("btr.calc.gears") || "null") || { dp: 20, a: 12, acd: "", b: 60, extra: 0.003 };
  $("gpDp").value = saved.dp; $("gpA").value = saved.a; $("gpAcd").value = saved.acd; $("gpB").value = saved.b; $("gpExtra").value = saved.extra;
  for (const id of ["gpDp", "gpA", "gpAcd", "gpB", "gpExtra"]) $(id).addEventListener("input", gearsRender);
  gearsRender();
}
function gearsRender() {
  const dp = +$("gpDp").value, a = Math.round(num($("gpA"), 12)), acd = Math.round(num($("gpAcd"), 0)) || null, b = Math.round(num($("gpB"), 60)), extra = num($("gpExtra"), 0);
  store.set("btr.calc.gears", JSON.stringify({ dp, a, acd: acd || "", b, extra }));
  if (!(a >= 4 && b >= 4)) return;
  const c = K.gearCenter({ teeth: a, cdTeeth: acd }, { teeth: b }, dp, extra);
  $("gpStats").innerHTML = stat(`${f2(Math.max(a, b) / Math.min(a, b))}:1`, a <= b ? "reduction" : "overdrive") + stat(f3(c) + '"', "centre distance") + stat(f2(c * 25.4), "mm");
  $("gpTable").innerHTML = `<tr><th>Gear</th><th class="num">Pitch dia.</th><th class="num">Outside dia.</th></tr>` +
    [[a, acd], [b, null]].map(([t, cd]) => `<tr><td>${t}t${cd ? ` <span class="muted">(spaces like ${cd}t)</span>` : ""}</td><td class="num">${f3(K.gearPD(t, dp))}"</td><td class="num">${f3(K.gearOD(t, dp))}"</td></tr>`).join("");
  const fit = (t, cd) => P.gears.filter((g) => g.dp === dp && g.teeth === t && (g.cdTeeth || null) === (cd || null));
  $("gpSkus").innerHTML = `<p class="muted" style="margin:10px 0 2px">WCP gears, ${a}t${acd ? ` (${acd}t spacing)` : ""}:</p>` + skuList(fit(a, acd)) + `<p class="muted" style="margin:10px 0 2px">WCP gears, ${b}t:</p>` + skuList(fit(b, null));
  const ra = (acd || a) / dp / 2, rb = b / dp / 2;
  $("gpDraw").innerHTML = pairDrawing(c, { r: ra, od: K.gearOD(a, dp), label: `${a}t` }, { r: rb, od: K.gearOD(b, dp), label: `${b}t` }, "gear");
}

// ---------------------------------------------------------------- PARTS tab
function partsSetup() {
  $("partsIntro").textContent = `Every WCP gear, pulley, belt, sprocket, chain part and bearing the calculators use (${P.gears.length} gears, ${P.pulleys.length} pulleys, ${P.belts.length} belts, ${P.sprockets.length} sprockets). Read from wcproducts.com on ${P.updated}.`;
  for (const id of ["ptKind", "ptBore", "ptSearch"]) $(id).addEventListener("input", partsRender);
  $("ptKind").addEventListener("change", () => { $("ptBore").value = ""; partsRender(); });
  partsRender();
}
function partsRender() {
  const kind = $("ptKind").value, q = $("ptSearch").value.trim().toLowerCase();
  if (kind === "motors") {
    $("ptBore").hidden = true;
    $("ptTable").innerHTML = `<tr><th>Motor</th><th>Mode</th><th class="num">Free speed</th><th class="num">Stall torque</th><th class="num">Stall current</th><th class="num">Free current</th><th>Shaft</th><th>Mounting</th></tr>` +
      P.motors.flatMap((m) => Object.values(m.modes).map((md) => `<tr><td>${m.name}</td><td>${md.label}</td><td class="num">${md.freeRPM} RPM</td><td class="num">${md.stallNm} N·m</td><td class="num">${md.stallA} A</td><td class="num">${md.freeA} A</td><td>${esc(m.shaftNote)}</td><td>${esc(m.mount.holesNote)}; ${m.mount.pilot}" pilot boss <a href="${m.source}" target="_blank" rel="noopener">source</a></td></tr>`)).join("");
    $("ptCount").textContent = "";
    return;
  }
  const list = P[kind];
  const bores = [...new Set(list.map((p) => p.bore || p.profile || p.chain).filter(Boolean))];
  $("ptBore").hidden = false;
  if (!$("ptBore").options.length || $("ptBore").dataset.kind !== kind) {
    $("ptBore").innerHTML = `<option value="">All</option>` + bores.map((b) => `<option value="${esc(b)}">${esc(P.bores[b] || (kind === "sprockets" || kind === "chain" ? "#" + b : b))}</option>`).join("");
    $("ptBore").dataset.kind = kind;
  }
  const bf = $("ptBore").value;
  const rows = list.filter((p) => (!bf || (p.bore || p.profile || p.chain) === bf) && (!q || (p.sku + " " + p.name + " " + (p.teeth ? p.teeth + "t" : "")).toLowerCase().includes(q)));
  $("ptCount").textContent = `${rows.length} parts`;
  $("ptTable").innerHTML = `<tr><th>Part</th><th>Description</th><th class="num">Teeth</th><th class="num">Price</th></tr>` +
    rows.slice(0, 400).map((p) => `<tr><td><a class="mono" href="${p.url || "https://wcproducts.com/search?q=" + p.sku}" target="_blank" rel="noopener">${p.sku}</a></td><td>${esc(p.name)}</td><td class="num">${p.teeth || ""}</td><td class="num">${p.price ? "$" + p.price.toFixed(2) : ""}</td></tr>`).join("");
}

// ---------------------------------------------------------------- GEARBOX designer
const DEFAULT_DESIGN = () => ({
  v: 1,
  motor: { id: "x60", mode: "trap", count: 1, limit: 40, shaft: "splinexs" },
  stages: [
    { type: "gear", driver: "WCP-1350", driven: "WCP-0715", shaft: "1/2hex", angle: 0, plane: 1, adder: 0.003 },
    { type: "gear", driver: "WCP-0733", driven: "WCP-0720", shaft: "1/2hex", angle: 90, plane: 2, adder: 0.003 },
  ],
  mech: { type: "none", dia: 4, armLen: 20, mass: 5 },
  plate: { margin: 0.5, holes: 2, motorRot: null, plates: 2 },   // motorRot null = 90° off stage 1
  show: { pitch: true, od: true, plate: true },
});
let D = loadDesign();

function loadDesign() {
  const h = location.hash.match(/^#d=([A-Za-z0-9_-]+)/);
  if (h) {
    try { const d = JSON.parse(decodeURIComponent(escape(atob(h[1].replace(/-/g, "+").replace(/_/g, "/"))))); if (d && d.stages) { showTab("gearbox"); return fixDesign(d); } } catch (e) { toast("That share link could not be read."); }
  }
  try { const d = JSON.parse(store.get("btr.calc.gearbox") || "null"); if (d && d.stages) return fixDesign(d); } catch (e) {}
  return DEFAULT_DESIGN();
}
function fixDesign(d) {
  const base = DEFAULT_DESIGN();
  return { ...base, ...d, motor: { ...base.motor, ...d.motor }, mech: { ...base.mech, ...d.mech }, plate: { ...base.plate, ...d.plate }, show: { ...base.show, ...d.show } };
}
function saveDesign() { store.set("btr.calc.gearbox", JSON.stringify(D)); }
function shareLink() { return location.origin + location.pathname + "#d=" + btoa(unescape(encodeURIComponent(JSON.stringify(D)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }

const shaftTypeOf = (i) => (i === 0 ? D.motor.shaft : D.stages[i - 1].shaft);
const fits = (part, shaft) => part && SHAFTS[shaft] && SHAFTS[shaft].fits.includes(part.bore);
function partsFor(stage, side) {
  const shaft = side === "driver" ? shaftTypeOf(D.stages.indexOf(stage)) : stage.shaft;
  if (stage.type === "gear") return P.gears.filter((g) => g.dp === 20 && fits(g, shaft));
  if (stage.type === "belt") {
    const other = BY_SKU.get(side === "driver" ? stage.driven : stage.driver);
    return P.pulleys.filter((p) => fits(p, shaft) && (!other || other.kind !== "pulley" || (p.profile === other.profile && p.widthMm === other.widthMm)));
  }
  const chain = stage.chain || "25";
  return P.sprockets.filter((s) => s.chain === (chain === "25H" ? "25" : chain) && fits(s, shaft));
}
function pickDefault(list, prefer) { return (list.find(prefer) || list[0] || {}).sku || ""; }

// Per-stage geometry
function stageGeom(st) {
  const a = BY_SKU.get(st.driver), b = BY_SKU.get(st.driven);
  if (!a || !b) return { ok: false, why: "Pick both parts." };
  const ratio = b.teeth / a.teeth;
  if (st.type === "gear") {
    const C = K.gearCenter(a, b, 20, st.adder ?? 0.003);
    return { ok: true, ratio, C, a: { pd: (a.cdTeeth || a.teeth) / 20, od: K.gearOD(a.teeth, 20) }, b: { pd: b.teeth / 20, od: K.gearOD(b.teeth, 20) }, warnings: [] };
  }
  if (st.type === "belt") {
    if (a.profile !== b.profile || a.widthMm !== b.widthMm) return { ok: false, why: "Pulleys must be the same profile and width." };
    const pm = K.BELT[a.profile].pitchMm;
    const belt = BY_SKU.get(st.belt);
    if (!belt) return { ok: false, why: "Pick a belt." };
    const C = K.beltCenterForTeeth(a.teeth, b.teeth, belt.teeth, pm) + (st.extra || 0);
    const run = K.beltRun(a.teeth, b.teeth, C, a.profile);
    if (!isFinite(C) || !run) return { ok: false, why: "That belt is too short for these pulleys." };
    return { ok: true, ratio, C, belt, run, a: { pd: K.pulleyPD(a.teeth, pm), od: K.pulleyOD(a.teeth, a.profile) }, b: { pd: K.pulleyPD(b.teeth, pm), od: K.pulleyOD(b.teeth, b.profile) }, warnings: run.warnings };
  }
  const pitch = K.CHAIN_PITCH[st.chain || "25"];
  const links = Math.round(st.links || 0);
  const C = K.chainCenterForLinks(a.teeth, b.teeth, links, pitch) + (st.extra || 0);
  const run = K.chainRun(a.teeth, b.teeth, C, pitch);
  if (!isFinite(C) || !run) return { ok: false, why: "Too few links for these sprockets." };
  const warnings = [...run.warnings];
  if (links % 2) warnings.push(`${links} links is odd: you'll need a half link.`);
  return { ok: true, ratio, C, links, run, a: { pd: K.sprocketPD(a.teeth, pitch), od: K.sprocketOD(a.teeth, pitch) }, b: { pd: K.sprocketPD(b.teeth, pitch), od: K.sprocketOD(b.teeth, pitch) }, warnings };
}

// belts/chains: choose a sensible default length for new parts (smallest that clears both wheels by ~0.4")
function defaultBelt(st) {
  const a = BY_SKU.get(st.driver), b = BY_SKU.get(st.driven);
  if (!a || !b) return "";
  const belts = P.belts.filter((x) => x.profile === a.profile && x.widthMm === a.widthMm && !x.double);
  const want = (K.pulleyOD(a.teeth, a.profile) + K.pulleyOD(b.teeth, b.profile)) / 2 + 0.6;
  const o = K.beltOptions(a.teeth, b.teeth, want, a.profile, belts).options.filter((x) => x.C >= want - 0.05).sort((x, y) => x.C - y.C)[0];
  return o ? o.belt.sku : "";
}
function defaultLinks(st) {
  const a = BY_SKU.get(st.driver), b = BY_SKU.get(st.driven);
  if (!a || !b) return 0;
  const pitch = K.CHAIN_PITCH[st.chain || "25"];
  const want = (K.sprocketOD(a.teeth, pitch) + K.sprocketOD(b.teeth, pitch)) / 2 + 0.75;
  let L = Math.ceil(K.chainLinks(a.teeth, b.teeth, want, pitch));
  if (L % 2) L++;
  return L;
}

function addStage(type) {
  const i = D.stages.length, prevShaft = shaftTypeOf(i);
  const st = { type, driver: "", driven: "", shaft: "1/2hex", angle: (i % 2) * 90, plane: i + 1 };   // staircase: never loops back onto the motor
  D.stages.push(st);
  if (type === "gear") { st.adder = 0.003; st.driver = pickDefault(partsFor(st, "driver"), (g) => g.teeth >= 12 && g.teeth <= 18); st.driven = pickDefault(partsFor(st, "driven"), (g) => g.teeth >= 48); }
  if (type === "belt") { st.extra = 0; st.driver = pickDefault(partsFor(st, "driver"), (p) => p.profile === "HTD5" && p.widthMm === 9 && p.teeth >= 12 && p.teeth <= 18); st.driven = pickDefault(partsFor(st, "driven"), (p) => p.teeth >= 36); st.belt = defaultBelt(st); }
  if (type === "chain") { st.chain = "25"; st.extra = 0; st.driver = pickDefault(partsFor(st, "driver"), (s) => s.teeth >= 10 && s.teeth <= 16); st.driven = pickDefault(partsFor(st, "driven"), (s) => s.teeth >= 32); st.links = defaultLinks(st); }
  void prevShaft;
  gbChanged(true);
}

// ---------- the stage editor
function optionList(list, sel) {
  return list.map((p) => `<option value="${p.sku}" ${p.sku === sel ? "selected" : ""}>${esc(shortName(p))}</option>`).join("");
}
function shortName(p) {
  if (p.kind === "gear") return `${p.teeth}t ${p.material}${p.pocketed ? " pocketed" : ""}${p.cdTeeth ? ` (${p.cdTeeth}t spacing)` : ""}${p.width === "thin" ? " thin" : ""} · ${p.sku}`;
  if (p.kind === "pulley") return `${p.teeth}t ${p.profile === "HTD5" ? "HTD" : "GT2"} ${p.widthMm}mm ${p.material === "Nylon" ? "plastic" : ""} · ${p.sku}`;
  if (p.kind === "sprocket") return `${p.teeth}t ${p.material} ${p.style === "plate" ? "plate" : "hub"} · ${p.sku}`;
  return p.name;
}
function renderStages() {
  const host = $("gbStages");
  host.innerHTML = D.stages.map((st, i) => {
    const g = stageGeom(st);
    const col = `var(${STAGE_COLORS[i % STAGE_COLORS.length]})`;
    const drivers = partsFor(st, "driver"), driven = partsFor(st, "driven");
    const shaftOpts = ["1/2hex", "1/2hex-r", "3/8hex", "3/8hex-r", "splinexl"].map((s) => `<option value="${s}" ${st.shaft === s ? "selected" : ""}>${SHAFTS[s].label}</option>`).join("");
    let extra = "";
    if (st.type === "gear") extra = `<div class="row"><label>Spacing adder</label><div class="unit"><input type="number" step="0.001" data-k="adder" value="${st.adder ?? 0.003}"><em>in</em></div></div>`;
    if (st.type === "belt") {
      const a = BY_SKU.get(st.driver);
      const belts = a ? P.belts.filter((x) => x.profile === a.profile && x.widthMm === a.widthMm && !x.double) : [];
      const bOpts = belts.map((x) => { const bb = BY_SKU.get(st.driven); const C = a && bb ? K.beltCenterForTeeth(a.teeth, bb.teeth, x.teeth, K.BELT[a.profile].pitchMm) : NaN; return isFinite(C) ? `<option value="${x.sku}" ${x.sku === st.belt ? "selected" : ""}>${x.teeth}t · ${f3(C)}" centres · ${x.sku}</option>` : ""; }).join("");
      extra = `<div class="row"><label>Belt</label><select data-k="belt">${bOpts || "<option>No belt fits</option>"}</select></div>
        <div class="row"><label>Tension adder</label><div class="unit"><input type="number" step="0.001" data-k="extra" value="${st.extra || 0}"><em>in</em></div></div>`;
    }
    if (st.type === "chain") {
      extra = `<div class="row"><label>Chain</label><select data-k="chain">${["25", "25H", "35"].map((c) => `<option value="${c}" ${st.chain === c ? "selected" : ""}>#${c}</option>`).join("")}</select></div>
        <div class="row"><label>Links<small>even needs no half link</small></label><input type="number" step="2" min="4" data-k="links" value="${st.links || 0}"></div>
        <div class="row"><label>Spacing adder</label><div class="unit"><input type="number" step="0.001" data-k="extra" value="${st.extra || 0}"><em>in</em></div></div>`;
    }
    return `<div class="stage" data-i="${i}" style="--sc:${col}">
      <div class="stage-h"><b style="color:${col}">Stage ${i + 1} · ${st.type}</b><span class="ratio">${g.ok ? f2(g.ratio) + ":1 · " + f3(g.C) + '"' : ""}</span><span class="spacer"></span>
        <button class="xbtn" data-act="up" title="Move up" ${i === 0 ? "disabled" : ""}>↑</button><button class="xbtn" data-act="del" title="Remove stage" aria-label="Remove stage ${i + 1}">×</button></div>
      <div class="row"><label>Driving<small>on S${i} (${SHAFTS[shaftTypeOf(i)].label})</small></label><select data-k="driver">${drivers.length ? optionList(drivers, st.driver) : "<option>Nothing fits this shaft</option>"}</select></div>
      <div class="row"><label>Driven<small>on S${i + 1}</small></label><select data-k="driven">${driven.length ? optionList(driven, st.driven) : "<option>Nothing fits this shaft</option>"}</select></div>
      <div class="row"><label>S${i + 1} shaft</label><select data-k="shaft">${shaftOpts}</select></div>
      ${extra}
      <div class="row"><label>Direction<small>S${i + 1} from S${i}, 0° = right, 90° = up</small></label><div class="unit"><input type="number" step="15" data-k="angle" value="${st.angle}"><em>°</em></div></div>
      <div class="row"><label>Plane<small>stages in the same plane can collide</small></label><input type="number" min="1" max="9" step="1" data-k="plane" value="${st.plane}"></div>
      ${g.ok ? "" : `<ul class="msgs"><li class="bad">${esc(g.why)}</li></ul>`}
    </div>`;
  }).join("") || `<p class="muted">No stages yet. Add one below.</p>`;
}
$("gbStages").addEventListener("change", (e) => {
  const el = e.target, card = el.closest(".stage"); if (!card || !el.dataset.k) return;
  const st = D.stages[+card.dataset.i], k = el.dataset.k;
  st[k] = ["angle", "plane", "adder", "extra", "links"].includes(k) ? parseFloat(el.value) || 0 : el.value;
  if (k === "shaft") {   // parts must still fit the new shaft
    if (!fits(BY_SKU.get(st.driven), st.shaft)) st.driven = pickDefault(partsFor(st, "driven"), () => true);
    const next = D.stages[+card.dataset.i + 1];
    if (next && !fits(BY_SKU.get(next.driver), st.shaft)) next.driver = pickDefault(partsFor(next, "driver"), () => true);
  }
  if (st.type === "belt" && (k === "driver" || k === "driven")) {
    const a = BY_SKU.get(st.driver), b = BY_SKU.get(st.driven);
    if (a && b && (a.profile !== b.profile || a.widthMm !== b.widthMm)) st[k === "driver" ? "driven" : "driver"] = pickDefault(partsFor(st, k === "driver" ? "driven" : "driver"), (p) => p.teeth === (k === "driver" ? b : a).teeth) ;
    st.belt = defaultBelt(st);
  }
  if (st.type === "chain" && (k === "driver" || k === "driven" || k === "chain")) {
    if (k === "chain") { st.driver = pickDefault(partsFor(st, "driver"), () => true); st.driven = pickDefault(partsFor(st, "driven"), (s) => s.teeth >= 30); }
    st.links = defaultLinks(st);
  }
  gbChanged(true);
});
$("gbStages").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-act]"); if (!btn) return;
  const i = +btn.closest(".stage").dataset.i;
  if (btn.dataset.act === "del") D.stages.splice(i, 1);
  if (btn.dataset.act === "up" && i > 0) [D.stages[i - 1], D.stages[i]] = [D.stages[i], D.stages[i - 1]];
  // re-check that each driver still fits the shaft it now sits on
  D.stages.forEach((st) => { if (!fits(BY_SKU.get(st.driver), shaftTypeOf(D.stages.indexOf(st)))) st.driver = pickDefault(partsFor(st, "driver"), () => true); });
  gbChanged(true);
});
for (const b of document.querySelectorAll("[data-add]")) b.addEventListener("click", () => addStage(b.dataset.add));

// ---------- motor + mechanism inputs
function motorInputs() {
  const m = MOTORS[D.motor.id];
  $("gbMotor").innerHTML = P.motors.map((x) => `<option value="${x.id}" ${x.id === D.motor.id ? "selected" : ""}>${x.name}</option>`).join("");
  $("gbMode").innerHTML = Object.entries(m.modes).map(([k, v]) => `<option value="${k}" ${k === D.motor.mode ? "selected" : ""}>${v.label}</option>`).join("");
  const shafts = m.shaftOptions || [m.shaft];
  $("gbShaft").innerHTML = shafts.map((s) => `<option value="${s}" ${s === D.motor.shaft ? "selected" : ""}>${SHAFTS[s].label}</option>`).join("");
  $("gbShaftRow").hidden = shafts.length < 2;
  $("gbCount").value = D.motor.count; $("gbLimit").value = D.motor.limit ?? "";
  $("gbMech").value = D.mech.type; $("gbDia").value = D.mech.dia; $("gbArmLen").value = D.mech.armLen; $("gbMass").value = D.mech.mass;
  $("gbMargin").value = D.plate.margin; $("gbHoles").value = D.plate.holes; $("gbMotorRot").value = D.plate.motorRot ?? ""; $("gbMotorRot").placeholder = `auto (${motorRot()})`; $("gbPlates").value = D.plate.plates;
  for (const [id, k] of [["showPitch", "pitch"], ["showOD", "od"], ["showPlate", "plate"]]) $(id).setAttribute("aria-pressed", String(!!D.show[k]));
  for (const r of document.querySelectorAll("[data-mech]")) r.hidden = !r.dataset.mech.split(" ").includes(D.mech.type);
}
$("gbMotor").addEventListener("change", () => {
  const m = MOTORS[$("gbMotor").value];
  D.motor.id = m.id; D.motor.mode = Object.keys(m.modes)[0]; D.motor.shaft = m.shaft;
  if (D.stages[0] && !fits(BY_SKU.get(D.stages[0].driver), D.motor.shaft)) D.stages[0].driver = pickDefault(partsFor(D.stages[0], "driver"), (p) => p.teeth >= 10 && p.teeth <= 14);
  if (D.stages[0] && D.stages[0].type === "belt") D.stages[0].belt = defaultBelt(D.stages[0]);
  if (D.stages[0] && D.stages[0].type === "chain") D.stages[0].links = defaultLinks(D.stages[0]);
  gbChanged(true);
});
$("gbMode").addEventListener("change", () => { D.motor.mode = $("gbMode").value; gbChanged(false); });
$("gbShaft").addEventListener("change", () => { D.motor.shaft = $("gbShaft").value; if (D.stages[0] && !fits(BY_SKU.get(D.stages[0].driver), D.motor.shaft)) D.stages[0].driver = pickDefault(partsFor(D.stages[0], "driver"), () => true); gbChanged(true); });
$("gbCount").addEventListener("input", () => { D.motor.count = Math.max(1, Math.round(num($("gbCount"), 1))); gbChanged(false); });
$("gbLimit").addEventListener("input", () => { D.motor.limit = $("gbLimit").value === "" ? null : num($("gbLimit"), 40); gbChanged(false); });
$("gbMech").addEventListener("change", () => { D.mech.type = $("gbMech").value; gbChanged(true); });
for (const [id, k] of [["gbDia", "dia"], ["gbArmLen", "armLen"], ["gbMass", "mass"]]) $(id).addEventListener("input", () => { D.mech[k] = num($(id), 0); gbChanged(false); });
for (const [id, k] of [["gbMargin", "margin"], ["gbHoles", "holes"], ["gbPlates", "plates"]]) $(id).addEventListener("input", () => { D.plate[k] = num($(id), 0); gbChanged(false); });
$("gbMotorRot").addEventListener("input", () => { D.plate.motorRot = $("gbMotorRot").value === "" ? null : num($("gbMotorRot"), 0); gbChanged(false); });
for (const [id, k] of [["showPitch", "pitch"], ["showOD", "od"], ["showPlate", "plate"]]) $(id).addEventListener("click", () => { D.show[k] = !D.show[k]; gbChanged(true); });

// ---------- solve the whole gearbox
function solve() {
  const m = MOTORS[D.motor.id], mode = m.modes[D.motor.mode] || Object.values(m.modes)[0];
  const shafts = [{ x: 0, y: 0, type: D.motor.shaft, motor: true }];
  const stages = [];
  let ratio = 1, eff = 1, okAll = true;
  D.stages.forEach((st, i) => {
    const g = stageGeom(st);
    stages.push({ st, g, i });
    const prev = shafts[shafts.length - 1];
    const C = g.ok ? g.C : 1;
    const t = (st.angle * Math.PI) / 180;
    shafts.push({ x: prev.x + C * Math.cos(t), y: prev.y + C * Math.sin(t), type: st.shaft });
    if (g.ok) { ratio *= g.ratio; eff *= EFF[st.type]; } else okAll = false;
  });
  const out = K.motorOut(mode, D.motor.count, ratio, eff, D.motor.limit);
  // holes
  shafts.forEach((s, i) => {
    if (s.motor) { s.hole = 0.76; s.label = `S0 ${m.name}`; return; }
    const brg = SHAFTS[s.type].bearing ? BY_SKU.get(SHAFTS[s.type].bearing) : null;
    s.bearing = brg; s.hole = brg ? brg.od : (SHAFT_HOLE_DEFAULT[s.type] || 1.125); s.label = `S${i}`;
  });
  // warnings: parts hitting other shafts, same-plane overlaps, belts and chains rubbing shafts, motor body on the plate
  const warns = [];
  for (const { st, g, i } of stages) if (g.ok) for (const w of g.warnings) warns.push({ text: `Stage ${i + 1}: ${w}` });
  const bodies = [];   // round parts: {shaft, r, plane, stage}
  for (const { st, g, i } of stages) if (g.ok) {
    bodies.push({ s: i, r: g.a.od / 2, plane: st.plane, stage: i, name: `stage ${i + 1} driving ${st.type === "gear" ? "gear" : st.type === "belt" ? "pulley" : "sprocket"}` });
    bodies.push({ s: i + 1, r: g.b.od / 2, plane: st.plane, stage: i, name: `stage ${i + 1} driven ${st.type === "gear" ? "gear" : st.type === "belt" ? "pulley" : "sprocket"}` });
  }
  const dist = (a, b) => Math.hypot(shafts[a].x - shafts[b].x, shafts[a].y - shafts[b].y);
  for (const b of bodies) for (let j = 0; j < shafts.length; j++) {
    if (j === b.s) continue;
    const meshPartner = (b.s === b.stage && j === b.stage + 1) || (b.s === b.stage + 1 && j === b.stage);
    if (meshPartner) continue;
    const clear = dist(b.s, j) - b.r - SHAFTS[shafts[j].type].radius;
    if (clear < 0) warns.push({ text: `The ${b.name} (${f2(2 * b.r)}" OD) hits the S${j} shaft. Turn stage directions or move it to another shaft.`, level: "bad" });
  }
  for (let p = 0; p < bodies.length; p++) for (let q = p + 1; q < bodies.length; q++) {
    const A = bodies[p], B = bodies[q];
    if (A.plane !== B.plane || A.stage === B.stage || A.s === B.s) continue;
    if (dist(A.s, B.s) < A.r + B.r) warns.push({ text: `The ${A.name} and the ${B.name} overlap in plane ${A.plane}. Put one stage in a different plane.`, level: "bad" });
  }
  for (const { st, g, i } of stages) if (g.ok && st.type !== "gear") {
    for (const [p, q] of tangents([shafts[i].x, shafts[i].y], g.a.pd / 2, [shafts[i + 1].x, shafts[i + 1].y], g.b.pd / 2)) {
      for (let j = 0; j < shafts.length; j++) {
        if (j === i || j === i + 1) continue;
        const d = segDist([shafts[j].x, shafts[j].y], p, q);
        if (d < SHAFTS[shafts[j].type].radius + 0.15) warns.push({ text: `Stage ${i + 1}'s ${st.type} runs into the S${j} shaft.`, level: "bad" });
      }
    }
  }
  for (let j = 1; j < shafts.length; j++) {
    if (Math.hypot(shafts[j].x, shafts[j].y) < m.bodyDia / 2 + shafts[j].hole / 2) warns.push({ text: `Note: the ${m.name} body (${f2(m.bodyDia)}" dia.) sits over S${j}'s bearing on the motor side of the plate. Fine if S${j} doesn't stick out on that side.`, level: "note" });
  }
  if (!D.stages.length) warns.push({ text: "Add a stage to start.", level: "" });
  const holes = plateHoles({ m, shafts });
  for (let a = 0; a < holes.length; a++) for (let b = a + 1; b < holes.length; b++) {
    const A = holes[a], B = holes[b];
    if (A.bolt && B.bolt) continue;
    const web = Math.hypot(A.c[0] - B.c[0], A.c[1] - B.c[1]) - A.r - B.r;
    const fix = A.bolt || B.bolt ? " Change the motor hole angle." : " Move the shafts apart.";
    if (web < 0.08) warns.push({ text: web < 0 ? `The ${A.what} and ${B.what} holes overlap.${fix}` : `Only ${f3(web)}" of material between the ${A.what} and ${B.what} holes.${fix}`, level: web < 0 ? "bad" : "" });
  }
  return { m, mode, shafts, stages, ratio, eff, out, warns: dedupe(warns), okAll };
}
const dedupe = (list) => { const seen = new Set(); return list.filter((w) => (seen.has(w.text) ? false : seen.add(w.text))); };
function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

// Every hole in the plate: bearing / pilot holes and the motor's bolt holes.
const motorRot = () => (D.plate.motorRot === null || D.plate.motorRot === "" || D.plate.motorRot === undefined ? ((D.stages[0] ? D.stages[0].angle : 0) + 90) : D.plate.motorRot);
function plateHoles(R) {
  const holes = R.shafts.map((q, i) => ({ c: [q.x, q.y], r: q.hole / 2, what: `S${i}`, shaft: i }));
  const n = +D.plate.holes, bc = R.m.mount.boltCircle / 2;
  for (let k = 0; k < n; k++) { const t = ((motorRot() + (k * 360) / n) * Math.PI) / 180; holes.push({ c: [bc * Math.cos(t), bc * Math.sin(t)], r: 0.1005, what: "motor bolt", shaft: 0, bolt: true }); }
  return holes;
}
// Outline radius per shaft: its hole plus the margin; the motor shaft also covers its bolt circle.
function outlineRadii(R) {
  const m = D.plate.margin || 0;
  return R.shafts.map((q) => (q.motor && +D.plate.holes ? Math.max(q.hole / 2, R.m.mount.boltCircle / 2 + 0.1005) : q.hole / 2) + m);
}

// ---------- outputs
function renderOutputs(R) {
  const o = R.out, inlb = (nm) => nm * K.NM_TO_INLB;
  $("gbStats").innerHTML = stat(`${f2(R.ratio)}:1`, "total reduction") + stat(f1(o.freeRPM), "free speed, RPM") + stat(f1(o.stallNm) + " N·m", `stall torque (${f1(inlb(o.stallNm))} in·lb)`) +
    (o.limitNm != null ? stat(f1(o.limitNm) + " N·m", `at ${D.motor.limit} A per motor`) : "");
  const mech = D.mech; let html = "";
  const tq = o.limitNm != null ? o.limitNm : o.stallNm, tqLabel = o.limitNm != null ? `at ${D.motor.limit} A` : "at stall";
  if (mech.type === "wheel" && mech.dia > 0) {
    const fps = (o.freeRPM * Math.PI * mech.dia) / 60 / 12;
    html = `<table><tr><th>Wheel / roller</th><th class="num">Free speed</th><th class="num">≈ loaded (80%)</th><th class="num">Surface force ${tqLabel}</th></tr><tr><td>${f2(mech.dia)}" diameter</td><td class="num">${f2(fps)} ft/s</td><td class="num">${f2(fps * 0.8)} ft/s</td><td class="num">${f1(inlb(tq) / (mech.dia / 2))} lbf</td></tr></table>`;
  } else if (mech.type === "linear" && mech.dia > 0) {
    const ips = (o.freeRPM * Math.PI * mech.dia) / 60, force = inlb(tq) / (mech.dia / 2);
    html = `<table><tr><th>Drum / sprocket</th><th class="num">Free speed</th><th class="num">Pull ${tqLabel}</th><th class="num">Load</th></tr><tr><td>${f2(mech.dia)}" pitch dia.</td><td class="num">${f1(ips)} in/s</td><td class="num">${f1(force)} lbf</td><td class="num">${mech.mass > 0 ? `${f2(mech.mass)} lb · ${force > 0 ? f1((100 * mech.mass) / force) : "—"}% of pull` : "—"}</td></tr></table>` +
      (mech.mass > 0 && force < mech.mass * 1.5 ? `<ul class="msgs"><li>Less than 1.5× the load: it may lift slowly or stall. Add reduction or a motor.</li></ul>` : "");
  } else if (mech.type === "arm") {
    const need = mech.mass * mech.armLen, needNm = need / K.NM_TO_INLB;
    html = `<table><tr><th>Arm</th><th class="num">Free speed</th><th class="num">Torque to hold level</th><th class="num">Share of torque ${tqLabel}</th></tr><tr><td>${f1(mech.armLen)}" · ${f1(mech.mass)} lb</td><td class="num">${f1(o.freeRPM * 6)}°/s</td><td class="num">${f1(needNm)} N·m</td><td class="num">${tq > 0 ? f1((100 * needNm) / tq) + "%" : "—"}</td></tr></table>` +
      (tq > 0 && needNm / tq > 0.5 ? `<ul class="msgs"><li>Holding level uses more than half the available torque; expect a slow arm and hot motors. Add reduction.</li></ul>` : "");
  }
  $("gbMechOut").innerHTML = html ? `<div class="tablewrap">${html}</div>` : "";
  const real = R.warns.filter((w) => w.level !== "note");
  msgs($("gbWarn"), [...(real.length ? real : [{ text: "No collisions found between parts and shafts.", level: "ok" }]), ...R.warns.filter((w) => w.level === "note")]);
}

function renderPlate(R) {
  const sh = R.shafts, pts = sh.map((s) => [s.x, s.y]);
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  const grow = (x, y, r) => { minx = Math.min(minx, x - r); miny = Math.min(miny, y - r); maxx = Math.max(maxx, x + r); maxy = Math.max(maxy, y + r); };
  const orad = outlineRadii(R);
  sh.forEach((q, i) => grow(q.x, q.y, orad[i]));
  grow(0, 0, R.m.bodyDia / 2);
  for (const { g, i } of R.stages) if (g.ok) { grow(sh[i].x, sh[i].y, g.a.od / 2); grow(sh[i + 1].x, sh[i + 1].y, g.b.od / 2); }
  const F = svgFrame([minx, miny, maxx, maxy], 0.35);
  const span = Math.max(maxx - minx, maxy - miny), fs = Math.max(0.16, span / 45);
  const ink = css("--plate-line"), shaftC = css("--shaft"), grid = css("--grid");
  let s = F.open;
  // 1" grid
  for (let x = Math.ceil(minx - 0.35); x <= maxx + 0.35; x++) s += line(F, [x, miny - 0.35], [x, maxy + 0.35], `stroke="${grid}" stroke-width="1"`);
  for (let y = Math.ceil(miny - 0.35); y <= maxy + 0.35; y++) s += line(F, [minx - 0.35, y], [maxx + 0.35, y], `stroke="${grid}" stroke-width="1"`);
  if (D.show.plate) s += outlineSvg(F, K.plateOutline(pts, outlineRadii(R)), ink);
  s += circ(F, [0, 0], R.m.bodyDia / 2, `fill="none" stroke="${ink}" stroke-dasharray="2 4" stroke-width="1"`);
  R.stages.forEach(({ st, g, i }) => {
    if (!g.ok) return;
    const col = css(STAGE_COLORS[i % STAGE_COLORS.length]);
    const A = [sh[i].x, sh[i].y], B = [sh[i + 1].x, sh[i + 1].y];
    if (st.type !== "gear") for (const [p, q] of tangents(A, g.a.pd / 2, B, g.b.pd / 2)) s += line(F, p, q, `stroke="${col}" stroke-width="2.5" stroke-opacity=".8"`);
    for (const [c, part] of [[A, g.a], [B, g.b]]) {
      if (D.show.od) s += circ(F, c, part.od / 2, `fill="${col}" fill-opacity=".10" stroke="${col}" stroke-width="1.6"`);
      if (D.show.pitch) s += circ(F, c, part.pd / 2, `fill="none" stroke="${col}" stroke-dasharray="5 3" stroke-width="1"`);
    }
  });
  sh.forEach((q) => {
    s += circ(F, [q.x, q.y], q.hole / 2, `fill="none" stroke="${shaftC}" stroke-width="1.6"`);
    if (q.motor) for (const h of plateHoles(R).filter((x) => x.bolt)) s += circ(F, h.c, h.r, `fill="none" stroke="${shaftC}" stroke-width="1.2"`);
    s += circ(F, [q.x, q.y], 0.035, `fill="${shaftC}"`);
    s += text(F, [q.x + q.hole / 2 + 0.06, q.y + q.hole / 2 + 0.02], q.motor ? "S0" : q.label, fs, `fill="${css("--ink")}" font-weight="600"`);
  });
  s += F.close;
  $("gbDraw").innerHTML = s;

  // hole table
  const rows = sh.map((q, i) => {
    const prev = i ? Math.hypot(q.x - sh[i - 1].x, q.y - sh[i - 1].y) : null;
    const what = q.motor ? `${R.m.name} pilot (0.760" for the 0.75" boss)${+D.plate.holes ? `, ${D.plate.holes}× #10 clearance (0.201") on ${f3(R.m.mount.boltCircle)}" circle` : ""}` : q.bearing ? `${q.bearing.sku} bearing, ${f3(q.bearing.od)}" OD` : `${SHAFTS[q.type].label}: set your bearing / block hole (${f3(q.hole)}" shown)`;
    return `<tr><td><b>S${i}</b></td><td class="num">${f3(q.x)}</td><td class="num">${f3(q.y)}</td><td class="num">${prev == null ? "" : f3(prev) + '"'}</td><td>${esc(what)}</td></tr>`;
  });
  $("gbHoleTable").innerHTML = `<tr><th>Shaft</th><th class="num">X (in)</th><th class="num">Y (in)</th><th class="num">From previous</th><th>Hole</th></tr>` + rows.join("");
}
function outlineSvg(F, segs, ink) {
  let s = "";
  for (const g of segs) {
    if (g.type === "circle") s += circ(F, g.c, g.r, `fill="none" stroke="${ink}" stroke-width="1.4"`);
    else if (g.type === "line") s += line(F, g.a, g.b, `stroke="${ink}" stroke-width="1.4"`);
    else {
      let d = g.to - g.from; while (d <= 0) d += 2 * Math.PI;
      const p0 = [g.c[0] + g.r * Math.cos(g.from), g.c[1] + g.r * Math.sin(g.from)], p1 = [g.c[0] + g.r * Math.cos(g.to), g.c[1] + g.r * Math.sin(g.to)];
      s += `<path d="M ${F.X(p0[0])} ${F.Y(p0[1])} A ${g.r} ${g.r} 0 ${d > Math.PI ? 1 : 0} 0 ${F.X(p1[0])} ${F.Y(p1[1])}" fill="none" stroke="${ink}" stroke-width="1.4" vector-effect="non-scaling-stroke"/>`;
    }
  }
  return s;
}

// ---------- parts list
function bom(R) {
  const lines = new Map();
  const add = (sku, qty, note = "") => { const p = BY_SKU.get(sku); if (!p) return; const e = lines.get(sku) || { p, qty: 0, notes: new Set() }; e.qty += qty; if (note) e.notes.add(note); lines.set(sku, e); };
  const extra = [];
  extra.push({ sku: R.m.sku, name: R.m.name + " motor", qty: D.motor.count, price: null, url: R.m.source });
  R.stages.forEach(({ st, g, i }) => {
    add(st.driver, 1, `stage ${i + 1}`); add(st.driven, 1, `stage ${i + 1}`);
    if (st.type === "belt" && g.ok) add(g.belt.sku, 1, `stage ${i + 1}`);
    if (st.type === "chain" && g.ok) {
      const size = st.chain || "25";
      const chainPart = P.chain.find((c) => c.chain === size && c.item === "chain");
      const feet = (g.links * K.CHAIN_PITCH[size]) / 12;
      add(chainPart.sku, 0, `stage ${i + 1}: ${g.links} links (${f2(feet)} ft)`);
      lines.get(chainPart.sku).feet = (lines.get(chainPart.sku).feet || 0) + feet;
      add(P.chain.find((c) => c.chain === size && c.item === "master").sku, 0, `stage ${i + 1}`);
      lines.get(P.chain.find((c) => c.chain === size && c.item === "master").sku).qty = 1;
      if (g.links % 2) { const h = P.chain.find((c) => c.chain === size && c.item === "half"); add(h.sku, 0, `stage ${i + 1}`); lines.get(h.sku).qty = 1; }
    }
  });
  for (const e of lines.values()) if (e.feet) e.qty = Math.max(1, Math.ceil(e.feet / 10));
  R.shafts.forEach((q, i) => { if (!q.motor && q.bearing) add(q.bearing.sku, Math.max(1, Math.round(D.plate.plates || 2)), `S${i}`); });
  return { lines: [...lines.values()], extra };
}
function renderBom(R) {
  const B = bom(R);
  let total = 0;
  const rows = B.lines.map((e) => { const t = (e.p.price || 0) * e.qty; total += t; return `<tr><td><a class="mono" href="${e.p.url || "https://wcproducts.com/search?q=" + e.p.sku}" target="_blank" rel="noopener">${e.p.sku}</a></td><td>${esc(e.p.name)}<div class="muted" style="font-size:12px">${esc([...e.notes].join(", "))}</div></td><td class="num">${e.qty}</td><td class="num">${e.p.price ? "$" + e.p.price.toFixed(2) : ""}</td><td class="num">${t ? "$" + t.toFixed(2) : ""}</td></tr>`; });
  const mrows = B.extra.map((x) => `<tr><td class="mono">${x.sku}</td><td>${esc(x.name)}</td><td class="num">${x.qty}</td><td></td><td></td></tr>`);
  $("gbBom").innerHTML = `<tr><th>Part</th><th>Description</th><th class="num">Qty</th><th class="num">Each</th><th class="num">Total</th></tr>` + mrows.join("") + rows.join("") +
    `<tr><td></td><td class="muted">Parts total, excluding motors and shafts. Prices as listed on ${P.updated}.</td><td></td><td></td><td class="num"><b>$${total.toFixed(2)}</b></td></tr>`;
  return B;
}
$("gbCsv").addEventListener("click", () => {
  const B = bom(solve());
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const rows = [["Part", "Description", "Qty", "Each", "Notes", "Link"]];
  for (const x of B.extra) rows.push([x.sku, x.name, x.qty, "", "", x.url]);
  for (const e of B.lines) rows.push([e.p.sku, e.p.name, e.qty, e.p.price ?? "", [...e.notes].join("; "), e.p.url || ""]);
  download("btr-gearbox-parts.csv", rows.map((r) => r.map(q).join(",")).join("\r\n"), "text/csv");
});

// ---------- DXF (R12 ASCII, inches)
function dxf(R) {
  const out = ["0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", "1", "0", "ENDSEC", "0", "SECTION", "2", "TABLES", "0", "TABLE", "2", "LAYER", "70", "3"];
  for (const [name, color] of [["HOLES", 1], ["OUTLINE", 7], ["CENTERS", 8]]) out.push("0", "LAYER", "2", name, "70", "0", "62", String(color), "6", "CONTINUOUS");
  out.push("0", "ENDTAB", "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES");
  const n = (v) => (Math.abs(v) < 1e-12 ? 0 : v).toFixed(6);
  const C = (layer, c, r) => out.push("0", "CIRCLE", "8", layer, "10", n(c[0]), "20", n(c[1]), "30", "0", "40", n(r));
  const L = (layer, a, b) => out.push("0", "LINE", "8", layer, "10", n(a[0]), "20", n(a[1]), "30", "0", "11", n(b[0]), "21", n(b[1]), "31", "0");
  const A = (layer, c, r, a0, a1) => out.push("0", "ARC", "8", layer, "10", n(c[0]), "20", n(c[1]), "30", "0", "40", n(r), "50", n((a0 * 180) / Math.PI), "51", n((a1 * 180) / Math.PI));
  R.shafts.forEach((q) => {
    C("HOLES", [q.x, q.y], q.hole / 2);
    L("CENTERS", [q.x - 0.1, q.y], [q.x + 0.1, q.y]); L("CENTERS", [q.x, q.y - 0.1], [q.x, q.y + 0.1]);
  });
  for (const h of plateHoles(R).filter((x) => x.bolt)) C("HOLES", h.c, h.r);
  for (const g of K.plateOutline(R.shafts.map((q) => [q.x, q.y]), outlineRadii(R))) {
    if (g.type === "circle") C("OUTLINE", g.c, g.r); else if (g.type === "line") L("OUTLINE", g.a, g.b); else A("OUTLINE", g.c, g.r, g.from, g.to);
  }
  out.push("0", "ENDSEC", "0", "EOF");
  return out.join("\r\n");
}
$("gbDxf").addEventListener("click", () => { const R = solve(); download(`btr-gearbox-${f2(R.ratio)}to1.dxf`, dxf(R), "application/dxf"); toast("DXF downloaded"); });
$("gbShare").addEventListener("click", async () => {
  const url = shareLink();
  try { await navigator.clipboard.writeText(url); toast("Link copied — paste it in Teams"); } catch (e) { prompt("Copy this link:", url); }
});
$("gbSave").addEventListener("click", () => { download(`btr-gearbox-${f2(solve().ratio)}to1.json`, JSON.stringify(D, null, 1), "application/json"); });
$("gbOpen").addEventListener("change", async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try { const d = JSON.parse(await f.text()); if (!d.stages) throw new Error(); D = fixDesign(d); gbChanged(true); toast("Design opened"); } catch (err) { toast("That file isn't a BTR Calc design."); }
  e.target.value = "";
});
$("gbReset").addEventListener("click", () => { D = DEFAULT_DESIGN(); history.replaceState(null, "", location.pathname); gbChanged(true); });

function gbChanged(full) {
  saveDesign();
  if (location.hash.startsWith("#d=")) history.replaceState(null, "", location.pathname);
  if (full) { motorInputs(); renderStages(); }
  else for (const card of document.querySelectorAll(".stage")) { const st = D.stages[+card.dataset.i], g = stageGeom(st); card.querySelector(".ratio").textContent = g.ok ? f2(g.ratio) + ":1 · " + f3(g.C) + '"' : ""; }
  const R = solve();
  renderOutputs(R); renderPlate(R); renderBom(R);
}

// ---------------------------------------------------------------- feedback
let fbType = "Idea";
for (const b of document.querySelectorAll("#fbTypes button")) b.addEventListener("click", () => {
  fbType = b.dataset.v; for (const o of document.querySelectorAll("#fbTypes button")) o.setAttribute("aria-pressed", String(o === b));
});
$("feedbackBtn").addEventListener("click", () => { $("fbName").value = store.get("btr.name") || ""; $("fbDialog").showModal(); $("fbMsg").focus(); });
$("fbCancel").addEventListener("click", () => $("fbDialog").close());
$("fbSend").addEventListener("click", () => {
  const f = FEEDBACK_FORM, name = $("fbName").value.trim();
  store.set("btr.name", name);
  const tab = document.querySelector('nav.tabs button[aria-selected="true"]').dataset.tab;
  const details = [`BTR Calc ${APP_VERSION}`, `${tab} tab`, navigator.userAgent].join(" · ");
  const q = new URLSearchParams({ usp: "pp_url", [f.fields.type]: fbType, [f.fields.message]: $("fbMsg").value, [f.fields.name]: name, [f.fields.details]: details });
  window.open(f.url + "?" + q.toString(), "_blank", "noopener");
  $("fbDialog").close(); $("fbMsg").value = "";
});

// ---------------------------------------------------------------- start
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { gbChanged(true); chainRender(); beltRender(); gearsRender(); });
chainSetup(); beltSetup(); gearsSetup(); partsSetup();
gbChanged(true);
if (!location.hash.startsWith("#d=")) showTab(store.get("btr.calc.tab") || "gearbox");
