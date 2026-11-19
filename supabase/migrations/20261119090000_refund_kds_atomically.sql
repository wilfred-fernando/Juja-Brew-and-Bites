begin;
set local lock_timeout = '5s';

-- Run inside the refund transaction, including refunds from older POS clients.
create or replace function public.void_refunded_order_kds()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  roots text[];
begin
  if lower(new.status) <> 'refunded' then return new; end if;
  update public.order_items
  set status = 'refunded', refunded_at = coalesce(refunded_at, new.refunded_at, now()),
      refunded_by = coalesce(refunded_by, new.refunded_by),
      refund_reason = coalesce(refund_reason, new.refund_reason)
  where order_id = new.id and status is distinct from 'refunded';
  roots := array_remove(array[new.id::text,
    nullif(new.source_metadata->>'open_ticket_id', ''),
    nullif(new.source_metadata->>'saved_ticket_id', '')], null);
  update public.kds_tickets k
  set status = 'voided', voided_at = coalesce(k.voided_at, new.refunded_at, now()),
      items = (select coalesce(jsonb_agg(item || jsonb_build_object(
        'voided', true, 'voidedAt', coalesce(new.refunded_at, now()), 'status', 'refunded') order by position), '[]'::jsonb)
        from jsonb_array_elements(k.items) with ordinality entries(item, position))
  where k.source_type = 'pos' and k.store_id = new.store_id
    and (k.order_id = new.id or exists (
      select 1 from unnest(roots) root
      where k.source_id = root or starts_with(k.source_id, root || ':batch:')));
  return new;
end;
$$;
revoke all on function public.void_refunded_order_kds() from public;
drop trigger if exists void_refunded_order_kds on public.orders;
create trigger void_refunded_order_kds after update of status on public.orders
for each row when (new.status = 'refunded') execute function public.void_refunded_order_kds();
commit;
