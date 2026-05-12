// GET /api/auth/verify-email?token=xxx — kích hoạt user, tạo session, redirect về trang chủ
// Khi click link từ email → set cookie session và đưa user về site đã đăng nhập.

import { createSession, sessionCookieHeader, redirect } from './_lib.js';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const token = (url.searchParams.get('token') || '').trim();

  if (!token) return htmlMsg('Token thiếu', 'Link không hợp lệ.');

  const row = await env.DB.prepare(
    `SELECT t.user_id, t.expires_at, u.email, u.email_verified
       FROM email_verify_tokens t
       JOIN users u ON u.id = t.user_id
      WHERE t.token = ?`
  ).bind(token).first();

  if (!row) return htmlMsg('Không tìm thấy', 'Link xác nhận không hợp lệ hoặc đã dùng.');

  const now = Math.floor(Date.now() / 1000);
  if (row.expires_at < now) {
    return htmlMsg(
      'Link đã hết hạn',
      'Link kích hoạt chỉ có hiệu lực trong 24 giờ. Hãy đăng ký lại để nhận link mới.'
    );
  }

  // Activate user, delete token (one-shot)
  await env.DB.prepare(
    `UPDATE users SET email_verified = 1, updated_at = unixepoch() WHERE id = ?`
  ).bind(row.user_id).run();
  await env.DB.prepare(
    `DELETE FROM email_verify_tokens WHERE token = ?`
  ).bind(token).run();

  // Auto-login
  const { id: sessId } = await createSession(env, row.user_id, request);

  return new Response(null, {
    status: 302,
    headers: {
      'Location': '/?welcome=1',
      'Set-Cookie': sessionCookieHeader(sessId),
      'Cache-Control': 'no-store'
    }
  });
}

function htmlMsg(title, message) {
  const html = `<!DOCTYPE html><html lang="vi"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} — Stop &amp; Think</title>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&display=swap" rel="stylesheet">
<style>
body{font-family:'Fraunces',Georgia,serif;background:#f5ede0;color:#1a1410;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
.box{max-width:560px;text-align:center;padding:48px 32px;background:#ebe1cf;border:2px solid #1a1410}
h1{font-size:36px;font-weight:700;margin:0 0 16px;line-height:1.1}
p{font-size:18px;line-height:1.5;color:#4a3f33;margin:8px 0}
.brand{font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#8b3a2b;margin-bottom:24px}
a{display:inline-block;background:#8b3a2b;color:#f5ede0;padding:14px 28px;text-decoration:none;font-weight:600;letter-spacing:.1em;text-transform:uppercase;font-size:13px;margin-top:32px}
</style></head><body>
<div class="box">
  <div class="brand">Stop &amp; Think</div>
  <h1>${esc(title)}</h1>
  <p>${esc(message)}</p>
  <a href="/dang-ky">Đăng ký lại</a>
</div></body></html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex, nofollow'
    }
  });
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
