begin;
select pg_advisory_xact_lock(7391542030);
-- Requer 01-notificacoes.sql. Somente eventos futuros; não reenvia compras antigas.
alter table public.serenity_email_outbox_v1 drop constraint if exists serenity_email_outbox_v1_kind_check;
alter table public.serenity_email_outbox_v1 add constraint serenity_email_outbox_v1_kind_check check (kind in ('paid','owner_paid','shipped','delivered'));

create or replace function public.serenity_email_enqueue_v1(p_order uuid,p_kind text,p_tracking text default null)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare o public.serenity_orders%rowtype; recipient text; lines jsonb;
begin
  if p_kind not in ('paid','shipped','delivered') then raise exception 'EMAIL_KIND'; end if;
  select * into o from public.serenity_orders where id=p_order;
  -- Nunca notificar pagamentos de teste ou pedidos sem pagamento aplicado.
  if not found or o.source is distinct from 'site' or o.status is distinct from 'paid' or not exists (
    select 1 from public.serenity_checkout_sessions_v2 c where c.id=o.id and c.environment='production'
  ) then return; end if;
  -- Não inclui CPF, endereço, custo ou fornecedor no conteúdo da fila.
  select coalesce(jsonb_agg(jsonb_build_object('name',i->>'name','variation',i->>'variation','quantity',i->'quantity','unit_price',i->'unit_price','stem_length_mm',i->'stem_length_mm','sterilized',i->'sterilized','anodization',i->>'anodization','voltage',i->>'voltage')),'[]'::jsonb)
    into lines from jsonb_array_elements(coalesce(o.items,'[]'::jsonb)) i;
  recipient:=lower(trim(o.customer_snapshot->>'email'));
  if recipient is not null and length(recipient)<=254 and recipient ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
  insert into public.serenity_email_outbox_v1(order_id,kind,recipient,payload)
  values(o.id,p_kind,recipient,jsonb_build_object('number',o.number,'name',o.customer_snapshot->>'name','total',o.total,'items',lines,'tracking',left(p_tracking,120)))
  on conflict(order_id,kind) do nothing;
  end if;
  if p_kind='paid' then
    insert into public.serenity_email_outbox_v1(order_id,kind,recipient,payload)
    values(o.id,'owner_paid','contato@serenitypiercings.com.br',jsonb_build_object('number',o.number,'name',o.customer_snapshot->>'name','total',o.total,'items',lines))
    on conflict(order_id,kind) do nothing;
  end if;
end $$;

revoke all on function public.serenity_email_enqueue_v1(uuid,text,text) from public,anon,authenticated;
commit;
