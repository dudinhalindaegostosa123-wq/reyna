"""Build a verified old-slug map from a Woo wp_posts export and original products CSV."""
import argparse
import collections
import csv
import hashlib
import json
import re
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('posts', type=Path)
parser.add_argument('--products', type=Path, default=Path('produtos.csv'))
parser.add_argument('--output', type=Path, default=Path('src/lib/legacy-product-links.ts'))
args = parser.parse_args()
with args.posts.open(encoding='utf-8-sig', newline='') as file:
    reader = csv.DictReader(file)
    assert {'produto_antigo', 'slug_antigo', 'situacao'} <= set(reader.fieldnames or []), 'Unexpected columns'
    rows = list(reader)
with args.products.open(encoding='utf-8-sig', newline='') as file:
    products = {row['ID']: row for row in csv.DictReader(file) if row['Tipo'] != 'variation'}
counts = collections.Counter(row['slug_antigo'] for row in rows if row['slug_antigo'])
verified = {}
skipped = collections.Counter()
for row in rows:
    identifier, slug = row['produto_antigo'], row['slug_antigo']
    if row['situacao'] != 'publish':
        skipped['not_published'] += 1
        continue
    assert identifier.isdigit() and int(identifier) > 0, 'Invalid product ID'
    assert re.fullmatch(r'[a-z0-9-]+', slug), 'Unsupported published slug'
    assert counts[slug] == 1, 'Ambiguous slug'
    assert identifier in products and products[identifier]['Publicado'] == '1', 'Missing published product correspondence'
    verified[slug] = int(identifier)
assert verified and verified.get('topo-estrela-titanio') == 3429, 'Known correspondence missing'
text = args.output.read_text()
start = text.index('export const LEGACY_PRODUCT_IDS: Record<string, number> = ')
end = text.index('\n\nexport function normalizeLegacyAttribute', start)
text = text[:start] + 'export const LEGACY_PRODUCT_IDS: Record<string, number> = ' + json.dumps(dict(sorted(verified.items())), ensure_ascii=False, indent=2) + '\n\n' + text[end:].lstrip('\n')
args.output.write_text(text)
print(json.dumps({'source_rows': len(rows), 'verified': len(verified), 'skipped': dict(skipped), 'source_sha256': hashlib.sha256(args.posts.read_bytes()).hexdigest()}, indent=2))
