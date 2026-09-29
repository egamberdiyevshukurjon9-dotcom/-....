// WCAG 2.2 AA текшируви (axe-core) — турли ҳолатларда: кирилл/лотин, ёруғ/қоронғи, очиқ ойналар.
// Ишлатиш: npm run test:a11y   (сервер автоматик ишга тушади)
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const AXE = await readFile(require.resolve("axe-core/axe.min.js"), "utf8");
const ROOT = new URL("..", import.meta.url).pathname;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };

const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
  const file = join(ROOT, path.endsWith("/") ? path + "index.html" : path);
  try {
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404); res.end();
  }
}).listen(0);
const BASE = `http://localhost:${server.address().port}/`;

const local = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const browser = await chromium.launch(existsSync(local) ? { executablePath: local } : {});

const SCENARIOS = [
  { name: "кирилл, ёруғ", url: "?lang=cyr", scheme: "light" },
  { name: "лотин, ёруғ", url: "?lang=lat", scheme: "light" },
  { name: "кирилл, қоронғи", url: "?lang=cyr", scheme: "dark" },
  { name: "дарс ойнаси", url: "?lang=cyr", scheme: "light", open: '#courseGrid [data-c="asoslar"][data-l="0"]' },
  { name: "ҳайвон ойнаси, қоронғи", url: "?lang=cyr", scheme: "dark", open: "#libGrid .lib-card" },
  { name: "телефон, меню очиқ", url: "?lang=cyr", scheme: "light", width: 390, open: "#menuBtn" },
  { name: "тест жавоблари, қоронғи", url: "?lang=cyr", scheme: "dark", open: '#courseGrid [data-c="korxona"][data-l="0"]', then: ['.q[data-q="0"] .opt[data-a="0"]', '.q[data-q="1"] .opt[data-a="0"]'] },
  { name: "махфийлик ойнаси", url: "?lang=lat", scheme: "light", open: "#privacyBtn" }
];

let failed = 0;

// 1) CSP: сайтнинг ўз коди хавфсизлик сиёсатини бузмаслиги керак (CSP четлаб ўтилмайди)
{
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  const page = await ctx.newPage();
  const bad = [];
  page.on("console", (m) => { if (m.type() === "error" && /Content Security Policy/i.test(m.text())) bad.push(m.text()); });
  page.on("pageerror", (e) => bad.push(e.message));
  await page.goto(BASE + "?lang=lat");
  await page.waitForTimeout(800);
  await page.locator('#courseGrid [data-c="asoslar"][data-l="0"]').first().click();
  await page.locator("#modalClose").click();
  await page.locator("#libGrid .lib-card").first().click();
  await page.locator("#modalClose").click();
  const cspOk = (await page.locator("#courseGrid .course").count()) === 3 && bad.length === 0;
  console.log(`${cspOk ? "✓" : "✗"} CSP: ${bad.length} та бузилиш`);
  bad.slice(0, 5).forEach((b) => console.log("   " + b.slice(0, 200)));
  if (!cspOk) failed++;
  await ctx.close();
}

// 2) WCAG 2.2 AA (axe-core'ни юклаш учун CSP четлаб ўтилади)
for (const s of SCENARIOS) {
  const ctx = await browser.newContext({ viewport: { width: s.width || 1280, height: 900 }, colorScheme: s.scheme, serviceWorkers: "block", bypassCSP: true });
  const page = await ctx.newPage();
  // Ташқи API ўрнига барқарор намуна маълумотлар (ҳаво сифати карточкалари ҳам текширилсин)
  await page.route(/open-meteo\.com/, (r) => {
    const n = new URL(r.request().url()).searchParams.get("latitude").split(",").length;
    const body = Array.from({ length: n }, (_, i) => ({ current: { time: "2026-01-01T12:00", us_aqi: [20, 70, 120, 170, 250, null][i % 6], pm2_5: 10, pm10: 30, nitrogen_dioxide: 12 } }));
    r.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.route(/data\/ministry\.json/, (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({
    updated: new Date().toISOString(), sources: [{ id: "site", name: "eco.gov.uz", ok: true }],
    items: [{ title: "Namuna xabar", summary: "Sinov", date: new Date().toISOString(), url: "https://eco.gov.uz/uz/news/1", source: "site" }] }) }));
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE + s.url);
  await page.waitForTimeout(500);
  if (s.open) { await page.locator(s.open).first().click(); await page.waitForTimeout(300); }
  for (const sel of s.then || []) { await page.locator(sel).first().click(); await page.waitForTimeout(150); }
  await page.addScriptTag({ content: AXE });
  const res = await page.evaluate(() => window.axe.run(document, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] }
  }));
  const v = res.violations;
  const n = v.reduce((a, x) => a + x.nodes.length, 0) + errors.length;
  failed += n;
  console.log(`${n ? "✗" : "✓"} ${s.name}: ${v.length} қоида, ${n} элемент`);
  for (const x of v) {
    console.log(`   [${x.impact}] ${x.id}: ${x.help} (${x.nodes.length})`);
    for (const node of x.nodes.slice(0, process.env.ALL ? 99 : 3)) console.log(`      ${node.target.join(" ")} — ${node.failureSummary.split("\n").slice(1, 2).join(" ").trim()}`);
  }
  for (const e of errors) console.log(`   JS хато: ${e}`);
  await ctx.close();
}
await browser.close();
server.close();
if (failed) { console.log(`\nЖами муаммолар: ${failed}`); process.exit(1); }
console.log("\nWCAG 2.2 AA: муаммо топилмади");
