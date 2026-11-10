begin;
select pg_advisory_xact_lock(7391542027);
create table if not exists public.serenity_stone_colors_v1 (
 id text primary key check(id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(id)<=80),
 name text not null check(length(trim(name)) between 2 and 60),
 color text not null check(color ~ '^#[0-9A-Fa-f]{6}$'),
 position integer not null default 100,
 updated_by uuid, created_at timestamptz not null default now()
);
insert into public.serenity_stone_colors_v1(id,name,color,position) values
('verde','Verde e esmeralda','#17654D',0),
('azul','Azul e safira','#294B94',1),
('turquesa','Turquesa e paraíba','#50B9B4',2),
('rosa','Rosa e pink','#D78BA5',3),
('roxo','Roxo e ametista','#825598',4),
('vermelho','Vermelho e rubi','#A82F43',5),
('laranja','Laranja','#DA8A42',6),
('amarelo','Amarelo','#D5B64F',7),
('champanhe','Champanhe','#BC9A75',8),
('preto','Preto e ônix','#383639',9),
('cristal','Cristal e branco','#DDE1DF',10),
('boreal','Boreal e multicolor','#A18CAF',11),
('marrom','Marrom e café','#85664F',12)
on conflict(id) do nothing;
alter table public.serenity_stone_colors_v1 enable row level security;
revoke all on public.serenity_stone_colors_v1 from public,anon,authenticated;
grant all on public.serenity_stone_colors_v1 to service_role;
create or replace view public.serenity_stone_colors_public_v1 with(security_barrier=true) as
 select id,name,color,position from public.serenity_stone_colors_v1;
revoke all on public.serenity_stone_colors_public_v1 from public,anon,authenticated;
grant select on public.serenity_stone_colors_public_v1 to anon,authenticated,service_role;
-- Instale 01-curadoria.sql antes deste arquivo. Preserva todas as seleções existentes.
alter table public.serenity_stone_color_overrides_v1 drop constraint if exists serenity_stone_color_overrides_v1_color_id_check;
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.serenity_stone_color_overrides_v1'::regclass and conname='stone_color_registry_fk') then
 alter table public.serenity_stone_color_overrides_v1 add constraint stone_color_registry_fk foreign key(color_id) references public.serenity_stone_colors_v1(id);
 end if;
end $$;
notify pgrst,'reload schema';
commit;
