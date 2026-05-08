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
})();
