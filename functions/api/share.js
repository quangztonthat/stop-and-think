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

// MỞ RỘNG 2026-09-07: ngoài bài /phan-tich, cho chia sẻ TỪNG TRANG ở các khu khác.
// Ba lớp chặn, cố ý xếp chồng:
//   1. PATH_RE — hình dạng đường dẫn: chỉ /<đoạn>/.../<tên>.html, mỗi đoạn chỉ
//      [A-Za-z0-9._-], KHÔNG có '..', không khoảng trắng, không truy vấn.
//   2. ALLOW_PREFIXES — chỉ những khu nội dung. Trang quản lý, API, assets
//      không nằm trong danh sách nên không tạo link được, dù gõ đúng tên file.
//   3. Kiểm TRANG CÓ THẬT + TỰ CHỨA ngay lúc tạo link (xem checkStandalone).
const PATH_RE = /^\/(?:[A-Za-z0-9][A-Za-z0-9._-]{0,120}\/){1,6}[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.html$/;
const ALLOW_PREFIXES = ['/phan-tich/', '/hoc/', '/books/', '/en/', '/pages/'];
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
  // Cột path thêm sau, nên dùng ALTER: bảng cũ đã có dữ liệu, không được tạo lại.
  // SQLite ném lỗi 'duplicate column name' nếu cột đã có -> nuốt đúng lỗi đó thôi.
  try {
    await env.DB.prepare('ALTER TABLE share_links ADD COLUMN path TEXT').run();
  } catch (e) {
    if (!/duplicate column/i.test(String(e && e.message))) throw e;
  }
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

// Đường dẫn hợp lệ và nằm trong khu được phép. Trả null nếu không.
export function cleanPath(v) {  // export để test được bằng node
  if (typeof v !== 'string') return null;
  const p = v.trim().split('?')[0].split('#')[0];
  if (!PATH_RE.test(p)) return null;
  if (p.includes('..')) return null;
  if (!ALLOW_PREFIXES.some((pre) => p.startsWith(pre))) return null;
  // Trong /phan-tich chỉ có đúng một dạng phục vụ được (<slug>/index.html).
  // Nhận thứ khác thì tạo được link mà mở ra luôn 404 — chủ tưởng xong, khách
  // thì không vào được, không ai biết vì sao.
  if (p.startsWith('/phan-tich/') && !/^\/phan-tich\/[a-z0-9][a-z0-9-]{0,80}\/index\.html$/.test(p)) return null;
  return p;
}

// Trang ngoài /phan-tich chỉ chia sẻ được nếu nó TỰ CHỨA: không nạp CSS/JS cùng
// site, không có link tương đối. Lý do: đường /d/<token> nằm ở gốc khác, mọi
// đường dẫn tương đối sẽ trỏ trượt, và mở thêm ngoại lệ cho assets là mở thêm
// một lỗ trong chế độ bảo trì. Chặn NGAY LÚC TẠO để khách không bao giờ gặp
// trang vỡ — thà chủ biết sớm còn hơn khách thấy muộn.
// Liệt kê từng kiểu link xấu là trò đuổi bắt không có hồi kết: bỏ nháy đơn thì
// lọt href='../x', bỏ @import thì lọt CSS, bỏ url() thì lọt ảnh nền. Nên KHÔNG
// hỏi "có kiểu xấu nào không" mà hỏi ngược: MỌI địa chỉ trong trang có nằm
// trong danh sách được phép không. Được phép đúng bốn thứ, vì chúng không phụ
// thuộc vào việc trang đang nằm ở /hoc/... hay ở /d/<token>:
//   https://…  (ngoài site)   #…  (neo trong trang)
//   data:…     (nhúng sẵn)    mailto:/tel:
// Thiếu một kiểu markup nào thì hậu quả là TỪ CHỐI, không phải cho lọt.
const URL_ATTR_RE = /\b(?:href|src|poster|action)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s">]+))/gi;
const CSS_URL_RE  = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/gi;
const OK_URL_RE   = /^(?:https:\/\/|data:|#|mailto:|tel:)/i;

export function firstBadUrl(html) {  // export để test được bằng node
  for (const re of [URL_ATTR_RE, CSS_URL_RE]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(html)) !== null) {
      const v = (m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3] || '').trim();
      if (!v) continue;
      if (!OK_URL_RE.test(v)) return v.slice(0, 80);
    }
  }
  return null;
}

