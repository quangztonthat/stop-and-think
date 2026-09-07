// Shared auth helpers — runs on Cloudflare Workers runtime (no Node libs).
// Used by signup/login/logout/me + Google OAuth.

// ─── Crypto / password hashing (PBKDF2-SHA256) ───
// 50k iters — phù hợp Cloudflare Workers Free tier CPU limit (10ms/request).
// Bảo mật: 50k vẫn cao hơn NIST 2017 minimum 10k. Web Crypto deriveBits native nên fast.
// OWASP 2023 yêu cầu 600k, nhưng kết hợp rate limit + email verify đủ cho hobby site.
// Nếu upgrade Workers Paid (50ms CPU) → có thể tăng lên 210k.
// verifyPassword đọc iters từ stored hash → upgrade không break user cũ.

const PBKDF2_ITERS = 50_000;
const PBKDF2_KEYLEN = 32; // 256 bits

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt);
  return `pbkdf2$${PBKDF2_ITERS}$${b64(salt)}$${b64(hash)}`;
}

// HASH MỒI (2026-09-07): email không có trong bảng thì mã cũ trả 401 ngay, còn email
// có thật thì chạy PBKDF2 rồi mới trả 401 — người soát đo 1,3 ms so với 25,9 ms, đủ để
// dò một email có tồn tại hay không dù thân phản hồi giống hệt. Băm mồi cùng định dạng,
// cùng số vòng, nên hai nhánh tốn thời gian như nhau. Không phải mật khẩu của ai cả.
export const DUMMY_PASSWORD_HASH =
  'pbkdf2$' + PBKDF2_ITERS + '$AAAAAAAAAAAAAAAAAAAAAA==$' +
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

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

/* ==========================================================================
   CHỐNG DÒ MẬT KHẨU (2026-09-07, sau vòng soát bảo mật)
   --------------------------------------------------------------------------
   Vì sao phải viết mới thay vì dùng rateLimitByIP ở trên: hàm đó đếm trong bảng
   `sessions`, tức chỉ đếm những lần đăng nhập THÀNH CÔNG. Dò mật khẩu toàn là
   lần THẤT BẠI nên không để lại dòng nào — nó đếm đúng thứ không cần đếm. Ngoài
   ra nó băm `ip:key:salt` khi đọc, còn createSession lưu `ip:salt`, hai chuỗi
   khác nhau nên COUNT luôn bằng 0. Hàm đó cũng không được gọi ở đâu.

   Cách làm ở đây: một bảng riêng chỉ ghi LẦN THẤT BẠI, đếm theo cửa sổ trượt.
   - Hai trục, vì mỗi trục bịt một kiểu tấn công:
       theo IP    — chặn một máy thử nhiều mật khẩu (ngưỡng chặt).
       theo EMAIL — chặn nhiều máy cùng thử một tài khoản (ngưỡng rộng hơn, vì
                    trục này có thể bị lợi dụng để khoá chính chủ).
   - Đăng nhập ĐÚNG thì xoá sạch bộ đếm của email đó: gõ sai vài lần rồi nhớ ra
     mật khẩu là được vào ngay, không phải ngồi chờ.
   - Không lưu email thô, chỉ lưu băm có muối.
   - Bảng tự tạo lần gọi đầu, không cần migration tay.
   - Bảng hỏng thì CHO QUA (fail-open) — đây là lớp phụ; fail-closed ở đây nghĩa
     là một lỗi bảng cũng khoá luôn chủ khỏi chính site của mình.
   ========================================================================== */
export const LOGIN_LIMIT = { WINDOW: 900, MAX_IP: 10, MAX_EMAIL: 30 };

// Bảng chỉ cần dựng MỘT lần cho mỗi isolate. Bản đầu gọi CREATE trong cả hai hàm
// nên mỗi lần thử sai tốn 4 câu DDL — biến chính đường đăng nhập thành đường đốt
// quota D1 cho kẻ dò. (Người soát độc lập đếm được 9 câu/lần sai.)
let _loginTableReady = false;

