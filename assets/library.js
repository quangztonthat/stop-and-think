// Stop & Think — search overlay + related books component
// Loads after books-data.js (window.STOP_AND_THINK_BOOKS available)

(function() {
  if (typeof window.STOP_AND_THINK_BOOKS === 'undefined') {
    console.warn('books-data.js not loaded');
    return;
  }
  const BOOKS = window.STOP_AND_THINK_BOOKS;

  // ─── Inject styles (scoped, won't conflict with page palette) ───
  const css = `
.snst-search-bar {
  display: inline-flex; align-items: center; gap: 8px;
  background: rgba(26, 20, 16, 0.06);
  border: 1px solid rgba(26, 20, 16, 0.2);
  padding: 7px 12px; cursor: pointer;
  font-family: inherit; color: inherit;
  transition: all 0.2s; min-width: 200px;
  border-radius: 0;
}
.snst-search-bar:hover { background: rgba(26, 20, 16, 0.1); border-color: rgba(26, 20, 16, 0.4); }
.snst-search-bar svg { width: 14px; height: 14px; flex-shrink: 0; opacity: 0.6; }
.snst-search-bar-text { flex: 1; text-align: left; font-size: 13px; opacity: 0.6; font-family: 'Fraunces', Georgia, serif; }
.snst-search-bar kbd {
  font-family: 'JetBrains Mono', monospace; font-size: 10px;
  padding: 2px 6px; background: rgba(26, 20, 16, 0.08);
  border: 1px solid rgba(26, 20, 16, 0.2); border-radius: 0;
  color: inherit; opacity: 0.7;
}
@media (max-width: 700px) {
  .snst-search-bar { min-width: 0; padding: 7px 9px; }
  .snst-search-bar-text { display: none; }
  .snst-search-bar kbd { display: none; }
}

.snst-overlay {
  position: fixed; inset: 0; background: rgba(26, 20, 16, 0.85); backdrop-filter: blur(8px);
  z-index: 9999; display: none; align-items: flex-start; justify-content: center;
  padding: 80px 16px 24px; overflow-y: auto;
}
.snst-overlay.snst-open { display: flex; }
.snst-modal {
  background: #f5ede0; max-width: 720px; width: 100%; border: 2px solid #1a1410;
  font-family: 'Fraunces', Georgia, serif;
}
.snst-modal-head {
  display: flex; align-items: center; gap: 12px; padding: 16px 20px;
  border-bottom: 1.5px solid #1a1410; background: #ebe1cf;
}
.snst-modal-head svg { width: 20px; height: 20px; flex-shrink: 0; }
.snst-input {
  flex: 1; border: none; background: transparent; font-family: 'Fraunces', Georgia, serif;
  font-size: 20px; color: #1a1410; outline: none;
}
.snst-input::placeholder { color: #4a3f33; opacity: 0.6; }
.snst-close {
  background: none; border: 1px solid #1a1410; padding: 4px 10px; cursor: pointer;
  font-family: 'JetBrains Mono', monospace; font-size: 11px; letter-spacing: 0.1em;
  text-transform: uppercase; color: #1a1410;
}
.snst-close:hover { background: #1a1410; color: #f5ede0; }

.snst-results { max-height: 60vh; overflow-y: auto; padding: 8px 0; }
.snst-result {
  display: flex; gap: 16px; padding: 14px 20px; cursor: pointer;
  border-bottom: 1px solid rgba(26, 20, 16, 0.1); text-decoration: none; color: #1a1410;
  transition: background 0.15s;
}
.snst-result:hover, .snst-result.snst-active { background: #ebe1cf; }
.snst-result mark { background: #c4923c; color: #1a1410; padding: 0 2px; font-weight: 500; }
.snst-result-cover {
  flex-shrink: 0; width: 56px; height: 72px;
  display: flex; flex-direction: column; justify-content: space-between;
  padding: 6px 8px; font-size: 9px; line-height: 1.1;
}
.snst-cover-rust { background: #8b3a2b; color: #f5ede0; }
.snst-cover-navy { background: #2d4a5c; color: #f5ede0; }
.snst-cover-copper { background: #c4923c; color: #1a1410; }
.snst-result-cover-vol { font-family: 'JetBrains Mono', monospace; opacity: 0.7; letter-spacing: 0.1em; }
.snst-result-cover-num { font-family: 'Fraunces', serif; font-weight: 700; font-size: 20px; line-height: 1; }
.snst-result-body { flex: 1; min-width: 0; }
.snst-result-title { font-family: 'Fraunces', serif; font-size: 16px; font-weight: 700; line-height: 1.2; margin-bottom: 4px; }
.snst-result-meta { font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: #8b3a2b; margin-bottom: 4px; }
.snst-result-summary { font-size: 13px; line-height: 1.4; color: #4a3f33; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.snst-empty {
  padding: 32px 20px; text-align: center; color: #4a3f33;
  font-size: 14px; line-height: 1.5;
}
.snst-shortcut {
  padding: 10px 20px; background: #ebe1cf; border-top: 1px solid rgba(26, 20, 16, 0.15);
  font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: 0.1em;
  color: #4a3f33; display: flex; gap: 16px; flex-wrap: wrap;
}
.snst-shortcut kbd {
  background: #f5ede0; border: 1px solid #1a1410; padding: 1px 6px;
  font-family: inherit; font-size: 10px;
}

/* ─── Related books section ─── */
.snst-related {
  padding: 60px 8% 40px; border-top: 2px solid #5e2418;
  background: #ebe1cf;
}
.snst-related-label {
  font-family: 'JetBrains Mono', monospace; font-size: 11px; letter-spacing: 0.2em;
  text-transform: uppercase; color: #8b3a2b; margin-bottom: 16px;
  padding-left: 24px; position: relative;
}
.snst-related-label::before { content: '◆'; position: absolute; left: 0; color: #8b3a2b; }
.snst-related-title {
  font-family: 'Fraunces', serif; font-size: 36px; font-weight: 700;
  line-height: 1.1; letter-spacing: -0.02em; margin-bottom: 36px; color: #1a1410;
}
.snst-related-title em { font-style: normal; color: #8b3a2b; }
.snst-related-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px; }
.snst-related-card {
  background: #f5ede0; border: 1.5px solid #1a1410; text-decoration: none; color: #1a1410;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); display: flex; flex-direction: column;
}
.snst-related-card:hover {
  transform: translate(-3px, -3px); box-shadow: 6px 6px 0 #8b3a2b;
}
.snst-related-cover {
  height: 180px; padding: 20px;
  display: flex; flex-direction: column; justify-content: space-between;
}
.snst-related-cover-num { font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: 0.2em; opacity: 0.7; }
.snst-related-cover-title { font-family: 'Fraunces', serif; font-size: 22px; font-weight: 700; line-height: 1; letter-spacing: -0.02em; }
.snst-related-cover-author { font-family: 'JetBrains Mono', monospace; font-size: 9px; letter-spacing: 0.15em; text-transform: uppercase; opacity: 0.85; }
.snst-related-meta { padding: 16px 20px; border-top: 1.5px solid #1a1410; flex: 1; display: flex; flex-direction: column; }
.snst-related-tag { display: inline-block; font-family: 'JetBrains Mono', monospace; font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase; padding: 2px 6px; border: 1px solid #4a3f33; color: #4a3f33; margin-bottom: 8px; align-self: flex-start; }
.snst-related-summary { font-size: 14px; line-height: 1.5; color: #4a3f33; flex: 1; }
.snst-related-arrow {
  display: flex; justify-content: space-between; align-items: center;
  font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: 0.12em;
  text-transform: uppercase; color: #8b3a2b;
  margin-top: 12px; padding-top: 10px; border-top: 1px dashed rgba(26, 20, 16, 0.2);
}

@media (max-width: 600px) {
  .snst-related { padding: 40px 6% 30px; }
  .snst-related-title { font-size: 28px; }
  .snst-result-summary { -webkit-line-clamp: 1; }
}
`;

  const styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  // ─── Build search overlay ───
  const overlay = document.createElement('div');
  overlay.className = 'snst-overlay';
  overlay.innerHTML = `
    <div class="snst-modal">
      <div class="snst-modal-head">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input class="snst-input" type="text" placeholder="Tìm sách theo tên, tác giả, từ khóa..." autocomplete="off">
        <button class="snst-close">ESC</button>
      </div>
      <div class="snst-results"></div>
      <div class="snst-shortcut">
        <span><kbd>↑</kbd><kbd>↓</kbd> chọn</span>
        <span><kbd>↵</kbd> mở</span>
        <span><kbd>Esc</kbd> đóng</span>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const input = overlay.querySelector('.snst-input');
  const resultsBox = overlay.querySelector('.snst-results');
  const closeBtn = overlay.querySelector('.snst-close');

  // Detect path depth for proper href
  const pathDepth = computePathDepth();
  function bookHref(slug) {
    return pathDepth + 'books/' + slug + '.html';
  }

  function computePathDepth() {
    const path = window.location.pathname;
    // /books/X → ../   /pages/X → ../   /admin/X → ../   /quan-ly/X → ../   /index.html → ./
    if (/^\/(books|pages|admin|quan-ly|q-mod|moderate|docs)\//.test(path)) return '../';
    return '';
  }

  function normalize(s) {
    return s.toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '') // remove diacritics
      .replace(/đ/g, 'd');
  }

  // Lazy-load content index for full-text search
  let CONTENT_INDEX = null;
  let contentIndexLoading = null;
  function loadContentIndex() {
    if (CONTENT_INDEX) return Promise.resolve(CONTENT_INDEX);
    if (contentIndexLoading) return contentIndexLoading;
    contentIndexLoading = fetch(pathDepth + 'assets/content-index.json', { cache: 'no-cache' })
      .then(r => r.json())
      .then(data => { CONTENT_INDEX = data; return data; })
      .catch(e => { console.warn('content-index.json not loaded:', e); CONTENT_INDEX = []; return []; });
    return contentIndexLoading;
  }

  function makeSnippet(text, query, maxLen = 160) {
    // Find first match position in normalized text
    const normText = normalize(text);
    const idx = normText.indexOf(query);
    if (idx < 0) return text.slice(0, maxLen) + '…';
    // Window around match
    const start = Math.max(0, idx - 60);
    const end = Math.min(text.length, idx + query.length + 100);
    let snippet = (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
    return snippet;
  }

  function highlightSnippet(snippet, query) {
    if (!query) return escapeHtml(snippet);
    // Highlight all occurrences (case-insensitive, diacritic-insensitive)
    const escaped = escapeHtml(snippet);
    const normSnippet = normalize(snippet);
    const tokens = query.split(/\s+/).filter(t => t.length >= 2);
    let result = escaped;
    // Build a list of [start, end] ranges in original snippet for each token
    const ranges = [];
    tokens.forEach(token => {
      let pos = 0;
      while (pos < normSnippet.length) {
        const i = normSnippet.indexOf(token, pos);
        if (i < 0) break;
        ranges.push([i, i + token.length]);
        pos = i + token.length;
      }
    });
    if (!ranges.length) return escaped;
    // Sort + merge
    ranges.sort((a, b) => a[0] - b[0]);
    const merged = [ranges[0]];
    for (let i = 1; i < ranges.length; i++) {
      const last = merged[merged.length - 1];
      if (ranges[i][0] <= last[1]) last[1] = Math.max(last[1], ranges[i][1]);
      else merged.push(ranges[i]);
    }
    // Apply highlight from end → start to preserve indices on original snippet
    // (but since escapeHtml may change indices, we operate on original text)
    let out = '';
    let cursor = 0;
    for (const [a, b] of merged) {
      out += escapeHtml(snippet.slice(cursor, a));
      out += '<mark>' + escapeHtml(snippet.slice(a, b)) + '</mark>';
      cursor = b;
    }
    out += escapeHtml(snippet.slice(cursor));
    return out;
  }

  function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  // Whole-word match: avoids false positives like "mê" matching "comment"
  function matchToken(haystack, token) {
    if (!token) return 0;
    if (token.length >= 4) {
      // Long tokens: substring is OK
      let count = 0;
      let pos = 0;
      while ((pos = haystack.indexOf(token, pos)) !== -1) { count++; pos += token.length; }
      return count;
    }
    // Short tokens (≤3 chars): require word boundary to avoid false matches
    const re = new RegExp('\\b' + escapeRegex(token) + '\\b', 'g');
    const m = haystack.match(re);
    return m ? m.length : 0;
  }

  function search(query) {
    const q = normalize(query.trim());
    if (!q) return BOOKS.slice().map(book => ({ type: 'book', book }));

    const tokens = q.split(/\s+/).filter(t => t.length >= 1);
    // Drop pure-digit single-char tokens (noise)
    const validTokens = tokens.filter(t => !(t.length === 1 && /^\d$/.test(t)));
    if (!validTokens.length) return [];

    const phrase = q; // full normalized query for phrase boost
    const results = [];

    // 1. Book-level results
    BOOKS.forEach(book => {
      const haystack = normalize([
        book.title, book.author, book.categoryLabel, book.summary,
        ...(book.keywords || [])
      ].join(' '));
      let score = 0;
      validTokens.forEach(t => {
        const matches = matchToken(haystack, t);
        if (matches > 0) score += matches;
      });
      if (score > 0) {
        // Big boost: phrase appears as-is in title
        if (normalize(book.title).includes(phrase)) score += 20;
        // Medium boost: phrase appears anywhere in book metadata
        else if (haystack.includes(phrase)) score += 10;
        results.push({ type: 'book', book, score });
      }
    });

    // 2. Section-level results
    if (CONTENT_INDEX) {
      CONTENT_INDEX.forEach(entry => {
        const book = BOOKS.find(b => b.slug === entry.slug);
        if (!book) return;
        entry.sections.forEach(sec => {
          const normLabel = normalize(sec.label || '');
          const normText = normalize(sec.text || '');
          let score = 0;
          validTokens.forEach(t => {
            const labelMatches = matchToken(normLabel, t);
            const textMatches = matchToken(normText, t);
            score += labelMatches * 3; // label match worth more
            score += textMatches;
          });
          if (score > 0) {
            // Big boost: phrase appears as-is
            if (normLabel.includes(phrase)) score += 15;
            else if (normText.includes(phrase)) score += 8;
            results.push({
              type: 'section', book, section: sec, score,
              snippet: makeSnippet(sec.text, q, 180)
            });
          }
        });
      });
    }

    // Demote results from "comments" / "actions" / utility sections (not main content)
    results.forEach(r => {
      if (r.type === 'section') {
        const id = r.section.id || '';
        if (['comments', 'flashcards', 'quiz', 'actions', 'journal'].includes(id)) {
          r.score = Math.max(1, r.score - 3);
        }
      }
    });

    return results.sort((a, b) => b.score - a.score).slice(0, 30);
  }

  function renderResults(items) {
    if (!items.length) {
      resultsBox.innerHTML = '<div class="snst-empty">Khong tim thay.<br>Thu tu khoa khac.</div>'.replace('Khong tim thay', 'Không tìm thấy').replace('Thu tu khoa khac', 'Thử từ khóa khác — tên sách, tác giả, hoặc 1 ý trong sách');
      return;
    }
    const query = normalize(input.value.trim());
    resultsBox.innerHTML = items.map((r, i) => {
      const b = r.book;
      const activeCls = i === 0 ? 'snst-active' : '';
      if (r.type === 'section') {
        const href = bookHref(b.slug) + '#' + r.section.id;
        const labelText = r.section.label || 'Section';
        return `
          <a class="snst-result ${activeCls}" data-index="${i}" href="${href}">
            <div class="snst-result-cover snst-cover-${b.cover}">
              <div class="snst-result-cover-vol">VOL ${b.vol}</div>
              <div class="snst-result-cover-num">${b.vol}</div>
            </div>
            <div class="snst-result-body">
              <div class="snst-result-meta">${escapeHtml(b.title)} · ${escapeHtml(b.author)}</div>
              <div class="snst-result-title">${highlightSnippet(labelText, query)}</div>
              <div class="snst-result-summary">${highlightSnippet(r.snippet || '', query)}</div>
            </div>
          </a>
        `;
      }
      const href = bookHref(b.slug);
      return `
        <a class="snst-result ${activeCls}" data-index="${i}" href="${href}">
          <div class="snst-result-cover snst-cover-${b.cover}">
            <div class="snst-result-cover-vol">VOL ${b.vol}</div>
            <div class="snst-result-cover-num">${b.vol}</div>
          </div>
          <div class="snst-result-body">
            <div class="snst-result-meta">${escapeHtml(b.categoryLabel)} · ${escapeHtml(b.author)}</div>
            <div class="snst-result-title">${highlightSnippet(b.title, query)}</div>
            <div class="snst-result-summary">${highlightSnippet(b.summary || '', query)}</div>
          </div>
        </a>
      `;
    }).join('');
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function openOverlay() {
    overlay.classList.add('snst-open');
    input.focus();
    loadContentIndex().then(() => {
      if (input.value.trim()) renderResults(search(input.value));
      else renderResults(BOOKS.slice().map(book => ({ type: 'book', book })));
    });
    if (!input.value.trim()) {
      renderResults(BOOKS.slice().map(book => ({ type: 'book', book })));
    }
  }
  function closeOverlay() {
    overlay.classList.remove('snst-open');
    input.value = '';
  }

  let searchDebounce;
  input.addEventListener('input', () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => renderResults(search(input.value)), 100);
  });
  input.addEventListener('keydown', (e) => {
    const links = resultsBox.querySelectorAll('.snst-result');
    const activeIdx = Array.from(links).findIndex(l => l.classList.contains('snst-active'));
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = (activeIdx + 1) % links.length;
      links.forEach(l => l.classList.remove('snst-active'));
      if (links[next]) { links[next].classList.add('snst-active'); links[next].scrollIntoView({ block: 'nearest' }); }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = (activeIdx - 1 + links.length) % links.length;
      links.forEach(l => l.classList.remove('snst-active'));
      if (links[prev]) { links[prev].classList.add('snst-active'); links[prev].scrollIntoView({ block: 'nearest' }); }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const active = resultsBox.querySelector('.snst-result.snst-active');
      if (active) window.location.href = active.href;
    } else if (e.key === 'Escape') {
      closeOverlay();
    }
  });

  closeBtn.addEventListener('click', closeOverlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeOverlay(); });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openOverlay();
    }
  });

  const navEl = document.querySelector('.nav-bar') || document.querySelector('.nav');
  if (navEl) {
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'snst-search-bar';
    trigger.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <span class="snst-search-bar-text">Tìm sách...</span>
      <kbd>Ctrl K</kbd>
    `;
    trigger.addEventListener('click', openOverlay);
    const navLinks = navEl.querySelector('.nav-links');
    if (navLinks) navEl.insertBefore(trigger, navLinks);
    else navEl.appendChild(trigger);
  }

  function renderRelated() {
    const m = window.location.pathname.match(/\/books\/([^.]+)\.html$/);
    if (!m) return;
    const currentSlug = m[1];
    const book = BOOKS.find(b => b.slug === currentSlug);
    if (!book || !book.related || !book.related.length) return;
    const footer = document.querySelector('.footer');
    if (!footer) return;
    const related = book.related.map(slug => BOOKS.find(b => b.slug === slug)).filter(Boolean);
    if (!related.length) return;
    const sec = document.createElement('section');
    sec.className = 'snst-related';
    sec.innerHTML = `
      <div class="snst-related-label">Đọc tiếp / Liên quan</div>
      <h2 class="snst-related-title">Đọc xong cuốn này, <em>thử cuốn này</em></h2>
      <div class="snst-related-grid">
        ${related.map(b => `
          <a class="snst-related-card" href="${bookHref(b.slug)}">
            <div class="snst-related-cover snst-cover-${b.cover}">
              <div class="snst-related-cover-num">Vol. ${b.vol} · ${b.year} · ~${b.readingTime} phút</div>
              <div class="snst-related-cover-title">${escapeHtml(b.title)}</div>
              <div class="snst-related-cover-author">${escapeHtml(b.author)}</div>
            </div>
            <div class="snst-related-meta">
              <span class="snst-related-tag">${escapeHtml(b.categoryLabel)}</span>
              <p class="snst-related-summary">${escapeHtml(b.summary)}</p>
              <div class="snst-related-arrow">
                <span>Đọc phân tích</span>
                <span>→</span>
              </div>
            </div>
          </a>
        `).join('')}
      </div>
    `;
    footer.parentNode.insertBefore(sec, footer);
  }
  renderRelated();

  function showFormMessage(form, type, text) {
    const msg = form.querySelector('.form-message');
    if (!msg) return;
    msg.className = 'form-message show ' + type;
    msg.textContent = text;
  }

  async function submitComment(pageId) {
    const form = document.getElementById('commentForm');
    if (!form) return;
    const btn = document.getElementById('submitBtn');
    const name = (document.getElementById('commentName') || {}).value || '';
    const email = (document.getElementById('commentEmail') || {}).value || '';
    const body = (document.getElementById('commentBody') || {}).value || '';
    const honeypot = (document.getElementById('cfWebsite') || {}).value || '';
    const parentId = form.dataset.parentId || null;
    if (!name.trim() || !email.trim() || !body.trim()) {
      showFormMessage(form, 'error', 'Điền đầy đủ tên, email, nội dung.');
      return;
    }
    if (btn) { btn.disabled = true; btn.textContent = 'Đang gửi...'; }
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page: pageId, name, email, content: body, parent_id: parentId, 'cf-website': honeypot })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showFormMessage(form, 'success', 'Đã gửi. Mở email để xác nhận — comment sẽ hiện sau khi confirm.');
        document.getElementById('commentBody').value = '';
        delete form.dataset.parentId;
        const indicator = form.querySelector('.reply-indicator');
        if (indicator) indicator.remove();
      } else {
        showFormMessage(form, 'error', (data && data.error) || 'Không gửi được. Thử lại.');
      }
    } catch (e) {
      showFormMessage(form, 'error', 'Lỗi mạng — thử lại.');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Gửi'; }
    }
  }

  function fmtTime(iso) {
    try { return new Date(iso).toLocaleDateString('vi-VN', { year: 'numeric', month: 'short', day: 'numeric' }); }
    catch { return ''; }
  }

  function setReplyTo(commentId, name) {
    const form = document.getElementById('commentForm');
    if (!form) return;
    form.dataset.parentId = commentId;
    let indicator = form.querySelector('.reply-indicator');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.className = 'reply-indicator';
      form.insertBefore(indicator, form.firstChild);
    }
    indicator.innerHTML = 'Đang reply ' + escapeHtml(name) + ' <button type="button">Hủy</button>';
    indicator.querySelector('button').addEventListener('click', () => {
      delete form.dataset.parentId;
      indicator.remove();
    });
    document.getElementById('commentBody').focus();
  }

  async function loadComments(pageId) {
    const list = document.getElementById('commentsList');
    if (!list) return;
    try {
      const res = await fetch('/api/comments?page=' + encodeURIComponent(pageId));
      const data = await res.json();
      if (!data || !data.comments || !data.comments.length) {
        list.innerHTML = '<div class="comments-loading">Chưa có comment.</div>';
        return;
      }
      const items = data.comments;
      const byId = {}; items.forEach(c => byId[c.id] = Object.assign({ replies: [] }, c));
      const roots = [];
      items.forEach(c => {
        if (c.parent_id && byId[c.parent_id]) byId[c.parent_id].replies.push(byId[c.id]);
        else roots.push(byId[c.id]);
      });
      function renderItem(c, isReply) {
        return `
          <div class="comment-item${isReply ? ' is-reply' : ''}" data-id="${c.id}">
            <div class="comment-head">
              <span class="comment-name">${escapeHtml(c.author_name)}</span>
              <span class="comment-time">${fmtTime(c.created_at)}</span>
            </div>
            <div class="comment-body">${escapeHtml(c.content)}</div>
            <div class="comment-actions">
              <button class="comment-reply-btn" data-id="${c.id}" data-name="${escapeHtml(c.author_name)}">Reply</button>
            </div>
            ${(c.replies || []).map(r => renderItem(r, true)).join('')}
          </div>
        `;
      }
      list.innerHTML = roots.map(c => renderItem(c, false)).join('');
      list.querySelectorAll('.comment-reply-btn').forEach(btn => {
        btn.addEventListener('click', () => setReplyTo(btn.dataset.id, btn.dataset.name));
      });
    } catch (e) {
      list.innerHTML = '<div class="comments-loading">Không tải được comment.</div>';
    }
  }

  const __m = window.location.pathname.match(/\/books\/([^.]+)\.html$/);
  if (__m && document.getElementById('commentsList')) loadComments(__m[1]);

  window.STOP_AND_THINK_LIB = { submitComment, loadComments, openSearch: openOverlay };

})();
