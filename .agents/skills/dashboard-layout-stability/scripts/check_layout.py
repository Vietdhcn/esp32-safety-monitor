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
WIDTHS = (1280, 720, 480, 390, 381, 380, 375, 360, 340, 320)
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


def visual_state(page):
    return page.evaluate("""() => {
      const color = node => getComputedStyle(node).color;
      return {
        fanRow: color(document.querySelector('#fan-mode')),
        fanRowIcon: color(document.querySelector('#fan-mode').closest('.setting-row').querySelector('.tile-icon')),
        ledRow: color(document.querySelector('#led-state')),
        ledRowIcon: color(document.querySelector('#led-state').closest('.setting-row').querySelector('.tile-icon')),
        buzzerRow: color(document.querySelector('#buzzerMode-state')),
        buzzerRowIcon: color(document.querySelector('#buzzerMode-state').closest('.setting-row').querySelector('.tile-icon')),
        fanAnimation: getComputedStyle(document.querySelector('#fan-mode').closest('.setting-row').querySelector('.tile-icon svg')).animationName,
        ledAnimation: getComputedStyle(document.querySelector('#led-state').closest('.setting-row').querySelector('.tile-icon')).animationName,
        buzzerAnimation: getComputedStyle(document.querySelector('#buzzerMode-state').closest('.setting-row').querySelector('.tile-icon')).animationName,
      };
    }""")


def button_geometry(page, selector):
    return page.eval_on_selector_all(selector, """buttons => buttons.map(button => {
      const rect = button.getBoundingClientRect();
      return {x: rect.x, y: rect.y + scrollY, width: rect.width, height: rect.height};
    })""")


def check_button_geometry(page, selector, button_ids, case, errors):
    baseline = button_geometry(page, selector)
    for button_id in button_ids:
        button = page.locator(f"#{button_id}")
        if button.is_disabled():
            errors.append(f"{case}/{button_id}: button is disabled; selection was not tested")
            continue
        button.evaluate("button => button.click()")
        selected_attribute = 'aria-selected' if button_id.startswith('tab-') else 'aria-pressed'
        if button.get_attribute(selected_attribute) != 'true':
            errors.append(f"{case}/{button_id}: selection did not change")
        current = button_geometry(page, selector)
        for index, (before, after) in enumerate(zip(baseline, current)):
            for dimension in ("x", "y", "width", "height"):
                delta = after[dimension] - before[dimension]
                if abs(delta) > TOLERANCE:
                    errors.append(f"{case}/{button_id}: button {index} {dimension} moved {delta:+.1f}px")


def check_sending_visuals(page, case, errors):
    # A Firebase write temporarily disables controls; unrelated buttons should not flash.
    result = page.evaluate("""() => {
      const panel = document.getElementById('control-panel');
      const buttons = [...panel.querySelectorAll('button')];
      const available = buttons.filter(button => !button.disabled);
      const before = buttons.map(button => getComputedStyle(button).opacity);
      panel.dataset.sending = 'true';
      available.forEach(button => {
        button.dataset.commandLocked = 'true';
        button.disabled = true;
      });
      const after = buttons.map(button => getComputedStyle(button).opacity);
      available.forEach(button => {
        button.disabled = false;
        delete button.dataset.commandLocked;
      });
      panel.dataset.sending = 'false';
      return buttons.map((button, index) => ({id: button.id, before: before[index], after: after[index]}));
    }""")
    for item in result:
        if item['after'] != item['before']:
            errors.append(f"{case}/{item['id']}: opacity flashes from {item['before']} to {item['after']} while sending")


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


