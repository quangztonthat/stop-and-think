/**
 * Nav Scroll-Spy — highlight section đang xem trên top nav
 *
 * Đọc onclick="scrollTo2('xxx')" để biết link → section nào,
 * watch scroll position → toggle .active class trên link tương ứng.
 *
 * CSS cần có sẵn: .nav-links a.active { color: var(--accent); ... }
 */
(function () {
  if (window._navSpyLoaded) return;
  window._navSpyLoaded = true;

  function init() {
    const navLinks = document.querySelectorAll('.nav-links a[onclick]');
    if (!navLinks.length) return;

    // Map: link → sectionId
    const map = [];
    navLinks.forEach(link => {
      const onclick = link.getAttribute('onclick') || '';
      // Try: scrollTo2('id') OR getElementById('id')
      let m = onclick.match(/scrollTo2\(['"]([^'"]+)['"]\)/);
      if (!m) m = onclick.match(/getElementById\(['"]([^'"]+)['"]\)/);
      if (m) {
        const id = m[1];
        const el = document.getElementById(id);
        if (el) map.push({ link, el, id });
      }
    });
    if (!map.length) return;

    function update() {
      const scroll = window.scrollY + 120; // offset cho nav bar
      let active = map[0];
      for (const item of map) {
        if (item.el.offsetTop <= scroll) active = item;
      }
      navLinks.forEach(a => a.classList.remove('active'));
      if (active) active.link.classList.add('active');
    }

    let raf;
    window.addEventListener('scroll', () => {
      if (raf) return;
      raf = requestAnimationFrame(() => { update(); raf = null; });
    }, { passive: true });
    update();
  }

  // Highlight section when arriving via #hash (from search)
  function highlightTargetFromHash() {
    const hash = location.hash.slice(1);
    if (!hash) return;
    const target = document.getElementById(hash);
    if (!target) return;
    // Brief pulse highlight
    const original = target.style.transition;
    target.style.transition = 'background 0.4s ease';
    target.style.background = 'rgba(196, 146, 60, 0.18)';
    setTimeout(() => {
      target.style.background = '';
      setTimeout(() => target.style.transition = original, 500);
    }, 1200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { init(); highlightTargetFromHash(); });
  } else {
    init();
    highlightTargetFromHash();
  }
  window.addEventListener('hashchange', highlightTargetFromHash);
})();
