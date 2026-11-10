"""Read-only Asaas credential check. Never creates customers or charges."""
import json
import os
import sys
import urllib.error
import urllib.request


def configuration(environment):
    mode = environment.get('ASAAS_ENVIRONMENT', 'sandbox').strip()
    key = environment.get('ASAAS_API_KEY', '').strip()
    if mode not in ('sandbox', 'production'):
        raise SystemExit('ASAAS_ENVIRONMENT deve ser sandbox ou production.')
    if not key:
        raise SystemExit('Cadastre ASAAS_API_KEY em GitHub > Settings > Secrets and variables > Actions > Repository secrets.')
    if any(c.isspace() for c in key):
        raise SystemExit('ASAAS_API_KEY contem espacos ou quebras de linha. Cole somente a chave, sem aspas.')
    if not key.startswith('$aact_hmlg_' if mode == 'sandbox' else '$aact_prod_'):
        raise SystemExit('A chave nao corresponde ao ambiente escolhido. Use uma chave atual de sandbox para sandbox ou de producao para production.')
    return mode, key, 'https://api-sandbox.asaas.com/v3' if mode == 'sandbox' else 'https://api.asaas.com/v3'


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, newurl):
        return None


def check_account(environment, opener=None):
    mode, key, base = configuration(environment)
    if opener is None:
        opener = urllib.request.build_opener(NoRedirect()).open
    request = urllib.request.Request(base + '/myAccount/accountNumber', headers={
        'access_token': key, 'Accept': 'application/json', 'User-Agent': 'ReynaIntegrationCheck/1.0',
    }, method='GET')
    try:
        with opener(request, timeout=20) as response:
            body = response.read(100001)
        if len(body) > 100000:
            raise SystemExit('Resposta do Asaas excedeu o tamanho esperado.')
        data = json.loads(body)
        if not isinstance(data, dict) or not all(isinstance(data.get(k), str) and data[k] for k in ['agency', 'account', 'accountDigit']):
            raise SystemExit('O Asaas nao retornou os dados de conta esperados. Confira a disponibilidade da conta no painel.')
    except urllib.error.HTTPError as error:
        # Do not display remote bodies, tokens or account details.
        raise SystemExit(f'Asaas retornou HTTP {error.code}. Confira a chave, permissoes e ambiente no painel.') from None
    except (urllib.error.URLError, TimeoutError):
        raise SystemExit('Nao foi possivel conectar ao Asaas. Nenhuma cobranca foi criada.') from None
    except (ValueError, UnicodeError):
        raise SystemExit('O Asaas retornou uma resposta inesperada. Nenhuma cobranca foi criada.') from None
    return mode


def main():
    mode = check_account(os.environ)
    result = f'Conexao Asaas validada no ambiente {mode}. Somente leitura; nenhum cliente ou pagamento criado.'
    print(result)
    summary = os.environ.get('GITHUB_STEP_SUMMARY')
    if summary:
        with open(summary, 'a', encoding='utf-8') as file:
            file.write('## Validacao Asaas\n\n' + result + '\n\nEsta verificacao nao certifica o checkout, o webhook ou a habilitacao de Pix/cartao.\n')


if __name__ == '__main__':
    main()
