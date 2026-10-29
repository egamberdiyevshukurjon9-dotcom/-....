/* ЭкоГолограмма — Pepper's ghost пирамидаси, голографик вентилятор ва проектор учун 3D экологик саҳналар */
(() => {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

  /* ---------- Созламалар (URL > браузер хотираси > стандарт) ---------- */
  const PREF = "ekotalim:holo";
  // Кўзгу: пирамида аксида керак, оддий экран/вентиляторда эса керак эмас
  const prefs = { mode: "pyramid", mirror: true, mirrorSingle: false, gap: 0.16, auto: true };
  try { Object.assign(prefs, JSON.parse(localStorage.getItem(PREF)) || {}); } catch (e) { /* хотира йўқ */ }
  const savePrefs = () => { try { localStorage.setItem(PREF, JSON.stringify(prefs)); } catch (e) { /* ignore */ } };
  const qs = new URLSearchParams(location.search);
  const MODES = ["pyramid", "single", "fan"];
  if (MODES.includes(qs.get("mode"))) prefs.mode = qs.get("mode");
  if (!MODES.includes(prefs.mode)) prefs.mode = "pyramid";
  if (qs.get("mirror") === "0" || qs.get("mirror") === "1") prefs[prefs.mode === "pyramid" ? "mirror" : "mirrorSingle"] = qs.get("mirror") === "1";
  if (qs.get("auto") === "0" || qs.get("auto") === "1") prefs.auto = qs.get("auto") === "1";
  const kiosk = qs.get("ui") === "0";
  // Вентилятор видеоси квадрат ва аниқ ўлчамда бўлиши керак (одатда 1024–2048 px)
  const FAN_PX = clamp(parseInt(qs.get("px"), 10) || 1080, 256, 2048);
  // Кичик вентилятор (PD13 каби, битта паррак, LED кам): йирик ёзув, факт алоҳида кадрда
  const SMALL_FAN = qs.get("small") === "1";
  let factCard = false;
  const mirrored = () => (prefs.mode === "pyramid" ? prefs.mirror : prefs.mode === "single" && prefs.mirrorSingle);

  const toastEl = $("#toast");
  let toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2600);
  }

  /* ---------- WebGL ---------- */
  const canvas = $("#holo");
  let renderer;
  try {
    if (!window.THREE) throw new Error("three.js юкланмади");
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
  } catch (e) {
    $("#fallback").hidden = false;
    $("#hud").hidden = true;
    return;
  }
  renderer.setClearColor(0x000000, 1);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  /* ---------- Ёрдамчи текстуралар ---------- */
  function glowTexture(inner = "rgba(255,255,255,1)", outer = "rgba(255,255,255,0)") {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d");
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, inner);
    gr.addColorStop(0.25, inner.replace(/[\d.]+\)$/, "0.6)"));
    gr.addColorStop(1, outer);
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }
  const GLOW = glowTexture();

  function glowSprite(color, size, opacity = 1) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
    s.scale.set(size, size, 1);
    return s;
  }

  // Заррачалар оқими: ҳар бир заррача учун позиция функция орқали ҳисобланади
  function particles(count, color, size, opacity = 0.9) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    const mat = new THREE.PointsMaterial({ color, size, map: GLOW, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.userData.seeds = Array.from({ length: count }, () => [Math.random(), Math.random(), Math.random(), Math.random()]);
    pts.userData.set = (fn) => {
      const a = geo.attributes.position.array;
      const v = new THREE.Vector3();
      pts.userData.seeds.forEach((s, i) => { fn(v, s, i); a[i * 3] = v.x; a[i * 3 + 1] = v.y; a[i * 3 + 2] = v.z; });
      geo.attributes.position.needsUpdate = true;
    };
    return pts;
  }

  const std = (color, extra = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.55, metalness: 0.1 }, extra));
  const glowMat = (color, opacity = 0.9) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });

  /* ---------- 3D дунё ---------- */
  const world = new THREE.Scene();
  world.add(new THREE.HemisphereLight(0xcfffe0, 0x10301c, 0.85));
  const sunLight = new THREE.DirectionalLight(0xffffff, 0.9);
  sunLight.position.set(2, 5, 3);
  world.add(sunLight);
  const rimLight = new THREE.DirectionalLight(0x7dd3fc, 0.5);
  rimLight.position.set(-3, 2, -4);
  world.add(rimLight);

  // Барча саҳналар учун умумий голографик платформа
  const pedestal = new THREE.Group();
  {
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.55, 1.6, 96), glowMat(0x22c55e, 0.8));
    ring.rotation.x = -Math.PI / 2;
    const ring2 = new THREE.Mesh(new THREE.RingGeometry(1.7, 1.72, 96), glowMat(0x38bdf8, 0.5));
    ring2.rotation.x = -Math.PI / 2;
    const ticks = new THREE.Group();
    for (let i = 0; i < 48; i++) {
      const t = new THREE.Mesh(new THREE.PlaneGeometry(0.02, i % 4 ? 0.06 : 0.14), glowMat(0x86efac, 0.7));
      t.rotation.x = -Math.PI / 2;
      const a = (i / 48) * TAU;
      t.position.set(Math.cos(a) * 1.8, 0, Math.sin(a) * 1.8);
      t.rotation.z = -a + Math.PI / 2;
      ticks.add(t);
    }
    pedestal.add(ring, ring2, ticks);
    pedestal.position.y = -1.15;
    pedestal.userData.ticks = ticks;
  }
  world.add(pedestal);

  const stage = new THREE.Group(); // фойдаланувчи айлантирадиган қисм
  world.add(stage);

  /* ---------- Саҳналар ---------- */
  function sceneEarth() {
    const g = new THREE.Group();
    const geo = window.HOLO_GEO || { land: [], uz: [] };
    const c = document.createElement("canvas");
    c.width = 2048; c.height = 1024;
    const x = c.getContext("2d");
    const oc = x.createLinearGradient(0, 0, 0, 1024);
    oc.addColorStop(0, "#0b3a6e"); oc.addColorStop(0.5, "#0e5aa7"); oc.addColorStop(1, "#0b3a6e");
    x.fillStyle = oc;
    x.fillRect(0, 0, 2048, 1024);
    const P = (lon, lat) => [((lon + 180) / 360) * 2048, ((90 - lat) / 180) * 1024];
    const path = (rings) => {
      x.beginPath();
      rings.forEach((r) => { for (let i = 0; i < r.length; i += 2) { const [px, py] = P(r[i], r[i + 1]); i ? x.lineTo(px, py) : x.moveTo(px, py); } x.closePath(); });
    };
    path(geo.land);
    const lg = x.createLinearGradient(0, 0, 0, 1024);
    lg.addColorStop(0, "#e8f4f0"); lg.addColorStop(0.12, "#3f8f4f"); lg.addColorStop(0.35, "#4d9a3f");
    lg.addColorStop(0.45, "#b9a25a"); lg.addColorStop(0.55, "#3d8a3a"); lg.addColorStop(0.8, "#4e9446"); lg.addColorStop(0.86, "#f1f7f6");
    x.fillStyle = lg;
    x.fill("evenodd");
    x.strokeStyle = "rgba(160,255,200,.55)"; x.lineWidth = 1.5; x.stroke();
    path(geo.uz);
    x.fillStyle = "#facc15"; x.fill();
    x.strokeStyle = "#fff7c2"; x.lineWidth = 3; x.stroke();
    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();

    const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), std(0xffffff, { map: tex, emissive: 0x0a2a1a, emissiveMap: tex, emissiveIntensity: 0.55, roughness: 0.8 }));
    // Булутлар
    const cc = document.createElement("canvas");
    cc.width = 1024; cc.height = 512;
    const cx = cc.getContext("2d");
    for (let i = 0; i < 260; i++) {
      const px = Math.random() * 1024, py = 60 + Math.random() * 392, r = 8 + Math.random() * 36;
      const gr = cx.createRadialGradient(px, py, 0, px, py, r);
      gr.addColorStop(0, "rgba(255,255,255,.55)"); gr.addColorStop(1, "rgba(255,255,255,0)");
      cx.fillStyle = gr;
      cx.fillRect(px - r, py - r, r * 2, r * 2);
    }
    const clouds = new THREE.Mesh(new THREE.SphereGeometry(1.025, 48, 32), new THREE.MeshLambertMaterial({ map: new THREE.CanvasTexture(cc), transparent: true, depthWrite: false }));
    // Атмосфера ёғдуси (Френель эффекти)
    const atmo = new THREE.Mesh(new THREE.SphereGeometry(1.16, 48, 32), new THREE.ShaderMaterial({
      vertexShader: "varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: "varying vec3 vN; void main(){ float i = pow(0.72 - dot(vN, vec3(0.0,0.0,1.0)), 3.0); gl_FragColor = vec4(0.3,0.85,1.0,1.0) * i * 1.6; }",
      side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
    }));
    const tilt = new THREE.Group();
    tilt.rotation.z = THREE.MathUtils.degToRad(23.4);
    tilt.add(earth, clouds);
    // CO₂ молекулалари орбитада
    const co2 = particles(140, 0xfca5a5, 0.07, 0.75);
    g.add(tilt, atmo, co2);
    g.position.y = 0.15;
    return {
      title: "Ер — умумий уйимиз",
      facts: [
        "Ер юзасининг тахминан 71% и сув билан қопланган.",
        "Атмосферадаги CO₂ саноатлашувгача ~280 ppm эди, бугун 420 ppm дан ошди (NOAA).",
        "Сариқ рангда — Ўзбекистон. Табиатни асраш ҳар биримиздан бошланади.",
      ],
      group: g,
      update(t) {
        earth.rotation.y = t * 0.25;
        clouds.rotation.y = t * 0.31;
        co2.userData.set((v, s) => {
          const a = s[0] * TAU + t * (0.15 + s[1] * 0.2), r = 1.3 + s[2] * 0.35, y = (s[3] - 0.5) * 1.6;
          v.set(Math.cos(a) * r, y, Math.sin(a) * r);
        });
      },
    };
  }

  function sceneWater() {
    const g = new THREE.Group();
    const oceanGeo = new THREE.PlaneGeometry(1.6, 2.4, 24, 32);
    oceanGeo.rotateX(-Math.PI / 2);
    const base = oceanGeo.attributes.position.array.slice();
    const ocean = new THREE.Mesh(oceanGeo, std(0x0ea5e9, { emissive: 0x0369a1, emissiveIntensity: 0.6, transparent: true, opacity: 0.92, flatShading: true }));
    ocean.position.set(-0.8, -0.9, 0);
    const land = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.25, 2.4), std(0x4d7c0f, { emissive: 0x1a3a06, emissiveIntensity: 0.6 }));
    land.position.set(0.8, -0.95, 0);
    const mountain = new THREE.Mesh(new THREE.ConeGeometry(0.62, 1.2, 7), std(0x78716c, { flatShading: true, emissive: 0x1c1917, emissiveIntensity: 0.5 }));
    mountain.position.set(0.9, -0.25, -0.35);
    const snow = new THREE.Mesh(new THREE.ConeGeometry(0.23, 0.42, 7), std(0xffffff, { flatShading: true, emissive: 0x9ca3af, emissiveIntensity: 0.5 }));
    snow.position.set(0.9, 0.14, -0.35);
    const sun = new THREE.Mesh(new THREE.SphereGeometry(0.2, 32, 16), new THREE.MeshBasicMaterial({ color: 0xfde047 }));
    sun.position.set(-1.0, 1.25, 0);
    sun.add(glowSprite(0xfacc15, 1.4, 0.9));
    const cloud = new THREE.Group();
    [[0, 0, 0, 0.26], [0.25, 0.05, 0, 0.2], [-0.25, 0.03, 0.05, 0.2], [0.1, 0.15, -0.05, 0.2], [0, -0.02, 0.18, 0.17]].forEach(([px, py, pz, r]) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), std(0xe0f2fe, { emissive: 0x7dd3fc, emissiveIntensity: 0.35, transparent: true, opacity: 0.95 }));
      m.position.set(px, py, pz);
      cloud.add(m);
    });
    const riverCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.9, -0.3, -0.05), new THREE.Vector3(0.7, -0.78, 0.35), new THREE.Vector3(0.35, -0.82, 0.55), new THREE.Vector3(0.02, -0.86, 0.4), new THREE.Vector3(-0.3, -0.88, 0.3),
    ]);
    const river = new THREE.Mesh(new THREE.TubeGeometry(riverCurve, 40, 0.04, 8), std(0x38bdf8, { emissive: 0x0284c7, emissiveIntensity: 0.9 }));
    const vapor = particles(120, 0xbae6fd, 0.08, 0.8);
    const rain = particles(110, 0x7dd3fc, 0.06, 0.95);
    const flow = particles(40, 0xe0f2fe, 0.07, 1);
    g.add(ocean, land, mountain, snow, sun, cloud, river, vapor, rain, flow);
    const cloudPos = new THREE.Vector3();
    return {
      title: "Сувнинг табиатда айланиши",
      facts: [
        "Қуёш иссиғида сув буғланади, булутга айланади ва ёмғир-қор бўлиб ерга қайтади.",
        "Ердаги сувнинг ~97% и шўр. Чучук сув ~3%, унинг катта қисми музликларда (USGS).",
        "Секундига 1 томчи томаётган жўмрак йилига 10 000 литрдан ортиқ сувни исроф қилади.",
      ],
      group: g,
      update(t) {
        const a = oceanGeo.attributes.position.array;
        for (let i = 0; i < a.length; i += 3) a[i + 1] = base[i + 1] + Math.sin(base[i] * 6 + t * 2) * 0.025 + Math.cos(base[i + 2] * 5 + t * 1.6) * 0.02;
        oceanGeo.attributes.position.needsUpdate = true;
        oceanGeo.computeVertexNormals();
        const k = (t * 0.12) % 1; // булут денгиздан тоққа сузади
        cloud.position.set(lerp(-0.7, 0.85, k), 0.95, -0.2);
        cloud.getWorldPosition(cloudPos);
        vapor.userData.set((v, s) => {
          const p = (s[0] + t * 0.25) % 1;
          v.set(-1.5 + s[1] * 1.4 + Math.sin(p * 9 + s[2] * 6) * 0.05, -0.85 + p * 1.7, (s[2] - 0.5) * 2);
        });
        const raining = k > 0.55;
        rain.material.opacity = raining ? 0.95 : 0;
        rain.userData.set((v, s) => {
          const p = (s[0] + t * 1.1) % 1;
          v.set(cloud.position.x + (s[1] - 0.5) * 0.6, 0.85 - p * 1.4, cloud.position.z + (s[2] - 0.5) * 0.5);
        });
        flow.userData.set((v, s) => { v.copy(riverCurve.getPointAt((s[0] + t * 0.18) % 1)); v.y += 0.04; });
      },
    };
  }

  function sceneTree() {
    const g = new THREE.Group();
    const tree = new THREE.Group();
    const bark = std(0x8b5a2b, { emissive: 0x2a1606, emissiveIntensity: 0.6 });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.16, 1.2, 10), bark);
    trunk.position.y = -0.55;
    tree.add(trunk);
    [[0.5, 0.6, 0.55], [-0.6, 0.45, -0.4], [0.2, 0.75, -0.65], [-0.3, 0.7, 0.6]].forEach(([rz, len, ry]) => {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.06, len, 6), bark);
      b.geometry.translate(0, len / 2, 0);
      b.position.y = -0.2;
      b.rotation.set(0, ry * 4, rz);
      tree.add(b);
    });
    const leaves = [];
    [[0, 0.45, 0, 0.55], [0.38, 0.25, 0.15, 0.38], [-0.4, 0.22, -0.1, 0.4], [0.1, 0.25, -0.42, 0.36], [-0.12, 0.2, 0.42, 0.36], [0.05, 0.82, 0.05, 0.36]].forEach(([px, py, pz, r], i) => {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), std(i % 2 ? 0x22c55e : 0x16a34a, { flatShading: true, emissive: 0x14532d, emissiveIntensity: 0.7 }));
      m.position.set(px, py, pz);
      leaves.push(m);
      tree.add(m);
    });
    const ground = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.3, 0.1, 48), std(0x3f6212, { emissive: 0x1a2e05, emissiveIntensity: 0.6 }));
    ground.position.y = -1.13;
    const co2 = particles(90, 0x9ca3af, 0.09, 0.85);
    const o2 = particles(90, 0x67e8f9, 0.08, 0.95);
    g.add(ground, tree, co2, o2);
    return {
      title: "Дарахт — табиий ҳаво фильтри",
      facts: [
        "Дарахт фотосинтез орқали CO₂ ни ютиб, кислород чиқаради. Кулранг — CO₂, ҳаворанг — O₂.",
        "Битта етук дарахт йилига ўртача 20 кг дан ортиқ CO₂ ни ютади.",
        "Дарахт экинг ва парваришланг: «Яшил макон» умуммиллий лойиҳасига қўшилинг.",
      ],
      group: g,
      update(t, st) {
        const grow = ease(clamp(st / 6, 0, 1));
        tree.scale.setScalar(lerp(0.25, 1, grow));
        tree.position.y = lerp(-0.85, 0, grow);
        leaves.forEach((m, i) => { m.rotation.y = Math.sin(t * 0.8 + i) * 0.08; });
        tree.rotation.y = t * 0.2;
        co2.userData.set((v, s) => {
          const p = (s[0] + t * 0.22) % 1, a = s[1] * TAU, r = lerp(1.7, 0.35, p);
          v.set(Math.cos(a) * r, lerp(-0.4 + s[2] * 1.8, 0.4, p), Math.sin(a) * r);
        });
        o2.userData.set((v, s) => {
          const p = (s[0] + t * 0.2) % 1, a = s[1] * TAU + p, r = lerp(0.4, 1.8, p);
          v.set(Math.cos(a) * r, 0.35 + p * 0.9 + s[2] * 0.2, Math.sin(a) * r);
        });
      },
    };
  }

  function sceneAral() {
    const g = new THREE.Group();
    const S = 0.075, cells = [];
    // 1960 йилдаги қирғоқ (схематик) ва 2020 йилда қолган сув ҳавзалари
    const in1960 = (x, z) => {
      const a = Math.atan2(z, x), r = 1 + 0.12 * Math.sin(3 * a) + 0.08 * Math.cos(5 * a + 1);
      return (x / 0.85) ** 2 + (z / 1.15) ** 2 < r * r;
    };
    const inNorth = (x, z) => ((x + 0.15) / 0.3) ** 2 + ((z + 0.85) / 0.2) ** 2 < 1;
    const inWest = (x, z) => ((x + 0.55) / 0.12) ** 2 + ((z - 0.1) / 0.5) ** 2 < 1;
    for (let x = -1; x <= 1; x += S) for (let z = -1.3; z <= 1.3; z += S) {
      if (!in1960(x, z)) continue;
      const remain = inNorth(x, z) || inWest(x, z);
      // Шарқий саёз қисм аввалроқ қуриган
      const dry = remain ? 9999 : Math.round(lerp(1972, 2014, clamp(0.55 - x * 0.45 + (Math.abs(z) < 0.6 ? 0.1 : -0.05) + Math.sin(x * 9 + z * 7) * 0.06, 0, 1)));
      cells.push({ x, z, dry });
    }
    const box = new THREE.BoxGeometry(S * 0.92, 0.06, S * 0.92);
    const mesh = new THREE.InstancedMesh(box, std(0xffffff, { emissive: 0x0b2540, emissiveIntensity: 0.6 }), cells.length);
    const m4 = new THREE.Matrix4();
    cells.forEach((c, i) => { m4.makeTranslation(c.x, 0, c.z); mesh.setMatrixAt(i, m4); });
    const water = new THREE.Color(0x0ea5e9), sand = new THREE.Color(0xd6b56d), salt = new THREE.Color(0xf5f5f4);
    const land = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.5, 0.08, 64), std(0xa16207, { emissive: 0x3b2405, emissiveIntensity: 0.6 }));
    land.position.y = -0.06;
    const riverMat = std(0x38bdf8, { emissive: 0x0284c7, emissiveIntensity: 0.8, transparent: true });
    const amu = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0.3, 0, 1.45), new THREE.Vector3(0.1, 0, 1.25), new THREE.Vector3(0.15, 0, 1.08)]), 20, 0.03, 6), riverMat);
    const syr = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(1.45, 0, -0.5), new THREE.Vector3(0.9, 0, -0.75), new THREE.Vector3(0.12, 0, -0.85)]), 24, 0.03, 6), riverMat);
    const dust = particles(120, 0xf5f5f4, 0.07, 0);
    const map = new THREE.Group();
    map.add(land, mesh, amu, syr, dust);
    map.position.y = -0.75;
    map.rotation.x = 0.12;
    g.add(map);
    const scene = {
      title: "Орол фожиаси",
      year: 1960,
      facts: [
        "1960 йилда Орол — дунёдаги 4-катта кўл эди (~68 000 км²).",
        "Амударё ва Сирдарё сувлари суғоришга кўп олингани сабаб кўл майдони ~90% га қисқарди.",
        "Қуриган тубида саксовул экилиб, миллион гектарлаб ҳимоя ўрмонлари барпо этилмоқда.",
      ],
      group: g,
      update(t, st) {
        const k = (st % 20) / 16; // 16 сония 1960→2020, сўнг 4 сония тўхташ
        const year = Math.round(lerp(1960, 2020, clamp(k, 0, 1)));
        if (year !== scene.year) { scene.year = year; scene.subtitle = `${year} йил · схематик`; captionDirty = true; }
        cells.forEach((c, i) => {
          const d = year - c.dry;
          mesh.setColorAt(i, d < 0 ? water : d < 4 ? salt : sand);
        });
        mesh.instanceColor.needsUpdate = true;
        riverMat.opacity = lerp(1, 0.25, clamp(k, 0, 1));
        dust.material.opacity = clamp((year - 1985) / 20, 0, 0.8);
        dust.userData.set((v, s) => {
          const p = (s[0] + t * 0.15) % 1;
          v.set(lerp(-0.2, 1.4, p) + s[1] * 0.4, 0.05 + Math.sin(p * 6 + s[2] * 5) * 0.15 + s[3] * 0.4, (s[2] - 0.5) * 2.2);
        });
        map.rotation.y = Math.sin(t * 0.25) * 0.5;
      },
    };
    scene.subtitle = "1960 йил · схематик";
    return scene;
  }

  function sceneRecycle() {
    const g = new THREE.Group();
    const loop = new THREE.Group();
    const arc = (TAU / 3) * 0.78;
    for (let i = 0; i < 3; i++) {
      const seg = new THREE.Group();
      const torus = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.085, 12, 48, arc), std(0x22c55e, { emissive: 0x15803d, emissiveIntensity: 0.9 }));
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.34, 16), std(0x4ade80, { emissive: 0x16a34a, emissiveIntensity: 0.9 }));
      head.position.set(Math.cos(arc) * 1.05, Math.sin(arc) * 1.05, 0);
      head.rotation.z = arc; // учи айлана бўйлаб олдинга қарайди
      seg.add(torus, head);
      seg.rotation.z = (i * TAU) / 3;
      loop.add(seg);
    }
    loop.rotation.x = -0.35;
    // Бутилка, банка ва қоғоз
    const pts = [[0, -0.32], [0.13, -0.32], [0.14, -0.28], [0.14, 0.05], [0.06, 0.17], [0.05, 0.3], [0.06, 0.32], [0, 0.32]].map(([x, y]) => new THREE.Vector2(x, y));
    const bottle = new THREE.Mesh(new THREE.LatheGeometry(pts, 24), std(0x7dd3fc, { transparent: true, opacity: 0.85, emissive: 0x0369a1, emissiveIntensity: 0.6, roughness: 0.1 }));
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.38, 24), std(0xcbd5e1, { metalness: 0.85, roughness: 0.25, emissive: 0x475569, emissiveIntensity: 0.5 }));
    const paper = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.44, 0.03), std(0xfef9c3, { emissive: 0x854d0e, emissiveIntensity: 0.25 }));
    const items = [bottle, can, paper];
    const sparkle = particles(60, 0xbbf7d0, 0.06, 0.9);
    g.add(loop, ...items, sparkle);
    return {
      title: "Чиқиндини қайта ишлаш",
      facts: [
        "Алюминий банкани қайта ишлаш янгисини ишлаб чиқаришга нисбатан ~95% энергияни тежайди.",
        "Пластик бутилка табиатда юзлаб йиллар (баҳоларга кўра 450 йилгача) парчаланмайди.",
        "Пластик, қоғоз, шиша ва органик чиқиндини алоҳида саралаб ташланг.",
      ],
      group: g,
      update(t) {
        loop.rotation.z = -t * 0.5;
        loop.rotation.y = Math.sin(t * 0.3) * 0.3;
        items.forEach((m, i) => {
          const a = -t * 0.5 + (i * TAU) / 3 + 0.6;
          m.position.set(Math.cos(a) * 0.55, Math.sin(a) * 0.55 * Math.cos(0.35), Math.sin(a) * 0.55 * Math.sin(0.35));
          m.rotation.y = t * 1.2 + i;
        });
        sparkle.userData.set((v, s) => {
          const a = s[0] * TAU - t * 0.5, r = 1.05 + (s[1] - 0.5) * 0.3;
          v.set(Math.cos(a) * r, Math.sin(a) * r * Math.cos(0.35) + (s[2] - 0.5) * 0.2, -Math.sin(a) * r * Math.sin(0.35));
        });
      },
    };
  }

  function sceneClimate() {
    const g = new THREE.Group();
    // NASA GISTEMP (1951–1980 базасига нисбатан, °C) — соддалаштирилган таянч нуқталар
    const K = [[1880, -0.17], [1890, -0.35], [1900, -0.08], [1910, -0.43], [1920, -0.27], [1930, -0.14], [1940, 0.13], [1944, 0.2], [1950, -0.17], [1960, -0.03], [1970, 0.03], [1976, -0.1], [1980, 0.26], [1990, 0.45], [1998, 0.61], [2000, 0.4], [2010, 0.72], [2016, 1.01], [2020, 1.02], [2023, 1.17], [2024, 1.28]];
    const anomaly = (y) => {
      for (let i = 1; i < K.length; i++) if (y <= K[i][0]) return lerp(K[i - 1][1], K[i][1], (y - K[i - 1][0]) / (K[i][0] - K[i - 1][0]));
      return K[K.length - 1][1];
    };
    const cold = new THREE.Color(0x2563eb), mid = new THREE.Color(0xf8fafc), hot = new THREE.Color(0xdc2626);
    const colorOf = (a) => (a < 0.2 ? cold.clone().lerp(mid, clamp((a + 0.5) / 0.7, 0, 1)) : mid.clone().lerp(hot, clamp((a - 0.2) / 1.0, 0, 1)));
    const years = [];
    for (let y = 1880; y <= 2024; y++) years.push(y);
    const geo = new THREE.BoxGeometry(0.045, 1, 0.08);
    geo.translate(0, 0.5, 0);
    const bars = new THREE.InstancedMesh(geo, std(0xffffff, { emissive: 0x111111, emissiveIntensity: 1 }), years.length);
    years.forEach((y, i) => bars.setColorAt(i, colorOf(anomaly(y))));
    bars.position.y = -1.1;
    const globe = new THREE.Mesh(new THREE.SphereGeometry(0.42, 40, 24), std(0x60a5fa, { emissive: 0x1e3a8a, emissiveIntensity: 0.6 }));
    globe.position.y = -0.2;
    const halo = glowSprite(0xef4444, 1.6, 0);
    globe.add(halo);
    g.add(bars, globe);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const scene = {
      title: "Иқлим ўзгариши",
      year: 0,
      facts: [
        "Ҳар бир устун — бир йил (1880–2024). Кўк — салқин, қизил — иссиқ йиллар.",
        "2024 йил — кузатувлар тарихидаги энг иссиқ йил: саноатлашувгача даражадан ~1,55 °C юқори (WMO).",
        "Париж келишуви мақсади — глобал исишни 1,5 °C билан чеклашга интилиш.",
      ],
      group: g,
      update(t, st) {
        const k = clamp((st % 22) / 16, 0, 1);
        const shown = 1880 + Math.round(k * 144);
        if (shown !== scene.year) { scene.year = shown; const a = anomaly(shown);
          scene.subtitle = `${shown} йил: ${a >= 0 ? "+" : "−"}${Math.abs(a).toFixed(2).replace(".", ",")} °C (NASA, соддалаштирилган)`; captionDirty = true; }
        years.forEach((y, i) => {
          const a = (i / years.length) * TAU * 0.92 - Math.PI * 0.96;
          const h = y <= shown ? 0.08 + Math.max(0, anomaly(y) + 0.5) * 0.95 : 0.001;
          pos.set(Math.cos(a) * 1.3, 0, Math.sin(a) * 1.3);
          q.setFromAxisAngle(up, -a);
          sc.set(1, h, 1);
          m4.compose(pos, q, sc);
          bars.setMatrixAt(i, m4);
        });
        bars.instanceMatrix.needsUpdate = true;
        const heat = clamp((anomaly(shown) + 0.2) / 1.5, 0, 1);
        globe.material.color.copy(new THREE.Color(0x60a5fa).lerp(hot, heat * 0.7));
        halo.material.opacity = heat * 0.9;
        globe.rotation.y = t * 0.4;
        bars.rotation.y = t * 0.15;
      },
    };
    scene.subtitle = "";
    return scene;
  }

  function sceneEnergy() {
    const g = new THREE.Group();
    const white = std(0xf1f5f9, { emissive: 0x334155, emissiveIntensity: 0.5 });
    const turbine = new THREE.Group();
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.07, 1.9, 12), white);
    tower.position.y = -0.15;
    const nacelle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.26), white);
    nacelle.position.set(0, 0.82, 0);
    const rotor = new THREE.Group();
    rotor.position.set(0, 0.82, 0.15);
    rotor.add(new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), white));
    for (let i = 0; i < 3; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.78, 0.015), white);
      blade.geometry.translate(0, 0.42, 0);
      blade.rotation.z = (i * TAU) / 3;
      rotor.add(blade);
    }
    turbine.add(tower, nacelle, rotor);
    turbine.position.set(0.7, 0, -0.3);
    // Қуёш панеллари
    const pc = document.createElement("canvas");
    pc.width = 128; pc.height = 128;
    const px = pc.getContext("2d");
    px.fillStyle = "#1e3a8a"; px.fillRect(0, 0, 128, 128);
    px.strokeStyle = "#93c5fd"; px.lineWidth = 3;
    for (let i = 0; i <= 4; i++) { px.beginPath(); px.moveTo(i * 32, 0); px.lineTo(i * 32, 128); px.moveTo(0, i * 32); px.lineTo(128, i * 32); px.stroke(); }
    const panelTex = new THREE.CanvasTexture(pc);
    const panels = new THREE.Group();
    const panelMat = std(0xffffff, { map: panelTex, emissive: 0x1d4ed8, emissiveIntensity: 0.4, metalness: 0.5, roughness: 0.3 });
    for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.02, 0.26), panelMat);
      p.position.set(-1 + c * 0.4, -0.85 + r * 0.12, 0.25 + r * 0.32);
      p.rotation.x = -0.5;
      panels.add(p);
    }
    const house = new THREE.Group();
    const walls = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.28, 0.32), std(0xfef3c7, { emissive: 0x78350f, emissiveIntensity: 0.25 }));
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.2, 4), std(0xb91c1c, { emissive: 0x450a0a, emissiveIntensity: 0.4 }));
    roof.position.y = 0.24; roof.rotation.y = Math.PI / 4;
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.1), new THREE.MeshBasicMaterial({ color: 0xfde047 }));
    win.position.set(0, 0.01, 0.161);
    house.add(walls, roof, win);
    house.position.set(0.15, -0.85, 0.75);
    const ground = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.45, 0.08, 48), std(0x3f6212, { emissive: 0x1a2e05, emissiveIntensity: 0.6 }));
    ground.position.y = -1.08;
    const sun = new THREE.Mesh(new THREE.SphereGeometry(0.17, 24, 16), new THREE.MeshBasicMaterial({ color: 0xfde047 }));
    sun.position.set(-0.9, 1.15, -0.2);
    sun.add(glowSprite(0xfacc15, 1.2, 0.9));
    const rays = particles(70, 0xfde68a, 0.06, 0.9);
    const power = particles(50, 0x4ade80, 0.07, 1);
    const wire = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.6, -0.8, 0.4), new THREE.Vector3(-0.2, -0.95, 0.75), new THREE.Vector3(0.15, -0.8, 0.75)]);
    const wire2 = new THREE.CatmullRomCurve3([new THREE.Vector3(0.7, -1.0, -0.3), new THREE.Vector3(0.5, -0.98, 0.3), new THREE.Vector3(0.2, -0.8, 0.72)]);
    g.add(ground, turbine, panels, house, sun, rays, power);
    return {
      title: "Қуёш ва шамол энергияси",
      facts: [
        "Қуёш Ерга 1,5 соатда етказадиган энергия бутун инсониятнинг бир йиллик эҳтиёжига тенг.",
        "Шамол ва қуёш электр станциялари ишлаганда CO₂ чиқармайди.",
        "LED лампа оддий чўғланма лампага нисбатан ~80% кам электр сарфлайди.",
      ],
      group: g,
      update(t) {
        rotor.rotation.z = -t * 2.2;
        win.material.color.setHSL(0.15, 1, 0.55 + Math.sin(t * 3) * 0.1);
        rays.userData.set((v, s) => {
          const p = (s[0] + t * 0.6) % 1;
          const target = panels.children[Math.floor(s[1] * 6)].position;
          v.set(lerp(sun.position.x, target.x, p), lerp(sun.position.y, target.y, p), lerp(sun.position.z, target.z, p));
        });
        power.userData.set((v, s) => v.copy((s[1] < 0.5 ? wire : wire2).getPointAt((s[0] + t * 0.35) % 1)));
      },
    };
  }

  const builders = [sceneEarth, sceneWater, sceneTree, sceneAral, sceneClimate, sceneRecycle, sceneEnergy];
  const SHORT = ["🌍 Ер", "💧 Сув", "🌳 Дарахт", "🏜 Орол", "🌡 Иқлим", "♻️ Қайта ишлаш", "☀️ Энергия"];
  const scenes = builders.map((b) => {
    const s = b();
    s.group.visible = false;
    stage.add(s.group);
    return s;
  });

  /* ---------- Саҳна алмашиш ---------- */
  const SCENE_SECONDS = 24, FACT_SECONDS = 8, FADE = 0.9;
  let current = 0, sceneTime = 0, factIdx = 0, factTime = 0, prev = -1, fade = 1;
  let captionDirty = true;
  const startScene = clamp(parseInt(qs.get("scene"), 10) || 1, 1, scenes.length) - 1;

  function show(i) {
    i = (i + scenes.length) % scenes.length;
    if (i === current && prev === -1 && scenes[i].group.visible) return;
    prev = current;
    current = i;
    sceneTime = 0; factIdx = 0; factTime = 0; fade = 0;
    scenes.forEach((s, k) => { if (k !== i && k !== prev) s.group.visible = false; });
    scenes[i].group.visible = true;
    captionDirty = true;
    document.querySelectorAll("#sceneBtns .hud-btn").forEach((b, k) => { b.classList.toggle("active", k === i); b.setAttribute("aria-selected", k === i); });
  }
  function nextFact() {
    factIdx = (factIdx + 1) % scenes[current].facts.length;
    factTime = 0;
    captionDirty = true;
  }

  /* ---------- Ёзувлар (ҳар бир ракурс ичида чизилади) ---------- */
  const capCanvas = document.createElement("canvas");
  capCanvas.width = 1024; capCanvas.height = 300;
  const capCtx = capCanvas.getContext("2d");
  const capTex = new THREE.CanvasTexture(capCanvas);
  const capScene = new THREE.Scene();
  const capCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
  const CAP_H = 0.5; // NDC баландлиги (кадрнинг тепа 25% и)
  const capMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, CAP_H), new THREE.MeshBasicMaterial({ map: capTex, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }));
  capMesh.position.set(0, 1 - CAP_H / 2, -1);
  capScene.add(capMesh);
  const FONT = 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

  // Вентилятор: парраклар фақат ички доирани кўрсатади — ёзув доира ичига жойланади, ташқариси қора
  const fanCanvas = document.createElement("canvas");
  fanCanvas.width = fanCanvas.height = 1024;
  const fanCtx = fanCanvas.getContext("2d");
  const fanTex = new THREE.CanvasTexture(fanCanvas);
  const fanScene = new THREE.Scene();
  fanScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: fanTex, transparent: true, depthTest: false, depthWrite: false })));

  function wrap(ctx, text, maxW) {
    const words = text.split(" "), lines = [];
    let line = "";
    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }

  function drawCaption() {
    const s = scenes[current], fact = s.facts[factIdx];
    const c = capCtx, W = capCanvas.width, H = capCanvas.height;
    c.clearRect(0, 0, W, H);
    c.textAlign = "center";
    c.textBaseline = "top";
    c.shadowColor = "rgba(34,197,94,.9)";
    c.shadowBlur = 18;
    c.fillStyle = "#86efac";
    c.font = `800 64px ${FONT}`;
    c.fillText(s.title, W / 2, 10, W - 40);
    c.shadowBlur = 10;
    let y = 86;
    if (s.subtitle) {
      c.fillStyle = "#fde68a";
      c.font = `600 36px ${FONT}`;
      c.fillText(s.subtitle, W / 2, y, W - 40);
      y += 46;
    }
    c.fillStyle = "#ecfdf5";
    c.font = `500 40px ${FONT}`;
    wrap(c, fact, W - 60).slice(0, s.subtitle ? 3 : 4).forEach((ln, i) => c.fillText(ln, W / 2, y + i * 48));
    capTex.needsUpdate = true;
    if (prefs.mode === "fan") (SMALL_FAN ? drawSmallFanCaption : drawFanCaption)(s, fact);

    const sc = $("#singleCaption");
    sc.innerHTML = "";
    const b = document.createElement("b"); b.textContent = s.title + (s.subtitle ? " · " + s.subtitle : "");
    const sp = document.createElement("span"); sp.textContent = fact;
    sc.append(b, sp);
    captionDirty = false;
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { captionDirty = true; });

  // Доира ичида: юқорида сарлавҳа, пастда факт (ватар энига қараб шрифт кичраяди)
  function drawFanCaption(s, fact) {
    const c = fanCtx, N = fanCanvas.width, R = N / 2;
    const chord = (y) => 2 * Math.sqrt(Math.max(0, R * R - (y - R) * (y - R))) * 0.86;
    c.clearRect(0, 0, N, N);
    c.shadowBlur = 0;
    c.fillStyle = "#000";
    c.beginPath(); c.rect(0, 0, N, N); c.arc(R, R, R, 0, TAU, true); c.fill();
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.shadowColor = "rgba(34,197,94,.9)";
    c.shadowBlur = 16;
    c.fillStyle = "#86efac";
    c.font = `800 60px ${FONT}`;
    c.fillText(s.title, R, 150, chord(120));
    if (s.subtitle) {
      c.shadowBlur = 8;
      c.fillStyle = "#fde68a";
      c.font = `600 34px ${FONT}`;
      c.fillText(s.subtitle, R, 212, chord(195));
    }
    c.shadowBlur = 8;
    c.fillStyle = "#ecfdf5";
    let size = 38, lines;
    for (; size >= 26; size -= 2) {
      c.font = `500 ${size}px ${FONT}`;
      lines = wrap(c, fact, chord(860));
      if (lines.length <= 3) break;
    }
    lines = lines.slice(0, 3);
    const lh = size * 1.22, y0 = 820 - ((lines.length - 1) * lh) / 2;
    lines.forEach((ln, i) => c.fillText(ln, R, y0 + i * lh, chord(y0 + i * lh + size / 2)));
    fanTex.needsUpdate = true;
  }

  // Кичик вентилятор: майда матн ўқилмайди — ярим вақт объект ва сарлавҳа, ярим вақт фақат факт (катта шрифт)
  function drawSmallFanCaption(s, fact) {
    const c = fanCtx, N = fanCanvas.width, R = N / 2;
    const chord = (y) => 2 * Math.sqrt(Math.max(0, R * R - (y - R) * (y - R))) * 0.84;
    c.clearRect(0, 0, N, N);
    c.shadowBlur = 0;
    c.fillStyle = "#000";
    c.beginPath(); c.rect(0, 0, N, N); c.arc(R, R, R, 0, TAU, true); c.fill();
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.shadowColor = "rgba(34,197,94,.8)";
    if (!factCard) {
      c.shadowBlur = 6;
      c.fillStyle = "#86efac";
      let size = 92, lines;
      for (; size >= 64; size -= 4) {
        c.font = `800 ${size}px ${FONT}`;
        lines = wrap(c, s.title, chord(150));
        if (lines.length === 1) break;
      }
      lines = lines.slice(0, 2);
      const ty = lines.length > 1 ? 150 : 190;
      c.lineJoin = "round";
      c.lineWidth = 18;
      c.strokeStyle = "#000"; // қора ҳошия: орқадаги объект ёзувга қўшилиб кетмайди
      lines.forEach((ln, i) => {
        const y = ty + i * size * 1.05, w = chord(ty - size / 2 + i * size);
        c.save(); c.shadowBlur = 0; c.strokeText(ln, R, y, w); c.restore();
        c.fillText(ln, R, y, w);
      });
      if (s.subtitle) {
        c.fillStyle = "#fde68a";
        c.font = `700 58px ${FONT}`;
        const sub = s.subtitle.split(" · ")[0].split(" (")[0];
        c.save(); c.shadowBlur = 0; c.lineWidth = 14; c.strokeText(sub, R, 880, chord(900)); c.restore();
        c.fillText(sub, R, 880, chord(900));
      }
    } else {
      c.shadowBlur = 4;
      c.fillStyle = "#ecfdf5";
      let size = 84, lines;
      for (; size >= 52; size -= 4) {
        c.font = `700 ${size}px ${FONT}`;
        lines = wrap(c, fact, N * 0.72);
        if (lines.length * size * 1.18 <= N * 0.66) break;
      }
      const lh = size * 1.18, y0 = R - ((lines.length - 1) * lh) / 2;
      lines.forEach((ln, i) => c.fillText(ln, R, y0 + i * lh, chord(y0 + i * lh + (y0 + i * lh > R ? size / 2 : -size / 2))));
    }
    fanTex.needsUpdate = true;
  }

  /* ---------- Камералар ва пирамида композицияси ---------- */
  // Пирамидада объект ташқи четга яқин ва ингичка бўлиши керак (марказ яқинида кўринишлар устма-уст тушади)
  const FRAMING = { pyramid: { dist: 8.8, y: -0.05, lift: 1.6 }, single: { dist: 6.4, y: -0.65, lift: 1.0 }, fan: { dist: 8.8, y: -0.2, lift: 1.0 }, smallFan: { dist: 8.2, y: 0.15, lift: 1.0 } };
  const TARGET = new THREE.Vector3();
  // Пастки томошабин — олд томон, ўнг — ўнг ён, юқори — орқа, чап — чап ён
  const viewDefs = [
    { name: "bottom", angle: 0, rot: Math.PI, pos: [0, -1] },
    { name: "right", angle: Math.PI / 2, rot: -Math.PI / 2, pos: [1, 0] },
    { name: "top", angle: Math.PI, rot: 0, pos: [0, 1] },
    { name: "left", angle: -Math.PI / 2, rot: Math.PI / 2, pos: [-1, 0] },
  ];
  const compScene = new THREE.Scene();
  const compCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10);
  const views = viewDefs.map((d) => {
    const cam = new THREE.PerspectiveCamera(36, 1, 0.1, 50);
    const rt = new THREE.WebGLRenderTarget(512, 512, { samples: renderer.capabilities.isWebGL2 ? 4 : 0 });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: rt.texture, blending: THREE.AdditiveBlending, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
    quad.position.z = -1;
    compScene.add(quad);
    return Object.assign({ cam, rt, quad }, d);
  });
  const singleCam = new THREE.PerspectiveCamera(36, 1, 0.1, 50);

  let W = 0, H = 0, zoom = 1, userRotY = 0, userRotX = 0;
  function layout() {
    W = window.innerWidth; H = window.innerHeight;
    const fan = prefs.mode === "fan";
    renderer.setPixelRatio(fan ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    if (fan) {
      // Ҳақиқий ўлчам — FAN_PX × FAN_PX; экранда эса доира сифатида кичрайтириб кўрсатилади
      const S = Math.min(W, H);
      renderer.setSize(FAN_PX, FAN_PX, false);
      canvas.style.width = S + "px"; canvas.style.height = S + "px";
    } else {
      renderer.setSize(W, H, false);
      canvas.style.width = W + "px"; canvas.style.height = H + "px";
    }
    compCam.left = -W / 2; compCam.right = W / 2; compCam.top = H / 2; compCam.bottom = -H / 2;
    compCam.updateProjectionMatrix();
    const S = Math.min(W, H), gap = prefs.gap * S, v = (S - gap) / 2;
    const px = Math.min(1024, Math.round(v * renderer.getPixelRatio()));
    views.forEach((vw) => {
      if (vw.rt.width !== px) vw.rt.setSize(px, px);
      vw.quad.scale.set(prefs.mirror ? -v : v, v, 1);
      vw.quad.rotation.z = vw.rot;
      vw.quad.position.set(vw.pos[0] * (gap / 2 + v / 2), vw.pos[1] * (gap / 2 + v / 2), -1);
    });
    singleCam.aspect = W / H;
    singleCam.updateProjectionMatrix();
    document.body.classList.toggle("single", prefs.mode === "single");
    document.body.classList.toggle("fan", fan);
    captionDirty = true;
    document.body.classList.toggle("mirror-single", prefs.mode === "single" && prefs.mirrorSingle);
  }

  function placeCam(cam, angle, aspect, f) {
    const d = f.dist * zoom * (aspect < 1 ? 1 / Math.max(aspect, 0.55) : 1);
    TARGET.set(0, f.y, 0);
    cam.position.set(Math.sin(angle) * d, f.y + f.lift, Math.cos(angle) * d);
    cam.lookAt(TARGET);
  }

  /* ---------- Кадр ---------- */
  const clock = new THREE.Clock();
  let elapsed = 0, paused = false;

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.1);
    if (!paused) {
      elapsed += dt; sceneTime += dt; factTime += dt;
      if (prefs.auto && sceneTime > SCENE_SECONDS) show(current + 1);
      else if (factTime > FACT_SECONDS) nextFact();
    }
    // Ўтиш: эскиси кичраяди, янгиси катталашади
    if (fade < 1) {
      fade = Math.min(1, fade + dt / FADE);
      const e = ease(fade);
      scenes[current].group.scale.setScalar(lerp(0.01, 1, e));
      if (prev >= 0 && prev !== current) {
        scenes[prev].group.scale.setScalar(lerp(1, 0.01, Math.min(1, e * 1.6)));
        if (fade >= 1) scenes[prev].group.visible = false;
      }
    }
    scenes.forEach((s, k) => { if (s.group.visible) s.update(elapsed, k === current ? sceneTime : SCENE_SECONDS); });
    stage.rotation.y = userRotY;
    stage.rotation.x = userRotX;
    pedestal.userData.ticks.rotation.y = elapsed * 0.2;
    if (captionDirty) drawCaption();

    if (prefs.mode === "pyramid") {
      views.forEach((vw) => {
        placeCam(vw.cam, vw.angle, 1, FRAMING.pyramid);
        renderer.setRenderTarget(vw.rt);
        renderer.clear();
        renderer.render(world, vw.cam);
        renderer.autoClear = false;
        renderer.render(capScene, capCam);
        renderer.autoClear = true;
      });
      renderer.setRenderTarget(null);
      renderer.render(compScene, compCam);
    } else if (prefs.mode === "fan") {
      singleCam.aspect = 1;
      singleCam.updateProjectionMatrix();
      const card = SMALL_FAN && factTime > FACT_SECONDS / 2;
      if (card !== factCard) { factCard = card; captionDirty = true; drawCaption(); }
      placeCam(singleCam, 0, 1, SMALL_FAN ? FRAMING.smallFan : FRAMING.fan);
      renderer.setRenderTarget(null);
      if (factCard) renderer.clear();
      else renderer.render(world, singleCam);
      renderer.autoClear = false;
      renderer.render(fanScene, capCam);
      renderer.autoClear = true;
    } else {
      placeCam(singleCam, 0, W / H, FRAMING.single);
      renderer.setRenderTarget(null);
      renderer.render(world, singleCam);
    }
  }

  /* ---------- Бошқарув ---------- */
  const sceneBtns = $("#sceneBtns");
  SHORT.forEach((label, i) => {
    const b = document.createElement("button");
    b.className = "hud-btn";
    b.textContent = label;
    b.setAttribute("role", "tab");
    b.title = scenes[i].title + ` (${i + 1})`;
    b.addEventListener("click", () => show(i));
    sceneBtns.append(b);
  });

  const modeBtn = $("#modeBtn"), mirrorBtn = $("#mirrorBtn"), autoBtn = $("#autoBtn"), gapIn = $("#gap");
  function syncUi() {
    modeBtn.textContent = { pyramid: "🔺 Пирамида", single: "⬛ Битта", fan: "🌀 Вентилятор" }[prefs.mode];
    mirrorBtn.classList.toggle("active", mirrored());
    autoBtn.textContent = prefs.auto ? "⏸ Тўхтатиш" : "▶ Автоматик";
    gapIn.value = prefs.gap;
  }
  const MODE_TIPS = {
    pyramid: "🔺 Пирамида режими: экранни ётқизиб, марказга пирамида қўйинг",
    single: "⬛ Битта кўриниш: проектор ёки оддий экран учун",
    fan: `🌀 Вентилятор: ${FAN_PX}×${FAN_PX} квадрат, қора фон — «⏺ Видео» билан ёзиб, вентиляторга юкланг`,
  };
  const nextMode = () => MODES[(MODES.indexOf(prefs.mode) + 1) % MODES.length];
  function setMode(m) { prefs.mode = m; savePrefs(); syncUi(); layout(); toast(MODE_TIPS[m]); }
  function setMirror(v) {
    if (prefs.mode === "fan") { toast("Вентиляторда кўзгу акси керак эмас"); return; }
    prefs[prefs.mode === "single" ? "mirrorSingle" : "mirror"] = v; savePrefs(); syncUi(); layout();
  }
  function setAuto(v) { prefs.auto = v; sceneTime = 0; savePrefs(); syncUi(); }
  modeBtn.addEventListener("click", () => setMode(nextMode()));
  mirrorBtn.addEventListener("click", () => setMirror(!mirrored()));
  autoBtn.addEventListener("click", () => setAuto(!prefs.auto));
  gapIn.addEventListener("input", () => { prefs.gap = parseFloat(gapIn.value); layout(); });
  gapIn.addEventListener("change", savePrefs);

  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch (e) { toast("Тўлиқ экран бу браузерда ишламади — браузер менюсидан ёқинг"); }
  }
  $("#fsBtn").addEventListener("click", toggleFullscreen);

  // Экран ўчиб қолмаслиги учун
  let wakeLock = null;
  async function keepAwake() {
    try { if ("wakeLock" in navigator && !wakeLock && document.visibilityState === "visible") { wakeLock = await navigator.wakeLock.request("screen"); wakeLock.addEventListener("release", () => { wakeLock = null; }); } } catch (e) { /* рухсат йўқ */ }
  }
  document.addEventListener("visibilitychange", () => { paused = document.visibilityState !== "visible"; if (!paused) { clock.getDelta(); keepAwake(); } });

  // Панеллар
  const panels = { dev: $("#devPanel"), sci: $("#sciPanel"), help: $("#helpPanel") };
  const openPanel = (p) => { Object.values(panels).forEach((x) => x.open && x.close()); if (typeof p.showModal === "function") p.showModal(); else p.setAttribute("open", ""); };
  $("#devBtn").addEventListener("click", () => openPanel(panels.dev));
  $("#sciBtn").addEventListener("click", () => openPanel(panels.sci));
  $("#helpBtn").addEventListener("click", () => openPanel(panels.help));
  document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => b.closest("dialog").close()));
  Object.values(panels).forEach((p) => p.addEventListener("click", (e) => { if (e.target === p) p.close(); }));
  const anyPanelOpen = () => Object.values(panels).some((p) => p.open);

  // Пирамида шаблони (SVG, мм)
  const TPL = { phone: [10, 60], tablet: [20, 120], monitor: [40, 240] };
  document.querySelectorAll("[data-tpl]").forEach((btn) => btn.addEventListener("click", () => {
    const [b, B] = TPL[btn.dataset.tpl];
    const h = ((B - b) / 2) * Math.SQRT2, m = 5, f = (n) => +n.toFixed(2);
    // 4 трапеция қатор бўлиб, навбатма-навбат ағдарилган; қўшни трапециялар ён қирраси умумий (букиш чизиғи)
    const left = (i) => { const X = Math.floor(i / 2) * (B + b); return i % 2 ? [[X + B, 0], [X + (B + b) / 2, h]] : [[X, 0], [X + (B - b) / 2, h]]; };
    const outline = [[0, 0], [2 * (B + b), 0], [2.5 * B + 1.5 * b, h], [(B - b) / 2, h]];
    const width = 2.5 * B + 1.5 * b + 2 * m, height = h + 2 * m + 10;
    const pts = (arr) => arr.map((q) => q.map(f).join(",")).join(" ");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${f(width)}mm" height="${f(height)}mm" viewBox="${-m} ${-m} ${f(width)} ${f(height)}">
<polygon points="${pts(outline)}" fill="none" stroke="#000" stroke-width="0.3"/>
<g stroke="#000" stroke-width="0.3" stroke-dasharray="2 1.5">${[1, 2, 3].map((i) => `<line x1="${f(left(i)[0][0])}" y1="0" x2="${f(left(i)[1][0])}" y2="${f(h)}"/>`).join("")}</g>
<text x="0" y="${f(h + 6)}" font-family="sans-serif" font-size="3">ЭкоГолограмма пирамидаси: кичик асос ${b} мм, катта асос ${B} мм, баландлик ${f(h)} мм.</text>
<text x="0" y="${f(h + 10)}" font-family="sans-serif" font-size="3">100% масштабда чоп этинг. Туташ чизиқ — кесиш, пунктир — букиш.</text>
</svg>`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    a.download = `piramida-${btn.dataset.tpl}.svg`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }));

  // Видео ёзиш (голографик вентилятор учун)
  let recorder = null;
  const recBtn = $("#recBtn");
  recBtn.addEventListener("click", () => {
    if (recorder) { recorder.stop(); return; }
    if (!canvas.captureStream || typeof MediaRecorder === "undefined") { toast("Бу браузер видео ёзишни қўлламайди — Chrome ёки Edge'да очинг"); return; }
    const type = ["video/mp4;codecs=avc1", "video/webm;codecs=vp9", "video/webm"].find((t) => MediaRecorder.isTypeSupported(t));
    if (!type) { toast("Видео формати қўлланмайди"); return; }
    const chunks = [];
    try { recorder = new MediaRecorder(canvas.captureStream(30), { mimeType: type, videoBitsPerSecond: 8e6 }); } catch (e) { toast("Видео ёзишни бошлаб бўлмади"); recorder = null; return; }
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: type.split(";")[0] });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `ekogologramma${prefs.mode === "fan" ? "-ventilyator-" + FAN_PX : ""}.${type.includes("mp4") ? "mp4" : "webm"}`;
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      recorder = null;
      recBtn.classList.remove("rec");
      recBtn.textContent = "⏺ Видео";
      toast("Видео сақланди");
    };
    recorder.start(1000);
    recBtn.classList.add("rec");
    recBtn.textContent = "⏹ Тўхтатиш";
    toast("Ёзилмоқда… тугатиш учун яна босинг");
  });

  // Тегиниш ва сичқонча: суриш — айлантириш, чимчилаш/ғилдирак — катталаштириш, тегиниш — кейинги факт
  const pointers = new Map();
  let dragDist = 0, pinch0 = 0, zoom0 = 1, wasIdle = false;
  canvas.addEventListener("pointerdown", (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    dragDist = 0;
    wasIdle = document.body.classList.contains("idle"); // яширин панелни қайтарувчи тегиниш фактни алмаштирмайди
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); zoom0 = zoom; }
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  });
  canvas.addEventListener("pointermove", (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch0 > 0) zoom = clamp(zoom0 * (pinch0 / d), 0.6, 1.8);
      dragDist += 100;
      return;
    }
    dragDist += Math.abs(dx) + Math.abs(dy);
    userRotY += dx * 0.008 * (prefs.mode === "single" && prefs.mirrorSingle ? -1 : 1);
    userRotX = clamp(userRotX + dy * 0.004, -0.5, 0.5);
  });
  const endPointer = (e) => {
    if (pointers.delete(e.pointerId) && pointers.size === 0 && dragDist < 8 && e.type === "pointerup" && !wasIdle) nextFact();
  };
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  canvas.addEventListener("wheel", (e) => { e.preventDefault(); zoom = clamp(zoom * (e.deltaY > 0 ? 1.08 : 0.92), 0.6, 1.8); }, { passive: false });

  window.addEventListener("keydown", (e) => {
    if (e.target.closest && e.target.closest("input, dialog")) { if (e.key !== "Escape") return; }
    const k = e.key.toLowerCase();
    if (e.key === "ArrowRight") show(current + 1);
    else if (e.key === "ArrowLeft") show(current - 1);
    else if (e.key === " ") { e.preventDefault(); setAuto(!prefs.auto); }
    else if (k === "f" || k === "а") toggleFullscreen();
    else if (k === "p" || k === "п") setMode(nextMode());
    else if (k === "m" || k === "м") setMirror(!mirrored());
    else if (k === "h" || k === "?" || k === "ҳ") openPanel(panels.help);
    else if (/^[1-7]$/.test(e.key)) show(parseInt(e.key, 10) - 1);
    else return;
    wakeUi();
  });

  // Ҳаракатсизликда панелни яшириш
  let idleTimer;
  function wakeUi() {
    document.body.classList.remove("idle");
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { if (!anyPanelOpen()) document.body.classList.add("idle"); else wakeUi(); }, 3500);
  }
  if (kiosk) document.body.classList.add("idle");
  else {
    ["pointermove", "pointerdown"].forEach((ev) => window.addEventListener(ev, wakeUi, { passive: true }));
    wakeUi();
  }

  canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); renderer.setAnimationLoop(null); toast("Графика қайта юкланмоқда…"); });
  canvas.addEventListener("webglcontextrestored", () => { layout(); captionDirty = true; renderer.setAnimationLoop(frame); });
  window.addEventListener("resize", layout);
  document.addEventListener("fullscreenchange", layout);

  syncUi();
  layout();
  show(startScene);
  keepAwake();
  window.addEventListener("pointerdown", keepAwake, { once: true });
  renderer.setAnimationLoop(frame);

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
