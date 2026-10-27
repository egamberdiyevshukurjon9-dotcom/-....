/* ЭкоГолограмма — вентилятор студияси: тайёр лойиҳалар.
 *
 * Маълумотлар лойиҳаларнинг ўз README ва кодидан олинган (рақамлар ҳақиқий):
 *  - Ekomun: 60 даража, 4 эко-ўйин, 8 кроссворд, 13 шаҳарнинг жонли ҳаво сифати;
 *  - Яшил белбоғ: маълумот ҳар 10 дақиқада янгиланади, 6 ҳудуд;
 *  - ЭкоГолограмма: 7 та 3D саҳна, 3 хил намойиш тури.
 * Янги лойиҳани саҳифанинг ўзида «➕ Янги лойиҳа» орқали қўшишингиз мумкин
 * (ёки шу рўйхатга янги объект қўшинг).
 *
 * Майдонлар:
 *   id        — қисқа лотин ном (файл номи учун)
 *   name      — катта ном          kicker — тепадаги ёй ёзуви
 *   tagline   — пастдаги шиор      url    — охирги саҳнада (ихтиёрий)
 *   icon      — иконка (FanEngine.ICON_NAMES)     theme — ранг мавзуси (eko|neon|gold|ocean|fire)
 *   features  — [{t: "Сарлавҳа", icon?: "book"}]  stats — [{v: 60, l: "даража", suffix?: "+"}]
 */
(function (global) {
  "use strict";
  global.FAN_PROJECTS = [
    {
      id: "ekomun",
      name: "Ekomun",
      kicker: "Экологияни яхшилаш учун",
      tagline: "Экологик таълим платформаси",
      icon: "leaf",
      theme: "eko",
      features: [
        { t: "Интерактив курслар ва дарслар", icon: "book" },
        { t: "Жонли ҳаво сифати", icon: "wind" },
        { t: "Эко-ўйинлар ва даражалар", icon: "trophy" },
        { t: "Эко-кўз: расм таҳлили", icon: "eye" },
        { t: "Эко-харита ва ҳашар", icon: "pin" },
        { t: "Мактаблар учун синф", icon: "cap" },
      ],
      stats: [
        { v: 60, l: "даража", suffix: "" },
        { v: 13, l: "шаҳарда жонли ҳаво сифати", suffix: "" },
        { v: 4, l: "болалар эко-ўйини", suffix: "" },
      ],
    },
    {
      id: "yashil-belbog",
      name: "Яшил белбоғ",
      kicker: "Экологик мониторинг",
      tagline: "Ўзбекистон яшил қоплама мониторинги",
      icon: "tree",
      theme: "eko",
      features: [
        { t: "Яшил қоплама ва тупроқ", icon: "tree" },
        { t: "Ҳаво сифати: PM2.5, PM10", icon: "wind" },
        { t: "Дрон мониторинги", icon: "drone" },
        { t: "Эко-харита", icon: "map" },
        { t: "Таҳлил ва илмий база", icon: "chart" },
        { t: "Кўнгилли бўлиш", icon: "users" },
      ],
      stats: [
        { v: 10, l: "дақиқада жонли янгиланиш", suffix: "" },
        { v: 6, l: "ҳудуд рейтинги ва солиштириш", suffix: "" },
      ],
    },
    {
      id: "ekogolo",
      name: "ЭкоГолограмма",
      kicker: "3D таълим",
      tagline: "Табиатни ҳавода кўринг",
      icon: "globe",
      theme: "ocean",
      features: [
        { t: "Ер сайёраси", icon: "globe" },
        { t: "Сув айланиши", icon: "drop" },
        { t: "Дарахт ва ўрмон", icon: "tree" },
        { t: "Орол муаммоси", icon: "wind" },
        { t: "Иқлим ўзгариши", icon: "sun" },
        { t: "Қайта ишлаш", icon: "recycle" },
        { t: "Яшил энергия", icon: "bolt" },
      ],
      stats: [
        { v: 7, l: "3D саҳна", suffix: "" },
        { v: 3, l: "намойиш тури", suffix: "" },
      ],
    },
    {
      id: "loyihalarim",
      name: "Экологик лойиҳаларим",
      kicker: "Экология яхшилаш учун",
      tagline: "Таълим · Мониторинг · 3D",
      icon: "star",
      theme: "gold",
      features: [
        { t: "Ekomun — таълим платформаси", icon: "book" },
        { t: "Яшил белбоғ — мониторинг", icon: "tree" },
        { t: "ЭкоГолограмма — 3D таълим", icon: "globe" },
      ],
      stats: [{ v: 3, l: "лойиҳа, битта мақсад", suffix: "" }],
    },
  ];

  /* Тайёр видеолар (tools/render-project-videos.js билан яратилган, 720×720, H.264, 30 к/с) */
  global.FAN_READY = [
    { file: "tayyor-videolar/ekomun-eko-720.mp4", name: "Ekomun" },
    { file: "tayyor-videolar/yashil-belbog-eko-720.mp4", name: "Яшил белбоғ" },
    { file: "tayyor-videolar/ekogolo-ocean-720.mp4", name: "ЭкоГолограмма" },
    { file: "tayyor-videolar/loyihalarim-gold-720.mp4", name: "Экологик лойиҳаларим" },
  ];
})(window);
