/* Stop & Think — theme toggle (dark/light) */
(function () {
  'use strict';

  // Note: early color-scheme detection happens via inline script in <head>
  // before this file loads. This file handles the toggle button + click.

  const KEY = 'st-theme';

  function getCurrent() {
    return document.documentElement.getAttribute('data-theme') || 'light';
  }

  function setTheme(t, persist) {
    if (t === 'system') {
      localStorage.removeItem(KEY);
      const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    } else {
      document.documentElement.setAttribute('data-theme', t);
      if (persist !== false) localStorage.setItem(KEY, t);
    }
    updateButtonLabel();
  }

  function toggle() {
    const next = getCurrent() === 'dark' ? 'light' : 'dark';
    setTheme(next, true);
  }

  function updateButtonLabel() {
    const btn = document.querySelector('.theme-toggle');
    if (!btn) return;
    const isDark = getCurrent() === 'dark';
    btn.setAttribute('aria-label', isDark ? 'Chuyển sang sáng' : 'Chuyển sang tối');
    btn.setAttribute('title', isDark ? 'Sáng' : 'Tối');
  }

  function buildButton() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'theme-toggle';
    btn.innerHTML = `
      <svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
      </svg>
      <svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="4"/>
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
      </svg>
    `;
    btn.addEventListener('click', toggle);
    return btn;
  }

  function injectButton() {
    if (document.querySelector('.theme-toggle')) return;

    // Try common nav containers used across the site
    const nav =
      document.querySelector('.nav') ||
      document.querySelector('.nav-bar') ||
      document.querySelector('header nav') ||
      document.querySelector('header');

    if (!nav) return;

    // Prefer placing next to search bar if present
    const searchBar = nav.querySelector('.snst-search-bar');
    const btn = buildButton();
    if (searchBar && searchBar.parentNode) {
      searchBar.parentNode.insertBefore(btn, searchBar.nextSibling);
    } else {
      nav.appendChild(btn);
    }
    updateButtonLabel();
  }

  // Inject after DOM ready (works whether script is defer or end-of-body)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectButton);
  } else {
    injectButton();
  }

  // Re-inject if library.js mutates nav after-the-fact (it adds search bar)
  const obs = new MutationObserver(() => {
    if (!document.querySelector('.theme-toggle')) injectButton();
  });
  if (document.body) {
    obs.observe(document.body, { childList: true, subtree: true });
    // Stop observing after 5s (search bar should be in by then)
    setTimeout(() => obs.disconnect(), 5000);
  }

  // Listen to OS-level changes when user hasn't manually picked a theme
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener && mq.addEventListener('change', (e) => {
      if (!localStorage.getItem(KEY)) {
        document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
        updateButtonLabel();
      }
    });
  }

  // Expose for debug
  window.STTheme = { set: setTheme, toggle: toggle, get: getCurrent };
})();
