-- One service-only transaction corrects the sale, its loyalty contribution and
-- closed-shift snapshots. Archived receipts use durable report overrides.
alter table public.orders add column if not exists customer_code text;
alter table public.orders add column if not exists customer_phone text;
alter table public.web_orders add column if not exists customer_code text;
alter table public.web_orders add column if not exists customer_phone text;
alter table public.web_orders add column if not exists gross_amount numeric;
alter table public.web_orders add column if not exists discount_amount numeric;
alter table public.web_orders add column if not exists net_amount numeric;

create table public.admin_receipt_corrections (
  source_type text not null check (source_type in ('order','web_order')),
  source_id uuid not null,
  revision integer not null,
  receipt_at timestamptz not null,
  store_id text,
  receipt jsonb not null,
  items jsonb not null default '[]',
  linked_web_receipt jsonb,
  updated_at timestamptz not null default now(),
  primary key (source_type,source_id)
);
create index admin_receipt_corrections_date_idx on public.admin_receipt_corrections(receipt_at);
create table public.admin_receipt_shift_corrections (
  shift_id text primary key,
  shift jsonb not null,
  updated_at timestamptz not null default now()
);
create table public.admin_receipt_edit_audit (
  request_id uuid primary key,
  source_type text not null,
  source_id uuid not null,
  actor_id uuid not null references public.profiles(id),
  reason text not null,
  before_state jsonb not null,
  after_state jsonb not null,
  loyalty_changes jsonb not null default '[]',
  voucher_changes jsonb not null default '[]',
  shift_changes jsonb not null default '[]',
  created_at timestamptz not null default now()
);
create index admin_receipt_edit_audit_receipt_idx on public.admin_receipt_edit_audit(source_type,source_id,created_at desc);
alter table public.admin_receipt_corrections enable row level security;
alter table public.admin_receipt_shift_corrections enable row level security;
alter table public.admin_receipt_edit_audit enable row level security;
revoke all on public.admin_receipt_corrections, public.admin_receipt_shift_corrections, public.admin_receipt_edit_audit from anon, authenticated;
grant all on public.admin_receipt_corrections, public.admin_receipt_shift_corrections, public.admin_receipt_edit_audit to service_role;

-- Existing snapshots stay immutable outside the audited service-only RPC.
create or replace function public.preserve_receipt_points_balance()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_setting('app.admin_receipt_correction', true) = 'on' then return new; end if;
  if TG_OP = 'UPDATE' and old.receipt_points_balance is not null then
    new.receipt_points_balance := old.receipt_points_balance;
    return new;
  end if;
  if TG_TABLE_NAME = 'orders' then
    select e.available_points_after into new.receipt_points_balance
    from public.loyalty_point_award_events e
    where e.available_points_after is not null
      and ((e.source_type = 'order' and e.source_id = new.id)
        or (e.source_type = 'web_order' and e.source_id = new.source_web_order_id))
    order by (e.source_type = 'order') desc, e.id asc limit 1;
  else
    select e.available_points_after into new.receipt_points_balance
    from public.loyalty_point_award_events e
    where e.available_points_after is not null
      and ((e.source_type = 'web_order' and e.source_id = new.id)
        or (e.source_type = 'order' and exists (
          select 1 from public.orders o where o.id = e.source_id and o.source_web_order_id = new.id)))
    order by (e.source_type = 'web_order') desc, e.id asc limit 1;
  end if;
  return new;
end;
$$;

create or replace function public.prevent_charged_web_order_reopen()
returns trigger language plpgsql set search_path = public as $$
declare v_old_closed boolean; v_new_active boolean;
begin
  v_old_closed := nullif(btrim(coalesce(old.receipt_number,'')),'') is not null
    or lower(coalesce(old.status,'')) in ('completed','delivered','paid','cancelled','canceled','rejected','refunded','voided')
    or lower(coalesce(old.order_status,'')) in ('completed','delivered','paid','cancelled','canceled','rejected','refunded','voided');
  v_new_active := lower(coalesce(new.status,'')) in ('pending','scheduled','accepted','preparing','ready')
    or lower(coalesce(new.order_status,'')) in ('pending','scheduled','accepted','preparing','ready');
  if v_old_closed and v_new_active then
    raise exception 'A charged or closed web order cannot return to an active status.' using errcode='check_violation';
  end if;
  if v_old_closed and current_setting('app.admin_receipt_correction',true) is distinct from 'on'
    and (new.items is distinct from old.items or new.subtotal is distinct from old.subtotal
      or new.total is distinct from old.total or new.dining_option is distinct from old.dining_option
      or new.fulfillment_type is distinct from old.fulfillment_type) then
    raise exception 'Items and totals cannot be changed after a web order is charged or closed.' using errcode='check_violation';
  end if;
  return new;
