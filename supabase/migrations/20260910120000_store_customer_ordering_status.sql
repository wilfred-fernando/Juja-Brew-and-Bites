-- Branch-level customer ordering controls for POS: open, busy, or closed.

alter table public.stores
  add column if not exists customer_ordering_status text not null default 'open',
  add column if not exists customer_ordering_status_updated_at timestamp with time zone not null default now(),
  add column if not exists customer_ordering_status_updated_by uuid references auth.users(id) on delete set null;

alter table public.stores
  drop constraint if exists stores_customer_ordering_status_check;

alter table public.stores
  add constraint stores_customer_ordering_status_check
  check (customer_ordering_status in ('open', 'busy', 'closed'));

comment on column public.stores.customer_ordering_status is
  'Controls whether the branch accepts customer web orders: open, busy, or closed.';

create or replace function public.set_store_customer_ordering_status(
  p_store_id uuid,
  p_status text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := lower(trim(coalesce(p_status, '')));
  v_role text;
  v_profile_store_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if v_status not in ('open', 'busy', 'closed') then
    raise exception 'Invalid customer ordering status';
  end if;

  select lower(coalesce(role, '')), store_id
    into v_role, v_profile_store_id
  from public.profiles
  where id = auth.uid();

  if v_role not in ('cashier', 'admin', 'super_admin') then
    raise exception 'POS staff access is required';
  end if;

  if v_role = 'cashier' and v_profile_store_id is distinct from p_store_id then
    raise exception 'Cashiers may only update their assigned store';
  end if;

  update public.stores
  set
    customer_ordering_status = v_status,
    customer_ordering_status_updated_at = now(),
    customer_ordering_status_updated_by = auth.uid(),
    updated_at = now()
  where id = p_store_id
    and is_active = true;

  if not found then
    raise exception 'Active store not found';
  end if;

  return v_status;
end;
$$;

revoke all on function public.set_store_customer_ordering_status(uuid, text) from public;
grant execute on function public.set_store_customer_ordering_status(uuid, text) to authenticated;

create or replace function public.guard_web_order_store_status()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_status text;
begin
  if new.store_id is null
     and coalesce(new.branch_id, '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    new.store_id := new.branch_id::uuid;
  end if;

  select customer_ordering_status
    into v_status
  from public.stores
  where id = new.store_id
    and is_active = true;

  if v_status is null then
    raise exception using message = 'STORE_ORDERING_CLOSED', detail = 'The selected store is not active.';
  end if;

  if v_status = 'busy' then
    raise exception using message = 'STORE_ORDERING_BUSY', detail = 'Please try ordering again after 30 minutes.';
  end if;

  if v_status = 'closed' then
    raise exception using message = 'STORE_ORDERING_CLOSED', detail = 'The store is closed today.';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_web_order_store_status_before_insert on public.web_orders;
create trigger guard_web_order_store_status_before_insert
before insert on public.web_orders
for each row
execute function public.guard_web_order_store_status();

create index if not exists stores_customer_ordering_status_idx
  on public.stores (is_active, customer_ordering_status, name);
