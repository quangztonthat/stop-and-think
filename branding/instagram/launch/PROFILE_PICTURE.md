# Profile Picture — @anhbayofficial

> File `profile-picture.svg` cùng folder. Anh export ra PNG 320×320 hoặc 500×500 → upload lên IG.

---

## 🎨 Design rationale

**Khái niệm:** Brand mark "S & T" với ampersand làm focal point.

**Layout:**
```
┌─────────────────────────┐
│                         │
│    S         &       T  │  ← S T flanking, & là focal
│            (rust)       │
│                         │
│         •               │  ← copper dot (brand signature)
│  STOP & THINK           │  ← mono label
└─────────────────────────┘
```

**Tại sao design này:**

1. **Recognizable ở size nhỏ** — IG profile pic hiển thị 32×32 trong feed/comment. Ampersand là 1 ký tự duy nhất → đọc được ngay
2. **Color đúng brand** — cream bg, rust accent, copper mark. Match toàn site
3. **Không có người** — nếu sau anh muốn personal pic, dễ swap mà không re-brand
4. **Khác biệt** — đa số IG sách dùng book cover photo. Anh dùng typography → stand out
5. **Scale tốt** — SVG không pixelate khi zoom

---

## 📐 Specs

| Spec | Value |
|---|---|
| Format | SVG (master) → PNG (upload) |
| Size | 320×320 (min IG yêu cầu), recommend 500×500 |
| Color space | sRGB |
| Background | `#f5ede0` (cream — match site) |
| Ampersand color | `#8b3a2b` (rust) |
| Letter color | `#1a1410` (ink) |
| Dot color | `#c4923c` (copper) |
| Font | Fraunces Bold 600 + JetBrains Mono |
| File size cuối | ~5KB SVG / ~30KB PNG |

---

## 🛠 Export hướng dẫn (3 cách)

### Cách 1 — Online (free, nhanh nhất)

1. Truy cập `https://cloudconvert.com/svg-to-png`
2. Upload `profile-picture.svg`
3. Settings: width 500, height 500
4. Download

### Cách 2 — Figma

1. Mở Figma, drag SVG vào
2. Export PNG @1x → 500×500

### Cách 3 — Inkscape (offline, native SVG editor)

1. Mở SVG trong Inkscape
2. File → Export → PNG, set 500×500

---

## 🎨 Variant để A/B test (nếu Variant 1 không feel)

Nếu anh thấy design hiện tại không "fit" — có 3 variant khác:

### Variant 2 — chỉ "&" lớn

Bỏ S và T. Chỉ ampersand to giữa, 250pt size, copper dot dưới.
- Pro: clean nhất
- Con: nhìn không rõ là "Stop & Think"

### Variant 3 — book stack icon

3 quyển sách rotate (như hero homepage), mini.
- Pro: visual, kể câu chuyện
- Con: phức tạp, khó đọc ở 32×32

### Variant 4 — chân dung Quang Ton

Dùng ảnh thật (silhouette hoặc photo)
- Pro: cá nhân
- Con: brand chưa thiết lập trước cá nhân

→ Mình recommend **Variant 1 hiện tại**. Nếu sau 6 tháng anh muốn personal hơn, swap sang Variant 4.

---

## ⚠️ Cảnh báo

- **Đừng dùng ảnh có text quá nhỏ** — ở 32×32 (comment thread) sẽ thành nhòe
- **Đừng dùng filter/preset Instagram** — thay đổi color exact, mất brand consistency
- **Đừng dùng emoji** — looks unprofessional cho brand
- **Đừng để background trắng** — IG mặc định background trắng, profile pic sẽ "biến mất". Cream đúng.

---

## 🔗 Liên quan

- [`LAUNCH_PACK.md`](./LAUNCH_PACK.md)
- [`BIO.md`](./BIO.md)

---

© 2026 · Stop & Think · By Quang Ton
