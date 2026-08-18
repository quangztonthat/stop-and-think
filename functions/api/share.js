// functions/api/share.js — quản lý link chia sẻ riêng. CHỈ CHỦ được gọi.
//
// GET    /api/share            -> danh sách link
// POST   /api/share            -> tạo link mới  { slug, label?, days? }
// PATCH  /api/share            -> sửa           { token, enabled?, label?, days? }
// DELETE /api/share            -> xoá hẳn       { token }
//
// Gác quyền: đúng cùng một cách với /hoc — session cookie st_session trong D1,
// email đã xác thực, và email nằm trong OWNER_EMAILS. Lỗi DB -> fail-closed.
// Không nhận mật khẩu qua header như /api/quan-ly/stats: ở đây tái dùng session
// có sẵn, không thêm bí mật mới nào phải giữ.
import { getSessionUser, randomToken, json } from './auth/_lib.js';

const OWNER_EMAILS = ['quangztonthat@gmail.com'];
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,80}$/;
const MAX_LABEL = 80;
const MAX_LINKS = 200; // chặn tạo tràn

// Bảng share_links tự tạo ở lần gọi đầu tiên, khỏi phải chạy migration tay.
// CREATE ... IF NOT EXISTS nên chạy lại vô hại; cờ `ready` để mỗi isolate chỉ
// tốn một lần. File migrations/0002_share_links.sql giữ lại làm bản ghi chép,
// không bắt buộc chạy. Chỉ đặt ở đây (API của chủ), KHÔNG đặt ở /d/[token].js —
// đường công khai phải chỉ đọc; chưa có bảng thì nó trả 404, đúng như mong muốn.
let ready = false;
async function ensureTable(env) {
  if (ready) return;
  // Chạy tuần tự chứ không gói vào env.DB.batch: batch bọc mọi câu trong một
  // transaction, mà đặt DDL trong transaction là chỗ dễ sinh chuyện lạ.
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS share_links (
    token        TEXT PRIMARY KEY,
    slug         TEXT NOT NULL,
    label        TEXT,
    enabled      INTEGER NOT NULL DEFAULT 1,
    created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
    expires_at   INTEGER,
    views        INTEGER NOT NULL DEFAULT 0,
    last_view_at INTEGER,
    created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL
  )`).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_share_slug    ON share_links(slug)').run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_share_created ON share_links(created_at)').run();
  ready = true;
}

async function owner(env, request) {
  let user = null;
  try {
    user = await getSessionUser(env, request);
  } catch (_) {
    return null; // DB lỗi -> fail-closed
  }
  const ok = user
    && user.email_verified
    && OWNER_EMAILS.includes((user.email || '').toLowerCase());
  return ok ? user : null;
}

// Chống CSRF cho ba phương thức có tác dụng phụ.
// Cookie st_session là SameSite=Lax nên trình duyệt vốn đã không gửi kèm ở
// POST/PATCH/DELETE khác site — đây là lớp thứ hai, phòng khi cấu hình cookie
// đổi về None hoặc trình duyệt cũ không tôn trọng Lax.
// Mọi trình duyệt hiện nay đều gửi Origin ở request khác GET/HEAD, kể cả cùng
// site (đã đo bằng Chromium trước khi bắt buộc), nên thiếu Origin là bất thường
// -> chặn luôn, không đoán mò bằng Referer.
function sameOrigin(request) {
  const o = request.headers.get('origin');
  if (!o) return false;
  try {
    return new URL(o).origin === new URL(request.url).origin;
  } catch (_) {
    return false;
  }
}

function cleanLabel(v) {
  if (typeof v !== 'string') return null;
  const s = v.replace(/\s+/g, ' ').trim().slice(0, MAX_LABEL);
  return s || null;
}

// days: 0 hoặc thiếu = không hết hạn; ngược lại 1..3650
function expiryFrom(days) {
  const n = Number(days);
  if (!Number.isFinite(n) || n <= 0) return null;
  const d = Math.min(Math.floor(n), 3650);
  return Math.floor(Date.now() / 1000) + d * 86400;
}

async function readBody(request) {
  try {
    const b = await request.json();
    return (b && typeof b === 'object') ? b : {};
  } catch (_) {
    return {};
  }
}

export async function onRequestGet({ request, env }) {
  if (!await owner(env, request)) return json({ error: 'Unauthorized' }, 401);
  await ensureTable(env);
  const r = await env.DB.prepare(
    `SELECT token, slug, label, enabled, created_at, expires_at, views, last_view_at
       FROM share_links ORDER BY created_at DESC LIMIT ?`
  ).bind(MAX_LINKS).all();
  return json({ links: r.results || [], now: Math.floor(Date.now() / 1000) });
}

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: 'Forbidden' }, 403);
  const user = await owner(env, request);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  await ensureTable(env);

  const body = await readBody(request);
  const slug = String(body.slug || '').trim().toLowerCase();
  if (!SLUG_RE.test(slug)) return json({ error: 'Slug không hợp lệ' }, 400);

  // Bài phải có thật. Kiểm bằng chính ASSETS chứ không tin danh sách gõ tay:
  // vừa chặn gõ nhầm, vừa chặn nhét đường dẫn lạ vào bảng.
  const probe = await env.ASSETS.fetch(
    new URL('/phan-tich/' + slug + '/index.html', request.url)
  );
  if (!probe.ok) return json({ error: 'Không có bài này trong /phan-tich/' }, 404);

  const count = await env.DB.prepare('SELECT COUNT(*) AS c FROM share_links').first();
  if ((count?.c || 0) >= MAX_LINKS) return json({ error: 'Đã đạt giới hạn số link' }, 409);

  const token = randomToken(32); // 64 hex — không đoán được
  await env.DB.prepare(
    `INSERT INTO share_links (token, slug, label, enabled, expires_at, created_by)
     VALUES (?, ?, ?, 1, ?, ?)`
  ).bind(token, slug, cleanLabel(body.label), expiryFrom(body.days), user.id).run();

  return json({ token, slug, url: '/d/' + token }, 201);
}

export async function onRequestPatch({ request, env }) {
  if (!sameOrigin(request)) return json({ error: 'Forbidden' }, 403);
  if (!await owner(env, request)) return json({ error: 'Unauthorized' }, 401);
  await ensureTable(env);

  const body = await readBody(request);
  const token = String(body.token || '');
  if (!/^[a-f0-9]{64}$/.test(token)) return json({ error: 'Token không hợp lệ' }, 400);

  const sets = [];
  const vals = [];
  if (typeof body.enabled === 'boolean') { sets.push('enabled = ?'); vals.push(body.enabled ? 1 : 0); }
  if ('label' in body)                   { sets.push('label = ?');   vals.push(cleanLabel(body.label)); }
  if ('days' in body)                    { sets.push('expires_at = ?'); vals.push(expiryFrom(body.days)); }
  if (!sets.length) return json({ error: 'Không có gì để sửa' }, 400);

  vals.push(token);
  const res = await env.DB.prepare(
    `UPDATE share_links SET ${sets.join(', ')} WHERE token = ?`
  ).bind(...vals).run();

  if (!res.meta || res.meta.changes === 0) return json({ error: 'Không tìm thấy link' }, 404);
  return json({ ok: true });
}

export async function onRequestDelete({ request, env }) {
  if (!sameOrigin(request)) return json({ error: 'Forbidden' }, 403);
  if (!await owner(env, request)) return json({ error: 'Unauthorized' }, 401);
  await ensureTable(env);

  const body = await readBody(request);
  const token = String(body.token || '');
  if (!/^[a-f0-9]{64}$/.test(token)) return json({ error: 'Token không hợp lệ' }, 400);

  await env.DB.prepare('DELETE FROM share_links WHERE token = ?').bind(token).run();
  return json({ ok: true });
}
