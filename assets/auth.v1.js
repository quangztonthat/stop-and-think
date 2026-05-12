// Stop & Think — Frontend auth helper.
// Cache user trong sessionStorage (chỉ trong tab hiện tại) để khỏi gọi /api/auth/me
// mỗi lần đổi trang. Server cookie HttpOnly mới là source of truth.

(function () {
  const CACHE_KEY = 'st_user_v1';
  const CACHE_TTL_MS = 5 * 60 * 1000; // 5 phút

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

    /** Render user state vào header nav. Gọi sau khi DOM ready. */
    async renderNav({ selector = '.nav-links', insertBefore = null } = {}) {
      const nav = document.querySelector(selector);
      if (!nav || nav.dataset.authMounted) return;
      nav.dataset.authMounted = '1';

      const { user } = await auth.getUser();
      const slot = document.createElement('span');
      slot.className = 'nav-auth-slot';
      slot.style.cssText = 'display:inline-flex;align-items:center;gap:14px;';

      if (user) {
        const first = (user.name || user.email || '').split(/\s+/).pop();
        slot.innerHTML = `
          <a href="/tai-khoan" class="nav-auth-user" title="${escAttr(user.email)}">${escHtml(first)}</a>
          <a href="#" class="nav-auth-logout">Đăng xuất</a>
        `;
        slot.querySelector('.nav-auth-logout').addEventListener('click', (e) => {
          e.preventDefault();
          auth.logout();
        });
      } else {
        slot.innerHTML = `<a href="/dang-nhap" class="nav-auth-login">Đăng nhập</a>`;
      }

      const ref = insertBefore ? nav.querySelector(insertBefore) : null;
      if (ref) nav.insertBefore(slot, ref);
      else nav.appendChild(slot);
    }
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

  window.stAuth = auth;
})();
