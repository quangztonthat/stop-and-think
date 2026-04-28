// /api/comments — POST (submit) and GET (list)
// Cloudflare Pages Function
// Bindings expected: env.DB (D1), env.RESEND_API_KEY, env.SITE_URL

const ALLOWED_PAGES = new Set([
  'think-again', 'fooled-by-randomness', 'so-good',
  'thinking-fast-slow', 'atomic-habits', 'grit',
  'thinking-in-bets', 'superforecasting',
  'innovators-dilemma', 'intelligence-trap',
  'search-for-meaning', 'the-alchemist',
  'psychology-of-money', 'mindset', 'range',
  'deep-work', 'stillness', 'sapiens'
]);

const MAX_NAME = 80;
const MAX_EMAIL = 120;
const MAX_CONTENT = 2000;
const RATE_LIMIT_WINDOW_SEC = 3600; // 1 hour
const RATE_LIMIT_MAX = 3;

// ─── GET /api/comments?page=so-good ───
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const pageId = (url.searchParams.get('page') || '').trim();

  if (!ALLOWED_PAGES.has(pageId)) {
    return json({ error: 'Invalid page' }, 400);
  }

  const { results } = await env.DB.prepare(
    `SELECT id, parent_id, author_name, content, created_at
     FROM comments
     WHERE page_id = ? AND status = 'approved'
     ORDER BY created_at ASC`
  ).bind(pageId).all();

  return json({ comments: results || [] });
}

// ─── POST /api/comments ───
export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const pageId = (body.pageId || '').trim();
  const name = (body.name || '').trim();
  const email = (body.email || '').trim().toLowerCase();
  const content = (body.content || '').trim();
  const parentId = body.parentId ? parseInt(body.parentId, 10) : null;
  const honeypot = (body.website || '').trim();

  // ─── Honeypot: real users never see/fill this field ───
  if (honeypot) {
    // Silent success — bot thinks it worked, but we don't insert
    return json({ success: true, message: 'Đã gửi link xác nhận đến email.' });
  }

  // ─── Validation ───
  if (!ALLOWED_PAGES.has(pageId)) return json({ error: 'Trang không hợp lệ' }, 400);
  if (!name || name.length > MAX_NAME) return json({ error: 'Tên không hợp lệ' }, 400);
  if (!isValidEmail(email) || email.length > MAX_EMAIL) return json({ error: 'Email không hợp lệ' }, 400);
  if (!content || content.length > MAX_CONTENT) return json({ error: 'Nội dung trống hoặc quá dài (max 2000 ký tự)' }, 400);
  if (parentId && !Number.isInteger(parentId)) return json({ error: 'parentId không hợp lệ' }, 400);

  // ─── Rate limit by IP ───
  const ip = request.headers.get('cf-connecting-ip') || '0.0.0.0';
  const ipHash = await sha256(ip + ':' + (env.RATE_LIMIT_SALT || 'sns'));

  const recent = await env.DB.prepare(
    `SELECT COUNT(*) AS c FROM comments
     WHERE ip_hash = ? AND created_at > ?`
  ).bind(ipHash, Math.floor(Date.now() / 1000) - RATE_LIMIT_WINDOW_SEC).first();

  if (recent && recent.c >= RATE_LIMIT_MAX) {
    return json({ error: 'Quá nhiều comment từ thiết bị này. Đợi 1 giờ rồi thử lại.' }, 429);
  }

  // ─── Verify parent if reply ───
  if (parentId) {
    const parent = await env.DB.prepare(
      'SELECT id FROM comments WHERE id = ? AND page_id = ? AND status = ?'
    ).bind(parentId, pageId, 'approved').first();
    if (!parent) return json({ error: 'Comment gốc không tồn tại' }, 400);
  }

  // ─── Insert pending comment ───
  const verifyToken = crypto.randomUUID();
  const expiresAt = Math.floor(Date.now() / 1000) + 86400; // 24h TTL
  await env.DB.prepare(
    `INSERT INTO comments (page_id, parent_id, author_name, author_email, content, verify_token, status, ip_hash, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
  ).bind(pageId, parentId, name, email, content, verifyToken, ipHash, expiresAt).run();

  // ─── Send verification email via Resend ───
  const siteUrl = env.SITE_URL || 'https://stop-and-think.pages.dev';
  const verifyUrl = `${siteUrl}/api/verify?token=${verifyToken}`;

  const emailResult = await sendVerificationEmail(env, {
    to: email,
    name,
    pageId,
    content,
    verifyUrl
  });

  if (!emailResult.ok) {
    return json({ error: 'Không gửi được email xác nhận. Thử lại sau.' }, 500);
  }

  return json({
    success: true,
    message: `Đã gửi link xác nhận đến ${email}. Click vào link trong email để comment hiển thị công khai.`
  });
}

// ─── Helpers ───
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

function isValidEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

async function sha256(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function sendVerificationEmail(env, { to, name, pageId, content, verifyUrl }) {
  const fromAddr = env.RESEND_FROM || 'Stop & Think <onboarding@resend.dev>';
  const subject = `Xác nhận comment trên Stop & Think (${pageId})`;
  const preview = content.slice(0, 100) + (content.length > 100 ? '…' : '');

  const html = `<!DOCTYPE html><html><body style="font-family:Georgia,serif;max-width:560px;margin:32px auto;padding:24px;color:#1a1410;background:#f5ede0">
    <h1 style="font-size:22px;font-weight:600;margin:0 0 16px">Stop &amp; Think</h1>
    <p style="font-size:16px;line-height:1.5">Chào ${escapeHtml(name)},</p>
    <p style="font-size:16px;line-height:1.5">Bạn vừa gửi comment trên trang <strong>${escapeHtml(pageId)}</strong>:</p>
    <blockquote style="border-left:3px solid #8b3a2b;margin:16px 0;padding:8px 16px;background:#ebe1cf;font-size:15px">${escapeHtml(preview)}</blockquote>
    <p style="font-size:16px;line-height:1.5">Click nút dưới để xác nhận. Comment sẽ hiển thị ngay sau đó.</p>
    <p style="margin:24px 0">
      <a href="${verifyUrl}" style="display:inline-block;background:#8b3a2b;color:#f5ede0;padding:12px 24px;text-decoration:none;font-weight:600;letter-spacing:0.05em">Xác nhận comment</a>
    </p>
    <p style="font-size:13px;color:#4a3f33;margin-top:32px">Nếu không phải bạn — bỏ qua email này.</p>
    <hr style="border:none;border-top:1px solid #d9b073;margin:24px 0">
    <p style="font-size:12px;color:#4a3f33">Stop &amp; Think · By Quang Ton</p>
  </body></html>`;

  const text = `Chào ${name},\n\nBạn vừa gửi comment trên Stop & Think (${pageId}):\n\n"${preview}"\n\nXác nhận tại: ${verifyUrl}\n\nNếu không phải bạn — bỏ qua email này.\n\n— Stop & Think · By Quang Ton`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromAddr,
        to: [to],
        subject,
        html,
        text
      })
    });
    if (!res.ok) {
      const errBody = await res.text();
      console.error('Resend error', res.status, errBody);
      return { ok: false, status: res.status, body: errBody };
    }
    return { ok: true };
  } catch (e) {
    console.error('Resend fetch failed', e);
    return { ok: false };
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
