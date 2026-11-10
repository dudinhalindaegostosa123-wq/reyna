"""Validate GitHub Actions configuration without logging credential values."""
import base64
import json
from urllib.parse import urlsplit


def is_service_role_key(key):
    if key.startswith('sb_secret_') and len(key) > len('sb_secret_'):
        return True
    try:
        header, payload, signature = key.split('.')
        claims = json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4)))
        # Format check only: Supabase verifies the signature on each request.
        return bool(header and signature) and isinstance(claims, dict) and claims.get('role') == 'service_role'
    except (ValueError, TypeError, UnicodeError):
        return False


def load_config(environment):
    url = environment.get('SUPABASE_URL', '').strip().rstrip('/')
    key = environment.get('SUPABASE_SECRET_KEY', '').strip()
    missing = [name for name, value in [('SUPABASE_URL', url), ('SUPABASE_SECRET_KEY', key)] if not value]
    if missing:
        raise SystemExit('Repository secrets ausentes ou vazios: ' + ', '.join(missing) + '. Configure em GitHub > Settings > Secrets and variables > Actions > Repository secrets.')
    try:
        parsed = urlsplit(url)
        valid = (parsed.scheme == 'https' and (parsed.hostname or '').endswith('.supabase.co')
                 and not parsed.path and not parsed.query and not parsed.fragment
                 and parsed.username is None and parsed.password is None and parsed.port is None)
    except ValueError:
        valid = False
    if not valid:
        raise SystemExit('SUPABASE_URL invalida: use somente https://SEU-PROJETO.supabase.co, sem aspas, porta ou caminho. Nao use a URL do dashboard ou da Vercel.')
    if not is_service_role_key(key):
        raise SystemExit('SUPABASE_SECRET_KEY invalida: use uma Secret key sb_secret_ ou a chave JWT service_role do Supabase novo. Chaves publishable e anon nao permitem esta importacao.')
    return url, key


def request_headers(key):
    headers = {'apikey': key}
    if not key.startswith('sb_secret_'):
        headers['Authorization'] = 'Bearer ' + key
    return headers
