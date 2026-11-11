begin;

create table public.pos_charged_dining_changes (
 request_id uuid primary key, order_id uuid not null references public.orders(id),
 actor_id uuid not null references public.profiles(id), store_id text not null,
 option_id uuid not null, reference text not null default '', reason text not null,
 previous_dining text, next_dining text not null, cup_movements jsonb not null default '[]',
 created_at timestamptz not null default now()
);
alter table public.pos_charged_dining_changes enable row level security;
revoke all on public.pos_charged_dining_changes from public,anon,authenticated;
grant all on public.pos_charged_dining_changes to service_role;

-- Resolve cups with the same category/variant recipes, item masters, multipliers
-- and unit conversion used by the normal POS inventory deduction.
create function public.pos_order_cup_plan(p_order_id uuid)
returns table(inventory_item_id uuid,common_name_id uuid,unit text,quantity numeric)
language plpgsql security definer set search_path=public as $$
declare line jsonb; menu public.menu_items; recipe public.menu_item_ingredients;
 item public.inventory_items; cups uuid[]; size text; variant text; has_variant boolean; qty numeric;
begin
 select array_agg(c.id) into cups from public.common_inventory_names c
 where c.common_name in ('Slim Cup - 16oz','Slim Cup - 22oz','Pet Cup - 16oz','Pet Cup - 20oz','Hot Cup 12oz');
 for line in select value from public.orders o cross join lateral jsonb_array_elements(o.items) where o.id=p_order_id loop
   select * into menu from public.menu_items m where m.id::text=coalesce(line->>'menu_item_id',line->>'menuItemId',line->>'id');
   size:=public.inventory_drink_cup_size(line||jsonb_build_object('variant_name',coalesce(line->>'variant_name',line->>'variantName',line->>'variantDetails',line->>'variant_details',line->>'variant','')));
   variant:=nullif(coalesce(line->>'variant_key',line->>'variantKey'),'');
   select exists(select 1 from public.menu_item_ingredients r where r.menu_item_id=menu.id::text and r.variant_key=variant and r.is_active is not false) into has_variant;
   qty:=coalesce(nullif(coalesce(line->>'quantity',line->>'qty'),'' )::numeric,1);
   if qty<=0 or coalesce((line->>'voided')::boolean,false) then continue; end if;
   for recipe in select r.* from public.menu_item_ingredients r where r.is_active is not false
     and (r.common_name_id=any(cups) or exists(select 1 from inventory_items i where i.id=r.inventory_item_id and i.common_name_id=any(cups)))
     and ((r.menu_item_id='category:'||menu.category and r.variant_key=size)
       or (r.menu_item_id=menu.id::text and ((has_variant and r.variant_key=variant) or (not has_variant and coalesce(r.variant_key,'')=''))
         and not exists(select 1 from menu_item_ingredients c where c.menu_item_id='category:'||menu.category)))
   loop
     item:=null;
     if recipe.inventory_item_id is not null then select * into item from inventory_items i where i.id=recipe.inventory_item_id and i.is_active is not false; end if;
     if item.id is null then
       select i.* into item from inventory_items i where i.common_name_id=recipe.common_name_id and i.is_active is not false
       order by exists(select 1 from inventory_transactions t where t.inventory_item_id=i.id and t.reference_type='pos_order' and t.reference_id=p_order_id::text) desc,
         i.current_stock desc nulls last,i.updated_at desc nulls last limit 1;
     end if;
     if item.id is null then raise exception 'A cup recipe has no active inventory item. Configure cup inventory before changing dining option'; end if;
     return query select item.id,coalesce(recipe.common_name_id,item.common_name_id),item.unit,
       public.inventory_convert_quantity_for_item(item.id,recipe.quantity_required*qty*coalesce(recipe.deduction_multiplier,1),recipe.unit,item.unit);
   end loop;
 end loop;
end $$;
revoke all on function public.pos_order_cup_plan(uuid) from public,anon,authenticated;

create function public.change_pos_charged_dining_option(p_request_id uuid,p_order_id uuid,p_option_id uuid,
 p_reference text,p_reason text,p_expected_updated_at timestamptz) returns jsonb
language plpgsql security definer set search_path=public as $$
declare actor public.profiles; sale public.orders; option public.pos_dining_options; prior public.pos_charged_dining_changes;
 label text; old_disposable boolean; new_disposable boolean; delta record; movements jsonb:='[]';
 cups uuid[]; parent_id text; linked_web public.web_orders; web_type text;
