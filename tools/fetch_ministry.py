#!/usr/bin/env python3
"""Экология вазирлиги манбаларидан сўнгги маълумотларни йиғиб, data/ministry.json га ёзади.

GitHub Actions'да ҳар бир неча соатда ишга тушади (.github/workflows/ministry.yml).
Манбалар data/ministry_sources.json да созланади. Фақат Python стандарт кутубхонаси.

Ишлатиш:  python3 tools/fetch_ministry.py [--sources ФАЙЛ] [--out ФАЙЛ]
"""
import argparse
import datetime as dt
import email.utils
import html
import json
import pathlib
import re
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from html.parser import HTMLParser

ROOT = pathlib.Path(__file__).resolve().parent.parent
UA = "Mozilla/5.0 (compatible; EkoTalimBot/1.0; +https://github.com/)"
TIMEOUT = 25
NEWS_PATH = re.compile(r"/(news|yangilik|yangiliklar|novosti|press|xabar|elon|announcements?)(/|$|-)", re.I)
DATE_DMY = re.compile(r"\b(\d{1,2})[./-](\d{1,2})[./-](20\d{2})\b")


# ---------------------------------------------------------------- ёрдамчилар
def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "uz,ru;q=0.8,en;q=0.5"})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        ctype = r.headers.get("Content-Type", "")
        charset = r.headers.get_content_charset() or "utf-8"
        return r.geturl(), ctype, r.read().decode(charset, errors="replace")


def clean(text, limit=None):
    """HTML теглари ва ортиқча бўшлиқларни олиб ташлайди."""
    text = re.sub(r"<(br|/p|/div|/li)\b[^>]*>", "\n", text or "", flags=re.I)
    text = html.unescape(re.sub(r"<[^>]+>", " ", text))
    text = "\n".join(re.sub(r"[ \t ]+", " ", line).strip() for line in text.splitlines())
    text = re.sub(r"\n{2,}", "\n", text).strip()
    if limit and len(text) > limit:
        text = text[: limit - 1].rsplit(" ", 1)[0].rstrip(",.;:—- ") + "…"
    return text


def iso(value):
    """Турли форматдаги санани ISO 8601 (UTC) га ўгиради; тушунилмаса None."""
    if not value:
        return None
    value = value.strip()
    try:
        d = email.utils.parsedate_to_datetime(value)  # RSS: "Mon, 29 Sep 2026 10:00:00 +0500"
    except (TypeError, ValueError):
        d = None
    if d is None:
        try:
            d = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            m = DATE_DMY.search(value)
            if not m:
                return None
            try:
                d = dt.datetime(int(m.group(3)), int(m.group(2)), int(m.group(1)), tzinfo=dt.timezone(dt.timedelta(hours=5)))
            except ValueError:
                return None
    if d.tzinfo is None:
        d = d.replace(tzinfo=dt.timezone(dt.timedelta(hours=5)))  # Тошкент вақти
    return d.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def safe_url(url, allowed_hosts):
    try:
        p = urllib.parse.urlparse(url)
    except ValueError:
        return None
    host = (p.hostname or "").lower()
    if p.scheme != "https" or not any(host == h or host.endswith("." + h) for h in allowed_hosts):
        return None
    return url


def split_title(text):
    """Telegram хабари учун: биринчи қатор сарлавҳа, қолгани қисқа мазмун."""
    lines = [l for l in text.splitlines() if l.strip()]
    if not lines:
        return "", ""
    title = clean(lines[0], 140)
    return title, clean("\n".join(lines[1:]), 280)


# ---------------------------------------------------------------- RSS / Atom
def local(tag):
    return tag.rsplit("}", 1)[-1].lower()


