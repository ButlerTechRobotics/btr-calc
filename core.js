// BTR Calc — calculation core. Pure functions, no DOM. Lengths in inches unless a name says otherwise.
export const MM = 25.4;
export const NM_TO_INLB = 8.850746;

// ---------------------------------------------------------------- chain
export const CHAIN_PITCH = { "25": 0.25, "25H": 0.25, "35": 0.375 };
export const sprocketPD = (teeth, pitch) => pitch / Math.sin(Math.PI / teeth);
export const sprocketOD = (teeth, pitch) => pitch * (0.6 + 1 / Math.tan(Math.PI / teeth));

// Wrap geometry shared by chain and belts: two pitch circles R1, R2 at centre distance C.
// phi is the tangent-line angle; the small wheel wraps (pi - 2phi), the large one (pi + 2phi).
function wrap(R1, R2, C) {
  const s = (R2 - R1) / C;
  if (Math.abs(s) >= 1) return null;
  const phi = Math.asin(s);
  return { phi, span: Math.sqrt(C * C - (R2 - R1) * (R2 - R1)), wrap1: Math.PI - 2 * phi, wrap2: Math.PI + 2 * phi };
}

// Chain length in links (pitches) for a centre distance: links wrapped on each sprocket plus the two straight spans.
export function chainLinks(n1, n2, C, pitch) {
  const [a, b] = n1 <= n2 ? [n1, n2] : [n2, n1];
  const R1 = sprocketPD(a, pitch) / 2, R2 = sprocketPD(b, pitch) / 2;
  const w = wrap(R1, R2, C);
  if (!w) return NaN;
  return (a * w.wrap1) / (2 * Math.PI) + (b * w.wrap2) / (2 * Math.PI) + (2 * w.span) / pitch;
}

// Classic ANSI approximation, used only to cross-check chainLinks in tests.
export function chainLinksANSI(n1, n2, C, pitch) {
  const d = (n2 - n1) / (2 * Math.PI);
  return (2 * C) / pitch + (n1 + n2) / 2 + (d * d * pitch) / C;
}

// Invert a monotone length(C) function by bisection.
function solveC(lenFn, target, lo, hi) {
  let fLo = lenFn(lo);
  if (!(fLo <= target)) return NaN;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2, f = lenFn(mid);
    if (!(f < target)) hi = mid; else lo = mid;
    if (hi - lo < 1e-9) break;
  }
  return (lo + hi) / 2;
}

export function minCenter(R1, R2) { return Math.abs(R2 - R1) + 1e-6; }

export function chainCenterForLinks(n1, n2, links, pitch) {
  const R1 = sprocketPD(Math.min(n1, n2), pitch) / 2, R2 = sprocketPD(Math.max(n1, n2), pitch) / 2;
  return solveC((C) => chainLinks(n1, n2, C, pitch), links, minCenter(R1, R2), links * pitch);
}

// All the facts about one chain run.
export function chainRun(n1, n2, C, pitch) {
  const [a, b] = n1 <= n2 ? [n1, n2] : [n2, n1];
  const R1 = sprocketPD(a, pitch) / 2, R2 = sprocketPD(b, pitch) / 2;
  const w = wrap(R1, R2, C);
  if (!w) return null;
  const wrapDeg = (w.wrap1 * 180) / Math.PI;
  const engaged = (a * w.wrap1) / (2 * Math.PI);
  const warnings = [];
  if (wrapDeg < 120) warnings.push(`Only ${wrapDeg.toFixed(0)}° of wrap on the ${a}t sprocket — aim for at least 120°.`);
  if (engaged < 3) warnings.push(`Only ${engaged.toFixed(1)} teeth engaged on the ${a}t sprocket.`);
  if (C < (sprocketOD(a, pitch) + sprocketOD(b, pitch)) / 2 + 0.05) warnings.push("The sprockets touch at this centre distance.");
  return { C, links: chainLinks(n1, n2, C, pitch), wrapDeg, engaged, pd1: 2 * R1, pd2: 2 * R2, od1: sprocketOD(a, pitch), od2: sprocketOD(b, pitch), warnings };
}

