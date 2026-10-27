/*
 * ЭкоГолограмма — DIY LED-вентилятор, ҚЎЗҒАЛМАС асос (мотор ва хавфсизлик) учун намуна.
 *
 * Плата: ҳар қандай ESP32 ёки Arduino Nano. BLDC драйвер PWM (тезлик) + ENABLE кириши билан.
 * Хавфсизлик занжири:
 *   1) Эшик/қопқоқ датчиги (микровыключатель, NC) — очилса мотор дарҳол тўхтайди.
 *      Муҳим: датчик драйвернинг ENABLE симида ҲАМ аппарат даражасида кетма-кет уланади,
 *      дастур осилиб қолса ҳам мотор тўхташи керак.
 *   2) Тебраниш датчиги (MPU6050) — мувозанат бузилса ёки паррак бўшаса тўхтатади.
 *   3) Тезлик чегараси — Холл датчиги бўйича айл/дақ белгиланганидан ошса тўхтатади.
 *   4) Секин ишга тушиш (soft start). Хатода қувват дарҳол узилади — драйверда BRAKE бўлса, уни ҳам ишлатинг.
 * Хато бўлгач мотор фақат «RESET» тугмаси билан қайта ёқилади (ўзи ёқилмайди).
 *
 * ДИҚҚАТ: ўқув шаблони, ҳақиқий қурилмада синалмаган. Тебраниш чегарасини ўз қурилмангизда созланг.
 */
#include <Wire.h>

constexpr int PIN_PWM = 25, PIN_ENABLE = 26, PIN_DOOR = 27, PIN_RESET = 14, PIN_HALL = 4;
constexpr int TARGET_RPM = 720, MAX_RPM = 900;
constexpr float VIBRATION_LIMIT_G = 0.35;  // ўз қурилмангизда ўлчаб созланг
constexpr uint8_t MPU = 0x68;

volatile uint32_t hallLast = 0, hallPeriod = 0;
void IRAM_ATTR onHall() { uint32_t t = micros(); hallPeriod = t - hallLast; hallLast = t; }

enum State { STOPPED, RUNNING, FAULT } state = STOPPED;
float duty = 0;
const char *faultReason = "";

float vibrationG() {
  Wire.beginTransmission(MPU); Wire.write(0x3B); Wire.endTransmission(false);
  Wire.requestFrom(MPU, (uint8_t)6);
  int16_t ax = Wire.read() << 8 | Wire.read(), ay = Wire.read() << 8 | Wire.read(), az = Wire.read() << 8 | Wire.read();
  static float base = -1;
  float g = sqrtf((float)ax * ax + (float)ay * ay + (float)az * az) / 16384.0f;
  if (base < 0) base = g;
  base = base * 0.999f + g * 0.001f;   // секин ўзгарувчи ўртача (оғирлик кучи)
  return fabsf(g - base);              // тез тебраниш
}

void stopMotor(const char *why, bool fault) {
  digitalWrite(PIN_ENABLE, LOW);
  ledcWrite(PIN_PWM, 0);
  duty = 0;
  state = fault ? FAULT : STOPPED;
  faultReason = why;
  Serial.printf("TO'XTADI: %s\n", why);
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_ENABLE, OUTPUT); digitalWrite(PIN_ENABLE, LOW);
  pinMode(PIN_DOOR, INPUT_PULLUP);    // эшик ёпиқ = LOW (NC контакт ерга)
  pinMode(PIN_RESET, INPUT_PULLUP);
  pinMode(PIN_HALL, INPUT_PULLUP);
  attachInterrupt(PIN_HALL, onHall, FALLING);
  ledcAttach(PIN_PWM, 20000, 10);
  Wire.begin();
  Wire.beginTransmission(MPU); Wire.write(0x6B); Wire.write(0); Wire.endTransmission();  // MPU6050'ни уйғотиш
}

void loop() {
  bool doorOpen = digitalRead(PIN_DOOR) == HIGH;
  uint32_t p = hallPeriod;
  int rpm = (p && micros() - hallLast < 500000) ? 60000000UL / p : 0;
  float vib = vibrationG();

  if (state == RUNNING) {
    if (doorOpen) stopMotor("qopqoq ochildi", true);
    else if (vib > VIBRATION_LIMIT_G) stopMotor("tebranish juda katta — muvozanatni tekshiring", true);
    else if (rpm > MAX_RPM) stopMotor("tezlik chegaradan oshdi", true);
    else {
      // Секин ишга тушиш: ҳар 20 мс да ~0,5% дан, мақсадли тезликка етгунча
      if (rpm < TARGET_RPM && duty < 0.95f) duty += 0.005f;
      else if (rpm > TARGET_RPM + 20 && duty > 0) duty -= 0.005f;
      ledcWrite(PIN_PWM, (uint32_t)(duty * 1023));
    }
  } else if (digitalRead(PIN_RESET) == LOW && !doorOpen) {
    Serial.println("Ishga tushirilmoqda (soft start)");
    state = RUNNING;
    digitalWrite(PIN_ENABLE, HIGH);
  }
  delay(20);
}