def check_account_forms(page, case, errors):
    page.evaluate("""() => {
      document.getElementById('tab-account').hidden = false;
      document.getElementById('create-account-section').hidden = false;
      document.getElementById('wifi-settings-section').hidden = false;
      document.getElementById('operator-management-section').hidden = false;
      document.getElementById('operator-list').innerHTML = '<li class="operator-row"><strong>operator@example.com</strong><small>UID: kpR6QTZJUDPe7p4j7Jj7heJTDuf2</small><span class="operator-state">Đang có quyền</span><button class="button" type="button">Thu hồi quyền</button></li>';
      document.getElementById('wifi-saved-list').innerHTML = '<li data-active="true">Viet</li><li>DuPhong</li>';
      document.getElementById('wifi-settings-status').textContent = 'Cần nạp firmware hỗ trợ nhiều mạng Wi-Fi một lần.';
      document.getElementById('account-password').value = 'temporary-password-123';
      document.getElementById('account-confirm').value = 'temporary-password-123';
      document.getElementById('new-password').value = 'new-password-123';
      document.getElementById('account-current-email').textContent = 'owner-with-long-email@example-company-domain.com';
      document.getElementById('tab-account').click();
      window.scrollTo(0, 0);
    }""")
    def geometry():
        return page.evaluate("""() => {
          const rect = id => {
            const box = document.getElementById(id).getBoundingClientRect();
            return {top: box.top + scrollY, bottom: box.bottom + scrollY, height: box.height, left: box.left, right: box.right, width: box.width};
          };
          return {
            cards: [rect('create-account-section'), rect('change-password-form')],
            layout: Object.fromEntries(['create-account-section', 'wifi-settings-section', 'operator-management-section'].map(id => [id, rect(id)])),
            passwordCard: (() => { const box = document.querySelector('#change-password-form').closest('.account-card').getBoundingClientRect(); return {top: box.top + scrollY, bottom: box.bottom + scrollY, height: box.height, left: box.left, right: box.right}; })(),
            operatorList: rect('operator-list'),
            wifiForm: rect('wifi-settings-form'),
            wifiList: rect('wifi-saved-list'),
            wifiText: ['h3', 'p.subtle', '.wifi-list-heading', '.wifi-saved-list'].map(selector => {
              const range = document.createRange();
              range.selectNodeContents(document.querySelector('#wifi-settings-section ' + selector));
              const box = range.getBoundingClientRect();
              return {top: box.top + scrollY, bottom: box.bottom + scrollY};
            }),
            columns: Object.fromEntries(['create-account-section', 'wifi-settings-section', 'operator-management-section'].map(id => { const box = document.getElementById(id).getBoundingClientRect(); return [id, {left: box.left, right: box.right}]; })),
            operatorButton: (() => { const box = document.querySelector('.operator-row .button').getBoundingClientRect(); return {left: box.left, right: box.right}; })(),
            buttons: [rect('create-account-button'), rect('change-password-button')],
            inputs: [rect('account-password'), rect('new-password')],
            footer: document.querySelector('footer').getBoundingClientRect().top + scrollY,
            scrollY,
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          };
        }""")
    before = geometry()
    create = before['layout']['create-account-section']
    wifi = before['layout']['wifi-settings-section']
    operator = before['layout']['operator-management-section']
    password = before['passwordCard']
    if '1280px' in case:
        if abs(create['top'] - password['top']) > TOLERANCE:
            errors.append(f"{case}/account: account forms do not align")
        if not (max(create['bottom'], password['bottom']) < operator['top'] + TOLERANCE and operator['bottom'] < wifi['top'] + TOLERANCE):
            errors.append(f"{case}/account: access and Wi-Fi panels must follow the forms")
        if abs(operator['left'] - create['left']) > TOLERANCE or abs(operator['right'] - password['right']) > TOLERANCE or abs(wifi['right'] - password['right']) > TOLERANCE:
            errors.append(f"{case}/account: lower panels do not fill the aligned content width")
        if before['operatorList']['left'] < operator['left'] + operator['width'] * 0.45 or before['wifiForm']['left'] < wifi['left'] + wifi['width'] * 0.45:
            errors.append(f"{case}/account: lists and settings form do not use the right column")
        for upper, lower in zip(before['wifiText'], before['wifiText'][1:]):
            if lower['top'] - upper['bottom'] > 28:
                errors.append(f"{case}/account: Wi-Fi summary has excessive vertical gaps")
                break
    else:
        if not (create['bottom'] < password['top'] + TOLERANCE and password['bottom'] < operator['top'] + TOLERANCE and operator['bottom'] < wifi['top'] + TOLERANCE):
            errors.append(f"{case}/account: cards must stack in reading order on phones")
        if before['wifiForm']['top'] < before['wifiList']['bottom'] - TOLERANCE:
            errors.append(f"{case}/account: Wi-Fi form overlaps saved networks on phones")
    if before['operatorButton']['right'] > before['columns']['operator-management-section']['right'] + TOLERANCE:
        errors.append(f"{case}/account: revoke button overflows its card")
    if before['cards'][0]['bottom'] - before['buttons'][0]['bottom'] > 30:
        errors.append(f"{case}/account: excessive blank space below create button")
    for checkbox in ('show-account-passwords', 'show-change-passwords'):
        page.locator(f'#{checkbox}').evaluate('input => input.click()')
        after = geometry()
        for key in ('cards', 'buttons', 'inputs'):
            for index, (old, new) in enumerate(zip(before[key], after[key])):
                for dimension in ('top', 'bottom', 'height'):
                    if abs(old[dimension] - new[dimension]) > TOLERANCE:
                        errors.append(f"{case}/account/{checkbox}: {key}[{index}].{dimension} shifted")
        if abs(before['footer'] - after['footer']) > TOLERANCE or before['scrollY'] != after['scrollY']:
            errors.append(f"{case}/account/{checkbox}: page position shifted")
        if after['overflow'] > TOLERANCE:
            errors.append(f"{case}/account/{checkbox}: horizontal overflow")
        page.locator(f'#{checkbox}').evaluate('input => input.click()')
    page.evaluate("""() => {
      for (const id of ['create-account-section', 'operator-management-section', 'wifi-settings-section']) {
        document.getElementById(id).hidden = true;
      }
    }""")
    operator_only = page.evaluate("""() => {
      const grid = document.querySelector('.account-grid').getBoundingClientRect();
      const card = document.getElementById('change-password-form').closest('.account-card').getBoundingClientRect();
      return {leftGap: card.left - grid.left, rightGap: grid.right - card.right,
              overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth};
    }""")
    if abs(operator_only['leftGap'] - operator_only['rightGap']) > 12:
        errors.append(f"{case}/account: password card is off-center for a non-owner")
    if operator_only['overflow'] > TOLERANCE:
        errors.append(f"{case}/account: non-owner page overflows horizontally")