end;
$$;

create or replace function public.admin_receipt_edit_context(p_source text, p_id uuid, p_archive jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_receipt jsonb; v_items jsonb; v_linked jsonb; v_saved public.admin_receipt_corrections%rowtype;
  v_live boolean := false; v_version text; v_linked_id uuid;
begin
  if p_source not in ('order','web_order') then raise exception 'Invalid receipt source.'; end if;
  select * into v_saved from public.admin_receipt_corrections where source_type=p_source and source_id=p_id;
  if p_source='order' then
    select to_jsonb(o) into v_receipt from public.orders o where id=p_id;
    v_live := found;
    if v_live then
      select coalesce(jsonb_agg(to_jsonb(i) order by i.id),'[]') into v_items from public.order_items i where order_id=p_id;
    end if;
  else
    select to_jsonb(w) into v_receipt from public.web_orders w where id=p_id;
    v_live := found;
    if exists(select 1 from public.orders where source_web_order_id=p_id) then
      raise exception 'Edit the linked POS receipt instead of its web-order copy.';
    end if;
  end if;
  if not v_live then
    v_receipt := coalesce(v_saved.receipt,p_archive->'receipt');
    v_items := coalesce(v_saved.items,p_archive->'items','[]');
    if (p_archive->'receipt'->>'updated_at')::timestamptz>(v_saved.receipt->>'updated_at')::timestamptz then
      v_receipt:=p_archive->'receipt'; v_items:=coalesce(p_archive->'items','[]');
    end if;
  end if;
  if v_receipt is null or v_receipt->>'id' is distinct from p_id::text then raise exception 'Receipt was not found.'; end if;
  if p_source='web_order' then v_items := coalesce(v_receipt->'items','[]'); end if;
  v_linked_id := nullif(v_receipt->>'source_web_order_id','')::uuid;
  if v_linked_id is not null then
    select to_jsonb(w) into v_linked from public.web_orders w where id=v_linked_id;
    v_linked := coalesce(v_linked,v_saved.linked_web_receipt,p_archive->'linkedWebReceipt');
  end if;
  v_version := md5(jsonb_build_object('receipt',v_receipt,'items',v_items,'linked',v_linked,'revision',coalesce(v_saved.revision,0))::text);
  return jsonb_build_object('receipt',v_receipt,'items',v_items,'linkedWebReceipt',v_linked,
    'version',v_version,'revision',coalesce(v_saved.revision,0),'live',v_live);
end;
$$;

create or replace function public.admin_receipt_visit_time(p_value text)
returns timestamptz language plpgsql stable set search_path=public as $$
begin return nullif(p_value,'')::timestamptz;
exception when others then return null;
end;
$$;

-- Increment summary buckets without replacing cash counts, refunds, deposits,
-- gift certificate sales, or other receipts in a closed shift.
create or replace function public.admin_receipt_shift_delta(p_summary jsonb, p_before jsonb, p_after jsonb)
returns jsonb language plpgsql set search_path=public as $$
declare
  v_result jsonb := coalesce(p_summary,'{}'); v_payments jsonb := coalesce(p_summary->'payments','{}');
  v_counts jsonb := coalesce(p_summary->'paymentTransactions',p_summary->'payment_transactions','{}');
  v_bucket text; v_entry jsonb; v_key text; v_count_key text; v_sign integer; v_cash_delta numeric := 0;
  v_amount numeric; v_names text[]; v_breakdown jsonb := coalesce(p_summary->'discountBreakdown',p_summary->'discount_breakdown','[]');
begin
  if jsonb_array_length(v_breakdown)=0 and coalesce((p_summary->>'discounts')::numeric,0)>0 then
    v_breakdown:=coalesce(p_before->'discountBreakdown','[]');
    if (p_summary->>'discounts')::numeric>(p_before->>'discount')::numeric then
      v_breakdown:=v_breakdown||jsonb_build_array(jsonb_build_object('label','Other / Unspecified','amount',(p_summary->>'discounts')::numeric-(p_before->>'discount')::numeric));
    end if;
  end if;
  for v_sign in -1..1 by 2 loop
    for v_entry in select * from jsonb_array_elements(case when v_sign=-1 then p_before->'payments' else p_after->'payments' end) loop
      v_bucket := case lower(v_entry->>'method') when 'gcash' then 'Gcash' when 'foodpanda' then 'Panda' else v_entry->>'method' end;
      select key into v_key from jsonb_object_keys(v_payments) as key
        where lower(regexp_replace(key,'[ _-]','','g'))=lower(regexp_replace(v_bucket,'[ _-]','','g')) limit 1;
      v_key := coalesce(v_key,v_bucket);
      v_amount := (v_entry->>'amount')::numeric*v_sign;
      v_payments := jsonb_set(v_payments,array[v_key],to_jsonb(round(coalesce((v_payments->>v_key)::numeric,0)+v_amount,2)));
      select key into v_count_key from jsonb_object_keys(v_counts) as key
        where lower(regexp_replace(key,'[ _-]','','g'))=lower(regexp_replace(v_bucket,'[ _-]','','g')) limit 1;
      v_count_key:=coalesce(v_count_key,v_key);
      v_counts := jsonb_set(v_counts,array[v_count_key],to_jsonb(greatest(0,coalesce((v_counts->>v_count_key)::integer,case when v_sign=-1 then 1 else 0 end)+v_sign)));
      if lower(v_bucket)='cash' then v_cash_delta:=v_cash_delta+v_amount; end if;
    end loop;
    for v_entry in select * from jsonb_array_elements(case when v_sign=-1 then p_before->'discountBreakdown' else p_after->'discountBreakdown' end) loop
      v_bucket := v_entry->>'label'; v_amount := (v_entry->>'amount')::numeric*v_sign;
      if not exists(select 1 from jsonb_array_elements(v_breakdown) e where e->>'label'=v_bucket) then
        v_breakdown:=v_breakdown||jsonb_build_array(jsonb_build_object('label',v_bucket,'amount',0));
      end if;
      select jsonb_agg(case when e->>'label'=v_bucket then e||jsonb_build_object('amount',round(coalesce((e->>'amount')::numeric,0)+v_amount,2)) else e end)
      into v_breakdown from jsonb_array_elements(v_breakdown) e;
    end loop;
  end loop;
  select coalesce(jsonb_agg(e),'[]') into v_breakdown from jsonb_array_elements(v_breakdown) e where (e->>'amount')::numeric<>0;
  v_result := v_result||jsonb_build_object('payments',v_payments,'paymentTransactions',v_counts,'discountBreakdown',v_breakdown,
    'netSales',round(coalesce((v_result->>'netSales')::numeric,0)+(p_after->>'net')::numeric-(p_before->>'net')::numeric,2),
    'discounts',round(coalesce((v_result->>'discounts')::numeric,0)+(p_after->>'discount')::numeric-(p_before->>'discount')::numeric,2),
    'cashPayments',round(coalesce((v_result->>'cashPayments')::numeric,0)+v_cash_delta,2),
    'expectedCash',round(coalesce((v_result->>'expectedCash')::numeric,0)+v_cash_delta,2));
  return v_result;
end;
$$;

create or replace function public.correct_admin_receipt(
  p_source text,p_id uuid,p_archive jsonb,p_version text,p_request_id uuid,p_actor uuid,p_reason text,
  p_patch jsonb,p_member_id uuid,p_points numeric,p_sale_total numeric,p_before_totals jsonb,p_after_totals jsonb,p_shifts jsonb default '[]'
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_context jsonb; v_before_context jsonb; v_before jsonb; v_after jsonb; v_items jsonb; v_linked jsonb; v_original_member uuid;
  v_old_member uuid; v_old_points numeric:=0; v_old_sale numeric:=0; v_old_visit integer:=0;
  v_event public.loyalty_point_award_events%rowtype; v_event_source text; v_event_id uuid;
  v_member public.loyalty_members%rowtype; v_member_before jsonb; v_member_id uuid;
  v_points_delta numeric; v_available_delta numeric; v_spent_delta numeric; v_visit_delta integer;
  v_new_points numeric:=round(coalesce(p_points,0),2); v_new_sale numeric:=round(coalesce(p_sale_total,0),2);
  v_new_visit integer; v_sale_at timestamptz; v_balance numeric; v_revision integer;
  v_changes jsonb:='[]'; v_shift_changes jsonb:='[]'; v_shift jsonb; v_shift_before jsonb; v_shift_after jsonb;
  v_open_at timestamptz; v_closed_at timestamptz; v_existing jsonb; v_replay public.admin_receipt_edit_audit%rowtype;
  v_voucher public.vouchers%rowtype; v_voucher_before jsonb; v_voucher_changes jsonb:='[]'; v_returned_points numeric:=0;
begin
  if not exists(select 1 from public.profiles where id=p_actor and lower(role) in ('admin','super_admin')) then raise exception 'Admin access required.'; end if;
  if p_request_id is null or length(btrim(coalesce(p_reason,'')))<3 then raise exception 'Enter a correction reason.'; end if;
  if p_member_id is null then v_new_points:=0; v_new_sale:=0; end if;
  if v_new_points<0 or v_new_sale<0 then raise exception 'Invalid loyalty contribution.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('admin-receipt:'||p_source||':'||p_id,0));
  select * into v_replay from public.admin_receipt_edit_audit where request_id=p_request_id;
  if found then
    if v_replay.source_type<>p_source or v_replay.source_id<>p_id or v_replay.actor_id<>p_actor then raise exception 'Correction request ID is already in use.'; end if;
    return jsonb_build_object('replayed',true,'context',v_replay.after_state);
  end if;
  v_context:=public.admin_receipt_edit_context(p_source,p_id,p_archive);
  v_before:=v_context->'receipt';
  v_original_member:=nullif(v_before->>'loyalty_member_id','')::uuid;
  if v_original_member is null and coalesce(v_before->>'customer_id','') ~* '^[0-9a-f-]{36}$' then v_original_member:=(v_before->>'customer_id')::uuid; end if;
  select * into v_event from public.loyalty_point_award_events
    where (source_type=p_source and source_id=p_id)
      or (p_source='order' and source_type='web_order' and source_id=nullif(v_before->>'source_web_order_id','')::uuid)
    order by (source_type=p_source) desc limit 1;
  v_old_member:=coalesce(v_event.member_id,v_original_member);
  -- Award and refund RPCs lock members before sales. Keep that order here.
  perform id from public.loyalty_members where id in (v_old_member,p_member_id) order by id for update;
  if p_member_id is not null and not exists(select 1 from public.loyalty_members where id=p_member_id) then raise exception 'Loyalty account was not found.'; end if;
  if p_source='order' then
    perform id from public.orders where id=p_id for update;
    perform id from public.order_items where order_id=p_id order by id for update;
    perform id from public.web_orders where id=nullif(v_before->>'source_web_order_id','')::uuid for update;
  else perform id from public.web_orders where id=p_id for update;
  end if;
  v_context:=public.admin_receipt_edit_context(p_source,p_id,p_archive);
  if v_context->>'version' is distinct from p_version then raise exception 'Receipt changed. Reopen the editor and try again.' using errcode='40001'; end if;
  v_before_context:=v_context;
  v_before:=v_context->'receipt'; v_items:=p_patch->'items'; v_after:=p_patch->'receipt';
  if lower(coalesce(v_before->>'status','')) not in ('paid','closed','completed','complete','delivered')
    or coalesce((v_before->>'refund_amount')::numeric,0)>0 or v_before->>'refunded_at' is not null or v_before->>'voided_at' is not null then
    raise exception 'Only paid receipts without refunds or voids can be corrected.';
  end if;
  if v_after->>'id'<>p_id::text or (v_after->>'gross_amount')::numeric<0
    or (v_after->>'discount_amount')::numeric<0 or (v_after->>'net_amount')::numeric<0
    or round((v_after->>'gross_amount')::numeric-(v_after->>'discount_amount')::numeric,2)<>round((v_after->>'net_amount')::numeric,2)
    or (select coalesce(sum((e->>'amount')::numeric),0) from jsonb_array_elements(v_after->'source_metadata'->'payment_splits') e)<>(v_after->>'net_amount')::numeric then
    raise exception 'Receipt and payment totals must balance.';
  end if;
  v_sale_at:=coalesce((v_before->>'paid_at')::timestamptz,(v_before->>'completed_at')::timestamptz,(v_before->>'created_at')::timestamptz);
  v_event_source:=coalesce(v_event.source_type,p_source); v_event_id:=coalesce(v_event.source_id,p_id);
  v_old_points:=coalesce(v_event.points_awarded,(v_before->>'loyalty_points_awarded')::numeric,0);
  v_old_sale:=coalesce(v_event.sale_total,(v_before->>'loyalty_sale_total')::numeric,(v_before->>'net_amount')::numeric,(v_before->>'total')::numeric,0);
  v_old_visit:=case when v_old_member is not null and (v_event.id is not null or v_before->>'loyalty_points_awarded_at' is not null) and v_old_points>0 then 1 else 0 end;
  if v_old_visit=0 then v_old_sale:=0; end if;
  v_new_visit:=case when p_member_id is not null and v_new_points>0 then 1 else 0 end;
  if v_new_visit=0 then v_new_sale:=0; end if;
  v_revision:=(v_context->>'revision')::integer+1;
  for v_member_id in select distinct id from public.loyalty_members where id in (v_old_member,p_member_id) order by id loop
    select * into v_member from public.loyalty_members where id=v_member_id;
    v_member_before:=to_jsonb(v_member);
    v_points_delta:=case when v_member_id=p_member_id then v_new_points else 0 end-case when v_member_id=v_old_member then v_old_points else 0 end;
    -- Expired annual points must not be revived or subtracted from this year's earnings.
    v_available_delta:=case when v_member.points_reset_at is null or v_sale_at>v_member.points_reset_at then v_points_delta else 0 end;
    v_spent_delta:=case when v_member_id=p_member_id then v_new_sale else 0 end-case when v_member_id=v_old_member then v_old_sale else 0 end;
    v_visit_delta:=case when v_member_id=p_member_id then v_new_visit else 0 end-case when v_member_id=v_old_member then v_old_visit else 0 end;
    v_returned_points:=0;
    -- Recover unused point rewards when this correction removes the points
    -- that funded them. Redeemed and already-expired rewards remain untouched.
    if coalesce(v_member."Available points",0)+v_available_delta<0 then
      for v_voucher in select * from public.vouchers where member_id=v_member_id
        and reward_type='points' and status='active' and redeemed_at is null
        and points_consumed>0 and (expires_at is null or expires_at>now())
        order by issued_at desc,id for update
      loop
        exit when coalesce(v_member."Available points",0)+v_returned_points+v_available_delta>=0;
        v_voucher_before:=to_jsonb(v_voucher);
        v_returned_points:=v_returned_points+v_voucher.points_consumed;
        update public.vouchers set status='expired',expires_at=now(),points_consumed=0 where id=v_voucher.id returning * into v_voucher;
        v_voucher_changes:=v_voucher_changes||jsonb_build_array(jsonb_build_object('before',v_voucher_before,'after',to_jsonb(v_voucher)));
      end loop;
      v_available_delta:=v_available_delta+v_returned_points;
    end if;
    if coalesce(v_member."Available points",0)+v_available_delta<0 then
      raise exception 'This account has already spent the receipt points. Restore sufficient available points before correcting this receipt.';
    end if;
    if coalesce(v_member."Points balance",0)+v_points_delta<0 or coalesce(v_member."Total spent",0)+v_spent_delta<0 then
      raise exception 'Loyalty balances cannot cover this reversal. Review the account before correcting the receipt.';
    end if;
    update public.loyalty_members set
      "Points balance"=round(coalesce("Points balance",0)+v_points_delta,2),
      "Available points"=round(coalesce("Available points",0)+v_available_delta,2),
      "Total spent"=round(coalesce("Total spent",0)+v_spent_delta,2),
      "Total visits"=greatest(0,coalesce("Total visits",0)+v_visit_delta),
      "First visit"=case when v_visit_delta>0 and (public.admin_receipt_visit_time("First visit") is null or public.admin_receipt_visit_time("First visit")>v_sale_at) then v_sale_at::text else "First visit" end,
      "Last visit"=case when v_visit_delta>0 and (public.admin_receipt_visit_time("Last visit") is null or public.admin_receipt_visit_time("Last visit")<v_sale_at) then v_sale_at::text else "Last visit" end
    where id=v_member_id returning * into v_member;
    v_changes:=v_changes||jsonb_build_array(jsonb_build_object('before',v_member_before,'after',to_jsonb(v_member)));
    if v_member_id=p_member_id then v_balance:=v_member."Available points"; end if;
  end loop;
  select * into v_member from public.loyalty_members where id=p_member_id;
  if v_old_member is not distinct from p_member_id and v_old_points=v_new_points and v_old_sale=v_new_sale then
    v_balance:=(v_before->>'receipt_points_balance')::numeric;
  end if;
  v_after:=v_after||jsonb_build_object('loyalty_member_id',p_member_id,'customer_id',p_member_id,
    'customer_name',v_member.customer_name,'customer_code',v_member.customer_code,'customer_phone',v_member."Phone",
    'loyalty_points_awarded',v_new_points,'loyalty_points_awarded_at',coalesce(v_before->>'loyalty_points_awarded_at',now()::text),
    'loyalty_sale_total',v_new_sale,'receipt_points_balance',v_balance,
    'source_metadata',(v_after->'source_metadata')||jsonb_build_object('admin_receipt_revision',v_revision));
  perform set_config('app.admin_receipt_correction','on',true);
  if p_source='order' and (v_context->>'live')::boolean then
    update public.orders set items=v_after->'items',total=v_after->>'total',subtotal=(v_after->>'subtotal')::numeric,
      gross_amount=(v_after->>'gross_amount')::numeric,discount=v_after->>'discount_amount',discount_amount=(v_after->>'discount_amount')::numeric,
      net_amount=(v_after->>'net_amount')::numeric,payment_method=v_after->>'payment_method',source_metadata=v_after->'source_metadata',
      customer_id=p_member_id::text,loyalty_member_id=p_member_id,customer_name=v_member.customer_name,customer_code=v_member.customer_code,customer_phone=v_member."Phone",
      loyalty_points_awarded=v_new_points,loyalty_points_awarded_at=(v_after->>'loyalty_points_awarded_at')::timestamptz,receipt_points_balance=v_balance
    where id=p_id returning to_jsonb(orders.*) into v_after;
    update public.order_items i set gross_amount=(e->>'gross_amount')::numeric,discount_amount=(e->>'discount_amount')::numeric,
      net_amount=(e->>'net_amount')::numeric,line_total=(e->>'net_amount')::numeric,source_metadata=e->'source_metadata'
    from jsonb_array_elements(v_items) e where i.id=(e->>'id')::uuid and i.order_id=p_id;
    select coalesce(jsonb_agg(to_jsonb(i) order by i.id),'[]') into v_items from public.order_items i where order_id=p_id;
  elsif p_source='web_order' and (v_context->>'live')::boolean then
    update public.web_orders set total=(v_after->>'total')::numeric,subtotal=(v_after->>'subtotal')::numeric,
      gross_amount=(v_after->>'gross_amount')::numeric,discount_amount=(v_after->>'discount_amount')::numeric,net_amount=(v_after->>'net_amount')::numeric,
      items=v_items,payment_method=v_after->>'payment_method',source_metadata=v_after->'source_metadata',
      loyalty_member_id=p_member_id,customer_name=v_member.customer_name,customer_code=v_member.customer_code,customer_phone=v_member."Phone",
      loyalty_points_awarded=v_new_points,loyalty_points_awarded_at=(v_after->>'loyalty_points_awarded_at')::timestamptz,loyalty_sale_total=v_new_sale,receipt_points_balance=v_balance
    where id=p_id returning to_jsonb(web_orders.*) into v_after;
  else
    if p_source='web_order' then v_after:=v_after||jsonb_build_object('items',v_items); end if;
    v_after:=v_after||jsonb_build_object('updated_at',now());
  end if;
  v_linked:=v_context->'linkedWebReceipt';
  if v_linked is not null and v_linked<>'null'::jsonb then
    v_linked:=v_linked||jsonb_build_object('items',v_after->'items','total',(v_after->>'total')::numeric,'subtotal',(v_after->>'subtotal')::numeric,
      'gross_amount',(v_after->>'gross_amount')::numeric,'discount_amount',(v_after->>'discount_amount')::numeric,'net_amount',(v_after->>'net_amount')::numeric,
      'payment_method',v_after->>'payment_method','loyalty_member_id',p_member_id,'customer_name',v_member.customer_name,
      'customer_code',v_member.customer_code,'customer_phone',v_member."Phone",'loyalty_points_awarded',v_new_points,
      'loyalty_points_awarded_at',v_after->>'loyalty_points_awarded_at','loyalty_sale_total',v_new_sale,'receipt_points_balance',v_balance,
      'source_metadata',v_after->'source_metadata');
    v_linked:=v_linked||jsonb_build_object('updated_at',now());
    update public.web_orders set items=v_after->'items',total=(v_after->>'total')::numeric,subtotal=(v_after->>'subtotal')::numeric,
      gross_amount=(v_after->>'gross_amount')::numeric,discount_amount=(v_after->>'discount_amount')::numeric,net_amount=(v_after->>'net_amount')::numeric,
      payment_method=v_after->>'payment_method',source_metadata=v_after->'source_metadata',loyalty_member_id=p_member_id,
      customer_name=v_member.customer_name,customer_code=v_member.customer_code,customer_phone=v_member."Phone",
      loyalty_points_awarded=v_new_points,loyalty_points_awarded_at=(v_after->>'loyalty_points_awarded_at')::timestamptz,
      loyalty_sale_total=v_new_sale,receipt_points_balance=v_balance
    where id=(v_linked->>'id')::uuid returning to_jsonb(web_orders.*) into v_existing;
    v_linked:=coalesce(v_existing,v_linked);
  end if;
  if coalesce(p_member_id,v_old_member) is not null then
    insert into public.loyalty_point_award_events(member_id,source_type,source_id,receipt_number,points_awarded,sale_total,points_balance_after,available_points_after,awarded_at,metadata)
    values(coalesce(p_member_id,v_old_member),v_event_source,v_event_id,v_after->>'receipt_number',v_new_points,v_new_sale,v_member."Points balance",v_balance,
      coalesce(v_event.awarded_at,v_sale_at),coalesce(v_event.metadata,'{}')||jsonb_build_object('admin_receipt_revision',v_revision,'unlinked',p_member_id is null))
    on conflict(source_type,source_id) do update set member_id=excluded.member_id,points_awarded=excluded.points_awarded,sale_total=excluded.sale_total,
      points_balance_after=excluded.points_balance_after,available_points_after=excluded.available_points_after,metadata=excluded.metadata;
  end if;
  if v_old_member is distinct from p_member_id and v_old_visit>0 then
    update public.loyalty_members m set
      "First visit"=case when m."Total visits"=0 then null
        when public.admin_receipt_visit_time(m."First visit") in (v_sale_at,v_event.awarded_at) then
          coalesce((select min(awarded_at)::text from public.loyalty_point_award_events where member_id=m.id and points_awarded>0),m."First visit") else m."First visit" end,
      "Last visit"=case when m."Total visits"=0 then null
        when public.admin_receipt_visit_time(m."Last visit") in (v_sale_at,v_event.awarded_at) then
          coalesce((select max(awarded_at)::text from public.loyalty_point_award_events where member_id=m.id and points_awarded>0),m."Last visit") else m."Last visit" end
    where m.id=v_old_member;
  end if;
  if p_member_id is not null and (p_member_id is distinct from v_old_member or v_new_points>v_old_points)
    and (v_member.points_reset_at is null or v_sale_at>v_member.points_reset_at) then
    perform public.ensure_vouchers_for_member(p_member_id);
  end if;
  select coalesce(jsonb_agg(e||jsonb_build_object('after',to_jsonb(m))),'[]') into v_changes
    from jsonb_array_elements(v_changes) e join public.loyalty_members m on m.id=(e->'before'->>'id')::uuid;
  -- Read current shift rows while locked; changes to other receipts compose as deltas.
  for v_shift in
    select value from jsonb_array_elements(coalesce(p_shifts,'[]')) order by value->>'id'
  loop
    v_existing:=null;
    select to_jsonb(cp) into v_existing from public.cashier_pos cp where id=v_shift->>'id' for update;
    if v_existing is null then
      select shift into v_existing from public.admin_receipt_shift_corrections where shift_id=v_shift->>'id' for update;
    end if;
    v_shift_before:=coalesce(v_existing,v_shift);
    v_closed_at:=(v_shift_before->>'created_at')::timestamptz;
    select max(created_at) into v_open_at from public.cashier_pos where store_id=v_before->>'store_id' and mode='open' and created_at<=v_closed_at;
    if v_open_at is null then
      select opened_at into v_open_at from public.sales_archive_batches where shift_id=v_shift->>'id';
    end if;
    if v_shift_before->>'store_id' is distinct from v_before->>'store_id'
      or lower(coalesce(v_shift_before->>'mode','')) not in ('close','end_day')
      or v_open_at is null or v_sale_at<v_open_at or v_sale_at>v_closed_at then continue; end if;
    v_shift_after:=v_shift_before||jsonb_build_object('sales_summary',public.admin_receipt_shift_delta(v_shift_before->'sales_summary',p_before_totals,p_after_totals));
    update public.cashier_pos set sales_summary=v_shift_after->'sales_summary' where id=v_shift_after->>'id';
    insert into public.admin_receipt_shift_corrections(shift_id,shift) values(v_shift_after->>'id',v_shift_after)
      on conflict(shift_id) do update set shift=excluded.shift,updated_at=now();
    v_shift_changes:=v_shift_changes||jsonb_build_array(jsonb_build_object('before',v_shift_before,'after',v_shift_after));
  end loop;
  perform set_config('app.admin_receipt_correction','off',true);
  insert into public.admin_receipt_corrections(source_type,source_id,revision,receipt_at,store_id,receipt,items,linked_web_receipt)
  values(p_source,p_id,v_revision,v_sale_at,v_after->>'store_id',v_after,v_items,v_linked)
  on conflict(source_type,source_id) do update set revision=excluded.revision,receipt=excluded.receipt,items=excluded.items,linked_web_receipt=excluded.linked_web_receipt,updated_at=now();
  v_context:=public.admin_receipt_edit_context(p_source,p_id,p_archive);
  insert into public.admin_receipt_edit_audit(request_id,source_type,source_id,actor_id,reason,before_state,after_state,loyalty_changes,voucher_changes,shift_changes)
  values(p_request_id,p_source,p_id,p_actor,btrim(p_reason),v_before_context||jsonb_build_object('awardEvent',to_jsonb(v_event)),v_context,v_changes,v_voucher_changes,v_shift_changes);
  return jsonb_build_object('context',v_context,'loyaltyChanges',v_changes,'voucherChanges',v_voucher_changes,'shiftChanges',v_shift_changes);
end;
$$;
revoke all on function public.admin_receipt_edit_context(text,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.admin_receipt_shift_delta(jsonb,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.admin_receipt_visit_time(text) from public,anon,authenticated;
revoke all on function public.correct_admin_receipt(text,uuid,jsonb,text,uuid,uuid,text,jsonb,uuid,numeric,numeric,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.admin_receipt_edit_context(text,uuid,jsonb) to service_role;
grant execute on function public.correct_admin_receipt(text,uuid,jsonb,text,uuid,uuid,text,jsonb,uuid,numeric,numeric,jsonb,jsonb,jsonb) to service_role;
notify pgrst,'reload schema';
