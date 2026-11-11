/* cva-sync.js — vòng 41 (11/11/2026, Quang: "web và điện thoại đồng bộ, lưu lại mỗi lần làm, không bị mất")
 * Đồng bộ tiến độ của trang học CVA (đề thi thử, sổ tay, thẻ luyện) giữa các máy qua /api/hoc/kv.
 *  - Trang vẫn lưu vào localStorage như cũ; tệp này theo dõi đúng các khoá khai trong data-keys
 *    và gửi bản mới lên máy chủ; mở trang (hoặc quay lại tab) thì kéo bản mới nhất về.
 *  - Hai máy cùng ghi: máy chủ trả 409, máy này GỘP (đáp án / thẻ của cả hai máy đều giữ) rồi gửi lại.
 *  - data-history="<khoá đáp án>": trước khi bấm "Làm lại từ đầu" xoá đáp án, lưu một dòng tổng kết
 *    lần làm đó vào khoá <tiền tố>_history (cũng đồng bộ) và hiện bảng "Lịch sử các lần làm".
 *  - Khoá giao diện (nền tối, cỡ chữ, tab đang mở) KHÔNG đồng bộ: mỗi máy giữ kiểu riêng.
 */
(function () {
  'use strict';
  var me = document.currentScript;
  if (!me || !window.fetch || !window.localStorage) return;
  var HIST_SRC = me.getAttribute('data-history') || '';           // khoá đáp án cần lưu lịch sử
  var HIST = HIST_SRC ? HIST_SRC.replace(/_answers$/, '') + '_history' : '';
  var KEYS = (me.getAttribute('data-keys') || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  if (HIST && KEYS.indexOf(HIST) < 0) KEYS.push(HIST);
  if (!KEYS.length) return;
  var API = '/api/hoc/kv';
  var M = 'cvasync:';                                              // khoá phụ: base, dirty
  var S = Storage.prototype, oGet = S.getItem, oSet = S.setItem, oRem = S.removeItem;
  var LS = window.localStorage;
  function g(k) { try { return oGet.call(LS, k); } catch (e) { return null; } }
  function s(k, v) { try { oSet.call(LS, k, v); } catch (e) {} }
  function r(k) { try { oRem.call(LS, k); } catch (e) {} }
  function base(k) { return +(g(M + 'b:' + k) || 0); }
  function setBase(k, t) { s(M + 'b:' + k, String(t)); }
  function dirty(k) { return g(M + 'd:' + k) === '1'; }
  function setDirty(k, on) { if (on) s(M + 'd:' + k, '1'); else r(M + 'd:' + k); }
  var watched = {}; KEYS.forEach(function (k) { watched[k] = 1; });

  /* ---------- dòng trạng thái nhỏ góc dưới ---------- */
  var badge = null, authFail = false;
  function status(t, warn) {
    if (!document.body) return;
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'cvaSync';
      badge.style.cssText = 'position:fixed;left:10px;bottom:10px;z-index:9999;font:12px/1.4 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;' +
        'padding:4px 9px;border-radius:999px;background:rgba(20,28,48,.88);color:#cfe3ff;box-shadow:0 1px 4px rgba(0,0,0,.3);pointer-events:none;opacity:.9';
      document.body.appendChild(badge);
    }
    badge.textContent = t;
    badge.style.color = warn ? '#ffd28a' : '#cfe3ff';
    badge.style.display = 'block';
    clearTimeout(badgeT);
    if (!warn) badgeT = setTimeout(function () { badge.style.display = 'none'; }, 4000);   // báo xong thì tự ẩn, lỗi thì để nguyên
  }
  var badgeT = null;
  function hhmm() { var d = new Date(); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }

  /* ---------- gộp hai bản ---------- */
  function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
  function merge(server, local) {
    // local === null: máy này vừa xoá (Làm lại từ đầu) -> giữ việc xoá
    if (local === null) return null;
    if (server === null || server === undefined) return local;
    var a, b;
    try { a = JSON.parse(server); b = JSON.parse(local); } catch (e) { return local; }
    if (isObj(a) && isObj(b)) {                                    // đáp án, thẻ, mục đã đọc: hợp hai bên
      var o = {}, k;
      for (k in a) o[k] = a[k];
      for (k in b) o[k] = b[k];
      return JSON.stringify(o);
    }
    if (Array.isArray(a) && Array.isArray(b)) {                    // lịch sử: hợp theo mốc thời gian
      var seen = {}, out = [];
      a.concat(b).forEach(function (x) { var id = x && x.at ? x.at : JSON.stringify(x); if (!seen[id]) { seen[id] = 1; out.push(x); } });
      out.sort(function (x, y) { return (x.at || '') < (y.at || '') ? -1 : 1; });
      return JSON.stringify(out);
    }
    return local;
  }

  /* ---------- đẩy lên ---------- */
  var timers = {};
  function push(k, keepalive) {
    if (authFail) return Promise.resolve();
    var data = g(k);
    var body = JSON.stringify({ k: k, data: data, base: base(k) });
    return fetch(API, { method: 'PUT', credentials: 'include', keepalive: !!keepalive && body.length < 60000,
      headers: { 'content-type': 'application/json' }, body: body })
      .then(function (res) {
        if (res.status === 401) { authFail = true; status('⚠ Chưa đăng nhập: chỉ lưu trên máy này', true); return null; }
        return res.json().then(function (j) { return { st: res.status, j: j }; });
      })
      .then(function (x) {
        if (!x) return;
        if (x.st === 200 && x.j.ok) {
          if (g(k) === data) setDirty(k, false);                    // trong lúc gửi chưa có thay đổi mới
          setBase(k, x.j.updated_at);
          status('✓ Đã lưu lên máy chủ ' + hhmm());
        } else if (x.st === 409) {                                   // máy khác ghi trước: gộp rồi gửi lại
          var m = merge(x.j.data, g(k));
          if (m === null) r(k); else s(k, m);
          setBase(k, x.j.updated_at);
          setDirty(k, true);
          var diff = (m !== data);
          return push(k).then(function () {
            // đang dùng trang mà máy khác vừa ghi: tải lại để trang đọc bản đã gộp (không ghi đè bản kia)
            if (diff && !inPull && !sessionStorage.getItem('cvasync-rl')) { sessionStorage.setItem('cvasync-rl', '1'); location.reload(); }
            else if (diff) needReload = true;
          });
        } else {
          status('⚠ Chưa lưu được lên máy chủ, đã lưu trên máy này', true);
        }
      })
      .catch(function () { status('⚠ Mất mạng: đã lưu trên máy này, có mạng sẽ gửi lại', true); });
  }
  function schedule(k, now) {
    setDirty(k, true);
    clearTimeout(timers[k]);
    if (now) { push(k, true); return; }
    timers[k] = setTimeout(function () { push(k); }, 800);
  }
  function flushAll(keepalive) { KEYS.forEach(function (k) { if (dirty(k)) { clearTimeout(timers[k]); push(k, keepalive); } }); }

  /* ---------- lịch sử các lần làm (đề thi thử, câu hỏi sổ tay) ---------- */
  function summary() {
    var a = {}; try { a = JSON.parse(g(HIST_SRC) || '{}') || {}; } catch (e) {}
    var cards = document.querySelectorAll('.q-card'), done = 0, cor = 0, byT = {};
    cards.forEach(function (c) {
      var t = c.getAttribute('data-tang') || 'all';
      if (!byT[t]) byT[t] = [0, 0, 0];
      byT[t][2]++;
      var v = a[c.getAttribute('data-q-id')];
      if (v !== undefined) { done++; byT[t][0]++; if (v === parseInt(c.getAttribute('data-answer'), 10)) { cor++; byT[t][1]++; } }
    });
    return { done: done, cor: cor, total: cards.length, byT: byT };
  }
  function loadHist() { try { var h = JSON.parse(g(HIST) || '[]'); return Array.isArray(h) ? h : []; } catch (e) { return []; } }
  function archive() {
    var x = summary();
    if (!x.done) return;
    var h = loadHist();
    h.push({ at: new Date().toISOString(), done: x.done, cor: x.cor, total: x.total, byT: x.byT });
    oSet.call(LS, HIST, JSON.stringify(h));
    schedule(HIST, true);
  }

  /* ---------- theo dõi ghi của trang ---------- */
  S.setItem = function (k, v) {
    oSet.call(this, k, v);
    if (this === LS && watched[k] && k.indexOf(M) !== 0) schedule(k, false);
  };
  S.removeItem = function (k) {
    if (this === LS && watched[k]) {
      if (HIST && k === HIST_SRC) { try { archive(); } catch (e) {} }
      oRem.call(this, k);
      schedule(k, true);                                           // trang sẽ tải lại ngay: gửi luôn
      return;
    }
    oRem.call(this, k);
  };

  /* ---------- kéo về ---------- */
  var needReload = false, pulling = false, inPull = false;
  function pull(first) {
    if (pulling || authFail) return;
    pulling = true; inPull = true;
    fetch(API + '?keys=' + encodeURIComponent(KEYS.join(',')), { credentials: 'include', cache: 'no-store' })
      .then(function (res) {
        if (res.status === 401) { authFail = true; status('⚠ Chưa đăng nhập: chỉ lưu trên máy này', true); return null; }
        return res.ok ? res.json() : null;
      })
      .then(function (j) {
        pulling = false;
        if (!j || !j.items) { inPull = false; if (!authFail) status('⚠ Chưa nối được máy chủ, đã lưu trên máy này', true); return; }
        var changed = false, pend = [];
        KEYS.forEach(function (k) {
          var it = j.items[k], local = g(k);
          if (!it) { if (local !== null) { setDirty(k, true); pend.push(k); } return; }   // máy chủ chưa có: gửi lên
          if (it.updated_at > base(k)) {                                                    // máy chủ có bản mới hơn
            // máy này có thay đổi chưa gửi, hoặc lần đầu đồng bộ khoá này trên máy này: GỘP để không mất bản trên máy
            var first = base(k) === 0 && local !== null;
            if (first) setDirty(k, true);
            var v = dirty(k) ? merge(it.data, local) : it.data;
            if (v !== local) { if (v === null) r(k); else s(k, v); changed = true; }
            setBase(k, it.updated_at);
            if (dirty(k)) pend.push(k);
          } else if (dirty(k)) pend.push(k);
        });
        var done = function () {
          inPull = false;
          if ((changed || needReload) && !sessionStorage.getItem('cvasync-rl')) {
            sessionStorage.setItem('cvasync-rl', '1');            // tải lại một lần để trang đọc bản mới
            location.reload();
            return;
          }
          sessionStorage.removeItem('cvasync-rl');
          status('✓ Đã đồng bộ ' + hhmm());
        };
        if (pend.length) Promise.all(pend.map(function (k) { return push(k); })).then(done); else done();
      })
      .catch(function () { pulling = false; inPull = false; status('⚠ Mất mạng: đang dùng bản trên máy này', true); });
  }

  /* ---------- bảng lịch sử ---------- */
  function histUI() {
    var btn = document.getElementById('resetQuiz');
    if (!HIST || !btn) return;
    var b = document.createElement('button');
    b.type = 'button'; b.id = 'histBtn'; b.textContent = 'Lịch sử các lần làm';
    b.className = btn.className; b.style.marginLeft = '6px';
    btn.parentNode.insertBefore(b, btn.nextSibling);
    var box = document.createElement('div');
    box.id = 'histBox';
    box.style.cssText = 'display:none;margin:10px 0 4px;padding:10px 14px;border:1px solid var(--line,#39456b);border-radius:12px;background:var(--card,#151d33);font-size:15px';
    var bar = btn.closest('.mock-bar') || btn.parentNode;
    bar.parentNode.insertBefore(box, bar.nextSibling);
    var NAME = { official: 'Đề gốc', recall: 'Ôn lại', hard: 'Nâng cao', review: 'Ôn tập cuối chương', all: 'Câu hỏi' };
    function row(lbl, x, cur) {
      var p = x.done ? Math.round(x.cor / x.done * 100) : 0;
      var parts = Object.keys(x.byT || {}).filter(function (t) { return x.byT[t][0] > 0; })
        .map(function (t) { var v = x.byT[t]; return (NAME[t] || t) + ' ' + v[1] + '/' + v[0]; }).join(' · ');
      return '<tr' + (cur ? ' style="font-weight:600"' : '') + '><td style="padding:4px 10px 4px 0;white-space:nowrap">' + lbl + '</td>' +
        '<td style="padding:4px 10px;text-align:right">' + x.done + '/' + x.total + '</td>' +
        '<td style="padding:4px 10px;text-align:right">' + x.cor + '</td>' +
        '<td style="padding:4px 10px;text-align:right">' + p + '%</td>' +
        '<td style="padding:4px 0 4px 10px;color:var(--ink-soft,#98a3bb)">' + parts + '</td></tr>';
    }
    function fmt(iso) { var d = new Date(iso); return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + d.getFullYear() + ' ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
    function render() {
      var h = loadHist(), cur = summary();
      var html = '<div style="margin-bottom:6px;color:var(--ink-soft,#98a3bb)">Mỗi lần bấm "Làm lại từ đầu", kết quả lần đó được lưu ở đây (đồng bộ máy tính và điện thoại).</div>' +
        '<div style="overflow-x:auto"><table style="border-collapse:collapse"><tr style="color:var(--ink-soft,#98a3bb)"><td style="padding:4px 10px 4px 0">Lần</td><td style="padding:4px 10px;text-align:right">Đã làm</td><td style="padding:4px 10px;text-align:right">Đúng</td><td style="padding:4px 10px;text-align:right">Tỷ lệ</td><td style="padding:4px 0 4px 10px">Đúng/đã làm theo phần</td></tr>';
      html += row('Đang làm', cur, true);
      for (var i = h.length - 1; i >= 0; i--) html += row('Lần ' + (i + 1) + ' · ' + fmt(h[i].at), h[i], false);
      if (!h.length) html += '<tr><td colspan="5" style="padding:6px 0;color:var(--ink-soft,#98a3bb)">Chưa có lần làm nào được lưu.</td></tr>';
      box.innerHTML = html + '</table></div>';
    }
    b.addEventListener('click', function () { var on = box.style.display === 'none'; box.style.display = on ? 'block' : 'none'; if (on) render(); });
  }

  /* ---------- chạy ---------- */
  function start() {
    histUI();
    pull(true);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') pull(false); else flushAll(true);
    });
    window.addEventListener('pagehide', function () { flushAll(true); });
    window.addEventListener('online', function () { flushAll(false); pull(false); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
