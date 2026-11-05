#!/usr/bin/env python3
"""Eko-JARVIS'ni bitta HTML faylga yigʻadi (CSS va JS ichida).

Natija faylni ikki marta bosib Chrome/Edge'da ochsa boʻladi: oʻrnatish shart emas.
Internet faqat birinchi ochishda kerak (MediaPipe qoʻl modeli CDN'dan yuklanadi).

Ishlatish:  python3 tools/build-jarvis-standalone.py [chiqish.html]
"""
import base64
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
out = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / "eko-jarvis.html")

html = (ROOT / "jarvis.html").read_text(encoding="utf-8")
css = (ROOT / "css/jarvis.css").read_text(encoding="utf-8")
geo = (ROOT / "js/holo-geo.js").read_text(encoding="utf-8")
app = (ROOT / "js/jarvis.js").read_text(encoding="utf-8").replace("</script", "<\\/script")
icon = base64.b64encode((ROOT / "icon.svg").read_bytes()).decode()


def sub(src, old, new):
    assert src.count(old) == 1, old
    return src.replace(old, new)


html = sub(html, '<link rel="icon" href="icon.svg" type="image/svg+xml" data-site>',
           f'<link rel="icon" href="data:image/svg+xml;base64,{icon}">')
html = sub(html, '<link rel="stylesheet" href="css/jarvis.css">', f"<style>\n{css}</style>")
html = sub(html, '<script src="js/holo-geo.js"></script>',
           f"<script>window.JARVIS_STANDALONE = true;</script>\n<script>\n{geo}\n</script>")
html = sub(html, '<script type="module" src="js/jarvis.js"></script>',
           f'<script type="module">\n{app}\n</script>')
out.write_text(html, encoding="utf-8")
print(f"{out} ({out.stat().st_size // 1024} KB)")
