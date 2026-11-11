// functions/api/hoc/kv.js
// Vòng 41 (11/11/2026): lưu tiến độ TỪNG TRANG học (đề thi thử, sổ tay, thẻ luyện CVA...) lên D1
// để máy tính và điện thoại dùng chung một bản, không mất khi đổi máy hay xoá trình duyệt.
//   GET /api/hoc/kv?keys=a,b,c   -> { items: { a: {data, updated_at}, ... } }   (khoá chưa có thì không trả)
//   PUT /api/hoc/kv  body {k, data, base}
//        data: chuỗi (đúng giá trị localStorage) hoặc null (= đã xoá)
//        base: updated_at của bản máy chủ mà máy này đã thấy lần cuối (0 nếu chưa thấy)
//        -> 200 { ok:true, updated_at }        ghi được
//        -> 409 { conflict:true, data, updated_at }  máy khác đã ghi mới hơn: máy này gộp rồi gửi lại
// Chỉ tài khoản chủ (OWNER_EMAILS) + email_verified. Dùng env.DB sẵn có, bảng riêng hoc_kv
// (không đụng bảng hoc_progress của trang mục lục /hoc).
import { getSessionUser } from '../auth/_lib.js';

const OWNER_EMAILS = ['quangztonthat@gmail.com'];
const MAX_BYTES = 300000;          // một khoá tối đa ~300 KB
const MAX_KEYS = 30;               // một lần GET tối đa 30 khoá
const KEY_RE = /^[A-Za-z0-9_.:-]{1,80}$/;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

async function owner(env, request) {
  let u = null;
  try { u = await getSessionUser(env, request); } catch (_) { u = null; }
  if (u && u.email_verified && OWNER_EMAILS.includes((u.email || '').toLowerCase())) return u;
  return null;
}

async function ensureTable(env) {
  await env.DB.prepare(
    'CREATE TABLE IF NOT EXISTS hoc_kv (user_id TEXT NOT NULL, k TEXT NOT NULL, data TEXT, ' +
    'updated_at INTEGER NOT NULL, PRIMARY KEY (user_id, k))'
  ).run();
}

export async function onRequestGet({ request, env }) {
  const u = await owner(env, request);
  if (!u) return json({ error: 'Unauthorized' }, 401);
  const url = new URL(request.url);
  const keys = (url.searchParams.get('keys') || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!keys.length || keys.length > MAX_KEYS || !keys.every((k) => KEY_RE.test(k))) {
    return json({ error: 'Bad keys' }, 400);
  }
  await ensureTable(env);
  const marks = keys.map(() => '?').join(',');
  const res = await env.DB.prepare(
    `SELECT k, data, updated_at FROM hoc_kv WHERE user_id = ? AND k IN (${marks})`
  ).bind(u.id, ...keys).all();
  const items = {};
  for (const r of (res && res.results) || []) items[r.k] = { data: r.data, updated_at: r.updated_at };
  return json({ items });
}

export async function onRequestPut({ request, env }) {
  const u = await owner(env, request);
  if (!u) return json({ error: 'Unauthorized' }, 401);
  let body = null;
  try { body = await request.json(); } catch (_) { return json({ error: 'Bad JSON' }, 400); }
  const k = body && body.k;
  const data = body ? body.data : undefined;
  const base = Number(body && body.base) || 0;
  if (typeof k !== 'string' || !KEY_RE.test(k)) return json({ error: 'Bad key' }, 400);
  if (data !== null && typeof data !== 'string') return json({ error: 'Bad data' }, 400);
  if (data && data.length > MAX_BYTES) return json({ error: 'Too large' }, 413);
  await ensureTable(env);
  const row = await env.DB.prepare('SELECT data, updated_at FROM hoc_kv WHERE user_id = ? AND k = ?')
    .bind(u.id, k).first();
  if (row && row.updated_at > base) {
    return json({ conflict: true, data: row.data, updated_at: row.updated_at }, 409);
  }
  const now = Math.max(Date.now(), row ? row.updated_at + 1 : 0);
  // ghi có điều kiện: chỉ ghi khi bản trên máy chủ vẫn chưa mới hơn 'base' (chặn hai máy ghi cùng lúc)
  const r = await env.DB.prepare(
    'INSERT INTO hoc_kv (user_id, k, data, updated_at) VALUES (?, ?, ?, ?) ' +
    'ON CONFLICT(user_id, k) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at ' +
    'WHERE hoc_kv.updated_at <= ?'
  ).bind(u.id, k, data, now, base).run();
  const changed = r && r.meta ? r.meta.changes : 1;
  if (!changed) {
    const cur = await env.DB.prepare('SELECT data, updated_at FROM hoc_kv WHERE user_id = ? AND k = ?')
      .bind(u.id, k).first();
    return json({ conflict: true, data: cur ? cur.data : null, updated_at: cur ? cur.updated_at : 0 }, 409);
  }
  return json({ ok: true, updated_at: now });
}
