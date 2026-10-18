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
      for (const [days, title] of [[1, 'Phát hiện khí gas'], [10, 'Phát hiện lửa']]) {
        const date = new Date(now);
        date.setDate(date.getDate() - days);
        events.push({at: date.getTime(), source: 'system', kind: 'danger',
          title, detail: 'Cảm biến phát tín hiệu cảnh báo.'});
      }
      events.sort((a, b) => b.at - a.at);
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
                assert page.locator("#history-count").inner_text() == "128"
                assert page.locator("#history-page-label").inner_text() == "Trang 1 / 3"
                assert page.locator("#history-list li").count() == 50
                assert page.locator("#history-temp-current").inner_text() != "—"
                assert page.locator("#history-gas-count").inner_text() != "0"
                assert page.locator("#history-range-open").inner_text() == "Hôm nay"
                page.locator("#history-range-open").scroll_into_view_if_needed()
                summary_before = page.locator(".history-summary").evaluate(
                    "element => element.getBoundingClientRect().top + scrollY")
                scroll_before = page.evaluate("scrollY")
                page.locator("#history-range-open").click()
                assert page.locator("#history-range-dialog").is_visible()
                assert abs(page.evaluate("scrollY") - scroll_before) <= 1
                assert abs(page.locator(".history-summary").evaluate(
                    "element => element.getBoundingClientRect().top + scrollY") - summary_before) <= 1
                assert page.locator("#history-range-preset-yesterday").is_visible()
                assert page.locator("#history-calendar-days button").count() == 42
                assert page.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth")
                page.screenshot(path=str(Path(gettempdir()) / f"history-date-dialog-{width}.png"))
                if width == 1280:
                    page.emulate_media(color_scheme="light")
                    assert page.locator("#history-range-dialog").is_visible()
                    page.screenshot(path=str(Path(gettempdir()) / "history-date-dialog-light.png"))
                    page.emulate_media(color_scheme="dark")
                today_and_yesterday = page.evaluate("""() => {
                  const today = new Date();
                  const yesterday = new Date(today);
                  yesterday.setDate(yesterday.getDate() - 1);
                  const format = date => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'),
                    String(date.getDate()).padStart(2, '0')].join('-');
                  return [format(today), format(yesterday)];
                }""")
                page.locator(f'#history-calendar-days [data-date="{today_and_yesterday[0]}"]').click()
                assert page.locator("#history-range-to").input_value() == ""
                page.locator(f'#history-calendar-days [data-date="{today_and_yesterday[1]}"]').click()
                assert page.locator("#history-range-from").input_value() == today_and_yesterday[1]
                assert page.locator("#history-range-to").input_value() == today_and_yesterday[0]
                page.locator("#history-range-preset-yesterday").click()
                page.locator("#history-range-apply").click()
                assert page.locator("#history-range-open").inner_text() == "Hôm qua"
                assert "theo phút" in page.locator("#history-period").inner_text()
                page.locator("#history-range-open").click()
                too_long = page.evaluate("""() => {
                  const end = new Date();
                  const start = new Date(end);
                  start.setDate(start.getDate() - 92);
                  const format = date => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'),
                    String(date.getDate()).padStart(2, '0')].join('-');
                  return [format(start), format(end)];
                }""")
                page.locator("#history-range-from").fill(too_long[0])
                page.locator("#history-range-to").fill(too_long[1])
                page.locator("#history-range-apply").click()
                assert page.locator("#history-range-dialog").is_visible()
                assert "92 ngày" in page.locator("#history-range-error").inner_text()
                page.locator("#history-range-cancel").click()
                assert page.locator("#history-range-open").inner_text() == "Hôm qua"
                def select_range(name):
                    page.locator("#history-range-open").click()
                    page.locator(f"#history-range-preset-{name}").click()
                    page.locator("#history-range-apply").click()

                select_range("today")
                assert page.locator("#history-range-open").inner_text() == "Hôm nay"
                assert "theo phút" in page.locator("#history-period").inner_text()
                assert page.locator("#history-temp-points circle, #history-humidity-points circle").count() == 0
                assert page.locator("#history-temp-scale span").count() == 3
                assert page.locator("#history-humidity-scale span").count() == 3
                assert "°C" in page.locator("#history-temp-scale").inner_text()
                assert "%" in page.locator("#history-humidity-scale").inner_text()
                assert page.locator(".history-activity-bin").count() == 1
                assert page.locator(".history-activity-date").count() == 1
                assert page.evaluate("""() => {
                  const view = document.querySelector('#history-activity-scroll').getBoundingClientRect();
                  const bin = document.querySelector('.history-activity-bin').getBoundingClientRect();
                  return Math.abs((view.left + view.right - bin.left - bin.right) / 2) <= 1;
                }""")
                positions = lambda: page.evaluate("""() => [
                  '.history-charts', '.history-activity', '.history-events-title'
                ].map(selector => document.querySelector(selector).getBoundingClientRect().top + scrollY)""")
                today_positions = positions()
                def activity_size():
                    return page.evaluate("""() => {
                      const selectors = ['.history-summary', '.history-activity',
                        '#history-activity-scroll', '#history-activity-bars', '.history-period'];
                      return selectors.map(selector => {
                        const box = document.querySelector(selector).getBoundingClientRect();
                        return [Math.round(box.width), Math.round(box.height)];
                      });
                    }""")
                today_size = activity_size()
                assert today_size[1][1] >= 242, today_size
                select_range("yesterday")
                page.wait_for_function("document.querySelector('#history-gas-count').textContent === '1'")
                yesterday_size = activity_size()
                select_range("today")
                page.wait_for_function("Number(document.querySelector('#history-gas-count').textContent) > 1")
                today_path = page.locator("#history-temp-line").get_attribute("d")
                select_range("week")
                page.wait_for_function("document.querySelectorAll('.history-activity-bin').length === 2")
                assert page.locator("#history-range-open").inner_text() == "1 tuần"
                assert "trung bình của một ngày" in page.locator("#history-period").inner_text()
                assert page.locator("#history-temp-points circle").count() >= 2
                assert "trung bình" in page.locator("#history-temp-points circle title").first.text_content()
                week_points = page.locator("#history-temp-points circle").count()
                assert page.locator(".history-activity-bin").count() == 2
                week_positions = positions()
                week_size = activity_size()
                week_path = page.locator("#history-temp-line").get_attribute("d")
                assert week_path != today_path
                select_range("month")
                page.wait_for_function("document.querySelectorAll('.history-activity-bin').length === 3")
                assert page.locator("#history-range-open").inner_text() == "1 tháng"
                assert page.locator(".history-activity-bin").count() == 3
                month_positions = positions()
                month_size = activity_size()
                assert today_size == yesterday_size == week_size == month_size, (
                    width, today_size, yesterday_size, week_size, month_size)
                assert page.locator("#history-temp-line").get_attribute("d") != week_path
                assert page.locator("#history-temp-points circle").count() > week_points
                custom_dates = page.evaluate("""() => {
                  const now = new Date(Number(sessionStorage.getItem('test-seed-now')));
                  const format = date => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'),
                    String(date.getDate()).padStart(2, '0')].join('-');
                  const first = new Date(now);
                  const last = new Date(now);
                  first.setDate(first.getDate() - 10);
                  last.setDate(last.getDate() - 1);
                  return [format(first), format(last)];
                }""")
                page.locator("#history-range-open").click()
                page.locator("#history-range-from").fill(custom_dates[0])
                page.locator("#history-range-to").fill(custom_dates[1])
                page.locator("#history-range-apply").click()
                assert page.locator("#history-range-dialog").is_hidden()
                assert "trung bình của một ngày" in page.locator("#history-period").inner_text()
                assert page.locator(".history-activity-bin").count() >= 2
                custom_positions = positions()
                assert custom_dates[0][8:] in page.locator("#history-range-open").inner_text(), (
                    custom_dates, page.locator("#history-range-open").inner_text())
                select_range("month")
                page.wait_for_function("document.querySelectorAll('.history-activity-bin').length === 3")
                assert all(max(values) - min(values) <= 1 for values in zip(
                    today_positions, week_positions, month_positions, custom_positions)), (
                    today_positions, week_positions, month_positions, custom_positions)
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
                date_filter = page.locator("#history-date")
                selected_date = page.evaluate("""() => {
                  const value = new Date(Number(sessionStorage.getItem('test-seed-now')));
                  value.setDate(value.getDate() - 10);
                  return [value.getFullYear(), String(value.getMonth() + 1).padStart(2, '0'),
                    String(value.getDate()).padStart(2, '0')].join('-');
                }""")
                card_before = page.locator(".history-card").bounding_box()
                date_filter.fill(selected_date)
                assert page.locator("#history-list li").count() == 1
                assert page.locator("#history-page-label").inner_text() == "Trang 1 / 1"
                assert page.locator("#history-system-count").inner_text() == "1"
                assert page.locator("#history-user-count").inner_text() == "0"
                assert page.locator("#history-count").inner_text() == "128"
                page.locator("#history-filter-user").click()
                assert page.locator("#history-list li").count() == 0
                assert "ngày" in page.locator("#history-empty").inner_text().lower()
                page.locator("#history-filter-all").click()
                assert page.locator("#history-list li").count() == 1
                assert page.locator(".history-card").bounding_box()["height"] == card_before["height"]
                assert page.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth")
                page.locator("#history-date-clear").click()
                assert date_filter.input_value() == ""
                assert page.locator("#history-page-label").inner_text() == "Trang 1 / 3"
                assert page.locator("#history-list li").count() == 50
                page.screenshot(path=str(Path(gettempdir()) / f"history-{width}.png"), full_page=True)
                if width == 320:
                    page.evaluate("""() => {
                      const key = 'safety-history:esp32s-30p-01:demo';
                      const data = JSON.parse(localStorage.getItem(key));
                      for (const days of [5, 15, 20, 25]) {
                        const date = new Date();
                        date.setDate(date.getDate() - days);
                        data.items.push({at: date.getTime(), source: 'system',
                          kind: 'danger', title: 'Phát hiện lửa', detail: 'Cảm biến phát tín hiệu cảnh báo.'});
                      }
                      localStorage.setItem(key, JSON.stringify(data));
                    }""")
                    page.reload()
                    page.get_by_role("tab", name="Lịch sử").click()
                    page.locator("#history-range-open").click()
                    page.locator("#history-range-preset-month").click()
                    page.locator("#history-range-apply").click()
                    page.wait_for_function("document.querySelectorAll('.history-activity-bin').length === 7")
                    month_chart_height = page.locator(".history-activity").evaluate(
                        "element => element.getBoundingClientRect().height")
                    page.locator("#history-range-open").click()
                    page.locator("#history-range-preset-today").click()
                    page.locator("#history-range-apply").click()
                    page.wait_for_function("document.querySelectorAll('.history-activity-bin').length === 1")
                    today_chart_height = page.locator(".history-activity").evaluate(
                        "element => element.getBoundingClientRect().height")
                    assert abs(month_chart_height - today_chart_height) <= 1, (
                        month_chart_height, today_chart_height)
                    page.locator("#history-range-open").click()
                    page.locator("#history-range-preset-month").click()
                    page.locator("#history-range-apply").click()
                    page.wait_for_function("document.querySelectorAll('.history-activity-bin').length === 7")
                    assert page.evaluate("""() => {
                      const scroll = document.querySelector('#history-activity-scroll');
                      const last = [...document.querySelectorAll('.history-activity-date')].at(-1).getBoundingClientRect();
                      const view = scroll.getBoundingClientRect();
                      return scroll.scrollWidth > scroll.clientWidth + 1 &&
                        last.right <= view.right + 1;
                    }""")
                    assert page.locator(".history-activity-date").last.is_visible()
                    assert page.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth")
                page.once("dialog", lambda dialog: dialog.accept())
                layout_snapshot = lambda: page.evaluate("""() => [
                  '.history-summary', '.history-stat-flame', '.history-stat-gas',
                  '.history-stat-user', '.history-charts', '.history-period'
                ].map(selector => document.querySelector(selector).getBoundingClientRect().height)""")
                before_heights = layout_snapshot()
                chart_height = page.locator(".history-activity").evaluate(
                    "element => element.getBoundingClientRect().height")
                activity_top = page.locator(".history-activity").evaluate(
                    "element => element.getBoundingClientRect().top + scrollY")
                page.locator("#clear-history-all").click()
                page.wait_for_function("document.querySelector('#history-temp-line').getAttribute('d') === ''")
                activity_top_after = page.locator(".history-activity").evaluate(
                    "element => element.getBoundingClientRect().top + scrollY")
                assert abs(activity_top - activity_top_after) <= 1, (width, activity_top, activity_top_after,
                                                                    before_heights, layout_snapshot())
                assert page.locator(".history-activity-bin").count() == 0
                assert page.locator("#history-activity-empty").is_visible()
                assert abs(chart_height - page.locator(".history-activity").evaluate(
                    "element => element.getBoundingClientRect().height")) <= 1
                assert page.locator("#history-count").inner_text() == "0"
                assert page.locator("#clear-history-all").is_disabled()
                empty_month_size = activity_size()
                select_range("today")
                page.wait_for_function("document.querySelector('#history-period').textContent.includes('hôm nay')")
                empty_today_size = activity_size()
                select_range("yesterday")
                page.wait_for_function("document.querySelector('#history-period').textContent.includes('hôm qua')")
                empty_yesterday_size = activity_size()
                assert empty_month_size == empty_today_size == empty_yesterday_size, (
                    width, empty_month_size, empty_today_size, empty_yesterday_size)
                page.close()
            browser.close()
    finally:
        server.shutdown()
    print("PASS: history dashboard, only alert days, empty state, desktop and phone")


if __name__ == "__main__":
    main()