begin
 select * into actor from profiles where id=auth.uid();
 if actor.id is null or lower(coalesce(actor.role,'')) not in ('cashier','admin','super_admin') then raise exception 'POS staff access required'; end if;
 if p_request_id is null or length(trim(coalesce(p_reason,'')))<5 or length(p_reason)>500 then raise exception 'Enter a reason of 5 to 500 characters'; end if;
 if length(coalesce(p_reference,''))>80 or coalesce(p_reference,'') ~ '[[:cntrl:]]' then raise exception 'Invalid dining reference'; end if;
 perform pg_advisory_xact_lock(hashtextextended('charged-dining:'||p_request_id::text,0));
 -- Share the normal inventory lock so a delayed initial deduction/refund cannot race this correction.
 perform pg_advisory_xact_lock(hashtext('inventory-pos-order-'||p_order_id::text));
 select * into sale from orders where id=p_order_id for update;
 if sale.id is null or (lower(actor.role)='cashier' and actor.store_id::text is distinct from sale.store_id) then raise exception 'Receipt is not available in your branch'; end if;
 select * into prior from pos_charged_dining_changes where request_id=p_request_id;
 if prior.request_id is not null then
   if prior.actor_id<>actor.id or prior.order_id<>sale.id or prior.option_id<>p_option_id or prior.reference<>trim(coalesce(p_reference,'')) or prior.reason<>trim(p_reason) then raise exception 'Correction request is already used'; end if;
   return jsonb_build_object('order',to_jsonb(sale),'replayed',true);
 end if;
 if coalesce(lower(sale.status),'') not in ('paid','completed') or sale.refunded_at is not null or sale.voided_at is not null or coalesce(sale.refund_amount,0)>0 then raise exception 'Only fully paid, unrefunded receipts can change dining option'; end if;
 if p_expected_updated_at is null or sale.updated_at is distinct from p_expected_updated_at then raise exception 'Receipt changed. Reopen the dining editor and try again'; end if;
 if sale.source_metadata ? 'booking_id' or sale.source_metadata ? 'reservation_credit'
   or coalesce(sale.dining_option,'') ~* '^VIP Booking' or coalesce(sale.order_type,'') ~* '^VIP Booking'
   or exists(select 1 from booking_pos_settlements where order_id=sale.id) then raise exception 'VIP booking receipts require a booking-assignment correction to protect reservation credit'; end if;
 select * into option from pos_dining_options where id=p_option_id and store_id::text=sale.store_id and is_active is true;
 if option.id is null or option.name ~* '^VIP Booking' then raise exception 'Select an active dining option in this branch. Booking credits cannot be assigned here'; end if;
 if option.name ~* '(grab|shopee|panda)' and trim(coalesce(p_reference,''))='' then raise exception 'Enter the marketplace order reference'; end if;
 if option.name !~* '(grab|shopee|panda|vip room)' and trim(coalesce(p_reference,''))<>'' then raise exception 'This dining option does not use an order reference'; end if;
 label:=option.name||case when trim(coalesce(p_reference,''))<>'' then ' '||trim(p_reference) else '' end;
 old_disposable:=public.inventory_uses_disposable_cups(sale.dining_option,sale.order_type);
 new_disposable:=public.inventory_uses_disposable_cups(label,label);
 if old_disposable is distinct from new_disposable and not coalesce(sale.inventory_deducted,false) then raise exception 'Inventory sync is pending for this receipt. Refresh and retry after inventory is processed'; end if;
 if exists(select 1 from inventory_transactions where reference_type='pos_order_return' and reference_id=sale.id::text) then raise exception 'Receipt inventory has already been restored. Review the refund first'; end if;
 if sale.source_web_order_id is not null then
   select * into linked_web from web_orders where id=sale.source_web_order_id for update;
   web_type:=case when label ~* '(vip|table|dine[ -]*in)' then 'DINE-IN' when label ~* 'delivery' then 'DELIVERY' else 'TAKEOUT' end;
   if web_type='DELIVERY' and nullif(trim(linked_web.delivery_address),'') is null then raise exception 'The web order needs a delivery address before switching to Delivery'; end if;
   if linked_web.delivery_order_id is not null and lower(coalesce(linked_web.delivery_status,'')) not in ('cancelled','canceled','failed')
     and replace(replace(upper(coalesce(linked_web.fulfillment_type,'')),'ONLINE: ',''),'DINEIN','DINE-IN')<>web_type then raise exception 'Resolve the existing courier delivery before changing dining option'; end if;
 end if;
 if old_disposable is distinct from new_disposable then
   select array_agg(id) into cups from common_inventory_names where common_name in ('Slim Cup - 16oz','Slim Cup - 22oz','Pet Cup - 16oz','Pet Cup - 20oz','Hot Cup 12oz');
   for delta in
     with desired as (select p.inventory_item_id,p.common_name_id,p.unit,sum(p.quantity) quantity
       from public.pos_order_cup_plan(sale.id) p where new_disposable group by 1,2,3),
     actual as (select t.inventory_item_id,coalesce(t.common_name_id,i.common_name_id) common_name_id,i.unit,sum(t.quantity_effect) effect
       from inventory_transactions t join inventory_items i on i.id=t.inventory_item_id
       where t.reference_type='pos_order' and t.reference_id=sale.id::text and t.transaction_type in ('pos_deduction','correction')
         and coalesce(t.common_name_id,i.common_name_id)=any(cups) group by 1,2,3)
     select coalesce(w.inventory_item_id,a.inventory_item_id) item_id,coalesce(w.common_name_id,a.common_name_id) common_id,
       coalesce(w.unit,a.unit) item_unit,-coalesce(w.quantity,0)-coalesce(a.effect,0) effect
     from desired w full join actual a on a.inventory_item_id=w.inventory_item_id
     order by 1
   loop
     if delta.effect=0 then continue; end if;
     perform public.add_inventory_transaction(delta.item_id,delta.common_id,'correction',abs(delta.effect),delta.item_unit,delta.effect,
       'pos_order',sale.id::text,'Cup reconciliation: '||coalesce(sale.dining_option,'')||' -> '||label||' ('||p_request_id||')',actor.id);
     movements:=movements||jsonb_build_array(jsonb_build_object('inventory_item_id',delta.item_id,'quantity_effect',delta.effect,'unit',delta.item_unit));
   end loop;
 end if;
 parent_id:=coalesce(sale.source_metadata->>'open_ticket_id',sale.source_metadata->>'saved_ticket_id');
 insert into pos_charged_dining_changes(request_id,order_id,actor_id,store_id,option_id,reference,reason,previous_dining,next_dining,cup_movements)
 values(p_request_id,sale.id,actor.id,sale.store_id,p_option_id,trim(coalesce(p_reference,'')),trim(p_reason),sale.dining_option,label,movements);
 update orders set dining_option=label,order_type=label where id=sale.id returning * into sale;
 if linked_web.id is not null then update web_orders set dining_option=web_type,fulfillment_type=web_type where id=linked_web.id; end if;
 -- Relabel existing parent/batch cards only; never upsert or touch preparation progress.
 update kds_tickets set dining_option=label,fulfillment_type=label where store_id::text=sale.store_id and
   ((source_type='pos' and (order_id=sale.id or source_id=sale.id::text or starts_with(source_id,sale.id::text||':batch:')
     or (parent_id is not null and (source_id=parent_id or starts_with(source_id,parent_id||':batch:')))))
   or (source_type='web' and sale.source_web_order_id is not null and (web_order_id=sale.source_web_order_id
     or source_id=sale.source_web_order_id::text or starts_with(source_id,sale.source_web_order_id::text||':batch:'))));
 return jsonb_build_object('order',to_jsonb(sale),'cup_movements',movements,'replayed',false);
