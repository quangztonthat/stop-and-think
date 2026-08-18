// functions/_middleware.js
// CHẾ ĐỘ BẢO TRÌ TOÀN SITE (2026-07-12, theo yêu cầu Quang: "đưa sang private hết, sửa xong hết mới public").
// - Chủ (đăng nhập flamindi, email trong OWNER_EMAILS) -> xem site bình thường.
// - Khách -> trang /bao-tri.html với HTTP 503 (tạm thời, SEO-safe) + no-store.
// - Mở tối thiểu: trang đăng nhập + API auth (để chủ đăng nhập được), assets, favicon, robots.
// GỠ BẢO TRÌ: xoá file này (hoặc đổi MAINTENANCE = false) rồi push. /hoc vẫn có gác riêng của nó.
// LƯU Ý CACHE: các trang từng bị edge-cache trước khi bật bảo trì có thể còn được trả cho khách
// tới khi hết TTL — muốn kín ngay: Cloudflare dashboard -> Caching -> Purge Everything.
import { getSessionUser } from './api/auth/_lib.js';

const MAINTENANCE = true;
const OWNER_EMAILS = ['quangztonthat@gmail.com'];

const OPEN_PREFIXES = [
  '/api/auth/',            // đăng nhập / OAuth callback
  '/assets/',              // css/js/fonts cho trang đăng nhập
  '/pages/dang-nhap',      // trang đăng nhập (cả pretty URL lẫn .html)
  '/pages/quen-mat-khau',
  '/pages/dat-lai-mat-khau',
];
const OPEN_EXACT = [
  '/bao-tri.html', '/favicon.svg', '/favicon.ico', '/apple-touch-icon.png',
  '/og-image.png', '/og-image.svg', '/robots.txt',
];

// Ngoại lệ cho link chia sẻ riêng — khớp CHÍNH XÁC, KHÔNG dùng tiền tố.
// Lý do: tiền tố '/d/' còn đúng với '/d/<token>/gì-đó' hay token viết hoa, tức
// mở rộng hơn thứ thật sự cần mở. (Kiểu '/d/%2e%2e/hoc/' thì new URL() đã tự
// giải mã và rút gọn thành '/hoc/' trước khi tới đây, nên không phải mối lo.)
// Hai biểu thức dưới đây chỉ khớp đúng những gì cần:
//   /d/<64 hex>              -> functions/d/[token].js tự gác quyền bằng D1
//   /phan-tich/assets/<tệp>  -> chỉ st.css + woff2, không có nội dung bài
const OPEN_RE = [
  /^\/d\/[a-f0-9]{64}$/,
  /^\/phan-tich\/assets\/[A-Za-z0-9._-]+$/,
];

export async function onRequest({ request, env, next }) {
  if (!MAINTENANCE) return next();
  const path = new URL(request.url).pathname;
  if (OPEN_EXACT.includes(path)
      || OPEN_PREFIXES.some((p) => path.startsWith(p))
      || OPEN_RE.some((re) => re.test(path))) return next();

  let user = null;
  try {
    user = await getSessionUser(env, request);
  } catch (_) {
    user = null; // DB lỗi -> fail-closed
  }
  const ok = user
    && user.email_verified
    && OWNER_EMAILS.includes((user.email || '').toLowerCase());
  if (ok) return next();

  const page = await env.ASSETS.fetch(new URL('/bao-tri.html', request.url));
  return new Response(page.body, {
    status: 503,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'retry-after': '86400',
    },
  });
}
