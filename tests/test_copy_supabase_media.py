import copy
import hashlib
import io
import json
import unittest
import urllib.error
from unittest.mock import patch
from scripts.copy_supabase_media import Client, CopyError, copy_media, image_format, object_path, source_config

IMAGE = b'\x89PNG\r\n\x1a\nfixture-content'


class Source:
    base = 'https://original.supabase.co'
    def __init__(self):
        self.tables = {
            'products': [{'id': 'old-product', 'woo_id': 1382}],
            'product_variants': [{'id': 'old-variant', 'product_id': 'old-product', 'woo_id': 1383}],
            'product_media': [{
                'id': 'old-media', 'product_id': 'old-product', 'variant_id': 'old-variant',
                'media_type': 'image', 'storage_path': 'gallery/a.png', 'thumbnail_path': None,
                'original_path': None, 'youtube_id': None, 'alt_text': 'Fixture image', 'position': 0, 'source_url': 'https://original.example/old.png',
            }],
        }
        self.reads = []
        self.failure = None

    def rows(self, table, columns):
        return copy.deepcopy(self.tables[table])

    def send(self, path):
        self.reads.append(path)
        if self.failure:
            raise CopyError(self.failure)
        return IMAGE


class Destination:
    def __init__(self):
        self.tables = {
            'products': [{'id': 'new-product', 'woo_id': 1382}],
            'product_variants': [{'id': 'new-variant', 'product_id': 'new-product', 'woo_id': 1383}],
        }
        self.objects = {}
        self.media = {}
        self.uploads = []

    def rows(self, table, columns):
        return copy.deepcopy(self.tables[table])

    def send(self, path, method='GET', **kwargs):
        if method == 'POST':
            if path in self.objects:
                raise CopyError('HTTP_400')
            assert kwargs['extra']['x-upsert'] == 'false'
            self.objects[path] = kwargs['raw']
            self.uploads.append(path)
            return b'{}'
        path = path.replace('/object/authenticated/', '/object/')
        return self.objects[path]

    def json(self, path, method, payload, **kwargs):
        assert path == '/rest/v1/product_media?on_conflict=id'
        assert method == 'POST'
        for row in payload:
            self.media[row['id']] = row


