"""Copy product media from the original public Supabase catalog, never writing to it."""
import base64
import hashlib
import json
import os
import re
import sys
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
import urllib.error
import urllib.parse
import urllib.request
import uuid
from dataclasses import dataclass
from scripts.supabase_workflow_config import load_config, request_headers

MAX_FILE_BYTES = 25_000_000
MAX_UPLOAD_BYTES = 900_000_000
BUCKET = 'produtos'
ROOT = 'copia-supabase-v1'


class CopyError(Exception):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, newurl):
        return None


def source_config(environment, destination):
    url = environment.get('SOURCE_SUPABASE_URL', '').strip().rstrip('/')
    key = environment.get('SOURCE_SUPABASE_PUBLISHABLE_KEY', '').strip()
    try:
        parsed = urllib.parse.urlsplit(url)
        valid_url = (parsed.scheme == 'https' and (parsed.hostname or '').endswith('.supabase.co')
                     and not parsed.path and not parsed.query and not parsed.fragment
                     and parsed.username is None and parsed.password is None and parsed.port is None)
    except ValueError:
        valid_url = False
    if not valid_url:
        raise CopyError('SOURCE_SUPABASE_URL ausente ou invalida. Use a Project URL do projeto ORIGINAL.')
    if url.lower() == destination.lower():
        raise CopyError('Origem e destino sao o mesmo projeto. Nenhuma copia foi iniciada.')
    valid_key = key.startswith('sb_publishable_') and len(key) > len('sb_publishable_')
    if not valid_key:
        try:
            header, payload, signature = key.split('.')
            claims = json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4)))
            valid_key = bool(header and signature) and isinstance(claims, dict) and claims.get('role') == 'anon'
        except (ValueError, TypeError, UnicodeError):
            valid_key = False
    if not valid_key or any(c.isspace() for c in key):
        raise CopyError('SOURCE_SUPABASE_PUBLISHABLE_KEY ausente ou invalida. Use a Publishable key ou anon do projeto ORIGINAL, nao uma chave administrativa.')
    return url, key


class Client:
    def __init__(self, base, key, read_only=False, opener=None):
        self.base, self.key, self.read_only = base, key, read_only
        self.opener = opener or urllib.request.build_opener(NoRedirect()).open

    def send(self, path, method='GET', payload=None, raw=None, content_type=None, extra=None, limit=MAX_FILE_BYTES):
        if self.read_only and method != 'GET':
            raise CopyError('Escrita na origem bloqueada.')
        if not path.startswith('/') or path.startswith('//') or '..' in path.split('?')[0].split('/'):
            raise CopyError('Caminho de API invalido.')
        body = json.dumps(payload, ensure_ascii=False, allow_nan=False).encode() if payload is not None else raw
        headers = {**request_headers(self.key), 'Accept': 'application/json', 'User-Agent': 'ReynaMediaCopy/1.0'}
        if body is not None:
            headers['Content-Type'] = content_type or 'application/json'
        headers.update(extra or {})
        request = urllib.request.Request(self.base + path, data=body, method=method, headers=headers)
        try:
            with self.opener(request, timeout=45) as response:
                data = response.read(limit + 1)
            if len(data) > limit:
                raise CopyError('Resposta maior que o limite permitido.')
            return data
        except urllib.error.HTTPError as error:
            raise CopyError(f'HTTP_{error.code}') from None
        except (urllib.error.URLError, TimeoutError):
            raise CopyError('NETWORK_ERROR') from None

    def json(self, path, method='GET', payload=None, extra=None):
        data = self.send(path, method, payload=payload, extra=extra, limit=20_000_000)
        if not data:
            return None
        try:
            return json.loads(data)
        except (ValueError, UnicodeError):
            raise CopyError('Resposta JSON invalida.') from None

    def rows(self, table, columns):
        rows, offset = [], 0
        while True:
            query = urllib.parse.urlencode({'select': columns, 'order': 'id.asc', 'limit': 500, 'offset': offset})
            page = self.json('/rest/v1/' + table + '?' + query)
            if not isinstance(page, list) or len(page) > 500:
                raise CopyError('Resposta de tabela invalida: ' + table)
            rows.extend(page)
            if len(page) < 500:
                return rows
            offset += len(page)
            if offset > 200000:
                raise CopyError('Limite de catalogo excedido.')


def object_path(value):
    if not isinstance(value, str) or not value or value.startswith('/') or '\\' in value:
        raise CopyError('Caminho de imagem invalido.')
    if any(part in ('', '.', '..') for part in value.split('/')):
        raise CopyError('Caminho de imagem invalido.')
    return '/'.join(urllib.parse.quote(part, safe='') for part in value.split('/'))


