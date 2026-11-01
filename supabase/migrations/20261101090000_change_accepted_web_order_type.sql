begin;

create or replace function public.change_pos_web_order_type(
  p_order_id uuid, p_store_id text, p_order_type text, p_expected_updated_at timestamptz,
  p_delivery_address text default null
) returns public.web_orders
language plpgsql security definer set search_path=public as $$
declare actor public.profiles; current_order public.web_orders; next_type text; previous_type text;
begin
  select * into actor from public.profiles where id=auth.uid();
  if actor.id is null or lower(coalesce(actor.role,'')) not in ('cashier','admin','super_admin') then
    raise exception 'Staff login required';
  end if;
  if nullif(p_store_id,'') is null or (lower(actor.role)='cashier' and actor.store_id::text is distinct from p_store_id) then
    raise exception 'Wrong POS branch';
  end if;
  next_type := upper(trim(coalesce(p_order_type,'')));
  if next_type not in ('DINE-IN','TAKEOUT','DELIVERY') then raise exception 'Choose Dine-in, Takeout, or Delivery'; end if;
  select * into current_order from public.web_orders where id=p_order_id for update;
  if current_order.id is null or coalesce(current_order.store_id::text,current_order.branch_id) is distinct from p_store_id then
    raise exception 'Web order not found in this branch';
  end if;
  if nullif(trim(current_order.receipt_number),'') is not null
    or lower(current_order.status) not in ('accepted','preparing','ready','scheduled')
    or lower(coalesce(current_order.order_status,'')) in ('paid','completed','delivered','cancelled','canceled','rejected','refunded','voided')
    or (lower(current_order.status)='scheduled' and current_order.accepted_at is null) then raise exception 'Only accepted, uncharged web orders can change order type'; end if;
  if p_expected_updated_at is null or current_order.updated_at is distinct from p_expected_updated_at then
    raise exception 'This order changed on another device. Refresh and try again';
  end if;
  previous_type := upper(coalesce(current_order.fulfillment_type,current_order.dining_option,''));
  if next_type='DELIVERY' and nullif(trim(coalesce(p_delivery_address,current_order.delivery_address,'')),'') is null then
    raise exception 'Enter a delivery address';
  end if;
  if current_order.delivery_order_id is not null and lower(coalesce(current_order.delivery_status,'')) not in ('cancelled','canceled','failed')
    and replace(previous_type,'ONLINE: ','') is distinct from next_type then
    raise exception 'Resolve the existing courier delivery before changing order type';
  end if;
  if replace(replace(previous_type,'ONLINE: ',''),'DINEIN','DINE-IN') = next_type
    and (next_type<>'DELIVERY' or trim(coalesce(p_delivery_address,current_order.delivery_address,''))=coalesce(current_order.delivery_address,'')) then return current_order; end if;
  update public.web_orders set dining_option=next_type, fulfillment_type=next_type,
    delivery_address=case when next_type='DELIVERY' then trim(coalesce(p_delivery_address,delivery_address)) else delivery_address end,
    source_metadata=coalesce(source_metadata,'{}'::jsonb) || jsonb_build_object('order_type_changes',
      coalesce(source_metadata->'order_type_changes','[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'from',previous_type,'to',next_type,'actor_id',actor.id,'changed_at',now())))
    where id=p_order_id returning * into current_order;
  -- Change routing labels only. Never upsert a card or touch its items/status.
  update public.kds_tickets set dining_option='ONLINE: '||next_type, fulfillment_type=next_type
    where store_id::text=p_store_id and source_type='web'
      and (source_id=p_order_id::text or starts_with(source_id,p_order_id::text||':batch:'));
  return current_order;
end $$;

revoke all on function public.change_pos_web_order_type(uuid,text,text,timestamptz,text) from public,anon;
grant execute on function public.change_pos_web_order_type(uuid,text,text,timestamptz,text) to authenticated;
notify pgrst,'reload schema';
commit;
