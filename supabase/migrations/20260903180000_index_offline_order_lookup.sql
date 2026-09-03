-- Reuse the indexed client key for offline order lookup instead of scanning JSON.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
-- Keep older clients from inserting between the backfill and trigger creation.
lock table public.orders in share row exclusive mode;

-- Fail rather than silently remapping an existing upload to another identity.
do $$
begin
  if exists (
    select 1 from public.orders
    where nullif(source_metadata->>'offline_idempotency_key', '') is not null
      and client_idempotency_key is not null
      and client_idempotency_key <> source_metadata->>'offline_idempotency_key'
  ) then
    raise exception 'Conflicting offline and client idempotency keys require review.';
  end if;
end;
$$;

update public.orders
set client_idempotency_key = source_metadata->>'offline_idempotency_key'
where client_idempotency_key is null
  and nullif(source_metadata->>'offline_idempotency_key', '') is not null;

-- Older POS versions still send the key in source_metadata. Keep their writes
-- discoverable by the indexed lookup during deployment and device refreshes.
create or replace function public.set_pos_offline_client_key()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.client_idempotency_key is null then
    new.client_idempotency_key := nullif(new.source_metadata->>'offline_idempotency_key', '');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_orders_offline_client_key on public.orders;
create trigger trg_orders_offline_client_key
before insert or update of source_metadata on public.orders
for each row execute function public.set_pos_offline_client_key();

create unique index if not exists orders_client_idempotency_key_uidx
  on public.orders (client_idempotency_key)
  where client_idempotency_key is not null;

notify pgrst, 'reload schema';
commit;
