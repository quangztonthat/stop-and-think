# BOOKS QUEUE — Workflow

> **File input duy nhất:** `D:\anhbay\BOOKS_QUEUE.xlsx`
> File .md này chỉ là hướng dẫn — Claude đọc list từ Excel, không đọc đây.

---

## 🎯 Cách dùng

1. Mở `BOOKS_QUEUE.xlsx` → tab "Sách cần làm"
2. Paste sách vào cột B (Tên sách) + C (Tác giả) + D (Thể loại) + E (Priority)
3. **Save và đóng Excel** (nếu để mở, Claude không đọc được)
4. Báo Claude: **"chạy tiếp đi"** hoặc **"chạy P0"**

---

## 🤖 Telegram bot — Quy trình tải epub

> Bot: https://web.telegram.org/a/#5634433403

### ⚠️ Giới hạn

- **Tối đa 20 cuốn/ngày** (rate limit của bot Z-Library)
- Search **tối đa 10 trang** mỗi cuốn — không tìm thấy English epub trong 10 trang đầu thì **skip cuốn này** + sang cuốn kế tiếp

### Quy trình 7 bước

**Bước 1.** Gõ `{tên sách} {tác giả}` vào ô Message → Enter

**Bước 2.** Bot trả về danh sách kết quả (~100-200 cuốn). Mỗi kết quả có:
- Tên sách + tác giả
- Ngôn ngữ (English / French / Chinese...)
- Định dạng + size (epub, 9.66 MB)
- Link `/book_xxxxxxx` (xanh)

**Bước 3.** Tìm kết quả phù hợp:
- ✅ Ngôn ngữ: **English** (ưu tiên)
- ✅ Định dạng: **epub** (không lấy pdf/mobi)
- Có thể cần click `(2) next »` xuống page 2, 3, ..., **tối đa 10 trang**
- Sau 10 trang vẫn không có English epub → **skip cuốn này** (status `skip`), sang cuốn kế tiếp

**Bước 4.** Click 1 LẦN vào link xanh `/book_xxxxx` của kết quả phù hợp.

**Bước 5.** Chờ 5-10s → Bot gửi file box `epub | tên_sách.epub | 9.7MB`.

**Bước 6.** **CHUỘT PHẢI vào file → chọn "Download"**.

> ⚠️ **KHÔNG click vào file box** — click sẽ trigger download lần nữa, tải 2 lần. Chỉ chuột phải → Download.

**Bước 7.** File về `C:\Users\admin\Downloads\`. Claude tự move sang `D:\anhbay\library\<slug>.epub`.

### Sau 20 cuốn

- Bot báo rate-limit hoặc không trả file
- Status các cuốn còn lại = `pending`
- Đợi reset 24h, hôm sau tiếp tục bằng lệnh `chạy tiếp đi`

---

## 📂 Pipeline xử lý

Sau khi epub vào `library/`, Claude:

### Step 0 — Đọc docs trước khi build (BẮT BUỘC)

Trước khi build trang sách mới, Claude PHẢI đọc các file trong `D:\anhbay\docs\`:

1. **`HUONG_DAN_TAO_TRANG_SACH.md`** — Quy trình 5 essentials, 4 archetypes, component library, design tokens
2. **`VIET_NHU_NGUOI_THAT.md`** — ★ Anti-AI voice framework (giọng văn cá tính, tránh prose máy móc)
3. **`KIEM_TRA_NOI_DUNG.md`** — Patterns dịch máy cần grep
4. **`RA_SOAT_STYLE_FORMAT.md`** — QA bố cục/CSS/grid/responsive

Đọc rồi mới apply pattern khi build. Mỗi cuốn phải pass cả 4 doc này.

### Step 1-5 — Build pipeline

1. **Extract text** → `_books_raw/<slug>.txt` (Python ebooklib)
2. **Đọc TOC + content** → identify framework + chapters + quotes
   - Áp dụng `HUONG_DAN_TAO_TRANG_SACH.md`: chọn archetype phù hợp (essay / framework / story / argument)
3. **Build trang sách** → `books/<slug>.html` theo template
   - Voice: `VIET_NHU_NGUOI_THAT.md` — không dùng prose AI generic
   - Style: `RA_SOAT_STYLE_FORMAT.md` — match cấu trúc 12 cuốn cũ
4. **Update files:**
   - `assets/books-data.js` — thêm metadata + slug
   - `pages/<category>.html` — thêm card vào category page
   - `sitemap.xml` + `feed.xml` — thêm URL
   - `index.html` — update homepage hero (3 cuốn mới nhất)
   - `assets/content-index.json` — re-build search index
5. **QA pass theo `KIEM_TRA_NOI_DUNG.md`:**
   - Grep patterns dịch máy ("the way that", "in order to" etc trong VN)
   - Check tone: nói chuyện, không tóm tắt
   - Check voice consistency với 12 cuốn cũ
6. **Excel update:**
   - Status: `pending → downloading → downloaded → parsing → parsed → building → done`
   - epub size, text chars
   - Ngày xong = TODAY()

---

## 📊 Status states (column F trong Excel)

| Status | Nghĩa |
|---|---|
| `pending` | Chưa chạy |
| `downloading` | Claude đang tải epub từ Telegram |
| `downloaded` | File đã ở `library/` |
| `parsing` | Đang extract text |
| `parsed` | Đã có text, chưa build trang |
| `building` | Đang build HTML + update files |
| `done` ✅ | Đã lên web |
| `error` ❌ | Bot không tìm được / file hỏng |
| `skip` | Bỏ qua cuốn này |

---

## 📚 Library hiện tại

**Đã có epub trong `library/` (14 file):**

| Cuốn | File | Trang web |
|---|---|---|
| Antifragile | `antifragile.epub` ✅ NEW | đang build |
| Atomic Habits | có | ✅ done |
| Fooled by Randomness | có | ✅ done |
| Grit | có | ✅ done |
| Man's Search for Meaning | có | ✅ done |
| So Good They Can't Ignore You | có | ✅ done |
| Stoicism | có | chưa build |
| Superforecasting | có | ✅ done |
| The Alchemist | có | ✅ done |
| The Innovator's Dilemma | có | ✅ done |
| The Intelligence Trap | có | ✅ done |
| Think Again | có | ✅ done |
| Thinking, Fast and Slow | có | ✅ done |
| Thinking in Bets | có | ✅ done |

---

## 🎯 Lệnh nhanh cho Claude

| Lệnh | Action |
|---|---|
| `chạy P0` | Chỉ chạy sách Priority = P0, tối đa 20 cuốn/ngày |
| `chạy tiếp đi` | Chạy sách kế tiếp (status = pending), tối đa 20 cuốn/ngày |
| `tải {tên}` | Chỉ tải epub, không build trang |
| `build {slug}` | Skip tải, chỉ build trang từ epub có sẵn |
| `audit queue` | Liệt kê status hiện tại của tất cả cuốn |
| `skip {slug}` | Bỏ qua cuốn này, set status = skip |
| `reset rate-limit` | Sau 24h, reset counter để tiếp tục tải |

### Logic Claude tự áp dụng

- **Mỗi session, đếm số lần download** — sau cuốn thứ 20, dừng + báo "đã đủ 20/ngày, mai chạy tiếp"
- **Mỗi cuốn, max 10 pages search** — không thấy English epub → set status `skip` + chuyển cuốn kế
- **Khi gặp error** (bot không reply, file hỏng, etc.) → status `error` + chuyển cuốn kế (không retry vô hạn)

---

© 2026 · Stop & Think · By Quang Ton
