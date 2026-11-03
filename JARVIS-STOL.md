# Eko-JARVIS: qoʻl bilan boshqariladigan golografik stol

Bu sahifa (`jarvis.html`) videodagi "JARVIS" stoliga oʻxshash tizim uchun dastur. Kamera qoʻlingizni koʻradi, siz havoda barmoq bilan ishora qilib, chimdib bosasiz. Sahnalar: **Yer**, **Suv tozalash**, **Orol**, **Quyosh (150 kW)**, **Daraxt**.

Qoʻlni tanish brauzerning oʻzida ishlaydi (MediaPipe). Rasm internetga yuborilmaydi. Birinchi ochishda ~8 MB model yuklanadi, shuning uchun internet kerak.

## Qanday ishga tushiriladi

1. Kompyuter yoki noutbukda Chrome yoki Edge oching.
2. Saytni **https://** manzil orqali oching (masalan GitHub Pages) yoki kompyuterda `python3 -m http.server 8000` qilib, `http://localhost:8000/jarvis.html` ni oching. Oddiy faylni ikki marta bosib ochsangiz kamera ishlamaydi.
3. **📷 Kamerani yoqish** ni bosing va ruxsat bering.
4. Bir nechta kamera boʻlsa, tanlov roʻyxatidan keraklisini tanlang.
5. **⛶ Toʻliq ekran** ni bosing.

## Qoʻl harakatlari

| Harakat | Nima qiladi |
|---|---|
| Koʻrsatkich barmoq bilan ishora | Ekranda koʻk halqa (kursor) yuradi |
| Bosh barmoq + koʻrsatkich barmoqni tekkizish (chimdish) | Bosish |
| Kursorni tugma ustida 1 soniya ushlash | Bosish (chimdish shart emas) |
| Chimdib turib surish | Yerni aylantirish, Orol yilini oʻzgartirish |
| Ochiq kaftni tez chapga/oʻngga silkitish | Keyingi yoki oldingi sahna |

Kamera boʻlmasa ham sichqoncha, sensorli ekran va ← → tugmalari ishlaydi.

## Kamera: planshet kamerasi ishlamasa nima qilish kerak

Planshetning oʻz kamerasi shart emas. Uchta yoʻl bor:

1. **Telefonni kamera qilish (bepul).** Telefonga va kompyuterga **Iriun Webcam** yoki **DroidCam** ilovasini oʻrnating, bir xil Wi-Fi ga ulang. Kompyuterda u oddiy kamera boʻlib koʻrinadi, sahifadagi tanlovdan uni tanlang.
2. **USB veb-kamera** sotib olish: Uzum’da 200–320 ming soʻm atrofida.
3. Noutbukning oʻz kamerasi ham boʻladi, lekin uni qoʻlingizni koʻradigan qilib burish qiyin.

Kamerani ekran yoki stol tepasiga, qoʻl toʻliq koʻrinadigan qilib qoʻying. Xona juda qorongʻi boʻlmasin: qoʻl yoritilgan boʻlishi kerak, faqat ekran tomoni qorongʻi boʻlsin.

## Uch xil koʻrsatish usuli

**🖥 Oddiy ekran.** Monitor yoki televizor. Hech narsa yasash shart emas.

**🔷 Shisha quti (Pepper's ghost).** Videodagi oq quti shunday ishlaydi.
- Ekran (planshet yoki eski monitor) yuzasi tepaga qaragan holda yotadi.
- Uning ustiga tiniq akril (orgsteklo, 2–3 mm) 45° qiyalikda qoʻyiladi.
- Tasvir shishaga qaytib, havoda turgandek koʻrinadi. Quti ichi qora boʻlsin.
- Sahifada rejimni **🔷 Shisha quti** qiling. Yozuv teskari koʻrinsa **⇋ Koʻzgu** yoki **⇅ Teskari** ni bosing.
- Planshetning **ekrani** ishlasa, uni shu qutida ekran sifatida ishlatsa boʻladi (kamerasi kerak emas).

**📽 Proyektor stoli.** Videodagi stol ustidagi koʻk chizmalar.
- Proyektor stolga tepadan tushiradi (shiftga yoki shtativga mahkamlanadi, oynacha bilan ham pastga burish mumkin).
- Kamera ham tepada, stolni koʻradigan joyda.
- Sahifada rejimni **📽 Proyektor stoli** qiling va **🎯 Kalibrlash** ni bir marta bajaring: 4 burchakda nishon chiqadi, har biriga barmoq bilan tegib chimdang (yoki 1,5 soniya ushlab turing). Shundan keyin kursor aynan barmoq tagida yuradi.
- Metall yoki oq stol yuzasi tasvirni yaxshi koʻrsatadi.

## Taxminiy narxlar (Oʻzbekiston, 2026-yil noyabr)

Narxlar Uzum, OLX va Prom.uz’dagi eʼlonlardan olingan, sotuvchiga qarab oʻzgaradi.

| Narsa | Narx (soʻm) | Izoh |
|---|---|---|
| Kamera: telefon + Iriun/DroidCam | 0 | Telefoningiz boʻlsa |
| USB veb-kamera | 200–320 ming | Uzum |
| Tiniq akril (orgsteklo) 2–3 mm | 25–260 ming | OLX, oʻlchamga qarab; kesib berish alohida |
| Quti uchun MDF/faner yoki karton, qora boʻyoq | 50–150 ming | taxminiy |
| Arzon proyektor (HY300/HY320, Android) | 400–900 ming | Qorongʻi xonada yetarli |
| Yaxshi proyektor (BenQ, Epson, ViewSonic) | 1,4–6 mln | Yorugʻroq xonada ham koʻrinadi |
| Proyektor uchun shtativ yoki shiftga ilgich | 100–300 ming | taxminiy |
| Kompyuter yoki noutbuk | bor boʻlsa 0 | Chrome ishlasa yetadi |

**Jami (taxminiy):**
- Faqat shisha quti (planshet yoki monitor + telefon kamera): **≈ 100–400 ming soʻm**
- Shisha quti + arzon proyektor stoli: **≈ 0,8–1,7 mln soʻm**
- Shisha quti + yaxshi proyektor: **≈ 2–7 mln soʻm**
- Tayyor sotiladigan interaktiv golografik stol: odatda **3 000–20 000 $** (≈ 38–250 mln soʻm), Oʻzbekistonda kam uchraydi.

## Muammolar

- **"Kameraga ruxsat berilmadi"**: manzil satridagi 🔒 belgisini bosib, kamerani "Ruxsat" qiling.
- **"Kamerani yoqib boʻlmadi"**: internetni tekshiring (model birinchi marta yuklanadi) va sahifa https yoki localhost orqali ochilganini tekshiring.
- **Kursor sakraydi**: qoʻlni yoriting, kamerani qoʻlga yaqinroq qoʻying, fon bir xil rangli boʻlsin.
- **Kursor barmoq tagida emas (proyektor stoli)**: 🎯 Kalibrlashni qayta bajaring.

## Sozlash uchun manzil parametrlari

- `jarvis.html?mode=quti` yoki `?mode=stol`: rejim bilan ochish
- `jarvis.html?cam=1`: kamera darhol yoqiladi (ruxsat berilgan boʻlsa)
