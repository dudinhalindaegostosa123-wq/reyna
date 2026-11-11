"""Build the self-contained initial installer from reviewed production SQL modules.

No database access. No fixtures or credentials are read by this builder.
"""
from pathlib import Path
import hashlib
import re

ROOT = Path(__file__).resolve().parents[1]
MODULES = [
 'database/lunarity-base/01-tabelas.sql',
 'database/lunarity-base/02-contas-frete.sql',
 'database/lunarity-base/04-sessoes-tabelas.sql',
 'database/lunarity-base/05-reservas-estoque.sql',
 'database/lunarity-base/06-rotinas-estoque-cupons.sql',
 'database/lunarity-base/03-cotacao.sql',
 'database/lunarity-base/07-reservas-cupons.sql',
 'database/lunarity-base/08-sessoes.sql',
 'database/lunarity-base/09-tentativas.sql',
 'database/lunarity-base/10-confirmacao.sql',
 'database/lunarity-base/11-inicio-conta.sql',
 'database/payments/03-pix-cartao.sql',
 'database/payments/04-cliente-pedido-aprovado.sql',
 'database/collection/01-progressivo.sql',
 'database/collection/02-faixas-5-7-10-15.sql',
 'database/collection/03-excluir-ouro-bioflex.sql',
 'database/pix-discount/01-pix-five.sql',
 'database/lunarity-base/12-permissoes.sql',
 'database/asaas/01-checkout.sql',
]

def build():
    chunks = ["""-- LUNARITY: instalação inicial de contas, pedidos, frete, checkout e Asaas.
-- Gerado por scripts/build-lunarity-installer.py; editar os módulos, não este arquivo.
-- Não contém clientes, pedidos, credenciais, preços ou dimensões da loja original.
-- Preserva catálogo e configurações existentes. Frete e atacado começam desativados.
-- Executar inteiro no SQL Editor do Supabase da Lunarity.
begin;
select pg_advisory_xact_lock(7391542026);
do $lunarity_install$
declare name text;
begin
 if current_setting('server_version_num')::integer<150000 then
  raise exception 'LUNARITY_POSTGRES_15_REQUIRED';
 end if;
 if to_regclass('public.serenity_lunarity_installation_v1') is not null then
  if exists(select 1 from public.serenity_lunarity_installation_v1 where version=1) then
   raise notice 'Lunarity: base já instalada; nenhuma rotina ou configuração foi substituída.';
   return;
  end if;
  raise exception 'LUNARITY_INSTALLATION_VERSION_UNKNOWN';
 end if;
 foreach name in array array['serenity_orders','serenity_customers','serenity_customer_accounts',
  'serenity_wholesale_settings','serenity_shipping_settings','serenity_shipping_quotes',
  'serenity_coupons','serenity_coupon_products','serenity_coupon_redemptions','serenity_stock_reservations',
  'serenity_stock_events','serenity_checkout_sessions_v2','serenity_checkout_payments_v2',
  'serenity_checkout_stock_v2','serenity_checkout_coupon_v2','serenity_checkout_payment_events_v2','serenity_checkout_rate_limits'] loop
  if to_regclass('public.'||name) is not null then
   raise exception 'LUNARITY_EXISTING_INSTALLATION: % já existe. Não executar um instalador inicial sobre dados existentes.',name;
  end if;
 end loop;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
  and p.proname ~ '^serenity_(checkout|stock|wholesale|customer_account|asaas|collection_)') then
  raise exception 'LUNARITY_EXISTING_FUNCTIONS: conferir instalação anterior antes de continuar.';
 end if;
 if to_regclass('public.products') is null or to_regclass('public.product_variants') is null
  or to_regclass('public.serenity_product_commercial') is null
  or to_regclass('public.serenity_commerce_settings_v1') is null
  or to_regclass('public.serenity_collection_settings') is null
  or to_regclass('public.serenity_pix_discount_settings_v4') is null
  or to_regprocedure('public.serenity_target_effective_price(uuid,uuid,numeric,numeric,timestamptz,timestamptz)') is null then
  raise exception 'LUNARITY_CATALOG_REQUIRED: este instalador exige o catálogo e configurações identificados no inventário.';
 end if;
 if (select atttypid from pg_attribute where attrelid='public.products'::regclass and attname='id' and not attisdropped)<>'uuid'::regtype
  or (select atttypid from pg_attribute where attrelid='public.product_variants'::regclass and attname='id' and not attisdropped)<>'uuid'::regtype then
  raise exception 'LUNARITY_CATALOG_UUID_REQUIRED';
 end if;
"""]
    for index, relative in enumerate(MODULES):
        source = (ROOT / relative).read_text()
        # Only top-level transaction delimiters occur at column zero in these modules.
        source = re.sub(r'^(?:begin|commit);\s*$', '', source, flags=re.M | re.I)
        tag = f'$lunarity_component_{index}$'
        if tag in source:
            raise ValueError('SQL delimiter collision')
        digest = hashlib.sha256(source.encode()).hexdigest()
        chunks.append(f'\n -- {relative} SHA256 {digest}\n execute {tag}\n{source.strip()}\n{tag};\n')
    chunks.append("""
 create table public.serenity_lunarity_installation_v1(version integer primary key,installed_at timestamptz not null default now());
 alter table public.serenity_lunarity_installation_v1 enable row level security;
 revoke all on public.serenity_lunarity_installation_v1 from public,anon,authenticated;
 grant select on public.serenity_lunarity_installation_v1 to service_role;
 insert into public.serenity_lunarity_installation_v1(version) values(1);
end;
$lunarity_install$;
notify pgrst,'reload schema';
commit;
-- Somente instalação local: isto não ativa cobranças, frete ou uma conta Asaas.
select public.serenity_asaas_ready_v1() as pagamentos,
 (select enabled from public.serenity_shipping_settings where singleton) as frete_automatico,
 (select count(*) from public.serenity_orders) as pedidos_existentes;
""")
    return '\n'.join(chunks)

if __name__ == '__main__':
    (ROOT / 'database/asaas/03-instalar-base-lunarity.sql').write_text(build())
