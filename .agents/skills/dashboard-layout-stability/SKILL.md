---
name: dashboard-layout-stability
description: Check this project's ESP32 dashboard for layout shifts when safety states, live text, or notifications change. Use for UI work in docs/; skip firmware-only changes.
---

# Dashboard layout stability

The dashboard receives live ESP32 telemetry. Changes to a short label can move the entire control panel when a longer description previously determined a card's height. Browser minimum font size can enlarge rendered text without enlarging an `em`-based space reservation; that caused the gas alarm regression.

When changing the UI in `docs/`:

1. Identify text and elements that vary with telemetry, alarm state, pending commands, and notifications. Compare their rendered size in safe, gas, flame, combined alarm, warmup, and stale states. Keep the sensor grid, control heading, and control panel at stable document positions across those states. A notice opened by the user should overlay or stay within its own reserved area.
2. Run `python .agents/skills/dashboard-layout-stability/scripts/check_layout.py` from the repository root. It uses the local `?demo=1` dashboard and checks geometry at desktop and phone widths, including enlarged line height and text. Install Playwright's Python package and Chromium if they are unavailable; if installation is not possible, perform the same comparisons in an available real browser and report that limitation.
3. Test any state or viewport affected by the current change beyond the script's cases. Compare both document coordinates and `scrollY` at the same viewport size. Cropped screenshots with different crop bounds do not establish a layout shift.
4. Reserve space using rendered line height or measured content when text can wrap. Avoid assuming that `em` based on the declared font size matches the user's minimum font setting. Keep all alert text readable; do not hide or truncate safety information to pass the geometry check.
5. Run `npm test` for UI changes that affect JavaScript behavior. A passing logic test alone does not verify visual stability.

The check is a regression gate for this dashboard, not a guarantee for every browser setting. If it fails, reproduce the specific state and fix the layout before treating the UI work as complete.