def parse_feed(xml_text, base_url):
    root = ET.fromstring(xml_text.encode("utf-8") if isinstance(xml_text, str) else xml_text)
    items = []
    for el in root.iter():
        if local(el.tag) not in ("item", "entry"):
            continue
        f = {local(c.tag): c for c in el}
        title = clean((f.get("title").text if f.get("title") is not None else "") or "", 160)
        link = ""
        if f.get("link") is not None:
            link = (f["link"].text or f["link"].get("href") or "").strip()
        # Эътибор: болалари йўқ Element False ҳисобланади, шунинг учун «or» эмас, «is not None»
        first = lambda *names: next((f[n] for n in names if f.get(n) is not None), None)
        summary_el = first("description", "summary", "content")
        summary = clean(summary_el.text if summary_el is not None else "", 280)
        date_el = first("pubdate", "published", "updated", "date")
        date = iso(date_el.text if date_el is not None else None)
        if title and link:
            items.append({"title": title, "summary": summary, "date": date, "url": urllib.parse.urljoin(base_url, link)})
    return items


class LinkParser(HTMLParser):
    """HTML саҳифадаги <link rel=alternate> ва <a> ҳаволаларни йиғади."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.feeds, self.anchors, self._a = [], [], None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "link" and "alternate" in (a.get("rel") or "") and re.search(r"(rss|atom)\+xml", a.get("type") or ""):
            self.feeds.append(a.get("href"))
        elif tag == "a" and a.get("href"):
            self._a = {"href": a["href"], "text": [], "title": a.get("title") or ""}

    def handle_data(self, data):
        if self._a is not None:
            self._a["text"].append(data)

    def handle_endtag(self, tag):
        if tag == "a" and self._a is not None:
            self.anchors.append((self._a["href"], clean(" ".join(self._a["text"])) or self._a["title"]))
            self._a = None


def website(src, allowed):
    url = src["url"]
    final, ctype, body = fetch(url)
    if "xml" in ctype or body.lstrip().startswith("<?xml"):
        return parse_feed(body, final), "feed"
    lp = LinkParser()
    lp.feed(body)
    origin = "{0.scheme}://{0.netloc}".format(urllib.parse.urlparse(final))
    candidates = [urllib.parse.urljoin(final, h) for h in lp.feeds if h]
    candidates += [final.rstrip("/") + "/rss", origin + "/rss", origin + "/feed"]
    for feed_url in dict.fromkeys(candidates):
        if not safe_url(feed_url, allowed):
            continue
        try:
            _, ctype2, fbody = fetch(feed_url)
            if "xml" in ctype2 or fbody.lstrip().startswith("<"):
                items = parse_feed(fbody, feed_url)
                if items:
                    return items, "feed"
        except Exception:  # noqa: BLE001 — кейинги номзодни синаймиз
            continue
    # RSS топилмади — янгиликлар саҳифасидаги ҳаволалардан фойдаланамиз
    items, seen = [], set()
    for href, text in lp.anchors:
        full = urllib.parse.urljoin(final, href).split("#")[0]
        path = urllib.parse.urlparse(full).path
        if full in seen or not NEWS_PATH.search(path) or len(text) < 25 or path.rstrip("/").count("/") < 2:
            continue
        seen.add(full)
        m = DATE_DMY.search(text)
        title = clean(DATE_DMY.sub("", text), 160)
        items.append({"title": title, "summary": "", "date": iso(m.group(0)) if m else None, "url": full})
    return items, "html"


# ---------------------------------------------------------------- Telegram
class TelegramParser(HTMLParser):
    """t.me/s/<канал> очиқ саҳифасидаги хабарларни ўқийди."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.posts, self._cur, self._depth, self._text = [], None, 0, None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        cls = a.get("class") or ""
        if "tgme_widget_message " in cls + " " and a.get("data-post"):
            self._cur = {"post": a["data-post"], "text": "", "date": None}
            self.posts.append(self._cur)
        if self._cur is None:
            return
        if "tgme_widget_message_text" in cls and self._text is None:
            self._text, self._depth = [], 0
        if self._text is not None:
            if tag == "br":
                self._text.append("\n")
            elif tag not in ("img",):
                self._depth += 1
        if tag == "time" and a.get("datetime") and not self._cur["date"]:
            self._cur["date"] = a["datetime"]

    def handle_endtag(self, tag):
        if self._text is not None and tag not in ("br", "img"):
            self._depth -= 1
            if self._depth <= 0:
                self._cur["text"] = "".join(self._text)
                self._text = None

    def handle_data(self, data):
        if self._text is not None:
            self._text.append(data)


