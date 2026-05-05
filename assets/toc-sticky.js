/**
 * Sticky Table of Contents — auto-inject vào trang sách
 * Tự động:
 *   - Tìm section có id + section-label hoặc h2
 *   - Build ToC sidebar bên trái
 *   - Highlight section đang xem (scroll-spy)
 *   - Mobile (≤1100px): collapse thành dropdown ở top
 *
 * Cách dùng: thêm <script src="/assets/toc-sticky.js" defer></script> vào trang
 */
(function () {
  if (window._tocLoaded) return;
  window._tocLoaded = true;

  // 1. Inject CSS
  const css = `
    .toc-sticky {
      position: fixed;
      top: 100px;
      left: 24px;
      width: 220px;
      max-height: calc(100vh - 140px);
      overflow-y: auto;
      z-index: 100;
      font-family: 'JetBrains Mono', monospace;
      padding: 0;
    }
    .toc-sticky::-webkit-scrollbar { width: 4px; }
    .toc-sticky::-webkit-scrollbar-thumb { background: rgba(196,146,60,0.3); border-radius: 2px; }

    .toc-label {
      color: #8b3a2b;
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 0.25em;
      margin-bottom: 14px;
      padding-left: 16px;
    }
    .toc-list {
      list-style: none;
      margin: 0;
      padding: 0;
      border-left: 1px solid rgba(196, 146, 60, 0.2);
    }
    .toc-list li { margin: 0; }
    .toc-list a {
      display: block;
      padding: 7px 0 7px 16px;
      color: #4a3f33;
      text-decoration: none;
      border-left: 2px solid transparent;
      margin-left: -1px;
      transition: all 0.18s ease;
      font-size: 11px;
      line-height: 1.45;
      letter-spacing: 0.02em;
      text-transform: uppercase;
    }
    .toc-list a:hover {
      color: #1a1410;
    }
    .toc-list a.active {
      color: #8b3a2b;
      border-left-color: #8b3a2b;
      font-weight: 500;
    }

    /* Tablet & mobile: collapse to top dropdown */
    @media (max-width: 1280px) {
      .toc-sticky {
        position: sticky;
        top: 16px;
        left: auto;
        width: auto;
        max-width: 100%;
        margin: 16px auto 32px;
        padding: 12px 16px;
        background: #f5ede0;
        border: 1px solid rgba(26,20,16,0.12);
        border-radius: 6px;
        max-height: none;
      }
      .toc-label { display: inline-block; margin: 0 12px 0 0; padding: 0; }
      .toc-list {
        display: inline-flex;
        flex-wrap: wrap;
        gap: 4px 12px;
        border-left: none;
        vertical-align: middle;
      }
      .toc-list a {
        padding: 4px 8px;
        border-left: none;
        border-radius: 4px;
        margin-left: 0;
        text-transform: none;
        font-size: 11px;
      }
      .toc-list a.active {
        background: #8b3a2b;
        color: #f5ede0;
      }
    }
    @media (max-width: 700px) {
      .toc-sticky { font-size: 10px; }
      .toc-list a { font-size: 10px; padding: 3px 6px; }
    }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // 2. Find sections with id + a label/title
  const sections = Array.from(document.querySelectorAll('section[id]')).filter(s => {
    const label = s.querySelector('.section-label, h2, .hero-title');
    return label && label.textContent.trim();
  });

  if (sections.length < 3) return; // Not worth showing

  // 3. Build ToC items
  const items = sections.map(s => {
    const id = s.id;
    // Pick best short label
    const labelEl = s.querySelector('.section-label');
    const h2 = s.querySelector('h2');
    let text = '';
    if (labelEl) {
      // "Framework 01 / Vòng lặp ..." → take part after "/"
      const raw = labelEl.textContent.trim();
      const parts = raw.split('/');
      text = parts.length > 1 ? parts[1].trim() : raw;
    } else if (h2) {
      text = h2.textContent.replace(/\s+/g, ' ').trim();
      // Trim long h2 to ~40 chars
      if (text.length > 42) text = text.slice(0, 40).trim() + '…';
    }
    return { id, text };
  }).filter(i => i.text);

  if (!items.length) return;

  // 4. Build aside element
  const aside = document.createElement('aside');
  aside.className = 'toc-sticky';
  aside.innerHTML = `
    <div class="toc-label">— MỤC LỤC</div>
    <ul class="toc-list">
      ${items.map(i => `<li><a href="#${i.id}">${i.text}</a></li>`).join('')}
    </ul>
  `;

  // Insert as first child of body so it's positioned independently
  document.body.insertBefore(aside, document.body.firstChild);

  // 5. Smooth scroll on click
  aside.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      const id = a.getAttribute('href').slice(1);
      const target = document.getElementById(id);
      if (target) {
        window.scrollTo({ top: target.offsetTop - 40, behavior: 'smooth' });
        history.replaceState(null, '', '#' + id);
      }
    });
  });

  // 6. Scroll-spy
  const links = Array.from(aside.querySelectorAll('a'));
  function update() {
    const scroll = window.scrollY + 120;
    let activeId = items[0].id;
    for (const it of items) {
      const el = document.getElementById(it.id);
      if (el && el.offsetTop <= scroll) activeId = it.id;
    }
    links.forEach(a => {
      a.classList.toggle('active', a.getAttribute('href') === '#' + activeId);
    });
  }
  let raf;
  window.addEventListener('scroll', () => {
    if (raf) return;
    raf = requestAnimationFrame(() => { update(); raf = null; });
  }, { passive: true });
  update();
})();
