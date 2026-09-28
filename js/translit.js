/* ЭкоТаълим — кирилл ↔ лотин алифбоси.
   Контент кириллда ёзилади; лотин режимида саҳифадаги матн расмий ўзбек лотин
   алифбоси қоидалари бўйича автоматик ўгирилади. */
const EkoLang = (() => {
  "use strict";

  const BASE = {
    а: "a", б: "b", в: "v", г: "g", д: "d", ж: "j", з: "z", и: "i", й: "y", к: "k",
    л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
    х: "x", ч: "ch", ш: "sh", щ: "sh", ы: "i", э: "e", ё: "yo", ю: "yu", я: "ya",
    ў: "oʻ", қ: "q", ғ: "gʻ", ҳ: "h", ь: ""
  };
  const VOWELS = "аеёиоуэюяў";
  const isCyr = (c) => !!c && /[Ѐ-ӿ]/.test(c);
  const isLetter = (c) => !!c && /[\p{L}]/u.test(c);
  const isUpper = (c) => !!c && c !== c.toLowerCase();

  function tr(s) {
    if (!s || !/[Ѐ-ӿ]/.test(s)) return s;
    let out = "";
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      const lo = ch.toLowerCase();
      const prev = s[i - 1], next = s[i + 1];
      const pl = prev ? prev.toLowerCase() : "";
      let r;
      if (lo === "е") {
        r = !isLetter(prev) || VOWELS.includes(pl) || pl === "ъ" || pl === "ь" ? "ye" : "e";
      } else if (lo === "ц") {
        r = isLetter(prev) && VOWELS.includes(pl) ? "ts" : "s";
      } else if (lo === "ъ") {
        r = next && "еёюя".includes(next.toLowerCase()) ? "" : "ʼ";
      } else if (lo in BASE) {
        r = BASE[lo];
      } else {
        out += ch;
        continue;
      }
      if (r && isUpper(ch)) {
        // ЯНГИ → YANGI, Янги → Yangi
        const caps = (isCyr(next) && isUpper(next)) || (isCyr(prev) && isUpper(prev) && !isLetter(next));
        r = caps ? r.toUpperCase() : r[0].toUpperCase() + r.slice(1);
      }
      out += r;
    }
    return out;
  }

  const KEY = "ekotalim:lang";
  const ATTRS = ["placeholder", "title", "aria-label"];
  const orig = new WeakMap();
  let lang = "cyr";
  let origTitle = document.title;

  function eachText(root, fn) {
    const skip = (n) => n.parentElement && n.parentElement.closest("script,style,[data-notr]");
    if (root.nodeType === 3) return skip(root) ? undefined : fn(root);
    if (root.nodeType !== 1) return;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (skip(n) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT)
    });
    for (let n = w.nextNode(); n; n = w.nextNode()) fn(n);
  }
  function eachAttrEl(root, fn) {
    if (root.nodeType !== 1) return;
    [root, ...root.querySelectorAll("*")].forEach((el) => {
      if (!el.closest("[data-notr]")) ATTRS.forEach((a) => el.hasAttribute(a) && fn(el, a));
    });
  }

  function apply(root) {
    const toLat = lang === "lat";
    eachText(root, (n) => {
      if (toLat) {
        if (!orig.has(n)) orig.set(n, n.nodeValue);
        const v = tr(orig.get(n));
        if (n.nodeValue !== v) n.nodeValue = v;
      } else if (orig.has(n)) {
        n.nodeValue = orig.get(n);
        orig.delete(n);
      }
    });
    eachAttrEl(root, (el, a) => {
      const k = "orig" + a.replace(/-./g, (m) => m[1].toUpperCase()).replace(/^./, (m) => m.toUpperCase());
      if (toLat) {
        if (!(k in el.dataset)) el.dataset[k] = el.getAttribute(a);
        el.setAttribute(a, tr(el.dataset[k]));
      } else if (k in el.dataset) {
        el.setAttribute(a, el.dataset[k]);
        delete el.dataset[k];
      }
    });
  }

  function set(l, persist = true) {
    lang = l === "lat" ? "lat" : "cyr";
    document.documentElement.lang = lang === "lat" ? "uz-Latn" : "uz-Cyrl";
    document.title = lang === "lat" ? tr(origTitle) : origTitle;
    apply(document.body);
    const btn = document.getElementById("langBtn");
    if (btn) {
      btn.textContent = lang === "lat" ? "Кирилл" : "Lotin";
      btn.setAttribute("aria-label", lang === "lat" ? "Кирилл алифбосига ўтиш" : "Lotin alifbosiga oʻtish");
    }
    if (persist) { try { localStorage.setItem(KEY, lang); } catch (e) { /* ignore */ } }
  }

  // Янги қўшилган элементларни (рендер, тост, чат) ҳам ўгириш
  new MutationObserver((muts) => {
    if (lang !== "lat") return;
    muts.forEach((m) => m.addedNodes.forEach((n) => apply(n)));
  }).observe(document.documentElement, { childList: true, subtree: true });

  document.addEventListener("DOMContentLoaded", () => {
    origTitle = document.title;
    let l = new URLSearchParams(location.search).get("lang");
    const fromUrl = l === "lat" || l === "cyr";
    if (!fromUrl) { try { l = localStorage.getItem(KEY); } catch (e) { l = null; } }
    set(l || "cyr", false);
    const btn = document.getElementById("langBtn");
    if (btn) btn.addEventListener("click", () => set(lang === "lat" ? "cyr" : "lat"));
  });

  /* Қидирув учун: матн ва сўров қайси алифбода бўлса ҳам солиштириш */
  const norm = (s) => s.toLowerCase().replace(/[ʻʼ'`’‘]/g, "'");
  const matches = (hay, q) => norm(hay).includes(norm(q)) || norm(tr(hay)).includes(norm(tr(q)));

  return { tr, t: (s) => (lang === "lat" ? tr(s) : s), set, get lang() { return lang; }, matches };
})();
