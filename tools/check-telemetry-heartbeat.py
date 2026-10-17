"""Check that a connected ESP32 refreshes Firebase telemetry throughout a run.

Run locally with ``python tools/check-telemetry-heartbeat.py`` after creating
firmware/AnToanESP32/secrets.h. Never prints credentials or the auth token.
"""

from __future__ import annotations

import json
import re
import sys
import time
from pathlib import Path
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
SECONDS = 90
INTERVAL = 5
MAX_AGE_SECONDS = 30


def config_value(source: str, name: str) -> str:
    match = re.search(r'^\s*#define\s+' + name + r'\s+"([^"]+)"', source, re.MULTILINE)
    if not match:
        raise ValueError(f"Missing {name} in secrets.h")
    return match.group(1)


def get_json(url: str, payload: dict | None = None) -> dict:
    data = json.dumps(payload).encode() if payload is not None else None
    headers = {"Content-Type": "application/json"} if data is not None else {}
    with urlopen(Request(url, data=data, headers=headers), timeout=12) as response:
        return json.load(response)


def main() -> int:
    source = (ROOT / "firmware/AnToanESP32/secrets.h").read_text(encoding="utf-8")
    api_key = config_value(source, "FIREBASE_API_KEY")
    database_url = config_value(source, "FIREBASE_DATABASE_URL").rstrip("/")
    auth = get_json(
        "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=" + api_key,
        {"email": config_value(source, "DEVICE_EMAIL"),
         "password": config_value(source, "DEVICE_PASSWORD"), "returnSecureToken": True},
    )
    url = database_url + "/devices/esp32s-30p-01/telemetry.json?auth=" + auth["idToken"]
    previous_uptime = None
    observed_hardware_id = None
    oldest_age = 0.0
    stale_samples = 0
    for sample in range(SECONDS // INTERVAL + 1):
        telemetry = get_json(url)
        if not isinstance(telemetry, dict):
            print("FAIL: telemetry is missing", file=sys.stderr)
            return 1
        timestamp = telemetry.get("updatedAt")
        uptime = telemetry.get("uptimeS")
        hardware_id = telemetry.get("hardwareId")
        age = (time.time() * 1000 - timestamp) / 1000 if isinstance(timestamp, (int, float)) else float("inf")
        oldest_age = max(oldest_age, age)
        stale_samples += age > 15
        print(f"sample={sample + 1} age={age:.1f}s uptime={uptime} hardware={hardware_id} reset={telemetry.get('resetReason')}", flush=True)
        if observed_hardware_id is not None and hardware_id != observed_hardware_id:
            print("FAIL: telemetry hardware ID changed; another writer uses this device path", file=sys.stderr)
            return 1
        if isinstance(hardware_id, str) and observed_hardware_id is None:
            observed_hardware_id = hardware_id
        if age > MAX_AGE_SECONDS:
            print(f"FAIL: telemetry is older than {MAX_AGE_SECONDS}s", file=sys.stderr)
            return 1
        if isinstance(uptime, int) and isinstance(previous_uptime, int) and uptime < previous_uptime:
            print("FAIL: device uptime decreased; check for a reset or duplicate Firebase writer", file=sys.stderr)
            return 1
        previous_uptime = uptime
        if sample < SECONDS // INTERVAL:
            time.sleep(INTERVAL)
    if observed_hardware_id is None:
        print("FAIL: telemetry has no hardware ID from the flashed ESP32", file=sys.stderr)
        return 1
    print(f"PASS: no offline interval; oldest={oldest_age:.1f}s; samples over 15s={stale_samples}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, KeyError) as error:
        print(f"Telemetry check could not run: {type(error).__name__}", file=sys.stderr)
        raise SystemExit(2) from error
