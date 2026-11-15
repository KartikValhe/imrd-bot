import os
import re
import sys
import time
import urllib.parse
import requests
from bs4 import BeautifulSoup
import openpyxl

BASE_URL = "https://www.rcpimrd.ac.in"
DOMAIN = "rcpimrd.ac.in"
MAX_PAGES = 150
REQUEST_TIMEOUT = 12

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

def clean_text(text):
    if not text:
        return ""
    text = re.sub(r'[\r\n\t]+', ' ', text)
    text = re.sub(r'\s{2,}', ' ', text)
    return text.strip()

def download_logo(soup, base_url, target_dir):
    os.makedirs(target_dir, exist_ok=True)
    # Search for logo images
    logo_candidates = []
    
    # 1. Images with 'logo' in class, id, alt, or src
    for img in soup.find_all('img'):
        src = img.get('src', '')
        alt = img.get('alt', '')
        img_id = img.get('id', '')
        classes = " ".join(img.get('class', []))
        combined = f"{src} {alt} {img_id} {classes}".lower()
        if 'logo' in combined or 'crest' in combined or 'brand' in combined or 'banner' in combined:
            abs_url = urllib.parse.urljoin(base_url, src)
            logo_candidates.append((abs_url, src))

    print(f"Found {len(logo_candidates)} potential logo candidates.")
    for cand_url, rel_src in logo_candidates:
        try:
            print(f"Attempting to download logo from {cand_url}...")
            resp = requests.get(cand_url, headers=HEADERS, timeout=10)
            if resp.status_code == 200 and len(resp.content) > 1000:
                ext = os.path.splitext(urllib.parse.urlparse(cand_url).path)[1].lower()
                if not ext or ext not in ['.png', '.jpg', '.jpeg', '.svg', '.webp']:
                    ext = '.png'
                
                logo_path = os.path.join(target_dir, f"rcpimrd-logo{ext}")
                with open(logo_path, 'wb') as f:
                    f.write(resp.content)
                print(f"Saved logo to {logo_path}")

                crest_path = os.path.join(target_dir, "rcpimrd-crest.png")
                with open(crest_path, 'wb') as f:
                    f.write(resp.content)
                print(f"Saved crest to {crest_path}")
                return True
        except Exception as e:
            print(f"Failed to download candidate {cand_url}: {e}")

    return False

def scrape_site():
    visited = set()
    to_visit = [BASE_URL]
    scraped_records = []

    session = requests.Session()
    session.headers.update(HEADERS)

    # Disable SSL warnings if college certificate is self-signed/legacy
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

    images_dir = os.path.join(os.path.dirname(__file__), "..", "public", "images")
    logo_downloaded = False

    print(f"Starting web scraping for {BASE_URL} (max {MAX_PAGES} pages)...")

    while to_visit and len(visited) < MAX_PAGES:
        url = to_visit.pop(0)
        # Normalize url
        url = urllib.parse.urldefrag(url)[0].rstrip('/')
        if not url or url in visited:
            continue

        parsed = urllib.parse.urlparse(url)
        if DOMAIN not in parsed.netloc:
            continue

        # Skip non-html assets
        path_lower = parsed.path.lower()
        if any(path_lower.endswith(ext) for ext in [
            '.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.pdf', '.docx', '.xlsx',
            '.zip', '.rar', '.tar', '.gz', '.mp4', '.mp3', '.avi', '.css', '.js'
        ]):
            continue

        visited.add(url)
        print(f"[{len(visited)}/{MAX_PAGES}] Fetching: {url}")

        try:
            resp = session.get(url, timeout=REQUEST_TIMEOUT, verify=False, allow_redirects=True)
            if resp.status_code != 200:
                print(f"  Status {resp.status_code}, skipping.")
                continue

            content_type = resp.headers.get('Content-Type', '').lower()
            if 'text/html' not in content_type:
                continue

            soup = BeautifulSoup(resp.text, 'html.parser')

            # Download logo from home page if not already done
            if not logo_downloaded:
                logo_downloaded = download_logo(soup, resp.url, images_dir)

            # Discover links
            for a in soup.find_all('a', href=True):
                href = a['href'].strip()
                if not href or href.startswith(('mailto:', 'tel:', 'javascript:', '#')):
                    continue
                abs_href = urllib.parse.urljoin(resp.url, href)
                abs_clean = urllib.parse.urldefrag(abs_href)[0].rstrip('/')
                p = urllib.parse.urlparse(abs_clean)
                if DOMAIN in p.netloc and abs_clean not in visited and abs_clean not in to_visit:
                    to_visit.append(abs_clean)

            # Extract title
            title = ""
            if soup.title and soup.title.string:
                title = clean_text(soup.title.string)
            if not title:
                h1 = soup.find('h1')
                if h1:
                    title = clean_text(h1.get_text())
            if not title:
                title = "RCPET IMRD"

            # Remove noise elements
            for tag in soup(['script', 'style', 'noscript', 'iframe']):
                tag.decompose()

            # Identify main content container if available
            main_content = soup.find('main') or soup.find('article') or soup.find(id=re.compile(r'content|main|body', re.I)) or soup.body
            if not main_content:
                continue

            # Extract sections or paragraphs
            headings = main_content.find_all(['h1', 'h2', 'h3', 'h4'])
            if headings:
                for h in headings:
                    sec_heading = clean_text(h.get_text())
                    if not sec_heading or len(sec_heading) < 3:
                        continue
                    
                    # Collect siblings up to next heading
                    content_parts = []
                    curr = h.next_sibling
                    while curr and curr.name not in ['h1', 'h2', 'h3', 'h4']:
                        if hasattr(curr, 'get_text'):
                            text = clean_text(curr.get_text())
                            if text:
                                content_parts.append(text)
                        curr = curr.next_sibling

                    combined = " ".join(content_parts).strip()
                    if len(combined) >= 40:
                        scraped_records.append({
                            "Page Title": title,
                            "Section Heading": sec_heading,
                            "Page URL": resp.url,
                            "Content Text": f"{sec_heading}: {combined}"
                        })

            # Also get overall body text if no headings or sparse
            body_text = clean_text(main_content.get_text())
            if len(body_text) >= 100:
                scraped_records.append({
                    "Page Title": title,
                    "Section Heading": "Overview",
                    "Page URL": resp.url,
                    "Content Text": body_text[:4000]
                })

            time.sleep(0.3)

        except Exception as e:
            print(f"  Error fetching {url}: {e}")

    print(f"\nScraping finished. Total pages visited: {len(visited)}")
    print(f"Total content records extracted: {len(scraped_records)}")

    # Deduplicate records by URL + Heading
    seen = set()
    unique_records = []
    for r in scraped_records:
        key = (r["Page URL"], r["Section Heading"], r["Content Text"][:100])
        if key not in seen:
            seen.add(key)
            unique_records.append(r)

    print(f"Unique content records: {len(unique_records)}")

    # Save to Excel in docs/data
    output_dir = os.path.join(os.path.dirname(__file__), "..", "docs", "data")
    os.makedirs(output_dir, exist_ok=True)
    out_file = os.path.join(output_dir, "rcpimrd_scraped_data.xlsx")

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Scraped_Website_Data"
    ws.append(["Page Title", "Section Heading", "Page URL", "Content Text"])

    for r in unique_records:
        ws.append([r["Page Title"], r["Section Heading"], r["Page URL"], r["Content Text"]])

    wb.save(out_file)
    print(f"Successfully saved scraped data to {out_file}")

if __name__ == "__main__":
    scrape_site()

