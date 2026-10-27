#!/usr/bin/env python3
"""
ЭкоГолограмма — квадрат MP4 видеони ўзи ясалган (DIY) LED-вентилятор учун
қутб (polar) кадрларига айлантиради.

Вентилятор парраги экранни «сатр-устун» бўйлаб эмас, айлана бўйлаб чизади:
ҳар бир бурчак (slot) да парракдаги ҳар бир LED (марказдан четгача) битта
нуқтани кўрсатади. Бу скрипт ҳар кадр учун slots × leds × 3 (RGB) жадвал тузади,
гамма-тузатиш ва ёрқинлик чегарасини қўллайди ва SD-картага ёзиш учун битта
.bin файл қилади (формат пастда, firmware шуни ўқийди).

Талаб: Python 3.9+, numpy, ffmpeg.

  python3 tools/mp4-to-polar.py fan-videos/01-yer-1080.mp4 yer.bin --leds 72 --slots 360
  python3 tools/mp4-to-polar.py video.mp4 out.bin --leds 72 --hub 6 --brightness 0.6 --preview preview.png

.bin формати (little-endian):
  0  4  b"EKOP"     — белги
  4  2  версия (1)
  6  2  slots       — бир айланишдаги бурчаклар сони
  8  2  leds        — битта парракдаги (марказдан четгача) LED сони
  10 2  fps
  12 4  frames      — кадрлар сони
  16 …  кадрлар: frames × slots × leds × 3 байт (R, G, B), slot 0 = соат 12, соат стрелкаси бўйлаб;
        LED 0 = марказга энг яқин LED.
"""
import argparse
import json
import struct
import subprocess
import sys

import numpy as np


def probe(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                          "stream=width,height,r_frame_rate", "-of", "json", path],
                         check=True, capture_output=True, text=True).stdout
    s = json.loads(out)["streams"][0]
    num, den = s["r_frame_rate"].split("/")
    return int(s["width"]), int(s["height"]), float(num) / float(den)


def sample_grid(size, slots, leds, hub):
    """Ҳар бир (slot, led) учун манба пикселининг координаталари (билинеар учун)."""
    c = (size - 1) / 2
    theta = np.arange(slots) / slots * 2 * np.pi            # 0 = юқори, соат стрелкаси бўйлаб
    # LED марказлари: hub (ўлик зона) дан четгача тенг оралиқда
    r = (hub + np.arange(leds) + 0.5) / (hub + leds) * (size / 2)
    x = c + np.outer(np.sin(theta), r)
    y = c - np.outer(np.cos(theta), r)
    return x, y


def bilinear(img, x, y):
    h, w, _ = img.shape
    x0 = np.clip(np.floor(x).astype(int), 0, w - 2)
    y0 = np.clip(np.floor(y).astype(int), 0, h - 2)
    fx = np.clip(x - x0, 0, 1)[..., None]
    fy = np.clip(y - y0, 0, 1)[..., None]
    a = img[y0, x0] * (1 - fx) + img[y0, x0 + 1] * fx
    b = img[y0 + 1, x0] * (1 - fx) + img[y0 + 1, x0 + 1] * fx
    return a * (1 - fy) + b * fy


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input")
    ap.add_argument("output")
    ap.add_argument("--leds", type=int, default=72, help="битта парракдаги LED сони (марказдан четгача)")
    ap.add_argument("--slots", type=int, default=360, help="бир айланишдаги бурчаклар сони")
    ap.add_argument("--hub", type=float, default=4, help="марказдаги LEDсиз зона, LED қадамида")
    ap.add_argument("--fps", type=float, default=0, help="чиқиш кадр тезлиги (0 = видеодагидек)")
    ap.add_argument("--gamma", type=float, default=2.2)
    ap.add_argument("--brightness", type=float, default=0.7, help="0..1 — ток ва қизишни чеклаш учун")
    ap.add_argument("--preview", help="2-сониядаги кадрнинг вентиляторда қандай кўринишини PNG қилиб сақлаш")
    a = ap.parse_args()

    w, h, src_fps = probe(a.input)
    fps = a.fps or src_fps
    size = min(w, h)
    x, y = sample_grid(size, a.slots, a.leds, a.hub)
    # Гамма жадвали: LED ёрқинлиги чизиқли, кўз эса логарифмик сезади
    lut = np.round((np.arange(256) / 255) ** a.gamma * 255 * a.brightness).astype(np.uint8)

    vf = f"crop={size}:{size},fps={fps}"
    dec = subprocess.Popen(["ffmpeg", "-v", "error", "-i", a.input, "-vf", vf, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                           stdout=subprocess.PIPE)
    frames = 0
    shot = None  # кўриниш учун ~2-сониядаги кадр (гаммасиз — кўз қандай кўрса, шундай)
    with open(a.output, "wb") as out:
        out.write(struct.pack("<4sHHHHI", b"EKOP", 1, a.slots, a.leds, round(fps), 0))
        n = size * size * 3
        while True:
            buf = dec.stdout.read(n)
            if len(buf) < n:
                break
            img = np.frombuffer(buf, np.uint8).reshape(size, size, 3).astype(np.float32)
            raw = np.clip(bilinear(img, x, y) + 0.5, 0, 255).astype(np.uint8)
            out.write(lut[raw].tobytes())
            if shot is None or frames == round(fps * 2):
                shot = raw
            frames += 1
        out.seek(12)
        out.write(struct.pack("<I", frames))
    dec.wait()
    if not frames:
        sys.exit("Видеодан кадр ўқилмади")
    mb = frames * a.slots * a.leds * 3 / 1e6
    print(f"{frames} кадр, {a.slots}×{a.leds} нуқта, {round(fps)} кадр/с → {a.output} ({mb:.1f} МБ)")

    if a.preview:
        save_preview(shot, a.preview, a.hub)


def save_preview(polar, path, hub, size=600):
    """Қутб жадвалини қайтадан тўғри бурчакли расмга ёйиб, ffmpeg орқали PNG қилиб сақлайди."""
    slots, leds, _ = polar.shape
    c = (size - 1) / 2
    yy, xx = np.mgrid[0:size, 0:size]
    dx, dy = xx - c, c - yy
    r = np.hypot(dx, dy) / (size / 2) * (hub + leds) - hub
    t = (np.arctan2(dx, dy) % (2 * np.pi)) / (2 * np.pi) * slots
    li = np.floor(r).astype(int)
    si = np.floor(t).astype(int) % slots
    ok = (li >= 0) & (li < leds)
    img = np.zeros((size, size, 3), np.uint8)
    img[ok] = polar[si[ok], li[ok]]
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{size}x{size}",
                    "-i", "-", "-frames:v", "1", path], input=img.tobytes(), check=True)
    print(f"Кўриниш: {path}")


if __name__ == "__main__":
    main()
