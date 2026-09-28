/* ЭкоТаълим — асосий мантиқ */
(() => {
  "use strict";

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  /* ---------- Ҳолат (браузерда сақланади) ---------- */
  const KEY = "ekotalim:v1";
  const fresh = () => ({ xp: 0, correct: {}, perfect: {}, challenges: {}, flags: {}, name: "" });
  let state = fresh();
  try { state = Object.assign(fresh(), JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) { /* хотира йўқ — сақламасдан ишлайди */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ } };

  const toastEl = $("#toast");
  let toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2600);
  }

  function addXp(n, why) {
    const before = levelOf(state.xp);
    state.xp += n;
    save();
    const after = levelOf(state.xp);
    if (after !== before) toast(`🎉 Янги даража: ${after.icon} ${after.name}!`);
    else if (why) toast(`+${n} XP · ${why}`);
    renderGamification();
  }

  function flag(name) {
    if (state.flags[name]) return;
    state.flags[name] = true;
    save();
    renderGamification();
  }

  /* ---------- Курслар ---------- */
  const qKey = (c, l, q) => `${c}:${l}:${q}`;
  const lessonDone = (c, li) => COURSES.find((x) => x.id === c).lessons[li].quiz.every((_, qi) => state.correct[qKey(c, li, qi)]);
  const courseProgress = (c) => {
    const course = COURSES.find((x) => x.id === c);
    const done = course.lessons.filter((_, i) => lessonDone(c, i)).length;
    return { done, total: course.lessons.length };
  };
  const totalLessons = COURSES.reduce((s, c) => s + c.lessons.length, 0);

  let courseFilter = "all";
  function renderCourses() {
    $("#courseGrid").innerHTML = COURSES.filter((c) => courseFilter === "all" || c.audience === courseFilter).map((c) => {
      const p = courseProgress(c.id);
      const pct = Math.round((p.done / p.total) * 100);
      const complete = p.done === p.total;
      return `<article class="course">
        <div class="course-top"><div class="course-icon">${c.icon}</div><span class="pill">${esc(c.audienceLabel)}</span></div>
        <h3>${esc(c.title)}</h3>
        <p>${esc(c.desc)}</p>
        <div class="progress" title="${pct}%"><div style="width:${pct}%"></div></div>
        <span class="small muted">${p.done} / ${p.total} дарс тугатилди</span>
        <ul class="lesson-list">${c.lessons.map((l, i) => `
          <li><button data-c="${c.id}" data-l="${i}">
            <span class="${lessonDone(c.id, i) ? "done" : ""}">${lessonDone(c.id, i) ? "✓" : i + 1}</span>
            ${esc(l.title)}<span class="mins">${l.minutes} дақ</span>
          </button></li>`).join("")}
        </ul>
        ${complete
          ? `<button class="btn btn-primary" data-cert="${c.id}">🏆 Сертификат олиш</button>`
          : `<button class="btn btn-ghost" data-c="${c.id}" data-l="${c.lessons.findIndex((_, i) => !lessonDone(c.id, i))}">${p.done ? "Давом эттириш" : "Бошлаш"} →</button>`}
      </article>`;
    }).join("");

    const all = COURSES.reduce((s, c) => s + courseProgress(c.id).done, 0);
    $("#progressPct").textContent = Math.round((all / totalLessons) * 100) + "%";
    $("#lessonCount").textContent = totalLessons;
  }

  $("#courseFilters").addEventListener("click", (e) => {
    const b = e.target.closest("[data-f]");
    if (!b) return;
    courseFilter = b.dataset.f;
    $$("#courseFilters .chip").forEach((x) => x.classList.toggle("active", x === b));
    renderCourses();
  });

  $("#courseGrid").addEventListener("click", (e) => {
    const cert = e.target.closest("[data-cert]");
    if (cert) return openCertificate(cert.dataset.cert);
    const b = e.target.closest("[data-c]");
    if (b) openLesson(b.dataset.c, +b.dataset.l);
  });

  const modal = $("#lessonModal");
  const modalBody = $("#modalBody");
  $("#modalClose").addEventListener("click", () => modal.close());
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.close(); });
  modal.addEventListener("close", renderCourses);

  function openLesson(cid, li) {
    const course = COURSES.find((c) => c.id === cid);
    const lesson = course.lessons[li];
    const answered = {};
    modalBody.innerHTML = `
      <span class="pill">${course.icon} ${esc(course.title)} · ${li + 1}/${course.lessons.length}-дарс</span>
      <h2>${esc(lesson.title)}</h2>
      <div class="lesson-body">${lesson.body.map((p) => `<p>${esc(p)}</p>`).join("")}</div>
      <div class="lesson-tip">💡 <b>Амалий маслаҳат:</b> ${esc(lesson.tip)}</div>
      <div class="quiz">
        <h3>📝 Билимингизни синанг</h3>
        ${lesson.quiz.map((q, qi) => `
          <div class="q" data-q="${qi}">
            <p>${qi + 1}. ${esc(q.q)}</p>
            <div class="opts">${q.a.map((a, ai) => `<button class="opt" data-a="${ai}">${esc(a)}</button>`).join("")}</div>
          </div>`).join("")}
        <p id="quizResult" class="muted"></p>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="prevL" ${li === 0 ? "disabled" : ""}>← Олдинги</button>
        <button class="btn btn-primary" id="nextL">${li === course.lessons.length - 1 ? "Курсни якунлаш" : "Кейинги дарс →"}</button>
      </div>`;

    $$(".q", modalBody).forEach((qEl) => {
      qEl.addEventListener("click", (e) => {
        const opt = e.target.closest(".opt");
        if (!opt) return;
        const qi = +qEl.dataset.q;
        const ai = +opt.dataset.a;
        const q = lesson.quiz[qi];
        $$(".opt", qEl).forEach((o, i) => {
          o.disabled = true;
          if (i === q.c) o.classList.add("right");
        });
        answered[qi] = ai === q.c;
        if (ai === q.c) {
          const k = qKey(cid, li, qi);
          if (!state.correct[k]) { state.correct[k] = true; addXp(10, "тўғри жавоб"); }
        } else {
          opt.classList.add("wrong");
        }
        if (Object.keys(answered).length === lesson.quiz.length) finishQuiz();
      });
    });

    function finishQuiz() {
      const right = Object.values(answered).filter(Boolean).length;
      const res = $("#quizResult", modalBody);
      if (right === lesson.quiz.length) {
        res.innerHTML = `✅ Аъло! ${right}/${lesson.quiz.length} тўғри. Дарс тугатилди.`;
        const pk = `${cid}:${li}`;
        if (!state.perfect[pk]) { state.perfect[pk] = true; addXp(20, "дарс тугатилди"); }
        const p = courseProgress(cid);
        if (p.done === p.total) flag(`course_${cid}`);
      } else {
        res.innerHTML = `${right}/${lesson.quiz.length} тўғри. Дарсни яна бир бор ўқиб, қайта уриниб кўринг. <button class="linklike" id="retry">Қайта топшириш</button>`;
        $("#retry", modalBody).addEventListener("click", () => openLesson(cid, li));
      }
    }

    $("#prevL", modalBody).addEventListener("click", () => openLesson(cid, li - 1));
    $("#nextL", modalBody).addEventListener("click", () => {
      if (li < course.lessons.length - 1) return openLesson(cid, li + 1);
      const p = courseProgress(cid);
      if (p.done === p.total) openCertificate(cid);
      else { modal.close(); toast(`Сертификат учун барча дарс тестларидан ўтинг (${p.done}/${p.total})`); }
    });

    if (!modal.open) modal.showModal();
    modal.scrollTop = 0;
  }

  /* ---------- Сертификат ---------- */
  function openCertificate(cid) {
    const course = COURSES.find((c) => c.id === cid);
    modalBody.innerHTML = `
      <span class="pill">🏆 Табриклаймиз!</span>
      <h2>«${esc(course.title)}» курси муваффақиятли тугатилди</h2>
      <p class="muted">Сертификатга ёзиладиган исм-шарифингизни киритинг ва уни PNG шаклида юклаб олинг.</p>
      <form class="cert-form" id="certForm">
        <input id="certName" required maxlength="60" placeholder="Исм Фамилия" value="${esc(state.name)}">
        <button class="btn btn-primary">⬇ Юклаб олиш</button>
      </form>`;
    $("#certForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const name = $("#certName").value.trim();
      if (!name) return;
      state.name = name; save();
      downloadCertificate(name, course);
    });
    if (!modal.open) modal.showModal();
  }

  function downloadCertificate(name, course) {
    const W = 1600, H = 1130;
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const g = cv.getContext("2d");
    const bg = g.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, "#f0fdf4"); bg.addColorStop(1, "#e0f2fe");
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.strokeStyle = "#15803d"; g.lineWidth = 14; g.strokeRect(40, 40, W - 80, H - 80);
    g.strokeStyle = "#86efac"; g.lineWidth = 3; g.strokeRect(70, 70, W - 140, H - 140);
    g.textAlign = "center";
    g.fillStyle = "#15803d"; g.font = "700 44px Inter, sans-serif";
    g.fillText("🌿 ЭкоТаълим", W / 2, 180);
    g.fillStyle = "#13261a"; g.font = "800 96px Inter, sans-serif";
    g.fillText("СЕРТИФИКАТ", W / 2, 320);
    g.fillStyle = "#5b6f61"; g.font = "400 36px Inter, sans-serif";
    g.fillText("Ушбу сертификат", W / 2, 420);
    g.fillStyle = "#0c4a6e"; g.font = "700 76px Inter, sans-serif";
    g.fillText(name, W / 2, 530, W - 240);
    g.fillStyle = "#15803d"; g.fillRect(W / 2 - 300, 560, 600, 4);
    g.fillStyle = "#5b6f61"; g.font = "400 36px Inter, sans-serif";
    g.fillText("га қуйидаги экологик таълим курсини муваффақиятли", W / 2, 640);
    g.fillText("тугатганлиги учун берилди:", W / 2, 690);
    g.fillStyle = "#13261a"; g.font = "700 50px Inter, sans-serif";
    g.fillText(`«${course.title}»`, W / 2, 790, W - 240);
    g.fillStyle = "#5b6f61"; g.font = "400 30px Inter, sans-serif";
    g.fillText(`${course.lessons.length} та дарс · барча тестлар топширилган`, W / 2, 850);
    const d = new Date();
    g.textAlign = "left"; g.fillText(`Сана: ${dayKey(d).split("-").reverse().join(".")}`, 160, 990);
    const id = "ET-" + course.id.toUpperCase() + "-" + d.getTime().toString(36).toUpperCase();
    g.textAlign = "right"; g.fillText(`№ ${id}`, W - 160, 990);
    g.font = "120px sans-serif"; g.textAlign = "center"; g.fillText("🌍", W / 2, 1010);

    const a = document.createElement("a");
    a.download = `EkoTalim-sertifikat-${course.id}.png`;
    a.href = cv.toDataURL("image/png");
    a.click();
    toast("🏆 Сертификат юклаб олинди!");
  }

  /* ---------- Янгиликлар ---------- */
  let newsCat = "all";
  let newsQ = "";
  $("#newsFilters").innerHTML = Object.entries(NEWS_CATS).map(([k, v]) =>
    `<button class="chip ${k === "all" ? "active" : ""}" data-n="${k}">${v}</button>`).join("");
  $("#newsFilters").addEventListener("click", (e) => {
    const b = e.target.closest("[data-n]");
    if (!b) return;
    newsCat = b.dataset.n;
    $$("#newsFilters .chip").forEach((x) => x.classList.toggle("active", x === b));
    renderNews();
  });
  $("#newsSearch").addEventListener("input", (e) => { newsQ = e.target.value.trim().toLowerCase(); renderNews(); });

  function renderNews() {
    const now = Date.now();
    const items = [...NEWS]
      .sort((a, b) => b.date.localeCompare(a.date))
      .filter((n) => newsCat === "all" || n.cat === newsCat)
      .filter((n) => !newsQ || (n.title + " " + n.text).toLowerCase().includes(newsQ));
    $("#newsGrid").innerHTML = items.length ? items.map((n) => {
      const age = (now - new Date(n.date + "T00:00:00").getTime()) / 864e5;
      return `<article class="news">
        <div class="news-img">${n.img}</div>
        <div class="news-meta"><span class="tag">${esc(NEWS_CATS[n.cat] || n.cat)}</span>
          <span>${n.date.split("-").reverse().join(".")}</span>${age >= 0 && age <= 7 ? '<span class="new">ЯНГИ</span>' : ""}</div>
        <h3>${esc(n.title)}</h3>
        <p>${esc(n.text)}</p>
      </article>`;
    }).join("") : `<p class="muted">Ҳеч нарса топилмади.</p>`;
  }

  /* ---------- Ҳаво сифати (Open-Meteo, жонли) ---------- */
  const CITIES = [
    ["Тошкент", 41.31, 69.28], ["Самарқанд", 39.65, 66.96], ["Бухоро", 39.77, 64.42],
    ["Нукус", 42.46, 59.6], ["Фарғона", 40.39, 71.78], ["Наманган", 41.0, 71.67],
    ["Андижон", 40.78, 72.34], ["Қарши", 38.86, 65.79], ["Термиз", 37.22, 67.28],
    ["Урганч", 41.55, 60.63], ["Навоий", 40.1, 65.38], ["Жиззах", 40.12, 67.84], ["Гулистон", 40.49, 68.78]
  ];
  function aqiInfo(v) {
    if (v == null) return ["#999", "Маълумот йўқ"];
    if (v <= 50) return ["#22c55e", "Яхши"];
    if (v <= 100) return ["#eab308", "Ўртача"];
    if (v <= 150) return ["#f97316", "Сезгирлар учун зарарли"];
    if (v <= 200) return ["#ef4444", "Зарарли"];
    return ["#a855f7", "Жуда зарарли"];
  }
  async function loadAir() {
    const grid = $("#aqGrid");
    grid.innerHTML = `<p class="muted">Юкланмоқда…</p>`;
    const url = "https://air-quality-api.open-meteo.com/v1/air-quality?" + new URLSearchParams({
      latitude: CITIES.map((c) => c[1]).join(","),
      longitude: CITIES.map((c) => c[2]).join(","),
      current: "us_aqi,pm2_5,pm10,nitrogen_dioxide",
      timezone: "Asia/Tashkent"
    });
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(r.status);
      let data = await r.json();
      if (!Array.isArray(data)) data = [data];
      const rows = CITIES.map((c, i) => ({ name: c[0], cur: (data[i] || {}).current || {} }))
        .sort((a, b) => (b.cur.us_aqi ?? -1) - (a.cur.us_aqi ?? -1));
      grid.innerHTML = rows.map(({ name, cur }) => {
        const [col, lbl] = aqiInfo(cur.us_aqi);
        const f = (v) => (v == null ? "—" : Math.round(v));
        return `<div class="aq" style="--aq:${col}">
          <h4>${esc(name)}</h4>
          <div class="aqi">${f(cur.us_aqi)}</div><div class="lbl" style="color:${col}">${lbl}</div>
          <dl><dt>PM2.5</dt><dd>${f(cur.pm2_5)} мкг/м³</dd><dt>PM10</dt><dd>${f(cur.pm10)} мкг/м³</dd><dt>NO₂</dt><dd>${f(cur.nitrogen_dioxide)} мкг/м³</dd></dl>
        </div>`;
      }).join("");
      const t = rows[0] && rows[0].cur.time;
      $("#aqTime").textContent = t ? `Охирги янгиланиш: ${t.replace("T", " ")} (Тошкент вақти). Бу модел асосидаги баҳо, расмий станция ўлчови эмас.` : "";
      flag("air");
    } catch (e) {
      grid.innerHTML = `<p class="muted">Ҳаво сифати маълумотларини юклаб бўлмади. Интернет алоқасини текширинг ва «Янгилаш» тугмасини босинг.</p>`;
    }
  }
  $("#aqRefresh").addEventListener("click", loadAir);

  /* ---------- Углерод калькулятори ---------- */
  const form = $("#calcForm");
  function calc() {
    const v = Object.fromEntries(new FormData(form));
    $$("input[type=range]", form).forEach((r) => { r.nextElementSibling.value = r.value; });
    const parts = {
      "⚡ Электр": (+v.elec) * 12 * 0.45,
      "🔥 Газ": (+v.gas) * 12 * 1.9,
      "🚗 Автомобиль": (+v.car) * 52 * 0.17,
      "✈️ Парвозлар": (+v.fly) * 250,
      "🍽️ Овқат": +v.diet,
      "🗑️ Чиқинди": v.recycle ? 150 : 350
    };
    const total = Object.values(parts).reduce((a, b) => a + b, 0) / 1000;
    $("#calcTotal").textContent = total.toFixed(1);
    const max = 12;
    const path = $("#gaugeVal");
    const len = path.getTotalLength();
    path.style.strokeDasharray = len;
    path.style.strokeDashoffset = len * (1 - Math.min(total / max, 1));
    path.style.stroke = total <= 2.5 ? "#22c55e" : total <= 5 ? "#eab308" : total <= 8 ? "#f97316" : "#ef4444";

    const biggest = Math.max(...Object.values(parts));
    $("#calcBars").innerHTML = Object.entries(parts).map(([k, val]) => `
      <div class="bar-row"><span>${k}</span><div class="progress"><div style="width:${(val / biggest) * 100}%"></div></div><span>${(val / 1000).toFixed(2)} т</span></div>`).join("");

    const recs = [];
    const sorted = Object.entries(parts).sort((a, b) => b[1] - a[1]);
    for (const [k] of sorted.slice(0, 3)) {
      if (k.includes("Электр")) recs.push("LED лампаларга ўтинг ва ишламаётган қурилмаларни розеткадан узинг — электр сарфини 10–20% камайтириш мумкин.");
      if (k.includes("Газ")) recs.push("Уйни иссиқлик изоляция қилинг, деразалардаги тирқишларни ёпинг ва термостатни 1–2°C пасайтиринг.");
      if (k.includes("Автомобиль")) recs.push("Ҳафтасига бир неча сафарни жамоат транспорти, велосипед ёки пиёда юриш билан алмаштиринг.");
      if (k.includes("Парвоз")) recs.push("Яқин масофаларга поезддан фойдаланинг — у самолётга нисбатан анча кам CO₂ чиқаради.");
      if (k.includes("Овқат")) recs.push("Ҳафтада 2–3 кун гўштсиз овқатланинг ва маҳаллий, мавсумий маҳсулотларни танланг.");
      if (k.includes("Чиқинди")) recs.push(v.recycle ? "Саралашни давом эттиринг ва органик чиқиндилардан компост тайёрланг." : "Чиқиндиларни саралашни бошланг — бу оддий ва самарали қадам.");
    }
    $("#calcRecs").innerHTML = recs.map((r) => `<li>${esc(r)}</li>`).join("");
  }
  let calcTouched = false;
  form.addEventListener("input", () => { calc(); if (!calcTouched) { calcTouched = true; flag("calc"); } });

  /* ---------- Челленж, нишонлар, даражалар ---------- */
  function levelOf(xp) { return [...LEVELS].reverse().find((l) => xp >= l.min); }
  function streak() {
    let n = 0;
    const d = new Date();
    if (!(state.challenges[dayKey(d)] || []).length) d.setDate(d.getDate() - 1);
    while ((state.challenges[dayKey(d)] || []).length) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  function renderChallenges() {
    const today = state.challenges[dayKey()] || [];
    $("#chGrid").innerHTML = CHALLENGES.map((c) => `
      <button class="ch ${today.includes(c.id) ? "on" : ""}" data-ch="${c.id}" aria-pressed="${today.includes(c.id)}">
        <span class="ic">${c.icon}</span><span>${esc(c.text)}</span><span class="xp">${today.includes(c.id) ? "✓" : "+" + c.xp}</span>
      </button>`).join("");
    $("#streakVal").textContent = streak();
  }
  $("#chGrid").addEventListener("click", (e) => {
    const b = e.target.closest("[data-ch]");
    if (!b) return;
    const k = dayKey();
    const list = state.challenges[k] || (state.challenges[k] = []);
    const c = CHALLENGES.find((x) => x.id === b.dataset.ch);
    if (list.includes(c.id)) {
      list.splice(list.indexOf(c.id), 1);
      state.xp = Math.max(0, state.xp - c.xp);
      save(); renderGamification();
    } else {
      list.push(c.id);
      addXp(c.xp, "яшил одат");
    }
    renderChallenges();
  });

  const BADGES = [
    { id: "first", icon: "👣", name: "Биринчи қадам", test: () => Object.keys(state.perfect).length >= 1 },
    { id: "c1", icon: "🌱", name: "Экология асослари", test: () => state.flags.course_asoslar },
    { id: "c2", icon: "🏭", name: "Эко-менежер", test: () => state.flags.course_korxona },
    { id: "c3", icon: "🎓", name: "Барқарорлик элчиси", test: () => state.flags.course_talaba },
    { id: "s3", icon: "🔥", name: "3 кун серия", test: () => streak() >= 3 },
    { id: "s7", icon: "⚡", name: "7 кун серия", test: () => streak() >= 7 },
    { id: "calc", icon: "🧮", name: "Углерод ҳисобчиси", test: () => state.flags.calc },
    { id: "chat", icon: "💬", name: "Қизиқувчан", test: () => state.flags.chat },
    { id: "air", icon: "🛰️", name: "Ҳаво кузатувчиси", test: () => state.flags.air }
  ];

  function renderGamification() {
    const lv = levelOf(state.xp);
    const next = LEVELS[LEVELS.indexOf(lv) + 1];
    $("#xpVal").textContent = state.xp;
    $("#levelIcon").textContent = lv.icon;
    $("#levelName").textContent = `${lv.icon} ${lv.name} · ${state.xp} XP`;
    $("#levelBar").style.width = next ? `${((state.xp - lv.min) / (next.min - lv.min)) * 100}%` : "100%";
    $("#levelNext").textContent = next ? `Кейинги даража «${next.name}» учун яна ${next.min - state.xp} XP керак.` : "Сиз энг юқори даражага етдингиз! 🌍";
    $("#badges").innerHTML = BADGES.map((b) => {
      const ok = b.test();
      return `<div class="badge ${ok ? "" : "locked"}" title="${ok ? "Олинган" : "Ҳали олинмаган"}"><span class="bi">${b.icon}</span>${esc(b.name)}</div>`;
    }).join("");
  }

  /* ---------- Эко-ёрдамчи ---------- */
  const log = $("#chatLog");
  function say(text, who) {
    const m = document.createElement("div");
    m.className = "msg " + who;
    m.textContent = text;
    log.appendChild(m);
    log.scrollTop = log.scrollHeight;
  }
  function answer(q) {
    const t = q.toLowerCase();
    const scored = ASSISTANT_KB.map((e) => ({ e, s: e.k.filter((k) => t.includes(k)).length }))
      .filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
    if (!scored.length) {
      return "Кечирасиз, бу саволга ҳозирча аниқ жавобим йўқ. Мен пластик, сув, ҳаво сифати, чиқиндиларни саралаш, иқлим, энергия, дарахт экиш, Орол, ISO 14001 ва ESG мавзуларида ёрдам бера оламан. Саволни шу калит сўзлар билан бериб кўринг.";
    }
    return scored.slice(0, 2).map((x) => x.e.a).join("\n\n");
  }
  const SUGG = ["Пластикни қандай камайтираман?", "Чиқиндини қандай саралайман?", "Корхонада нимадан бошлаш керак?", "Қачон дарахт экиш керак?", "PM2.5 нима?"];
  $("#chatSuggest").innerHTML = SUGG.map((s) => `<button class="chip" type="button">${esc(s)}</button>`).join("");
  $("#chatSuggest").addEventListener("click", (e) => { if (e.target.matches(".chip")) ask(e.target.textContent); });
  $("#chatForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const v = $("#chatInput").value.trim();
    if (v) { ask(v); $("#chatInput").value = ""; }
  });
  function ask(q) {
    say(q, "me");
    setTimeout(() => say(answer(q), "bot"), 350);
    flag("chat");
  }
  say("Салом! 👋 Мен Эко-ёрдамчиман. Экология бўйича саволингизни беринг ёки қуйидаги мавзулардан бирини танланг.", "bot");

  /* ---------- Умумий ---------- */
  const tipIdx = Math.floor(Date.now() / 864e5) % DAILY_TIPS.length;
  $("#dailyTip").textContent = DAILY_TIPS[tipIdx];

  const nav = $("#nav"), menuBtn = $("#menuBtn");
  menuBtn.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    menuBtn.setAttribute("aria-expanded", open);
  });
  nav.addEventListener("click", (e) => { if (e.target.matches("a")) nav.classList.remove("open"); });

  try { const t = localStorage.getItem("ekotalim:theme"); if (t) document.documentElement.dataset.theme = t; } catch (e) { /* ignore */ }
  $("#themeBtn").addEventListener("click", () => {
    const cur = document.documentElement.dataset.theme ||
      (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const t = cur === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem("ekotalim:theme", t); } catch (e) { /* ignore */ }
  });

  $("#resetBtn").addEventListener("click", () => {
    if (!confirm("Барча натижалар (XP, дарслар, челленжлар) ўчирилади. Давом этасизми?")) return;
    state = fresh(); save();
    renderCourses(); renderChallenges(); renderGamification();
    toast("Натижалар тозаланди");
  });

  renderCourses();
  renderNews();
  calc();
  renderChallenges();
  renderGamification();
  loadAir();

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
