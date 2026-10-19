begin;

create or replace function public.booking_order_excludes_loyalty(p_order public.orders)
returns boolean language sql immutable set search_path=public as $$
  select coalesce(p_order.source_metadata->>'exclude_loyalty','false')='true'
    or nullif(p_order.source_metadata->>'booking_id','') is not null
    or coalesce(p_order.source_metadata->>'transaction_kind','')='booking_reservation_fee'
    or coalesce(p_order.dining_option,'') ~* '^VIP Booking( |$)'
    or coalesce(p_order.order_type,'') ~* '^VIP Booking( |$)'
$$;

-- Old POS sessions also call this RPC: return the unchanged member, never an award.
do $$ declare definition text; anchor text:='if not found then raise exception ''Order was not found for loyalty award.''; end if;'; begin
  select pg_get_functiondef('public.award_loyalty_points_for_order(uuid,uuid,numeric,numeric)'::regprocedure) into definition;
  if position(anchor in definition)=0 then raise exception 'Review loyalty award RPC before applying booking exclusion'; end if;
  execute replace(definition,anchor,anchor||E'\n  if public.booking_order_excludes_loyalty(v_order) then return v_member; end if;');
end $$;

-- Mark all new VIP bills, including clients supplying their own order payload.
create or replace function public.enforce_booking_no_loyalty() returns trigger
language plpgsql set search_path=public as $$
begin
  if public.booking_order_excludes_loyalty(new) then
    if coalesce(new.loyalty_points_awarded,0)>0 then
      raise exception 'VIP booking bills do not earn loyalty points';
    end if;
    new.source_metadata:=coalesce(new.source_metadata,'{}'::jsonb)||jsonb_build_object('exclude_loyalty',true);
  end if;
  return new;
end $$;
create trigger enforce_booking_no_loyalty before insert or update of loyalty_points_awarded,loyalty_points_awarded_at on public.orders
for each row execute function public.enforce_booking_no_loyalty();

notify pgrst,'reload schema';
commit;
