# Auth System — Handoff cho Claude Code

Bộ file dưới đã được tạo sẵn để bạn tiếp tục build signup/login trên Claude Code.

## ✅ Đã có

```
migrations/
└── 0001_auth.sql              # Schema D1: users, sessions, email_verify_tokens,
                               # password_reset_tokens, oauth_states

functions/api/auth/
├── _lib.js                    # PBKDF2 hash, session, cookie, validation helpers
├── signup.js                  # POST /api/auth/signup  (email + password)
├── verify-email.js            # GET  /api/auth/verify-email?token=…
├── login.js                   # POST /api/auth/login
├── logout.js                  # POST/GET /api/auth/logout
├── me.js                      # GET  /api/auth/me
└── google.js                  # GET  /api/auth/google  (bắt đầu OAuth)
```

## 🚧 Cần build tiếp (gợi ý cho Claude Code)

### 1. Google OAuth callback
`functions/api/auth/google/callback.js` — xử lý code từ Google:
- Verify `state` (lookup trong `oauth_states`, xoá sau khi dùng, check expiry).
- POST tới `https://oauth2.googleapis.com/token` đổi code lấy `id_token`.
- Decode JWT id_token (chỉ cần parse payload — Google đã sign, nhưng nên verify chữ ký bằng JWKS của Google để an toàn).
- Lookup user theo `google_sub`, nếu chưa có thì insert (email_verified=1 vì Google đã verify).
- Tạo session, set cookie, redirect về `oauth_states.redirect`.

Cần bindings: `env.GOOGLE_CLIENT_ID`, `env.GOOGLE_CLIENT_SECRET`.

### 2. Trang UI tiếng Việt (theo brand Stop & Think)

- `pages/dang-ky.html` — form email/password/name + nút "Đăng nhập bằng Google" (redirect `/api/auth/google`)
- `pages/dang-nhap.html` — form login + Google
- `pages/quen-mat-khau.html` — request password reset (tuỳ chọn)

Style theo `_recovery/` hoặc các trang `books/` hiện có: bg `#f5ede0`, accent `#8b3a2b`, font Fraunces.

### 3. Frontend auth helper
`assets/auth.v1.js`:
- `auth.getUser()` — fetch `/api/auth/me`, cache trong sessionStorage
- `auth.logout()` — POST `/api/auth/logout` rồi reload
- Render avatar/tên ở header nếu có session

### 4. Password reset (tuỳ chọn)
- `POST /api/auth/forgot-password` — gửi link reset qua Resend
- `POST /api/auth/reset-password` — đổi mật khẩu bằng token

## 🔧 Setup steps

### A. Tạo D1 database (nếu chưa có — bạn đã dùng `env.DB` cho comments rồi nên skip bước này)

```bash
# Check tên DB hiện tại trong wrangler.toml
cat wrangler.toml
```

### B. Apply migration

```bash
# Production (Cloudflare)
npx wrangler d1 execute <DB_NAME> --remote --file=migrations/0001_auth.sql

# Local dev
npx wrangler d1 execute <DB_NAME> --local --file=migrations/0001_auth.sql
```

### C. Env vars (Cloudflare Pages → Settings → Environment variables)

| Variable | Required | Note |
|---|---|---|
| `RESEND_API_KEY` | ✅ | Đã có (dùng cho comments) |
| `RESEND_FROM` | optional | Mặc định `Stop & Think <onboarding@resend.dev>` |
| `SITE_URL` | ✅ | VD `https://flamindi.com` (không có trailing slash) |
| `RATE_LIMIT_SALT` | recommended | Random string để hash IP |
| `GOOGLE_CLIENT_ID` | (cho Google) | Lấy từ Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | (cho Google) | Đặt làm **Secret**, không phải plain |

### D. Google OAuth setup

1. Vào https://console.cloud.google.com → APIs & Services → Credentials
2. Create Credentials → OAuth client ID → Web application
3. Authorized redirect URIs:
   - `https://flamindi.com/api/auth/google/callback`
   - `http://localhost:8788/api/auth/google/callback` (cho `wrangler pages dev`)
4. Copy Client ID + Secret vào Pages env vars

## 🧪 Test checklist

```bash
# 1. Signup
curl -X POST http://localhost:8788/api/auth/signup \
  -H 'content-type: application/json' \
  -d '{"name":"Quang","email":"test@example.com","password":"abc12345"}'

# 2. Check email → click verify link
# 3. /api/auth/me phải trả về user

# 4. Login với email/password
curl -X POST http://localhost:8788/api/auth/login \
  -H 'content-type: application/json' \
  -c cookies.txt \
  -d '{"email":"test@example.com","password":"abc12345"}'

# 5. /api/auth/me với cookie
curl http://localhost:8788/api/auth/me -b cookies.txt

# 6. Logout
curl -X POST http://localhost:8788/api/auth/logout -b cookies.txt
```

## ⚠️ Lưu ý bảo mật

- `password_hash` dùng PBKDF2-SHA256 210k iter (OWASP 2023). Đủ cho hobby site.
- Session token = 64 hex chars (32 bytes random) — opaque, không phải JWT.
- Cookie: `HttpOnly; Secure; SameSite=Lax` (Lax để OAuth callback giữ được cookie).
- Rate limit hiện tại đơn giản (đếm sessions/IP/giờ). Khi cần chặt hơn → gắn **Cloudflare Turnstile** vào form signup.
- Nhớ thêm CSP header trong `_headers` nếu mở form đăng nhập trên trang public:
  ```
  Content-Security-Policy: default-src 'self'; ...
  ```

## 📚 Nội dung file đã tạo

Bạn có thể mở từng file để xem chi tiết — code đã có comment tiếng Việt, dễ chỉnh tiếp.
