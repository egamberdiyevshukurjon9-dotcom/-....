"""tools/fetch_ministry.py учун тестлар.  Ишлатиш:  python3 -m unittest discover tools"""
import json
import pathlib
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import fetch_ministry as fm  # noqa: E402

ALLOWED = ["eco.gov.uz", "t.me"]

RSS = """<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Vazirlik</title>
<item><title>Yangi qo&apos;riqxona tashkil etildi</title><link>https://eco.gov.uz/uz/news/101</link>
<description>&lt;p&gt;Qisqa &lt;b&gt;mazmun&lt;/b&gt;&lt;/p&gt;</description><pubDate>Mon, 28 Sep 2026 10:00:00 +0500</pubDate></item>
<item><title>Ikkinchi xabar</title><link>/uz/news/100</link><pubDate>Sun, 27 Sep 2026 09:00:00 +0500</pubDate></item>
</channel></rss>"""

ATOM = """<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>t</title>
<entry><title>Atom xabari</title><link href="https://eco.gov.uz/uz/news/7"/><updated>2026-09-29T04:00:00Z</updated><summary>Mazmun</summary></entry>
</feed>"""

HTML_NO_FEED = """<html><body>
<a href="/uz/news">Barcha yangiliklar</a>
<a href="/uz/news/555">28.09.2026 Ekologiya vazirligi yangi dasturni taqdim etdi</a>
<a href="/uz/news/555">28.09.2026 Ekologiya vazirligi yangi dasturni taqdim etdi</a>
<a href="/uz/about">Vazirlik haqida batafsil maʼlumot sahifasi</a>
<a href="https://evil.example/uz/news/1">Begona saytdagi juda uzun sarlavha matni</a>
</body></html>"""

TELEGRAM = """<html><body>
<div class="tgme_widget_message_wrap"><div class="tgme_widget_message text_not_supported_wrap js-widget_message" data-post="ecochan/10">
 <div class="tgme_widget_message_text js-message_text" dir="auto"><b>Toshkentda ko'chat ekish aksiyasi</b><br/>Aksiya shanba kuni <a href="https://x">bo'lib</a> o'tadi.<br/>Barchani taklif qilamiz!</div>
 <a class="tgme_widget_message_date" href="https://t.me/ecochan/10"><time datetime="2026-09-28T06:30:00+00:00" class="time">11:30</time></a>
</div></div>
<div class="tgme_widget_message_wrap"><div class="tgme_widget_message js-widget_message" data-post="ecochan/11">
 <div class="tgme_widget_message_text js-message_text">Havo sifati monitoringi natijalari eʼlon qilindi</div>
 <time datetime="2026-09-29T05:00:00+00:00">10:00</time>
</div></div>
<div class="tgme_widget_message_wrap"><div class="tgme_widget_message js-widget_message" data-post="ecochan/12">
 <div class="tgme_widget_message_text js-message_text">👍</div><time datetime="2026-09-29T06:00:00+00:00">11:00</time>
</div></div>
</body></html>"""


def fake_fetch(pages):
    def _f(url):
        if url not in pages:
            raise OSError(f"404 {url}")
        ctype, body = pages[url]
        return url, ctype, body
    return _f


class Helpers(unittest.TestCase):
    def test_iso_formats(self):
        self.assertEqual(fm.iso("Mon, 28 Sep 2026 10:00:00 +0500"), "2026-09-28T05:00:00Z")
        self.assertEqual(fm.iso("2026-09-29T04:00:00Z"), "2026-09-29T04:00:00Z")
        self.assertEqual(fm.iso("28.09.2026"), "2026-09-27T19:00:00Z")  # Тошкент ярим туни
        self.assertIsNone(fm.iso("эртага"))
        self.assertIsNone(fm.iso("31.02.2026"))

    def test_safe_url(self):
        self.assertTrue(fm.safe_url("https://eco.gov.uz/uz/news/1", ALLOWED))
        self.assertTrue(fm.safe_url("https://www.eco.gov.uz/x", ALLOWED))
        self.assertIsNone(fm.safe_url("http://eco.gov.uz/x", ALLOWED))
        self.assertIsNone(fm.safe_url("https://eco.gov.uz.evil.com/x", ALLOWED))
        self.assertIsNone(fm.safe_url("javascript:alert(1)", ALLOWED))

    def test_clean_strips_tags_and_truncates(self):
        self.assertEqual(fm.clean("<p>Salom <b>dunyo</b></p>"), "Salom dunyo")
        self.assertTrue(fm.clean("so'z " * 100, 50).endswith("…"))
        self.assertLessEqual(len(fm.clean("so'z " * 100, 50)), 50)


