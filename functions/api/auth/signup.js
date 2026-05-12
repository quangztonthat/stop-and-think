// POST /api/auth/signup
// Body: { email, password, name }
// Tạo user (pending verify), gửi email xác nhận qua Resend.
//
// Bindings cần: env.DB (D1), env.RESEND_API_KEY, env.SITE_URL, env.RESEND_FROM (optional)

import {
  hashPassword, isValidEmail, passwordStrength,
  randomToken, json
} from './_lib.js';

const MAX_NAME = 80;

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const email = (body.email || '').trim().toLowerCase();
  const password = body.password || '';
  const name = (body.name || '').trim();
  const honeypot = (body.website || '').trim();

  // Honeypot — silent success for bots
  if (honeypot) {
    return json({ success: true, message: 'Đã gửi link xác nhận đến email.' });
  }

  if (!name || name.length > MAX_NAME) return json({ error: 'Tên không hợp lệ' }, 400);
  if (!isValidEmail(email))            return json({ error: 'Email không hợp lệ' }, 400);
  const pwErr = passwordStrength(password);
  if (pwErr) return json({ error: pwErr }, 400);

  // Đã tồn tại?
  const existing = await env.DB.prepare(
    `SELECT id, email_verified, password_hash FROM users WHERE email = ?`
  ).bind(email).first();

  if (existing) {
    if (existing.email_verified) {
      return json({ error: 'Email đã được đăng ký. Hãy đăng nhập.' }, 409);
    }
    // User cũ chưa verify → cho phép gửi lại link (không reset password)
    // Nhưng nếu họ đang đặt password mới thì update password_hash.
    const newHash = await hashPassword(password);
    await env.DB.prepare(
      `UPDATE users SET password_hash = ?, name = ?, updated_at = unixepoch() WHERE id = ?`
    ).bind(newHash, name, existing.id).run();

    await sendVerifyEmail(env, { userId: existing.id, email, name });
    return json({
      success: true,
      message: `Đã gửi lại link xác nhận đến ${email}.`
    });
  }

  // ─── Tạo user mới ───
  const passwordHash = await hashPassword(password);
  const res = await env.DB.prepare(
    `INSERT INTO users (email, name, password_hash, email_verified)
     VALUES (?, ?, ?, 0)`
  ).bind(email, name, passwordHash).run();

  const userId = res.meta.last_row_id;
  await sendVerifyEmail(env, { userId, email, name });

  return json({
    success: true,
    message: `Đã gửi link xác nhận đến ${email}. Click vào link trong email để kích hoạt tài khoản.`
  });
}

// ─── Helpers ───

async function sendVerifyEmail(env, { userId, email, name }) {
  const token = randomToken(24); // 48 hex chars
  const expires = Math.floor(Date.now() / 1000) + 86400; // 24h
  await env.DB.prepare(
    `INSERT INTO email_verify_tokens (token, user_id, expires_at) VALUES (?, ?, ?)`
  ).bind(token, userId, expires).run();

  const siteUrl = env.SITE_URL || 'https://flamindi.com';
  const verifyUrl = `${siteUrl}/api/auth/verify-email?token=${token}`;
  const fromAddr = env.RESEND_FROM || 'Stop & Think <onboarding@resend.dev>';

  const html = `<!DOCTYPE html><html><body style="font-family:Georgia,serif;max-width:560px;margin:32px auto;padding:24px;color:#1a1410;background:#f5ede0">
<h1 style="font-size:22px;font-weight:600;margin:0 0 16px">Stop &amp; Think</h1>
<p style="font-size:16px;line-height:1.5">Chào ${escapeHtml(name)},</p>
<p style="font-size:16px;line-height:1.5">Cảm ơn bạn đã đăng ký Stop &amp; Think. Click nút dưới để kích hoạt tài khoản:</p>
<p style="margin:24px 0">
  <a href="${verifyUrl}" style="display:inline-block;background:#8b3a2b;color:#f5ede0;padding:12px 24px;text-decoration:none;font-weight:600;letter-spacing:0.05em">Kích hoạt tài khoản</a>
</p>
<p style="font-size:13px;color:#4a3f33">Link có hiệu lực trong 24 giờ. Nếu không phải bạn — bỏ qua email này.</p>
<hr style="border:none;border-top:1px solid #d9b073;margin:24px 0">
<p style="font-size:12px;color:#4a3f33">Stop &amp; Think · By Quang Ton</p>
</body></html>`;

  const text = `Chào ${name},\n\nKích hoạt tài khoản Stop & Think:\n${verifyUrl}\n\nLink có hiệu lực trong 24 giờ.\n\n— Stop & Think · By Quang Ton`;

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
        subject: 'Kích hoạt tài khoản Stop & Think',
        html, text
      })
    });
    if (!res.ok) console.error('Resend signup error', res.status, await res.text());
  } catch (e) {
    console.error('Resend fetch failed (signup)', e);
  }
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
