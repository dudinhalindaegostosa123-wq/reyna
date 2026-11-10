import io
import json
import unittest
import urllib.error
from scripts.check_asaas import check_account


class CheckTests(unittest.TestCase):
    def test_sandbox_get_without_leaking_account(self):
        seen = []
        def opener(request, timeout):
            seen.append(request)
            return io.BytesIO(json.dumps({'agency': '0001', 'account': '12345', 'accountDigit': '6'}).encode())
        self.assertEqual(check_account({'ASAAS_API_KEY': '$aact_hmlg_format_fixture'}, opener), 'sandbox')
        self.assertEqual(seen[0].get_method(), 'GET')
        self.assertEqual(seen[0].full_url, 'https://api-sandbox.asaas.com/v3/myAccount/accountNumber')
        self.assertIsNone(seen[0].data)

    def test_missing_or_mixed_credential_never_connects(self):
        def opener(*args, **kwargs):
            self.fail('Unexpected network request')
        for environment in [{}, {'ASAAS_API_KEY': '$aact_prod_fixture'}, {'ASAAS_API_KEY': '$aact_hmlg_fixture', 'ASAAS_ENVIRONMENT': 'production'}]:
            with self.assertRaises(SystemExit):
                check_account(environment, opener)

    def test_remote_error_hides_body(self):
        def opener(request, timeout):
            raise urllib.error.HTTPError(request.full_url, 401, 'secret value', {}, io.BytesIO(b'private account details'))
        with self.assertRaises(SystemExit) as error:
            check_account({'ASAAS_API_KEY': '$aact_hmlg_format_fixture'}, opener)
        self.assertIn('401', str(error.exception))
        self.assertNotIn('secret value', str(error.exception))
        self.assertNotIn('private account', str(error.exception))

    def test_arbitrary_success_body_does_not_validate_account(self):
        with self.assertRaises(SystemExit):
            check_account({'ASAAS_API_KEY': '$aact_hmlg_format_fixture'}, lambda *a, **k: io.BytesIO(b'{}'))


if __name__ == '__main__':
    unittest.main()
