// Stop & Think — Frontend auth helper.
// Cache user trong sessionStorage (chỉ trong tab hiện tại) để khỏi gọi /api/auth/me
// mỗi lần đổi trang. Server cookie HttpOnly mới là source of truth.
//
// Tự mount vào .nav-actions trước .nav-menu-btn (avatar khi logged-in, link "Đăng nhập" khi guest).
// Inject CSS tự đóng gói — không cần sửa CSS từng page.

(function () {
  'use strict';

  const CACHE_KEY = 'st_user_v1';
  const CACHE_TTL_MS = 5 * 60 * 1000; // 5 phút

  // ─── CSS injected once per page ───
  const CSS = `
    .nav-auth-slot { display: inline-flex; align-items: center; }
    .nav-auth-login {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--ink, #1a1410);
      text-decoration: none;
      padding: 6px 10px;
      border: 1px solid var(--ink, #1a1410);
      transition: background 0.2s, color 0.2s;
    }
    .nav-auth-login:hover {
      background: var(--ink, #1a1410);
      color: var(--paper, #f5ede0);
    }
    .nav-auth-avatar {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 34px;
      height: 34px;
      border-radius: 50%;
      background: var(--rust, #8b3a2b);
      color: var(--paper, #f5ede0);
      font-family: 'Fraunces', Georgia, serif;
      font-weight: 600;
      font-size: 15px;
      text-decoration: none;
      overflow: hidden;
      position: relative;
      border: 2px solid transparent;
      transition: border-color 0.2s, transform 0.15s;
      flex-shrink: 0;
    }
    .nav-auth-avatar:hover {
      border-color: var(--rust, #8b3a2b);
      transform: scale(1.05);
    }
    .nav-auth-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .nav-auth-avatar .initial {
      line-height: 1;
      user-select: none;
    }
    /* dark mode tweak */
    [data-theme="dark"] .nav-auth-login { color: var(--paper, #f5ede0); border-color: var(--paper, #f5ede0); }
    [data-theme="dark"] .nav-auth-login:hover { background: var(--paper, #f5ede0); color: var(--ink, #1a1410); }
    /* mobile spacing */
    @media (max-width: 640px) {
      .nav-auth-avatar { width: 30px; height: 30px; font-size: 13px; }
      .nav-auth-login { padding: 5px 8px; font-size: 10px; }
    }
  `;

  function injectCss() {
    if (document.getElementById('st-auth-css')) return;
    const s = document.createElement('style');
    s.id = 'st-auth-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  // ─── Public API ───
  const auth = {
    /** Trả về { user } | { user: null }. Cache trong tab. */
    async getUser({ force = false } = {}) {
      if (!force) {
        const cached = readCache();
        if (cached) return { user: cached.user };
      }
      try {
        const res = await fetch('/api/auth/me', {
          credentials: 'include',
          headers: { 'accept': 'application/json' }
        });
        if (!res.ok) {
          writeCache(null);
          return { user: null };
        }
        const data = await res.json();
        writeCache(data.user || null);
        return { user: data.user || null };
      } catch (e) {
        return { user: null };
      }
    },

    async logout() {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          credentials: 'include'
        });
      } catch (_) { /* ignore */ }
      clearCache();
      window.location.href = '/';
    },

    clearCache,

    /**
     * Mount auth UI (avatar hoặc Đăng nhập link) vào .nav-actions trước .nav-menu-btn.
     * Idempotent: gọi nhiều lần không sao.
     */
    async mount() {
      const actions = document.querySelector('.nav-actions');
      if (!actions || actions.dataset.authMounted) return;
      actions.dataset.authMounted = '1';

      injectCss();

      const { user } = await auth.getUser();
      const slot = document.createElement('span');
      slot.className = 'nav-auth-slot';

      if (user) {
        const display = (user.name || user.email || '?').trim();
        // First letter of last word in name (e.g. "Quang Ton That" → "T")
        const last = display.split(/\s+/).pop() || '';
        const initial = (last[0] || display[0] || '?').toUpperCase();
        const hasAvatar = !!(user.avatar_url && /^https?:\/\//.test(user.avatar_url));
        slot.innerHTML = `
          <a href="/tai-khoan"
             class="nav-auth-avatar"
             title="${escAttr(display + ' — ' + (user.email || ''))}"
             aria-label="Tài khoản: ${escAttr(display)}">
            ${hasAvatar
              ? `<img src="${escAttr(user.avatar_url)}" alt="" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'initial',textContent:'${escAttr(initial)}'}))">`
              : `<span class="initial">${escHtml(initial)}</span>`}
          </a>
        `;
      } else {
        slot.innerHTML = `<a href="/dang-nhap" class="nav-auth-login">Đăng nhập</a>`;
      }

      // Insert before .nav-menu-btn nếu có; nếu không, append cuối .nav-actions
      const menuBtn = actions.querySelector('.nav-menu-btn');
      if (menuBtn) {
        actions.insertBefore(slot, menuBtn);
      } else {
        actions.appendChild(slot);
      }
    },

    /** Legacy alias — giữ API cũ phòng có chỗ gọi. */
    async renderNav() { return auth.mount(); }
  };

  // ─── cache helpers ───
  function readCache() {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || typeof obj.t !== 'number') return null;
      if (Date.now() - obj.t > CACHE_TTL_MS) return null;
      return obj;
    } catch (_) { return null; }
  }
  function writeCache(user) {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ user, t: Date.now() }));
    } catch (_) { /* private mode */ }
  }
  function clearCache() {
    try { sessionStorage.removeItem(CACHE_KEY); } catch (_) {}
  }

  // ─── escape ───
  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function escAttr(s) { return escHtml(s); }

  // ─── Auto-mount ───
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', auth.mount);
  } else {
    auth.mount();
  }

  window.stAuth = auth;
})();
