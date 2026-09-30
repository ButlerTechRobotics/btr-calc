// Headless check of BTR Calc: every tab renders, the gearbox designer solves, downloads work, no console errors.
// Needs Playwright (npm i playwright) and a local server: python3 -m http.server 8822
import { chromium } from "playwright";
import fs from "fs";
const OUT = process.env.OUT || "/tmp/claude-0/calc-shots";
fs.mkdirSync(OUT, { recursive: true });
const scheme = process.env.SCHEME || "light";
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 1400, height: 950 }, colorScheme: scheme, acceptDownloads: true });
const errors = [];
page.on("console", (m) => { if (m.type() === "error" && !/fonts\.googleapis|ERR_TUNNEL/.test(m.text())) errors.push(m.text()); });
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
await page.goto(process.env.URL || "http://127.0.0.1:8822/");
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForSelector("#gbStats .stat");
const txt = async (sel) => (await page.textContent(sel)).replace(/\s+/g, " ").trim();
console.log("gearbox stats:", await txt("#gbStats"));
console.log("warnings:", await txt("#gbWarn"));
console.log("holes:", await txt("#gbHoleTable"));
console.log("bom:", (await txt("#gbBom")).slice(0, 400));
await page.screenshot({ path: `${OUT}/gearbox-${scheme}.png`, fullPage: true });

// add a belt stage and a chain stage
await page.click('[data-add="belt"]');
await page.click('[data-add="chain"]');
console.log("after adding belt+chain:", await txt("#gbStats"));
console.log("stage headers:", (await page.$$eval(".stage-h", (els) => els.map((e) => e.innerText.replace(/\s+/g, " ")))).join(" | "));
console.log("warnings:", await txt("#gbWarn"));
await page.selectOption("#gbMech", "linear");
await page.fill("#gbDia", "1.5"); await page.fill("#gbMass", "15");
console.log("mech:", await txt("#gbMechOut"));
await page.screenshot({ path: `${OUT}/gearbox-4stage-${scheme}.png`, fullPage: true });
// motor switch to Vortex: stage 1 pinion must switch to 8mm key
await page.selectOption("#gbMotor", "vortex");
console.log("vortex stage1:", await page.$eval('.stage[data-i="0"] select[data-k="driver"]', (s) => s.options[s.selectedIndex].text));
console.log("vortex stats:", await txt("#gbStats"));
// downloads
for (const [btn, label] of [["#gbDxf", "dxf"], ["#gbCsv", "csv"], ["#gbSave", "json"]]) {
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click(btn)]);
  const p = `${OUT}/${dl.suggestedFilename()}`; await dl.saveAs(p);
  console.log(label, dl.suggestedFilename(), fs.statSync(p).size, "bytes");
}
// share link round trip
const link = await page.evaluate(() => { let u = ""; const orig = navigator.clipboard.writeText; return new Promise((res) => { navigator.clipboard.writeText = async (t) => { u = t; res(t); }; document.getElementById("gbShare").click(); setTimeout(() => res(u), 500); }); });
console.log("share link length:", link.length);
const p2 = await browser.newPage({ viewport: { width: 1200, height: 900 } });
await p2.goto(link); await p2.waitForSelector("#gbStats .stat");
console.log("from link:", (await p2.textContent("#gbStats")).replace(/\s+/g, " ").trim(), "| stages", await p2.$$eval(".stage", (e) => e.length));
await p2.close();

// other tabs
for (const tab of ["chain", "belt", "gears", "parts"]) {
  await page.click(`nav.tabs button[data-tab="${tab}"]`);
  await page.waitForTimeout(200);
  const sel = { chain: "#chStats", belt: "#btStats", gears: "#gpStats", parts: "#ptCount" }[tab];
  console.log(tab + ":", await txt(sel));
  if (tab === "chain") console.log("chain table:", (await txt("#chTable")).slice(0, 300));
  if (tab === "belt") console.log("belt table:", (await txt("#btTable")).slice(0, 300));
  await page.screenshot({ path: `${OUT}/${tab}-${scheme}.png`, fullPage: true });
}
await page.fill("#ptSearch", "60t"); await page.waitForTimeout(100); console.log("search 60t:", await txt("#ptCount"));
await page.selectOption("#ptKind", "motors"); await page.waitForTimeout(100); console.log("motors rows:", await page.$$eval("#ptTable tr", (r) => r.length));

await page.click('nav.tabs button[data-tab="gearbox"]');
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(300);
console.log("phone scrollWidth:", await page.evaluate(() => document.documentElement.scrollWidth));
console.log(await page.evaluate(() => { const out = []; for (const el of document.querySelectorAll("body *")) { const r = el.getBoundingClientRect(); if (r.right > 392 && r.width > 0 && !el.closest(".tablewrap")) out.push(el.tagName + "#" + el.id + "." + el.className + " w=" + Math.round(r.width) + " right=" + Math.round(r.right)); } return out.slice(0, 12).join("\n"); }));
await page.screenshot({ path: `${OUT}/phone-${scheme}.png` });
console.log("errors:", errors.length ? errors.join("\n") : "none");
await browser.close();
