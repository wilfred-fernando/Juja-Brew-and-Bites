alter table public.kds_tickets enable row level security;

grant select, insert, update on public.kds_tickets to authenticated;

drop policy if exists "kds_tickets_staff_select" on public.kds_tickets;
create policy "kds_tickets_staff_select"
on public.kds_tickets
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        replace(lower(coalesce(p.role, '')), '-', '_') in ('admin', 'super_admin')
        or (
          replace(lower(coalesce(p.role, '')), '-', '_') in ('cashier', 'kds', 'kitchen')
          and (p.store_id::text = kds_tickets.store_id or kds_tickets.store_id is null)
        )
      )
  )
);

drop policy if exists "kds_tickets_staff_insert" on public.kds_tickets;
create policy "kds_tickets_staff_insert"
on public.kds_tickets
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        replace(lower(coalesce(p.role, '')), '-', '_') in ('admin', 'super_admin')
        or (
          replace(lower(coalesce(p.role, '')), '-', '_') in ('cashier', 'kds', 'kitchen')
          and (p.store_id::text = kds_tickets.store_id or kds_tickets.store_id is null)
        )
      )
  )
);

drop policy if exists "kds_tickets_staff_update" on public.kds_tickets;
create policy "kds_tickets_staff_update"
on public.kds_tickets
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        replace(lower(coalesce(p.role, '')), '-', '_') in ('admin', 'super_admin')
        or (
          replace(lower(coalesce(p.role, '')), '-', '_') in ('cashier', 'kds', 'kitchen')
          and (p.store_id::text = kds_tickets.store_id or kds_tickets.store_id is null)
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        replace(lower(coalesce(p.role, '')), '-', '_') in ('admin', 'super_admin')
        or (
          replace(lower(coalesce(p.role, '')), '-', '_') in ('cashier', 'kds', 'kitchen')
          and (p.store_id::text = kds_tickets.store_id or kds_tickets.store_id is null)
        )
      )
  )
);
