begin;

create function public.juja_stamp_line_quantity(line jsonb) returns integer
language plpgsql immutable set search_path=public as $$
declare details jsonb:=coalesce(line#>'{source_metadata,pos_line_details}',line->'pos_line_details','{}');
  voucher jsonb; qty numeric; net numeric; free_qty numeric; refund_qty numeric; refund_amount numeric;
begin
  voucher:=coalesce(nullif(line->'appliedVoucher','null'),nullif(line->'applied_voucher','null'),nullif(details->'appliedVoucher','null'),'{}');
  if coalesce(voucher->>'id',voucher->>'code',voucher->>'reward_type','')<>''
    or coalesce(line->>'voucher_id',line->>'voucherId',line->>'applied_voucher_id',line->>'redeemed_voucher_id',line->>'redemption_id',line->>'redemptionId',details->>'redemptionId','')<>''
    or lower(coalesce(line->>'isFree',line->>'is_free',line->>'free',line->>'complimentary',details->>'isFree','false'))='true'
    or lower(coalesce(line->>'isRedeemed',line->>'is_redeemed',line->>'redeemed',details->>'isRedeemed','false'))='true'
    or lower(coalesce(line->>'voided',line->>'isVoided',line->>'is_voided','false'))='true'
    or lower(coalesce(line->>'status','')) ~ '^(refunded|void|cancel|redeemed|free)' then return 0; end if;
  qty:=greatest(coalesce(nullif(line->>'quantity','')::numeric,0),0);
  net:=greatest(coalesce(nullif(line->>'net_amount','')::numeric,nullif(line->>'line_total','')::numeric,
    coalesce(nullif(line->>'unitPrice','')::numeric,nullif(line->>'unit_price','')::numeric,0)*qty
      -coalesce(nullif(line->>'discountAmount','')::numeric,nullif(line->>'discount_amount','')::numeric,0)),0);
  if qty<1 or net<=0 then return 0; end if;
  free_qty:=greatest(coalesce(nullif(line->>'free_quantity','')::numeric,nullif(line->>'freeQuantity','')::numeric,
    nullif(details->>'freeQuantity','')::numeric,0),0)
    +greatest(coalesce(nullif(line->>'redeemed_quantity','')::numeric,nullif(line->>'redeemedQuantity','')::numeric,
    nullif(details->>'redeemedQuantity','')::numeric,0),0);
  refund_amount:=greatest(coalesce(nullif(line->>'refund_amount','')::numeric,nullif(line->>'refundAmount','')::numeric,0),0);
  refund_qty:=greatest(coalesce(nullif(line->>'refunded_quantity','')::numeric,nullif(line->>'refundedQuantity','')::numeric,0),
    case when refund_amount>0 then ceil(refund_amount/nullif(net/greatest(qty-free_qty,1),0)) else 0 end);
  if coalesce(line->>'refunded_at','')<>'' and refund_qty=0 then return 0; end if;
  return greatest(floor(qty-free_qty-refund_qty),0)::integer;
end $$;
revoke all on function public.juja_stamp_line_quantity(jsonb) from public,anon,authenticated;

-- A physical receipt retains its first identity even if its display number is edited.
-- POS copies of a web order share the web order identity. Offline retries share
-- their checkout idempotency key; legacy duplicate receipts share store+number.
create table public.juja_stamp_source_keys (
  physical_type text not null,
  physical_id uuid not null,
  source_type text not null,
  source_id uuid not null,
  has_receipt_items boolean not null default false,
  primary key(physical_type,physical_id)
);
alter table public.juja_stamp_source_keys enable row level security;
revoke all on public.juja_stamp_source_keys from anon,authenticated;
grant all on public.juja_stamp_source_keys to service_role;

create function public.juja_stamp_source_key(kind text, receipt jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare result uuid; web_id text; retry_key text; store_key text; number text; previous_type text;
begin
  web_id:=case when kind='web_order' then receipt->>'id' else nullif(receipt->>'source_web_order_id','') end;
  select source_id,source_type into result,previous_type from public.juja_stamp_source_keys where physical_type=kind and physical_id=(receipt->>'id')::uuid;
  if result is not null and web_id is not null and (result<>web_id::uuid or previous_type<>'web_order') then
    update public.juja_stamp_purchases set signature_quantity=0,drink_quantity=0 where source_type=previous_type and source_id=result;
    update public.juja_stamp_source_keys set source_id=web_id::uuid,source_type='web_order' where source_type=previous_type and source_id=result;
    result:=web_id::uuid;
  end if;
  if result is not null then return result; end if;
  store_key:=coalesce(receipt->>'store_id',receipt->>'branch_id','');
  retry_key:=coalesce(nullif(receipt->>'client_idempotency_key',''),nullif(receipt#>>'{source_metadata,offline_idempotency_key}',''),nullif(receipt#>>'{source_metadata,checkout_key}',''));
  number:=nullif(trim(receipt->>'receipt_number'),'');
  result:=case when web_id is not null then web_id::uuid
    when retry_key is not null then md5('juja:checkout:'||store_key||':'||retry_key)::uuid
    when number is not null then md5('juja:receipt:'||store_key||':'||number)::uuid
    else (receipt->>'id')::uuid end;
  insert into public.juja_stamp_source_keys(physical_type,physical_id,source_type,source_id) values(kind,(receipt->>'id')::uuid,
    case when web_id is not null then 'web_order' else 'order' end,result)
    on conflict(physical_type,physical_id) do nothing;
  select source_id into result from public.juja_stamp_source_keys where physical_type=kind and physical_id=(receipt->>'id')::uuid;
  return result;
end $$;
revoke all on function public.juja_stamp_source_key(text,jsonb) from public,anon,authenticated;

do $$ declare definition text; start_at integer; end_at integer;
begin
  definition:=pg_get_functiondef('public.refresh_juja_stamp_card(uuid)'::regprocedure);
  start_at:=position('  with purchases as (' in definition);
  end_at:=position('  select least(5,' in definition);
  if start_at=0 or end_at<=start_at then raise exception 'Review stamp refresh before hardening'; end if;
  definition:=substring(definition from 1 for start_at-1)||$replacement$
  -- Retire legacy physical IDs after establishing the immutable canonical key.
  perform public.juja_stamp_source_key('order',to_jsonb(o)) from public.orders o
    where coalesce(o.loyalty_member_id::text,o.customer_id)=p_member_id::text;
  perform public.juja_stamp_source_key('web_order',to_jsonb(w)) from public.web_orders w where w.loyalty_member_id=p_member_id;
  update public.juja_stamp_source_keys k set has_receipt_items=true where k.physical_type='order' and not k.has_receipt_items
    and exists(select 1 from public.orders o where o.id=k.physical_id and coalesce(o.loyalty_member_id::text,o.customer_id)=p_member_id::text)
    and exists(select 1 from public.order_items i where i.order_id=k.physical_id);
  -- Serialize cross-card duplicate attempts before checking the active owner.
  perform pg_advisory_xact_lock(hashtextextended('juja-stamp:'||keys.source_type||':'||keys.source_id::text,0))
    from (select distinct k.source_type,k.source_id from public.juja_stamp_source_keys k
      join public.orders o on k.physical_type='order' and k.physical_id=o.id
      where coalesce(o.loyalty_member_id::text,o.customer_id)=p_member_id::text
      union select k.source_type,k.source_id from public.juja_stamp_source_keys k
      join public.web_orders w on k.physical_type='web_order' and k.physical_id=w.id where w.loyalty_member_id=p_member_id
      order by source_type,source_id) keys;
  update public.juja_stamp_purchases p set signature_quantity=0,drink_quantity=0
    from public.juja_stamp_source_keys k where p.member_id=p_member_id
      and p.source_type=k.physical_type and p.source_id=k.physical_id and p.source_id<>k.source_id;

  with physical as (
    select k.source_id id,k.source_type,0 priority,o.id physical_id,
      coalesce(o.paid_at,o.created_at) purchased_at,to_jsonb(o) receipt,
      coalesce((select jsonb_agg(to_jsonb(i)) from public.order_items i where i.order_id=o.id),
        case when k.has_receipt_items then '[]'::jsonb else o.items end,'[]'::jsonb) items,
      (select to_jsonb(w) from public.web_orders w where w.id=o.source_web_order_id) web_receipt
    from public.orders o join public.juja_stamp_source_keys k on k.physical_type='order' and k.physical_id=o.id
    where coalesce(o.loyalty_member_id::text,o.customer_id)=p_member_id::text
    union all
    select k.source_id,k.source_type,1,w.id,w.created_at,to_jsonb(w),coalesce(w.items,'[]'::jsonb),null::jsonb
    from public.web_orders w join public.juja_stamp_source_keys k on k.physical_type='web_order' and k.physical_id=w.id
    where w.loyalty_member_id=p_member_id
  ), assessed as (
    select *, purchased_at>=card.joined_at and purchased_at>=timestamptz '2026-11-15 00:00:00+08'
      and purchased_at<timestamptz '2027-01-16 00:00:00+08'
      and lower(coalesce(receipt->>'status','')) in ('paid','closed','completed','complete','delivered','partial_refund','partially_refunded','partial refund')
      and coalesce((receipt->>'total')::numeric,0)>0
      and coalesce(receipt#>>'{source_metadata,exclude_loyalty}','false')<>'true'
      and not(coalesce(receipt->'source_metadata','{}') ?| array['booking_id','reservation_fee_booking_id'])
      and coalesce(receipt->>'dining_option','') !~* '^(vip|function room|reservation fee)'
      and lower(coalesce(receipt->>'payment_method',''))<>'no payment required'
      and coalesce((receipt->>'refund_amount')::numeric,0)<coalesce((receipt->>'net_amount')::numeric,(receipt->>'total')::numeric,0)
      and ((coalesce((receipt->>'refund_amount')::numeric,0)=0 and lower(coalesce(receipt->>'status','')) !~ 'refund')
        or exists(select 1 from jsonb_array_elements(items) refunded_line
          where coalesce((refunded_line->>'refund_amount')::numeric,0)>0
            or coalesce((refunded_line->>'refunded_quantity')::numeric,0)>0
            or coalesce(refunded_line->>'refunded_at','')<>''
            or lower(coalesce(refunded_line->>'status','')) ~ 'refund'))
      and lower(coalesce(web_receipt->>'status','')) !~ 'refund|void|cancel|reject'
      and lower(coalesce(web_receipt->>'payment_status','')) !~ 'refund|void|cancel'
      eligible,
      lower(coalesce(receipt->>'status','')) ~ '^(refunded|void|cancel|reject)'
        or lower(coalesce(receipt->>'payment_status','')) ~ 'refund|void|cancel'
        or (coalesce((receipt->>'refund_amount')::numeric,0)>0
          and coalesce((receipt->>'refund_amount')::numeric,0)>=coalesce((receipt->>'net_amount')::numeric,(receipt->>'total')::numeric,0)) refunded
    from physical
  ), chosen as (
    select distinct on(source_type,id) * from assessed order by source_type,id,priority,purchased_at,physical_id
  ), purchases as (
    select c.*,c.eligible and not exists(select 1 from assessed a where a.source_type=c.source_type and a.id=c.id and a.refunded) can_earn
    from chosen c
  ), raw_lines as (
    select p.id,p.source_type,p.can_earn,line,ordinality,
      coalesce(nullif(line#>>'{source_metadata,pos_cart_item_id}',''),nullif(line->>'cartItemId',''),'row:'||ordinality::text) line_key
    from purchases p cross join lateral jsonb_array_elements(p.items) with ordinality as l(line,ordinality)
  ), lines as (
    select distinct on(source_type,id,line_key) *,coalesce(nullif(line->>'category_name',''),nullif(line->>'category',''),nullif(line->>'categoryName',''),
      (select m.category from public.menu_items m where m.id::text=coalesce(line->>'menu_item_id',line->>'id') limit 1)) category
    from raw_lines order by source_type,id,line_key,public.juja_stamp_line_quantity(line),ordinality
  ), quantities as (
    select l.id,l.source_type,c.stamp_kind,public.juja_stamp_line_quantity(l.line) quantity
    from lines l join public.juja_stamp_categories c on c.category_name=lower(trim(l.category)) where l.can_earn
  ), totals as (
    select p_member_id member_id,p.source_type,p.id,
      coalesce(sum(q.quantity) filter(where q.stamp_kind='signature'),0)::integer signatures,
      coalesce(sum(q.quantity) filter(where q.stamp_kind='drink'),0)::integer drinks
    from purchases p left join quantities q on q.source_type=p.source_type and q.id=p.id group by p.source_type,p.id
  )
  insert into public.juja_stamp_purchases(member_id,source_type,source_id,signature_quantity,drink_quantity)
  select t.member_id,t.source_type,t.id,t.signatures,t.drinks from totals t
    where not exists(select 1 from public.juja_stamp_purchases existing where existing.source_type=t.source_type and existing.source_id=t.id
      and existing.member_id<>p_member_id and (existing.signature_quantity>0 or existing.drink_quantity>0))
  on conflict(member_id,source_type,source_id) do update set signature_quantity=excluded.signature_quantity,drink_quantity=excluded.drink_quantity;

$replacement$||substring(definition from end_at);
  execute definition;
end $$;

-- Physical sale records already have retry constraints. This final guard prevents
-- the same canonical purchase from being active on two different stamp cards.
with ranked as (
  select member_id,source_type,source_id,row_number() over(partition by source_type,source_id order by member_id) n
  from public.juja_stamp_purchases where signature_quantity>0 or drink_quantity>0
)
update public.juja_stamp_purchases p set signature_quantity=0,drink_quantity=0 from ranked r
where r.n>1 and p.member_id=r.member_id and p.source_type=r.source_type and p.source_id=r.source_id;
create unique index juja_stamp_purchase_one_active_owner on public.juja_stamp_purchases(source_type,source_id)
where signature_quantity>0 or drink_quantity>0;

create or replace function public.sync_juja_stamps_from_purchase() returns trigger
language plpgsql security definer set search_path=public as $$
declare current_row jsonb:=to_jsonb(new); previous_row jsonb:=to_jsonb(old);
  parent_row jsonb; affected uuid[]:='{}'; member uuid; old_member uuid; new_member uuid; key_row public.juja_stamp_source_keys;
begin
  if tg_table_name='order_items' then
    for parent_row in select to_jsonb(o) from public.orders o
      where o.id in ((current_row->>'order_id')::uuid,(previous_row->>'order_id')::uuid) loop
      select id into member from public.loyalty_members where id::text=coalesce(parent_row->>'loyalty_member_id',parent_row->>'customer_id');
      if member is not null then affected:=array_append(affected,member); end if;
    end loop;
  else
    select id into new_member from public.loyalty_members where id::text=coalesce(current_row->>'loyalty_member_id',current_row->>'customer_id');
    select id into old_member from public.loyalty_members where id::text=coalesce(previous_row->>'loyalty_member_id',previous_row->>'customer_id');
    affected:=array[new_member,old_member];
    if old_member is not null and old_member is distinct from new_member then
      select * into key_row from public.juja_stamp_source_keys
        where physical_type=case when tg_table_name='orders' then 'order' else 'web_order' end and physical_id=(previous_row->>'id')::uuid;
      update public.juja_stamp_purchases set signature_quantity=0,drink_quantity=0
        where member_id=old_member and source_type=key_row.source_type and source_id=key_row.source_id;
    end if;
    if tg_table_name='web_orders' then
      for member in select distinct m.id from public.orders o join public.loyalty_members m
        on m.id::text=coalesce(o.loyalty_member_id::text,o.customer_id)
        where o.source_web_order_id=(current_row->>'id')::uuid loop
        affected:=array_append(affected,member);
      end loop;
    end if;
  end if;
  for member in select distinct id from unnest(affected) id where id is not null order by id loop
    perform public.refresh_juja_stamp_card(member);
  end loop;
  return null;
end $$;

-- Use the same eligible quantity for the point exclusion: free/redeemed units
-- cannot suppress points on unrelated paid items.
do $$ declare definition text;
begin
  definition:=pg_get_functiondef('public.juja_points_after_stamp_exclusion(uuid,text,uuid,numeric)'::regprocedure);
  definition:=replace(definition,'floor(quantity)','public.juja_stamp_line_quantity(line)');
  execute definition;
end $$;

do $$ declare member uuid;
begin
  for member in select member_id from public.juja_stamp_cards order by member_id loop
    perform public.refresh_juja_stamp_card(member);
  end loop;
end $$;
notify pgrst,'reload schema';
commit;
