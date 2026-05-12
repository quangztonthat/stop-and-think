// GET /api/auth/me — trả về user hiện tại (nếu có session hợp lệ)
import { getSessionUser, json } from './_lib.js';

export async function onRequestGet({ request, env }) {
  const session = await getSessionUser(env, request);
  if (!session) return json({ user: null }, 200);

  // Query thêm các field cần cho trang /tai-khoan (created_at, last_login_at)
  const extra = await env.DB.prepare(
    `SELECT created_at, last_login_at FROM users WHERE id = ?`
  ).bind(session.id).first();

  return json({
    user: {
      id: session.id,
      email: session.email,
      name: session.name,
      avatar_url: session.avatar_url,
      email_verified: !!session.email_verified,
      created_at: extra?.created_at || null,
      last_login_at: extra?.last_login_at || null
    }
  });
}
