/* ЭкоГолограмма — вентилятор студияси: видео/расм экспорти.
 *
 * Асосий йўл: WebCodecs (H.264) + mp4-muxer. Кадрлар «вақт бўйича» эмас, «кадр рақами бўйича»
 * чизилади, шунинг учун телефон секин бўлса ҳам кадр тушиб қолмайди ва видео аниқ 30 к/с чиқади.
 * Захира йўл: MediaRecorder (реал вақтда ёзади, кадр тушиши мумкин — фойдаланувчига айтилади).
 */
(function (global) {
  "use strict";

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /* H.264 даражаси (level) кадр ўлчамига қараб: 3.1 → 4.0 → 5.1 */
  function levelFor(px) {
    const mbs = Math.ceil(px / 16) * Math.ceil(px / 16);
    if (mbs <= 3600) return "1f";
    if (mbs <= 8192) return "28";
    return "33";
  }

  /* Қурилма қўллайдиган биринчи H.264 созламасини топиш (Baseline — энг кўп мос келувчи) */
  async function pickH264(px, fps, bitrate) {
    if (typeof VideoEncoder === "undefined" || typeof VideoFrame === "undefined") return null;
    const lv = levelFor(px);
    for (const prof of ["4200", "4d00", "6400"]) {
      const config = {
        codec: `avc1.${prof}${lv}`, width: px, height: px, bitrate, framerate: fps,
        latencyMode: "quality", bitrateMode: "variable", avc: { format: "avc" },
      };
      try {
        const r = await VideoEncoder.isConfigSupported(config);
        if (r && r.supported) return r.config || config;
      } catch (e) { /* кейингисини синаймиз */ }
    }
    return null;
  }

  function canMP4() {
    return typeof VideoEncoder !== "undefined" && typeof VideoFrame !== "undefined" && typeof Mp4Muxer !== "undefined";
  }

  /* MP4 (H.264), кадрма-кадр. draw(ctx, t) — кадрни canvas'га чизади.
     Қайтаради: { blob, mime, ext, exact: true } */
  async function exportMP4({ canvas, draw, frames, fps, bitrate, onProgress, signal }) {
    const px = canvas.width;
    const cfg = await pickH264(px, fps, bitrate);
    if (!cfg) throw new Error("NO_H264");
    const ctx = canvas.getContext("2d", { willReadFrequently: false });
    const muxer = new Mp4Muxer.Muxer({
      target: new Mp4Muxer.ArrayBufferTarget(),
      video: { codec: "avc", width: px, height: px, frameRate: fps },
      fastStart: "in-memory",
      firstTimestampBehavior: "offset",
    });
    let failure = null;
    const enc = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (e) => { failure = e; },
    });
    enc.configure(cfg);
    const t0 = performance.now();
    try {
      for (let i = 0; i < frames; i++) {
        if (signal && signal.aborted) throw new DOMException("Тўхтатилди", "AbortError");
        if (failure) throw failure;
        draw(ctx, i / fps);
        const frame = new VideoFrame(canvas, { timestamp: Math.round((i * 1e6) / fps), duration: Math.round(1e6 / fps) });
        enc.encode(frame, { keyFrame: i % (fps * 2) === 0 });
        frame.close();
        while (enc.encodeQueueSize > 6) await sleep(2);
        if (i % 3 === 0) {
          if (onProgress) onProgress((i + 1) / frames, (performance.now() - t0) / 1000);
          await sleep(0); // интерфейс қотиб қолмаслиги учун
        }
      }
      await enc.flush();
      if (failure) throw failure;
    } finally {
      try { enc.close(); } catch (e) { /* аллақачон ёпилган */ }
    }
    muxer.finalize();
    const blob = new Blob([muxer.target.buffer], { type: "video/mp4" });
    if (onProgress) onProgress(1, (performance.now() - t0) / 1000);
    return { blob, mime: "video/mp4", ext: "mp4", exact: true, codec: cfg.codec };
  }

  /* Захира: MediaRecorder, реал вақтда */
  async function exportRealtime({ canvas, draw, frames, fps, bitrate, onProgress, signal }) {
    if (!canvas.captureStream || typeof MediaRecorder === "undefined") throw new Error("NO_RECORDER");
    const type = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"].find((t) => MediaRecorder.isTypeSupported(t));
    if (!type) throw new Error("NO_RECORDER");
    const ctx = canvas.getContext("2d");
    const stream = canvas.captureStream(fps);
    const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: bitrate });
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    const done = new Promise((res) => { rec.onstop = res; });
    const dur = frames / fps;
    rec.start(500);
    const t0 = performance.now();
    try {
      for (;;) {
        if (signal && signal.aborted) throw new DOMException("Тўхтатилди", "AbortError");
        const t = (performance.now() - t0) / 1000;
        if (t >= dur) break;
        draw(ctx, t);
        if (onProgress) onProgress(t / dur, t);
        await new Promise((r) => requestAnimationFrame(r));
      }
      draw(ctx, 0);
    } finally {
      if (rec.state !== "inactive") rec.stop();
    }
    await done;
    const mime = type.split(";")[0];
    return { blob: new Blob(chunks, { type: mime }), mime, ext: mime.includes("mp4") ? "mp4" : "webm", exact: false, codec: type };
  }

  function exportPNG(canvas) {
    return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("PNG"))), "image/png"));
  }

  /* Сақлаш: Claude саҳифасида (Artifact) «downloads» имконияти орқали — тасдиқ сўралади,
     телефонда тизимнинг «Улашиш» ойнаси чиқади; оддий браузерда — одатий юклаб олиш. */
  async function download(blob, name) {
    try {
      const d = window.claude && window.claude.use ? await window.claude.use("downloads") : null;
      if (d) { await d.save({ filename: name, data: blob }); return; }
    } catch (e) {
      if (e && e.code === "declined") return;
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }

  async function share(blob, name, title) {
    const file = new File([blob], name, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title });
      return true;
    }
    return false;
  }

  global.FanExport = { canMP4, exportMP4, exportRealtime, exportPNG, download, share, pickH264 };
})(window);
