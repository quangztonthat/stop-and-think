// functions/teach/_middleware.js
// Gác /teach/* — chỉ chủ sở hữu (đăng nhập tài khoản flamindi.com) mới xem được.
// Cùng khuôn với functions/hoc/_middleware.js, thêm hai điều cho trang học:
//  - phản hồi cho chủ mang `private, no-store` để tầng CDN không giữ bản nào
//    rồi trả nhầm cho khách;
//  - X-Robots-Tag noindex.
// Đứng được một mình: khi gỡ chế độ bảo trì ở functions/_middleware.js, /teach vẫn khoá.
import { getSessionUser } from '../api/auth/_lib.js';

const OWNER_EMAILS = ['quangztonthat@gmail.com'];

export async function onRequest({ request, env, next }) {
  let user = null;
  try {
    user = await getSessionUser(env, request);
  } catch (_) {
    user = null; // DB lỗi -> fail-closed
  }

  const ok = user
    && user.email_verified
    && OWNER_EMAILS.includes((user.email || '').toLowerCase());

  if (ok) {
    const res = await next();
    const out = new Response(res.body, res);
    out.headers.set('cache-control', 'private, no-store');
    out.headers.set('x-robots-tag', 'noindex, nofollow, noarchive');
    return out;
  }

  const u = new URL(request.url);
  return new Response(null, {
    status: 302,
    headers: {
      Location: `/pages/dang-nhap.html?redirect=${encodeURIComponent(u.pathname)}`,
      'cache-control': 'no-store',
    },
  });
}
