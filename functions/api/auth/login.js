// POST /api/auth/login
// Body: { email, password }
// Trả về cookie session HTTP-only.

import {
  verifyPassword, isValidEmail,
  createSession, sessionCookieHeader, json
} from './_lib.js';

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const email = (body.email || '').trim().toLowerCase();
  const password = body.password || '';

  if (!isValidEmail(email) || !password) {
    return json({ error: 'Email hoặc mật khẩu không hợp lệ' }, 400);
  }

  const user = await env.DB.prepare(
    `SELECT id, email, name, avatar_url, email_verified, password_hash
       FROM users WHERE email = ?`
  ).bind(email).first();

  // Generic error message — tránh leak email tồn tại hay không
  const BAD = json({ error: 'Email hoặc mật khẩu không đúng' }, 401);
  if (!user || !user.password_hash) return BAD;

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) return BAD;

  if (!user.email_verified) {
    return json({
      error: 'Tài khoản chưa kích hoạt. Hãy kiểm tra email để click link xác nhận.'
    }, 403);
  }

  const { id: sessId } = await createSession(env, user.id, request);

  return json({
    success: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar_url: user.avatar_url
    }
  }, 200, { 'Set-Cookie': sessionCookieHeader(sessId) });
}
