// functions/quan-ly/_middleware.js
// Gác /quan-ly/* — chỉ chủ sở hữu mới vào được. Cùng khuôn với functions/hoc/_middleware.js.
// Tái dùng session có sẵn: cookie st_session + bảng `sessions` trong D1 (env.DB).
//
// Vì sao thêm: hôm nay cả site đang ở chế độ bảo trì nên khách đã bị chặn từ
// functions/_middleware.js. Nhưng khi gỡ bảo trì, /quan-ly/ phải tự đứng được —
// trang chia-se.html là chỗ tạo và tắt link chia sẻ, không thể để ai cũng mở.
// (API /api/share vẫn tự kiểm quyền riêng; đây là lớp gác thứ hai.)
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

  if (ok) return next();

  const u = new URL(request.url);
  return new Response(null, {
    status: 302,
    headers: {
      Location: `/pages/dang-nhap.html?redirect=${encodeURIComponent(u.pathname)}`,
      'cache-control': 'no-store',
    },
  });
}
