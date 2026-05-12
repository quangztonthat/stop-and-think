// POST /api/auth/logout — xoá session khỏi DB + clear cookie
import { destroySession, clearCookieHeader, json } from './_lib.js';

export async function onRequestPost({ request, env }) {
  await destroySession(env, request);
  return json({ success: true }, 200, { 'Set-Cookie': clearCookieHeader() });
}

// Hỗ trợ cả GET cho link <a> đơn giản
export async function onRequestGet({ request, env }) {
  await destroySession(env, request);
  return new Response(null, {
    status: 302,
    headers: {
      Location: '/',
      'Set-Cookie': clearCookieHeader(),
      'cache-control': 'no-store'
    }
  });
}
