begin;

create or replace view public.serenity_admin_label_center_v1
with (security_barrier = true)
as
with base as (
  select
    o.id as order_id,
    o.number as order_number,
    o.created_at,
    coalesce(nullif(btrim(o.customer_snapshot->>'name'), ''), 'Cliente não informado') as customer_name,
    o.shipping_pending,
    coalesce(o.shipping_details->>'company', '') as company,
    coalesce(o.shipping_details->>'service', '') as service,
    lower(btrim(coalesce(j.state, 'empty'))) as job_state,
    lower(btrim(coalesce(p.phase, 'empty'))) as purchase_phase,
    lower(btrim(coalesce(p.carrier_status, ''))) as carrier_status,
    p.order_id is not null as has_purchase,
    coalesce(
      j.state = 'prepared'
      and j.remote_id::text ~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
      and lower(j.remote_id::text) = lower(p.remote_id::text)
      and nullif(j.operation::text, '') is not null
      and j.operation::text = p.operation::text,
      false
    ) as current_purchase,
    lower(btrim(coalesce(t.carrier_status, ''))) as tracking_status,
    coalesce(t.tracking_code, '') as saved_tracking_code,
    coalesce(lower(t.remote_id::text) = lower(j.remote_id::text), false) as current_tracking
  from public.serenity_orders o
  left join public.serenity_label_jobs j on j.order_id = o.id
  left join public.serenity_label_purchases p on p.order_id = o.id
  left join public.serenity_shipment_tracking t on t.order_id = o.id
  where o.status = 'paid'
    and (
      o.source = 'site'
      or (o.delivery_address is not null and o.delivery_address <> '{}'::jsonb)
      or j.order_id is not null
    )
), classified as (
  select
    base.*,
    case
      when job_state in ('creating', 'uncertain')
        or job_state not in ('empty', 'quoted', 'rejected', 'prepared')
        or (has_purchase and not current_purchase)
        or purchase_phase in ('buying', 'uncertain', 'blocked')
        or purchase_phase not in ('empty', 'review', 'paid', 'generating', 'ready', 'buying', 'uncertain', 'blocked')
        or (current_purchase and carrier_status in ('canceled', 'cancelled', 'expired'))
      then 'review'
      when current_purchase and purchase_phase in ('paid', 'generating', 'ready')
        and (
          carrier_status in ('posted', 'delivered')
          or (current_tracking and tracking_status in ('posted', 'delivered'))
        )
      then 'shipped'
      when current_purchase and purchase_phase in ('paid', 'generating', 'ready')
      then 'purchased'
      else 'to_buy'
    end as label_stage
  from base
)
select
  order_id,
  order_number,
  created_at,
  customer_name,
  shipping_pending,
  company,
  service,
  job_state,
  purchase_phase,
  label_stage,
  case
    when label_stage = 'review' then 'Conferir envio'
    when label_stage = 'shipped' then 'Acompanhar envio'
    when label_stage = 'purchased' and purchase_phase = 'ready' then 'Imprimir e postar'
    when label_stage = 'purchased' then 'Conferir geração'
    when shipping_pending then 'Confirmar frete'
    when job_state = 'prepared' then 'Conferir e comprar'
    else 'Preparar etiqueta'
  end as next_action,
  case
    when current_purchase and current_tracking
      and purchase_phase in ('paid', 'generating', 'ready')
      and label_stage <> 'review'
      and saved_tracking_code ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$'
    then saved_tracking_code
    else ''
  end as tracking_code,
  case
    when label_stage = 'review' then
      'Confira o estado salvo e o Melhor Envio antes de tentar outra compra.'
    when label_stage = 'shipped' then
      'Postagem ou entrega registrada. Acompanhe o transporte no pedido.'
    when label_stage = 'purchased' and purchase_phase = 'ready' then
      'Etiqueta gerada. Imprima e confirme a postagem quando ela ocorrer.'
    when label_stage = 'purchased' then
      'Pagamento da etiqueta registrado. Confira a geração antes de imprimir.'
    when shipping_pending then
      'O frete precisa ser confirmado antes da compra da etiqueta.'
    else
      'Pedido pago. Confira os dados e a disponibilidade das peças antes de comprar a etiqueta.'
  end as stage_message
from classified;

revoke all on public.serenity_admin_label_center_v1
  from public, anon, authenticated;
grant select on public.serenity_admin_label_center_v1 to service_role;

notify pgrst, 'reload schema';

commit;
