"""Check that live dashboard states do not move the content below the sensor grid."""

from __future__ import annotations

from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

try:
    from playwright.sync_api import sync_playwright
except ImportError as exc:
    raise SystemExit("Install Playwright: python -m pip install playwright && python -m playwright install chromium") from exc


DOCS = Path(__file__).resolve().parents[4] / "docs"
WIDTHS = (1280, 720, 480, 390, 381, 380, 320)
FONTS = {
    "normal": "",
    # Recreates a browser minimum font size: line height grows while a 12px em reservation does not.
    "larger-line-height": ".metric-card p { line-height: 21.75px !important; }",
    "larger-text": ".metric-card p { font-size: 15px !important; }",
}
TOLERANCE = 1.0


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def snapshot(page):
    return page.evaluate("""() => {
      const box = selector => {
        const rect = document.querySelector(selector).getBoundingClientRect();
        return {top: rect.top + scrollY, height: rect.height};
      };
      return {
        scrollY,
        tabs: box('#dashboard-tabs'),
        grid: box('.metric-grid'),
        title: box('#control-title'),
        panel: box('#control-panel'),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        clippedDescriptions: [...document.querySelectorAll('.metric-card p')]
          .filter(p => p.scrollHeight > p.clientHeight + 1).map(p => p.id),
      };
    }""")


def compare(baseline, current, label, errors):
    for section in ("tabs", "grid", "title", "panel"):
        for dimension in ("top", "height"):
            before = baseline[section][dimension]
            after = current[section][dimension]
            if abs(after - before) > TOLERANCE:
                errors.append(f"{label}: {section}.{dimension} moved {after - before:+.1f}px")
    if abs(current["scrollY"] - baseline["scrollY"]) > TOLERANCE:
        errors.append(f"{label}: scrollY moved {current['scrollY'] - baseline['scrollY']:+.1f}px")
    if current["overflow"] > TOLERANCE:
        errors.append(f"{label}: horizontal overflow {current['overflow']:.1f}px")
    if current["clippedDescriptions"]:
        errors.append(f"{label}: clipped descriptions {current['clippedDescriptions']}")


def run_case(browser, url, width, font_name, font_css, errors):
    page = browser.new_page(viewport={"width": width, "height": 700})
    case = f"{width}px/{font_name}"
    try:
        page.goto(url, wait_until="networkidle")
        page.locator("#dashboard").wait_for(state="visible")
        if font_css:
            page.add_style_tag(content=font_css)
        page.evaluate("window.scrollTo(0, 180)")
        baseline = snapshot(page)
        if baseline["overflow"] > TOLERANCE or baseline["clippedDescriptions"]:
            errors.append(f"{case}/safe: overflow or clipped text: {baseline}")

        # Click through the demo's actual state transitions, without Playwright scrolling to buttons.
        for state, button, expected in (
            ("gas", "#demo-gas", ("An toàn", "Phát hiện")),
            ("gas+flame", "#demo-flame", ("Phát hiện", "Phát hiện")),
            ("flame", "#demo-gas", ("Phát hiện", "An toàn")),
            ("safe-again", "#demo-flame", ("An toàn", "An toàn")),
        ):
            page.locator(button).evaluate("button => button.click()")
            actual = (page.locator("#flame-value").inner_text(), page.locator("#gas-alarm-value").inner_text())
            if actual != expected:
                errors.append(f"{case}/{state}: expected sensor labels {expected}, got {actual}")
            compare(baseline, snapshot(page), f"{case}/{state}", errors)

        # These live descriptions are currently absent from demo controls, so exercise their text lengths.
        originals = page.evaluate("() => Object.fromEntries([...document.querySelectorAll('.metric-card p')].map(p => [p.id, p.textContent]))")
        for state, replacements in (
            ("warmup", {"gas-alarm-detail": "MQ-2 đang làm nóng (~1 phút sau khi cấp nguồn)"}),
            ("purge", {"fan-detail": "Thông gió thêm 3 giây sau khi hết gas"}),
            ("stale", {key: "Không có dữ liệu mới" for key in
                       ("flame-detail", "gas-alarm-detail", "fan-detail")}),
        ):
            page.evaluate("replacements => { for (const [id, value] of Object.entries(replacements)) document.getElementById(id).textContent = value; }", replacements)
            compare(baseline, snapshot(page), f"{case}/{state}", errors)
            page.evaluate("originals => { for (const [id, value] of Object.entries(originals)) document.getElementById(id).textContent = value; }", originals)

        page.locator("#notice-details summary").evaluate("summary => summary.click()")
        if not page.locator("#notice-details").evaluate("details => details.open"):
            errors.append(f"{case}/notice: did not open")
        compare(baseline, snapshot(page), f"{case}/notice", errors)
    except Exception as exc:
        errors.append(f"{case}: {exc}")
    finally:
        page.close()


def main():
    if not (DOCS / "index.html").exists():
        raise SystemExit(f"Dashboard not found: {DOCS}")
    handler = partial(QuietHandler, directory=str(DOCS))
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    errors = []
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch()
            try:
                url = f"http://127.0.0.1:{server.server_port}/?demo=1"
                for width in WIDTHS:
                    for font_name, font_css in FONTS.items():
                        run_case(browser, url, width, font_name, font_css, errors)
            finally:
                browser.close()
    except Exception as exc:
        raise SystemExit(f"Chromium could not start. Run: python -m playwright install chromium\n{exc}") from exc
    finally:
        server.shutdown()
        server.server_close()
        thread.join()
    if errors:
        raise SystemExit("Layout regression detected:\n" + "\n".join(errors))
    print(f"PASS: {len(WIDTHS) * len(FONTS)} viewport/font combinations; safe, gas, flame, combined, warmup, purge, stale, and notice states")


if __name__ == "__main__":
    main()
