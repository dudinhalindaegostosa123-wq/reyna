"""Validate public feed and a sample of landing pages/images after deployment."""
import argparse
import json
import re
import urllib.request
import xml.etree.ElementTree as ET

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='https://serenitypiercings.com.br/google-merchant.xml')
parser.add_argument('--limit', type=int, default=20, help='0 validates all items')
args = parser.parse_args()

def read(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'SerenityCatalogValidation/1.0'}), timeout=30) as response:
        if response.status != 200:
            raise ValueError(f'HTTP {response.status}')
        return response.read()

root = ET.fromstring(read(args.url))
ns = {'g': 'http://base.google.com/ns/1.0'}
items = root.findall('./channel/item')
assert items, 'Empty feed'
ids = [item.findtext('g:id', namespaces=ns) for item in items]
assert all(ids) and len(ids) == len(set(ids)), 'Missing or duplicate IDs'
failures = []
checked_images = set()
for item in items[:args.limit or None]:
    identifier = item.findtext('g:id', namespaces=ns)
    try:
        link = item.findtext('g:link', namespaces=ns)
        html = read(link).decode('utf-8')
        schemas = re.findall(r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>', html, re.S)
        product = next(json.loads(value) for value in schemas if json.loads(value).get('@type') == 'Product')
        expected_price = item.findtext('g:price', namespaces=ns).split()[0]
        expected_stock = 'InStock' if item.findtext('g:availability', namespaces=ns) == 'in_stock' else 'OutOfStock'
        assert any(offer['url'] == link and offer['price'] == expected_price and offer['availability'].endswith('/' + expected_stock) for offer in product['offers']), 'Offer price/stock/link mismatch'
        image = item.findtext('g:image_link', namespaces=ns)
        if image not in checked_images:
            with urllib.request.urlopen(image, timeout=30) as response:
                assert response.status == 200 and response.headers.get_content_type().startswith('image/'), 'Invalid image'
            checked_images.add(image)
    except Exception as error:
        failures.append({'id': identifier, 'error': str(error)})
print(json.dumps({'items': len(items), 'checked': min(args.limit or len(items), len(items)), 'failures': failures}, ensure_ascii=False, indent=2))
raise SystemExit(bool(failures))
