#!/usr/bin/env python3
"""
_mirror_to_en.py — Mirror Vietnamese book/page → en/ folder

Workflow:
  1. Tạo VI file mới: books/new-book.html (manual hoặc qua _build_books.py)
  2. Chạy: python3 _mirror_to_en.py books/new-book.html
     → tạo en/books/new-book.html với hreflang/canonical/og:locale flipped,
       lang-switch swapped (EN active, VI link → /<slug>).
       Nội dung text vẫn VI làm placeholder cho translation pass sau.
  3. Chạy _build_content_en.py để extract → CONTENT_EN.xlsx
  4. User translate trong xlsx
  5. Chạy _apply_content_en.py để write translation back vào EN HTML

Usage:
  python3 _mirror_to_en.py books/atomic-habits.html
  python3 _mirror_to_en.py pages/tu-duy.html
  python3 _mirror_to_en.py --all-books        # re-mirror all 19 books
  python3 _mirror_to_en.py --all-pages        # re-mirror 5 category pages
  python3 _mirror_to_en.py --all              # everything (books + pages + index)
  python3 _mirror_to_en.py --diff books/atomic-habits.html  # dry-run
"""

import argparse
import re
import sys
from pathlib import Path


def get_slug(html_path: Path) -> str:
    """Extract slug from path: books/atomic-habits.html → atomic-habits"""
    return html_path.stem


def clean_url_for(rel_path: str) -> str:
    """Map VI HTML path → clean URL via _redirects rules."""
    if rel_path == 'index.html':
        return '/'
    if rel_path.startswith('books/'):
        return '/' + rel_path[6:].replace('.html', '')
    if rel_path.startswith('pages/'):
        return '/' + rel_path[6:].replace('.html', '')
    if rel_path == '404.html':
        return '/404'
    if rel_path == 'newsletter-thanks.html':
        return '/newsletter-thanks'
    if rel_path == 'quan-ly/comments.html':
        return '/quan-ly'
    return '/' + rel_path


def transform_to_en(text: str, vi_rel_path: str) -> str:
    """Apply all VI → EN transforms to HTML text."""
    slug = Path(vi_rel_path).stem
    vi_clean = clean_url_for(vi_rel_path)
    en_clean = '/en' + (vi_clean if vi_clean != '/' else '/')

    # 1. <html lang="vi"> → <html lang="en">
    text = re.sub(r'<html\s+lang="vi"', '<html lang="en"', text)

    # 2. <meta property="og:locale" content="vi_VN"> → en_US
    text = re.sub(
        r'(<meta[^>]+og:locale[^>]+content=")vi_VN(")',
        r'\1en_US\2',
        text
    )
    text = re.sub(
        r'(<meta[^>]+content=")vi_VN("[^>]+og:locale)',
        r'\1en_US\2',
        text
    )

    # 3. canonical: https://flamindi.com/<vi_clean> → https://flamindi.com/en<vi_clean>
    text = re.sub(
        r'(<link[^>]+rel="canonical"[^>]+href="https://flamindi\.com)' + re.escape(vi_clean) + r'("/?>)',
        r'\1' + en_clean + r'\2',
        text
    )
    text = re.sub(
        r'(<link[^>]+href="https://flamindi\.com)' + re.escape(vi_clean) + r'("[^>]+rel="canonical")',
        r'\1' + en_clean + r'\2',
        text
    )

    # 4. og:url same logic
    text = re.sub(
        r'(<meta[^>]+og:url[^>]+content="https://flamindi\.com)' + re.escape(vi_clean) + r'("[^>]*/?>)',
        r'\1' + en_clean + r'\2',
        text
    )
    text = re.sub(
        r'(<meta[^>]+content="https://flamindi\.com)' + re.escape(vi_clean) + r'("[^>]+og:url)',
        r'\1' + en_clean + r'\2',
        text
    )

    # 5. hreflang flip — vi self <-> en alternate
    # Self: <link rel="alternate" hreflang="vi" href=".../"> → hreflang="en" href="/en/"
    # Alternate: hreflang="en" href="/en/..." → hreflang="vi" href="/..."
    # Easiest: swap the two URLs in hreflang lines

    # Find both hreflang lines, swap their hrefs
    vi_href_re = re.search(
        r'<link[^>]+rel="alternate"[^>]+hreflang="vi"[^>]+href="([^"]+)"[^>]*/?>',
        text
    )
    en_href_re = re.search(
        r'<link[^>]+rel="alternate"[^>]+hreflang="en"[^>]+href="([^"]+)"[^>]*/?>',
        text
    )
    if vi_href_re and en_href_re:
        # In EN file, the hreflang remains the same (vi points to VI URL, en points to EN URL)
        # So no swap needed — just verify URLs are correct
        # VI hreflang should point to VI URL (https://flamindi.com<vi_clean>)
        # EN hreflang should point to EN URL (https://flamindi.com<en_clean>)
        pass  # hreflang lines are universal — no change needed

    # 6. lang-switch: VI active → EN active; VI link → clean VI URL
    # Pattern in VI: <a class="active" href="#">VI</a>...<a href="...">EN</a>
    # Pattern in EN: <a href="<vi_clean>">VI</a>...<a class="active" href="#">EN</a>
    new_switch = (
        f'<span class="lang-switch">'
        f'<a href="{vi_clean}">VI</a>'
        f'<span class="sep">·</span>'
        f'<a class="active" href="#">EN</a>'
        f'</span>'
    )
    text = re.sub(
        r'<span class="lang-switch"><a[^>]*>VI</a><span class="sep">[^<]*</span><a[^>]*>EN</a></span>',
        new_switch,
        text
    )

    return text


