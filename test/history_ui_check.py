"""Smoke-check the history dashboard in a real browser: python test/history_ui_check.py."""

from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from tempfile import gettempdir

from playwright.sync_api import sync_playwright


DOCS = Path(__file__).resolve().parents[1] / "docs"


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def seed(page):
    page.evaluate("""async () => {
      const now = Date.now();
      const key = 'safety-history:esp32s-30p-01:demo';
      const events = Array.from({length: 125}, (_, i) => ({
        at: now - i * 60000, source: i % 3 === 0 ? 'user' : 'system',
        kind: i % 3 === 0 ? 'user' : 'danger',
        title: i % 3 === 0 ? 'Bật quạt' : i % 2 ? 'Phát hiện lửa' : 'Phát hiện khí gas',
        detail: 'Đã gửi lệnh đến thiết bị.'
      }));
      localStorage.setItem(key, JSON.stringify({version: 3, items: events}));
      const { taoKhoMauLichSu } = await import('./history-samples-store.js');
      const store = taoKhoMauLichSu('esp32s-30p-01:demo');
      for (let i = 0; i < 125; i++) await store.save({
        at: now - i * 60000, temperatureC: 25 + i % 5,
        humidityPct: 55 + i % 8, flameDetected: false, gasAlarm: false
      });
    }""")
    page.reload()
    page.get_by_role("tab", name="Lịch sử").click()
    page.wait_for_function("document.querySelector('#history-temp-line').getAttribute('d').length > 0")


def main():
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=str(DOCS)))
    Thread(target=server.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch()
            for width in (1280, 390):
                page = browser.new_page(viewport={"width": width, "height": 820}, color_scheme="dark")
                page.goto(f"http://127.0.0.1:{server.server_port}/?demo=1")
                seed(page)
                assert page.locator("#history-count").inner_text() == "125"
                assert page.locator("#history-page-label").inner_text() == "Trang 1 / 3"
                assert page.locator("#history-list li").count() == 50
                assert page.locator("#history-temp-current").inner_text() != "—"
                assert page.locator("#history-gas-count").inner_text() != "0"
                assert page.locator(".history-activity-bin").count() == 12
                assert page.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth")
                page.locator("#history-page-next").click()
                assert page.locator("#history-page-label").inner_text() == "Trang 2 / 3"
                page.locator("#history-range-week").click()
                assert page.locator("#history-range-week").get_attribute("aria-pressed") == "true"
                page.screenshot(path=str(Path(gettempdir()) / f"history-{width}.png"), full_page=True)
                page.once("dialog", lambda dialog: dialog.accept())
                page.locator("#clear-history-all").click()
                page.wait_for_function("document.querySelector('#history-temp-line').getAttribute('d') === ''")
                assert page.locator("#history-count").inner_text() == "0"
                assert page.locator("#clear-history-all").is_disabled()
                page.close()
            browser.close()
    finally:
        server.shutdown()
    print("PASS: history dashboard, chart, 125 events, pagination, ranges, desktop and phone")


if __name__ == "__main__":
    main()
