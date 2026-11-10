begin;
create table if not exists public.serenity_stone_color_overrides_v1 (
 color_id text not null check(color_id in('verde','azul','turquesa','rosa','roxo','vermelho','laranja','amarelo','champanhe','preto','cristal','boreal','marrom')),
 product_id uuid not null references public.products(id) on delete cascade,
 included boolean not null,updated_by uuid not null,updated_at timestamptz not null default now(),
 primary key(color_id,product_id)
);
alter table public.serenity_stone_color_overrides_v1 enable row level security;
revoke all on public.serenity_stone_color_overrides_v1 from public,anon,authenticated;
grant all on public.serenity_stone_color_overrides_v1 to service_role;
create or replace view public.serenity_stone_overrides_public_v1 with(security_barrier=true) as
 select o.color_id,o.product_id,o.included from public.serenity_stone_color_overrides_v1 o
 join public.products p on p.id=o.product_id
 where p.status='published' and p.visibility in('visible','catalog');
revoke all on public.serenity_stone_overrides_public_v1 from public,anon,authenticated;
grant select on public.serenity_stone_overrides_public_v1 to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
