-- Store-scoped option group availability overrides.
-- KDS uses this so kitchen staff can disable only option groups attached to Kitchen printer
-- group categories for their own store without changing other branches.

create table if not exists public.option_group_store_availability (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  group_key text not null,
  group_name text not null,
  is_available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, group_key)
);

create or replace function public.set_option_group_store_availability_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_option_group_store_availability_updated_at on public.option_group_store_availability;
create trigger trg_option_group_store_availability_updated_at
before update on public.option_group_store_availability
for each row
execute function public.set_option_group_store_availability_updated_at();

alter table public.option_group_store_availability enable row level security;

grant select on public.option_group_store_availability to anon, authenticated;
grant insert, update, delete on public.option_group_store_availability to authenticated;

drop policy if exists "Public read option group store availability" on public.option_group_store_availability;
create policy "Public read option group store availability"
on public.option_group_store_availability
for select
to anon, authenticated
using (true);

drop policy if exists "KDS accounts manage own store option group availability" on public.option_group_store_availability;
create policy "KDS accounts manage own store option group availability"
on public.option_group_store_availability
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and replace(replace(lower(coalesce(p.role, '')), '-', '_'), ' ', '_') in ('kds', 'kitchen')
      and p.store_id::text = option_group_store_availability.store_id::text
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and replace(replace(lower(coalesce(p.role, '')), '-', '_'), ' ', '_') in ('kds', 'kitchen')
      and p.store_id::text = option_group_store_availability.store_id::text
  )
);

drop policy if exists "Admins manage option group store availability" on public.option_group_store_availability;
create policy "Admins manage option group store availability"
on public.option_group_store_availability
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and replace(replace(lower(coalesce(p.role, '')), '-', '_'), ' ', '_') in ('admin', 'super_admin', 'owner')
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and replace(replace(lower(coalesce(p.role, '')), '-', '_'), ' ', '_') in ('admin', 'super_admin', 'owner')
  )
);
