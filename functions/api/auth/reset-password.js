// POST /api/auth/reset-password
// Body: { token, password }
// Đổi mật khẩu, đánh dấu token used, xoá toàn bộ session cũ (logout mọi nơi).
// GET /api/auth/reset-password?token=xxx → trả {valid: true|false} để page kiểm tra
// trước khi cho user nhập password mới.

import {
  hashPassword, passwordStrength,
  createSession, sessionCookieHeader, json
} from './_lib.js';

// GET: kiểm tra token có hợp lệ không (để page hiển thị form hoặc báo lỗi)
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const token = (url.searchParams.get('token') || '').trim();
  if (!token) return json({ valid: false, reason: 'missing' });

  const row = await env.DB.prepare(
    `SELECT expires_at, used FROM password_reset_tokens WHERE token = ?`
  ).bind(token).first();

  if (!row) return json({ valid: false, reason: 'not_found' });
  if (row.used) return json({ valid: false, reason: 'used' });
  const now = Math.floor(Date.now() / 1000);
  if (row.expires_at < now) return json({ valid: false, reason: 'expired' });

  return json({ valid: true });
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const token = (body.token || '').trim();
  const password = body.password || '';

  if (!token || token.length < 16) return json({ error: 'Token không hợp lệ' }, 400);
  const pwErr = passwordStrength(password);
  if (pwErr) return json({ error: pwErr }, 400);

  const row = await env.DB.prepare(
    `SELECT user_id, expires_at, used FROM password_reset_tokens WHERE token = ?`
  ).bind(token).first();

  if (!row) return json({ error: 'Link không hợp lệ' }, 400);
  if (row.used) return json({ error: 'Link đã được dùng rồi' }, 400);
  const now = Math.floor(Date.now() / 1000);
  if (row.expires_at < now) return json({ error: 'Link đã hết hạn. Yêu cầu link mới.' }, 400);

  const passwordHash = await hashPassword(password);

  // Atomic-ish: update password, mark token used, kill all sessions of user
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE users
          SET password_hash = ?, email_verified = 1, updated_at = unixepoch()
        WHERE id = ?`
    ).bind(passwordHash, row.user_id),
    env.DB.prepare(
      `UPDATE password_reset_tokens SET used = 1 WHERE token = ?`
    ).bind(token),
    env.DB.prepare(
      `DELETE FROM sessions WHERE user_id = ?`
    ).bind(row.user_id),
    // Cleanup các reset token còn lại của user (không dùng nữa)
    env.DB.prepare(
      `DELETE FROM password_reset_tokens WHERE user_id = ? AND used = 0`
    ).bind(row.user_id)
  ]);

  // Auto-login user mới (UX tốt hơn — không bắt họ vào /dang-nhap lại)
  const { id: sessId } = await createSession(env, row.user_id, request);

  return json(
    { success: true, message: 'Đã đặt lại mật khẩu. Bạn đã được đăng nhập.' },
    200,
    { 'Set-Cookie': sessionCookieHeader(sessId) }
  );
}