def image_format(data):
    if data.startswith(b'\x89PNG\r\n\x1a\n'):
        return 'png', 'image/png'
    if data.startswith(b'\xff\xd8\xff'):
        return 'jpg', 'image/jpeg'
    if data[:4] == b'RIFF' and data[8:12] == b'WEBP':
        return 'webp', 'image/webp'
    if data[:6] in (b'GIF87a', b'GIF89a'):
        return 'gif', 'image/gif'
    if data[:4] in (b'II*\0', b'MM\0*'):
        return 'tif', 'image/tiff'
    if data[4:8] == b'ftyp' and data[8:12] in (b'avif', b'avis'):
        return 'avif', 'image/avif'
    raise CopyError('O arquivo recebido nao tem formato de imagem aceito.')


@dataclass
class Result:
    source_media: int = 0
    associated: int = 0
    missing_products: int = 0
    failures: int = 0
    uploaded: int = 0
    reused: int = 0
    bytes_uploaded: int = 0
    resumed: int = 0


def stored_objects(destination):
    """List the flat content-addressed directory once, instead of redownloading completed files."""
    found, offset = set(), 0
    while True:
        page = destination.json('/storage/v1/object/list/' + BUCKET, 'POST', {
            'prefix': ROOT + '/', 'limit': 500, 'offset': offset,
            'sortBy': {'column': 'name', 'order': 'asc'},
        })
        if not isinstance(page, list) or len(page) > 500:
            raise CopyError('Resposta invalida ao listar arquivos ja copiados.')
        for item in page:
            if isinstance(item, dict) and item.get('id') and re.fullmatch(r'[a-f0-9]{64}\.(png|jpg|webp|gif|tif|avif)', item.get('name', '')):
                found.add(ROOT + '/' + item['name'])
        if len(page) < 500:
            return found
        offset += len(page)
        if offset > 600000:
            raise CopyError('Limite de arquivos excedido.')