def telegram(src, allowed):
    channel = src.get("channel", "").strip().lstrip("@")
    if not re.fullmatch(r"[A-Za-z0-9_]{4,64}", channel):
        raise ValueError("Telegram канал номи нотўғри ёки кўрсатилмаган")
    _, _, body = fetch(f"https://t.me/s/{channel}")
    tp = TelegramParser()
    tp.feed(body)
    items = []
    for p in reversed(tp.posts):  # янгилари охирида келади
        title, summary = split_title(clean(p["text"]))
        if len(title) < 10:
            continue
        items.append({"title": title, "summary": summary, "date": iso(p["date"]), "url": f"https://t.me/{p['post']}"})
    return items, "telegram"


# ---------------------------------------------------------------- асосий
HANDLERS = {"website": website, "telegram": telegram}


def run(cfg, previous, manual):
    allowed = [h.lower() for h in cfg.get("allowed_hosts", [])]
    items, sources = [], []
    for src in cfg.get("sources", []):
        if not src.get("enabled", True):
            continue
        info = {"id": src["id"], "name": src.get("name", src["id"]), "url": src.get("url") or f"https://t.me/{src.get('channel', '')}", "ok": False, "count": 0, "error": None}
        try:
            got, method = HANDLERS[src["type"]](src, allowed)
            got = [dict(i, source=src["id"]) for i in got if safe_url(i["url"], allowed)]
            info.update(ok=bool(got), count=len(got), method=method)
            if not got:
                info["error"] = "Маълумот топилмади (сайт тузилиши ўзгарган бўлиши мумкин)"
            items += got
        except Exception as e:  # noqa: BLE001 — бир манба хатоси бошқаларини тўхтатмаслиги керак
            info["error"] = f"{type(e).__name__}: {e}"[:200]
        sources.append(info)
        print(f"{'OK ' if info['ok'] else 'ERR'} {info['name']}: {info['count']} та" + (f" — {info['error']}" if info["error"] else ""))
        if info["error"]:
            print(f"::warning title=Манба: {info['name']}::{info['error']}")

    # Барча манбалар ишламаса, аввалги маълумотларни сақлаб қоламиз
    failed_ids = {s["id"] for s in sources if not s["ok"]}
    items += [i for i in previous.get("items", []) if i.get("source") in failed_ids]
    items += [dict(i, source="manual") for i in manual if safe_url(i.get("url", ""), allowed) and i.get("title")]

    uniq = {}
    for i in items:
        uniq.setdefault(i["url"], i)
    ordered = sorted(uniq.values(), key=lambda i: i.get("date") or "", reverse=True)
    return {"sources": sources, "items": ordered[: int(cfg.get("max_items", 24))]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sources", default=ROOT / "data" / "ministry_sources.json")
    ap.add_argument("--manual", default=ROOT / "data" / "ministry_manual.json")
    ap.add_argument("--out", default=ROOT / "data" / "ministry.json")
    args = ap.parse_args()
    cfg = json.loads(pathlib.Path(args.sources).read_text(encoding="utf-8"))
    out = pathlib.Path(args.out)
    previous = json.loads(out.read_text(encoding="utf-8")) if out.exists() else {}
    mpath = pathlib.Path(args.manual)
    manual = json.loads(mpath.read_text(encoding="utf-8")).get("items", []) if mpath.exists() else []

    result = run(cfg, previous, manual)
    # Файл фақат хабарлар ёки манбалар ҳолати ўзгарганда қайта ёзилади (ортиқча коммитлар бўлмаслиги учун)
    sig = lambda d: json.dumps([d.get("items"), [(s["id"], s["ok"]) for s in d.get("sources", [])]], ensure_ascii=False, sort_keys=True)
    if previous and sig(previous) == sig(result):
        print("Ўзгариш йўқ")
        return 0
    result = {"updated": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), **result}
    out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Ёзилди: {out} ({len(result['items'])} та хабар)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
