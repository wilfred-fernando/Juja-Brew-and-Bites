begin;

create table if not exists public.paymongo_payments (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'paymongo',
  entity_type text not null check (entity_type in ('booking', 'web_order')),
  entity_id uuid not null,
  user_id uuid references auth.users(id) on delete set null,
  checkout_session_id text unique,
  payment_intent_id text,
  payment_id text,
  idempotency_key text not null unique,
  amount_centavos bigint not null check (amount_centavos >= 0),
  currency text not null default 'PHP',
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed', 'expired', 'refunded', 'cancelled')),
  checkout_url text,
  payment_method text,
  reference_number text,
  metadata jsonb not null default '{}'::jsonb,
  event_data jsonb not null default '{}'::jsonb,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entity_type, entity_id)
);

create table if not exists public.paymongo_webhook_events (
  event_id text primary key,
  event_type text not null,
  livemode boolean not null default false,
  payload jsonb not null,
  processed_at timestamptz,
  processing_error text,
  created_at timestamptz not null default now()
);

create index if not exists paymongo_payments_user_id_idx
  on public.paymongo_payments (user_id, created_at desc);
create index if not exists paymongo_payments_entity_idx
  on public.paymongo_payments (entity_type, entity_id);
create index if not exists paymongo_payments_status_idx
  on public.paymongo_payments (status, created_at desc);

create or replace function public.set_paymongo_payment_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_paymongo_payment_updated_at on public.paymongo_payments;
create trigger set_paymongo_payment_updated_at
before update on public.paymongo_payments
for each row execute function public.set_paymongo_payment_updated_at();

alter table public.paymongo_payments enable row level security;
alter table public.paymongo_webhook_events enable row level security;

drop policy if exists "Customers can view their PayMongo payments" on public.paymongo_payments;
create policy "Customers can view their PayMongo payments"
on public.paymongo_payments
for select
to authenticated
using (auth.uid() = user_id);

revoke all on public.paymongo_webhook_events from anon, authenticated;
grant select on public.paymongo_payments to authenticated;

commit;
