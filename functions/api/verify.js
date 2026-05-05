// /api/verify?token=xxx — verify a comment, mark approved
// Cloudflare Pages Function

const PAGE_TO_PATH = {
  'think-again': '/think-again',
  'fooled-by-randomness': '/fooled-by-randomness',
  'so-good': '/so-good',
  'thinking-fast-slow': '/thinking-fast-slow',
  'atomic-habits': '/atomic-habits',
  'grit': '/grit',
  'thinking-in-bets': '/thinking-in-bets',
  'superforecasting': '/superforecasting',
  'innovators-dilemma': '/innovators-dilemma',
  'intelligence-trap': '/intelligence-trap',
  'search-for-meaning': '/search-for-meaning',
  'the-alchemist': '/the-alchemist',
  'psychology-of-money': '/psychology-of-money',
  'mindset': '/mindset',
  'range': '/range',
  'deep-work': '/deep-work',
  'stillness': '/stillness',
  'sapiens': '/sapiens'
};

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const token = (url.searchParams.get('token') || '').trim();

  if (!token || token.length !== 36) {
    return htmlPage('Token không hợp lệ', 'Link xác nhận không đúng định dạng. Hãy click lại link trong email.');
  }

  // Look up comment by token
  const row = await env.DB.prepare(
    `SELECT id, page_id, status, expires_at FROM comments WHERE verify_token = ?`
  ).bind(token).first();

  if (!row) {
    return htmlPage('Không tìm thấy', 'Link xác nhận không hợp lệ hoặc đã hết hạn.');
  }

  if (row.status === 'approved') {
    const path = PAGE_TO_PATH[row.page_id] || '/';
    return htmlPage(
      'Comment đã xác nhận',
      `Comment của bạn đã được duyệt từ trước. Click để về bài.`,
      path + '#comment-' + row.id,
      'Quay lại bài đọc'
    );
  }

  // Check token expiry (24h TTL)
  const now = Math.floor(Date.now() / 1000);
  if (row.expires_at && row.expires_at < now) {
    return htmlPage(
      'Link đã hết hạn',
      'Link xác nhận chỉ có hiệu lực trong 24 giờ. Hãy gửi lại comment để nhận link mới.'
    );
  }

  // Approve and null the token (prevent replay)
  await env.DB.prepare(
    `UPDATE comments
     SET status = 'approved', verified_at = unixepoch(), verify_token = NULL
     WHERE id = ?`
  ).bind(row.id).run();

  const path = PAGE_TO_PATH[row.page_id] || '/';
  return htmlPage(
    'Cảm ơn — comment đã hiển thị',
    'Comment của bạn vừa được public. Click để xem.',
    path + '#comment-' + row.id,
    'Xem comment của bạn'
  );
}

function htmlPage(title, message, ctaUrl = null, ctaLabel = null) {
  const cta = ctaUrl
    ? `<p style="margin:32px 0"><a href="${ctaUrl}" style="display:inline-block;background:#8b3a2b;color:#f5ede0;padding:14px 28px;text-decoration:none;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;font-size:13px">${ctaLabel || 'Tiếp tục'} →</a></p>`
    : '';

  const html = `<!DOCTYPE html><html lang="vi"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} — Stop &amp; Think</title>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&display=swap" rel="stylesheet">
<style>
body { font-family: 'Fraunces', Georgia, serif; background:#f5ede0; color:#1a1410; margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px }
.box { max-width:560px; text-align:center; padding:48px 32px; background:#ebe1cf; border:2px solid #1a1410 }
h1 { font-size:36px; font-weight:700; margin:0 0 16px; line-height:1.1 }
p { font-size:18px; line-height:1.5; color:#4a3f33; margin:8px 0 }
.brand { font-family:'JetBrains Mono',monospace; font-size:11px; letter-spacing:0.2em; text-transform:uppercase; color:#8b3a2b; margin-bottom:24px }
</style></head><body>
<div class="box">
  <div class="brand">Stop &amp; Think</div>
  <h1>${escapeHtml(title)}</h1>
  <p>${escapeHtml(message)}</p>
  ${cta}
</div>
</body></html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex, nofollow',
      'Cache-Control': 'no-store, max-age=0'
    }
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
