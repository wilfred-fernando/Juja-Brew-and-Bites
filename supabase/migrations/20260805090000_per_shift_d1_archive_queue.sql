create table if not exists public.sales_archive_batches (
  id uuid primary key default gen_random_uuid(),
  shift_id text not null unique,
  store_id text,
  cashier_id uuid,
  opened_at timestamptz not null,
  closed_at timestamptz not null,
  business_date date not null,
  status text not null default 'pending' check (status in ('pending','uploading','verified','mismatch','failed','purge_pending','purged')),
  expected_counts jsonb not null default '{}'::jsonb,
  expected_totals jsonb not null default '{}'::jsonb,
  expected_checksum text,
  d1_counts jsonb,
  d1_totals jsonb,
  d1_checksum text,
  attempts integer not null default 0,
  last_error text,
  verified_at timestamptz,
  purge_after timestamptz,
  purged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sales_archive_batches_status_idx
  on public.sales_archive_batches (status, created_at);

create table if not exists public.sales_archive_batch_records (
  batch_id uuid not null references public.sales_archive_batches(id) on delete cascade,
  source_table text not null,
  source_id text not null,
  record_hash text not null,
  primary key (batch_id, source_table, source_id)
);

alter table public.sales_archive_batches enable row level security;
alter table public.sales_archive_batch_records enable row level security;

comment on table public.sales_archive_batches is
  'Server-only queue and validation ledger for per-shift D1 archival. No client RLS policies by design.';

create or replace function public.queue_closed_shift_for_d1_archive()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_opened_at timestamptz;
begin
  if lower(coalesce(new.mode, '')) not in ('close', 'end_day') then
    return new;
  end if;

  select cp.created_at into v_opened_at
  from public.cashier_pos cp
  where cp.store_id is not distinct from new.store_id
    and (new.cashier_id is null or cp.cashier_id is not distinct from new.cashier_id)
    and lower(coalesce(cp.mode, '')) = 'open'
    and cp.created_at <= new.created_at
  order by cp.created_at desc
  limit 1;

  insert into public.sales_archive_batches
    (shift_id, store_id, cashier_id, opened_at, closed_at, business_date, status)
  values
    (new.id::text, new.store_id, new.cashier_id,
     coalesce(v_opened_at, new.created_at), new.created_at,
     (coalesce(v_opened_at, new.created_at) at time zone 'Asia/Manila')::date, 'pending')
  on conflict (shift_id) do nothing;
  return new;
end;
$$;

drop trigger if exists cashier_pos_queue_d1_archive on public.cashier_pos;
create trigger cashier_pos_queue_d1_archive
after insert on public.cashier_pos
for each row execute function public.queue_closed_shift_for_d1_archive();
