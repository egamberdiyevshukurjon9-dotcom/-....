/* ЭкоГолограмма — вентилятор студияси: кадр чизиш мотори.
 *
 * Бир лойиҳа (ном, шиор, хусусиятлар, рақамлар) → саҳналар кетма-кетлиги → ҳар бир кадр.
 * Кадр t (сония) бўйича тоза функция: бир хил t — бир хил тасвир, шунинг учун видео
 * кадр тушиб қолмасдан, қайта-қайта бир хил чиқади.
 *
 * Координаталар «R = 1000» бирликда: доира маркази (0,0), чети 1000.
 * Фон тўлиқ қора (LED ўчиқ), контент доира ичида, қалин чизиқ ва йирик ёзув.
 */
(function (global) {
  "use strict";

  const TAU = Math.PI * 2;
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const seg = (t, a, b) => clamp((t - a) / (b - a));
  const smooth = (x) => x * x * (3 - 2 * x);
  const E = {
    out: (x) => 1 - Math.pow(1 - x, 3),
    io: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
    back: (x) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); },
  };

  /* ---------- Ранг мавзулари (қора фонда ёрқин, тўйинган) ---------- */
  const THEMES = {
    eko:   { name: "🌿 Эко",   a: "#2dff8a", b: "#c6ff3d", c: "#35e6ff", text: "#ffffff" },
    neon:  { name: "💜 Неон",  a: "#00e5ff", b: "#ff3df2", c: "#ffee33", text: "#ffffff" },
    gold:  { name: "✨ Олтин", a: "#ffd23f", b: "#ff8c1a", c: "#fff1b8", text: "#fffbe8" },
    ocean: { name: "🌊 Океан", a: "#3de0ff", b: "#4d7cff", c: "#b8f4ff", text: "#ffffff" },
    fire:  { name: "🔥 Олов",  a: "#ff4d3d", b: "#ffb020", c: "#fff0a0", text: "#fff6e8" },
    suv:   { name: "💧 Сув",   a: "#2de2d0", b: "#ffb020", c: "#8bd3ff", text: "#ffffff" },
  };

  /* ---------- Иконкалар: -50…50 катакда, қалин контур ---------- */
  const ICONS = {
    leaf(c, S) {
      c.beginPath(); c.moveTo(-30, 38); c.bezierCurveTo(-50, -6, -6, -46, 40, -40); c.bezierCurveTo(46, 8, 10, 46, -30, 38); c.closePath(); S();
      c.beginPath(); c.moveTo(-44, 52); c.lineTo(10, -10); c.stroke();
      c.beginPath(); c.moveTo(-10, 18); c.lineTo(-14, -2); c.moveTo(4, 4); c.lineTo(8, -16); c.stroke();
    },
    globe(c, S) {
      c.beginPath(); c.arc(0, 0, 40, 0, TAU); S();
      c.beginPath(); c.ellipse(0, 0, 17, 40, 0, 0, TAU); c.stroke();
      c.beginPath(); c.moveTo(-40, 0); c.lineTo(40, 0);
      c.moveTo(-34, -20); c.quadraticCurveTo(0, -10, 34, -20);
      c.moveTo(-34, 20); c.quadraticCurveTo(0, 30, 34, 20); c.stroke();
    },
    drop(c, S) {
      c.beginPath(); c.moveTo(0, -44); c.bezierCurveTo(10, -22, 31, -6, 31, 15); c.bezierCurveTo(31, 33, 17, 46, 0, 46);
      c.bezierCurveTo(-17, 46, -31, 33, -31, 15); c.bezierCurveTo(-31, -6, -10, -22, 0, -44); c.closePath(); S();
      c.beginPath(); c.arc(0, 15, 18, 0.55 * Math.PI, 0.95 * Math.PI); c.stroke();
    },
    tree(c, S) {
      c.beginPath(); c.moveTo(0, -46); c.lineTo(-26, -8); c.lineTo(26, -8); c.closePath(); S();
      c.beginPath(); c.moveTo(0, -24); c.lineTo(-36, 20); c.lineTo(36, 20); c.closePath(); S();
      c.beginPath(); c.moveTo(0, 20); c.lineTo(0, 46); c.stroke();
    },
    wind(c) {
      c.beginPath(); c.moveTo(-46, -14); c.lineTo(12, -14); c.arc(12, -27, 13, Math.PI / 2, -Math.PI, true); c.stroke();
      c.beginPath(); c.moveTo(-46, 6); c.lineTo(28, 6); c.arc(28, 19, 13, -Math.PI / 2, Math.PI * 0.95, false); c.stroke();
      c.beginPath(); c.moveTo(-34, 28); c.lineTo(-6, 28); c.arc(-6, 38, 10, -Math.PI / 2, Math.PI, false); c.stroke();
    },
    book(c, S) {
      c.beginPath(); c.moveTo(0, -26); c.quadraticCurveTo(-22, -38, -46, -30); c.lineTo(-46, 28); c.quadraticCurveTo(-22, 20, 0, 34); c.closePath(); S();
      c.beginPath(); c.moveTo(0, -26); c.quadraticCurveTo(22, -38, 46, -30); c.lineTo(46, 28); c.quadraticCurveTo(22, 20, 0, 34); c.closePath(); S();
      c.beginPath(); c.moveTo(-34, -12); c.lineTo(-12, -9); c.moveTo(-34, 2); c.lineTo(-12, 5); c.moveTo(34, -12); c.lineTo(12, -9); c.moveTo(34, 2); c.lineTo(12, 5); c.stroke();
    },
    trophy(c, S) {
      c.beginPath(); c.moveTo(-24, -42); c.lineTo(24, -42); c.lineTo(22, -6); c.bezierCurveTo(20, 12, -20, 12, -22, -6); c.closePath(); S();
      c.beginPath(); c.moveTo(-24, -34); c.bezierCurveTo(-50, -34, -46, -4, -24, -4); c.moveTo(24, -34); c.bezierCurveTo(50, -34, 46, -4, 24, -4); c.stroke();
      c.beginPath(); c.moveTo(0, 10); c.lineTo(0, 28); c.stroke();
      c.beginPath(); c.moveTo(-18, 44); c.lineTo(18, 44); c.lineTo(12, 28); c.lineTo(-12, 28); c.closePath(); S();
    },
    pin(c, S) {
      c.beginPath(); c.moveTo(0, 48); c.bezierCurveTo(-8, 34, -34, 14, -34, -12); c.arc(0, -12, 34, Math.PI, 0, false);
      c.bezierCurveTo(34, 14, 8, 34, 0, 48); c.closePath(); S();
      c.beginPath(); c.arc(0, -12, 12, 0, TAU); c.stroke();
    },
    map(c, S) {
      c.beginPath(); c.moveTo(-44, -28); c.lineTo(-15, -38); c.lineTo(15, -28); c.lineTo(44, -38); c.lineTo(44, 28); c.lineTo(15, 38); c.lineTo(-15, 28); c.lineTo(-44, 38); c.closePath(); S();
      c.beginPath(); c.moveTo(-15, -38); c.lineTo(-15, 28); c.moveTo(15, -28); c.lineTo(15, 38); c.stroke();
    },
    camera(c, S) {
      c.beginPath(); c.moveTo(-42, -20); c.lineTo(-18, -20); c.lineTo(-12, -34); c.lineTo(12, -34); c.lineTo(18, -20); c.lineTo(42, -20);
      c.lineTo(42, 36); c.lineTo(-42, 36); c.closePath(); S();
      c.beginPath(); c.arc(0, 8, 18, 0, TAU); c.stroke();
    },
    eye(c, S) {
      c.beginPath(); c.moveTo(-48, 0); c.quadraticCurveTo(0, -46, 48, 0); c.quadraticCurveTo(0, 46, -48, 0); c.closePath(); S();
      c.beginPath(); c.arc(0, 0, 15, 0, TAU); c.stroke();
    },
    shield(c, S) {
      c.beginPath(); c.moveTo(0, -46); c.lineTo(36, -32); c.lineTo(36, 0); c.bezierCurveTo(36, 26, 16, 40, 0, 48);
      c.bezierCurveTo(-16, 40, -36, 26, -36, 0); c.lineTo(-36, -32); c.closePath(); S();
      c.beginPath(); c.moveTo(-14, 2); c.lineTo(-4, 14); c.lineTo(16, -10); c.stroke();
    },
    bolt(c, S) {
      c.beginPath(); c.moveTo(8, -48); c.lineTo(-26, 6); c.lineTo(-2, 6); c.lineTo(-10, 48); c.lineTo(28, -8); c.lineTo(4, -8); c.closePath(); S();
    },
    sun(c, S) {
      c.beginPath(); c.arc(0, 0, 19, 0, TAU); S();
      c.beginPath();
      for (let i = 0; i < 8; i++) { const a = (i * TAU) / 8; c.moveTo(Math.cos(a) * 30, Math.sin(a) * 30); c.lineTo(Math.cos(a) * 45, Math.sin(a) * 45); }
      c.stroke();
    },
    recycle(c) {
      for (let k = 0; k < 3; k++) {
        const a0 = (k * TAU) / 3 + 0.25, a1 = a0 + 1.55;
        c.beginPath(); c.arc(0, 0, 32, a0, a1); c.stroke();
        const px = Math.cos(a1) * 32, py = Math.sin(a1) * 32, tx = -Math.sin(a1), ty = Math.cos(a1), rx = Math.cos(a1), ry = Math.sin(a1);
        c.beginPath(); c.moveTo(px + tx * 18, py + ty * 18); c.lineTo(px + rx * 13, py + ry * 13); c.lineTo(px - rx * 13, py - ry * 13); c.closePath();
        c.save(); c.fill(); c.restore(); c.stroke();
      }
    },
    chart(c, S) {
      c.beginPath(); c.moveTo(-44, -42); c.lineTo(-44, 42); c.lineTo(46, 42); c.stroke();
      c.beginPath(); c.rect(-30, 8, 14, 34); S(); c.beginPath(); c.rect(-6, -12, 14, 54); S(); c.beginPath(); c.rect(18, -32, 14, 74); S();
    },
    drone(c, S) {
      c.beginPath(); c.rect(-13, -7, 26, 14); S();
      c.beginPath(); c.moveTo(-13, -4); c.lineTo(-34, -22); c.moveTo(13, -4); c.lineTo(34, -22); c.moveTo(-13, 4); c.lineTo(-34, 22); c.moveTo(13, 4); c.lineTo(34, 22); c.stroke();
      for (const [x, y] of [[-34, -22], [34, -22], [-34, 22], [34, 22]]) { c.beginPath(); c.ellipse(x, y, 13, 6, 0, 0, TAU); c.stroke(); }
    },
    users(c, S) {
      c.beginPath(); c.arc(-14, -18, 13, 0, TAU); S();
      c.beginPath(); c.arc(-14, 40, 24, Math.PI, TAU); c.stroke();
      c.beginPath(); c.arc(22, -22, 10, 0, TAU); S();
      c.beginPath(); c.arc(22, 30, 19, Math.PI * 1.05, TAU * 0.98); c.stroke();
    },
    star(c, S) {
      c.beginPath();
      for (let i = 0; i < 10; i++) { const r = i % 2 ? 19 : 46, a = -Math.PI / 2 + (i * Math.PI) / 5; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      c.closePath(); S();
    },
    cap(c, S) {
      c.beginPath(); c.moveTo(0, -32); c.lineTo(48, -8); c.lineTo(0, 16); c.lineTo(-48, -8); c.closePath(); S();
      c.beginPath(); c.moveTo(-26, 4); c.lineTo(-26, 24); c.quadraticCurveTo(0, 40, 26, 24); c.lineTo(26, 4); c.moveTo(48, -8); c.lineTo(48, 26); c.stroke();
    },
    heart(c, S) {
      c.beginPath(); c.moveTo(0, -14); c.bezierCurveTo(-8, -42, -46, -36, -42, -4); c.bezierCurveTo(-38, 18, -12, 32, 0, 44);
      c.bezierCurveTo(12, 32, 38, 18, 42, -4); c.bezierCurveTo(46, -36, 8, -42, 0, -14); c.closePath(); S();
    },
    award(c, S) {
      c.beginPath(); c.arc(0, -14, 27, 0, TAU); S();
      c.beginPath(); c.moveTo(-15, 8); c.lineTo(-24, 46); c.lineTo(0, 34); c.lineTo(24, 46); c.lineTo(15, 8); c.stroke();
      c.beginPath(); c.arc(0, -14, 12, 0, TAU); c.stroke();
    },
    phone(c, S) {
      c.beginPath(); c.roundRect(-26, -46, 52, 92, 9); S();
      c.beginPath(); c.moveTo(-9, -35); c.lineTo(9, -35); c.moveTo(-1, 35); c.lineTo(1, 35); c.stroke();
    },
    chat(c, S) {
      c.beginPath(); c.roundRect(-44, -36, 88, 58, 13); S();
      c.beginPath(); c.moveTo(-20, 22); c.lineTo(-28, 44); c.lineTo(2, 22); c.stroke();
      for (const x of [-18, 0, 18]) { c.beginPath(); c.arc(x, -7, 3.5, 0, TAU); c.save(); c.fill(); c.restore(); c.stroke(); }
    },
    law(c) {
      c.beginPath(); c.moveTo(0, -44); c.lineTo(0, 36); c.moveTo(-18, 46); c.lineTo(18, 46); c.moveTo(-36, -30); c.lineTo(36, -30); c.stroke();
      c.beginPath(); c.moveTo(-36, -30); c.lineTo(-48, 2); c.lineTo(-24, 2); c.closePath(); c.stroke();
      c.beginPath(); c.moveTo(36, -30); c.lineTo(24, 2); c.lineTo(48, 2); c.closePath(); c.stroke();
      c.beginPath(); c.moveTo(-50, 2); c.quadraticCurveTo(-36, 18, -22, 2); c.moveTo(22, 2); c.quadraticCurveTo(36, 18, 50, 2); c.stroke();
    },
  };
  const ICON_NAMES = Object.keys(ICONS);

  /* Матндан иконка топиш (калит сўзлар) */
  const KEYWORDS = [
    [/ҳаво|воздух|aqi|pm2|pm10|havo|чанг|тутун/i, "wind"],
    [/сув|оқова|ёмғир|дарё|suv|орол/i, "drop"],
    [/дарахт|ўрмон|яшил|ниҳол|daraxt|белбоғ/i, "tree"],
    [/қайта иш|чиқинди|сарала|recycl/i, "recycle"],
    [/курс|дарс|китоб|дарслик|кутубхона|таълим|kurs|dars/i, "book"],
    [/ўйин|ютуқ|нишон|даража|трофей|челлендж|oyin/i, "trophy"],
    [/харита|жой|манзил|xarita/i, "pin"],
    [/кўз|расм|сурат|камера|фото|таҳлил\s*қил/i, "eye"],
    [/қонун|ҳуқуқ|суд|qonun/i, "law"],
    [/хавфсиз|ҳимоя|махфий|shield/i, "shield"],
    [/энергия|электр|шамол|energy|bolt/i, "bolt"],
    [/қуёш|иқлим|иссиқ|климат|iqlim/i, "sun"],
    [/углерод|co2|co₂|глобал|ер\b|сайёра|3d|голограм/i, "globe"],
    [/дрон|учувчи|drone/i, "drone"],
    [/статистик|диаграмм|мониторинг|рейтинг|таҳлил|аналитик|график/i, "chart"],
    [/мактаб|ўқувчи|ўқитувчи|синф|талаба|универс|олийгоҳ/i, "cap"],
    [/ҳашар|жамоа|кўнгилли|бирга|users/i, "users"],
    [/сертификат|диплом/i, "award"],
    [/илова|телефон|android|мобил/i, "phone"],
    [/бот|ёрдамчи|чат|савол/i, "chat"],
    [/севим|соғлиқ|ҳаёт/i, "heart"],
  ];
  const FALLBACK_ICONS = ["leaf", "globe", "star", "sun", "drop", "tree"];
  function pickIcon(text, i = 0) {
    for (const [re, name] of KEYWORDS) if (re.test(text || "")) return name;
    return FALLBACK_ICONS[i % FALLBACK_ICONS.length];
  }

  /* Иконка: size — катак ўлчами (px эмас, бирлик); sx — «айланиш» (энини торайтириш) */
  function drawIcon(c, name, x, y, size, color, alpha = 1, sx = 1) {
    const fn = ICONS[name] || ICONS.leaf;
    c.save();
    c.translate(x, y);
    c.scale((size / 100) * sx, size / 100);
    c.globalAlpha *= alpha;
    c.strokeStyle = color; c.fillStyle = color;
    c.lineWidth = 6.5; c.lineCap = "round"; c.lineJoin = "round";
    fn(c, () => { c.save(); c.globalAlpha *= 0.16; c.fill(); c.restore(); c.stroke(); });
    c.restore();
  }

  /* ---------- Матн ---------- */
  const FONT = '"Segoe UI","Roboto","Noto Sans","Helvetica Neue","DejaVu Sans",Arial,sans-serif';
  const setFont = (c, size, weight = 800) => { c.font = `${weight} ${size}px ${FONT}`; };

  /* Матнни сатрларга бўлиш: maxW га сиғмаса — шрифтни кичрайтиради (min гача) */
  function layoutText(c, text, size, maxW, maxLines = 1, min = 54) {
    text = String(text || "").trim();
    let s = size;
    for (let guard = 0; guard < 40; guard++) {
      setFont(c, s);
      const words = text.split(/\s+/).filter(Boolean);
      const lines = []; let cur = "";
      for (const w of words) {
        const t = cur ? cur + " " + w : w;
        if (!cur || c.measureText(t).width <= maxW) cur = t; else { lines.push(cur); cur = w; }
      }
      if (cur) lines.push(cur);
      const widest = Math.max(0, ...lines.map((l) => c.measureText(l).width));
      if (lines.length <= maxLines && widest <= maxW) return { size: s, lines };
      if (s <= min) return { size: s, lines: lines.slice(0, maxLines) };
      s = Math.max(min, s * 0.93);
    }
    return { size: min, lines: [text] };
  }

  function drawLines(c, lay, x, cy, color, alpha = 1, lh = 1.12) {
    c.save();
    setFont(c, lay.size);
    c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = color; c.globalAlpha *= alpha;
    const n = lay.lines.length;
    lay.lines.forEach((l, i) => c.fillText(l, x, cy + (i - (n - 1) / 2) * lay.size * lh));
    c.restore();
  }

  /* Ёй бўйлаб ёзув. top=true — тепада (чапдан ўнгга), false — пастда (ўқиладиган ҳолатда).
     reveal 0…1 — ҳарфма-ҳарф пайдо бўлиш. maxSpan — ёй бурчаги чекловчиси (радиан). */
  function arcText(c, text, r, top, size, color, alpha = 1, reveal = 1, maxSpan = 2.3, spacing = 0.06) {
    text = String(text || "");
    if (!text) return;
    let s = size;
    let widths, total, span;
    for (let g = 0; g < 30; g++) {
      setFont(c, s, 900);
      widths = [...text].map((ch) => c.measureText(ch).width + s * spacing);
      total = widths.reduce((a, b) => a + b, 0) - s * spacing;
      span = total / r;
      if (span <= maxSpan || s <= 56) break;
      s *= 0.94;
    }
    const chars = [...text];
    const visible = clamp(reveal) * chars.length;
    c.save();
    setFont(c, s, 900);
    c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = color;
    const center = top ? -Math.PI / 2 : Math.PI / 2;
    let acc = 0;
    chars.forEach((ch, i) => {
      const w = widths[i];
      const mid = acc + (w - s * spacing) / 2;
      acc += w;
      const a = top ? center - span / 2 + mid / r : center + span / 2 - mid / r;
      const al = clamp(visible - i);
      if (al <= 0 || ch === " ") return;
      c.save();
      c.translate(Math.cos(a) * r, Math.sin(a) * r);
      c.rotate(top ? a + Math.PI / 2 : a - Math.PI / 2);
      c.globalAlpha *= alpha * al;
      c.fillText(ch, 0, 0);
      c.restore();
    });
    c.restore();
  }

  /* ---------- Безаклар ---------- */
  function glow(c, color, blur, k) { c.shadowColor = color; c.shadowBlur = blur * k; }

  /* Симли глобус (3D таассурот): меридианлар айланади */
  function wireSphere(c, cx, cy, r, rot, color, alpha, lw = 5) {
    c.save();
    c.translate(cx, cy); c.rotate(-0.41);
    c.strokeStyle = color; c.lineWidth = lw; c.globalAlpha *= alpha;
    c.beginPath(); c.arc(0, 0, r, 0, TAU); c.stroke();
    const n = 6;
    for (let i = 0; i < n; i++) {
      const rx = Math.abs(Math.sin(rot + (i * Math.PI) / n)) * r;
      c.beginPath(); c.ellipse(0, 0, Math.max(rx, 0.5), r, 0, 0, TAU); c.stroke();
    }
    for (const lat of [-60, -30, 0, 30, 60]) {
      const a = (lat * Math.PI) / 180, yy = Math.sin(a) * r, rr = Math.cos(a) * r;
      c.beginPath(); c.ellipse(0, yy, rr, rr * 0.22, 0, 0, TAU); c.stroke();
    }
    c.restore();
  }

  function dashedRing(c, r, rot, color, alpha, lw, parts = 12, fill = 0.55) {
    c.save();
    c.strokeStyle = color; c.lineWidth = lw; c.lineCap = "round"; c.globalAlpha *= alpha;
    const step = TAU / parts;
    for (let i = 0; i < parts; i++) { c.beginPath(); c.arc(0, 0, r, rot + i * step, rot + i * step + step * fill); c.stroke(); }
    c.restore();
  }

  function orbitDots(c, cx, cy, r, n, rot, size, color, alpha) {
    c.save(); c.fillStyle = color; c.globalAlpha *= alpha;
    for (let i = 0; i < n; i++) { const a = rot + (i * TAU) / n; c.beginPath(); c.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, size, 0, TAU); c.fill(); }
    c.restore();
  }

  /* Умумий фон: чеккадаги чизиқ ва айланувчи нур — T даврида бутун марта айланади (қайтарилиш чокисиз) */
  function drawFrame(c, t, T, th, k) {
    c.save();
    c.lineCap = "round";
    c.strokeStyle = th.a; c.globalAlpha = 0.5; c.lineWidth = 6;
    c.beginPath(); c.arc(0, 0, 968, 0, TAU); c.stroke();
    c.globalAlpha = 0.28; c.lineWidth = 5;
    for (let i = 0; i < 72; i++) {
      const a = (i * TAU) / 72, r0 = i % 6 === 0 ? 918 : 934;
      c.beginPath(); c.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); c.lineTo(Math.cos(a) * 952, Math.sin(a) * 952); c.stroke();
    }
    const sweep = (TAU * 2 * t) / T;
    c.globalAlpha = 0.95; c.strokeStyle = th.b; c.lineWidth = 12;
    glow(c, th.b, 18, k);
    c.beginPath(); c.arc(0, 0, 968, sweep, sweep + 0.5); c.stroke();
    c.restore();
  }

  /* ---------- Саҳналар ---------- */
  const SCENES = {
    intro(c, s, u, P, th, T, k) {
      const cy = -170, sx = Math.cos(Math.sin(u * 1.1) * 0.55);
      wireSphere(c, 0, cy, 450, u * 0.9, th.c, 0.22 * seg(u, 0, 0.9));
      const sc = E.back(seg(u, 0.1, 0.95));
      c.save(); glow(c, th.a, 22, k);
      drawIcon(c, P.icon, 0, cy, 400 * sc, th.a, 1, sx);
      c.restore();
      c.save(); c.translate(0, cy); dashedRing(c, 335 * E.out(seg(u, 0, 1)), u * 0.8, th.b, 0.9, 9); c.restore();
      c.save(); const q = E.out(seg(u, 0.7, 1.5)); c.translate(0, (1 - q) * 40);
      drawLines(c, P._name, 0, P._name.y || 335, th.text, q);
      c.restore();
      const q2 = E.out(seg(u, 1.5, 2.3));
      c.save(); c.translate(0, (1 - q2) * 30);
      drawLines(c, P._tag, 0, 585, th.a, q2);
      c.restore();
      arcText(c, P.kicker, 830, true, 98, th.b, 1, seg(u, 0.6, 1.9), 2.3, 0.04);
    },
    feature(c, s, u, P, th, T, k) {
      const { f, i, n } = s.data;
      const cy = -190;
      const sx = Math.cos(Math.sin(u * 1.4) * 0.5);
      c.save(); c.translate(0, cy);
      dashedRing(c, 450, -u * 0.7, th.b, 0.9, 9, 14, 0.5);
      c.restore();
      orbitDots(c, 0, cy, 450, 3, u * 1.3, 15, th.c, 1);
      const sc = E.back(seg(u, 0.05, 0.75));
      c.save(); glow(c, th.a, 22, k);
      drawIcon(c, f.icon || pickIcon(f.t, i), 0, cy, 640 * sc, th.a, 1, sx);
      c.restore();
      const q = E.out(seg(u, 0.35, 1.0));
      c.save(); c.translate(0, (1 - q) * 50);
      drawLines(c, f._lay, 0, f._y, th.text, q);
      c.restore();
      arcText(c, P.short || P.name, 830, true, 104, th.b, 1, 1, 2.0, 0.04);
      // ҳолат нуқталари
      for (let j = 0; j < n; j++) {
        const a = Math.PI / 2 + (j - (n - 1) / 2) * 0.095;
        c.save(); c.fillStyle = j === i ? th.a : th.b; c.globalAlpha *= j === i ? 1 : 0.35;
        c.beginPath(); c.arc(Math.cos(a) * 850, Math.sin(a) * 850, j === i ? 21 : 13, 0, TAU); c.fill(); c.restore();
      }
    },
    stat(c, s, u, P, th, T, k) {
      const { s: st } = s.data;
      const prog = E.io(seg(u, 0.15, 1.7));
      c.save(); c.strokeStyle = th.b; c.lineWidth = 22; c.lineCap = "round";
      c.globalAlpha *= 0.22; c.beginPath(); c.arc(0, 0, 745, 0, TAU); c.stroke(); c.restore();
      c.save(); c.strokeStyle = th.a; c.lineWidth = 22; c.lineCap = "round"; glow(c, th.a, 22, k);
      c.beginPath(); c.arc(0, 0, 745, -Math.PI / 2, -Math.PI / 2 + TAU * prog); c.stroke(); c.restore();
      const val = Math.round(st.v * E.out(seg(u, 0.15, 1.5)));
      const txt = (st.prefix || "") + String(val).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + (st.suffix || "");
      const q = E.back(seg(u, 0.05, 0.7));
      const big = layoutText(c, txt, 560, 1200, 1, 120);
      c.save(); c.scale(q, q);
      glow(c, th.a, 14, k);
      drawLines(c, big, 0, -90, th.a, 1);
      c.restore();
      const lab = layoutText(c, st.l, 150, 1250, 2, 70);
      drawLines(c, lab, 0, 300, th.text, E.out(seg(u, 0.5, 1.2)));
      arcText(c, P.short || P.name, 830, true, 104, th.b, 1, 1, 2.0, 0.04);
    },
    // 3D модель (симли «голограмма»): fan-models.js даги FanModels[id]
    model(c, s, u, P, th, T, k) {
      const m = global.FanModels && global.FanModels[s.data.id];
      if (m) m.draw(c, s, u, P, th, k);
    },
    outro(c, s, u, P, th, T, k) {
      const cy = -170;
      wireSphere(c, 0, cy, 450, 1.2 + u * 0.9, th.c, 0.22);
      for (let j = 0; j < 3; j++) {
        const ph = (u * 0.45 + j / 3) % 1;
        c.save(); c.strokeStyle = th.b; c.lineWidth = 8; c.globalAlpha *= (1 - ph) * 0.9;
        c.beginPath(); c.arc(0, cy, 130 + ph * 400, 0, TAU); c.stroke(); c.restore();
      }
      const sx = Math.cos(Math.sin(u * 1.1) * 0.55);
      c.save(); glow(c, th.a, 22, k);
      drawIcon(c, P.icon, 0, cy, 340 * (1 + 0.04 * Math.sin(u * 4)), th.a, 1, sx);
      c.restore();
      drawLines(c, P._name, 0, P._name.y || 335, th.text, E.out(seg(u, 0.1, 0.8)));
      drawLines(c, P._cta, 0, 585, th.a, E.out(seg(u, 0.5, 1.3)));
      arcText(c, P.kicker, 830, true, 98, th.b, 1, seg(u, 0.1, 1.2), 2.3, 0.04);
    },
  };

  /* ---------- Вақт жадвали ---------- */
  function buildTimeline(project, opts = {}) {
    const sp = Math.max(0.4, opts.speed || 1), fps = opts.fps || 30;
    const scenes = []; let t = 0;
    const add = (type, dur, data) => { dur = dur / sp; scenes.push({ type, start: t, dur, data }); t += dur; };
    add("intro", 4.6, {});
    (project.models || []).forEach((id) => add("model", (global.FanModels && global.FanModels[id] && global.FanModels[id].dur) || 20, { id }));
    const feats = (project.features || []).slice(0, 8);
    feats.forEach((f, i) => add("feature", 3.3, { f, i, n: feats.length }));
    (project.stats || []).slice(0, 4).forEach((s, i) => add("stat", 3.0, { s, i }));
    add("outro", 3.8, {});
    const frames = Math.max(1, Math.round(t * fps));
    const T = frames / fps;
    scenes[scenes.length - 1].dur += T - t;
    return { scenes, duration: T, frames, fps };
  }

  /* Матн жойлашувини бир марта ҳисоблаш (ҳар кадрда қайта ўлчамаслик учун) */
  function prepare(c, project) {
    const P = Object.assign({}, project);
    P.icon = P.icon && ICONS[P.icon] ? P.icon : pickIcon(P.name, 0);
    P.kicker = String(P.kicker || "").toUpperCase();
    P.tagline = P.tagline || "";
    // Ном: имкони борича бир сатрда; жуда кичрайиб кетса — икки сатр
    const nm = P.name || "Лойиҳа";
    let nl = null;
    if (nm.includes("\n")) { // қўлда сатрланган ном: «Тоза сув —\nҳар бир туманга»
      const lines = nm.split("\n").map((x) => x.trim()).filter(Boolean);
      let sz = 150;
      for (; sz > 90; sz -= 6) { setFont(c, sz); if (Math.max(...lines.map((l) => c.measureText(l).width)) <= 1300) break; }
      nl = { size: sz, lines, y: 310 };
    }
    for (let sz = 250; !nl && sz >= 160; sz -= 10) {
      setFont(c, sz);
      if (c.measureText(nm).width <= 1300) { nl = { size: sz, lines: [nm] }; break; }
    }
    if (!nl) { nl = layoutText(c, nm, 150, 1300, 2, 90); nl.y = 310; }
    P._name = nl;
    const widest = (lay) => { setFont(c, lay.size); return Math.max(0, ...lay.lines.map((l) => c.measureText(l).width)); };
    // Шиор: имкони борича бир сатрда (кичрайиб кетмаса), акс ҳолда икки сатр
    const fit = (text) => {
      let lay = layoutText(c, text, 105, 1250, 1, 84);
      if (widest(lay) > 1250 || lay.lines.join(" ").length < String(text).trim().length) lay = layoutText(c, text, 105, 1250, 2, 64);
      return lay;
    };
    P._tag = fit(P.tagline);
    const ctaText = P.cta || P.url;
    let cta = ctaText ? layoutText(c, ctaText, 105, 1250, 1, 64) : null;
    if (!cta || widest(cta) > 1250) cta = P._tag; // манзил жуда узун — шиор кўрсатилади
    P._cta = cta;
    P.features = (P.features || []).slice(0, 8).map((f, i) => {
      const o = typeof f === "string" ? { t: f } : Object.assign({}, f);
      const lay = layoutText(c, o.t, 165, 1300, 2, 70);
      o._lay = lay;
      o._y = 470 + (lay.lines.length - 1) * lay.size * 0.56;
      o.icon = o.icon && ICONS[o.icon] ? o.icon : pickIcon(o.t, i);
      return o;
    });
    return P;
  }

  /* Бир кадр. c — 2D контекст (N×N), t — сония. */
  function renderFrame(c, N, tl, P, th, t) {
    const k = N / 2000;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1; c.shadowBlur = 0;
    c.fillStyle = "#000"; c.fillRect(0, 0, N, N);
    c.save();
    c.setTransform(k, 0, 0, k, N / 2, N / 2);
    c.beginPath(); c.arc(0, 0, 1000, 0, TAU); c.clip();
    const T = tl.duration;
    t = ((t % T) + T) % T;
    drawFrame(c, t, T, th, k);
    const fx = 0.5;
    for (const s of tl.scenes) {
      const u = t - s.start;
      if (u < 0 || u > s.dur) continue;
      const env = smooth(seg(u, 0, fx)) * smooth(seg(s.dur - u, 0, fx));
      if (env <= 0.002) continue;
      c.save();
      c.globalAlpha = env;
      const z = 0.93 + 0.07 * env;
      c.scale(z, z);
      SCENES[s.type](c, s, u, P, th, T, k);
      c.restore();
    }
    c.restore();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1; c.shadowBlur = 0;
  }

  /* Қулай оболочка: лойиҳа + мавзу + тезлик → {render(c,N,t), duration, frames} */
  function create(ctx, project, themeKey, opts = {}) {
    const th = THEMES[themeKey] || THEMES.eko;
    const P = prepare(ctx, project);
    const tl = buildTimeline(P, opts);
    return {
      duration: tl.duration, frames: tl.frames, fps: tl.fps, project: P, theme: th, timeline: tl,
      render: (c, N, t) => renderFrame(c, N, tl, P, th, t),
      /* ёрдамчи: статик расм учун ёрқин пайт */
      posterTime: () => tl.scenes[0].start + Math.min(3.6, tl.scenes[0].dur - 0.2),
    };
  }

  global.FanEngine = { create, THEMES, ICONS, ICON_NAMES, pickIcon, drawIcon, _h: { TAU, clamp, seg, smooth, E, setFont, layoutText, drawLines, arcText, glow } };
})(typeof window !== "undefined" ? window : globalThis);
