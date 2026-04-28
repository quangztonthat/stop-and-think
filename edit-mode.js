/**
 * Edit Mode — bật bằng cách thêm ?edit vào URL
 * Ví dụ: http://127.0.0.1:5500/books/atomic-habits.html?edit
 *
 * SAFETY: Save dùng download (an toàn 100%) thay vì File System Access API
 * Sau khi sửa xong, click 💾 Save → file HTML download về Downloads
 * → drag file vừa download đè lên file gốc trong VS Code (hoặc File Explorer)
 */
(function () {
  const params = new URLSearchParams(location.search);
  if (!params.has('edit')) return;

  // 1. Bật contenteditable cho mọi text element
  const selectors = 'h1, h2, h3, h4, h5, h6, p, li, blockquote, em, strong, span, a, td, th, .prose, .book-content, .chapter-desc, .chapter-title, .law-title, .law-desc, .book-title, .book-vol, .book-cover-num';
  document.querySelectorAll(selectors).forEach(el => {
    if (el.closest('#edit-mode-bar')) return;
    el.contentEditable = 'true';
    el.style.outline = '1px dashed rgba(196, 146, 60, 0.4)';
    el.style.outlineOffset = '2px';
    el.style.cursor = 'text';
  });

  // 2. Floating action bar
  const bar = document.createElement('div');
  bar.id = 'edit-mode-bar';
  bar.style.cssText = `
    position: fixed; bottom: 20px; right: 20px; z-index: 99999;
    background: #1a1410; padding: 8px; border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3); display: flex; gap: 6px;
    font-family: -apple-system, sans-serif; font-size: 13px;
  `;

  const btn = (label, color, fn) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = `
      padding: 10px 16px; background: ${color}; color: white;
      border: none; border-radius: 6px; cursor: pointer; font-size: 13px;
      font-weight: 500;
    `;
    b.onclick = fn;
    return b;
  };

  // SAVE — dùng download (an toàn 100%), không dùng File System Access API
  const saveBtn = btn('💾 Download HTML', '#8b3a2b', () => {
    try {
      // Clone & strip edit-mode artifacts
      const clone = document.documentElement.cloneNode(true);
      clone.querySelectorAll('[contenteditable]').forEach(el => {
        el.removeAttribute('contenteditable');
        el.style.outline = '';
        el.style.outlineOffset = '';
        el.style.cursor = '';
      });
      const editBar = clone.querySelector('#edit-mode-bar');
      if (editBar) editBar.remove();
      // Remove edit-mode.js script tag
      clone.querySelectorAll('script[src*="edit-mode.js"]').forEach(s => s.remove());

      const html = '<!DOCTYPE html>\n' + clone.outerHTML;

      // SAFETY CHECK — verify content non-trivial
      if (html.length < 1000) {
        alert('⚠️ Lỗi: HTML quá ngắn. Không lưu.');
        return;
      }

      // Download via blob — Browser handles encoding correctly
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = location.pathname.split('/').pop() || 'index.html';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      saveBtn.textContent = '✓ Đã download';
      saveBtn.style.background = '#2d4a5c';
      setTimeout(() => {
        saveBtn.textContent = '💾 Download HTML';
        saveBtn.style.background = '#8b3a2b';
      }, 2500);
    } catch (e) {
      alert('Lỗi: ' + e.message);
    }
  });

  // Help button
  const helpBtn = btn('?', '#4a3f33', () => {
    alert(
      '✏️ EDIT MODE\n\n' +
      '1. Click vào text bất kỳ → gõ chữ mới như Word\n' +
      '2. Click 💾 Download HTML → file tải về Downloads/\n' +
      '3. Drag file vừa download đè lên file gốc trong D:\\anhbay\\\n' +
      '   (hoặc copy file này dán vào VS Code)\n\n' +
      'KHÔNG dùng "Lưu trực tiếp" — đã từng gây hỏng file.'
    );
  });

  // Exit button
  const exitBtn = btn('✕', '#4a3f33', () => {
    location.search = '';
  });

  bar.appendChild(saveBtn);
  bar.appendChild(helpBtn);
  bar.appendChild(exitBtn);
  document.body.appendChild(bar);

  document.title = '✏️ ' + document.title;
  console.log('%c✏️ EDIT MODE ON (download mode)', 'background:#8b3a2b;color:white;padding:4px 8px;border-radius:4px;font-weight:bold');
})();
