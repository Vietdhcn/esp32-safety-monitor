#pragma once

#include <stdint.h>

// SSID is 1-32 bytes; WPA passphrases are 8-63 printable ASCII bytes.
constexpr bool wifiCredentialsValid(const char* ssid, const char* password) {
  if (!ssid || !password) return false;
  uint8_t ssidLength = 0;
  bool hasVisibleSsidByte = false;
  for (const char* p = ssid; *p; ++p) {
    if (++ssidLength > 32) return false;
    if (*p != ' ') hasVisibleSsidByte = true;
  }
  if (!ssidLength || !hasVisibleSsidByte) return false;
  uint8_t passwordLength = 0;
  for (const char* p = password; *p; ++p) {
    const unsigned char byte = static_cast<unsigned char>(*p);
    if (++passwordLength > 63 || byte < 0x20 || byte > 0x7e) return false;
  }
  return passwordLength >= 8;
}

enum class WifiProvisioningAction { SaveForLater, TryNow };

constexpr WifiProvisioningAction wifiProvisioningAction(bool targetIsCurrent, bool targetVisible) {
  return targetIsCurrent || !targetVisible ? WifiProvisioningAction::SaveForLater : WifiProvisioningAction::TryNow;
}

constexpr bool wifiCleanupDue(bool pending, uint32_t nowMs, uint32_t lastAttemptMs) {
  return pending && (lastAttemptMs == 0 || nowMs - lastAttemptMs >= 30000);
}

constexpr bool wifiCleanupMatches(const char* cloudRequestId, const char* processedRequestId) {
  if (!cloudRequestId || !processedRequestId || !cloudRequestId[0]) return false;
  while (*cloudRequestId && *processedRequestId) {
    if (*cloudRequestId++ != *processedRequestId++) return false;
  }
  return *cloudRequestId == *processedRequestId;
}
