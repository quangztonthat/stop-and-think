"""
_extract_epub.py — Extract plain text from 1 epub file.

Usage:
  python _extract_epub.py <epub_filename> [output_slug]

Examples:
  python _extract_epub.py "library/The_Outsiders,.epub" the-outsiders
  python _extract_epub.py "library/Stoicism_..._sk,.epub" stoicism

Output: _books_raw/<output_slug>.txt
"""
import os
import sys
import re

try:
    from ebooklib import epub
    from bs4 import BeautifulSoup
except ImportError:
    print("ERR: cần install: pip install ebooklib beautifulsoup4")
    sys.exit(1)


def extract_text(epub_path):
    book = epub.read_epub(epub_path)
    chunks = []
    for item in book.get_items():
        if item.get_type() == 9:  # ITEM_DOCUMENT
            html = item.get_content().decode('utf-8', errors='ignore')
            soup = BeautifulSoup(html, 'html.parser')
            for tag in soup(['script', 'style']):
                tag.decompose()
            text = soup.get_text('\n', strip=True)
            text = re.sub(r'\n{3,}', '\n\n', text)
            if text.strip():
                chunks.append(text)
    return '\n\n---\n\n'.join(chunks)


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    epub_path = sys.argv[1]
    slug = sys.argv[2] if len(sys.argv) > 2 else os.path.splitext(os.path.basename(epub_path))[0]

    if not os.path.exists(epub_path):
        print(f"ERR: {epub_path} not found")
        sys.exit(1)

    out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '_books_raw')
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, f'{slug}.txt')

    print(f"Extracting {epub_path} ...")
    text = extract_text(epub_path)
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(text)

    word_count = len(text.split())
    print(f"  Wrote {out_path}")
    print(f"  Words: {word_count:,}")
    print(f"  Chars: {len(text):,}")


if __name__ == '__main__':
    main()
