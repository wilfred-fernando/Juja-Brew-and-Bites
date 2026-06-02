create table if not exists public.cashier_pos (
  id text primary key,
  store_id text,
  mode text not null check (mode in ('open', 'close')),
  cashier_name text,
  cash_total numeric(12, 2) not null default 0,
  denominations jsonb not null default '{}'::jsonb,
  sales_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.cashier_pos
  add column if not exists store_id text,
  add column if not exists mode text,
  add column if not exists cashier_name text,
  add column if not exists cash_total numeric(12, 2) default 0,
  add column if not exists denominations jsonb default '{}'::jsonb,
  add column if not exists sales_summary jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now();

alter table public.cashier_pos enable row level security;

drop policy if exists "cashier_pos_authenticated_all" on public.cashier_pos;
create policy "cashier_pos_authenticated_all"
  on public.cashier_pos
  for all
  to authenticated
  using (true)
  with check (true);

alter table public.orders enable row level security;
alter table public.order_items enable row level security;

alter table public.orders
  add column if not exists items jsonb not null default '[]'::jsonb;

drop policy if exists "orders_authenticated_all" on public.orders;
create policy "orders_authenticated_all"
  on public.orders
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "order_items_authenticated_all" on public.order_items;
create policy "order_items_authenticated_all"
  on public.order_items
  for all
  to authenticated
  using (true)
  with check (true);

create or replace function public.set_orders_branch_id_from_store()
returns trigger
language plpgsql
as $$
begin
  if new.branch_id is null then
    new.branch_id := new.store_id;
  end if;
  return new;
end;
$$;

drop trigger if exists set_orders_branch_id_from_store_trigger on public.orders;
create trigger set_orders_branch_id_from_store_trigger
before insert or update on public.orders
for each row
execute function public.set_orders_branch_id_from_store();

alter table public.web_orders
  add column if not exists delivery_address text,
  add column if not exists payment_method text,
  add column if not exists payment_status text default 'pending',
  add column if not exists payment_proof_url text,
  add column if not exists payment_review_note text;

insert into storage.buckets (id, name, public)
values ('payment-proofs', 'payment-proofs', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "payment_proofs_authenticated_upload" on storage.objects;
create policy "payment_proofs_authenticated_upload"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'payment-proofs');

drop policy if exists "payment_proofs_public_read" on storage.objects;
create policy "payment_proofs_public_read"
  on storage.objects
  for select
  to public
  using (bucket_id = 'payment-proofs');
