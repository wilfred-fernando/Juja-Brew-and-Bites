begin;

-- Captured in the same transaction as the finance write; Cloudflare outages
-- cannot lose a change. Only the service role can read or acknowledge events.
create table if not exists public.finance_cloudflare_outbox (
  id bigint generated always as identity primary key,
  source_table text not null,
  source_id text not null,
  operation text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  payload jsonb not null,
  created_at timestamptz not null default clock_timestamp()
);
alter table public.finance_cloudflare_outbox enable row level security;
revoke all on public.finance_cloudflare_outbox from anon, authenticated;
grant select, delete on public.finance_cloudflare_outbox to service_role;

create or replace function public.queue_finance_cloudflare_change()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare snapshot jsonb;
begin
  snapshot := case when TG_OP = 'DELETE' then to_jsonb(OLD) else to_jsonb(NEW) end;
  insert into public.finance_cloudflare_outbox (source_table, source_id, operation, payload)
  values (TG_TABLE_NAME, snapshot->>'id', TG_OP, snapshot);
  return null;
end;
$$;
revoke all on function public.queue_finance_cloudflare_change() from public, anon, authenticated;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'finance_expenses', 'finance_petty_cash_entries', 'finance_petty_cash_funds',
    'finance_references', 'finance_delete_requests',
    'finance_daily_inventory_entries', 'finance_inventory_transfers'
  ] loop
    -- Lock before snapshotting so backfill cannot overwrite a newer change.
    execute format('lock table public.%I in share row exclusive mode', table_name);
    execute format('drop trigger if exists finance_cloudflare_change on public.%I', table_name);
    execute format('create trigger finance_cloudflare_change after insert or update or delete on public.%I for each row execute function public.queue_finance_cloudflare_change()', table_name);
    execute format('insert into public.finance_cloudflare_outbox (source_table, source_id, operation, payload) select %L, id::text, ''INSERT'', to_jsonb(t) from public.%I t', table_name, table_name);
  end loop;
end;
$$;
commit;
