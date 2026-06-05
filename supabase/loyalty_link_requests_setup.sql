-- Loyalty account link request table and policies.
-- Run this in Supabase SQL editor if link requests do not appear in Admin > Loyalty.

create table if not exists public.loyalty_link_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  input_name text not null,
  input_birthday text not null,
  matched_member_id text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  rejected_at timestamptz
);

alter table public.loyalty_link_requests
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists input_name text,
  add column if not exists input_birthday text,
  add column if not exists matched_member_id text,
  add column if not exists status text default 'pending',
  add column if not exists created_at timestamptz default now(),
  add column if not exists approved_at timestamptz,
  add column if not exists rejected_at timestamptz;

create index if not exists loyalty_link_requests_status_created_idx
  on public.loyalty_link_requests(status, created_at desc);

create index if not exists loyalty_link_requests_user_idx
  on public.loyalty_link_requests(user_id);

alter table public.loyalty_link_requests enable row level security;

grant select, insert, update, delete on public.loyalty_link_requests to authenticated;

drop policy if exists "loyalty_link_requests_customer_insert" on public.loyalty_link_requests;
create policy "loyalty_link_requests_customer_insert"
on public.loyalty_link_requests
for insert
to authenticated
with check (
  user_id = auth.uid()
  and coalesce(status, 'pending') = 'pending'
);

drop policy if exists "loyalty_link_requests_customer_select_own" on public.loyalty_link_requests;
create policy "loyalty_link_requests_customer_select_own"
on public.loyalty_link_requests
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "loyalty_link_requests_admin_select" on public.loyalty_link_requests;
create policy "loyalty_link_requests_admin_select"
on public.loyalty_link_requests
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role, '')) in ('admin', 'super_admin')
  )
);

drop policy if exists "loyalty_link_requests_admin_update" on public.loyalty_link_requests;
create policy "loyalty_link_requests_admin_update"
on public.loyalty_link_requests
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role, '')) in ('admin', 'super_admin')
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role, '')) in ('admin', 'super_admin')
  )
);
