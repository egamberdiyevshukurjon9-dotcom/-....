/* ЭкоГолограмма — вентилятор студияси: 3D моделлар (симли «голограмма» кўриниши).
 *
 * Лойиҳанинг 3D чизмаси (AGS_3D_model_lotin_2.html) жойлашуви ва ўлчамлари билан олинган:
 * бош режа 60 × 48 м, x — шарққа, y — юқорига, z — жанубга (шимол −z). Ўлчамлар метрда.
 * Тасвир қора фонда нурли чизиқлар: вентиляторда ёқилган LED ўрнини босади, қора жойда LED ўчиқ.
 *
 *   FanModels.ags     — иншоот: оқим бўйлаб 9 босқич (ҳар бири ўз ранги билан ёритилади)
 *   FanModels.region  — 6 туман модули + умумий ресурс маркази (қиш / ёз)
 *
 * Матнлар project.lang ("kiril" | "lotin") бўйича танланади.
 */
(function (global) {
  "use strict";
  const H = global.FanEngine._h;
  const { TAU, clamp, seg, smooth, E, layoutText, drawLines, arcText, glow } = H;

  const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

  /* ---------- Геометрия: ҳамма нарса кесмалар рўйхати [x1,y1,z1,x2,y2,z2,…] ---------- */
  const add = (a, x1, y1, z1, x2, y2, z2) => a.push(x1, y1, z1, x2, y2, z2);

  function rect(a, cx, y, cz, w, d) {
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    add(a, x0, y, z0, x1, y, z0); add(a, x1, y, z0, x1, y, z1); add(a, x1, y, z1, x0, y, z1); add(a, x0, y, z1, x0, y, z0);
  }
  function box(a, cx, y0, cz, w, h, d) {
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    rect(a, cx, y0, cz, w, d); rect(a, cx, y0 + h, cz, w, d);
    add(a, x0, y0, z0, x0, y0 + h, z0); add(a, x1, y0, z0, x1, y0 + h, z0); add(a, x1, y0, z1, x1, y0 + h, z1); add(a, x0, y0, z1, x0, y0 + h, z1);
  }
  /* Айлана: axis y — горизонтал, x — y–z текислигида, z — x–y текислигида */
  function ring(a, cx, cy, cz, r, axis = "y", n = 20) {
    let px, py, pz;
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * TAU, co = Math.cos(t) * r, si = Math.sin(t) * r;
      const x = axis === "y" ? cx + co : axis === "x" ? cx : cx + co;
      const y = axis === "y" ? cy : axis === "x" ? cy + co : cy + si;
      const z = axis === "y" ? cz + si : axis === "x" ? cz + si : cz;
      if (i) add(a, px, py, pz, x, y, z);
      px = x; py = y; pz = z;
    }
  }
  function cyl(a, cx, y0, cz, r, h, n = 20, r2 = r) {
    ring(a, cx, y0, cz, r, "y", n); ring(a, cx, y0 + h, cz, r2, "y", n);
    for (let i = 0; i < 4; i++) { const t = (i * TAU) / 4; add(a, cx + Math.cos(t) * r, y0, cz + Math.sin(t) * r, cx + Math.cos(t) * r2, y0 + h, cz + Math.sin(t) * r2); }
  }
  function hcyl(a, cx, cy, cz, r, len, n = 14) { // ўқи x бўйлаб
    ring(a, cx - len / 2, cy, cz, r, "x", n); ring(a, cx + len / 2, cy, cz, r, "x", n);
    for (let i = 0; i < 4; i++) { const t = (i * TAU) / 4; add(a, cx - len / 2, cy + Math.cos(t) * r, cz + Math.sin(t) * r, cx + len / 2, cy + Math.cos(t) * r, cz + Math.sin(t) * r); }
  }
  function poly(a, pts) { for (let i = 1; i < pts.length; i++) add(a, ...pts[i - 1], ...pts[i]); }
  /* x ўқи атрофида qiya панель (қуёш панели) */
  function panel(a, cx, cy, cz, w, d, tilt) {
    const c = Math.cos(tilt), s = Math.sin(tilt);
    const P = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([x, z]) => [cx + x, cy - z * s, cz + z * c]);
    poly(a, [...P, P[0]]);
    add(a, ...P[0].map((v, i) => (v + P[3][i]) / 2), ...P[1].map((v, i) => (v + P[2][i]) / 2));
  }

  const unit = (id) => ({ id, s: [], f: [] });
  const topFace = (u, cx, y, cz, w, d) => u.f.push([[cx - w / 2, y, cz - d / 2], [cx + w / 2, y, cz - d / 2], [cx + w / 2, y, cz + d / 2], [cx - w / 2, y, cz + d / 2]]);

  /* ---------- Камера ---------- */
  const o3 = [0, 0, 0, 0], p0 = [0, 0, 0, 0], p1 = [0, 0, 0, 0];
  function makeCam(yaw, pitch, scale, cy, F) {
    const cY = Math.cos(yaw), sY = Math.sin(yaw), cP = Math.cos(pitch), sP = Math.sin(pitch);
    return (x, y, z, out) => {
      const xr = x * cY + z * sY, zr = -x * sY + z * cY;
      const up = y * cP - zr * sP, dep = y * sP + zr * cP;
      const s = F / (F - dep);
      out[0] = xr * scale * s; out[1] = cy - up * scale * s; out[2] = dep; out[3] = s;
    };
  }

  /* Кесмаларни чизиш: узоқ — хиралаштирилган (чуқурлик белгиси) */
  function strokeSegs(c, cam, segs, color, alpha, lw) {
    if (!segs.length || alpha <= 0.01) return;
    const ga = c.globalAlpha, B = [[], [], []];
    for (let i = 0; i < segs.length; i += 6) {
      cam(segs[i], segs[i + 1], segs[i + 2], p0); cam(segs[i + 3], segs[i + 4], segs[i + 5], p1);
      const d = (p0[2] + p1[2]) / 2, b = d < -8 ? 0 : d < 14 ? 1 : 2;
      B[b].push(p0[0], p0[1], p1[0], p1[1]);
    }
    c.strokeStyle = color; c.lineWidth = lw; c.lineCap = "round"; c.lineJoin = "round";
    const al = [0.38, 0.68, 1];
    for (let b = 0; b < 3; b++) {
      const q = B[b]; if (!q.length) continue;
      c.globalAlpha = ga * alpha * al[b]; c.beginPath();
      for (let j = 0; j < q.length; j += 4) { c.moveTo(q[j], q[j + 1]); c.lineTo(q[j + 2], q[j + 3]); }
      c.stroke();
    }
    c.globalAlpha = ga;
  }
  function fillFaces(c, cam, faces, color, alpha) {
    if (!faces.length || alpha <= 0.01) return;
    const ga = c.globalAlpha; c.fillStyle = color; c.globalAlpha = ga * alpha;
    for (const f of faces) { c.beginPath(); f.forEach(([x, y, z], i) => { cam(x, y, z, o3); i ? c.lineTo(o3[0], o3[1]) : c.moveTo(o3[0], o3[1]); }); c.closePath(); c.fill(); }
    c.globalAlpha = ga;
  }

  /* Қувур: кесмалар + узунлик бўйича нуқталар */
  function makePipe(id, color, pts, speed = 0.1) {
    const segs = []; poly(segs, pts);
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]));
    return { id, color, pts, segs, cum, len: cum[cum.length - 1], speed };
  }
  function pointAt(pipe, f) {
    const L = pipe.len * f; let i = 1;
    while (i < pipe.cum.length - 1 && pipe.cum[i] < L) i++;
    const a = pipe.pts[i - 1], b = pipe.pts[i], t = (L - pipe.cum[i - 1]) / Math.max(1e-6, pipe.cum[i] - pipe.cum[i - 1]);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }
  function drawPipe(c, cam, pipe, on, t, lw, dotR) {
    strokeSegs(c, cam, pipe.segs, pipe.color, on > 0.02 ? 0.45 + 0.55 * on : 0.3, lw * (1 + 0.5 * on));
    if (on <= 0.05) return;
    const n = Math.max(3, Math.round(pipe.len / 3.2)), ga = c.globalAlpha;
    c.fillStyle = pipe.color; c.globalAlpha = ga * on;
    for (let i = 0; i < n; i++) {
      const q = pointAt(pipe, (((t * pipe.speed) + i / n) % 1 + 1) % 1);
      cam(q[0], q[1], q[2], o3);
      c.beginPath(); c.arc(o3[0], o3[1], dotR * o3[3], 0, TAU); c.fill();
    }
    c.globalAlpha = ga;
  }

  /* ---------- Матнлар ---------- */
  const STR = {
    kiril: {
      ags: [
        ["Механик тозалаш", "панжара · қум тутгич"],
        ["Буфер 250 м³", "оқим текисланади"],
        ["AGS реакторлари", "3 × 320 м³"],
        ["Диск фильтр", "муаллақ зарралар"],
        ["Озонлаш", "дори қолдиқлари −80 %"],
        ["Mg-биокўмир", "фосфор ≤ 0,5 мг/л"],
        ["УБ → тоза сув", "суғоришга тайёр"],
        ["Қуёш 150 кВт", "энергияни қоплайди"],
        ["Лой + ғўзапоя", "→ биокўмир, ўғит"],
      ],
      winter: ["Қиш: сув → марказ", "ер ости ҳовузлар (SAT)"],
      summer: ["Ёз: сув → суғориш", "~93 % қайта ишлатилади"],
      hub: "МАРКАЗ",
      dist: ["А", "Б", "В", "Г", "Д", "Е"],
    },
    lotin: {
      ags: [
        ["Mexanik tozalaş", "panjara · qum tutgiç"],
        ["Bufer 250 m³", "oqim tekişlanadi"],
        ["AGS reaktorlari", "3 × 320 m³"],
        ["Disk filtr", "muallaq zarralar"],
        ["Ozonlaş", "dori qoldiqlari −80 %"],
        ["Mg-biokömir", "fosfor ≤ 0,5 mg/l"],
        ["UB → toza suv", "suğoriş uçun tayyor"],
        ["Quyoş 150 kVt", "energiyani qoplaydi"],
        ["Loy + ğözapoya", "→ biokömir, öğit"],
      ],
      winter: ["Qiş: suv → markaz", "yer osti havzalar (SAT)"],
      summer: ["Yoz: suv → suğoriş", "~93 % qayta işlatiladi"],
      hub: "MARKAZ",
      dist: ["A", "B", "V", "G", "D", "Ye"],
    },
  };
  const strOf = (P) => STR[P.lang === "lotin" ? "lotin" : "kiril"];

  /* Оқим ранглари (лойиҳа чизмасидаги легенда, қора фонга ёрқинлаштирилган) */
  const COL = { raw: "#4da3ff", bio: "#22e0d6", filt: "#6fd6ff", oz: "#a98bff", clean: "#3dff8a", uv: "#b8ff3d", sludge: "#ff9a5c", air: "#cfe6f5", pv: "#ffd23f", kiln: "#ff7a3d" };

  const cache = {}; // сарлавҳа матнлари жойлашуви
  function caption(c, key, text, size, maxW, maxLines, min) {
    const k = key + "|" + text + "|" + size;
    return cache[k] || (cache[k] = layoutText(c, text, size, maxW, maxLines, min));
  }

  /* Саҳна остидаги тушунтириш: сарлавҳа + изоҳ (тўғри матн — вентиляторда энг яхши ўқилади) */
  function drawCaption(c, P, th, name, sub, a, slide) {
    const l1 = caption(c, "cn", name, 112, 1400, 2, 70), l2 = caption(c, "cs", sub, 92, 1250, 2, 60);
    c.save(); c.translate(0, (1 - slide) * 36);
    const y1 = 590 + (l1.lines.length - 1) * l1.size * 0.5;
    drawLines(c, l1, 0, y1, th.text, a);
    drawLines(c, l2, 0, y1 + l1.size * (l1.lines.length * 0.56) + l2.size * 0.9, th.a, a);
    c.restore();
  }

  /* Ер (ҳовли) тўри: 60 × 48 м чегара + ёрдамчи чизиқлар */
  function groundSegs(w, d, step) {
    const a = []; rect(a, 0, 0, 0, w, d);
    for (let x = -w / 2 + step; x < w / 2 - 0.1; x += step) add(a, x, 0, -d / 2, x, 0, d / 2);
    for (let z = -d / 2 + step; z < d / 2 - 0.1; z += step) add(a, -w / 2, 0, z, w / 2, 0, z);
    return a;
  }

  /* =====================================================================
     1) АГС иншооти
     ===================================================================== */
  const RX = [-1.35, 6.95, 15.25], RZ = -5.35, FZ = [-8.3, -4.5, -0.7], FX = 26.6;
  let AGS = null;
  function buildAgs() {
    const U = {}, mk = (id) => (U[id] = unit(id));
    const tank = (u, cx, cz, w, h, d, water) => { box(u.s, cx, 0, cz, w, h, d); if (water) rect(u.s, cx, water, cz, w - 0.6, d - 0.6); topFace(u, cx, water || h, cz, w - 0.6, d - 0.6); };

    { // 1. Механик тозалаш
      const u = mk("inlet"); tank(u, -23, -7.5, 10, 1.6, 2.4, 1.2);
      cyl(u.s, -20.5, 0, -5.1, 0.9, 2.2, 16); box(u.s, -25.5, 0, -5.3, 4, 3, 3);
      for (let i = 0; i < 5; i++) add(u.s, -26 + i * 0.5, 0, -7.5 - 1, -26 + i * 0.5, 2, -7.5 + 1);
    }
    { const u = mk("buffer"); tank(u, -11.5, -5.5, 7.6, 5.6, 7.6, 5.4); }
    for (let i = 0; i < 3; i++) { // 3. AGS реакторлари
      const u = mk("ags" + i); tank(u, RX[i], RZ, 7.3, 6.5, 7.3, 6.0);
      rect(u.s, RX[i], 2.4, RZ, 6.7, 6.7); box(u.s, RX[i], 6.2, RZ + 2.9, 6.7, 0.3, 0.4);
    }
    { const u = mk("blower"); box(u.s, 7, 0, -15, 8, 3.5, 6); rect(u.s, 7, 3.8, -15, 8.4, 6.4); topFace(u, 7, 3.5, -15, 8, 6); }
    { // 4. Диск фильтр
      const u = mk("disc"); box(u.s, 22.8, 0, -8, 2.6, 2.2, 3);
      for (let k = 0; k < 5; k++) ring(u.s, 22.8, 1.6, -9 + k * 0.5, 0.9, "z", 14);
      topFace(u, 22.8, 2.2, -8, 2.6, 3);
    }
    for (let i = 0; i < 3; i++) { // 6. Mg-биокўмир фильтрлари
      const u = mk("bc" + i); cyl(u.s, FX, 0, FZ[i], 1.7, 4.2, 22); ring(u.s, FX, 2.6, FZ[i], 1.6, "y", 18); ring(u.s, FX, 0.6, FZ[i], 1.6, "y", 18); ring(u.s, FX, 4.0, FZ[i], 1.1, "y", 16);
    }
    { // 5. Озонлаш
      const u = mk("ozone"); tank(u, 4.8, 8, 5, 3.2, 3.6, 2.6);
      for (let k = 0; k < 3; k++) add(u.s, 3.4 + k * 1.4 - 1.4, 0, 6.2, 3.4 + k * 1.4 - 1.4, 3, 9.8);
      box(u.s, 9.6, 0, 8, 4.2, 2.6, 2.4); cyl(u.s, 9.6, 2.6, 8.6, 0.35, 2.4, 10);
    }
    { // 7. УБ ва тоза сув
      const u = mk("uv"); hcyl(u.s, 22.8, 1, 1.4, 0.35, 2.8); hcyl(u.s, 22.8, 1, 2.6, 0.35, 2.8); box(u.s, 24.6, 0, 2, 0.6, 1.2, 0.5);
      const v = mk("clean"); tank(v, 25, 10.5, 8, 3.5, 7, 3.2);
    }
    { const u = mk("sludge"); box(u.s, -2, 0, 8, 6, 4, 6); rect(u.s, -2, 4.3, 8, 6.4, 6.4); topFace(u, -2, 4, 8, 6, 6); }
    { // лой қуритгич: ёйсимон томли иссиқхона
      const u = mk("dryer"); box(u.s, 7.5, 0, 18, 25, 0.4, 10);
      for (let x = -12.5; x <= 12.5; x += 5) { let q = null; for (let i = 0; i <= 12; i++) { const t = (i / 12) * Math.PI; const pt = [7.5 + x, 0.4 + Math.sin(t) * 3, 18 + Math.cos(t) * 5]; if (q) add(u.s, ...q, ...pt); q = pt; } }
      for (const t of [Math.PI / 6, Math.PI / 2, (5 * Math.PI) / 6]) add(u.s, -5, 0.4 + Math.sin(t) * 3, 18 + Math.cos(t) * 5, 20, 0.4 + Math.sin(t) * 3, 18 + Math.cos(t) * 5);
    }
    { // қуёш панеллари: ердаги массивлар + соябонлар
      const u = mk("pv");
      for (const [cx, w] of [[-7, 16], [20.5, 17]]) {
        const cols = Math.floor(w / 4);
        for (let r = 0; r < 3; r++) for (let cI = 0; cI < cols; cI++) panel(u.s, cx - w / 2 + 2 + (cI * (w - 4)) / Math.max(cols - 1, 1), 1.3, -17 - 3 + r * 3, 3.8, 2.2, 0.6);
      }
      for (const [x, z, w, h] of [[RX[0], RZ, 7.6, 8.6], [RX[1], RZ, 7.6, 8.6], [RX[2], RZ, 7.6, 8.6], [-11.5, -5.5, 7.4, 7.2]]) {
        rect(u.s, x, h, z, w, w);
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(u.s, x + sx * (w / 2), 0, z + sz * (w / 2), x + sx * (w / 2), h, z + sz * (w / 2));
        topFace(u, x, h, z, w, w);
      }
    }
    { const u = mk("monitor"); box(u.s, -16.6, 0, -6, 1.4, 2.2, 1.4); }
    { const u = mk("emerg"); tank(u, -18.4, -12.2, 6, 4, 5, 1.5); }
    { // пиролиз печи
      const u = mk("kiln"); cyl(u.s, -19.5, 0, -16, 1.4, 3, 18, 1.2); cyl(u.s, -18.7, 3, -16, 0.25, 4, 8); box(u.s, -24.5, 0, -18.5, 6, 2.4, 5);
    }
    { const u = mk("lab"); box(u.s, -22, 0, 18, 12, 3.6, 8); rect(u.s, -22, 3.9, 18, 12.4, 8.4); topFace(u, -22, 3.6, 18, 12, 8); box(u.s, -25.5, 0, 12.3, 3, 2.3, 1.8); box(u.s, -20.8, 0, 12.3, 3.4, 2, 1.6); }

    const R = 0.3; // оқим қувурлари
    const pipes = {
      in: makePipe("in", COL.raw, [[-36, 0.6, -7.5], [-28, 0.6, -7.5]], 0.14),
      ib: makePipe("ib", COL.raw, [[-18, 0.8, -7.5], [-15.3, 0.8, -7.5]], 0.14),
      bh: makePipe("bh", COL.raw, [[-11.5, 1, -9.1], [-11.5, 1, -10.6], [RX[2], 1, -10.6]], 0.12),
      ...Object.fromEntries(RX.map((x, i) => ["f" + i, makePipe("f" + i, COL.raw, [[x, 1, -10.6], [x, 0.5, -9.1]], 0.2)])),
      ...Object.fromEntries(RX.map((x, i) => ["e" + i, makePipe("e" + i, COL.bio, [[x, 6.3, -2.4], [x, 6.3, -1.1], [x + 3, 5.8, -1.1]], 0.16)])),
      ed: makePipe("ed", COL.bio, [[RX[2] + 3, 5.8, -1.1], [20.5, 3, -1.1], [20.5, 2, -8], [21.5, 2, -8]], 0.1),
      df: makePipe("df", COL.filt, [[22.8, 0.5, -6.4], [22.8, 0.5, -3], [5, 0.5, -3], [5, 0.5, 6.2]], 0.07),
      oz: makePipe("oz", COL.oz, [[9.6, 0.5, 6.8], [9.6, 0.5, 4.6], [24.6, 0.5, 4.6], [24.6, 4.8, 1.3], [26.6, 4.8, 1.3], [26.6, 4.8, -8.3]], 0.07),
      bu: makePipe("bu", COL.clean, [[28.6, 0.4, -8.3], [28.6, 0.4, 2], [24.2, 0.6, 2]], 0.1),
      uc: makePipe("uc", COL.uv, [[21.4, 1, 2], [20.6, 1, 4], [21, 1, 10.5]], 0.12),
      out: makePipe("out", COL.uv, [[29, 1.5, 10.5], [36, 1.5, 10.5]], 0.16),
      ...Object.fromEntries(RX.map((x, i) => ["a" + i, makePipe("a" + i, COL.air, [[7, 3.5, -12], [7, 7.3, -11], [x, 7.3, -11], [x, 7.3, -8.6], [x, 6.5, -8.4]], 0.14)])),
      ...Object.fromEntries(RX.map((x, i) => ["s" + i, makePipe("s" + i, COL.sludge, [[x - 2.5, 0.4, -1.6], [x - 2.5, 0.4, -0.2], [-2, 0.4, -0.2], [-2, 0.4, 5]], 0.1)])),
      sd: makePipe("sd", COL.sludge, [[-2, 0.4, 11], [-2, 0.4, 13]], 0.1),
    };
    void R;
    const names = Object.keys(U);
    // Босқичлар: ёритиладиган блоклар, қувурлар, ранг
    const stages = [
      { u: ["inlet", "monitor"], p: ["in", "ib"], col: COL.raw },
      { u: ["buffer", "emerg"], p: ["bh"], col: COL.raw },
      { u: ["ags0", "ags1", "ags2", "blower"], p: ["f0", "f1", "f2", "a0", "a1", "a2", "bh"], col: COL.bio, aer: true },
      { u: ["disc"], p: ["e0", "e1", "e2", "ed"], col: COL.filt },
      { u: ["ozone"], p: ["df"], col: COL.oz },
      { u: ["bc0", "bc1", "bc2"], p: ["oz", "bu"], col: COL.clean },
      { u: ["uv", "clean"], p: ["uc", "out"], col: COL.uv },
      { u: ["pv"], p: [], col: COL.pv },
      { u: ["sludge", "dryer", "kiln"], p: ["s0", "s1", "s2", "sd"], col: COL.sludge },
    ];
    return { U, names, pipes, stages, ground: groundSegs(60, 48, 12) };
  }

  function drawAgs(c, s, u, P, th, k) {
    AGS = AGS || buildAgs();
    const M = AGS, dur = s.dur, n = M.stages.length, sd = dur / n, T = strOf(P);
    const yaw = -0.5 + (u / dur) * TAU * 0.78, cam = makeCam(yaw, 0.8, 18.5, -70, 150);

    // босқич вазнлари (ёритилиш): кесишувчи силлиқ ўтиш
    const w = M.stages.map((st, j) => smooth(seg(u, j * sd - 0.25, j * sd + 0.4)) * (1 - smooth(seg(u, (j + 1) * sd - 0.25, (j + 1) * sd + 0.4))));
    const cur = Math.min(n - 1, Math.floor(u / sd));
    const hlOf = (id) => { let b = 0, col = null; M.stages.forEach((st, j) => { if (st.u.includes(id) && w[j] > b) { b = w[j]; col = st.col; } }); return [b, col]; };
    const pOf = (id) => { let b = 0; M.stages.forEach((st, j) => { if (st.p.includes(id)) b = Math.max(b, w[j]); }); return b; };

    strokeSegs(c, cam, M.ground, th.c, 0.3, 4.5);
    const ga = c.globalAlpha;
    for (const id of M.names) {
      const un = M.U[id], [hl, col] = hlOf(id);
      strokeSegs(c, cam, un.s, th.c, 0.6 * (1 - 0.45 * hl), 6.5);
      if (hl > 0.02) {
        c.save(); glow(c, col, 18, k);
        fillFaces(c, cam, un.f, col, 0.22 * hl);
        strokeSegs(c, cam, un.s, col, hl, 11);
        c.restore();
      }
    }
    const t = u;
    for (const id in M.pipes) drawPipe(c, cam, M.pipes[id], pOf(id), t, 8, 11);

    // аэрация: реакторларда пуфакчалар
    if (M.stages[cur].aer || w[2] > 0.05) {
      c.save(); c.fillStyle = "#e9fbff"; c.globalAlpha = ga * w[2] * 0.9;
      for (let i = 0; i < 3; i++) for (let b = 0; b < 14; b++) {
        const x = RX[i] + (hash(i * 40 + b) - 0.5) * 5.6, z = RZ + (hash(i * 40 + b + 7) - 0.5) * 5.6;
        const y = 0.5 + ((hash(i * 40 + b + 3) + t * (0.12 + hash(b) * 0.1)) % 1) * 5.3;
        cam(x, y, z, o3); c.beginPath(); c.arc(o3[0], o3[1], 7 * o3[3], 0, TAU); c.fill();
      }
      c.restore();
    }

    // сарлавҳа ва босқич нуқталари
    const lt = u - cur * sd, a = smooth(seg(lt, 0.05, 0.5)) * (cur === n - 1 ? smooth(seg(sd - lt, 0, 0.5)) : 1);
    const [nm, sub] = T.ags[cur];
    drawCaption(c, P, th, nm, sub, a, E.out(seg(lt, 0.05, 0.7)));
    for (let j = 0; j < n; j++) {
      const ang = Math.PI / 2 + (j - (n - 1) / 2) * 0.085;
      c.save(); c.fillStyle = j === cur ? M.stages[j].col : th.b; c.globalAlpha = ga * (j === cur ? 1 : 0.35);
      c.beginPath(); c.arc(Math.cos(ang) * 880, Math.sin(ang) * 880, j === cur ? 19 : 12, 0, TAU); c.fill(); c.restore();
    }
    arcText(c, P.short || P.name, 830, true, 100, th.b, 1, 1, 2.0, 0.04);
  }

  /* =====================================================================
     2) Ҳудудий тизим: 6 туман модули + умумий ресурс маркази
     ===================================================================== */
  let REG = null;
  function buildRegion() {
    const at = (x, y) => [(x - 380) / 4, (y - 300) / 4];
    const DIST = [
      { n: 0, pe: 10, x: 200, y: 330, pipe: true }, { n: 1, pe: 10, x: 210, y: 170, pipe: true }, { n: 2, pe: 15, x: 450, y: 110, pipe: true },
      { n: 3, pe: 15, x: 590, y: 380, pipe: true }, { n: 4, pe: 20, x: 250, y: 480, pipe: false }, { n: 5, pe: 30, x: 560, y: 240, pipe: true },
    ];
    const U = [], pipes = [], labels = [];
    const hub = unit("hub");
    box(hub.s, -5, 0, -5, 7, 3, 5); rect(hub.s, -5, 3.2, -5, 7.4, 5.4); topFace(hub, -5, 3, -5, 7, 5);
    cyl(hub.s, 4, 0, -5, 1.5, 3.4, 18, 1.3); cyl(hub.s, 5, 3.4, -5, 0.3, 4, 8); box(hub.s, 4, 0, -10.5, 5, 2.2, 4);
    for (let r = 0; r < 3; r++) for (let cI = 0; cI < 4; cI++) panel(hub.s, -16 + cI * 3, 0.9, -6 + r * 2.4, 2.6, 1.4, 0.6);
    for (const [x, z] of [[9, 10.5], [16, 10.5], [9, 16], [16, 16]]) { rect(hub.s, x, 0.3, z, 6, 4.5); rect(hub.s, x, 0.5, z, 5.2, 3.8); topFace(hub, x, 0.4, z, 5.6, 4.2); }
    for (let i = 0; i < 6; i++) cyl(hub.s, 6 + i * 2.5, 0, 21.5, 0.35, 1.6, 8);
    U.push(hub); labels.push({ p: [0, 6, 0], key: "hub" });
    const fields = []; fields.push({ p: [30, 27], w: 12, d: 7 });
    const HUB_IN = [-4, 0, 3];
    DIST.forEach((d, idx) => {
      const [px, pz] = at(d.x, d.y), L = Math.hypot(px, pz), ux = px / L, uz = pz / L, sx = -uz, sz = ux;
      const un = unit("d" + idx), sz2 = 1.1 + d.pe / 25, hgt = 1.8;
      for (let i = 0; i < 3; i++) { const off = (i - 1) * (sz2 + 0.35); box(un.s, px + sx * off, 0, pz + sz * off, sz2, hgt, sz2); topFace(un, px + sx * off, hgt, pz + sz * off, sz2, sz2); }
      for (let i = 0; i < Math.round(d.pe / 10) + 1; i++) { const off = -2 + i * 2; panel(un.s, px + sx * off + ux * (sz2 / 2 + 1.4), 0.6, pz + sz * off + uz * (sz2 / 2 + 1.4), 1.8, 1.1, 0.6); }
      U.push(un); labels.push({ p: [px, 4.2, pz], key: "d" + idx });
      // шаҳарча
      const town = unit("t" + idx); const hs = 4 + Math.round(d.pe / 6);
      for (let i = 0; i < hs; i++) { const a = i * 2.399 + idx, r = 1.5 + (i % 5) * 1.1, hh = 0.8 + ((i * 7) % 5) * 0.35; box(town.s, px + ux * 9 + Math.cos(a) * r, 0, pz + uz * 9 + Math.sin(a) * r, 1.2, hh, 1.2); }
      U.push(town);
      const Fx = px + sx * 9 + ux * 2, Fz = pz + sz * 9 + uz * 2; fields.push({ p: [Fx, Fz], w: 8, d: 6 });
      pipes.push({ ...makePipe("i" + idx, "#b8ff3d", [[px + sx * 2, 0.3, pz + sz * 2], [Fx - sx * 3.5, 0.3, Fz - sz * 3.5]], 0.14), kind: d.pipe ? "summer" : "always" });
      if (d.pipe) {
        const E_ = [px - ux * 2, 0.35, pz - uz * 2], H_ = [HUB_IN[0] + ux * 4.5, 0.35, HUB_IN[2] + uz * 4.5];
        pipes.push({ ...makePipe("w" + idx, "#22d3ee", [E_, H_], 0.07), kind: "winter" });
      }
      const A = [px - sx * 2.2 - ux * 1.5, 0.1, pz - sz * 2.2 - uz * 1.5], B = [4 - sx * 1.2, 0.1, -10.5 - sz * 1.2];
      pipes.push({ ...makePipe("l" + idx, COL.sludge, [A, B], 0.09), kind: "sludge", dashed: true });
    });
    const fieldU = unit("fields"); fields.forEach((f) => rect(fieldU.s, f.p[0], 0.05, f.p[1], f.w, f.d)); U.push(fieldU);
    return { U, pipes, labels, ground: groundSegs(120, 110, 22) };
  }

  function drawRegion(c, s, u, P, th, k) {
    REG = REG || buildRegion();
    const M = REG, dur = s.dur, T = strOf(P);
    const winterPhase = u < dur * 0.52;
    const sw = smooth(seg(u, dur * 0.52 - 0.3, dur * 0.52 + 0.3)); // 0 — қиш, 1 — ёз
    const yaw = 0.2 + (u / dur) * TAU * 0.6, cam = makeCam(yaw, 0.85, 10.2, -110, 190);
    const ga = c.globalAlpha;
    strokeSegs(c, cam, M.ground, th.c, 0.22, 4.5);
    for (const un of M.U) {
      const isHub = un.id === "hub", isField = un.id === "fields";
      c.save();
      if (isHub) glow(c, th.a, 14, k);
      fillFaces(c, cam, un.f, th.a, isHub ? 0.2 : 0.1);
      strokeSegs(c, cam, un.s, isField ? "#b8ff3d" : isHub ? th.a : th.c, isField ? 0.25 + 0.5 * sw : isHub ? 0.95 : 0.65, isHub ? 8.5 : 6);
      c.restore();
    }
    for (const p of M.pipes) {
      let on = 0;
      if (p.kind === "winter") on = 1 - sw; else if (p.kind === "summer") on = sw; else if (p.kind === "always") on = 0.8; else on = 0.55;
      if (p.dashed) strokeSegs(c, cam, p.segs, p.color, 0.3, 4); // лой йўли: ингичка чизиқ + ҳаракатдаги нуқталар
      drawPipe(c, cam, p.dashed ? { ...p, segs: [] } : p, on, u, p.kind === "winter" ? 10 : 6, p.kind === "winter" ? 11 : 8);
    }
    // ҳарфлар: туманлар ва марказ
    const lab = T.dist;
    c.save(); c.textAlign = "center"; c.textBaseline = "middle";
    for (const l of M.labels) {
      cam(l.p[0], l.p[1], l.p[2], o3);
      const isHub = l.key === "hub";
      c.font = `900 ${isHub ? 80 : 96}px "Segoe UI","Roboto","Noto Sans","DejaVu Sans",Arial,sans-serif`;
      c.fillStyle = isHub ? th.a : "#ffffff"; c.globalAlpha = ga;
      c.fillText(isHub ? T.hub : lab[+l.key.slice(1)], o3[0], o3[1] - 30);
    }
    c.restore();
    const cap = winterPhase ? T.winter : T.summer, base = winterPhase ? 0 : dur * 0.52;
    const lt = u - base, a = smooth(seg(lt, 0.1, 0.6)) * smooth(seg((winterPhase ? dur * 0.52 : dur) - u, 0, 0.5));
    drawCaption(c, P, th, cap[0], cap[1], a, E.out(seg(lt, 0.1, 0.8)));
    arcText(c, P.short || P.name, 830, true, 100, th.b, 1, 1, 2.0, 0.04);
  }

  global.FanModels = {
    ags: { dur: 24, draw: drawAgs },
    region: { dur: 13, draw: drawRegion },
  };
})(window);
