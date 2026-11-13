begin;

-- Subtract only the point-eligible value of drinks which also earn stamps.
-- Caller totals already exclude promos, QCID and welcome-voucher lines.
create function public.juja_points_after_stamp_exclusion(
  p_member_id uuid, p_source_type text, p_source_id uuid, p_points numeric
) returns numeric language plpgsql security definer set search_path=public as $$
declare receipt jsonb; items jsonb; purchased_at timestamptz; joined_at timestamptz;
  stamp_net numeric; non_stamp_net numeric;
begin
  select c.joined_at into joined_at from public.juja_stamp_cards c where member_id=p_member_id;
  if joined_at is null then return p_points; end if;
  if p_source_type='order' then
    select to_jsonb(o) into receipt from public.orders o where id=p_source_id;
    purchased_at:=coalesce((receipt->>'paid_at')::timestamptz,(receipt->>'created_at')::timestamptz);
    select jsonb_agg(to_jsonb(i)) into items from public.order_items i where order_id=p_source_id;
  elsif p_source_type='web_order' then
    select to_jsonb(w) into receipt from public.web_orders w where id=p_source_id;
    purchased_at:=(receipt->>'created_at')::timestamptz;
  else raise exception 'Unknown stamp purchase source';
  end if;
  if receipt is null or purchased_at is null or purchased_at<joined_at
    or purchased_at<timestamptz '2026-11-15 00:00:00+08'
    or purchased_at>=timestamptz '2027-01-16 00:00:00+08'
    or lower(coalesce(receipt->>'status','')) not in ('paid','closed','completed','complete','delivered','partial_refund','partially_refunded')
    or coalesce((receipt->>'total')::numeric,0)<=0 then return p_points; end if;
  items:=coalesce(items,receipt->'items','[]'::jsonb);
  with lines as (
    select line, coalesce(line#>'{source_metadata,pos_line_details}',line->'pos_line_details','{}'::jsonb) details,
      coalesce(nullif(line->>'category_name',''),nullif(line->>'category',''),nullif(line->>'categoryName',''),
        (select m.category from public.menu_items m where m.id::text=coalesce(line->>'menu_item_id',line->>'id') limit 1)) category
    from jsonb_array_elements(items) line
  ), valued as (
    select *, coalesce(nullif(line->>'quantity','')::numeric,0) quantity,
      greatest(0,coalesce(nullif(line->>'net_amount','')::numeric,nullif(line->>'line_total','')::numeric,
        coalesce(nullif(line->>'unitPrice','')::numeric,nullif(line->>'unit_price','')::numeric,0)*coalesce(nullif(line->>'quantity','')::numeric,0))) net,
      coalesce(line->'appliedVoucher',line->'applied_voucher',details->'appliedVoucher','{}'::jsonb) voucher
    from lines
  )
  select coalesce(sum(net * floor(quantity)/nullif(quantity,0)) filter(where c.category_name is not null and quantity>=1),0),
    coalesce(sum(net * case when c.category_name is not null and quantity>=1
      then (quantity-floor(quantity))/quantity else 1 end),0) into stamp_net,non_stamp_net
  from valued left join public.juja_stamp_categories c on c.category_name=lower(trim(category))
  where quantity>0 and net>0
    and lower(trim(coalesce(category,''))) not in ('promo','promos','promotion','promotions')
    and lower(coalesce(line->>'status','')) !~ 'refund|void|cancel'
    and coalesce(line->>'refunded_at','')=''
    and coalesce(line->>'voided',line->>'isVoided',line->>'is_voided','false')<>'true'
    and lower(coalesce(line->>'discountBeneficiaryType',line->>'discount_beneficiary_type',details->>'discountBeneficiaryType',''))<>'qcid'
    and coalesce(line->>'discountName',line->>'discount_name',details->>'discountName','') !~* '\mqcid\M|\mqc\s+id\M'
    and coalesce(voucher->>'reward_type','')<>'welcome'
    and coalesce(voucher->>'code','') !~* '^WELCOME'
    and coalesce(voucher->>'reward_text','') !~* 'welcome voucher';
  if stamp_net<=0 then return p_points; end if;
  return round(greatest(least(coalesce(p_points,0),non_stamp_net*0.04),0),2);
end $$;
revoke all on function public.juja_points_after_stamp_exclusion(uuid,text,uuid,numeric) from public,anon,authenticated;

create or replace function public.get_juja_stamp_card(p_member_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare card jsonb;
begin
  if auth.uid() is null or not exists(select 1 from public.loyalty_members where id=p_member_id and user_id=auth.uid()) then
    raise exception 'This loyalty account is not linked to your login.' using errcode='42501';
  end if;
  card:=public.refresh_juja_stamp_card(p_member_id);
  if card is null then return null; end if;
  return card || jsonb_build_object('stamp_categories',(select jsonb_agg(category_name) from public.juja_stamp_categories));
end $$;

-- Keep all existing authorization, booking exclusions and retry handling.
do $$ declare definition text; signature text; anchor text; source text; id_arg text;
begin
  foreach source in array array['order','web_order'] loop
    signature:=case when source='order' then 'public.award_loyalty_points_for_order(uuid,uuid,numeric,numeric)'
      else 'public.award_loyalty_points_for_web_order(uuid,uuid,numeric,numeric)' end;
    id_arg:=case when source='order' then 'p_order_id' else 'p_web_order_id' end;
    anchor:=case when source='order' then '  update public.loyalty_members' else '  if v_points <= 0 then return v_member; end if;' end;
    definition:=pg_get_functiondef(signature::regprocedure);
    if position(anchor in definition)=0 then raise exception 'Review loyalty award function before stamp exclusion: %',signature; end if;
    definition:=replace(definition,anchor,
      format(E'  v_points := public.juja_points_after_stamp_exclusion(p_member_id,%L,%s,v_points);\n',source,id_arg)
      ||case when source='order' then anchor else '-- Record zero-point stamp purchases and their member association.' end);
    execute definition;
  end loop;
end $$;

notify pgrst,'reload schema';
commit;