export function checkStandalone(html) {  // export để test được bằng node
  const bad = firstBadUrl(html);
  if (bad) return 'trang trỏ tới địa chỉ trong site: "' + bad + '". Chỉ chia sẻ được trang tự chứa (mọi liên kết là https://, #neo hoặc data:)';
  return null;
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
    `SELECT token, slug, path, label, enabled, created_at, expires_at, views, last_view_at
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

  // Hai lối vào, cùng một kết quả: bài /phan-tich chọn bằng slug (như cũ), trang
  // khu khác chọn bằng đường dẫn đầy đủ. Đường dẫn thắng nếu gửi cả hai.
  let slug = '';
  let path = '';
  if (body.path) {
    path = cleanPath(String(body.path));
    if (!path) return json({ error: 'Đường dẫn không hợp lệ hoặc nằm ngoài khu được phép' }, 400);
    const m = path.match(/^\/phan-tich\/([a-z0-9][a-z0-9-]{0,80})\/index\.html$/);
    if (m) { slug = m[1]; path = ''; }   // quy về đúng dạng cũ, khỏi đẻ hai kiểu bản ghi cho cùng một bài
  } else {
    slug = String(body.slug || '').trim().toLowerCase();
    if (!SLUG_RE.test(slug)) return json({ error: 'Slug không hợp lệ' }, 400);
  }

  // Trang phải có thật. Kiểm bằng chính ASSETS chứ không tin danh sách gõ tay:
  // vừa chặn gõ nhầm, vừa chặn nhét đường dẫn lạ vào bảng.
  const target = path || ('/phan-tich/' + slug + '/index.html');
  const probe = await env.ASSETS.fetch(new URL(target, request.url));
  if (!probe.ok) return json({ error: 'Không có trang này: ' + target }, 404);

  if (path) {
    const why = checkStandalone(await probe.text());
    if (why) return json({ error: 'Không chia sẻ được — ' + why }, 400);
  }

  const count = await env.DB.prepare('SELECT COUNT(*) AS c FROM share_links').first();
  if ((count?.c || 0) >= MAX_LINKS) return json({ error: 'Đã đạt giới hạn số link' }, 409);

  const token = randomToken(32); // 64 hex — không đoán được
  await env.DB.prepare(
    `INSERT INTO share_links (token, slug, path, label, enabled, expires_at, created_by)
     VALUES (?, ?, ?, ?, 1, ?, ?)`
  ).bind(token, slug, path || null, cleanLabel(body.label), expiryFrom(body.days), user.id).run();

  return json({ token, slug, path, url: '/d/' + token }, 201);
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

  // D1 trả số dòng đã đổi ở res.meta.changes. Viết `changes === 0` thôi thì
  // khi meta thiếu trường đó, `undefined === 0` là false và API báo thành công
  // cho một token không tồn tại. Chỉ coi là thành công khi ĐẾM ĐƯỢC ít nhất
  // một dòng — thiếu số đếm cũng là không biết, mà không biết thì không báo OK.
  if (!(res.meta && res.meta.changes > 0)) {
    return json({ error: 'Không tìm thấy link' }, 404);
  }
  return json({ ok: true });
}

export async function onRequestDelete({ request, env }) {
  if (!sameOrigin(request)) return json({ error: 'Forbidden' }, 403);
  if (!await owner(env, request)) return json({ error: 'Unauthorized' }, 401);
  await ensureTable(env);

  const body = await readBody(request);
  const token = String(body.token || '');
  if (!/^[a-f0-9]{64}$/.test(token)) return json({ error: 'Token không hợp lệ' }, 400);

  const res = await env.DB.prepare('DELETE FROM share_links WHERE token = ?')
    .bind(token).run();
  // Cùng lý do như PATCH: xoá một token không có thật mà báo "Đã xoá link" thì
  // trang quản lý đang nói dối chủ về trạng thái thật của dữ liệu.
  if (!(res.meta && res.meta.changes > 0)) {
    return json({ error: 'Không tìm thấy link' }, 404);
  }
  return json({ ok: true });
}
