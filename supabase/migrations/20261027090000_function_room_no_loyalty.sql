begin;
create or replace function public.booking_order_excludes_loyalty(p_order public.orders)
returns boolean language sql immutable set search_path=public as $$
  select coalesce(p_order.source_metadata->>'exclude_loyalty','false')='true'
    or nullif(p_order.source_metadata->>'booking_id','') is not null
    or nullif(p_order.source_metadata->>'reservation_fee_booking_id','') is not null
    or coalesce(p_order.source_metadata->>'transaction_kind','')='booking_reservation_fee'
    or trim(coalesce(p_order.dining_option,'')) ~* '^(VIP\s*(ROOM|BOOKING)|FUNCTION\s*ROOM|RESERVATION\s*FEE)(\s|$)'
    or trim(coalesce(p_order.order_type,'')) ~* '^(VIP\s*(ROOM|BOOKING)|FUNCTION\s*ROOM|RESERVATION\s*FEE)(\s|$)'
$$;

-- The ordinary POS award RPC and receipt guard already use this predicate.
-- Cover web receipts too, without changing historical awards or balances.
do $$ declare definition text; anchor text := 'if not found then raise exception ''Web order % was not found.'', p_web_order_id; end if;'; begin
  select pg_get_functiondef('public.award_loyalty_points_for_web_order(uuid,uuid,numeric,numeric)'::regprocedure) into definition;
  if position(anchor in definition)=0 then raise exception 'Review web loyalty RPC before applying room exclusion'; end if;
  if position('booking_order_excludes_loyalty' in definition)=0 then
    execute replace(definition,anchor,anchor || E'\n  if public.booking_order_excludes_loyalty(jsonb_populate_record(null::public.orders,to_jsonb(v_web_order))) then return v_member; end if;');
  end if;
end $$;
create or replace function public.enforce_web_booking_no_loyalty() returns trigger
language plpgsql set search_path=public as $$
begin
  if public.booking_order_excludes_loyalty(jsonb_populate_record(null::public.orders,to_jsonb(new))) then
    if coalesce(new.loyalty_points_awarded,0)>0 then raise exception 'Function room bookings do not earn loyalty points'; end if;
    new.source_metadata:=coalesce(new.source_metadata,'{}'::jsonb)||jsonb_build_object('exclude_loyalty',true);
  end if;
  return new;
end $$;
create trigger enforce_web_booking_no_loyalty before insert or update of loyalty_points_awarded,loyalty_points_awarded_at
on public.web_orders for each row execute function public.enforce_web_booking_no_loyalty();
notify pgrst,'reload schema';
commit;