def mirror_one(vi_path: Path, dry_run: bool = False) -> tuple[bool, str]:
    """Mirror single VI file to en/ counterpart. Return (success, message)."""
    if not vi_path.exists():
        return False, f"VI file not found: {vi_path}"

    if str(vi_path).startswith('en/') or str(vi_path).startswith('en\\'):
        return False, f"Skip — input is already EN file: {vi_path}"

    en_path = Path('en') / vi_path
    en_path.parent.mkdir(parents=True, exist_ok=True)

    vi_text = vi_path.read_text(encoding='utf-8')
    en_text = transform_to_en(vi_text, str(vi_path).replace('\\', '/'))

    if dry_run:
        # Show summary of what would change
        diff_count = sum(1 for a, b in zip(vi_text, en_text) if a != b)
        return True, f"[DRY-RUN] Would mirror {vi_path} → {en_path} (~{diff_count} bytes diff)"

    # Backup existing if needed
    if en_path.exists():
        existing = en_path.read_text(encoding='utf-8')
        if existing == en_text:
            return True, f"⊙ {en_path} (already up-to-date)"
        # Save backup
        backup = en_path.with_suffix('.html.bak')
        backup.write_text(existing, encoding='utf-8')
        en_path.write_text(en_text, encoding='utf-8')
        return True, f"↻ {en_path} (overwrote, backup → {backup.name})"
    else:
        en_path.write_text(en_text, encoding='utf-8')
        return True, f"✓ {en_path} (new)"


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('paths', nargs='*', help='VI HTML files to mirror')
    parser.add_argument('--all-books', action='store_true', help='Mirror all books/*.html')
    parser.add_argument('--all-pages', action='store_true', help='Mirror all pages/*.html + index.html')
    parser.add_argument('--all', action='store_true', help='Everything (books + pages + root index)')
    parser.add_argument('--diff', action='store_true', help='Dry-run: show what would change without writing')
    args = parser.parse_args()

    targets: list[Path] = []

    if args.all or args.all_books:
        targets.extend(sorted(Path('books').glob('*.html')))
    if args.all or args.all_pages:
        targets.extend(sorted(Path('pages').glob('*.html')))
        if Path('index.html').exists():
            targets.append(Path('index.html'))

    for p in args.paths:
        targets.append(Path(p))

    if not targets:
        parser.print_help()
        return 1

    print(f"Mirroring {len(targets)} file(s)...\n")
    success = fail = 0
    for vi in targets:
        ok, msg = mirror_one(vi, dry_run=args.diff)
        print(f"  {msg}")
        if ok:
            success += 1
        else:
            fail += 1

    print(f"\n  Done: {success} ok, {fail} failed")
    return 0 if fail == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