// Options around a target centre distance: nearest even link counts (and odd ones, which need a half link).
export function chainOptions(n1, n2, targetC, pitch) {
  const L = chainLinks(n1, n2, targetC, pitch);
  if (!isFinite(L)) return { ideal: NaN, options: [] };
  const cands = new Set();
  for (let k = Math.floor(L) - 2; k <= Math.ceil(L) + 2; k++) if (k > 0) cands.add(k);
  const options = [...cands].map((links) => {
    const C = chainCenterForLinks(n1, n2, links, pitch);
    return { links, C, even: links % 2 === 0, delta: C - targetC, run: chainRun(n1, n2, C, pitch) };
  }).filter((o) => isFinite(o.C)).sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta));
  return { ideal: L, options };
}

// ---------------------------------------------------------------- timing belts
export const BELT = {
  HTD5: { pitchMm: 5, pld: 0.5715 / MM, label: "HTD 5mm" },   // pitch line differential (belt pitch line below the pulley OD)
  GT2: { pitchMm: 3, pld: 0.381 / MM, label: "GT2 3mm" },
};
export const pulleyPD = (teeth, pitchMm) => (teeth * pitchMm) / MM / Math.PI;
export const pulleyOD = (teeth, profile) => pulleyPD(teeth, BELT[profile].pitchMm) - 2 * BELT[profile].pld;

// Pitch length of a belt around two pulleys at centre distance C (exact tangent geometry).
export function beltLength(n1, n2, C, pitchMm) {
  const R1 = pulleyPD(Math.min(n1, n2), pitchMm) / 2, R2 = pulleyPD(Math.max(n1, n2), pitchMm) / 2;
  const w = wrap(R1, R2, C);
  if (!w) return NaN;
  return 2 * w.span + R1 * w.wrap1 + R2 * w.wrap2;
}
export const beltTeethAt = (n1, n2, C, pitchMm) => beltLength(n1, n2, C, pitchMm) / (pitchMm / MM);

export function beltCenterForTeeth(n1, n2, beltTeeth, pitchMm) {
  const R1 = pulleyPD(Math.min(n1, n2), pitchMm) / 2, R2 = pulleyPD(Math.max(n1, n2), pitchMm) / 2;
  const L = (beltTeeth * pitchMm) / MM;
  return solveC((C) => beltLength(n1, n2, C, pitchMm), L, minCenter(R1, R2), L);
}

export function beltRun(n1, n2, C, profile) {
  const pm = BELT[profile].pitchMm;
  const [a, b] = n1 <= n2 ? [n1, n2] : [n2, n1];
  const R1 = pulleyPD(a, pm) / 2, R2 = pulleyPD(b, pm) / 2;
  const w = wrap(R1, R2, C);
  if (!w) return null;
  const wrapDeg = (w.wrap1 * 180) / Math.PI;
  const inMesh = (a * w.wrap1) / (2 * Math.PI);
  const warnings = [];
  if (inMesh < 6) warnings.push(`Only ${inMesh.toFixed(1)} teeth in mesh on the ${a}t pulley — belts can skip below about 6.`);
  if (C < (pulleyOD(a, profile) + pulleyOD(b, profile)) / 2 + 0.1) warnings.push("The pulleys are nearly touching at this centre distance.");
  return { C, teeth: beltTeethAt(n1, n2, C, pm), wrapDeg, inMesh, pd1: 2 * R1, pd2: 2 * R2, od1: pulleyOD(a, profile), od2: pulleyOD(b, profile), warnings };
}

// Belts from a list (the WCP parts), ranked by how close they land to the target centre distance.
export function beltOptions(n1, n2, targetC, profile, belts, extraC = 0) {
  const pm = BELT[profile].pitchMm;
  const ideal = beltTeethAt(n1, n2, targetC, pm);
  const options = belts.map((belt) => {
    const C = beltCenterForTeeth(n1, n2, belt.teeth, pm) + extraC;
    return { belt, C, delta: C - targetC, run: beltRun(n1, n2, C, profile) };
  }).filter((o) => isFinite(o.C) && o.run).sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta));
  return { ideal, options };
}

// ---------------------------------------------------------------- gears
export const gearPD = (teeth, dp) => teeth / dp;
export const gearOD = (teeth, dp) => (teeth + 2) / dp;
// Profile-shifted pinions ("8t, 10t centre distance") mesh at the spacing of a bigger gear: use cdTeeth for spacing.
export const gearCenter = (g1, g2, dp = 20, extra = 0) => ((g1.cdTeeth || g1.teeth) + (g2.cdTeeth || g2.teeth)) / (2 * dp) + extra;

