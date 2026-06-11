-- Rollout compatibility for customer web-order inserts.
-- Older deployed clients send branch_id but not store_id. Fill store_id before
-- RLS checks and allow authenticated customers to insert their own routed order.

create or replace function public.set_web_order_store_id_from_branch()
returns trigger
language plpgsql
as $$
begin
  if new.store_id is null
     and new.branch_id is not null
     and new.branch_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    new.store_id := new.branch_id::uuid;
  end if;

  if new.branch_id is null and new.store_id is not null then
    new.branch_id := new.store_id::text;
  end if;

  new.order_source := coalesce(nullif(new.order_source, ''), 'web');
  new.order_status := coalesce(nullif(new.order_status, ''), new.status::text, 'pending');
  new.fulfillment_type := coalesce(nullif(new.fulfillment_type, ''), new.dining_option::text);

  return new;
end;
$$;

drop trigger if exists trg_set_web_order_store_id_from_branch on public.web_orders;
create trigger trg_set_web_order_store_id_from_branch
before insert or update of branch_id, store_id, status, order_source, order_status, dining_option, fulfillment_type
on public.web_orders
for each row
execute function public.set_web_order_store_id_from_branch();

drop policy if exists "web_orders_customer_insert" on public.web_orders;
create policy "web_orders_customer_insert"
on public.web_orders
for insert
to authenticated
with check (
  auth.uid() = user_id
  and store_id is not null
  and branch_id = store_id::text
);
