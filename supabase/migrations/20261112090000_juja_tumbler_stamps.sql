begin;

create function public.juja_stamp_now() returns timestamptz
language sql volatile set search_path=public as $$ select clock_timestamp() $$;
revoke all on function public.juja_stamp_now() from public, anon, authenticated;

-- Stamp rewards have no expiry; keep the existing expiry requirement for
-- every other voucher type.
alter table public.vouchers alter column expires_at drop not null;
alter table public.vouchers add constraint vouchers_expiry_required
  check (expires_at is not null or reward_type is not distinct from 'juja_tumbler');

-- One opt-in card and one reward per member for the JUJA tumbler campaign.
-- No historical purchases are imported and loyalty points are not consumed.
create table public.juja_stamp_cards (
  member_id uuid primary key references public.loyalty_members(id) on delete cascade,
  joined_at timestamptz not null default public.juja_stamp_now(),
  signature_stamps integer not null default 0 check (signature_stamps between 0 and 5),
  drink_stamps integer not null default 0 check (drink_stamps between 0 and 15),
  voucher_id uuid unique references public.vouchers(id),
  updated_at timestamptz not null default now()
);
alter table public.juja_stamp_cards enable row level security;
revoke all on public.juja_stamp_cards from anon, authenticated;
grant all on public.juja_stamp_cards to service_role;

-- Retain earned stamps even when old receipts move to the sales archive.
create table public.juja_stamp_purchases (
  member_id uuid not null references public.juja_stamp_cards(member_id) on delete cascade,
  source_type text not null check (source_type in ('order','web_order')),
  source_id uuid not null,
  signature_quantity integer not null check (signature_quantity >= 0),
  drink_quantity integer not null check (drink_quantity >= 0),
  primary key(member_id,source_type,source_id)
);
alter table public.juja_stamp_purchases enable row level security;
revoke all on public.juja_stamp_purchases from anon, authenticated;
grant all on public.juja_stamp_purchases to service_role;

-- Snapshot which categories qualify at campaign setup. Food, add-ons, room
-- payments and gift certificates cannot earn drink stamps.
create table public.juja_stamp_categories (
  category_name text primary key,
  stamp_kind text not null check (stamp_kind in ('signature', 'drink'))
);
insert into public.juja_stamp_categories(category_name, stamp_kind)
select distinct lower(trim(name)),
  case when lower(trim(name)) = 'latte (signature)' then 'signature' else 'drink' end
from public.menu_categories
where discount_entitlement_group = 'drink';
alter table public.juja_stamp_categories enable row level security;
revoke all on public.juja_stamp_categories from anon, authenticated;
grant all on public.juja_stamp_categories to service_role;

