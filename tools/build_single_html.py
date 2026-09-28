#!/usr/bin/env python3
"""Бутун платформани битта мустақил HTML файлга йиғади (серверсиз очиш учун).

Ишлатиш:  python3 tools/build_single_html.py [чиқиш_файли]
Андоза чиқиш файли: dist/EkoTalim.html
"""
import base64
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SCRIPTS = ["js/translit.js", "js/data.js", "js/library.js", "js/app.js"]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def main():
    out = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "dist" / "EkoTalim.html"
    html = read("index.html")
    icon = "data:image/svg+xml;base64," + base64.b64encode((ROOT / "icon.svg").read_bytes()).decode()
    replacements = [
        ('<link rel="stylesheet" href="css/style.css">', "<style>\n" + read("css/style.css") + "</style>"),
        ('<link rel="manifest" href="manifest.json">\n', ""),
        ('href="icon.svg"', f'href="{icon}"'),
    ]
    for path in SCRIPTS:
        code = read(path)
        if "</script" in code.lower():
            sys.exit(f"{path}: ичида '</script' бўлмаслиги керак")
        replacements.append((f'<script src="{path}"></script>', "<script>\n" + code + "</script>"))
    for old, new in replacements:
        if old not in html:
            sys.exit(f"index.html ичида топилмади: {old!r}")
        html = html.replace(old, new)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding="utf-8")
    print(f"{out} ({len(html.encode()) // 1024} KB)")


if __name__ == "__main__":
    main()
