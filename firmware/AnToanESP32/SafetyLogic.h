#pragma once

#include <stdint.h>

// Logic an toan thuan tuy (khong goi GPIO) de co the kiem thu tren may tinh.

constexpr int MODE_AUTO = 0;
constexpr int MODE_ON = 1;
constexpr int MODE_OFF = 2;

// Thoi gian loc nhieu, don vi ms.
constexpr uint32_t FLAME_CONFIRM_MS = 200;          // DO lua phai giu LOW lien tuc truoc khi bao.
constexpr uint32_t FLAME_CONFIRM_FAN_MS = 1000;     // Lau hon khi quat dang chay hoac vua doi trang thai.
constexpr uint32_t FLAME_RELEASE_MS = 1500;         // Giu canh bao toi thieu, tranh coi keu ngat quang.
constexpr uint32_t GAS_CONFIRM_MS = 100;
constexpr uint32_t GAS_RELEASE_MS = 200;
constexpr uint32_t FAN_SWITCH_GUARD_MS = 2000;      // Khoang nhieu nguon sau khi quat bat/tat.
constexpr uint32_t FAN_PURGE_MS = 3000;             // Quat chay them 3 giay sau khi het gas.
constexpr uint32_t GAS_WARMUP_MS = 60000;           // MQ-2 can lam nong sau khi cap nguon.
constexpr uint32_t NOISE_HINT_MS = 30000;           // Thoi gian giu goi y "nhieu nguon" tren web.
constexpr uint32_t NOISE_AFTER_STOP_MS = 3000;      // Lua tat ngay sau khi dung quat -> nghi nhieu.

// Thoi diem `deadline` (millis) con o phia truoc `now`, an toan khi millis() tran so.
constexpr bool beforeDeadline(uint32_t now, uint32_t deadline) {
  return static_cast<int32_t>(deadline - now) > 0;
}

struct PurgeTimer {
  bool active = false;
  uint32_t until = 0;

  void update(bool gasCleared, bool gas, bool flame, uint32_t nowMs) {
    if (gasCleared) {
      active = true;
      until = nowMs + FAN_PURGE_MS;
    }
    if (gas || flame || (active && !beforeDeadline(nowMs, until))) active = false;
  }
};

// Bo loc chong nhieu cho tin hieu DO: chi doi trang thai khi muc moi on dinh du lau.
struct DebouncedInput {
  bool state = false;          // Trang thai da xac nhan.
  bool candidate = false;      // Muc tho dang duoc theo doi.
  uint32_t candidateSince = 0;
  uint32_t glitches = 0;       // So xung bao gia bi loai (len canh bao roi tro lai qua nhanh).

  // Tra ve true khi trang thai da xac nhan vua thay doi.
  constexpr bool update(bool raw, uint32_t nowMs, uint32_t confirmMs, uint32_t releaseMs) {
    if (raw != candidate) {
      if (candidate && !state) ++glitches;
      candidate = raw;
      candidateSince = nowMs;
    }
    const uint32_t needed = candidate ? confirmMs : releaseMs;
    if (candidate != state && nowMs - candidateSince >= needed) {
      state = candidate;
      return true;
    }
    return false;
  }
};

struct SafetyInputs {
  bool flame = false;
  bool gas = false;
  bool buzzerMuted = false;     // "Tat tieng coi 30 giay": chi anh huong coi.
  bool manualFan = false;       // Lenh quat tay tu web.
  bool fanBlockedByFlame = false;
  bool purging = false;         // Dang thong gio them sau khi het gas.
  int redLedMode = MODE_AUTO;
  int greenLedMode = MODE_AUTO;
  int buzzerMode = MODE_AUTO;
};

struct SafetyOutputs {
  bool fan = false;
  bool redLed = false;
  bool greenLed = false;
  bool buzzer = false;
};

// Co lua thi dung quat, ke ca khi dong thoi co gas, de khong thoi them oxy.
constexpr SafetyOutputs decideOutputs(const SafetyInputs& in) {
  const bool alarm = in.flame || in.gas;
  SafetyOutputs out;
  out.fan = !in.flame && (in.gas || in.purging || (in.manualFan && !in.fanBlockedByFlame));
  out.redLed = alarm || in.redLedMode == MODE_ON;
  out.greenLed = !out.redLed && in.greenLedMode != MODE_OFF;
  out.buzzer = !in.buzzerMuted && (alarm || in.buzzerMode == MODE_ON);
  return out;
}

// Ly do quat dang o trang thai hien tai, gui len web.
constexpr const char* fanReason(const SafetyInputs& in, const SafetyOutputs& out) {
  return in.flame ? "blocked" :
         in.gas ? "gas" :
         out.fan && in.purging && !(in.manualFan && !in.fanBlockedByFlame) ? "purge" :
         out.fan ? "manual" :
         in.manualFan && (in.fanBlockedByFlame || in.flame) ? "blocked" : "off";
}