create function public.refresh_juja_stamp_card(p_member_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  card public.juja_stamp_cards;
  signatures integer;
  drinks integer;
  reward uuid;
begin
  -- Serialize purchases, retries and reward creation on the same card.
  select * into card from public.juja_stamp_cards where member_id = p_member_id for update;
  if not found then return null; end if;

  with purchases as (
    select coalesce(o.source_web_order_id,o.id) id,
      case when o.source_web_order_id is null then 'order' else 'web_order' end source_type,
      lower(coalesce(o.status,'')) in ('paid','closed','completed','complete','delivered','partial_refund','partially_refunded')
        and coalesce(o.total,0) > 0
        and coalesce(o.source_metadata->>'exclude_loyalty','false') <> 'true'
        and not (coalesce(o.source_metadata,'{}'::jsonb) ?| array['booking_id','reservation_fee_booking_id'])
        and coalesce(o.dining_option,'') !~* '^(vip|function room|reservation fee)' eligible,
      coalesce((select jsonb_agg(to_jsonb(i)) from public.order_items i where i.order_id = o.id), o.items, '[]'::jsonb) items
    from public.orders o
    where (o.loyalty_member_id = p_member_id or o.customer_id = p_member_id::text)
      and coalesce(o.paid_at, o.created_at) >= card.joined_at
      and coalesce(o.paid_at, o.created_at) >= timestamptz '2026-11-15 00:00:00+08'
      and coalesce(o.paid_at, o.created_at) < timestamptz '2027-01-16 00:00:00+08'
    union all
    select w.id, 'web_order', lower(coalesce(w.status,'')) in ('paid','closed','completed','complete','delivered')
      and coalesce(w.total,0) > 0
      and coalesce(w.source_metadata->>'exclude_loyalty','false') <> 'true'
      and not (coalesce(w.source_metadata,'{}'::jsonb) ?| array['booking_id','reservation_fee_booking_id']), coalesce(w.items,'[]'::jsonb)
    from public.web_orders w
    where w.loyalty_member_id = p_member_id and w.created_at >= card.joined_at
      and w.created_at >= timestamptz '2026-11-15 00:00:00+08'
      and w.created_at < timestamptz '2027-01-16 00:00:00+08'
      and not exists(select 1 from public.orders o where o.source_web_order_id = w.id)
  ), lines as (
    select purchases.id, purchases.source_type, purchases.eligible, line, coalesce(nullif(line->>'category_name',''), nullif(line->>'category',''), nullif(line->>'categoryName',''),
      (select m.category from public.menu_items m where m.id::text = coalesce(line->>'menu_item_id',line->>'id') limit 1)) category
    from purchases cross join lateral jsonb_array_elements(items) line
  ), eligible as (
    select lines.id, lines.source_type, c.stamp_kind,
      greatest(0, floor(coalesce(nullif(line->>'quantity','')::numeric,0)) -
        ceil(coalesce(nullif(line->>'refund_amount','')::numeric,0) /
          greatest(coalesce(nullif(line->>'unit_price','')::numeric,nullif(line->>'unitPrice','')::numeric,1),0.01))) quantity
    from lines join public.juja_stamp_categories c on c.category_name = lower(trim(category))
    where eligible and lower(coalesce(line->>'status','')) !~ 'refund|void|cancel'
      and coalesce(line->>'refunded_at','') = ''
      and coalesce(line->>'voided',line->>'isVoided',line->>'is_voided','false') <> 'true'
      and coalesce(nullif(line->>'net_amount','')::numeric, nullif(line->>'line_total','')::numeric,
        coalesce(nullif(line->>'unitPrice','')::numeric,nullif(line->>'unit_price','')::numeric,0)
          * coalesce(nullif(line->>'quantity','')::numeric,0)) > 0
  )
  insert into public.juja_stamp_purchases(member_id,source_type,source_id,signature_quantity,drink_quantity)
  select p_member_id,p.source_type,p.id,
    coalesce(sum(e.quantity) filter(where e.stamp_kind='signature'),0)::integer,
    coalesce(sum(e.quantity) filter(where e.stamp_kind='drink'),0)::integer
  from purchases p left join eligible e on e.id=p.id and e.source_type=p.source_type
  group by p.source_type,p.id
  on conflict(member_id,source_type,source_id) do update
    set signature_quantity=excluded.signature_quantity,drink_quantity=excluded.drink_quantity;

  select least(5,coalesce(sum(signature_quantity),0))::integer,
    least(15,coalesce(sum(drink_quantity),0))::integer into signatures,drinks
  from public.juja_stamp_purchases where member_id=p_member_id;

  reward := card.voucher_id;
  if signatures = 5 and drinks = 15 then
    if reward is null then
      insert into public.vouchers(member_id,code,reward_text,reward_type,status,issued_at)
      values(p_member_id,'JUJA-TUMBLER-'||upper(replace(gen_random_uuid()::text,'-','')),
        'FREE JUJA Tumbler — 20 JUJA Stamps','juja_tumbler','active',now()) returning id into reward;
    else
      -- A refund may invalidate a reward; re-qualifying restores that same
      -- unredeemed voucher instead of issuing a second reward.
      update public.vouchers set status='active' where id=reward and status='expired' and redeemed_at is null;
    end if;
  elsif reward is not null then
    update public.vouchers set status='expired' where id=reward and status='active' and redeemed_at is null;
  end if;

  update public.juja_stamp_cards set signature_stamps=signatures, drink_stamps=drinks,
    voucher_id=reward, updated_at=now() where member_id=p_member_id returning * into card;
  return to_jsonb(card) || jsonb_build_object('voucher_status',(select status from public.vouchers where id=reward));
end $$;
revoke all on function public.refresh_juja_stamp_card(uuid) from public, anon, authenticated;

create function public.get_juja_stamp_card(p_member_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not exists(select 1 from public.loyalty_members where id=p_member_id and user_id=auth.uid()) then
    raise exception 'This loyalty account is not linked to your login.' using errcode='42501';
  end if;
  return public.refresh_juja_stamp_card(p_member_id);
end $$;
revoke all on function public.get_juja_stamp_card(uuid) from public, anon;
grant execute on function public.get_juja_stamp_card(uuid) to authenticated;

create function public.join_juja_stamp_card(p_member_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not exists(select 1 from public.loyalty_members where id=p_member_id and user_id=auth.uid()) then
    raise exception 'This loyalty account is not linked to your login.' using errcode='42501';
  end if;
  if public.juja_stamp_now() < timestamptz '2026-11-15 00:00:00+08'
    or public.juja_stamp_now() >= timestamptz '2027-01-16 00:00:00+08' then
    raise exception 'JUJA Stamps runs November 15, 2026 through January 15, 2027 (Asia/Manila).';
  end if;
  insert into public.juja_stamp_cards(member_id) values(p_member_id) on conflict(member_id) do nothing;
  return public.refresh_juja_stamp_card(p_member_id);
end $$;
revoke all on function public.join_juja_stamp_card(uuid) from public, anon;
grant execute on function public.join_juja_stamp_card(uuid) to authenticated;

-- Run at checkout and refund time; earning never depends on opening the portal.
create function public.sync_juja_stamps_from_purchase() returns trigger
language plpgsql security definer set search_path = public as $$
declare member uuid; old_member uuid; order_row public.orders;
begin
  if tg_table_name = 'order_items' then
    select * into order_row from public.orders where id=coalesce(new.order_id,old.order_id);
    select id into member from public.loyalty_members where id=order_row.loyalty_member_id or id::text=order_row.customer_id limit 1;
  else
    select id into member from public.loyalty_members where id=new.loyalty_member_id
      or (tg_table_name='orders' and id::text=to_jsonb(new)->>'customer_id') limit 1;
    if tg_op = 'UPDATE' then
      select id into old_member from public.loyalty_members where id=old.loyalty_member_id
        or (tg_table_name='orders' and id::text=to_jsonb(old)->>'customer_id') limit 1;
    end if;
  end if;
  if old_member is not null and old_member is distinct from member then
    update public.juja_stamp_purchases set signature_quantity=0,drink_quantity=0
    where member_id=old_member and source_id=coalesce((to_jsonb(old)->>'source_web_order_id')::uuid,old.id)
      and source_type=case when tg_table_name='web_orders' or to_jsonb(old)->>'source_web_order_id' is not null then 'web_order' else 'order' end;
    perform public.refresh_juja_stamp_card(old_member);
  end if;
  if member is not null then perform public.refresh_juja_stamp_card(member); end if;
  return null;
end $$;
revoke all on function public.sync_juja_stamps_from_purchase() from public, anon, authenticated;
create trigger juja_stamps_orders after insert or update on public.orders
for each row execute function public.sync_juja_stamps_from_purchase();
create trigger juja_stamps_web_orders after insert or update on public.web_orders
for each row execute function public.sync_juja_stamps_from_purchase();
create trigger juja_stamps_order_items after insert or update or delete on public.order_items
for each row execute function public.sync_juja_stamps_from_purchase();

commit;