async function loginAttemptsTable(env) {
  if (_loginTableReady) return;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS login_attempts (
       ip_hash TEXT NOT NULL,
       email_hash TEXT NOT NULL,
       at INTEGER NOT NULL
     )`
  ).run();
  await env.DB.prepare(
    'CREATE INDEX IF NOT EXISTS idx_login_attempts_at ON login_attempts(at)'
  ).run();
  _loginTableReady = true;
}

// IP QUEN: IP này đã từng đăng nhập THÀNH CÔNG và phiên đó còn hạn.
// Dùng để gỡ đúng một đường DoS: trục đếm theo email vốn có thể bị lợi dụng để
// khoá chính chủ ra khỏi site (email chủ nằm công khai trong mã, kẻ tấn công chỉ
// cần ~30 request mỗi 15 phút từ vài IP). Máy của chủ gần như luôn là IP quen, nên
// trục email không áp cho nó; trục IP vẫn áp đủ cho mọi người.
async function isKnownIp(env, request) {
  try {
    const ip = request.headers.get('cf-connecting-ip') || '0.0.0.0';
    const ipHash = await sha256Hex(ip + ':' + (env.RATE_LIMIT_SALT || 'sns'));
    const row = await env.DB.prepare(
      'SELECT 1 AS x FROM sessions WHERE ip_hash = ? AND expires_at > ? LIMIT 1'
    ).bind(ipHash, Math.floor(Date.now() / 1000)).first();
    return !!row;
  } catch (_) {
    return false;
  }
}

// scope tách bộ đếm từng cửa: dò mật khẩu ở /login và spam đăng ký ở /signup là hai
// việc khác nhau; trộn chung thì một bên đầy sẽ khoá oan bên kia.
async function loginHashes(env, request, email, scope) {
  const salt = env.RATE_LIMIT_SALT || 'sns';
  const ip = request.headers.get('cf-connecting-ip') || '0.0.0.0';
  return {
    ipHash: await sha256Hex(ip + ':' + scope + ':' + salt),
    emailHash: await sha256Hex(email + ':' + scope + ':' + salt),
  };
}

/** true = cho thử tiếp; false = đã quá ngưỡng, phải trả 429. */
export async function loginAllowed(env, request, email, scope = 'login') {
  try {
    await loginAttemptsTable(env);
    const { ipHash, emailHash } = await loginHashes(env, request, email, scope);
    const since = Math.floor(Date.now() / 1000) - LOGIN_LIMIT.WINDOW;
    const row = await env.DB.prepare(
      `SELECT
         SUM(CASE WHEN ip_hash = ? THEN 1 ELSE 0 END)    AS by_ip,
         SUM(CASE WHEN email_hash = ? THEN 1 ELSE 0 END) AS by_email
       FROM login_attempts WHERE at > ?`
    ).bind(ipHash, emailHash, since).first();
    if (Number(row?.by_ip || 0) >= LOGIN_LIMIT.MAX_IP) return false;
    if (Number(row?.by_email || 0) >= LOGIN_LIMIT.MAX_EMAIL) {
      // Quá ngưỡng theo email: chỉ chặn nếu đây KHÔNG phải máy quen. Nếu không,
      // ai cũng khoá được chủ khỏi site chỉ bằng cách gõ sai mật khẩu của chủ.
      return await isKnownIp(env, request);
    }
    return true;
  } catch (_) {
    return true; // lớp phụ hỏng thì không được khoá người thật
  }
}

export async function recordLoginFailure(env, request, email, scope = 'login') {
  try {
    await loginAttemptsTable(env);
    const { ipHash, emailHash } = await loginHashes(env, request, email, scope);
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      'INSERT INTO login_attempts (ip_hash, email_hash, at) VALUES (?, ?, ?)'
    ).bind(ipHash, emailHash, now).run();
    // Dọn rác thưa tay: mỗi lần ghi đều DELETE thì kẻ dò ép chạy thêm một câu D1
    // cho mỗi lần thử. Một phần hai mươi là đủ để bảng không phình.
    if (Math.random() < 0.05) {
      await env.DB.prepare('DELETE FROM login_attempts WHERE at < ?')
        .bind(now - 24 * 3600).run();
    }
  } catch (_) {}
}

export async function clearLoginFailures(env, request, email, scope = 'login') {
  try {
    // Xoá theo CẢ HAI trục của chính máy này. Bản đầu xoá theo mỗi email_hash,
    // nên chủ đăng nhập đúng một cái là xoá luôn các dòng kẻ tấn công đang tích
    // từ máy khác — tặng nó một lần reset trục IP.
    const { ipHash, emailHash } = await loginHashes(env, request, email, scope);
    await env.DB.prepare(
      'DELETE FROM login_attempts WHERE email_hash = ? AND ip_hash = ?'
    ).bind(emailHash, ipHash).run();
  } catch (_) {}
}