// ---------------------------------------------------------------- motors
export function motorOut(mode, count, ratio, efficiency = 1, currentLimit = null) {
  const freeRPM = mode.freeRPM / ratio;
  const stallNm = mode.stallNm * count * ratio * efficiency;
  const kt = mode.stallNm / (mode.stallA - mode.freeA);               // N·m per amp, one motor
  let limitNm = null;
  if (currentLimit && currentLimit > mode.freeA) limitNm = Math.min(mode.stallNm, kt * (currentLimit - mode.freeA)) * count * ratio * efficiency;
  return { freeRPM, stallNm, limitNm };
}

// ---------------------------------------------------------------- geometry helpers for the plate
export function convexHull(pts) {
  const p = pts.map((q, i) => ({ x: q[0], y: q[1], i })).sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p.map((q) => [q.x, q.y]);
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo = [], hi = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 1e-12) lo.pop(); lo.push(q); }
  for (const q of p.slice().reverse()) { while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], q) <= 1e-12) hi.pop(); hi.push(q); }
  return lo.slice(0, -1).concat(hi.slice(0, -1)).map((q) => [q.x, q.y]);
}

// Plate outline: the convex hull of circles (shaft centre + clearance radius each), as lines and arcs, counter-clockwise.
// radii can be one number or one per centre. Works out which circles touch the hull by sampling, then joins them
// with exact tangent lines and arcs, so the DXF gets true arcs.
export function plateOutline(centers, radii) {
  const R = centers.map((_, i) => (Array.isArray(radii) ? radii[i] : radii));
  const circles = [];
  centers.forEach((c, i) => { if (!circles.some((q) => Math.hypot(q.c[0] - c[0], q.c[1] - c[1]) < 1e-9 && q.r >= R[i])) circles.push({ c, r: R[i] }); });
  if (circles.length === 1) return [{ type: "circle", c: circles[0].c, r: circles[0].r }];
  const N = 720, pts = [];
  circles.forEach((q, k) => { for (let i = 0; i < N; i++) { const a = (2 * Math.PI * i) / N; pts.push([q.c[0] + q.r * Math.cos(a), q.c[1] + q.r * Math.sin(a), k]); } });
  const hull = convexHull(pts.map((p) => [p[0], p[1]]));
  const owner = (h) => { let best = 0, bd = Infinity; circles.forEach((q, k) => { const d = Math.abs(Math.hypot(h[0] - q.c[0], h[1] - q.c[1]) - q.r); if (d < bd) { bd = d; best = k; } }); return best; };
  let seq = hull.map(owner).filter((k, i, a) => k !== a[(i + a.length - 1) % a.length]);
  if (!seq.length) seq = [0];
  seq = seq.filter((k, i, a) => a.length === 1 || k !== a[(i + 1) % a.length] || i === a.length - 1);
  if (seq.length === 1) return [{ type: "circle", c: circles[seq[0]].c, r: circles[seq[0]].r }];
  // outer tangent from circle A to circle B, hull on the left (outward normal on the right of travel)
  const tangentNormal = (A, B) => {
    const dx = B.c[0] - A.c[0], dy = B.c[1] - A.c[1], d = Math.hypot(dx, dy);
    const al = Math.atan2(dy, dx), be = Math.acos(Math.max(-1, Math.min(1, (A.r - B.r) / d)));
    return al - be;
  };
  const segs = [], n = seq.length;
  const ang = seq.map((k, i) => tangentNormal(circles[k], circles[seq[(i + 1) % n]]));
  for (let i = 0; i < n; i++) {
    const A = circles[seq[i]], B = circles[seq[(i + 1) % n]], t = ang[i];
    segs.push({ type: "line", a: [A.c[0] + A.r * Math.cos(t), A.c[1] + A.r * Math.sin(t)], b: [B.c[0] + B.r * Math.cos(t), B.c[1] + B.r * Math.sin(t)] });
    segs.push({ type: "arc", c: B.c, r: B.r, from: t, to: ang[(i + 1) % n] });
  }
  return segs;
}