class CopyTests(unittest.TestCase):
    def test_maps_source_ids_through_woo_ids_and_preserves_variant_parent(self):
        source, destination = Source(), Destination()
        result = copy_media(source, destination, lambda _: None)
        self.assertEqual(result.associated, 1)
        media = next(iter(destination.media.values()))
        self.assertEqual(media['product_id'], 'new-product')
        self.assertEqual(media['variant_id'], 'new-variant')
        self.assertNotEqual(media['id'], 'old-media')
        self.assertEqual(media['thumbnail_path'], media['storage_path'])
        self.assertEqual(next(iter(destination.objects.values())), IMAGE)
        self.assertEqual(result.uploaded, 1)
        self.assertTrue(all(path.startswith('/storage/v1/object/public/produtos/') for path in source.reads))

    def test_rerun_reuses_immutable_content_and_same_media_id(self):
        source, destination = Source(), Destination()
        copy_media(source, destination, lambda _: None)
        ids = set(destination.media)
        result = copy_media(source, destination, lambda _: None)
        self.assertEqual(result.reused, 1)
        self.assertEqual(result.uploaded, 0)
        self.assertEqual(set(destination.media), ids)
        self.assertEqual(len(destination.objects), 1)

    def test_existing_content_is_verified_before_reuse(self):
        source, destination = Source(), Destination()
        target = '/storage/v1/object/produtos/copia-supabase-v1/' + hashlib.sha256(IMAGE).hexdigest() + '.png'
        destination.objects[target] = b'wrong-content'
        result = copy_media(source, destination, lambda _: None)
        self.assertEqual(result.failures, 1)
        self.assertEqual(len(destination.media), 0)
        self.assertEqual(destination.objects[target], b'wrong-content')

    def test_missing_product_and_wrong_variant_parent_are_never_associated(self):
        for mode in ['product', 'variant']:
            source, destination = Source(), Destination()
            if mode == 'product':
                destination.tables['products'][0]['woo_id'] = 9999
            else:
                destination.tables['product_variants'][0]['product_id'] = 'other-parent'
            result = copy_media(source, destination, lambda _: None)
            self.assertEqual(result.missing_products, 1)
            self.assertEqual(result.associated, 0)
            self.assertFalse(destination.objects)

    def test_source_403_does_not_write_media_or_retry_same_file(self):
        source, destination = Source(), Destination()
        source.failure = 'HTTP_403'
        second = copy.deepcopy(source.tables['product_media'][0])
        second['id'] = 'second-media'
        source.tables['product_media'].append(second)
        result = copy_media(source, destination, lambda _: None)
        self.assertEqual(result.failures, 2)
        self.assertEqual(len(source.reads), 1)
        self.assertFalse(destination.media)

    def test_youtube_is_associated_without_downloading(self):
        source, destination = Source(), Destination()
        source.tables['product_media'][0].update(media_type='youtube', storage_path=None, youtube_id='abcdefghijk')
        result = copy_media(source, destination, lambda _: None)
        self.assertEqual(result.associated, 1)
        self.assertFalse(source.reads)
        self.assertFalse(destination.objects)

    def test_empty_catalog_is_not_reported_as_success(self):
        source, destination = Source(), Destination()
        source.tables['product_media'] = []
        with self.assertRaises(CopyError):
            copy_media(source, destination)

    def test_read_only_client_blocks_writes_before_network(self):
        client = Client(Source.base, 'fixture-public-key', read_only=True, opener=lambda *a, **k: self.fail('Unexpected network'))
        with self.assertRaisesRegex(CopyError, 'origem bloqueada'):
            client.send('/rest/v1/products', method='POST', payload=[])

    def test_reject_same_project_and_admin_source_keys(self):
        env = {'SOURCE_SUPABASE_URL': Source.base, 'SOURCE_SUPABASE_PUBLISHABLE_KEY': 'sb_publishable_format_fixture'}
        self.assertEqual(source_config(env, 'https://new.supabase.co')[0], Source.base)
        with self.assertRaisesRegex(CopyError, 'mesmo projeto'):
            source_config(env, Source.base)
        env['SOURCE_SUPABASE_PUBLISHABLE_KEY'] = 'sb_secret_not_accepted'
        with self.assertRaisesRegex(CopyError, 'administrativa'):
            source_config(env, 'https://new.supabase.co')

    def test_paths_and_image_signatures_reject_html_and_traversal(self):
        for path in ['../x', '/absolute/x', 'a/../b', 'a\\b', 'a//b']:
            with self.assertRaises(CopyError):
                object_path(path)
        self.assertEqual(object_path('a/a b.webp'), 'a/a%20b.webp')
        with self.assertRaises(CopyError):
            image_format(b'<html>Access denied</html>')
        self.assertEqual(image_format(IMAGE), ('png', 'image/png'))

    def test_pagination_reads_beyond_first_api_page(self):
        seen = []
        client = Client(Source.base, 'fixture-public-key', read_only=True)
        def get(path, *args, **kwargs):
            seen.append(path)
            return [{'id': str(n)} for n in range(500)] if len(seen) == 1 else [{'id': 'last'}]
        client.json = get
        rows = client.rows('products', 'id')
        self.assertEqual(len(rows), 501)
        self.assertIn('offset=500', seen[1])

    def test_main_reports_incomplete_run_after_saving_summary(self):
        import tempfile
        import os
        import scripts.copy_supabase_media as module
        with tempfile.TemporaryDirectory() as directory:
            summary = os.path.join(directory, 'summary.md')
            fake_destination = unittest.mock.Mock()
            fake_destination.json.return_value = {'id': 'produtos', 'public': True}
            with patch.object(module, 'load_config', return_value=('https://new.supabase.co', 'fixture')), \
                 patch.object(module, 'source_config', return_value=(Source.base, 'fixture')), \
                 patch.object(module, 'Client', side_effect=[unittest.mock.Mock(), fake_destination]), \
                 patch.object(module, 'copy_media', return_value=module.Result(source_media=2, associated=1, failures=1)), \
                 patch.dict(os.environ, {'GITHUB_STEP_SUMMARY': summary}), patch('builtins.print'):
                with self.assertRaisesRegex(CopyError, 'Copia incompleta'):
                    module.main()
            with open(summary) as file:
                self.assertIn('Midias com falha: 1', file.read())

    def test_http_error_body_is_not_exposed(self):
        def opener(request, timeout):
            raise urllib.error.HTTPError(request.full_url, 403, 'sensitive message', {}, io.BytesIO(b'private value'))
        client = Client(Source.base, 'fixture-public-key', read_only=True, opener=opener)
        with self.assertRaisesRegex(CopyError, '^HTTP_403$'):
            client.send('/rest/v1/products')


if __name__ == '__main__':
    unittest.main()
