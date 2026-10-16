// Giao diện sáng/tối kiểu Windows 11: Theo hệ thống → Sáng → Tối.
(() => {
  const KEY = 'safety-theme';
  const NAMES = { system: 'theo hệ thống', light: 'sáng', dark: 'tối' };
  const root = document.documentElement;
  let theme = 'system';
  try { theme = localStorage.getItem(KEY) || 'system'; } catch { /* Không có bộ nhớ: theo hệ thống. */ }
  if (!(theme in NAMES)) theme = 'system';

  function apply() {
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    const button = document.getElementById('theme-toggle');
    if (button) button.title = `Giao diện: ${NAMES[theme]} (nhấn để đổi)`;
  }
  apply();

  document.addEventListener('DOMContentLoaded', () => {
    apply();
    document.getElementById('theme-toggle')?.addEventListener('click', () => {
      theme = theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system';
      try { localStorage.setItem(KEY, theme); } catch { /* Chỉ áp dụng cho phiên này. */ }
      apply();
    });
  });
})();
