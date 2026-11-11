-- Lunarity: inventário SOMENTE LEITURA para preparar a instalação inicial.
-- Não lê produtos, clientes, pedidos, credenciais ou o conteúdo das funções.
-- Retorna somente nomes de objetos e tipos de colunas do schema public.
-- Executar no SQL Editor do mesmo projeto que contém os produtos da Lunarity.

select '1. tabelas e views existentes' as verificacao,
  coalesce(jsonb_agg(jsonb_build_object(
    'nome', c.relname,
    'tipo', case c.relkind when 'r' then 'tabela' when 'p' then 'tabela particionada'
      when 'v' then 'view' when 'm' then 'view materializada' end
  ) order by c.relname), '[]'::jsonb) as estrutura
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in ('r','p','v','m')

union all

select '2. colunas do catálogo',
  coalesce(jsonb_agg(jsonb_build_object(
    'tabela', c.relname, 'coluna', a.attname,
    'tipo', pg_catalog.format_type(a.atttypid,a.atttypmod),
    'obrigatoria', a.attnotnull
  ) order by c.relname,a.attnum), '[]'::jsonb)
from pg_catalog.pg_attribute a
join pg_catalog.pg_class c on c.oid=a.attrelid
join pg_catalog.pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('products','product_variants','product_media','store_catalog')
  and a.attnum>0 and not a.attisdropped

union all

select '3. funções de preço e checkout existentes',
  coalesce(jsonb_agg(jsonb_build_object(
    'funcao', p.proname,
    'argumentos', pg_catalog.pg_get_function_identity_arguments(p.oid),
    'retorno', pg_catalog.pg_get_function_result(p.oid)
  ) order by p.proname,p.oid), '[]'::jsonb)
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prokind='f' and (
  p.proname ~ '^(serenity|lunarity)_(checkout|stock|wholesale|commerce|collection|customer_account|guest|target_effective_price|effective_price|coupon)'
)

order by verificacao;
