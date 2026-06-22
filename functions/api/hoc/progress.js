// functions/api/hoc/progress.js
// Đồng bộ tiến độ học của CHỦ sở hữu qua D1 — xem được "latest" ở mọi thiết bị.
//   GET /api/hoc/progress        -> { data: {...}, updated_at }
//   PUT /api/hoc/progress  body {data:{...}} -> { ok:true, updated_at }
// Chỉ tài khoản chủ (OWNER_EMAILS) + email_verified mới truy cập. Dùng env.DB sẵn có.
import { getSessionUser } from '../auth/_lib.js';

const OWNER_EMAILS = ['quangztonthat@gmail.com'];
const MAX_BYTES = 100000; // chặn payload quá lớn

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
    'CREATE TABLE IF NOT EXISTS hoc_progress (user_id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL)'
  ).run();
}

export async function onRequestGet({ request, env }) {
  const u = await owner(env, request);
  if (!u) return json({ error: 'Unauthorized' }, 401);
  await ensureTable(env);
  const row = await env.DB.prepare('SELECT data, updated_at FROM hoc_progress WHERE user_id = ?')
    .bind(u.id).first();
  let data = {};
  if (row && row.data) { try { data = JSON.parse(row.data); } catch (_) { data = {}; } }
  return json({ data, updated_at: row ? row.updated_at : 0 });
}

export async function onRequestPut({ request, env }) {
  const u = await owner(env, request);
  if (!u) return json({ error: 'Unauthorized' }, 401);
  let body = {};
  try { body = await request.json(); } catch (_) { return json({ error: 'Bad JSON' }, 400); }
  const data = (body && body.data && typeof body.data === 'object') ? body.data : {};
  const s = JSON.stringify(data);
  if (s.length > MAX_BYTES) return json({ error: 'Too large' }, 413);
  await ensureTable(env);
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    'INSERT INTO hoc_progress (user_id, data, updated_at) VALUES (?, ?, ?) ' +
    'ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at'
  ).bind(u.id, s, now).run();
  return json({ ok: true, updated_at: now });
}
