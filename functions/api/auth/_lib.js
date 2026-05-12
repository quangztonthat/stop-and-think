// Shared auth helpers — runs on Cloudflare Workers runtime (no Node libs).
// Used by signup/login/logout/me + Google OAuth.

// ─── Crypto / password hashing (PBKDF2-SHA256, 210k iters per OWASP 2023) ───

const PBKDF2_ITERS = 210_000;
const PBKDF2_KEYLEN = 32; // 256 bits

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt);
  return `pbkdf2$${PBKDF2_ITERS}$${b64(salt)}$${b64(hash)}`;
}

export async function verifyPassword(password, stored) {
  if (!stored || !stored.startsWith('pbkdf2$')) return false;
  const [, itersStr, saltB64, hashB64] = stored.split('$');
  const iters = parseInt(itersStr, 10);
  if (!iters) return false;
  const salt = unb64(saltB64);
  const expected = unb64(hashB64);
  const actual = await pbkdf2(password, salt, iters, expected.length);
  return timingSafeEqual(actual, expected);
}

async function pbkdf2(password, salt, iters = PBKDF2_ITERS, keylen = PBKDF2_KEYLEN) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iters },
    key,
    keylen * 8
  );
  return new Uint8Array(bits);
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function b64(buf) {
  return btoa(String.fromCharCode(...buf));
}
function unb64(s) {
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
}

// ─── Random tokens ───

export function randomToken(bytes = 32) {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── Sessions ───

export const SESSION_COOKIE = 'st_session';
export const SESSION_TTL_SEC = 60 * 60 * 24 * 30; // 30 days

export async function createSession(env, userId, request) {
  const id = randomToken(32);
  const now = Math.floor(Date.now() / 1000);
  const expires = now + SESSION_TTL_SEC;
  const ip = request.headers.get('cf-connecting-ip') || '0.0.0.0';
  const ipHash = await sha256Hex(ip + ':' + (env.RATE_LIMIT_SALT || 'sns'));
  const ua = (request.headers.get('user-agent') || '').slice(0, 240);

  await env.DB.prepare(
    `INSERT INTO sessions (id, user_id, expires_at, ip_hash, user_agent)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(id, userId, expires, ipHash, ua).run();

  await env.DB.prepare(
    `UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?`
  ).bind(now, now, userId).run();

  return { id, expires };
}

export async function getSessionUser(env, request) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token || token.length !== 64) return null;

  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.avatar_url, u.email_verified
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.id = ? AND s.expires_at > ?`
  ).bind(token, now).first();

  return row || null;
}

export async function destroySession(env, request) {
  const token = readCookie(request, SESSION_COOKIE);
  if (token) {
    await env.DB.prepare(`DELETE FROM sessions WHERE id = ?`).bind(token).run();
  }
}

// ─── Cookie helpers ───

export function readCookie(request, name) {
  const header = request.headers.get('cookie') || '';
  const parts = header.split(/;\s*/);
  for (const p of parts) {
    const idx = p.indexOf('=');
    if (idx === -1) continue;
    if (p.slice(0, idx) === name) return decodeURIComponent(p.slice(idx + 1));
  }
  return null;
}

export function sessionCookieHeader(token, maxAgeSec = SESSION_TTL_SEC) {
  // HttpOnly + Secure + SameSite=Lax. Lax (not Strict) so OAuth callback redirect
  // back from Google carries the cookie on the first navigation.
  return `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${maxAgeSec}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearCookieHeader(name = SESSION_COOKIE) {
  return `${name}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

// ─── Response helpers ───

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...extraHeaders
    }
  });
}

export function redirect(to, extraHeaders = {}) {
  return new Response(null, {
    status: 302,
    headers: { Location: to, 'cache-control': 'no-store', ...extraHeaders }
  });
}

// ─── Validation ───

export function isValidEmail(s) {
  return typeof s === 'string'
      && s.length <= 120
      && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export function passwordStrength(pw) {
  if (typeof pw !== 'string') return 'Mật khẩu không hợp lệ';
  if (pw.length < 8)   return 'Mật khẩu phải có ít nhất 8 ký tự';
  if (pw.length > 200) return 'Mật khẩu quá dài';
  // Soft check: require at least one letter and one digit
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) {
    return 'Mật khẩu cần có cả chữ và số';
  }
  return null;
}

// ─── Rate limiting (per-IP, sliding window via D1) ───
// Tái dùng bảng sessions không hợp lý — dùng KV nếu có, fallback bằng query đếm bản ghi.
// Ở đây ta dùng cách đơn giản: đếm số session/user record gần đây của IP.
// Khi cần chặt chẽ hơn, gắn Cloudflare Turnstile vào form.

export async function rateLimitByIP(env, request, key, maxPerHour = 10) {
  const ip = request.headers.get('cf-connecting-ip') || '0.0.0.0';
  const ipHash = await sha256Hex(ip + ':' + key + ':' + (env.RATE_LIMIT_SALT || 'sns'));
  const since = Math.floor(Date.now() / 1000) - 3600;

  // Use sessions table as a rough counter (only for sessions created in last hour by this IP).
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS c FROM sessions WHERE ip_hash = ? AND created_at > ?`
  ).bind(ipHash, since).first();

  return (row?.c || 0) < maxPerHour;
}