def copy_media(source, destination, progress=print, workers=4):
    if not isinstance(workers, int) or workers < 1 or workers > 4:
        raise CopyError('Paralelismo invalido.')
    result = Result()
    source_products = {p['id']: p for p in source.rows('products', 'id,woo_id')}
    source_variants = {v['id']: v for v in source.rows('product_variants', 'id,woo_id,product_id')}
    target_products = {int(p['woo_id']): p for p in destination.rows('products', 'id,woo_id') if p['woo_id'] is not None}
    target_variants = {int(v['woo_id']): v for v in destination.rows('product_variants', 'id,woo_id,product_id') if v['woo_id'] is not None}
    media_columns = 'id,product_id,variant_id,media_type,storage_path,thumbnail_path,original_path,youtube_id,alt_text,position,source_url'
    media = source.rows('product_media', media_columns)
    if not media or not source_products or not target_products:
        raise CopyError('Catalogo ou midias vazios. Confira a origem e conclua a importacao dos produtos no destino.')
    previous_media = {item['id']: item for item in destination.rows('product_media', media_columns)}
    previous_files = stored_objects(destination)
    result.source_media = len(media)
    progress(f'Midias na origem: {len(media)}; vinculos existentes: {len(previous_media)}; arquivos disponiveis: {len(previous_files)}; copias paralelas: {workers}.')
    cache, failures, file_locks = {}, {}, {}
    lock = threading.Lock()
    reserved_bytes = 0

    def copy_file(path):
        nonlocal reserved_bytes
        object_path(path)
        with lock:
            path_lock = file_locks.setdefault(path, threading.Lock())
        # Different media can reference the same original. Only one worker transfers it.
        with path_lock:
            if path in cache:
                return cache[path]
            if path in failures:
                raise CopyError(failures[path])
            try:
                data = source.send('/storage/v1/object/public/' + BUCKET + '/' + object_path(path))
                extension, mime = image_format(data)
                digest = hashlib.sha256(data).hexdigest()
                target = f'{ROOT}/{digest}.{extension}'
                with lock:
                    if result.bytes_uploaded + reserved_bytes + len(data) > MAX_UPLOAD_BYTES:
                        raise CopyError('Limite de bytes desta execucao excedido.')
                    reserved_bytes += len(data)
                try:
                    try:
                        destination.send('/storage/v1/object/' + BUCKET + '/' + object_path(target), method='POST', raw=data, content_type=mime, extra={'x-upsert': 'false'})
                        with lock:
                            result.uploaded += 1
                            result.bytes_uploaded += len(data)
                    except CopyError as error:
                        if str(error) not in ('HTTP_400', 'HTTP_409'):
                            raise
                        existing = destination.send('/storage/v1/object/authenticated/' + BUCKET + '/' + object_path(target))
                        if hashlib.sha256(existing).hexdigest() != digest:
                            raise CopyError('O arquivo existente nao corresponde ao checksum esperado.')
                        with lock:
                            result.reused += 1
                finally:
                    with lock:
                        reserved_bytes -= len(data)
                cache[path] = target
                return target
            except CopyError as error:
                failures[path] = str(error)
                raise

    def process_media(item):
        parent = source_products.get(item['product_id'])
        target = target_products.get(int(parent['woo_id'])) if parent and parent['woo_id'] is not None else None
        variant = None
        if item['variant_id'] is not None:
            original_variant = source_variants.get(item['variant_id'])
            variant = target_variants.get(int(original_variant['woo_id'])) if original_variant and original_variant['woo_id'] is not None else None
            if not variant or not target or variant['product_id'] != target['id'] or original_variant['product_id'] != parent['id']:
                return 'missing', None
        if not target:
            return 'missing', None
        row = {
            'id': str(uuid.uuid5(uuid.NAMESPACE_URL, source.base + ':' + item['id'] + ':' + target['id'])),
            'product_id': target['id'], 'variant_id': variant['id'] if variant else None,
            'media_type': item['media_type'], 'alt_text': item['alt_text'], 'position': item['position'],
            'source_url': item['source_url'], 'youtube_id': item['youtube_id'],
            'storage_path': None, 'thumbnail_path': None, 'original_path': None,
        }
        previous = previous_media.get(row['id'])
        same_metadata = previous is not None and all(previous.get(k) == row[k] for k in row if k not in ('storage_path', 'thumbnail_path', 'original_path'))
        if same_metadata:
            if item['media_type'] == 'youtube':
                return 'resumed', None
            if item['media_type'] == 'image' and all(previous.get(k) in previous_files for k in ('storage_path', 'thumbnail_path', 'original_path')):
                # Checkpoint: this row was written only after all its immutable files.
                return 'resumed', None
        try:
            if item['media_type'] == 'image':
                row['storage_path'] = copy_file(item['storage_path'])
                row['thumbnail_path'] = copy_file(item['thumbnail_path']) if item['thumbnail_path'] else row['storage_path']
                row['original_path'] = copy_file(item['original_path']) if item['original_path'] else row['storage_path']
            elif item['media_type'] != 'youtube':
                raise CopyError('Tipo de midia desconhecido.')
            destination.json('/rest/v1/product_media?on_conflict=id', 'POST', [row], extra={'Prefer': 'resolution=merge-duplicates,return=minimal'})
            return 'associated', None
        except CopyError as error:
            return 'failure', str(error)

    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {executor.submit(process_media, item): index for index, item in enumerate(media, 1)}
        for completed, future in enumerate(as_completed(futures), 1):
            status, error = future.result()
            if status == 'missing':
                result.missing_products += 1
            elif status == 'resumed':
                result.resumed += 1
            elif status == 'associated':
                result.associated += 1
            else:
                result.failures += 1
                progress(f'Midia {futures[future]}: pendente ({error}).')
            if completed % 50 == 0 or completed == len(media):
                progress(f'Progresso: {completed}/{len(media)}; vinculadas: {result.associated + result.resumed}; retomadas: {result.resumed}; pendentes: {result.failures}.')
    return result


def main():
    destination_url, destination_key = load_config(os.environ)
    source_url, source_key = source_config(os.environ, destination_url)
    source = Client(source_url, source_key, read_only=True)
    destination = Client(destination_url, destination_key)
    bucket = destination.json('/storage/v1/bucket/' + BUCKET)
    if not isinstance(bucket, dict) or bucket.get('id') != BUCKET or bucket.get('public') is not True:
        raise CopyError('O bucket produtos do destino precisa existir e ser publico.')
    result = copy_media(source, destination, lambda text: print(text, flush=True))
    summary = '\n'.join([
        '# Copia de midias do Supabase original', '',
        f'- Midias visiveis na origem: {result.source_media}',
        f'- Associacoes gravadas agora: {result.associated}',
        f'- Associacoes ja concluidas e retomadas: {result.resumed}',
        f'- Midias sem produto/variacao correspondente no destino: {result.missing_products}',
        f'- Midias com falha: {result.failures}',
        f'- Arquivos enviados: {result.uploaded}',
        f'- Arquivos existentes conferidos por SHA-256: {result.reused}',
        f'- Bytes enviados nesta execucao: {result.bytes_uploaded}', '',
        'A origem foi acessada somente para leitura. Nenhuma exclusao realizada.',
        'A chave publica da origem so permite copiar as midias autorizadas pelas politicas desse projeto.',
    ])
    print(summary)
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'w', encoding='utf-8') as file:
            file.write(summary)
    if result.failures or not (result.associated + result.resumed):
        raise CopyError('Copia incompleta. Confira o resumo; nao houve exclusao das midias ja copiadas.')


if __name__ == '__main__':
    try:
        main()
    except CopyError as error:
        raise SystemExit(str(error)) from None
