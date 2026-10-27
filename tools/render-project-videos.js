#!/usr/bin/env node
/*
 * ЭкоГолограмма — вентилятор студияси: барча лойиҳалар учун тайёр MP4 (бир буйруқ билан).
 *
 * fan.html саҳифасининг ўзини браузерда (Playwright) очиб, ҳар бир лойиҳа учун «MP4 яратиш» ни
 * босади — натижа телефондаги студия билан айнан бир хил (H.264, 30 кадр/с, кадр тушмайди).
 *
 * Талаб: Node 18+ ва `npm i -D playwright && npx playwright install chromium`.
 *
 *   node tools/render-project-videos.js                       # тайёр 4 лойиҳа, 720×720 → tayyor-videolar/
 *   node tools/render-project-videos.js --px 1080 --theme neon
 *   node tools/render-project-videos.js --json loyihalarim.json   # ўз лойиҳаларингиз (студиядаги «⬇ Файлга» файли)
 *   node tools/render-project-videos.js --only ekomun,ekogolo --out video
 */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf("--" + name); return i >= 0 ? args[i + 1] : def; };
const PX = parseInt(opt("px", "720"), 10);
const THEME = opt("theme", "");
const SPEED = opt("speed", "1");
const OUT = path.resolve(opt("out", "tayyor-videolar"));
const ONLY = opt("only", "") ? opt("only", "").split(",") : null;
const JSON_FILE = opt("json", "");
const ROOT = path.resolve(__dirname, "..");

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };
function serve() {
  const srv = http.createServer((req, res) => {
    const file = path.join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((r) => srv.listen(0, "127.0.0.1", () => r(srv)));
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}/fan.html`;
  const browser = await chromium.launch();

  // Ўз лойиҳалар файли → студиянинг localStorage'ига
  let custom = [];
  if (JSON_FILE) {
    const raw = JSON.parse(fs.readFileSync(JSON_FILE, "utf8"));
    custom = (Array.isArray(raw) ? raw : [raw]).map((p, i) => Object.assign({ id: "c-file" + i }, p, { id: "c-file" + i }));
  }
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 480, height: 900 } });
  if (custom.length) await ctx.addInitScript((c) => { try { localStorage.setItem("ekofan:v1", JSON.stringify({ custom: c })); } catch (e) { /* бўш */ } }, custom);

  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.error("Саҳифа хатоси:", e.message));
  await page.goto(`${base}?px=${PX}&speed=${SPEED}`);
  await page.waitForFunction(() => window.FanStudio);
  const list = await page.evaluate(() => [...window.FAN_PROJECTS, ...window.FanStudio.state.custom].map((p) => p.id));
  const ids = (ONLY || list).filter((id) => list.includes(id));
  if (!ids.length) { console.error("Лойиҳа топилмади."); process.exit(1); }

  for (const id of ids) {
    const q = `?p=${encodeURIComponent(id)}&px=${PX}&speed=${SPEED}` + (THEME ? `&theme=${THEME}` : "");
    await page.goto(base + q);
    await page.waitForFunction(() => window.FanStudio);
    const t0 = Date.now();
    await page.click("#makeBtn");
    await page.waitForSelector("#result:not([hidden])", { timeout: 15 * 60 * 1000 });
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#dlBtn")]);
    const file = path.join(OUT, dl.suggestedFilename());
    await dl.saveAs(file);
    console.log(`✔ ${path.relative(process.cwd(), file)}  (${(fs.statSync(file).size / 1048576).toFixed(1)} МБ, ${((Date.now() - t0) / 1000).toFixed(0)} с)`);
  }
  await browser.close();
  srv.close();
})().catch((e) => { console.error(e); process.exit(1); });