def run_case(browser, url, width, font_name, font_css, theme, errors):
    page = browser.new_page(viewport={"width": width, "height": 700})
    case = f"{width}px/{font_name}/{theme}"
    try:
        page.goto(url, wait_until="networkidle")
        page.locator("#dashboard").wait_for(state="visible")
        if page.locator("#notice-details").count():
            errors.append(f"{case}: obsolete device notice is still visible")
        page.evaluate("theme => document.documentElement.dataset.theme = theme", theme)
        if font_css:
            page.add_style_tag(content=font_css)
        page.evaluate("window.scrollTo(0, 180)")
        baseline = snapshot(page)
        visual_safe = visual_state(page) if width == 1280 and font_name == "normal" else None
        if baseline["overflow"] > TOLERANCE or baseline["clippedDescriptions"]:
            errors.append(f"{case}/safe: overflow or clipped text: {baseline}")
        check_sending_visuals(page, case, errors)

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
            if visual_safe and state == "gas":
                visual_gas = visual_state(page)
                for key in ("fanRow", "fanRowIcon", "ledRow", "ledRowIcon", "buzzerRow", "buzzerRowIcon"):
                    if visual_gas[key] == visual_safe[key]:
                        errors.append(f"{case}/{state}: {key} has no visible color change")
                if visual_gas["fanAnimation"] == "none":
                    errors.append(f"{case}/{state}: spinning fan has no motion")
                if visual_gas["ledAnimation"] == "none" or visual_gas["buzzerAnimation"] == "none":
                    errors.append(f"{case}/{state}: active LED or buzzer has no motion")
            if visual_safe and state == "gas+flame":
                combined = visual_state(page)
                if combined["fanRowIcon"] != visual_safe["fanRowIcon"] or combined["fanAnimation"] != "none":
                    errors.append(f"{case}/{state}: stopped fan still looks active")

        page.locator("#fan-on").evaluate("button => button.click()")
        compare(baseline, snapshot(page), f"{case}/manual-fan", errors)
        if visual_safe:
            manual = visual_state(page)
            if manual["fanRowIcon"] == visual_safe["fanRowIcon"] or manual["ledRow"] != visual_safe["ledRow"]:
                errors.append(f"{case}/manual-fan: fan color did not change independently of LED")
            page.emulate_media(reduced_motion="reduce")
            reduced = visual_state(page)
            if reduced["fanAnimation"] != "none" or reduced["ledAnimation"] != "none":
                errors.append(f"{case}/manual-fan: motion ignores reduced-motion preference")
        page.locator("#fan-off").evaluate("button => button.click()")

        # Selecting a mode must not move its siblings or resize the button group.
        for group, ids in (
            ('Chế độ LED hai màu', ('led-red', 'led-green', 'led-off', 'led-auto')),
            ('Chế độ còi', ('buzzerMode-on', 'buzzerMode-off', 'buzzerMode-auto')),
            ('Điều khiển quạt', ('fan-off', 'fan-on', 'fan-auto')),
        ):
            check_button_geometry(page, f'.segmented[aria-label="{group}"] .segment', ids, f"{case}/{group}", errors)
        check_button_geometry(page, '#dashboard-tabs .pivot-item:not([hidden])',
                              ('tab-history', 'tab-overview'), f"{case}/tabs", errors)
        page.locator('#tab-history').evaluate('button => button.click()')
        check_button_geometry(page, '.segmented[aria-label="Lọc lịch sử hoạt động"] .segment',
                              ('history-filter-system', 'history-filter-user', 'history-filter-all'),
                              f"{case}/history-filters", errors)
        page.locator('#tab-overview').evaluate('button => button.click()')

        # Pending labels must fit in the existing control rows before any telemetry arrives.
        pending = page.evaluate("""() => {
          const ids = ['led-state', 'buzzerMode-state', 'fan-mode'];
          return Object.fromEntries(ids.map(id => [id, document.getElementById(id).textContent]));
        }""")
        page.evaluate("""() => {
          document.getElementById('led-state').textContent = 'Chờ chuyển xanh';
          document.getElementById('buzzerMode-state').textContent = 'Chờ tự động';
          document.getElementById('fan-mode').textContent = 'Chờ tự động';
        }""")
        compare(baseline, snapshot(page), f"{case}/pending-controls", errors)
        page.evaluate("""originals => {
          for (const [id, value] of Object.entries(originals)) document.getElementById(id).textContent = value;
        }""", pending)

        # These live descriptions are currently absent from demo controls, so exercise their text lengths.
        originals = page.evaluate("() => Object.fromEntries([...document.querySelectorAll('.metric-card p')].map(p => [p.id, p.textContent]))")
        for state, replacements in (
            ("warmup", {"gas-alarm-detail": "MQ-2 đang làm nóng (~1 phút sau khi cấp nguồn)"}),
            ("stale", {key: "Không có dữ liệu mới" for key in
                       ("flame-detail", "gas-alarm-detail")}),
        ):
            page.evaluate("replacements => { for (const [id, value] of Object.entries(replacements)) document.getElementById(id).textContent = value; }", replacements)
            compare(baseline, snapshot(page), f"{case}/{state}", errors)
            page.evaluate("originals => { for (const [id, value] of Object.entries(originals)) document.getElementById(id).textContent = value; }", originals)

        if width in (1280, 390) and font_name == "normal":
            check_account_forms(page, case, errors)

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
                        run_case(browser, url, width, font_name, font_css, "light", errors)
                for width in (1280, 390):
                    run_case(browser, url, width, "normal", "", "dark", errors)
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
    print(f"PASS: {len(WIDTHS) * len(FONTS) + 2} viewport/font/theme combinations; safety states, button groups, manual fan, LED colors, reduced motion, and stable layout")


if __name__ == "__main__":
    main()
