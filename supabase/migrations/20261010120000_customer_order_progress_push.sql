-- Older APKs continue receiving notification payloads until they register support.
alter table public.customer_push_tokens
  add column if not exists order_progress_supported boolean not null default false;

-- Coalesce rapid changes per order; send the latest saved state, not a stale event.
create table if not exists public.customer_order_push_outbox (
  web_order_id uuid primary key references public.web_orders(id) on delete cascade,
  version timestamptz not null,
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  leased_until timestamptz,
  last_error text
);
alter table public.customer_order_push_outbox enable row level security;
revoke all on public.customer_order_push_outbox from anon, authenticated;
grant all on public.customer_order_push_outbox to service_role;

create or replace function public.queue_customer_order_status_push()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.user_id is null then return new; end if;
  if tg_op = 'UPDATE' then
    if new.status is not distinct from old.status
      and new.delivery_status is not distinct from old.delivery_status then return new; end if;
  end if;
  if lower(coalesce(new.status, '')) not in
    ('pending', 'accepted', 'preparing', 'ready', 'completed', 'delivered', 'cancelled', 'canceled', 'rejected') then
    delete from public.customer_order_push_outbox where web_order_id = new.id;
    return new;
  end if;
  insert into public.customer_order_push_outbox (web_order_id, version)
    values (new.id, new.updated_at)
  on conflict (web_order_id) do update set version = excluded.version,
    attempts = 0, available_at = now(), leased_until = null, last_error = null;
  return new;
end;
$$;
revoke all on function public.queue_customer_order_status_push() from public;
create trigger queue_customer_order_status_push
after insert or update of status, delivery_status on public.web_orders
for each row execute function public.queue_customer_order_status_push();

create or replace function public.claim_customer_order_push(p_order_id uuid default null)
returns setof public.customer_order_push_outbox
language sql security definer set search_path = '' as $$
  update public.customer_order_push_outbox q set
    leased_until = now() + interval '5 minutes', attempts = q.attempts + 1
  where q.web_order_id in (
    select web_order_id from public.customer_order_push_outbox
    where (p_order_id is null or web_order_id = p_order_id)
      and available_at <= now() and (leased_until is null or leased_until < now())
      and attempts < 8
    order by available_at limit 20 for update skip locked
  ) returning q.*;
$$;
revoke all on function public.claim_customer_order_push(uuid) from public, anon, authenticated;
grant execute on function public.claim_customer_order_push(uuid) to service_role;
