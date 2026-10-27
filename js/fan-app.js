/* ЭкоГолограмма — вентилятор студияси: интерфейс ва мантиқ. */
(function () {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const TAU = Math.PI * 2;
  const FPS = 30;
  const PV = 560; // кўриб чиқиш canvas ўлчами

  /* ---------- Ҳолат (қурилмада сақланади) ---------- */
  const KEY = "ekofan:v1";
  const store = {
    load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } },
    save(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { /* хотира ўчиқ бўлиши мумкин */ } },
  };
  const state = Object.assign({ custom: [], project: FAN_PROJECTS[0].id, theme: "", px: 1080, speed: 1, sim: false }, store.load());
  if (!Array.isArray(state.custom)) state.custom = [];
  const persist = () => store.save(state);
  const allProjects = () => FAN_PROJECTS.concat(state.custom);
  const current = () => allProjects().find((p) => p.id === state.project) || allProjects()[0];
  const isBuiltin = (p) => FAN_PROJECTS.some((b) => b.id === p.id);
  const themeKey = () => (FanEngine.THEMES[state.theme] ? state.theme : current().theme || "eko");

  // URL параметрлари: fan.html?p=ekomun&theme=neon&px=720&speed=1.3&sim=1
  (function applyQuery() {
    const q = new URLSearchParams(location.search);
    if (q.get("p") && allProjects().some((p) => p.id === q.get("p"))) state.project = q.get("p");
    if (q.get("theme") && FanEngine.THEMES[q.get("theme")]) state.theme = q.get("theme");
    if (q.get("px") && +q.get("px") >= 128 && +q.get("px") <= 4096) state.px = Math.round(+q.get("px") / 2) * 2;
    if (q.get("speed") && +q.get("speed") > 0.3 && +q.get("speed") < 3) state.speed = +q.get("speed");
    if (q.get("sim")) state.sim = q.get("sim") === "1";
  })();

  const fmtTime = (s) => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
  const el = (tag, attrs = {}, text) => {
    const n = document.createElement(tag);
    for (const k in attrs) { if (k === "class") n.className = attrs[k]; else n.setAttribute(k, attrs[k]); }
    if (text != null) n.textContent = text;
    return n;
  };

  /* Файл номи учун кирилл → лотин */
  const TR = { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "j", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "x", ц: "ts", ч: "ch", ш: "sh", щ: "sh", ъ: "", ы: "i", ь: "", э: "e", ю: "yu", я: "ya", ў: "o", қ: "q", ғ: "g", ҳ: "h" };
  const slug = (s) => String(s).toLowerCase().replace(/[а-яёўқғҳ]/g, (ch) => TR[ch] || "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "loyiha";

  /* ---------- Мотор ---------- */
  const pv = $("#preview"), pctx = pv.getContext("2d");
  const srcCv = document.createElement("canvas"); srcCv.width = srcCv.height = PV;
  const sctx = srcCv.getContext("2d", { willReadFrequently: true });
  let eng = null, t = 0, playing = true, last = performance.now(), exporting = false;

  function rebuild() {
    eng = FanEngine.create(pctx, current(), themeKey(), { speed: state.speed, fps: FPS });
    t = Math.min(t, eng.duration - 0.001);
    $("#scrub").value = String(Math.round((t / eng.duration) * 1000));
    updateInfo();
  }

  /* Вентилятор симуляцияси: тасвир қутб тўридан (L ҳалқа × A бурчак) қайта йиғилади */
  let simMap = null, simOut = null;
  function buildSim(L = 128, A = 480) {
    const R = PV / 2, map = new Int32Array(PV * PV).fill(-1);
    for (let y = 0; y < PV; y++) {
      for (let x = 0; x < PV; x++) {
        const dx = x + 0.5 - R, dy = y + 0.5 - R, r = Math.hypot(dx, dy) / R;
        if (r > 1) continue;
        let th = Math.atan2(dy, dx); if (th < 0) th += TAU;
        const ri = Math.min(L - 1, Math.floor(r * L)), ai = Math.floor((th / TAU) * A) % A;
        const rc = ((ri + 0.5) / L) * R, ac = ((ai + 0.5) / A) * TAU;
        const sx = Math.min(PV - 1, Math.floor(R + Math.cos(ac) * rc)), sy = Math.min(PV - 1, Math.floor(R + Math.sin(ac) * rc));
        map[y * PV + x] = sy * PV + sx;
      }
    }
    simMap = map; simOut = pctx.createImageData(PV, PV);
  }

  function draw() {
    if (!eng) return;
    if (!state.sim) { eng.render(pctx, PV, t); return; }
    if (!simMap) buildSim();
    eng.render(sctx, PV, t);
    const src = new Uint32Array(sctx.getImageData(0, 0, PV, PV).data.buffer);
    const out = new Uint32Array(simOut.data.buffer);
    for (let i = 0; i < out.length; i++) { const m = simMap[i]; out[i] = m < 0 ? 0xff000000 : src[m]; }
    pctx.putImageData(simOut, 0, 0);
  }

  function tick(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (playing && !exporting && !document.hidden) {
      t += dt; if (t >= eng.duration) t -= eng.duration;
      $("#scrub").value = String(Math.round((t / eng.duration) * 1000));
    }
    if (!exporting) draw();
    $("#timeLbl").textContent = `${fmtTime(t)} / ${fmtTime(eng.duration)}`;
    requestAnimationFrame(tick);
  }

  /* ---------- Чиплар ---------- */
  function renderChips() {
    const pc = $("#projectChips"); pc.textContent = "";
    for (const p of allProjects()) {
      const b = el("button", { class: "chip", role: "radio", "aria-checked": String(p.id === state.project), type: "button" }, (isBuiltin(p) ? "" : "★ ") + p.name);
      b.addEventListener("click", () => { state.project = p.id; persist(); t = 0; renderChips(); rebuild(); hideResult(); });
      pc.appendChild(b);
    }
    const tc = $("#themeChips"); tc.textContent = "";
    const mk = (key, label) => {
      const sel = key === "" ? !FanEngine.THEMES[state.theme] : state.theme === key;
      const b = el("button", { class: "chip", role: "radio", "aria-checked": String(sel), type: "button" }, label);
      b.addEventListener("click", () => { state.theme = key; persist(); renderChips(); rebuild(); hideResult(); });
      tc.appendChild(b);
    };
    mk("", "Лойиҳаники");
    for (const k in FanEngine.THEMES) mk(k, FanEngine.THEMES[k].name);
    $("#editBtn").textContent = isBuiltin(current()) ? "📄 Нусха яратиш" : "✏️ Таҳрирлаш";
  }

  function updateInfo() {
    const mb = ((Math.max(1.5e6, Math.min(12e6, state.px * state.px * FPS * 0.12)) * eng.duration) / 8) / 1048576;
    $("#infoLine").textContent = `Давомийлиги: ${Math.round(eng.duration)} с · ${eng.frames} кадр · ${FPS} к/с · ${state.px}×${state.px} · ҳажми тахминан ${Math.max(1, Math.round(mb * 0.7))}–${Math.max(2, Math.round(mb))} МБ`;
  }

  /* ---------- Ўлчамлар / тезлик ---------- */
  $("#pxSel").value = String(state.px);
  if ($("#pxSel").value !== String(state.px)) { const o = el("option", { value: String(state.px) }, `${state.px} × ${state.px}`); $("#pxSel").appendChild(o); $("#pxSel").value = String(state.px); }
  $("#speedSel").value = String(state.speed);
  if ($("#speedSel").value !== String(state.speed)) $("#speedSel").value = "1";
  $("#pxSel").addEventListener("change", (e) => { state.px = +e.target.value; persist(); updateInfo(); hideResult(); });
  $("#speedSel").addEventListener("change", (e) => { state.speed = +e.target.value; persist(); rebuild(); hideResult(); });
  $("#simChk").checked = !!state.sim;
  $("#simChk").addEventListener("change", (e) => { state.sim = e.target.checked; persist(); });

  $("#playBtn").addEventListener("click", () => { playing = !playing; $("#playBtn").textContent = playing ? "⏸" : "▶"; });
  $("#scrub").addEventListener("input", (e) => { t = (+e.target.value / 1000) * eng.duration; if (playing) { /* вақт билан давом этади */ } });

  /* ---------- Экспорт ---------- */
  let lastResult = null, resultUrl = null, abortCtl = null, wakeLock = null;

  function hideResult() {
    $("#result").hidden = true;
    if (resultUrl) { URL.revokeObjectURL(resultUrl); resultUrl = null; }
    lastResult = null;
  }

  function setProgress(p, sec) {
    const pct = Math.round(p * 100);
    $("#bar").style.width = pct + "%";
    const left = p > 0.03 ? Math.max(0, sec / p - sec) : null;
    $("#progLbl").textContent = `${pct}%` + (left != null ? ` · ≈ ${Math.ceil(left)} с қолди` : "");
  }

  async function make() {
    if (exporting) return;
    hideResult();
    const proj = current(), tk = themeKey(), px = state.px;
    const cv = document.createElement("canvas"); cv.width = cv.height = px;
    const ctx = cv.getContext("2d");
    const e2 = FanEngine.create(ctx, proj, tk, { speed: state.speed, fps: FPS });
    const bitrate = Math.round(Math.max(1.5e6, Math.min(12e6, px * px * FPS * 0.12)));
    const job = { canvas: cv, draw: (c, tt) => e2.render(c, px, tt), frames: e2.frames, fps: FPS, bitrate };

    exporting = true; abortCtl = new AbortController(); job.signal = abortCtl.signal; job.onProgress = setProgress;
    $("#makeBtn").disabled = true; $("#progress").hidden = false; $("#warnLine").hidden = true; setProgress(0, 0);
    try { if (navigator.wakeLock) wakeLock = await navigator.wakeLock.request("screen"); } catch (e) { /* муҳим эмас */ }

    let res = null;
    try {
      if (FanExport.canMP4()) {
        try { res = await FanExport.exportMP4(job); }
        catch (err) {
          if (err && err.name === "AbortError") throw err;
          if (!(err && err.message === "NO_H264")) console.warn("MP4 хато:", err);
          res = null;
        }
      }
      if (!res) {
        warn("Бу браузер тайёр MP4 ясашни қўлламайди. Видео реал вақтда ёзилмоқда (" + Math.round(e2.duration) + " с) — шу вақт мобайнида саҳифани ёпманг. Яхши натижа учун Chrome ёки Safari (iOS 16.4+) ишлатинг.");
        res = await FanExport.exportRealtime(job);
        warn(res.ext !== "mp4"
          ? "Видео " + res.ext.toUpperCase() + " форматида чиқди — баъзи вентилятор иловалари уни қабул қилмайди. Chrome'да очиб, MP4 қилинг."
          : "Видео реал вақтда ёзилди — секин қурилмада айрим кадрлар тушиб қолиши мумкин. Равон натижа учун Chrome ёки Safari (iOS 16.4+) да яратинг.");
      }
    } catch (err) {
      if (err && err.name === "AbortError") warn("Бекор қилинди.");
      else { console.error(err); warn("Видео тайёрланмади: " + (err && err.message ? err.message : err) + ". Кичикроқ ўлчам (720×720) билан қайта уриниб кўринг."); }
      finish();
      return;
    }
    const name = `${slug(proj.id || proj.name)}-${tk}-${px}.${res.ext}`;
    lastResult = { blob: res.blob, name, ext: res.ext, px, e2 };
    resultUrl = URL.createObjectURL(res.blob);
    const v = $("#resVideo"); v.src = resultUrl; v.play().catch(() => {});
    $("#resInfo").textContent = `${name} · ${Math.round(e2.duration)} с · ${px}×${px} · ${(res.blob.size / 1048576).toFixed(1)} МБ` + (res.exact ? " · H.264, " + FPS + " к/с" : "");
    const canShare = (() => { try { return !!(navigator.canShare && navigator.canShare({ files: [new File([res.blob], name, { type: res.blob.type })] })); } catch (e) { return false; } })();
    $("#shareBtn").hidden = !canShare;
    $("#result").hidden = false;
    finish();
    $("#result").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function finish() {
    exporting = false; abortCtl = null; last = performance.now();
    $("#makeBtn").disabled = false; $("#progress").hidden = true;
    if (wakeLock) { try { wakeLock.release(); } catch (e) { /* аллақачон бўшатилган */ } wakeLock = null; }
  }
  function warn(msg) { const w = $("#warnLine"); w.textContent = msg; w.hidden = false; }

  $("#makeBtn").addEventListener("click", make);
  $("#cancelBtn").addEventListener("click", () => { if (abortCtl) abortCtl.abort(); });
  $("#dlBtn").addEventListener("click", () => { if (lastResult) FanExport.download(lastResult.blob, lastResult.name); });
  $("#shareBtn").addEventListener("click", async () => {
    if (!lastResult) return;
    try { await FanExport.share(lastResult.blob, lastResult.name, current().name); } catch (e) { if (e && e.name !== "AbortError") warn("Улашиб бўлмади — «Юклаб олиш» ни босинг."); }
  });
  $("#pngBtn").addEventListener("click", async () => {
    const px = state.px, cv = document.createElement("canvas"); cv.width = cv.height = px;
    const c = cv.getContext("2d"), e2 = FanEngine.create(c, current(), themeKey(), { speed: state.speed, fps: FPS });
    e2.render(c, px, e2.posterTime());
    FanExport.download(await FanExport.exportPNG(cv), `${slug(current().id || current().name)}-${themeKey()}-${px}.png`);
  });

  /* ---------- Лойиҳа таҳрирлаш ---------- */
  const dlg = $("#editor");
  let editing = null; // таҳрирланаётган махсус лойиҳа ёки null (янги)

  (function fillSelects() {
    const ic = $("#fIcon"); ic.appendChild(el("option", { value: "" }, "Автоматик"));
    FanEngine.ICON_NAMES.forEach((n) => ic.appendChild(el("option", { value: n }, n)));
    const th = $("#fTheme");
    for (const k in FanEngine.THEMES) th.appendChild(el("option", { value: k }, FanEngine.THEMES[k].name));
    $("#iconList").textContent = FanEngine.ICON_NAMES.join("  ·  ");
  })();

  const featuresToText = (fs) => (fs || []).map((f) => (typeof f === "string" ? f : (f.icon ? `[${f.icon}] ` : "") + f.t)).join("\n");
  const statsToText = (ss) => (ss || []).map((s) => `${s.v}${s.suffix || ""} ${s.l || ""}`.trim()).join("\n");
  function parseFeatures(text) {
    return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 8).map((l) => {
      const m = l.match(/^\[(\w+)\]\s*(.+)$/);
      return m && FanEngine.ICONS[m[1]] ? { t: m[2].trim(), icon: m[1] } : { t: l.replace(/^\[\w+\]\s*/, "") };
    });
  }
  function parseStats(text) {
    return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 4).map((l) => {
      const m = l.match(/^(\d[\d ]*)(\+?)\s*(.*)$/);
      if (!m) return null;
      const v = parseInt(m[1].replace(/\s/g, ""), 10);
      return Number.isFinite(v) ? { v, suffix: m[2] || "", l: m[3] || "" } : null;
    }).filter(Boolean);
  }

  function openEditor(p, asCopy) {
    editing = p && !asCopy ? p : null;
    $("#editTitle").textContent = editing ? "Лойиҳани таҳрирлаш" : (asCopy ? "Нусха яратиш" : "Янги лойиҳа");
    $("#fName").value = p ? p.name + (asCopy ? " (нусха)" : "") : "";
    $("#fKicker").value = p ? p.kicker || "" : "";
    $("#fTagline").value = p ? p.tagline || "" : "";
    $("#fUrl").value = p ? p.url || "" : "";
    $("#fIcon").value = p && p.icon ? p.icon : "";
    $("#fTheme").value = p && FanEngine.THEMES[p.theme] ? p.theme : "eko";
    $("#fFeatures").value = p ? featuresToText(p.features) : "";
    $("#fStats").value = p ? statsToText(p.stats) : "";
    $("#delBtn").hidden = !editing;
    $("#ghMsg").textContent = ""; $("#editWarn").hidden = true;
    dlg.showModal();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); // телефонда клавиатура ўзи чиқмасин
  }

  function collect() {
    return {
      id: editing ? editing.id : "c-" + Date.now().toString(36),
      name: $("#fName").value.trim(),
      kicker: $("#fKicker").value.trim(),
      tagline: $("#fTagline").value.trim(),
      url: $("#fUrl").value.trim(),
      icon: $("#fIcon").value || undefined,
      theme: $("#fTheme").value || "eko",
      features: parseFeatures($("#fFeatures").value),
      stats: parseStats($("#fStats").value),
    };
  }

  $("#newBtn").addEventListener("click", () => openEditor(null));
  $("#editBtn").addEventListener("click", () => { const p = current(); openEditor(p, isBuiltin(p)); });
  $("#cancelEdit").addEventListener("click", () => dlg.close());
  $("#delBtn").addEventListener("click", () => {
    if (!editing || !confirm(`«${editing.name}» лойиҳасини ўчирасизми?`)) return;
    state.custom = state.custom.filter((p) => p.id !== editing.id);
    if (state.project === editing.id) state.project = FAN_PROJECTS[0].id;
    persist(); dlg.close(); renderChips(); rebuild(); hideResult();
  });
  $("#editForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const p = collect();
    if (!p.name) { $("#fName").focus(); return; }
    const w = [];
    if (p.name.length > 22) w.push("Ном узун — иккита сатрга бўлинади ёки кичрайиб кетади.");
    if (p.tagline.length > 38) w.push("Шиор узун (>38 белги) — ёй бўйлаб кичик ёзилади.");
    if (p.url && p.url.length > 28) w.push("Сайт манзили узун — шиор кўрсатилади. Қисқа манзил ёзинг.");
    if (!p.features.length && !p.stats.length) w.push("Хусусият ёки рақам қўшсангиз, видео бойроқ чиқади.");
    if (w.length && $("#editWarn").dataset.shown !== p.name + w.join()) {
      $("#editWarn").textContent = w.join(" ") + " Барибир сақлаш учун яна «Сақлаш» ни босинг.";
      $("#editWarn").hidden = false; $("#editWarn").dataset.shown = p.name + w.join(); return;
    }
    const i = state.custom.findIndex((x) => x.id === p.id);
    if (i >= 0) state.custom[i] = p; else state.custom.push(p);
    state.project = p.id; persist(); dlg.close(); t = 0; renderChips(); rebuild(); hideResult();
  });

  /* ---------- Лойиҳаларни файлга сақлаш / юклаш ---------- */
  $("#saveJsonBtn").addEventListener("click", () => {
    if (!state.custom.length) { alert("Ҳали ўз лойиҳангиз йўқ. Аввал «➕ Янги лойиҳа» ни босинг."); return; }
    FanExport.download(new Blob([JSON.stringify(state.custom, null, 2)], { type: "application/json" }), "ekogolo-loyihalar.json");
  });
  $("#loadJsonBtn").addEventListener("click", () => $("#jsonFile").click());
  $("#jsonFile").addEventListener("change", async (e) => {
    const f = e.target.files[0]; e.target.value = "";
    if (!f) return;
    try {
      const arr = JSON.parse(await f.text());
      const list = (Array.isArray(arr) ? arr : [arr]).filter((p) => p && typeof p.name === "string");
      if (!list.length) throw new Error("bo'sh");
      for (const p of list) {
        const q = { id: "c-" + Math.random().toString(36).slice(2, 8), name: String(p.name).slice(0, 40), kicker: String(p.kicker || "").slice(0, 40), tagline: String(p.tagline || "").slice(0, 60), url: String(p.url || "").slice(0, 40), icon: FanEngine.ICONS[p.icon] ? p.icon : undefined, theme: FanEngine.THEMES[p.theme] ? p.theme : "eko",
          features: (p.features || []).slice(0, 8).map((x) => (typeof x === "string" ? { t: x } : { t: String(x.t || ""), icon: FanEngine.ICONS[x.icon] ? x.icon : undefined })).filter((x) => x.t),
          stats: (p.stats || []).slice(0, 4).map((s) => ({ v: Number(s.v) || 0, l: String(s.l || ""), suffix: String(s.suffix || "").slice(0, 2) })) };
        state.custom.push(q); state.project = q.id;
      }
      persist(); renderChips(); rebuild(); hideResult();
    } catch (err) { alert("Файл ўқилмади. Бу «⬇ Файлга» орқали сақланган .json бўлиши керак."); }
  });

  /* ---------- GitHub README'дан лойиҳа ясаш ---------- */
  const stripMd = (s) => s.replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/\*\*|__|`/g, "")
    .replace(/<[^>]+>/g, "").replace(/[\u{1F000}-\u{1FFFF}☀-➿️‍]/gu, "").replace(/\s+/g, " ").trim();

  // README'да вентиляторга керак бўлмаган бўлимлар (ўрнатиш, лицензия, жойлаштириш…)
  const STOP = /ишга туши|лицензия|жойлаштир|интернетга|google play|таништирув|йиғиш|созла|ўрнат|install|license|deploy|build|тузилма|контентни|муаммо бўлса|чекловлар|талаб|ёрдам\b|ўзгартиш|мурожаат матни|бўлимлар|имкониятлар/i;
  function okFeat(raw) {
    const s = String(raw).replace(/\s*\(.*?\)/g, "").replace(/[«»"“”#]/g, "").replace(/\s+/g, " ").trim();
    return s.length >= 4 && s.length <= 40 && !/[\\/{}=<>]|\.(js|md|json|html)\b/i.test(s) && !STOP.test(s) ? s : null;
  }

  /* README → лойиҳа эскизи. Сарлавҳалар (##) бўлим номларини беради; улар кам бўлса — рўйхатдаги қалин сўзлар.
     Натижа бошланғич нуқта: фойдаланувчи таҳрирлайди. */
  function parseReadme(md, repo) {
    const lines = md.split(/\r?\n/);
    let fence = false, name = "", tagline = "";
    const heads = [], bullets = [];
    for (const raw of lines) {
      const l = raw.trim();
      if (l.startsWith("```")) { fence = !fence; continue; }
      if (fence || !l) continue;
      if (!name && /^#\s+/.test(l)) { name = stripMd(l.replace(/^#\s+/, "")).replace(/[«»"“”]/g, "").split(/\s[—–-]\s/)[0].trim(); continue; }
      const h = l.match(/^#{2,3}\s+(.*)$/);
      if (h) { const f = okFeat(stripMd(h[1]).split(/:\s/)[0]); if (f) heads.push(f); continue; }
      if (!tagline && name && !/^(#|>|[-*+]\s|\||<|!\[|\d+\.\s)/.test(l)) {
        let s = stripMd(l); const cut = s.search(/[.:!?](\s|$)/);
        if (cut > 18) s = s.slice(0, cut);
        if (s.length > 60) s = s.slice(0, 60).replace(/\s+\S*$/, "") + "…";
        tagline = s; continue;
      }
      const m = l.match(/^[-*+]\s+(.*)$/);
      if (m && bullets.length < 16) {
        const bolds = [...m[1].matchAll(/\*\*([^*]+)\*\*/g)].map((x) => stripMd(x[1]));
        const parts = bolds.length ? bolds : [stripMd(m[1].split(/\s[—–]\s|:\s/)[0])];
        for (const part of parts) { const f = okFeat(part); if (f) bullets.push(f); }
      }
    }
    const pool = heads.length >= 4 ? heads : bullets.concat(heads);
    const feats = [...new Set(pool)].slice(0, 8);
    return { name: name || repo, tagline, features: feats.map((t) => ({ t })) };
  }

  $("#ghBtn").addEventListener("click", async () => {
    const msg = $("#ghMsg"), v = $("#ghUrl").value.trim();
    const m = v.match(/github\.com\/([^/\s]+)\/([^/\s#?]+)/i) || v.match(/^([\w.-]+)\/([\w.-]+)$/);
    if (!m) { msg.textContent = "Манзилни шундай ёзинг: https://github.com/эгаси/репозиторий"; return; }
    const owner = m[1], repo = m[2].replace(/\.git$/, "");
    msg.textContent = "Юкланмоқда…";
    for (const f of ["README.md", "readme.md", "Readme.md"]) {
      try {
        const r = await fetch(`https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/HEAD/${f}`);
        if (!r.ok) continue;
        const p = parseReadme(await r.text(), repo);
        $("#fName").value = p.name; $("#fTagline").value = p.tagline;
        $("#fFeatures").value = featuresToText(p.features);
        if (!$("#fKicker").value) $("#fKicker").value = "Экология яхшилаш учун";
        msg.textContent = `Тайёр: ${p.features.length} та хусусият топилди. Керакли жойларини тузатиб, «Сақлаш» ни босинг.`;
        return;
      } catch (e) { /* кейингисини синаймиз */ }
    }
    msg.textContent = "README топилмади (репозиторий махфий бўлиши ёки интернет йўқ бўлиши мумкин). Маълумотни қўлда киритинг.";
  });

  /* ---------- Тайёр видеолар ---------- */
  (function readyVideos() {
    const box = $("#readyList");
    if (!box || !global_ready()) return;
    for (const v of window.FAN_READY) {
      const b = el("button", { class: "chip", type: "button" }, "⬇ " + v.name);
      b.addEventListener("click", async () => {
        const old = b.textContent; b.textContent = "Юкланмоқда…"; b.disabled = true;
        try {
          const r = await fetch(v.file);
          if (!r.ok) throw new Error(r.status);
          await FanExport.download(await r.blob(), v.file.split("/").pop());
        } catch (e) { warn("Тайёр видеони юклаб бўлмади. Пастда ўзингиз яратинг."); }
        b.textContent = old; b.disabled = false;
      });
      box.appendChild(b);
    }
  })();
  function global_ready() { return Array.isArray(window.FAN_READY) && window.FAN_READY.length; }

  // Claude саҳифаси ичида (қум ҳовуз) ташқи fetch ёпиқ — GitHub'дан олиш тугмасини яширамиз
  if (window.claude && window.claude.use) { const g = document.querySelector("fieldset.gh"); if (g) g.hidden = true; }

  /* ---------- Бошланиш ---------- */
  renderChips();
  rebuild();
  requestAnimationFrame((n) => { last = n; tick(n); });

  // Синов ва автоматлаштириш учун очиқ API
  window.FanStudio = { state, current, themeKey, make, rebuild, setTime: (s) => { t = s; draw(); }, engine: () => eng };
})();
