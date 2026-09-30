import * as C from "../core.js";
import fs from "fs";
let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log("FAIL", msg); } else console.log("ok  ", msg); };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// chain: exact tooth-wrap model vs the ANSI approximation (should agree to a small fraction of a link)
for (const [n1, n2, c, p] of [[16, 32, 5, 0.25], [12, 60, 10, 0.25], [15, 15, 8, 0.375], [10, 72, 6, 0.25]]) {
  const a = C.chainLinks(n1, n2, c, p), b = C.chainLinksANSI(n1, n2, c, p);
  ok(near(a, b, 0.15), `chain ${n1}/${n2} @ ${c}" #${p === 0.25 ? 25 : 35}: exact ${a.toFixed(3)} vs ANSI ${b.toFixed(3)} links`);
  const back = C.chainCenterForLinks(n1, n2, a, p);
  ok(near(back, c, 1e-6), `chain inverse returns C=${c} (${back.toFixed(6)})`);
}
// equal sprockets: links = N + 2C/p exactly
ok(near(C.chainLinks(18, 18, 6, 0.25), 18 + 48, 1e-9), "equal sprockets: 18 + 2*6/0.25 = 66 links");
// sprocket pitch diameter: #25 16t = 1.281" (standard tables)
ok(near(C.sprocketPD(16, 0.25), 1.2815, 0.0005), `#25 16t PD ${C.sprocketPD(16, 0.25).toFixed(4)} (table 1.281)`);
ok(near(C.sprocketPD(15, 0.375), 1.8037, 0.0005), `#35 15t PD ${C.sprocketPD(15, 0.375).toFixed(4)} (table 1.804)`);

// belts: equal pulleys: L = 2C + pi*PD exactly
{
  const pd = C.pulleyPD(24, 5); const L = C.beltLength(24, 24, 4, 5);
  ok(near(L, 8 + Math.PI * pd, 1e-9), "equal pulleys belt length 2C + pi*PD");
  ok(near(pd, 24 * 5 / 25.4 / Math.PI, 1e-12), `HTD 24t PD ${pd.toFixed(4)}"`);
}
for (const [n1, n2, t] of [[18, 36, 150], [12, 60, 225], [36, 36, 100]]) {
  const c = C.beltCenterForTeeth(n1, n2, t, 5);
  ok(near(C.beltTeethAt(n1, n2, c, 5), t, 1e-6), `belt ${t}t on ${n1}/${n2}: C = ${c.toFixed(4)}" round-trips`);
}
// Cross-check belt length against a brute-force polyline of the actual belt path
{
  const n1 = 18, n2 = 60, c = 5, pm = 5, R1 = C.pulleyPD(n1, pm) / 2, R2 = C.pulleyPD(n2, pm) / 2;
  // sample the convex hull of the two circles
  const pts = [];
  for (let i = 0; i < 20000; i++) { const a = 2 * Math.PI * i / 20000; pts.push([R1 * Math.cos(a), R1 * Math.sin(a)], [c + R2 * Math.cos(a), R2 * Math.sin(a)]); }
  const h = C.convexHull(pts); let per = 0; for (let i = 0; i < h.length; i++) { const a = h[i], b = h[(i + 1) % h.length]; per += Math.hypot(b[0] - a[0], b[1] - a[1]); }
  ok(near(per, C.beltLength(n1, n2, c, pm), 1e-4), `belt length vs sampled hull perimeter: ${per.toFixed(5)} vs ${C.beltLength(n1, n2, c, pm).toFixed(5)}`);
}
// gears
ok(near(C.gearCenter({ teeth: 14 }, { teeth: 60 }), 1.85, 1e-12), "20DP 14t + 60t = 1.850\"");
ok(near(C.gearCenter({ teeth: 8, cdTeeth: 10 }, { teeth: 50 }), 1.5, 1e-12), "8t (10t CD) + 50t spaces like 10t + 50t = 1.500\"");
ok(near(C.gearCenter({ teeth: 12 }, { teeth: 50 }, 20, 0.003), 1.553, 1e-12), "with +0.003\" adder");
// motors: Kraken X60 trap through 10:1, 2 motors
{
  const m = C.motorOut({ freeRPM: 6000, stallNm: 7.09, stallA: 366, freeA: 2 }, 2, 10, 1, 40);
  ok(near(m.freeRPM, 600, 1e-9) && near(m.stallNm, 141.8, 1e-9), `X60 x2 @10:1 → ${m.freeRPM} RPM, ${m.stallNm.toFixed(1)} N·m stall`);
  ok(near(m.limitNm, 7.09 / 364 * 38 * 20, 1e-9), `torque at 40 A limit ${m.limitNm.toFixed(2)} N·m`);
}
// plate outline sanity: square of 4 shafts, perimeter = square perimeter + 2*pi*r
{
  const segs = C.plateOutline([[0, 0], [2, 0], [2, 2], [0, 2]], 0.5);
  let per = 0; for (const s of segs) { if (s.type === "line") per += Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]); else { let d = s.to - s.from; while (d < 0) d += 2 * Math.PI; per += d * s.r; } }
  ok(near(per, 8 + Math.PI, 1e-9), `plate outline perimeter ${per.toFixed(6)} = 8 + pi`);
  const two = C.plateOutline([[0, 0], [3, 0]], 0.5);
  let p2 = 0; for (const s of two) { if (s.type === "line") p2 += Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]); else { let d = s.to - s.from; while (d < 0) d += 2 * Math.PI; p2 += d * s.r; } }
  ok(near(p2, 6 + Math.PI, 1e-9), `two-shaft outline perimeter ${p2.toFixed(6)} = 6 + pi`);
}
// mixed radii: two circles r=1 at 0 and r=0.5 at 4 -> perimeter = belt-style wrap
{
  const segs = C.plateOutline([[0, 0], [4, 0]], [1, 0.5]);
  let per = 0; for (const s of segs) { if (s.type === "line") per += Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]); else { let d = s.to - s.from; while (d < 0) d += 2 * Math.PI; per += d * s.r; } }
  const phi = Math.asin(0.5 / 4), expect = 2 * Math.sqrt(16 - 0.25) + 1 * (Math.PI + 2 * phi) + 0.5 * (Math.PI - 2 * phi);
  ok(near(per, expect, 1e-9), `mixed-radius outline perimeter ${per.toFixed(6)} = ${expect.toFixed(6)}`);
  const inner = C.plateOutline([[0, 0], [0.2, 0]], [2, 0.5]);
  ok(inner.length === 1 && inner[0].type === "circle" && inner[0].r === 2, "a circle inside another collapses to one circle");
}
// parts file loads and every gear has a bore
const parts = JSON.parse(fs.readFileSync(new URL("../wcp-parts.json", import.meta.url)));
ok(parts.gears.every((g) => g.bore && g.teeth > 0 && /^WCP-\d{4}$/.test(g.sku)), `all ${parts.gears.length} gears have sku, teeth, bore`);
ok(parts.belts.every((b) => b.teeth > 0), "all belts have tooth counts");
console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
