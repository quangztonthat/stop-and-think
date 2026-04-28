# Git Setup — Stop & Think

> Hướng dẫn init git repo + push lên GitHub. Chạy trên Windows PowerShell.

---

## ⚠️ Trước khi bắt đầu

**Xóa thư mục `.git` cũ nếu có** (mình đã thử init từ sandbox, có thể để lại file lỗi):

```powershell
cd D:\anhbay
Remove-Item -Recurse -Force .git -ErrorAction SilentlyContinue
```

---

## 🚀 Setup (chạy 1 lần)

### Bước 1: Configure git (nếu chưa có)

```powershell
git config --global user.email "quangztonthat@gmail.com"
git config --global user.name "Quang Ton"
git config --global init.defaultBranch main
```

### Bước 2: Init repo

```powershell
cd D:\anhbay
git init
git add .gitignore
git commit -m "chore: add gitignore"
```

### Bước 3: First commit toàn project

```powershell
git add .
git status                      # xem những gì sẽ commit
git commit -m "feat: initial commit — 18 books + IG launch + glossary system"
```

### Bước 4: Tạo repo trên GitHub

1. Mở https://github.com/new
2. Repository name: `stop-and-think` (hoặc tên khác anh muốn)
3. **Private** (nên chọn vì chưa muốn public toàn site)
4. KHÔNG tick "Initialize with README" (mình đã có content rồi)
5. Click **Create repository**

### Bước 5: Connect + push

GitHub sẽ hiện URL kiểu `https://github.com/quangtonthat/stop-and-think.git`. Copy về:

```powershell
git remote add origin https://github.com/quangtonthat/stop-and-think.git
git branch -M main
git push -u origin main
```

GitHub sẽ hỏi đăng nhập — dùng **Personal Access Token** thay vì password:

1. Vào https://github.com/settings/tokens → Generate new token (classic)
2. Tick scope `repo` (full control)
3. Copy token (chỉ hiện 1 lần)
4. Paste vào prompt password khi push

> **Mẹo:** Cài [GitHub Desktop](https://desktop.github.com/) thay PowerShell cho dễ — auth tự động qua browser, không cần token thủ công.

---

## 🔁 Workflow hằng ngày

Sau khi setup xong, mỗi lần đổi gì → commit + push:

```powershell
cd D:\anhbay
git status                      # xem file đã đổi
git add .                       # stage tất cả
git commit -m "feat: thêm cuốn X"
git push
```

### Conventional Commit prefix

| Prefix | Khi nào |
|---|---|
| `feat:` | Thêm tính năng / cuốn sách mới |
| `fix:` | Sửa bug |
| `refactor:` | Đổi code không đổi behavior |
| `docs:` | Sửa docs / README |
| `style:` | CSS / format |
| `chore:` | Update dependencies, gitignore... |

---

## 📋 Đã được .gitignore (KHÔNG push)

| Path | Lý do |
|---|---|
| `library/*.epub` | Sách bản quyền |
| `_books_raw/*.txt` | Text extract — local only |
| `docs/` | Tài liệu nội bộ về cách build |
| `_build_books.py`, `_build_glossary*.py`, `_regen_feed_index.py` | Build scripts dùng local |
| `_glossary_data.json` | Source data của GLOSSARY.xlsx |
| `AUDIT_REPORT_*.txt` | Internal audit |
| `.~lock.*.xlsx#` | LibreOffice/Excel file lock |
| `__pycache__/`, `*.pyc` | Python cache |
| `node_modules/` | Node deps (nếu có) |

**Nhưng SẼ push:**

- Tất cả 18 trang sách HTML trong `books/`
- Folder `assets/`, `pages/`, `branding/`, `functions/`, `quan-ly/`, `migrations/`
- `index.html`, `404.html`, `_redirects`, `sitemap.xml`, `feed.xml`, `robots.txt`
- `BOOKS_QUEUE.md`, `BOOKS_QUEUE.xlsx`, `GLOSSARY.xlsx`
- `_apply_glossary.py` (script sync glossary lên HTML — public)

---

## 🔌 Connect Cloudflare Pages

Sau khi push lên GitHub, vào Cloudflare Dashboard:

1. **Workers & Pages → Create application → Pages → Connect to Git**
2. Chọn repo `stop-and-think`
3. Build setting:
   - Framework: **None**
   - Build command: (để trống)
   - Output directory: `/`
4. Deploy

Mỗi lần push lên `main` → Cloudflare auto-deploy ~30s. URL: `https://stop-and-think.pages.dev`

---

## 🆘 Trouble

### "fatal: not a git repository"

```powershell
cd D:\anhbay
git init
```

### "remote origin already exists"

```powershell
git remote remove origin
git remote add origin <URL mới>
```

### Push bị reject vì remote có content

```powershell
git pull origin main --rebase
git push
```

### File bí mật lỡ commit

```powershell
# Xóa khỏi git history (NHƯNG vẫn giữ trên disk)
git rm --cached <file>
echo "<file>" >> .gitignore
git add .gitignore
git commit -m "chore: remove <file> from git, add to gitignore"
git push
```

---

© 2026 · Stop &amp; Think · By Quang Ton
