#!/usr/bin/env node
/*
 * ЭкоГолограмма — голографик LED-вентилятор учун тайёр MP4 видеолар.
 *
 * hologram.html?mode=fan саҳифасини браузерда (Playwright) «сунъий вақт» билан
 * кадрма-кадр ҳисоблайди, ffmpeg эса H.264 MP4 га йиғади. Натижа равон (кадр тушиб
 * қолмайди) ва компьютер тезлигига боғлиқ эмас.
 *
 * Талаб: Node 18+, `npm i -D playwright && npx playwright install chromium`, ffmpeg.
 *
 *   node tools/render-fan-videos.js                  # 7 саҳна, 1080×1080, 30 кадр/с, 24 с
 *   node tools/render-fan-videos.js --px 1024 --seconds 30 --scenes 1,3,4 --out fan-videos
 *   node tools/render-fan-videos.js --all            # қўшимча: барча саҳналар битта видеода
 */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { chromium } = require("playwright");

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf("--" + name); return i >= 0 ? args[i + 1] : def; };
const PX = parseInt(opt("px", "1080"), 10);
const FPS = parseInt(opt("fps", "30"), 10);
const SECONDS = parseFloat(opt("seconds", "24"));
const OUT = path.resolve(opt("out", "fan-videos"));
const ROOT = path.resolve(__dirname, "..");
const NAMES = ["01-yer", "02-suv-aylanishi", "03-daraxt", "04-orol", "05-iqlim", "06-qayta-ishlash", "07-yashil-energiya"];
const SCENES = opt("scenes", "1,2,3,4,5,6,7").split(",").map(Number);

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

// Саҳифадаги вақт ва requestAnimationFrame'ни биз бошқарамиз: __step(ms) — битта кадр
const VIRTUAL_TIME = `(() => {
  let now = 0, queue = [];
  performance.now = () => now;
  Date.now = () => 1700000000000 + now;
  window.requestAnimationFrame = (cb) => { queue.push(cb); return queue.length; };
  window.cancelAnimationFrame = () => {};
  window.__step = (ms, type) => {
    now += ms;
    const q = queue; queue = [];
    q.forEach((cb) => cb(now));
    return document.querySelector("#holo").toDataURL(type || "image/png");
  };
})();`;

function ffmpeg(file) {
  const p = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-i", "-",
    "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", file], { stdio: ["pipe", "inherit", "inherit"] });
  const done = new Promise((ok, fail) => p.on("close", (c) => (c ? fail(new Error("ffmpeg " + c)) : ok())));
  return { write: (buf) => new Promise((r) => (p.stdin.write(buf) ? r() : p.stdin.once("drain", r))), end: () => { p.stdin.end(); return done; } };
}

async function render(browser, base, scene, frames, file) {
  const page = await browser.newPage({ viewport: { width: 800, height: 800 } });
  await page.addInitScript(VIRTUAL_TIME);
  await page.goto(`${base}/hologram.html?mode=fan&ui=0&px=${PX}&scene=${scene}&auto=${frames > SECONDS * FPS ? 1 : 0}`);
  await page.evaluate(() => document.fonts.ready);
  for (let i = 0; i < 3; i++) await page.evaluate(() => window.__step(0)); // ёзувлар шрифт юклангач қайта чизилади
  const enc = ffmpeg(file);
  const dt = 1000 / FPS;
  for (let f = 0; f < frames; f++) {
    const url = await page.evaluate(([ms]) => window.__step(ms, "image/jpeg"), [dt]);
    await enc.write(Buffer.from(url.slice(url.indexOf(",") + 1), "base64"));
    if (f % FPS === 0) process.stdout.write(`\r${path.basename(file)}: ${Math.round((f / frames) * 100)}%  `);
  }
  await enc.end();
  await page.close();
  process.stdout.write(`\r${path.basename(file)}: тайёр            \n`);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}`;
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  try {
    for (const n of SCENES) await render(browser, base, n, Math.round(SECONDS * FPS), path.join(OUT, `${NAMES[n - 1]}-${PX}.mp4`));
    if (args.includes("--all")) await render(browser, base, 1, Math.round(SECONDS * FPS * NAMES.length), path.join(OUT, `00-hammasi-${PX}.mp4`));
  } finally {
    await browser.close();
    srv.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
