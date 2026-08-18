// functions/d/[token].js
// LINK CHIA SẺ RIÊNG cho một bài trong /phan-tich/.
//
// Nguyên tắc bảo mật (bài này dính bảo mật nên viết rõ ra đây):
//  1. Toàn bộ quyền đọc nằm ở BẢN GHI TRONG D1, không nằm ở phía trình duyệt.
//     Tắt link trên trang quản lý -> lần tải kế tiếp trả 404 ngay. Không có
//     "mật khẩu trong URL" kiểu client-side vốn tắt không được.
//  2. Token 32 byte ngẫu nhiên (64 hex) -> không đoán được. Sai token, token
//     đã tắt, hết hạn, hay DB lỗi: TẤT CẢ trả cùng một 404, không lộ thông tin
//     nào về việc token có tồn tại hay không.
//  3. Chỉ phục vụ tệp dưới /phan-tich/<slug>/index.html. slug lấy từ D1 và vẫn
//     bị soi lại bằng regex trước khi ghép đường dẫn -> không đi lạc sang /hoc/,
//     /api/ hay bất kỳ chỗ nào khác dù DB có bị sửa bậy.
//  4. Khách KHÔNG nhận cookie, KHÔNG có session. Token chỉ mở đúng một bài.
//  5. Referrer-Policy: no-referrer -> khách bấm vào nguồn tham khảo thì trang
//     ngoài không nhìn thấy token trong URL.
//  6. X-Robots-Tag noindex/nofollow + không sitemap -> không lên máy tìm kiếm.
//
// Trang trả về là bản đọc gọn: bỏ thanh điều hướng, bỏ link bài trước/bài sau,
// bỏ nút quay lại — những chỗ đó khách bấm vào cũng không vào được.

const ART_DIR  = '/phan-tich/';
const TOKEN_RE = /^[a-f0-9]{64}$/;
const SLUG_RE  = /^[a-z0-9][a-z0-9-]{0,80}$/;

const SHARED_HEADER =
  '<header class="site"><div class="hd-in">' +
  '<span class="wordmark">Stop <i>&amp;</i> Think</span>' +
  '<div class="hd-sp"></div>' +
  '<span class="hd-nav">Bản chia sẻ riêng</span>' +
  '<button class="theme-btn" id="themeBtn" title="Đổi giao diện sáng/tối">&#9728;</button>' +
  '</div></header>';

function notFound() {
  return new Response('Không tìm thấy trang.', {
    status: 404,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex, nofollow',
    },
  });
}

export function sharedView(html) {  // export để test được bằng node
  return html
    // CSS/font nằm ở /phan-tich/assets/, mà trang này phục vụ dưới /d/<token>
    // nên đường dẫn tương đối "../assets/" phải đổi thành đường dẫn tuyệt đối.
    .split('"../assets/').join('"/phan-tich/assets/')
    .replace(/<header class="site">[\s\S]*?<\/header>/, SHARED_HEADER)
    .replace(/<nav class="art-nav">[\s\S]*?<\/nav>/, '')
    .replace(/<a class="backlink"[\s\S]*?<\/a>/, '');
}

export async function onRequestGet({ request, env, params, waitUntil }) {
  const token = typeof params.token === 'string' ? params.token : '';
  if (!TOKEN_RE.test(token)) return notFound();

  let row = null;
  try {
    row = await env.DB.prepare(
      'SELECT slug, enabled, expires_at FROM share_links WHERE token = ?'
    ).bind(token).first();
  } catch (_) {
    return notFound(); // DB lỗi -> fail-closed
  }

  const now = Math.floor(Date.now() / 1000);
  if (!row) return notFound();
  if (Number(row.enabled) !== 1) return notFound();
  if (row.expires_at && Number(row.expires_at) <= now) return notFound();

  const slug = String(row.slug || '');
  if (!SLUG_RE.test(slug)) return notFound();

  const asset = await env.ASSETS.fetch(
    new URL(ART_DIR + slug + '/index.html', request.url)
  );
  if (!asset.ok) return notFound();

  const html = sharedView(await asset.text());

  waitUntil(
    env.DB.prepare(
      'UPDATE share_links SET views = views + 1, last_view_at = ? WHERE token = ?'
    ).bind(now, token).run().catch(() => {})
  );

  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'private, no-store',
      'x-robots-tag': 'noindex, nofollow, noarchive, nosnippet',
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'SAMEORIGIN',
    },
  });
}
