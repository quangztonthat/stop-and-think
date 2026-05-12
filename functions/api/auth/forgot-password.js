// POST /api/auth/forgot-password
// Body: { email }
// Gửi link reset mật khẩu nếu email tồn tại. Trả message giống nhau dù email
// có hay không (chống enumeration).

import { isValidEmail, randomToken, json } from './_lib.js';

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const email = (body.email || '').trim().toLowerCase();
  const honeypot = (body.website || '').trim();

  if (honeypot) {
    // Silent success cho bot
    return json({ success: true, message: 'Nếu email đã đăng ký, link reset đã được gửi.' });
  }
  if (!isValidEmail(email)) {
    return json({ error: 'Email không hợp lệ' }, 400);
  }

  const user = await env.DB.prepare(
    `SELECT id, name, email_verified, google_sub FROM users WHERE email = ?`
  ).bind(email).first();

  // Same response regardless — chống email enumeration
  const SAME_REPLY = {
    success: true,
    message: 'Nếu email đã đăng ký, link đặt lại mật khẩu đã được gửi. Kiểm tra hộp thư trong vài phút.'
  };

  if (!user) return json(SAME_REPLY);

  // Nếu user chỉ login bằng Google (không có password) — vẫn cho phép set
  // password mới, sau đó họ có 2 cách login. Không leak điều đó về client.

  // Rate limit: tối đa 5 reset request/giờ cho cùng 1 user
  const since = Math.floor(Date.now() / 1000) - 3600;
  const recent = await env.DB.prepare(
    `SELECT COUNT(*) AS c FROM password_reset_tokens WHERE user_id = ? AND created_at > ?`
  ).bind(user.id, since).first();
  if (recent && recent.c >= 5) return json(SAME_REPLY); // silent throttle

  const token = randomToken(24); // 48 hex chars
  const expires = Math.floor(Date.now() / 1000) + 3600; // 1 hour
  await env.DB.prepare(
    `INSERT INTO password_reset_tokens (token, user_id, expires_at) VALUES (?, ?, ?)`
  ).bind(token, user.id, expires).run();

  const siteUrl = env.SITE_URL || 'https://flamindi.com';
  const resetUrl = `${siteUrl}/dat-lai-mat-khau?token=${token}`;
  const fromAddr = env.RESEND_FROM || 'Stop & Think <onboarding@resend.dev>';

  const html = `<!DOCTYPE html><html><body style="font-family:Georgia,serif;max-width:560px;margin:32px auto;padding:24px;color:#1a1410;background:#f5ede0">
<h1 style="font-size:22px;font-weight:600;margin:0 0 16px">Stop &amp; Think</h1>
<p style="font-size:16px;line-height:1.5">Chào ${escapeHtml(user.name || '')},</p>
<p style="font-size:16px;line-height:1.5">Bạn (hoặc ai đó) vừa yêu cầu đặt lại mật khẩu cho tài khoản này. Click nút dưới trong vòng <strong>1 giờ</strong>:</p>
<p style="margin:24px 0">
  <a href="${resetUrl}" style="display:inline-block;background:#8b3a2b;color:#f5ede0;padding:12px 24px;text-decoration:none;font-weight:600;letter-spacing:0.05em">Đặt lại mật khẩu</a>
</p>
<p style="font-size:13px;color:#4a3f33">Nếu không phải bạn — bỏ qua email này, mật khẩu cũ vẫn hoạt động.</p>
<hr style="border:none;border-top:1px solid #d9b073;margin:24px 0">
<p style="font-size:12px;color:#4a3f33">Stop &amp; Think · By Quang Ton</p>
</body></html>`;

  const text = `Chào ${user.name || ''},\n\nĐặt lại mật khẩu Stop & Think:\n${resetUrl}\n\nLink có hiệu lực trong 1 giờ. Nếu không phải bạn — bỏ qua email này.\n\n— Stop & Think · By Quang Ton`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromAddr,
        to: [email],
        subject: 'Đặt lại mật khẩu Stop & Think',
        html, text
      })
    });
    if (!res.ok) console.error('Resend reset error', res.status, await res.text());
  } catch (e) {
    console.error('Resend fetch failed (reset)', e);
  }

  return json(SAME_REPLY);
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
