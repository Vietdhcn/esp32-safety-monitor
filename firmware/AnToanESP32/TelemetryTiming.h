#pragma once

#include <stdint.h>

// Gui thay doi ngay; chi gioi han toc do khi lan gui truoc that bai.
constexpr uint32_t TELEMETRY_HEARTBEAT_MS = 5000;
constexpr uint32_t TELEMETRY_RETRY_MS = 500;

constexpr bool telemetrySendDue(uint32_t version, uint32_t lastSentVersion,
                                uint32_t nowMs, uint32_t lastSendAt,
                                bool lastTryFailed, uint32_t lastTryAt) {
  const bool changed = version != lastSentVersion;
  const bool heartbeatDue = nowMs - lastSendAt >= TELEMETRY_HEARTBEAT_MS;
  return (changed || heartbeatDue) &&
         (!lastTryFailed || nowMs - lastTryAt >= TELEMETRY_RETRY_MS);
}
