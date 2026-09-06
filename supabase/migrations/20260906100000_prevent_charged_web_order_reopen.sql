-- Keep charged/completed web orders terminal even when another POS device has
-- a stale incoming-order modal or accepted-order list open.

with linked_paid_sales as (
  select distinct on (o.source_web_order_id)
    o.source_web_order_id,
    o.receipt_number,
    o.receipt_sequence,
    o.receipt_date,
    coalesce(o.paid_at, o.created_at) as completed_at
  from public.orders o
  where o.source_web_order_id is not null
    and o.receipt_number is not null
    and lower(coalesce(o.status, '')) in ('paid', 'completed', 'delivered')
  order by o.source_web_order_id, coalesce(o.paid_at, o.created_at) desc
)
update public.web_orders w
set status = 'completed',
    order_status = 'completed',
    receipt_number = coalesce(w.receipt_number, sale.receipt_number),
    receipt_sequence = coalesce(w.receipt_sequence, sale.receipt_sequence),
    receipt_date = coalesce(w.receipt_date, sale.receipt_date),
    completed_at = coalesce(w.completed_at, sale.completed_at),
    updated_at = now()
from linked_paid_sales sale
where sale.source_web_order_id = w.id
  and (
    lower(coalesce(w.status, '')) in ('pending', 'scheduled', 'accepted', 'preparing', 'ready')
    or lower(coalesce(w.order_status, '')) in ('pending', 'scheduled', 'accepted', 'preparing', 'ready')
  );

update public.kds_tickets k
set status = 'completed',
    completed_at = coalesce(k.completed_at, w.completed_at, now()),
    updated_at = now()
from public.web_orders w
where k.source_type = 'web'
  and k.source_id = w.id::text
  and nullif(btrim(coalesce(w.receipt_number, '')), '') is not null
  and lower(coalesce(w.status, w.order_status, '')) in ('completed', 'delivered', 'paid')
  and lower(coalesce(k.status, '')) in ('pending', 'scheduled', 'accepted', 'preparing', 'ready');

create or replace function public.prevent_charged_web_order_reopen()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_old_closed boolean;
  v_new_active boolean;
begin
  v_old_closed := nullif(btrim(coalesce(old.receipt_number, '')), '') is not null
    or lower(coalesce(old.status, '')) in ('completed', 'delivered', 'paid', 'cancelled', 'canceled', 'rejected', 'refunded', 'voided')
    or lower(coalesce(old.order_status, '')) in ('completed', 'delivered', 'paid', 'cancelled', 'canceled', 'rejected', 'refunded', 'voided');

  v_new_active := lower(coalesce(new.status, '')) in ('pending', 'scheduled', 'accepted', 'preparing', 'ready')
    or lower(coalesce(new.order_status, '')) in ('pending', 'scheduled', 'accepted', 'preparing', 'ready');

  if v_old_closed and v_new_active then
    raise exception 'A charged or closed web order cannot return to an active status.'
      using errcode = 'check_violation';
  end if;

  if v_old_closed and (
    new.items is distinct from old.items
    or new.subtotal is distinct from old.subtotal
    or new.total is distinct from old.total
    or new.dining_option is distinct from old.dining_option
    or new.fulfillment_type is distinct from old.fulfillment_type
  ) then
    raise exception 'Items and totals cannot be changed after a web order is charged or closed.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_charged_web_order_reopen on public.web_orders;
create trigger prevent_charged_web_order_reopen
before update of status, order_status, receipt_number, items, subtotal, total, dining_option, fulfillment_type on public.web_orders
for each row
execute function public.prevent_charged_web_order_reopen();

comment on function public.prevent_charged_web_order_reopen() is
  'Blocks stale POS clients from moving receipt-bearing or terminal web orders back to active statuses.';