class Sources(unittest.TestCase):
    def test_rss_via_autodiscovery(self):
        home = '<html><head><link rel="alternate" type="application/rss+xml" href="/uz/rss.xml"></head></html>'
        pages = {"https://eco.gov.uz/uz": ("text/html", home), "https://eco.gov.uz/uz/rss.xml": ("application/rss+xml", RSS)}
        with mock.patch.object(fm, "fetch", fake_fetch(pages)):
            items, method = fm.website({"url": "https://eco.gov.uz/uz"}, ALLOWED)
        self.assertEqual(method, "feed")
        self.assertEqual(items[0]["title"], "Yangi qo'riqxona tashkil etildi")
        self.assertEqual(items[0]["summary"], "Qisqa mazmun")
        self.assertEqual(items[0]["date"], "2026-09-28T05:00:00Z")
        self.assertEqual(items[1]["url"], "https://eco.gov.uz/uz/news/100")  # нисбий ҳавола тўлиқ бўлди

    def test_atom(self):
        items = fm.parse_feed(ATOM, "https://eco.gov.uz/")
        self.assertEqual(items, [{"title": "Atom xabari", "summary": "Mazmun", "date": "2026-09-29T04:00:00Z", "url": "https://eco.gov.uz/uz/news/7"}])

    def test_html_fallback(self):
        pages = {"https://eco.gov.uz/uz": ("text/html", HTML_NO_FEED)}
        with mock.patch.object(fm, "fetch", fake_fetch(pages)):
            items, method = fm.website({"url": "https://eco.gov.uz/uz"}, ALLOWED)
        self.assertEqual(method, "html")
        # рўйхат саҳифаси, дубликат ва янгилик бўлмаган саҳифа ташлаб юборилади
        urls = [i["url"] for i in items]
        self.assertIn("https://eco.gov.uz/uz/news/555", urls)
        self.assertEqual(urls.count("https://eco.gov.uz/uz/news/555"), 1)
        self.assertNotIn("https://eco.gov.uz/uz/news", urls)
        self.assertNotIn("https://eco.gov.uz/uz/about", urls)
        item = items[urls.index("https://eco.gov.uz/uz/news/555")]
        self.assertEqual(item["title"], "Ekologiya vazirligi yangi dasturni taqdim etdi")
        self.assertEqual(item["date"], "2026-09-27T19:00:00Z")

    def test_telegram(self):
        pages = {"https://t.me/s/ecochan": ("text/html", TELEGRAM)}
        with mock.patch.object(fm, "fetch", fake_fetch(pages)):
            items, _ = fm.telegram({"channel": "@ecochan"}, ALLOWED)
        self.assertEqual([i["url"] for i in items], ["https://t.me/ecochan/11", "https://t.me/ecochan/10"])  # янгиси биринчи, қисқа хабар ташланди
        self.assertEqual(items[1]["title"], "Toshkentda ko'chat ekish aksiyasi")
        self.assertEqual(items[1]["summary"], "Aksiya shanba kuni bo'lib o'tadi.\nBarchani taklif qilamiz!")
        self.assertEqual(items[1]["date"], "2026-09-28T06:30:00Z")

    def test_telegram_rejects_bad_channel(self):
        with self.assertRaises(ValueError):
            fm.telegram({"channel": ""}, ALLOWED)
        with self.assertRaises(ValueError):
            fm.telegram({"channel": "a/../b"}, ALLOWED)


class Run(unittest.TestCase):
    CFG = {"allowed_hosts": ALLOWED, "max_items": 3, "sources": [
        {"id": "site", "type": "website", "name": "eco.gov.uz", "url": "https://eco.gov.uz/uz"},
        {"id": "telegram", "type": "telegram", "name": "TG", "channel": "ecochan"},
        {"id": "off", "type": "telegram", "channel": "x", "enabled": False}]}

    def test_merge_sort_limit(self):
        pages = {"https://eco.gov.uz/uz": ("application/rss+xml", RSS), "https://t.me/s/ecochan": ("text/html", TELEGRAM)}
        with mock.patch.object(fm, "fetch", fake_fetch(pages)):
            res = fm.run(self.CFG, {}, [])
        self.assertEqual(len(res["items"]), 3)
        dates = [i["date"] for i in res["items"]]
        self.assertEqual(dates, sorted(dates, reverse=True))
        self.assertEqual([s["id"] for s in res["sources"]], ["site", "telegram"])
        self.assertTrue(all(s["ok"] for s in res["sources"]))

    def test_failed_source_keeps_previous_and_manual_is_filtered(self):
        prev = {"items": [{"title": "Eski", "summary": "", "date": "2026-09-01T00:00:00Z", "url": "https://eco.gov.uz/uz/news/1", "source": "site"}]}
        manual = [{"title": "Qo'lda", "date": "2026-09-02T00:00:00Z", "url": "https://eco.gov.uz/uz/news/2"},
                  {"title": "Xavfli", "url": "https://evil.example/x"}]
        pages = {"https://t.me/s/ecochan": ("text/html", TELEGRAM)}
        with mock.patch.object(fm, "fetch", fake_fetch(pages)), mock.patch("builtins.print"):
            res = fm.run(dict(self.CFG, max_items=10), prev, manual)
        site = res["sources"][0]
        self.assertFalse(site["ok"])
        self.assertIn("OSError", site["error"])
        urls = [i["url"] for i in res["items"]]
        self.assertIn("https://eco.gov.uz/uz/news/1", urls)  # аввалги сақланди
        self.assertIn("https://eco.gov.uz/uz/news/2", urls)  # қўлда қўшилган
        self.assertNotIn("https://evil.example/x", urls)

    def test_main_writes_only_on_change(self):
        with tempfile.TemporaryDirectory() as d:
            d = pathlib.Path(d)
            (d / "src.json").write_text(json.dumps(self.CFG), encoding="utf-8")
            out = d / "out.json"
            pages = {"https://eco.gov.uz/uz": ("application/rss+xml", RSS), "https://t.me/s/ecochan": ("text/html", TELEGRAM)}
            argv = ["x", "--sources", str(d / "src.json"), "--manual", str(d / "none.json"), "--out", str(out)]
            with mock.patch.object(fm, "fetch", fake_fetch(pages)), mock.patch.object(sys, "argv", argv), mock.patch("builtins.print"):
                fm.main()
                first = out.read_text(encoding="utf-8")
                fm.main()
                self.assertEqual(out.read_text(encoding="utf-8"), first)  # ўзгариш йўқ — файл ўзгармади
            data = json.loads(first)
            self.assertTrue(data["updated"].endswith("Z"))
            self.assertEqual(len(data["items"]), 3)


if __name__ == "__main__":
    unittest.main()
