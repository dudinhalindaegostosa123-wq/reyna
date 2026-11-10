begin;
create table if not exists public.serenity_ready_projects (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  image_path text not null default '',
  enabled boolean not null default false,
  position integer not null default 0 check (position between 0 and 10000),
  version integer not null default 1,
  items jsonb not null default '[]'::jsonb
    check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 30),
  updated_at timestamptz not null default now()
);
alter table public.serenity_ready_projects enable row level security;
revoke all on public.serenity_ready_projects from anon, authenticated;
grant select on public.serenity_ready_projects to anon, authenticated;
grant all on public.serenity_ready_projects to service_role;
drop policy if exists ready_projects_published on public.serenity_ready_projects;
create policy ready_projects_published on public.serenity_ready_projects
  for select to anon, authenticated using (enabled = true);
notify pgrst, 'reload schema';
commit;
