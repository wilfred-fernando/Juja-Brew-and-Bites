create table if not exists public.kds_tickets (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('pos', 'web')),
  source_id text not null,
  order_id uuid references public.orders(id) on delete set null,
  web_order_id uuid references public.web_orders(id) on delete cascade,
  store_id text,
  receipt_number text,
  ticket_number text,
  customer_name text,
  dining_option text,
  items jsonb not null default '[]'::jsonb,
  total numeric not null default 0,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'preparing', 'ready', 'completed', 'voided', 'rejected')),
  payment_status text,
  source_created_at timestamp with time zone,
  accepted_at timestamp with time zone,
  started_at timestamp with time zone,
  ready_at timestamp with time zone,
  completed_at timestamp with time zone,
  voided_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (source_type, source_id)
);

create index if not exists kds_tickets_store_status_idx
  on public.kds_tickets (store_id, status, created_at desc);

create index if not exists kds_tickets_source_idx
  on public.kds_tickets (source_type, source_id);

create or replace function public.set_kds_tickets_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_set_kds_tickets_updated_at on public.kds_tickets;
create trigger trg_set_kds_tickets_updated_at
before update on public.kds_tickets
for each row execute function public.set_kds_tickets_updated_at();

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
        lower(coalesce(p.role, '')) in ('admin', 'super_admin')
        or (
          lower(coalesce(p.role, '')) in ('cashier', 'kitchen')
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
        lower(coalesce(p.role, '')) in ('admin', 'super_admin')
        or (
          lower(coalesce(p.role, '')) in ('cashier', 'kitchen')
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
        lower(coalesce(p.role, '')) in ('admin', 'super_admin')
        or (
          lower(coalesce(p.role, '')) in ('cashier', 'kitchen')
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
        lower(coalesce(p.role, '')) in ('admin', 'super_admin')
        or (
          lower(coalesce(p.role, '')) in ('cashier', 'kitchen')
          and (p.store_id::text = kds_tickets.store_id or kds_tickets.store_id is null)
        )
      )
  )
);
