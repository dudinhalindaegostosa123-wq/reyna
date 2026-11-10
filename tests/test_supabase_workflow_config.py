import base64
import json
import unittest
from pathlib import Path
from scripts.supabase_workflow_config import load_config, request_headers


def fixture_jwt(role):
    # Deliberately unsigned format fixture, not a usable credential.
    payload = base64.urlsafe_b64encode(json.dumps({'role': role}).encode()).decode().rstrip('=')
    return 'fixture.' + payload + '.unsigned'


class ConfigurationTests(unittest.TestCase):
    def config(self, url='https://example.supabase.co', key=None):
        return {'SUPABASE_URL': url, 'SUPABASE_SECRET_KEY': key or fixture_jwt('service_role')}

    def test_missing_names_without_values(self):
        with self.assertRaises(SystemExit) as error:
            load_config({'SUPABASE_URL': 'https://private-project.supabase.co'})
        self.assertIn('SUPABASE_SECRET_KEY', str(error.exception))
        self.assertNotIn('private-project', str(error.exception))

    def test_legacy_service_role_uses_bearer(self):
        _, key = load_config(self.config())
        self.assertEqual(request_headers(key)['Authorization'], 'Bearer ' + key)

    def test_new_secret_uses_apikey_only(self):
        _, key = load_config(self.config(key='sb_secret_format_fixture'))
        self.assertEqual(request_headers(key), {'apikey': key})

    def test_reject_public_and_malformed_keys_without_echo(self):
        for key in ['sb_publishable_format_fixture', fixture_jwt('anon'), 'malformed', 'a.!!!!.b', 'sb_secret_']:
            with self.subTest(key_type=key.split('_')[0]):
                with self.assertRaises(SystemExit) as error:
                    load_config(self.config(key=key))
                if key != 'sb_secret_':
                    self.assertNotIn(key, str(error.exception))

    def test_invalid_url_diagnosed_without_echo(self):
        for url in ['https://vercel.com/private', 'https://example.supabase.co/rest/v1', 'https://user:password@example.supabase.co', 'https://example.supabase.co:443', 'https://example.supabase.co?x=1', 'https://[invalid']:
            with self.subTest(url_type=url.split(':')[0]):
                with self.assertRaises(SystemExit) as error:
                    load_config(self.config(url=url))
                self.assertIn('SUPABASE_URL invalida', str(error.exception))
                self.assertNotIn(url, str(error.exception))

    def test_embedded_workflow_python_compiles(self):
        import textwrap
        for name in ['importar-catalogo', 'transferir-imagens']:
            content = Path('.github/workflows/' + name + '.yml').read_text()
            code = textwrap.dedent(content.split("<<'PY'\n", 1)[1].rsplit('          PY', 1)[0])
            compile(code, name, 'exec')
            self.assertIn('load_config(os.environ)', code)
            self.assertIn('request_headers(KEY)', code)


if __name__ == '__main__':
    unittest.main()
