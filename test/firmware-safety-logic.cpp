// Kiem thu logic an toan cua firmware tren may tinh: g++ -std=c++17 test/firmware-safety-logic.cpp
#include "../firmware/AnToanESP32/SafetyLogic.h"
#include "../firmware/AnToanESP32/DhtSample.h"

#include <cstdio>
#include <cstring>

static int failures = 0;
#define CHECK(cond) do { if (!(cond)) { std::printf("FAIL line %d: %s\n", __LINE__, #cond); ++failures; } } while (0)

static SafetyOutputs decide(bool flame, bool gas, bool manualFan = false, bool muted = false,
                            bool purging = false, bool blocked = false) {
  SafetyInputs in;
  in.flame = flame; in.gas = gas; in.manualFan = manualFan; in.buzzerMuted = muted;
  in.purging = purging; in.fanBlockedByFlame = blocked;
  return decideOutputs(in);
}

int main() {
  // Mot xung LOW ngan (nhieu nguon khi quat khoi dong) khong duoc thanh canh bao lua.
  DebouncedInput flame;
  uint32_t t = 0;
  for (; t < 120; t += 20) flame.update(true, t, FLAME_CONFIRM_MS, FLAME_RELEASE_MS);
  for (; t < 400; t += 20) flame.update(false, t, FLAME_CONFIRM_MS, FLAME_RELEASE_MS);
  CHECK(!flame.state);
  CHECK(flame.glitches == 1);

  // Tin hieu lua that, giu on dinh, van duoc bao sau thoi gian xac nhan.
  bool changed = false;
  const uint32_t start = t;
  for (; t <= start + FLAME_CONFIRM_MS; t += 20) changed |= flame.update(true, t, FLAME_CONFIRM_MS, FLAME_RELEASE_MS);
  CHECK(flame.state);
  CHECK(changed);
  // Mot lan HIGH thoang qua khong lam mat canh bao.
  flame.update(false, t, FLAME_CONFIRM_MS, FLAME_RELEASE_MS); t += 20;
  flame.update(true, t, FLAME_CONFIRM_MS, FLAME_RELEASE_MS); t += 20;
  CHECK(flame.state);
  // Het lua that thi canh bao tat sau thoi gian giu.
  const uint32_t clearStart = t;
  for (; t <= clearStart + FLAME_RELEASE_MS; t += 20) flame.update(false, t, FLAME_CONFIRM_MS, FLAME_RELEASE_MS);
  CHECK(!flame.state);

  // Khi quat chay, xung 600 ms van bi loai; tin hieu 1 s tro len thi bao.
  DebouncedInput noisy;
  t = 0;
  for (; t < 600; t += 20) noisy.update(true, t, FLAME_CONFIRM_FAN_MS, FLAME_RELEASE_MS);
  noisy.update(false, t, FLAME_CONFIRM_FAN_MS, FLAME_RELEASE_MS);
  CHECK(!noisy.state);
  t += 20;
  const uint32_t longStart = t;
  for (; t <= longStart + FLAME_CONFIRM_FAN_MS; t += 20) noisy.update(true, t, FLAME_CONFIRM_FAN_MS, FLAME_RELEASE_MS);
  CHECK(noisy.state);

  // millis() tran so van tinh dung han thong gio.
  CHECK(beforeDeadline(0xFFFFFF00u, 0x00000100u));
  CHECK(!beforeDeadline(0x00000200u, 0x00000100u));

  // Het gas: quat chay them dung 3 giay; bao lua cat ngay khoang thong gio.
  PurgeTimer purge;
  purge.update(true, false, false, 1000);
  CHECK(purge.active);
  purge.update(false, false, false, 3999);
  CHECK(purge.active);
  purge.update(false, false, false, 4000);
  CHECK(!purge.active);
  purge.update(true, false, false, 5000);
  purge.update(false, false, true, 5100);
  CHECK(!purge.active);

  // An toan: xanh, coi tat, quat tat.
  SafetyOutputs out = decide(false, false);
  CHECK(!out.fan && !out.redLed && out.greenLed && !out.buzzer);
  // Gas: quat, den do, coi.
  out = decide(false, true);
  CHECK(out.fan && out.redLed && !out.greenLed && out.buzzer);
  // Lua: den do, coi, KHONG bat quat; quat tay bi dung.
  out = decide(true, false, true);
  CHECK(!out.fan && out.redLed && out.buzzer);
  // Ca hai: lua uu tien, khong thoi them oxy.
  out = decide(true, true);
  CHECK(!out.fan && out.redLed && out.buzzer);
  // Tat tieng chi tat coi; den do va quat van chay khi co gas.
  out = decide(false, true, false, true);
  CHECK(out.fan && out.redLed && !out.buzzer);
  // Thong gio them sau gas, nhung dung neu co lua.
  CHECK(decide(false, false, false, false, true).fan);
  CHECK(!decide(true, false, false, false, true).fan);
  // Quat tay bi khoa sau bao lua thi van tat khi het lua, den khi nguoi dung chon lai.
  CHECK(!decide(false, false, true, false, false, true).fan);
  CHECK(decide(false, false, true).fan);

  SafetyInputs in;
  in.gas = true;
  CHECK(std::strcmp(fanReason(in, decideOutputs(in)), "gas") == 0);
  in.flame = true;
  CHECK(std::strcmp(fanReason(in, decideOutputs(in)), "blocked") == 0);
  in = SafetyInputs(); in.purging = true;
  CHECK(std::strcmp(fanReason(in, decideOutputs(in)), "purge") == 0);
  in = SafetyInputs(); in.manualFan = true;
  CHECK(std::strcmp(fanReason(in, decideOutputs(in)), "manual") == 0);
  in.flame = true;
  CHECK(std::strcmp(fanReason(in, decideOutputs(in)), "blocked") == 0);
  in = SafetyInputs();
  CHECK(std::strcmp(fanReason(in, decideOutputs(in)), "off") == 0);

  // LED hai mau theo che do khi an toan.
  in = SafetyInputs(); in.redLedMode = MODE_ON;
  out = decideOutputs(in);
  CHECK(out.redLed && !out.greenLed);
  in = SafetyInputs(); in.greenLedMode = MODE_OFF;
  out = decideOutputs(in);
  CHECK(!out.redLed && !out.greenLed);

  // DHT11 gui khi so do doi.
  CHECK(dhtSampleChanged(false, 0, 0, true, 30, 50));
  CHECK(!dhtSampleChanged(true, 30, 50, true, 30, 50));

  if (failures == 0) std::printf("firmware safety logic: all checks passed\n");
  return failures == 0 ? 0 : 1;
}
