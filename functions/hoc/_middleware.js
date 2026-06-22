// functions/hoc/_middleware.js
// Gác /hoc/* — chỉ chủ sở hữu (đăng nhập bằng tài khoản flamindi.com) mới xem được.
// Tái dùng session auth có sẵn: cookie st_session + bảng `sessions` trong D1.
// Không thêm binding mới (dùng env.DB sẵn có).
import { getSessionUser } from '../api/auth/_lib.js';

// Chỉ những email dưới đây được vào /hoc. Thêm email tin cậy nếu cần.
const OWNER_EMAILS = ['quangztonthat@gmail.com'];

export async function onRequest({ request, env, next }) {
  let user = null;
  try {
    user = await getSessionUser(env, request);
  } catch (_) {
    user = null; // DB lỗi -> fail-closed (coi như chưa đăng nhập)
  }

  const ok = user
    && user.email_verified
    && OWNER_EMAILS.includes((user.email || '').toLowerCase());

  if (ok) return next(); // đúng chủ -> trả file học tĩnh dưới /hoc

  // chưa đăng nhập / không phải chủ -> đẩy về trang đăng nhập, kèm ?next để quay lại
  const u = new URL(request.url);
  return new Response(null, {
    status: 302,
    headers: {
      Location: `/pages/dang-nhap.html?next=${encodeURIComponent(u.pathname)}`,
      'cache-control': 'no-store',
    },
  });
}
