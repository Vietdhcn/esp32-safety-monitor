#pragma once

#include <stdint.h>

// Gom cac thay doi dieu khien lien tiep; canh bao cam bien van gui ngay.
constexpr uint32_t TELEMETRY_HEARTBEAT_MS = 5000;
constexpr uint32_t TELEMETRY_CHANGE_MIN_MS = 1000;
constexpr uint32_t TELEMETRY_RETRY_MS = 500;

constexpr bool telemetrySendDue(uint32_t version, uint32_t lastSentVersion,
                                uint32_t nowMs, uint32_t lastSendAt,
                                bool lastTryFailed, uint32_t lastTryAt,
                                bool urgent = false) {
  const bool changed = version != lastSentVersion;
  const bool heartbeatDue = nowMs - lastSendAt >= TELEMETRY_HEARTBEAT_MS;
  const bool changeDue = changed &&
      (urgent || lastSentVersion == UINT32_MAX || nowMs - lastSendAt >= TELEMETRY_CHANGE_MIN_MS);
  return (changeDue || heartbeatDue) &&
         (!lastTryFailed || nowMs - lastTryAt >= TELEMETRY_RETRY_MS);
}
