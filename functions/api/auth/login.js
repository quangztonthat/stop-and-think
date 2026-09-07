// POST /api/auth/login
// Body: { email, password }
// Trả về cookie session HTTP-only.

import {
  verifyPassword, isValidEmail,
  createSession, sessionCookieHeader, json,
  loginAllowed, recordLoginFailure, clearLoginFailures, DUMMY_PASSWORD_HASH
} from './_lib.js';

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  // Thân JSON lạ ({"email":123}, {"email":{}}, null) từng làm .trim() ném lỗi ra
  // ngoài -> 500 kèm dấu vết, thay vì 400 gọn. Chỉ nhận chuỗi, thứ khác coi như rỗng.
  const email = (typeof body?.email === 'string' ? body.email : '').trim().toLowerCase();
  const password = typeof body?.password === 'string' ? body.password : '';

  if (!isValidEmail(email) || !password) {
    return json({ error: 'Email hoặc mật khẩu không hợp lệ' }, 400);
  }

  // CHỐNG DÒ MẬT KHẨU. Đặt TRƯỚC khi tra người dùng và trước khi băm mật khẩu:
  // vừa cắt được vòng lặp dò, vừa không tốn PBKDF2 cho mỗi lần thử.
  // Thông điệp chung, không nói còn mấy lần — nói ra là chỉ đường cho máy dò.
  if (!(await loginAllowed(env, request, email))) {
    return json({ error: 'Thử sai quá nhiều lần. Chờ ít phút rồi thử lại.' }, 429,
                { 'Retry-After': '900' });
  }

  const user = await env.DB.prepare(
    `SELECT id, email, name, avatar_url, email_verified, password_hash
       FROM users WHERE email = ?`
  ).bind(email).first();

  // Generic error message — tránh leak email tồn tại hay không
  const bad = async () => {
    await recordLoginFailure(env, request, email);
    return json({ error: 'Email hoặc mật khẩu không đúng' }, 401);
  };
  if (!user || !user.password_hash) {
    // Vẫn băm một lần với hash mồi. Không có bước này, nhánh "email không tồn tại"
    // trả lời nhanh gấp 20 lần nhánh "email có thật, sai mật khẩu" — đủ để dò xem
    // một địa chỉ có tài khoản hay không, dù chữ trả về giống hệt nhau.
    await verifyPassword(password, DUMMY_PASSWORD_HASH);
    return await bad();
  }

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) return await bad();

  if (!user.email_verified) {
    // Tới được đây nghĩa là MẬT KHẨU ĐÚNG. Với tài khoản chưa kích hoạt, đường này
    // xác nhận mật khẩu cho kẻ dò mà không tốn lần thất bại nào -> tính nó vào bộ đếm.
    await recordLoginFailure(env, request, email);
    return json({
      error: 'Tài khoản chưa kích hoạt. Hãy kiểm tra email để click link xác nhận.'
    }, 403);
  }

  // Đúng mật khẩu -> xoá bộ đếm của email này. Gõ sai vài lần rồi nhớ ra thì vào
  // được ngay, không phải ngồi chờ hết cửa sổ.
  await clearLoginFailures(env, request, email);

  const { id: sessId } = await createSession(env, user.id, request);

  return json({
    success: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar_url: user.avatar_url
    }
  }, 200, { 'Set-Cookie': sessionCookieHeader(sessId) });
}