end $$;
revoke all on function public.change_pos_charged_dining_option(uuid,uuid,uuid,text,text,timestamptz) from public,anon;
grant execute on function public.change_pos_charged_dining_option(uuid,uuid,uuid,text,text,timestamptz) to authenticated;

-- Refund only the outstanding net consumption after cup corrections. Returning
-- every original deduction would over-credit cups already returned by a change.
create or replace function public.restore_inventory_for_void_order(p_order_id text,p_created_by uuid default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare tx record; restored integer:=0;
begin
 if not public.inventory_is_staff() then raise exception 'Inventory restore requires staff access'; end if;
 perform pg_advisory_xact_lock(hashtext('inventory-pos-order-'||coalesce(p_order_id,'')));
 if exists(select 1 from inventory_transactions where reference_type='pos_order_return' and reference_id=p_order_id and transaction_type='return') then
   return jsonb_build_object('ok',true,'duplicate',true,'restored',0); end if;
 for tx in select inventory_item_id,common_name_id,unit,-sum(quantity_effect) remaining
   from inventory_transactions where reference_type='pos_order' and reference_id=p_order_id and transaction_type in ('pos_deduction','correction')
   group by 1,2,3 having sum(quantity_effect)<0 order by inventory_item_id
 loop
   perform public.add_inventory_transaction(tx.inventory_item_id,tx.common_name_id,'return',tx.remaining,tx.unit,tx.remaining,
     'pos_order_return',p_order_id,'Inventory restored from void/refund',p_created_by);
   restored:=restored+1;
 end loop;
 update orders set inventory_deducted=false,inventory_deducted_at=null where id::text=p_order_id;
 return jsonb_build_object('ok',true,'restored',restored);
end $$;
notify pgrst,'reload schema';
commit;
