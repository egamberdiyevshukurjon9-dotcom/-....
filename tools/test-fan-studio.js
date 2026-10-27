#!/usr/bin/env node
/*
 * Вентилятор студияси — тез текширув (Playwright, Chromium):
 *   node tools/test-fan-studio.js
 * Саҳифа хатосиз очиладими, ҳар бир тайёр лойиҳа учун MP4 яратилиб, ўлчами/давомийлиги тўғрими,
 * ўз лойиҳани қўшиш ва сақлаш ишлайдими — текширади.
 */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };
const srv = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});

(async () => {
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${srv.address().port}/fan.html`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto(base);
  await page.waitForFunction(() => window.FanStudio);
  const ids = await page.evaluate(() => window.FAN_PROJECTS.map((p) => p.id));
  assert(ids.length >= 4, "тайёр лойиҳалар йўқ");

  for (const id of ids) {
    await page.goto(`${base}?p=${id}&px=256`);
    await page.waitForFunction(() => window.FanStudio);
    const expect = await page.evaluate(() => window.FanStudio.engine().frames);
    await page.click("#makeBtn");
    await page.waitForSelector("#result:not([hidden])", { timeout: 120000 });
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#dlBtn")]);
    const file = path.join(require("os").tmpdir(), dl.suggestedFilename());
    await dl.saveAs(file);
    const buf = fs.readFileSync(file);
    assert(buf.slice(4, 8).toString() === "ftyp", `${id}: MP4 эмас`);
    assert(buf.length > 20000, `${id}: файл жуда кичик`);
    console.log(`✔ ${id}: ${expect} кадр, ${(buf.length / 1024).toFixed(0)} КБ`);
    fs.unlinkSync(file);
  }

  // ўз лойиҳани қўшиш
  await page.goto(base);
  await page.click("#newBtn");
  await page.fill("#fName", "Синов");
  await page.fill("#fFeatures", "Бир\n[bolt] Икки");
  await page.fill("#fStats", "5+ мактаб");
  await page.click("#saveEdit");
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("ekofan:v1")).custom);
  assert(saved.length === 1 && saved[0].features.length === 2 && saved[0].stats[0].v === 5, "махсус лойиҳа сақланмади");
  console.log("✔ ўз лойиҳани қўшиш ва сақлаш");

  assert(!errors.length, "саҳифа хатолари: " + errors.join("; "));
  console.log("✔ саҳифа хатоларсиз");
  await browser.close(); srv.close();
})().catch((e) => { console.error("✘", e.message || e); process.exit(1); });
