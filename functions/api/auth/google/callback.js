// GET /api/auth/google/callback?code=...&state=...
// Google đổi authorization code → id_token, server tạo session rồi redirect về site.
//
// Spec note (OIDC Core 3.1.3.7):
//   "Nếu ID Token nhận qua kênh trực tiếp giữa Client và Token Endpoint
//    (chính là server-to-server flow này), TLS server validation MAY thay thế
//    việc verify chữ ký id_token."
// → Bỏ qua JWKS verify, parse payload trực tiếp. An toàn vì:
//   - HTTPS trực tiếp tới oauth2.googleapis.com
//   - Có verify state CSRF
//   - Verify aud == GOOGLE_CLIENT_ID + iss đúng
//
// Bindings cần: env.DB, env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.SITE_URL

import {
  createSession, sessionCookieHeader, redirect, json
} from '../_lib.js';

const ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);

export async function onRequestGet({ request, env }) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return errorPage('Google OAuth chưa cấu hình', 'Thiếu GOOGLE_CLIENT_ID hoặc GOOGLE_CLIENT_SECRET.');
  }

  const url = new URL(request.url);
  const code = (url.searchParams.get('code') || '').trim();
  const state = (url.searchParams.get('state') || '').trim();
  const oauthError = (url.searchParams.get('error') || '').trim();

  if (oauthError) {
    return errorPage('Đăng nhập bị huỷ', `Google trả về lỗi: ${oauthError}`);
  }
  if (!code || !state) {
    return errorPage('Tham số thiếu', 'Không có code hoặc state. Hãy thử đăng nhập lại.');
  }

  // ─── 1. Verify state CSRF + lấy redirect đích ───
  const stateRow = await env.DB.prepare(
    `SELECT redirect, expires_at FROM oauth_states WHERE state = ?`
  ).bind(state).first();

  // One-shot: xoá ngay dù hợp lệ hay không (chống replay)
  await env.DB.prepare(`DELETE FROM oauth_states WHERE state = ?`).bind(state).run();

  if (!stateRow) {
    return errorPage('State không hợp lệ', 'Link đăng nhập đã được dùng hoặc hết hạn. Thử lại.');
  }
  const now = Math.floor(Date.now() / 1000);
  if (stateRow.expires_at < now) {
    return errorPage('Link hết hạn', 'Quá 10 phút từ lúc bắt đầu đăng nhập. Thử lại.');
  }

  // Defense-in-depth: dù google.js đã validate khi lưu DB, vẫn re-check ở đây.
  // Chặn protocol-relative URL (//evil.com) để tránh open redirect nếu DB
  // hoặc validation phía trước bị compromise.
  const stored = stateRow.redirect || '/';
  const safeRedirect = stored.startsWith('/') && !stored.startsWith('//') ? stored : '/';

  // ─── 2. Đổi code → token ───
  const siteUrl = env.SITE_URL || `${url.protocol}//${url.host}`;
  const redirectUri = `${siteUrl}/api/auth/google/callback`;

  let tokenRes;
  try {
    tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    });
  } catch (e) {
    console.error('Google token fetch failed', e);
    return errorPage('Lỗi mạng', 'Không kết nối được Google. Thử lại sau.');
  }

  if (!tokenRes.ok) {
    const errBody = await tokenRes.text();
    console.error('Google token error', tokenRes.status, errBody);
    return errorPage('Google từ chối', 'Không đổi được mã đăng nhập. Có thể link đã hết hạn — thử lại.');
  }

  const tokenJson = await tokenRes.json();
  const idToken = tokenJson.id_token;
  if (!idToken) {
    return errorPage('Thiếu id_token', 'Response Google không chứa id_token.');
  }

  // ─── 3. Parse id_token payload (JWT: header.payload.signature) ───
  let payload;
  try {
    payload = parseJwtPayload(idToken);
  } catch (e) {
    console.error('id_token parse failed', e);
    return errorPage('id_token sai định dạng', 'Không đọc được dữ liệu từ Google.');
  }

  // ─── 4. Validate claims ───
  if (!ISSUERS.has(payload.iss)) {
    return errorPage('Issuer không đúng', `Expected accounts.google.com, got ${payload.iss}`);
  }
  if (payload.aud !== env.GOOGLE_CLIENT_ID) {
    return errorPage('Audience không khớp', 'id_token không dành cho ứng dụng này.');
  }
  if (typeof payload.exp === 'number' && payload.exp < now) {
    return errorPage('id_token hết hạn', 'Thử đăng nhập lại.');
  }

  const sub = String(payload.sub || '');
  const email = String(payload.email || '').toLowerCase();
  const emailVerified = !!payload.email_verified;
  const name = (payload.name || payload.given_name || email.split('@')[0] || 'Người dùng').slice(0, 80);
  const picture = payload.picture || null;

  if (!sub || !email) {
    return errorPage('Dữ liệu thiếu', 'Google không trả sub hoặc email.');
  }
  if (!emailVerified) {
    return errorPage('Email chưa verify', 'Google báo email của bạn chưa được xác thực.');
  }

  // ─── 5. Upsert user ───
  // Ưu tiên match theo google_sub (stable). Fallback theo email (link account cũ).
  let user = await env.DB.prepare(
    `SELECT id, email, name, google_sub, avatar_url FROM users WHERE google_sub = ?`
  ).bind(sub).first();

  if (!user) {
    const byEmail = await env.DB.prepare(
      `SELECT id, email, name, google_sub, avatar_url FROM users WHERE email = ?`
    ).bind(email).first();

    if (byEmail) {
      // Link google_sub vào account email/password sẵn có
      await env.DB.prepare(
        `UPDATE users
            SET google_sub = ?, avatar_url = COALESCE(avatar_url, ?),
                email_verified = 1, updated_at = unixepoch()
          WHERE id = ?`
      ).bind(sub, picture, byEmail.id).run();
      user = { ...byEmail, google_sub: sub, avatar_url: byEmail.avatar_url || picture };
    } else {
      // Tạo user mới (không password — chỉ login bằng Google)
      const ins = await env.DB.prepare(
        `INSERT INTO users (email, name, avatar_url, google_sub, email_verified)
         VALUES (?, ?, ?, ?, 1)`
      ).bind(email, name, picture, sub).run();
      user = { id: ins.meta.last_row_id, email, name, google_sub: sub, avatar_url: picture };
    }
  } else {
    // Refresh avatar/name nhẹ (chỉ khi chưa có)
    if (!user.avatar_url && picture) {
      await env.DB.prepare(
        `UPDATE users SET avatar_url = ?, updated_at = unixepoch() WHERE id = ?`
      ).bind(picture, user.id).run();
    }
  }

  // ─── 6. Tạo session, redirect ───
  const { id: sessId } = await createSession(env, user.id, request);

  return new Response(null, {
    status: 302,
    headers: {
      'Location': safeRedirect,
      'Set-Cookie': sessionCookieHeader(sessId),
      'Cache-Control': 'no-store'
    }
  });
}

