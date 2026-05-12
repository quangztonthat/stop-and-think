// POST /api/auth/logout — xoá session khỏi DB + clear cookie.
// Chỉ POST (không GET) để chống CSRF logout qua <img src> hoặc prefetch.
// Frontend (nav-menu.v1.js, tai-khoan.html) đều gọi POST + credentials: 'include'.
import { destroySession, clearCookieHeader, json } from './_lib.js';

export async function onRequestPost({ request, env }) {
  await destroySession(env, request);
  return json({ success: true }, 200, { 'Set-Cookie': clearCookieHeader() });
}
