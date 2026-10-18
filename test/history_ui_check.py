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
      sessionStorage.setItem('test-seed-now', String(now));
      const key = 'safety-history:esp32s-30p-01:demo';
      const events = Array.from({length: 125}, (_, i) => ({
        at: now - i * 60000, source: i % 3 === 0 ? 'user' : 'system',
        kind: i % 3 === 0 ? 'user' : 'danger',
        title: i % 3 === 0 ? 'Bật quạt' : i % 2 ? 'Phát hiện lửa' : 'Phát hiện khí gas',
        detail: 'Đã gửi lệnh đến thiết bị.'
      }));
      events.push({at: now - 20 * 24 * 60 * 60000, source: 'user', kind: 'user',
        title: 'Bật quạt', detail: 'Đã gửi lệnh đến thiết bị.'});
      localStorage.setItem(key, JSON.stringify({version: 3, items: events}));
      const { taoKhoMauLichSu } = await import('./history-samples-store.js');
      const store = taoKhoMauLichSu('esp32s-30p-01:demo');
      for (let i = 0; i < 125; i++) await store.save({
        at: now - i * 60000, temperatureC: 25 + i % 5,
        humidityPct: 55 + i % 8, flameDetected: false, gasAlarm: false
      });
      for (const [days, hour, temp, humidity] of [
        [1, 9, 20, 50], [1, 10, 30, 70], [10, 9, 40, 80]
      ]) {
        const date = new Date(now);
        date.setHours(hour, 0, 0, 0);
        date.setDate(date.getDate() - days);
        await store.save({at: date.getTime(), temperatureC: temp,
          humidityPct: humidity, flameDetected: false, gasAlarm: false});
      }
    }""")
    page.reload()
    page.get_by_role("tab", name="Lịch sử").click()
    page.wait_for_function("document.querySelector('#history-temp-line').getAttribute('d').length > 0")


def check_account_sample_migration(page):
    result = page.evaluate("""async () => {
      const { taoKhoMauLichSu } = await import('./history-samples-store.js');
      const base = Math.floor(Date.now() / 60000) * 60000 - 180000;
      const owner = taoKhoMauLichSu('migration-device:owner');
      const operator = taoKhoMauLichSu('migration-device:operator');
      const shared = taoKhoMauLichSu('migration-device:shared');
      await owner.save({at: base, temperatureC: 25});
      await operator.save({at: base + 60000, temperatureC: 26});
      await shared.save({at: base + 120000, temperatureC: 27});
      await shared.migrateLegacy('migration-device:');
      return {
        values: (await shared.range(base, base + 120000)).map(sample => sample.temperatureC),
        ownerEmpty: !(await owner.hasAny()), operatorEmpty: !(await operator.hasAny())
      };
    }""")
    assert result == {"values": [25, 26, 27], "ownerEmpty": True, "operatorEmpty": True}


def main():
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=str(DOCS)))
    Thread(target=server.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch()
            for width in (1280, 390, 320):
                page = browser.new_page(viewport={"width": width, "height": 820}, color_scheme="dark")
                page.goto(f"http://127.0.0.1:{server.server_port}/?demo=1")
                check_account_sample_migration(page)
                seed(page)
                assert page.locator("#history-count").inner_text() == "126"
                assert page.locator("#history-page-label").inner_text() == "Trang 1 / 3"
                assert page.locator("#history-list li").count() == 50
                assert page.locator("#history-temp-current").inner_text() != "—"
                assert page.locator("#history-gas-count").inner_text() != "0"
                assert page.locator("#history-range-today, #history-range-week, #history-range-month").count() == 3
                assert page.locator("#history-range-today").get_attribute("aria-pressed") == "true"
                assert "theo phút" in page.locator("#history-period").inner_text()
                assert page.locator("#history-temp-scale span").count() == 3
                assert page.locator("#history-humidity-scale span").count() == 3
                assert "°C" in page.locator("#history-temp-scale").inner_text()
                assert "%" in page.locator("#history-humidity-scale").inner_text()
                assert page.locator(".history-activity-bin").count() == 1
                assert page.locator(".history-activity-date").count() == 1
                positions = lambda: page.evaluate("""() => [
                  '.history-charts', '.history-activity', '.history-events-title'
                ].map(selector => document.querySelector(selector).getBoundingClientRect().top + scrollY)""")
                today_positions = positions()
                today_path = page.locator("#history-temp-line").get_attribute("d")
                page.locator("#history-range-week").click()
                page.wait_for_function("document.querySelectorAll('.history-activity-bin').length === 7")
                assert page.locator("#history-range-week").get_attribute("aria-pressed") == "true"
                assert "trung bình của một ngày" in page.locator("#history-period").inner_text()
                assert page.locator(".history-activity-bin").count() == 7
                week_positions = positions()
                week_path = page.locator("#history-temp-line").get_attribute("d")
                assert week_path != today_path
                page.locator("#history-range-month").click()
                page.wait_for_function("document.querySelectorAll('.history-activity-bin').length === 30")
                assert page.locator("#history-range-month").get_attribute("aria-pressed") == "true"
                assert page.locator(".history-activity-bin").count() == 30
                month_positions = positions()
                assert page.locator("#history-temp-line").get_attribute("d") != week_path
                assert all(max(values) - min(values) <= 1 for values in zip(
                    today_positions, week_positions, month_positions)), (
                    today_positions, week_positions, month_positions)
                assert page.locator(".history-activity-date").last.inner_text() == page.evaluate("""() => {
                  const now = new Date();
                  return String(now.getDate()).padStart(2, '0') + '/' +
                    String(now.getMonth() + 1).padStart(2, '0');
                }""")
                assert page.evaluate("""() => {
                  const viewport = document.querySelector('#history-activity-scroll').getBoundingClientRect();
                  const date = [...document.querySelectorAll('.history-activity-date')].at(-1).getBoundingClientRect();
                  return date.left >= viewport.left - 1 && date.right <= viewport.right + 1;
                }""")
                assert page.locator(".history-activity-bar-user, .history-legend-user").count() == 0
                assert page.locator(".history-activity-value").count() > 0
                for kind in ("flame", "gas"):
                    chart_total = sum(int(value) for value in page.locator(
                        f".history-activity-bar-{kind} .history-activity-value"
                    ).all_inner_texts())
                    assert chart_total == int(page.locator(f"#history-{kind}-count").inner_text())
                assert page.locator(".history-note").count() == 0
                assert page.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth")
                page.locator("#history-page-next").click()
                assert page.locator("#history-page-label").inner_text() == "Trang 2 / 3"
                page.screenshot(path=str(Path(gettempdir()) / f"history-{width}.png"), full_page=True)
                if width == 320:
                    page.evaluate("""() => {
                      const key = 'safety-history:esp32s-30p-01:demo';
                      const data = JSON.parse(localStorage.getItem(key));
                      data.items.push({at: Date.now() - 20 * 24 * 60 * 60000, source: 'system',
                        kind: 'danger', title: 'Phát hiện lửa', detail: 'Cảm biến phát tín hiệu cảnh báo.'});
                      localStorage.setItem(key, JSON.stringify(data));
                    }""")
                    page.reload()
                    page.get_by_role("tab", name="Lịch sử").click()
                    page.locator("#history-range-month").click()
                    page.wait_for_function("document.querySelectorAll('.history-activity-bin').length === 30")
                    assert page.evaluate("""() => {
                      const scroll = document.querySelector('#history-activity-scroll');
                      const last = [...document.querySelectorAll('.history-activity-date')].at(-1).getBoundingClientRect();
                      return scroll.scrollWidth > scroll.clientWidth &&
                        last.right <= scroll.getBoundingClientRect().right + 1;
                    }""")
                    page.locator("#history-activity-scroll").evaluate("element => element.scrollLeft = 0")
                    assert page.locator(".history-activity-date").first.is_visible()
                    assert page.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth")
                page.once("dialog", lambda dialog: dialog.accept())
                layout_snapshot = lambda: page.evaluate("""() => [
                  '.history-summary', '.history-stat-flame', '.history-stat-gas',
                  '.history-stat-user', '.history-charts', '.history-period'
                ].map(selector => document.querySelector(selector).getBoundingClientRect().height)""")
                before_heights = layout_snapshot()
                activity_top = page.locator(".history-activity").evaluate(
                    "element => element.getBoundingClientRect().top + scrollY")
                page.locator("#clear-history-all").click()
                page.wait_for_function("document.querySelector('#history-temp-line').getAttribute('d') === ''")
                activity_top_after = page.locator(".history-activity").evaluate(
                    "element => element.getBoundingClientRect().top + scrollY")
                assert abs(activity_top - activity_top_after) <= 1, (width, activity_top, activity_top_after,
                                                                    before_heights, layout_snapshot())
                assert page.locator("#history-count").inner_text() == "0"
                assert page.locator("#clear-history-all").is_disabled()
                page.close()
            browser.close()
    finally:
        server.shutdown()
    print("PASS: history dashboard, 126 events, account sample migration, desktop and phone")


if __name__ == "__main__":
    main()
