/*
 * ЭкоГолограмма — DIY LED-вентилятор, АЙЛАНУВЧИ қисм (ротор) учун намуна дастур.
 *
 * Плата: ESP32-S3 (PSRAM билан, масалан ESP32-S3-DevKitC-1 N16R8), Arduino-ESP32 3.x.
 * LED: APA102 / SK9822 / HD107S (CLK + DATA). WS2812 ЯРАМАЙДИ — секин ва милтиллайди.
 * Парраклар: 2 та қарама-қарши паррак, ҳар бирида LEDS та LED (марказдан четгача).
 * Ҳолат датчиги: Холл датчиги (A3144 / SS49E + компаратор) — асосга ёпиштирилган
 *   битта магнит ёнидан ўтганда паррак «соат 12» да бўлади.
 * Контент: SD-картадаги /eko.bin (tools/mp4-to-polar.py ясайди).
 *
 * ДИҚҚАТ: бу ўқув шаблони, ҳақиқий қурилмада синалмаган. Аввал паррак айланмаган
 * ҳолда (стендда) текширинг; LED токини ёрқинлик чеклови билан ҳисобланг.
 */
#include <SPI.h>
#include <SD_MMC.h>

// ---- Созламалар ----
constexpr int LEDS = 72;          // битта парракдаги LED сони (mp4-to-polar --leds)
constexpr int SLOTS = 360;        // бир айланишдаги бурчаклар (mp4-to-polar --slots)
constexpr int BLADES = 2;         // 0° ва 180° даги парраклар
constexpr uint32_t SPI_HZ = 20000000;  // APA102: 20 МГц, HD107S: 30–40 МГц гача
constexpr uint8_t GLOBAL_BRIGHT = 16;  // 0..31 — APA102 умумий ёрқинлиги (токни чеклайди)
constexpr uint32_t MIN_PERIOD_US = 50000;   // 1200 айл/дақ дан тез — хато сигнал
constexpr uint32_t MAX_PERIOD_US = 200000;  // 300 айл/дақ дан секин — LED ўчади

constexpr int PIN_HALL = 4;
constexpr int PIN_CLK[BLADES] = {12, 14};
constexpr int PIN_DAT[BLADES] = {11, 13};

// ---- Ҳолат ----
SPIClass spi[BLADES] = {SPIClass(FSPI), SPIClass(HSPI)};
volatile uint32_t lastIndexUs = 0, periodUs = 0;
uint8_t *frameBuf[2];             // PSRAM: иккита кадр (бири кўрсатилади, бири ўқилади)
volatile int showIdx = 0;
uint16_t fileSlots, fileLeds, fileFps;
uint32_t fileFrames, frameBytes;
File bin;
uint8_t column[4 + LEDS * 4 + LEDS / 16 + 4];

void IRAM_ATTR onHall() {
  uint32_t now = micros(), p = now - lastIndexUs;
  if (p > MIN_PERIOD_US / 4) { periodUs = p; lastIndexUs = now; }  // сакраш (bounce) ни ташлаш
}

// Битта парракка битта устунни юбориш (APA102 протоколи: 0x00000000, LED'лар, якуний фрейм)
void sendColumn(int blade, const uint8_t *rgb) {
  int n = 0;
  memset(column, 0, 4); n = 4;
  for (int i = 0; i < LEDS; i++) {
    const uint8_t *p = rgb ? rgb + i * 3 : nullptr;
    column[n++] = 0xE0 | GLOBAL_BRIGHT;
    column[n++] = p ? p[2] : 0;   // APA102 тартиби: B, G, R
    column[n++] = p ? p[1] : 0;
    column[n++] = p ? p[0] : 0;
  }
  while (n < (int)sizeof(column)) column[n++] = 0xFF;  // якуний фрейм: камида LEDS/2 бит
  spi[blade].writeBytes(column, n);
}

void allOff() { for (int b = 0; b < BLADES; b++) sendColumn(b, nullptr); }

// Ядро 0: SD-картадан кейинги кадрни олдиндан ўқиб туради
void loaderTask(void *) {
  uint32_t frame = 0, next = millis();
  for (;;) {
    int back = showIdx ^ 1;
    bin.seek(16 + (uint64_t)frame * frameBytes);
    bin.read(frameBuf[back], frameBytes);
    while ((int32_t)(millis() - next) < 0) vTaskDelay(1);
    showIdx = back;
    next += 1000 / fileFps;
    frame = (frame + 1) % fileFrames;
  }
}

void setup() {
  Serial.begin(115200);
  for (int b = 0; b < BLADES; b++) { spi[b].begin(PIN_CLK[b], -1, PIN_DAT[b], -1); spi[b].beginTransaction(SPISettings(SPI_HZ, MSBFIRST, SPI_MODE0)); }
  allOff();
  pinMode(PIN_HALL, INPUT_PULLUP);
  attachInterrupt(PIN_HALL, onHall, FALLING);

  if (!SD_MMC.begin() || !(bin = SD_MMC.open("/eko.bin"))) { Serial.println("SD / eko.bin topilmadi"); return; }
  char magic[4]; uint16_t ver;
  bin.read((uint8_t *)magic, 4); bin.read((uint8_t *)&ver, 2);
  bin.read((uint8_t *)&fileSlots, 2); bin.read((uint8_t *)&fileLeds, 2); bin.read((uint8_t *)&fileFps, 2);
  bin.read((uint8_t *)&fileFrames, 4);
  if (memcmp(magic, "EKOP", 4) || fileSlots != SLOTS || fileLeds != LEDS || !fileFrames) { Serial.println("eko.bin formati mos emas"); bin.close(); return; }
  frameBytes = (uint32_t)SLOTS * LEDS * 3;
  frameBuf[0] = (uint8_t *)ps_malloc(frameBytes);
  frameBuf[1] = (uint8_t *)ps_malloc(frameBytes);
  bin.seek(16); bin.read(frameBuf[0], frameBytes);
  xTaskCreatePinnedToCore(loaderTask, "loader", 4096, nullptr, 1, nullptr, 0);
}

// Ядро 1: айланиш бурчагини ҳисоблаб, ҳар бир бурчакда парракларга устун юборади
void loop() {
  static int lastSlot = -1;
  uint32_t p = periodUs, since = micros() - lastIndexUs;
  if (!bin || p < MIN_PERIOD_US || p > MAX_PERIOD_US || since > MAX_PERIOD_US) {
    if (lastSlot != -1) { allOff(); lastSlot = -1; }  // айланмаяпти — LED ўчиқ
    return;
  }
  int slot = (uint64_t)since * SLOTS / p;
  if (slot >= SLOTS || slot == lastSlot) return;
  lastSlot = slot;
  const uint8_t *f = frameBuf[showIdx];
  for (int b = 0; b < BLADES; b++) {
    int s = (slot + b * SLOTS / BLADES) % SLOTS;
    sendColumn(b, f + (uint32_t)s * LEDS * 3);
  }
}
