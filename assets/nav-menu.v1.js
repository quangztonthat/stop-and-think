/* Stop & Think — nav menu dropdown
   Shared toggle handlers for consolidated nav (Menu + Lang + Theme)
   v1 · 2026-05-08
*/
(function () {
  'use strict';

  function toggleNavMenu(e) {
    if (e) e.stopPropagation();
    var dd = document.getElementById('navDropdown');
    var btn = document.querySelector('.nav-menu-btn');
    if (!dd || !btn) return;
    var open = dd.classList.toggle('open');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    dd.setAttribute('aria-hidden', open ? 'false' : 'true');
  }

  function closeNavMenu() {
    var dd = document.getElementById('navDropdown');
    var btn = document.querySelector('.nav-menu-btn');
    if (!dd || !btn) return;
    dd.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
    dd.setAttribute('aria-hidden', 'true');
  }

  // Click outside → close
  document.addEventListener('click', function (e) {
    var dd = document.getElementById('navDropdown');
    var btn = document.querySelector('.nav-menu-btn');
    if (!dd || !btn) return;
    if (!dd.classList.contains('open')) return;
    if (dd.contains(e.target) || btn.contains(e.target)) return;
    closeNavMenu();
  });

  // ESC key → close
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeNavMenu();
  });

  // Expose globally so inline onclick handlers work
  window.toggleNavMenu = toggleNavMenu;
  window.closeNavMenu = closeNavMenu;

  // ─── Auth state injection ─────────────────────────────────────────────
  // Mỗi page có #navDropdown — fetch /api/auth/me 1 lần (cache sessionStorage)
  // rồi append "Đăng nhập" hoặc "Tài khoản / Đăng xuất" vào cuối dropdown.
  // KHÔNG cần sửa 48 HTML pages — chỉ cần file này được load (đã defer ở mọi page).

  var AUTH_CACHE = 'st_user_v1';
  var AUTH_TTL = 5 * 60 * 1000;

  function readAuthCache() {
    try {
      var raw = sessionStorage.getItem(AUTH_CACHE);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (!obj || typeof obj.t !== 'number') return null;
      if (Date.now() - obj.t > AUTH_TTL) return null;
      return obj;
    } catch (e) { return null; }
  }
  function writeAuthCache(user) {
    try { sessionStorage.setItem(AUTH_CACHE, JSON.stringify({ user: user, t: Date.now() })); }
    catch (e) {}
  }

  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function renderAuth(user) {
    var dd = document.getElementById('navDropdown');
    if (!dd || dd.dataset.authMounted === '1') return;
    dd.dataset.authMounted = '1';

    var sep = document.createElement('div');
    sep.setAttribute('aria-hidden', 'true');
    sep.style.cssText = 'height:1px;margin:8px 0;background:currentColor;opacity:.15';
    dd.appendChild(sep);

    if (user) {
      var firstName = (user.name || user.email || '').split(/\s+/)[0] || 'Tài khoản';
      var aAcc = document.createElement('a');
      aAcc.href = '/tai-khoan';
      aAcc.textContent = firstName;
      aAcc.title = user.email || '';
      dd.appendChild(aAcc);

      var aOut = document.createElement('a');
      aOut.href = '/api/auth/logout';
      aOut.textContent = 'Đăng xuất';
      aOut.addEventListener('click', function (ev) {
        ev.preventDefault();
        try { sessionStorage.removeItem(AUTH_CACHE); } catch (e) {}
        fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
          .catch(function () {})
          .then(function () { window.location.href = '/'; });
      });
      dd.appendChild(aOut);
    } else {
      var aIn = document.createElement('a');
      aIn.href = '/dang-nhap';
      aIn.textContent = 'Đăng nhập';
      dd.appendChild(aIn);

      var aUp = document.createElement('a');
      aUp.href = '/dang-ky';
      aUp.textContent = 'Đăng ký';
      dd.appendChild(aUp);
    }
  }

  function loadAuthState() {
    if (!document.getElementById('navDropdown')) return;

    var cached = readAuthCache();
    if (cached) { renderAuth(cached.user); return; }

    fetch('/api/auth/me', { credentials: 'include', headers: { accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : { user: null }; })
      .then(function (data) {
        var u = (data && data.user) || null;
        writeAuthCache(u);
        renderAuth(u);
      })
      .catch(function () { renderAuth(null); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadAuthState);
  } else {
    loadAuthState();
  }
})();