// ─── Helpers ───

function parseJwtPayload(jwt) {
  const parts = jwt.split('.');
  if (parts.length !== 3) throw new Error('Not a JWT');
  return JSON.parse(b64UrlDecode(parts[1]));
}

function b64UrlDecode(s) {
  // base64url → base64
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  // atob → binary string → utf-8
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

function errorPage(title, message) {
  const html = `<!DOCTYPE html><html lang="vi"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} — Stop &amp; Think</title>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&display=swap" rel="stylesheet">
<style>
body{font-family:'Fraunces',Georgia,serif;background:#f5ede0;color:#1a1410;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
.box{max-width:560px;text-align:center;padding:48px 32px;background:#ebe1cf;border:2px solid #1a1410}
h1{font-size:32px;font-weight:700;margin:0 0 16px;line-height:1.15}
p{font-size:17px;line-height:1.55;color:#4a3f33;margin:8px 0}
.brand{font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#8b3a2b;margin-bottom:24px}
a{display:inline-block;background:#8b3a2b;color:#f5ede0;padding:14px 28px;text-decoration:none;font-weight:600;letter-spacing:.1em;text-transform:uppercase;font-size:13px;margin-top:32px}
</style></head><body>
<div class="box">
  <div class="brand">Stop &amp; Think</div>
  <h1>${esc(title)}</h1>
  <p>${esc(message)}</p>
  <a href="/dang-nhap">Thử lại</a>
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
