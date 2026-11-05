/* Eko-JARVIS — kamera orqali qoʻl harakati bilan boshqariladigan ekologik golografik stol.
   Qoʻlni tanish: MediaPipe Hand Landmarker (brauzer ichida, rasm internetga yuborilmaydi).
   Kamera boʻlmasa sichqoncha / sensorli ekran ham ishlaydi. */
"use strict";

const MP_VER = "0.10.14";
const MP_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VER}`;
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

const $ = (s) => document.querySelector(s);
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
/* One Euro filtri: sekin harakatda titramaydi, tez harakatda kechikmaydi */
class OneEuro {
  constructor(minCut = 1.2, beta = 0.02, dCut = 1) { this.minCut = minCut; this.beta = beta; this.dCut = dCut; this.x = null; this.dx = 0; }
  static a(cut, dt) { const r = 2 * Math.PI * cut * dt; return r / (r + 1); }
  f(v, dt) {
    if (this.x === null || dt <= 0) { this.x = v; this.dx = 0; return v; }
    const d = (v - this.x) / dt;
    this.dx = lerp(this.dx, d, OneEuro.a(this.dCut, dt));
    const cut = this.minCut + this.beta * Math.abs(this.dx);
    this.x = lerp(this.x, v, OneEuro.a(cut, dt));
    return this.x;
  }
  reset() { this.x = null; }
}
const C = "#38e1ff", C2 = "#22c55e", WARN = "#ffb020", DIM = "rgba(56,225,255,.35)";

/* ---------- Sozlamalar (brauzer xotirasida saqlanadi) ---------- */
const PREF = "ekotalim:jarvis";
const prefs = { mode: "oddiy", flipX: false, flipY: false, H: null, camId: "", pip: true,
  zone: 0.6,      // kamera kadrining qancha qismi butun ekranga toʻgʻri keladi (kichik = sezgir)
  smooth: 0.5,    // kursor silliqligi (0 = tez, 1 = juda silliq)
  dwell: true,    // tugma ustida ushlab turib bosish
  mirror: true,   // kamera foydalanuvchiga qarab turibdi (koʻzgu)
  autoCam: false, // keyingi ochishda kamerani oʻzi yoqish
};
try { Object.assign(prefs, JSON.parse(localStorage.getItem(PREF)) || {}); } catch (e) { /* xotira yoʻq */ }
const save = () => { try { localStorage.setItem(PREF, JSON.stringify(prefs)); } catch (e) { /* ignore */ } };
const qs = new URLSearchParams(location.search);
const MODES = { oddiy: "🖥 Oddiy ekran", quti: "🔷 Shisha quti", stol: "📽 Proyektor stoli" };
if (MODES[qs.get("mode")]) prefs.mode = qs.get("mode");
if (!MODES[prefs.mode]) prefs.mode = "oddiy";

const toastEl = $("#toast");
let toastT;
function toast(msg, ms = 2800) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toastT);
  toastT = setTimeout(() => toastEl.classList.remove("show"), ms);
}

/* ---------- Kanvas ---------- */
const cv = $("#stage");
const ctx = cv.getContext("2d");
let W = 0, H = 0, DPR = 1;
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = innerWidth; H = innerHeight;
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
}
addEventListener("resize", resize);
resize();

/* Ekran (jismoniy) nuqtasini rasm ichidagi nuqtaga aylantirish: aks ettirish CSS orqali qilinadi */
const toContent = (x, y) => [prefs.flipX ? W - x : x, prefs.flipY ? H - y : y];

/* ---------- Kursor va bosish ---------- */
const cur = { x: W / 2, y: H / 2, seen: 0, pinch: false, src: "mouse", dwellId: null, dwellT: 0 };
let drag = null; // {x, y, lastX, lastY}
let ui = []; // shu kadrdagi tugmalar
const DWELL = 1.0;

function pressAt(x, y) {
  const hit = ui.find((u) => x >= u.x && x <= u.x + u.w && y >= u.y && y <= u.y + u.h);
  if (hit) { hit.on(); flash(hit); if (hit.id === "slider") dragStart(x, y); return true; }
  return false;
}
let flashBox = null;
function flash(u) { flashBox = { ...u, t: performance.now() }; }

function dragStart(x, y) { drag = { x, y, lastX: x, lastY: y, sx: x, sy: y }; }
function dragMove(x, y) {
  if (!drag) return;
  const dx = x - drag.lastX, dy = y - drag.lastY;
  drag.lastX = x; drag.lastY = y;
  scenes[S.scene].drag?.(dx, dy, x, y);
}
function dragEnd() { drag = null; }

/* Sichqoncha / sensor */
cv.addEventListener("pointermove", (e) => {
  const [x, y] = toContent(e.clientX, e.clientY);
  if (cur.src !== "hand" || performance.now() - cur.seen > 800) { cur.x = x; cur.y = y; cur.src = "mouse"; cur.seen = performance.now(); }
  if (drag && cur.src === "mouse") dragMove(x, y);
  wake();
});
cv.addEventListener("pointerdown", (e) => {
  const [x, y] = toContent(e.clientX, e.clientY);
  cur.x = x; cur.y = y; cur.src = "mouse"; cur.seen = performance.now();
  if (S.cal) return calTap(x, y);
  if (!pressAt(x, y)) dragStart(x, y);
});
addEventListener("pointerup", () => { if (cur.src === "mouse") dragEnd(); });

/* ---------- Sahnalar holati ---------- */
const S = { scene: 0, t0: performance.now(), rotLon: 64, rotLat: 22, auto: true, year: 1960, trees: 1, stage: -1, cal: null };

function goScene(i) {
  S.scene = (i + scenes.length) % scenes.length;
  S.t0 = performance.now();
  S.stage = -1;
}

/* ---------- Chizish yordamchilari ---------- */
function glow(color = C, blur = 12) { ctx.shadowColor = color; ctx.shadowBlur = blur; }
function noGlow() { ctx.shadowBlur = 0; }
function text(str, x, y, size = 16, color = C, align = "left", weight = 600) {
  ctx.font = `${weight} ${size}px Inter, system-ui, "Segoe UI", sans-serif`;
  ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = "middle";
  ctx.fillText(str, x, y);
}
function mono(str, x, y, size = 12, color = DIM, align = "left") {
  ctx.font = `500 ${size}px ui-monospace, "Cascadia Mono", Consolas, monospace`;
  ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = "middle";
  ctx.fillText(str, x, y);
}
function wrap(str, x, y, maxW, size = 15, color = "#cfefff", lh = 1.4) {
  ctx.font = `400 ${size}px Inter, system-ui, sans-serif`;
  ctx.fillStyle = color; ctx.textAlign = "left"; ctx.textBaseline = "top";
  let line = "", yy = y;
  for (const w of str.split(" ")) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, x, yy); line = w; yy += size * lh; } else line = test;
  }
  if (line) ctx.fillText(line, x, yy);
  return yy + size * lh;
}
function frame(x, y, w, h, color = C, cut = 12) {
  ctx.beginPath();
  ctx.moveTo(x + cut, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + h - cut);
  ctx.lineTo(x + w - cut, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + cut); ctx.closePath();
  ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke();
}
function panel(x, y, w, h, title) {
  ctx.fillStyle = "rgba(4, 24, 32, .55)";
  ctx.fillRect(x, y, w, h);
  glow(C, 8); frame(x, y, w, h); noGlow();
  if (title) { mono(title.toUpperCase(), x + 14, y + 16, 11, C); ctx.fillStyle = DIM; ctx.fillRect(x + 14, y + 28, w - 28, 1); }
}
function ring(x, y, r, t, color = C) {
  ctx.strokeStyle = color; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
  ctx.lineWidth = 3;
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(x, y, r + 8, t + i * TAU / 3, t + i * TAU / 3 + 0.7); ctx.stroke(); }
  ctx.lineWidth = 1;
  for (let i = 0; i < 60; i++) {
    const a = i / 60 * TAU, l = i % 5 ? 4 : 9;
    ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * (r + 14), y + Math.sin(a) * (r + 14));
    ctx.lineTo(x + Math.cos(a) * (r + 14 + l), y + Math.sin(a) * (r + 14 + l)); ctx.stroke();
  }
}
/* Bosiladigan tugma (kursor ustida turganda toʻladi) */
function button(id, x, y, w, h, label, on, active = false) {
  ui.push({ id, x, y, w, h, on });
  const hover = cur.dwellId === id;
  ctx.fillStyle = active ? "rgba(56,225,255,.22)" : hover ? "rgba(56,225,255,.14)" : "rgba(4,24,32,.6)";
  ctx.fillRect(x, y, w, h);
  glow(active || hover ? C : "transparent", 10); frame(x, y, w, h, active || hover ? C : DIM, 8); noGlow();
  if (hover && prefs.dwell && cur.src === "hand") { ctx.fillStyle = "rgba(56,225,255,.35)"; ctx.fillRect(x, y + h - 3, w * clamp(cur.dwellT / DWELL, 0, 1), 3); }
  text(label, x + w / 2, y + h / 2, Math.min(15, h * 0.36, w / (label.length * 0.62 + 1)), active ? "#fff" : C, "center");
}

/* ---------- Fon ---------- */
function background(t) {
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(56,225,255,.06)"; ctx.lineWidth = 1;
  const g = 48;
  for (let x = (W / 2) % g; x < W; x += g) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = (H / 2) % g; y < H; y += g) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  // burchak belgilari
  ctx.strokeStyle = DIM; ctx.lineWidth = 2;
  for (const [x, y, sx, sy] of [[16, 16, 1, 1], [W - 16, 16, -1, 1], [16, H - 16, 1, -1], [W - 16, H - 16, -1, -1]]) {
    ctx.beginPath(); ctx.moveTo(x, y + sy * 30); ctx.lineTo(x, y); ctx.lineTo(x + sx * 30, y); ctx.stroke();
  }
  mono("EKO-JARVIS · EKOTAʼLIM", 28, H - 30, 11, DIM);
  const d = new Date();
  mono(d.toLocaleTimeString("uz-UZ", { hour12: false }), W - 28, H - 30, 11, DIM, "right");
}

/* ---------- 1. Yer ---------- */
const GEO = window.HOLO_GEO || { land: [], uz: [] };
function proj(lon, lat, cx, cy, r) {
  const l = (lon - S.rotLon) * Math.PI / 180, p = lat * Math.PI / 180, p0 = S.rotLat * Math.PI / 180;
  const x = Math.cos(p) * Math.sin(l);
  const y = Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(l);
  const z = Math.sin(p0) * Math.sin(p) + Math.cos(p0) * Math.cos(p) * Math.cos(l);
  return [cx + x * r, cy - y * r, z];
}
function polyline(ring, cx, cy, r, step = 2) {
  let pen = false;
  ctx.beginPath();
  for (let i = 0; i < ring.length; i += step) {
    const [x, y, z] = proj(ring[i], ring[i + 1], cx, cy, r);
    if (z > 0) { pen ? ctx.lineTo(x, y) : ctx.moveTo(x, y); pen = true; } else pen = false;
  }
  ctx.stroke();
}
const earth = {
  name: "Yer",
  draw(t) {
    if (S.auto && !drag) S.rotLon += 0.08;
    const r = Math.min(W, H) * 0.3, cx = W / 2, cy = H / 2 + 10;
    ring(cx, cy, r + 10, t * 0.4);
    const grd = ctx.createRadialGradient(cx - r * .3, cy - r * .3, r * .1, cx, cy, r);
    grd.addColorStop(0, "rgba(56,225,255,.16)"); grd.addColorStop(1, "rgba(56,225,255,.03)");
    ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = "rgba(56,225,255,.12)"; ctx.lineWidth = 1;
    for (let lat = -60; lat <= 60; lat += 30) { const pts = []; for (let lo = -180; lo <= 180; lo += 5) pts.push(lo, lat); polyline(pts, cx, cy, r, 2); }
    for (let lo = -180; lo < 180; lo += 30) { const pts = []; for (let la = -90; la <= 90; la += 5) pts.push(lo, la); polyline(pts, cx, cy, r, 2); }
    glow(C, 6); ctx.strokeStyle = C; ctx.lineWidth = 1.2;
    for (const ln of GEO.land) polyline(ln, cx, cy, r);
    glow(C2, 14); ctx.strokeStyle = C2; ctx.lineWidth = 2.5;
    for (const ln of GEO.uz) polyline(ln, cx, cy, r, 2);
    noGlow();
    const [ux, uy, uz] = proj(64.5, 41.4, cx, cy, r);
    if (uz > 0) {
      ctx.strokeStyle = C2; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(ux, uy); ctx.lineTo(ux + 60, uy - 50); ctx.lineTo(ux + 170, uy - 50); ctx.stroke();
      text("OʻZBEKISTON", ux + 64, uy - 62, 13, C2);
    }
    const pw = Math.min(260, W * 0.24);
    if (W > 720) {
      panel(28, 90, pw, 190, "Sayyora holati");
      text("≈ 425 ppm", 44, 140, 26, "#fff"); mono("HAVODAGI CO₂ (2025)", 44, 164, 11);
      text("≈ +1,5 °C", 44, 205, 26, WARN); mono("ISISH (1850–1900 GA NISBATAN)", 44, 229, 11);
      mono("Manba: NOAA, WMO · taxminiy", 44, 258, 10, DIM);
      panel(W - pw - 28, 90, pw, 150, "Boshqaruv");
      wrap("Chimdib suring: Yerni aylantiring. Ochiq kaftni silkiting: keyingi sahna.", W - pw - 14, 128, pw - 30, 13);
      button("auto", W - pw - 14, 192, pw - 28, 34, S.auto ? "⏸ Aylanishni toʻxtatish" : "▶ Aylantirish", () => { S.auto = !S.auto; });
    }
  },
  drag(dx, dy) { S.auto = false; S.rotLon -= dx * 0.3; S.rotLat = clamp(S.rotLat + dy * 0.3, -80, 80); },
};

/* ---------- 2. Suv tozalash ---------- */
const STAGES = [
  { n: "Ifloslangan suv", s: "Kanal, zovur va sanoat oqova suvi: loyqa, neft qoldigʻi, nitrat va bakteriyalar.", c: "#b9854a" },
  { n: "Mexanik filtr", s: "Qum va toʻr filtrlar yirik zarrachalar va loyqani ushlab qoladi.", c: "#c9a46a" },
  { n: "Ozon (O₃)", s: "Ozon bakteriya va viruslarni oʻldiradi, hid va rangni yoʻqotadi. Xlorsiz zararsizlantirish.", c: "#7fd0d8" },
  { n: "Mg-biochar", s: "Magniy bilan boyitilgan bioko‘mir fosfat, nitrat va ogʻir metallarni shimib oladi.", c: "#5ad7f0" },
  { n: "Toza suv", s: "Sugʻorish yoki texnik ehtiyoj uchun qayta foydalanishga tayyor suv. Quyosh panellaridan quvvat oladi.", c: C },
];
const drops = Array.from({ length: 70 }, () => ({ p: Math.random(), o: Math.random() * 2 - 1, v: 0.0012 + Math.random() * 0.0012 }));
const water = {
  name: "Suv tozalash",
  draw(t) {
    const n = STAGES.length, mx = W * 0.08, y = H * 0.42, span = W - mx * 2, bw = Math.min(150, span / n - 18), bh = 92;
    text("SUV TOZALASH TIZIMI", W / 2, 96, Math.min(30, W * 0.04), "#fff", "center", 700);
    mono("BOSQICHNI TANLANG", W / 2, 126, 11, DIM, "center");
    ctx.strokeStyle = DIM; ctx.lineWidth = 10; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(mx, y); ctx.lineTo(W - mx, y); ctx.stroke(); ctx.lineCap = "butt";
    for (const d of drops) {
      d.p += d.v; if (d.p > 1) d.p -= 1;
      const k = Math.min(n - 1, Math.floor(d.p * n));
      ctx.fillStyle = STAGES[k].c;
      ctx.beginPath(); ctx.arc(mx + d.p * span, y + d.o * 3, 2.6, 0, TAU); ctx.fill();
    }
    for (let i = 0; i < n; i++) {
      const cx = mx + span * (i + 0.5) / n, bx = cx - bw / 2, by = y - bh / 2;
      const on = S.stage === i;
      button("st" + i, bx, by, bw, bh, "", () => { S.stage = on ? -1 : i; }, on);
      glow(STAGES[i].c, 10);
      ctx.strokeStyle = STAGES[i].c; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, by + 30, 13 + Math.sin(t * 2 + i) * 2, 0, TAU); ctx.stroke(); noGlow();
      mono(String(i + 1).padStart(2, "0"), cx, by + 30, 11, "#fff", "center");
      text(STAGES[i].n, cx, by + bh - 22, Math.min(14, bw / 9), on ? "#fff" : C, "center");
    }
    const pw = Math.min(560, W - 56), px = (W - pw) / 2, py = y + bh / 2 + 34;
    const st = STAGES[S.stage] || { n: "Qanday ishlaydi", s: "Har bir bosqich suvni bir qadam tozalaydi. Bosqich ustiga barmoq bilan ishora qilib chimdang yoki 1 soniya ushlab turing." };
    panel(px, py, pw, 128, st.n);
    wrap(st.s, px + 16, py + 40, pw - 32, 15);
  },
};

/* ---------- 3. Orol dengizi ---------- */
const ARAL = [[1960, 68000], [1990, 36500], [2005, 17400], [2014, 8300], [2025, 7500]]; // km², taxminiy
function aralArea(y) {
  for (let i = 1; i < ARAL.length; i++) if (y <= ARAL[i][0]) { const [y0, a0] = ARAL[i - 1], [y1, a1] = ARAL[i]; return lerp(a0, a1, (y - y0) / (y1 - y0)); }
  return ARAL[ARAL.length - 1][1];
}
function blob(cx, cy, rx, ry, seed, t) {
  ctx.beginPath();
  for (let i = 0; i <= 64; i++) {
    const a = i / 64 * TAU, k = 1 + 0.12 * Math.sin(a * 3 + seed) + 0.07 * Math.sin(a * 5 + seed * 2) + 0.01 * Math.sin(t + a * 8);
    const x = cx + Math.cos(a) * rx * k, y = cy + Math.sin(a) * ry * k;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
}
const aral = {
  name: "Orol",
  draw(t) {
    const cx = W / 2, cy = H * 0.46, R = Math.min(W, H) * 0.26, f = aralArea(S.year) / ARAL[0][1];
    text("OROL DENGIZI", cx, 96, Math.min(30, W * 0.04), "#fff", "center", 700);
    ctx.setLineDash([6, 6]); ctx.strokeStyle = DIM; ctx.lineWidth = 1.5;
    blob(cx, cy, R * 0.8, R, 1.3, 0); ctx.stroke(); ctx.setLineDash([]);
    mono("1960 YILGI QIRGʻOQ", cx + R * 0.8, cy - R * 0.9, 11, DIM, "center");
    const s = Math.sqrt(f);
    ctx.fillStyle = "rgba(56,225,255,.18)"; glow(C, 16); ctx.strokeStyle = C; ctx.lineWidth = 2;
    if (S.year < 1988) { blob(cx, cy, R * 0.8 * s, R * s, 1.3, t); ctx.fill(); ctx.stroke(); }
    else { // dengiz ikkiga boʻlingan: Kichik (shimol) va Katta (janub)
      blob(cx - R * 0.25, cy - R * 0.62, R * 0.2, R * 0.16, 2.1, t); ctx.fill(); ctx.stroke();
      blob(cx - R * 0.05, cy + R * 0.1, R * 0.62 * s, R * 0.9 * s, 0.7, t); ctx.fill(); ctx.stroke();
    }
    noGlow();
    // Yil shkalasi (suring yoki bosing)
    const sx = W * 0.15, sw = W * 0.7, sy = H - 120;
    ctx.strokeStyle = DIM; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + sw, sy); ctx.stroke();
    for (const [y] of ARAL) { const x = sx + sw * (y - 1960) / 65; ctx.fillStyle = DIM; ctx.fillRect(x - 1, sy - 6, 2, 12); mono(String(y), x, sy + 20, 11, DIM, "center"); }
    const kx = sx + sw * (S.year - 1960) / 65;
    glow(C, 12); ctx.fillStyle = C; ctx.beginPath(); ctx.arc(kx, sy, 9, 0, TAU); ctx.fill(); noGlow();
    ui.push({ id: "slider", x: sx - 10, y: sy - 24, w: sw + 20, h: 48, on: () => { S.year = clamp(Math.round(1960 + (cur.x - sx) / sw * 65), 1960, 2025); } });
    const pw = Math.min(250, W * 0.26);
    if (W > 700) {
      panel(28, 140, pw, 150, "Yil: " + Math.round(S.year));
      text(Math.round(aralArea(S.year)).toLocaleString("ru-RU") + " km²", 44, 196, 24, "#fff");
      text(Math.round(f * 100) + "% qoldi", 44, 234, 20, f < 0.3 ? WARN : C2);
      mono("Taxminiy maʼlumot", 44, 270, 10, DIM);
      panel(W - pw - 28, 140, pw, 150, "Nima boʻldi?");
      wrap("1960-yillardan Amudaryo va Sirdaryo suvi paxta dalalariga burildi. Dengiz qurib, tuzli changli boʻronlar paydo boʻldi.", W - pw - 14, 178, pw - 30, 13);
    }
  },
  drag(dx) { S.year = clamp(S.year + dx * 0.12, 1960, 2025); },
};

/* ---------- 4. Quyosh energiyasi ---------- */
const solar = {
  name: "Quyosh",
  draw(t) {
    const day = ((performance.now() - S.t0) / 12000) % 1; // 12 soniyada bir kun
    const hour = 5 + day * 15, sunUp = hour > 6 && hour < 19;
    const cx = W / 2, base = H * 0.66, R = Math.min(W * 0.36, H * 0.4);
    text("QUYOSH ELEKTR STANSIYASI · 150 kW", cx, 96, Math.min(26, W * 0.035), "#fff", "center", 700);
    ctx.strokeStyle = DIM; ctx.setLineDash([4, 6]); ctx.beginPath(); ctx.arc(cx, base, R, Math.PI, 0); ctx.stroke(); ctx.setLineDash([]);
    const a = Math.PI + clamp((hour - 6) / 13, 0, 1) * Math.PI, sxp = cx + Math.cos(a) * R, syp = base + Math.sin(a) * R;
    if (sunUp) { glow(WARN, 30); ctx.fillStyle = WARN; ctx.beginPath(); ctx.arc(sxp, syp, 18, 0, TAU); ctx.fill(); noGlow(); }
    const power = sunUp ? 150 * Math.pow(Math.sin(clamp((hour - 6) / 13, 0, 1) * Math.PI), 1.4) : 0;
    // panellar qatori
    const rows = 6, pw = Math.min(70, W / 14);
    for (let i = 0; i < rows; i++) {
      const x = cx - (rows / 2) * (pw + 12) + i * (pw + 12) + 6;
      ctx.fillStyle = `rgba(56,225,255,${0.1 + power / 150 * 0.35})`;
      ctx.beginPath(); ctx.moveTo(x, base); ctx.lineTo(x + pw, base); ctx.lineTo(x + pw - 10, base - 30); ctx.lineTo(x + 10, base - 30); ctx.closePath(); ctx.fill();
      glow(C, 6); ctx.strokeStyle = C; ctx.lineWidth = 1.2; ctx.stroke(); noGlow();
      if (sunUp && power > 5) { ctx.strokeStyle = `rgba(255,176,32,${power / 300})`; ctx.beginPath(); ctx.moveTo(sxp, syp); ctx.lineTo(x + pw / 2, base - 30); ctx.stroke(); }
    }
    // energiya oqimi: panel → nasos (suv tozalash)
    const fx = cx + (rows / 2) * (pw + 12) + 20;
    ctx.strokeStyle = DIM; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(fx, base - 15); ctx.lineTo(Math.min(W - 60, fx + 120), base - 15); ctx.stroke();
    for (let k = 0; k < 4 && power > 1; k++) { const p = (t * 0.8 + k / 4) % 1; ctx.fillStyle = C2; ctx.beginPath(); ctx.arc(fx + p * Math.min(120, W - 60 - fx), base - 15, 3, 0, TAU); ctx.fill(); }
    mono("→ NASOS · OZON", Math.min(W - 60, fx + 120), base - 34, 11, C2, "right");
    const hh = Math.floor(hour), mm = Math.floor((hour % 1) * 60);
    panel(28, H - 210, Math.min(300, W - 56), 150, "Hozir " + String(hh).padStart(2, "0") + ":" + String(mm).padStart(2, "0"));
    text(power.toFixed(0) + " kW", 44, H - 150, 28, power > 1 ? "#fff" : DIM);
    mono("Kuniga ≈ 750 kWh · yiliga ≈ 240 MWh", 44, H - 112, 11, C);
    mono("CO₂ tejaladi: yiliga ≈ 120 t (taxminiy)", 44, H - 92, 11, C2);
  },
};

/* ---------- 5. Daraxt ---------- */
function branch(x, y, len, ang, depth, t, maxD) {
  if (depth > maxD) return;
  const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
  ctx.strokeStyle = depth > maxD - 2 ? C2 : C; ctx.lineWidth = Math.max(1, (maxD - depth + 1) * 0.9);
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke();
  const sway = Math.sin(t * 1.3 + depth) * 0.04;
  branch(x2, y2, len * 0.74, ang - 0.42 + sway, depth + 1, t, maxD);
  branch(x2, y2, len * 0.74, ang + 0.38 + sway, depth + 1, t, maxD);
}
const tree = {
  name: "Daraxt",
  draw(t) {
    const grow = clamp((performance.now() - S.t0) / 2500, 0, 1), maxD = Math.round(2 + grow * 7);
    text("DARAXT EKING", W / 2, 96, Math.min(30, W * 0.04), "#fff", "center", 700);
    const n = Math.min(S.trees, 7), gap = W / (n + 1);
    glow(C2, 8);
    for (let i = 0; i < n; i++) branch(gap * (i + 1), H * 0.8, Math.min(H * 0.12, 90) * (i === 0 ? 1 : 0.7), -Math.PI / 2, 0, t + i, i === 0 ? maxD : Math.min(maxD, 7));
    noGlow();
    ctx.strokeStyle = DIM; ctx.beginPath(); ctx.moveTo(40, H * 0.8); ctx.lineTo(W - 40, H * 0.8); ctx.stroke();
    const pw = Math.min(300, W - 56);
    panel(28, 140, pw, 170, "Siz ekkan daraxtlar: " + S.trees);
    text("≈ " + (S.trees * 22).toLocaleString("ru-RU") + " kg CO₂", 44, 196, 24, "#fff"); mono("YILIGA YUTADI (1 DARAXT ≈ 22 KG)", 44, 220, 11);
    button("plant", 44, 246, pw - 32, 40, "🌱 Yana bitta daraxt ekish", () => { S.trees++; });
  },
};

const scenes = [earth, water, aral, solar, tree];

/* ---------- Pastki menyu ---------- */
function nav() {
  const n = scenes.length, bw = Math.min(150, (W - 56) / n - 8), bh = 44, total = n * (bw + 8) - 8;
  let x = (W - total) / 2;
  const y = H - bh - 52;
  if (scenes[S.scene] === aral || scenes[S.scene] === solar) return; // bu sahnalarda pastki joy band
  for (let i = 0; i < n; i++, x += bw + 8) button("nav" + i, x, y, bw, bh, scenes[i].name, () => goScene(i), i === S.scene);
}
function topNav() {
  if (!(scenes[S.scene] === aral || scenes[S.scene] === solar)) return;
  button("prev", 28, 80, 46, 40, "‹", () => goScene(S.scene - 1));
  button("next", W - 74, 80, 46, 40, "›", () => goScene(S.scene + 1));
}

/* ---------- Kursor ---------- */
function drawCursor(t) {
  if (performance.now() - cur.seen > 1500) return;
  const r = cur.pinch ? 10 : 18;
  glow(C, 16); ctx.strokeStyle = cur.pinch ? "#fff" : C; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cur.x, cur.y, r, 0, TAU); ctx.stroke();
  ctx.beginPath(); ctx.arc(cur.x, cur.y, r + 8, t * 3, t * 3 + 1.2); ctx.stroke();
  if (cur.pinch) { ctx.fillStyle = C; ctx.beginPath(); ctx.arc(cur.x, cur.y, 4, 0, TAU); ctx.fill(); }
  noGlow();
}

/* ---------- Kalibrlash (kamera → ekran, 4 burchak) ---------- */
const CAL_PTS = () => [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]].map(([a, b]) => [a * W, b * H]);
function calStart() {
  if (!hand.on) { toast("Avval 📷 kamerani yoqing"); return; }
  S.cal = { i: 0, cam: [], hold: 0 };
  toast("Nishonga koʻrsatkich barmoqni tekkizib, chimdang (yoki 1,5 soniya ushlab turing)", 5000);
}
function calTap() { /* sichqoncha bilan kalibrlash maʼnosiz: faqat qoʻl */ }
function calStep(raw, pinchStart, still, dt) {
  const c = S.cal;
  c.hold = still ? c.hold + dt : 0;
  if (pinchStart || c.hold > 1.5) {
    c.cam.push(raw); c.i++; c.hold = 0;
    if (c.i >= 4) {
      // ekran nuqtalari jismoniy (aks ettirilmagan) koordinatada
      const scr = CAL_PTS().map(([x, y]) => [x / W, y / H]);
      const Hm = homography(c.cam, scr);
      if (Hm) { prefs.H = Hm; save(); toast("✅ Kalibrlash tayyor"); } else toast("Kalibrlash boʻlmadi, qayta urinib koʻring");
      S.cal = null;
    }
  }
}
function drawCal(t) {
  const pts = CAL_PTS();
  ctx.fillStyle = "rgba(0,0,0,.7)"; ctx.fillRect(0, 0, W, H);
  text("KALIBRLASH " + (S.cal.i + 1) + " / 4", W / 2, H / 2 - 20, 26, "#fff", "center", 700);
  mono("Yonib turgan nishonga barmoqni tekkizing va chimdang", W / 2, H / 2 + 16, 13, C, "center");
  pts.forEach(([x, y], i) => {
    const [cx, cy] = toContent(x, y), on = i === S.cal.i, done = i < S.cal.i;
    ctx.strokeStyle = done ? C2 : on ? C : DIM; ctx.lineWidth = 2; glow(on ? C : "transparent", 14);
    ctx.beginPath(); ctx.arc(cx, cy, on ? 22 + Math.sin(t * 6) * 4 : 14, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - 30, cy); ctx.lineTo(cx + 30, cy); ctx.moveTo(cx, cy - 30); ctx.lineTo(cx, cy + 30); ctx.stroke(); noGlow();
    if (on) { ctx.fillStyle = C; ctx.beginPath(); ctx.arc(cx, cy, 22, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(S.cal.hold / 1.5, 0, 1)); ctx.lineTo(cx, cy); ctx.fill(); }
  });
}
/* 4 nuqtadan proyektiv oʻzgartirish (8×8 tenglama, Gauss usuli) */
function homography(src, dst) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  for (let c = 0; c < 8; c++) {
    let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-9) return null;
    [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
    for (let r = 0; r < 8; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k]; b[r] -= f * b[c]; }
  }
  return b.map((v, i) => v / A[i][i]).concat(1);
}
function applyH(Hm, x, y) {
  const d = Hm[6] * x + Hm[7] * y + Hm[8];
  return [(Hm[0] * x + Hm[1] * y + Hm[2]) / d, (Hm[3] * x + Hm[4] * y + Hm[5]) / d];
}

/* ---------- Qoʻlni tanish ---------- */
const hand = { on: false, lm: null, video: $("#cam"), stream: null, last: -1, pinch: false, palmHist: [], swipeT: 0, prevRaw: null };
let HandLandmarker, FilesetResolver;

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) { toast("Bu brauzer kamerani qoʻllamaydi. Chrome yoki Edge’da oching.", 5000); return; }
  if (!window.isSecureContext) { toast("Kamera faqat https:// yoki localhost orqali ishlaydi", 5000); return; }
  if (hand.starting) return;
  hand.starting = true;
  $("#start")?.classList.add("hide");
  setStatus("load");
  try {
    toast("Qoʻlni taniydigan model yuklanmoqda… (birinchi marta 10–30 soniya)", 8000);
    if (!HandLandmarker) ({ HandLandmarker, FilesetResolver } = await import(`${MP_URL}/vision_bundle.mjs`));
    if (!hand.lm) {
      const fs = await FilesetResolver.forVisionTasks(`${MP_URL}/wasm`);
      const opts = (delegate) => ({ baseOptions: { modelAssetPath: MODEL_URL, delegate }, runningMode: "VIDEO", numHands: 1, minHandDetectionConfidence: 0.6, minTrackingConfidence: 0.5 });
      try { hand.lm = await HandLandmarker.createFromOptions(fs, opts("GPU")); } catch (e) { hand.lm = await HandLandmarker.createFromOptions(fs, opts("CPU")); }
    }
    await openStream(prefs.camId);
    await listCams();
    hand.on = true;
    $("#camBtn").textContent = "📷 Kamera yoniq"; $("#camBtn").classList.remove("on");
    $("#camPip").hidden = !prefs.pip;
    prefs.autoCam = true; save();
    setStatus("lost");
    toast("✋ Qoʻlingizni kameraga koʻrsating. Chimdish = bosish, musht = pauza.", 4500);
  } catch (e) {
    setStatus("off");
    $("#start")?.classList.remove("hide");
    console.error(e);
    const msg = e?.name === "NotAllowedError" ? "Kameraga ruxsat berilmadi. Manzil satridagi 🔒 belgisidan ruxsat bering."
      : e?.name === "NotFoundError" ? "Kamera topilmadi. USB kamera yoki telefonni (Iriun/DroidCam) ulang."
      : "Kamerani yoqib boʻlmadi: internet aloqasini tekshiring (model birinchi marta yuklanadi).";
    toast(msg, 7000);
  } finally { hand.starting = false; }
}
async function openStream(id) {
  hand.stream?.getTracks().forEach((tr) => tr.stop());
  const v = { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } };
  if (id) v.deviceId = { exact: id };
  try { hand.stream = await navigator.mediaDevices.getUserMedia({ video: v, audio: false }); }
  catch (e) { if (!id) throw e; delete v.deviceId; hand.stream = await navigator.mediaDevices.getUserMedia({ video: v, audio: false }); }
  hand.video.srcObject = hand.stream;
  await hand.video.play();
}
async function listCams() {
  const sel = $("#camSel");
  const cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
  const curId = hand.stream?.getVideoTracks()[0]?.getSettings().deviceId;
  sel.innerHTML = "";
  cams.forEach((c, i) => { const o = document.createElement("option"); o.value = c.deviceId; o.textContent = c.label || "Kamera " + (i + 1); o.selected = c.deviceId === curId; sel.append(o); });
  sel.hidden = cams.length < 2;
}
$("#camSel").addEventListener("change", async (e) => {
  prefs.camId = e.target.value; save();
  try { await openStream(prefs.camId); toast("Kamera almashtirildi"); } catch (err) { toast("Bu kamerani ochib boʻlmadi"); }
});

const d2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const extended = (l, tip, pip) => d2(l[tip], l[0]) > d2(l[pip], l[0]) * 1.15;
const fx = new OneEuro(), fy = new OneEuro();
function setFilter() {
  // silliqlik sozlamasi → filtr chastotasi (px/s birligida)
  const m = lerp(3.5, 0.35, clamp(prefs.smooth, 0, 1));
  fx.minCut = fy.minCut = m; fx.beta = fy.beta = 0.004;
}
setFilter();

/* Kamera kadridagi nuqtani (0..1) ekran nuqtasiga aylantirish */
function camToScreen(raw) {
  if (prefs.H && prefs.mode === "stol") { const [u, w] = applyH(prefs.H, raw[0], raw[1]); return [u * W, w * H]; }
  const z = clamp(prefs.zone, 0.3, 1), cx = 0.5, cy = 0.45;
  const x = prefs.mirror ? 1 - raw[0] : raw[0];
  return [clamp((x - (cx - z / 2)) / z, 0, 1) * W, clamp((raw[1] - (cy - z / 2)) / z, 0, 1) * H];
}

function handLost() {
  if (hand.pinch && cur.src === "hand") dragEnd();
  hand.pinch = false; cur.pinch = false; hand.palmHist = []; hand.fistT = 0;
  fx.reset(); fy.reset();
  setStatus(hand.paused ? "pause" : "lost");
}

function handFrame(now, dt) {
  const v = hand.video;
  if (!hand.on || !hand.lm || v.readyState < 2 || v.currentTime === hand.last) return;
  const fdt = hand.lastNow ? (now - hand.lastNow) / 1000 : 1 / 30;
  hand.last = v.currentTime; hand.lastNow = now;
  let res;
  try { res = hand.lm.detectForVideo(v, now); } catch (e) { return; }
  const l = res.landmarks?.[0];
  drawPip(l);
  if (!l) return handLost();

  const t = performance.now();
  const fingersUp = [[8, 6], [12, 10], [16, 14], [20, 18]].map(([a, b]) => extended(l, a, b));
  const open = fingersUp.every(Boolean), fist = !fingersUp.some(Boolean);

  // Musht 1 soniya → qoʻl bilan boshqarishni toʻxtatish / davom ettirish
  if (fist && !hand.pinch) {
    hand.fistT = (hand.fistT || 0) + fdt;
    if (hand.fistT > 1 && !hand.fistDone) {
      hand.fistDone = true; hand.paused = !hand.paused;
      toast(hand.paused ? "⏸ Qoʻl boshqaruvi toʻxtatildi. Davom etish: yana musht qilib turing." : "▶ Qoʻl boshqaruvi yoqildi", 2500);
    }
  } else { hand.fistT = 0; hand.fistDone = false; }
  if (hand.paused) { setStatus("pause"); cur.pinch = false; return; }
  setStatus("ok");

  // Ishora nuqtasi. Proyektor stolida barmoq uchi (stolga tegadi);
  // boshqa rejimlarda koʻrsatkich barmoq ildizi (5) — chimdiganda siljimaydi, sichqonchadek barqaror.
  const tipMode = prefs.mode === "stol";
  const P = tipMode ? l[8] : { x: l[5].x * 0.7 + l[8].x * 0.3, y: l[5].y * 0.7 + l[8].y * 0.3 };
  const raw = [P.x, P.y];

  // Chimdish: bosh barmoq (4) va koʻrsatkich (8) uchlari yaqin
  const size = d2(l[0], l[9]) || 0.1, ratio = d2(l[4], l[8]) / size;
  const wasPinch = hand.pinch;
  hand.pinch = wasPinch ? ratio < 0.5 : ratio < 0.3; // gisterezis: titramasligi uchun
  cur.pinch = hand.pinch;
  const pinchStart = hand.pinch && !wasPinch;
  if (hand.pinch !== wasPinch) hand.freezeT = t + 140; // bosish paytida kursor sakramasin

  if (t >= (hand.freezeT || 0) || hand.pinch && drag) {
    const [sx, sy] = camToScreen(raw);
    const [tx, ty] = toContent(sx, sy);
    const fresh = cur.src !== "hand" || t - cur.seen > 400;
    if (fresh) { fx.reset(); fy.reset(); }
    cur.x = fx.f(tx, fdt); cur.y = fy.f(ty, fdt);
  }
  cur.src = "hand"; cur.seen = t;

  const still = hand.prevRaw ? Math.hypot(raw[0] - hand.prevRaw[0], raw[1] - hand.prevRaw[1]) < 0.006 : false;
  hand.prevRaw = raw;

  if (S.cal) { calStep([l[8].x, l[8].y], pinchStart, still, fdt); return; }
  if (pinchStart) { if (!pressAt(cur.x, cur.y)) dragStart(cur.x, cur.y); cur.dwellT = -0.6; }
  else if (hand.pinch) dragMove(cur.x, cur.y);
  else if (wasPinch) dragEnd();

  // Ochiq kaft silkinishi → sahna almashadi
  if (open && !hand.pinch) {
    const px = prefs.mirror ? 1 - l[9].x : l[9].x;
    hand.palmHist.push([t, px]);
    hand.palmHist = hand.palmHist.filter(([tt]) => t - tt < 300);
    const [t0, x0] = hand.palmHist[0];
    if (t - hand.swipeT > 900 && t - t0 > 120 && Math.abs(px - x0) > 0.22) {
      const dir = (px > x0 ? 1 : -1) * (prefs.flipX ? -1 : 1);
      goScene(S.scene + dir); hand.swipeT = t; hand.palmHist = [];
      toast(scenes[S.scene].name, 1200);
    }
  } else hand.palmHist = [];
}

/* Holat belgisi (yuqori oʻng burchak) */
const statusEl = $("#status");
let lastStatus = "";
function setStatus(st) {
  if (st === lastStatus || !statusEl) return;
  lastStatus = st;
  const T = { off: ["📷 Kamera oʻchiq", ""], ok: ["✋ Qoʻl topildi", "ok"], lost: ["… Qoʻlni kameraga koʻrsating", "warn"], pause: ["⏸ Pauza (musht = davom)", "warn"], load: ["⏳ Model yuklanmoqda…", "warn"] };
  const [txt, cls] = T[st] || T.off;
  statusEl.textContent = txt; statusEl.className = "status " + cls;
}

const pipCv = $("#camDraw"), pipCtx = pipCv.getContext("2d");
const BONES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [0, 17], [17, 18], [18, 19], [19, 20]];
function drawPip(l) {
  if ($("#camPip").hidden) return;
  const w = pipCv.width = 320, h = pipCv.height = 240;
  pipCtx.clearRect(0, 0, w, h);
  if (!l) return;
  pipCtx.strokeStyle = C; pipCtx.lineWidth = 2;
  for (const [a, b] of BONES) { pipCtx.beginPath(); pipCtx.moveTo(l[a].x * w, l[a].y * h); pipCtx.lineTo(l[b].x * w, l[b].y * h); pipCtx.stroke(); }
  pipCtx.fillStyle = hand.pinch ? "#fff" : C2;
  for (const p of [l[4], l[8]]) { pipCtx.beginPath(); pipCtx.arc(p.x * w, p.y * h, 5, 0, TAU); pipCtx.fill(); }
}

/* ---------- Asosiy sikl ---------- */
let lastT = performance.now();
function loop(now) {
  const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
  handFrame(now, dt);
  const t = now / 1000;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ui = [];
  background(t);
  scenes[S.scene].draw(t);
  nav(); topNav();
  // Kursor ustida turish (dwell) → bosish; faqat qoʻl bilan
  const over = ui.find((u) => cur.x >= u.x && cur.x <= u.x + u.w && cur.y >= u.y && cur.y <= u.y + u.h);
  if (over && cur.src === "hand" && !hand.pinch && !S.cal && now - cur.seen < 300) {
    if (cur.dwellId !== over.id) { cur.dwellId = over.id; cur.dwellT = 0; }
    if (prefs.dwell) cur.dwellT += dt;
    if (prefs.dwell && cur.dwellT >= DWELL && over.id !== "slider") { over.on(); flash(over); cur.dwellT = -1.2; }
  } else if (!over || cur.src !== "hand") { cur.dwellId = over && cur.src === "mouse" ? over.id : null; cur.dwellT = 0; }
  if (flashBox && now - flashBox.t < 250) { ctx.fillStyle = `rgba(255,255,255,${0.3 * (1 - (now - flashBox.t) / 250)})`; ctx.fillRect(flashBox.x, flashBox.y, flashBox.w, flashBox.h); }
  if (drag && ui.find((u) => u.id === "slider" && drag.sy >= u.y && drag.sy <= u.y + u.h)) ui.find((u) => u.id === "slider").on();
  if (S.cal) drawCal(t);
  drawCursor(t);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/* ---------- Boshqaruv paneli ---------- */
function applyPrefs() {
  document.body.classList.toggle("flipx", prefs.flipX);
  document.body.classList.toggle("flipy", prefs.flipY);
  $("#modeBtn").textContent = MODES[prefs.mode];
  $("#flipXBtn").classList.toggle("on", prefs.flipX);
  $("#flipYBtn").classList.toggle("on", prefs.flipY);
  $("#pipBtn").classList.toggle("on", prefs.pip);
  $("#calBtn").hidden = prefs.mode !== "stol";
  $("#camPip").classList.toggle("nomirror", !prefs.mirror);
  if (hand.on) $("#camPip").hidden = !prefs.pip;
}
function cycleMode() {
  const keys = Object.keys(MODES);
  prefs.mode = keys[(keys.indexOf(prefs.mode) + 1) % keys.length];
  if (prefs.mode === "quti") { prefs.flipX = true; toast("Shisha quti: tasvir koʻzgudek aks ettirildi. Teskari koʻrinsa ⇅ ni bosing.", 4000); }
  else if (prefs.mode === "stol") { prefs.flipX = false; toast(prefs.H ? "Proyektor stoli (kalibrlangan)" : "Proyektor stoli: 🎯 Kalibrlashni bir marta bajaring", 4000); }
  else { prefs.flipX = false; prefs.flipY = false; toast("Oddiy ekran"); }
  save(); applyPrefs();
}
$("#camBtn").onclick = () => (hand.on ? toast("Kamera allaqachon yoniq") : startCamera());
$("#modeBtn").onclick = cycleMode;
$("#flipXBtn").onclick = () => { prefs.flipX = !prefs.flipX; save(); applyPrefs(); };
$("#flipYBtn").onclick = () => { prefs.flipY = !prefs.flipY; save(); applyPrefs(); };
$("#calBtn").onclick = calStart;
$("#pipBtn").onclick = () => { prefs.pip = !prefs.pip; save(); applyPrefs(); };
$("#fsBtn").onclick = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.().catch(() => {}));
$("#helpBtn").onclick = () => $("#help").showModal();
$("#setBtn").onclick = () => { syncSettings(); $("#settings").showModal(); };

/* ---------- Sozlamalar oynasi ---------- */
const setIn = { zone: $("#sZone"), smooth: $("#sSmooth"), dwell: $("#sDwell"), mirror: $("#sMirror") };
function syncSettings() {
  setIn.zone.value = Math.round((1 - prefs.zone) * 100);
  setIn.smooth.value = Math.round(prefs.smooth * 100);
  setIn.dwell.checked = prefs.dwell; setIn.mirror.checked = prefs.mirror;
}
setIn.zone.oninput = () => { prefs.zone = 1 - setIn.zone.value / 100; save(); };
setIn.smooth.oninput = () => { prefs.smooth = setIn.smooth.value / 100; setFilter(); save(); };
setIn.dwell.onchange = () => { prefs.dwell = setIn.dwell.checked; save(); };
setIn.mirror.onchange = () => { prefs.mirror = setIn.mirror.checked; save(); applyPrefs(); };
$("#sReset").onclick = () => { Object.assign(prefs, { zone: 0.6, smooth: 0.5, dwell: true, mirror: true }); setFilter(); save(); syncSettings(); applyPrefs(); toast("Sozlamalar tiklandi"); };

/* ---------- Boshlash oynasi ---------- */
$("#startCam").onclick = () => startCamera();
$("#startMouse").onclick = () => { $("#start").classList.add("hide"); toast("Sichqoncha yoki barmoq bilan boshqaring. Kamerani keyin 📷 tugmasidan yoqasiz.", 4000); };
document.querySelectorAll("[data-close]").forEach((b) => (b.onclick = () => b.closest("dialog").close()));

addEventListener("keydown", (e) => {
  if (e.target.closest?.("select, input, dialog")) return;
  const k = e.key.toLowerCase();
  if (k === "arrowright") goScene(S.scene + 1);
  else if (k === "arrowleft") goScene(S.scene - 1);
  else if (k === "c") $("#camBtn").click();
  else if (k === "r") cycleMode();
  else if (k === "x") $("#flipXBtn").click();
  else if (k === "y") $("#flipYBtn").click();
  else if (k === "k") calStart();
  else if (k === "v") $("#pipBtn").click();
  else if (k === "f") $("#fsBtn").click();
  else if (k === "h") $("#helpBtn").click();
  else return;
  wake();
});

/* Panel 4 soniya harakatsizlikdan keyin yashirinadi */
const bar = $("#bar");
let idleT;
function wake() { bar.classList.remove("hide"); clearTimeout(idleT); idleT = setTimeout(() => { if (!bar.matches(":hover")) bar.classList.add("hide"); }, 4000); }
bar.addEventListener("pointerenter", wake);
wake();
applyPrefs();
setStatus("off");
if (window.JARVIS_STANDALONE) document.querySelectorAll("[data-site]").forEach((e) => e.remove());
// Avval ruxsat berilgan boʻlsa yoki ?cam=1 boʻlsa kamera oʻzi yoqiladi
(async () => {
  let granted = false;
  try { granted = (await navigator.permissions?.query({ name: "camera" }))?.state === "granted"; } catch (e) { /* qoʻllanmaydi */ }
  if (qs.get("cam") === "1" || (prefs.autoCam && granted)) startCamera();
})();

// Sinov uchun ichki holat (brauzer konsolida)
window.__jarvis = { S, cur, hand, prefs, scenes, homography, applyH, goScene };
