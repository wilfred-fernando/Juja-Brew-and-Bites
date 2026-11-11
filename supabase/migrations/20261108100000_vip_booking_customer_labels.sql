begin;

create function public.pos_vip_booking_customer(p_label text) returns text
language sql stable security definer set search_path=public as $$
 select b.customer_name from public.function_room_bookings b
 where coalesce(p_label,'') ~* '^VIP Booking([[:space:]]|$)'
   and b.id::text=lower(substring(p_label from '(?i)[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}'));
$$;
revoke all on function public.pos_vip_booking_customer(text) from public,anon,authenticated;

-- Resolve historical audit labels without exposing past bookings in the selector.
create function public.resolve_pos_booking_labels(p_store_id text,p_labels text[]) returns jsonb
language plpgsql security definer set search_path=public as $$
begin
 perform public.booking_pos_actor(p_store_id);
 if coalesce(cardinality(p_labels),0)>200 then raise exception 'Too many booking labels'; end if;
 return coalesce((select jsonb_object_agg(label,b.customer_name)
   from (select distinct unnest(p_labels) label) labels
   join public.function_room_bookings b on b.id::text=lower(substring(label from '(?i)[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}'))
   left join public.booking_reservation_vouchers v on v.booking_id=b.id
   where label ~* '^VIP Booking([[:space:]]|$)' and (v.store_id is null or v.store_id=p_store_id)), '{}'::jsonb);
end; $$;
revoke all on function public.resolve_pos_booking_labels(text,text[]) from public,anon;
grant execute on function public.resolve_pos_booking_labels(text,text[]) to authenticated;

create function public.set_pos_vip_booking_customer_label() returns trigger
language plpgsql security definer set search_path=public as $$
declare customer text;
begin
 if tg_table_name='open_tickets' then
   customer:=public.pos_vip_booking_customer(new.order_type);
   if nullif(trim(customer),'') is not null then new.ticket_name:='VIP Booking · '||customer; end if;
 else
   if coalesce(new.dining_option,'') ~* '^VIP Booking([[:space:]]|$)' then
     select b.customer_name into customer from public.orders o join public.function_room_bookings b
       on b.id::text=o.source_metadata->>'booking_id'
     where o.id=new.order_id and coalesce(new.dining_option,'') ~* '^VIP Booking([[:space:]]|$)';
   end if;
   customer:=coalesce(customer,public.pos_vip_booking_customer(new.dining_option),public.pos_vip_booking_customer(new.fulfillment_type));
   if customer is null and coalesce(new.dining_option,'') ~* '^VIP Booking([[:space:]]|$)' then
     select public.pos_vip_booking_customer(t.order_type) into customer from public.open_tickets t
       where t.id::text=split_part(new.source_id,':batch:',1);
   end if;
   if nullif(trim(customer),'') is not null then
     new.dining_option:='VIP Booking · '||customer;
     new.customer_name:=customer;
   end if;
 end if;
 return new;
end; $$;
revoke all on function public.set_pos_vip_booking_customer_label() from public,anon,authenticated;
create trigger set_pos_vip_booking_customer_label before insert or update on public.open_tickets
for each row execute function public.set_pos_vip_booking_customer_label();
create trigger set_pos_vip_booking_customer_label before insert or update on public.kds_tickets
for each row execute function public.set_pos_vip_booking_customer_label();

-- Presentation only. Do not recreate KDS cards or change source IDs/items/status.
update public.open_tickets set ticket_name='VIP Booking · '||public.pos_vip_booking_customer(order_type)
where public.pos_vip_booking_customer(order_type) is not null
  and ticket_name is distinct from 'VIP Booking · '||public.pos_vip_booking_customer(order_type);
update public.kds_tickets set dining_option=dining_option
where coalesce(dining_option,'') ~* '^VIP Booking([[:space:]]|$)';

notify pgrst,'reload schema';
commit;
