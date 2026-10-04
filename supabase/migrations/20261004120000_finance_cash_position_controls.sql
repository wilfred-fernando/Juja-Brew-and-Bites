begin;

create table public.finance_cash_account_controls (
 id uuid primary key default gen_random_uuid(), request_id uuid not null unique,
 account_id uuid not null references public.finance_cash_accounts(id), effective_date date not null,
 minimum_balance numeric(14,2) not null default 0 check(minimum_balance>=0),
 statement_balance numeric(14,2), notes text,
 created_by uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default clock_timestamp()
);
create index finance_cash_controls_date on public.finance_cash_account_controls(account_id,effective_date desc,created_at desc);
create table public.finance_cash_payment_queue (
 id uuid primary key default gen_random_uuid(), request_id uuid not null unique,
 account_id uuid not null references public.finance_cash_accounts(id), payee text not null check(length(trim(payee))>0),
 particular text not null check(length(trim(particular))>0), reference text not null check(length(trim(reference))>0),
 payment_method text not null check(payment_method in ('Cheque','Bank Transfer','Wallet','Cash')),
 cheque_number text, amount numeric(14,2) not null check(amount>0),
 scheduled_date date not null, due_date date not null check(due_date>=scheduled_date),
 released_date date check(released_date>=scheduled_date), cleared_date date check(cleared_date>=released_date),
 cancelled_date date check(cancelled_date>=scheduled_date),
 status text not null default 'scheduled' check(status in ('scheduled','released','cleared','cancelled')),
 notes text, audit_log jsonb not null default '[]',
 created_by uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default clock_timestamp(),
 check(payment_method<>'Cheque' or length(trim(coalesce(cheque_number,'')))>0),
 check((status='scheduled' and released_date is null and cleared_date is null and cancelled_date is null)
  or(status='released' and released_date is not null and cleared_date is null and cancelled_date is null)
  or(status='cleared' and released_date is not null and cleared_date is not null and cancelled_date is null)
  or(status='cancelled' and cleared_date is null and cancelled_date is not null))
);
create unique index finance_cash_payment_cheque on public.finance_cash_payment_queue(account_id,lower(trim(cheque_number))) where payment_method='Cheque' and status<>'cancelled';
create index finance_cash_payment_account_dates on public.finance_cash_payment_queue(account_id,scheduled_date,due_date);
do $$ declare t text; begin
 foreach t in array array['finance_cash_account_controls','finance_cash_payment_queue'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy cash_position_admin_read on public.%I for select to authenticated using(exists(select 1 from public.profiles where id=auth.uid() and lower(role) in (''admin'',''super_admin'')))',t);
 end loop;
end $$;

create function public.finance_cash_save_controls(p_data jsonb) returns uuid
language plpgsql security definer set search_path=pg_catalog,public as $$
declare result uuid;
begin
 perform public.finance_cash_require_admin();
 if not exists(select 1 from public.finance_cash_accounts where id=(p_data->>'account_id')::uuid and petty_store_id is null) then raise exception 'Choose a treasury fund source'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_data->>'request_id',0));
 select id into result from public.finance_cash_account_controls where request_id=(p_data->>'request_id')::uuid;
 if result is not null then return result; end if;
 insert into public.finance_cash_account_controls(request_id,account_id,effective_date,minimum_balance,statement_balance,notes)
 values((p_data->>'request_id')::uuid,(p_data->>'account_id')::uuid,(p_data->>'effective_date')::date,
  (p_data->>'minimum_balance')::numeric,nullif(p_data->>'statement_balance','')::numeric,p_data->>'notes') returning id into result;
 return result;
end $$;

create function public.finance_cash_schedule_payment(p_data jsonb) returns uuid
language plpgsql security definer set search_path=pg_catalog,public as $$
declare result uuid;
begin
 perform public.finance_cash_require_admin();
 if not exists(select 1 from public.finance_cash_accounts where id=(p_data->>'account_id')::uuid and petty_store_id is null) then raise exception 'Schedule branch petty cash payments in Petty Cash'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_data->>'request_id',0));
 select id into result from public.finance_cash_payment_queue where request_id=(p_data->>'request_id')::uuid;
 if result is not null then return result; end if;
 insert into public.finance_cash_payment_queue(request_id,account_id,payee,particular,reference,payment_method,cheque_number,amount,scheduled_date,due_date,notes,audit_log)
 values((p_data->>'request_id')::uuid,(p_data->>'account_id')::uuid,trim(p_data->>'payee'),trim(p_data->>'particular'),trim(p_data->>'reference'),
  p_data->>'payment_method',nullif(trim(p_data->>'cheque_number'),''),(p_data->>'amount')::numeric,(p_data->>'scheduled_date')::date,(p_data->>'due_date')::date,p_data->>'notes',
  jsonb_build_array(jsonb_build_object('status','scheduled','date',p_data->>'scheduled_date','actor',auth.uid(),'recorded_at',now()))) returning id into result;
 return result;
end $$;

create function public.finance_cash_payment_action(p_id uuid,p_action text,p_date date,p_note text,p_request_id uuid) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare payment public.finance_cash_payment_queue; previous public.finance_cash_transactions; next_status text; latest_date date;
begin
 perform public.finance_cash_require_admin();
 select * into payment from public.finance_cash_payment_queue where id=p_id for update;
 if not found then raise exception 'Payment not found'; end if;
 if p_request_id is null then raise exception 'Action request ID is required'; end if;
 if exists(select 1 from jsonb_array_elements(payment.audit_log) e where e->>'request_id'=p_request_id::text) then return; end if;
 if p_action is null or p_action not in ('released','cleared','cancelled','reopened') then raise exception 'Invalid payment action'; end if;
 next_status:=case when p_action='reopened' then 'released' else p_action end;
 if payment.status=next_status then return; end if;
 select max((e->>'date')::date) into latest_date from jsonb_array_elements(payment.audit_log) e;
 if p_date is null or p_date<latest_date then raise exception 'Action date cannot precede the latest payment action'; end if;
 if p_action='reopened' then
  if payment.status<>'cleared' then raise exception 'Only cleared payments can be reopened'; end if;
  if length(trim(coalesce(p_note,'')))=0 then raise exception 'Enter a clearance correction reason'; end if;
  select t.* into previous from public.finance_cash_transactions t where source_table='finance_cash_payment_queue' and source_record_id=p_id::text and kind='outflow'
   and not exists(select 1 from public.finance_cash_transactions r where r.reversal_of=t.id) order by created_at desc limit 1;
  if previous.id is null then raise exception 'Cleared ledger entry not found'; end if;
  insert into public.finance_cash_transactions(request_id,transaction_date,kind,from_account_id,amount,reversal_of,reference,notes,source_table,source_record_id)
  values(p_request_id,p_date,'reversal',previous.from_account_id,previous.amount,previous.id,'Clearance correction: '||payment.reference,p_note,'finance_cash_payment_queue',p_id::text);
 else
  if payment.status in ('cleared','cancelled') then raise exception 'This payment is already final'; end if;
  if p_action='released' and payment.status<>'scheduled' then raise exception 'Only scheduled payments can be released'; end if;
  if p_action='cleared' and payment.status<>'released' then raise exception 'Release the payment before clearing it'; end if;
  if p_action='cancelled' and length(trim(coalesce(p_note,'')))=0 then raise exception 'Enter a cancellation reason'; end if;
  if p_action='cleared' then
   insert into public.finance_cash_transactions(request_id,transaction_date,kind,from_account_id,amount,reference,notes,source_table,source_record_id)
   values(p_request_id,p_date,'outflow',payment.account_id,payment.amount,payment.reference,
    payment.payee||' — '||payment.particular,'finance_cash_payment_queue',payment.id::text);
  end if;
 end if;
 update public.finance_cash_payment_queue set status=next_status,
  released_date=case when p_action='released' then p_date else released_date end,
  cleared_date=case when p_action='cleared' then p_date when p_action='reopened' then null else cleared_date end,
  cancelled_date=case when p_action='cancelled' then p_date else cancelled_date end,
  audit_log=audit_log||jsonb_build_array(jsonb_build_object('action',p_action,'status',next_status,'date',p_date,'note',p_note,'actor',auth.uid(),'request_id',p_request_id,'recorded_at',clock_timestamp())) where id=p_id;
end $$;

create or replace function public.finance_guard_petty_cash_posting() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if NEW.source_table is null then
  if exists(select 1 from public.finance_cash_transactions where id=NEW.reversal_of and source_table='finance_cash_payment_queue') then
   raise exception 'Correct clearance through the Payments queue';
  end if;
  if exists(select 1 from public.finance_cash_accounts where petty_store_id is not null and id in (NEW.from_account_id,NEW.to_account_id))
   or exists(select 1 from public.finance_cash_transactions where id=NEW.reversal_of and source_table is not null) then
   raise exception 'Record or correct this movement in Finance Expenses > Petty Cash';
  end if;
 end if;
 return NEW;
end $$;

create function public.finance_cash_position_snapshot(p_from date,p_to date) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare result jsonb; enriched jsonb; payments jsonb;
begin
 perform public.finance_cash_require_admin();
 result:=public.finance_cash_snapshot(p_from,p_to);
 with payment_state as (
 select p.*,e.event->>'status' as as_of_status from public.finance_cash_payment_queue p
 cross join lateral(select event from jsonb_array_elements(p.audit_log) with ordinality entries(event,position)
 where (event->>'date')::date<=p_to order by position desc limit 1) e
 ), movement as (
  select t.*,case when t.kind='reversal' then -1 else 1 end direction,coalesce(o.kind,t.kind) effective_kind
  from public.finance_cash_transactions t left join public.finance_cash_transactions o on o.id=t.reversal_of
 ), legs as (
  select to_account_id account_id,transaction_date,direction*(amount-fee) value from movement where to_account_id is not null
  union all select from_account_id,transaction_date,-direction*amount from movement where from_account_id is not null
 )
 select coalesce(jsonb_agg(a||jsonb_build_object(
  'minimum_balance',coalesce(c.minimum_balance,0),'released_pending',coalesce(q.released,0),'scheduled_pending',coalesce(q.scheduled,0),
  'available',((a->>'balance')::numeric-coalesce(c.minimum_balance,0)-coalesce(q.released,0)-coalesce(q.scheduled,0)),
  'opening_adjustments',coalesce(m.openings,0),'cash_in',coalesce(m.cash_in,0),'collections',coalesce(m.collections,0),
  'transfers_in',coalesce(m.transfers_in,0),'payments',coalesce(m.payments,0),'transfers_out',coalesce(m.transfers_out,0),
  'transfer_fees',coalesce(m.transfer_fees,0),
  'statement_date',b.effective_date,'statement_balance',b.statement_balance,'statement_notes',b.notes,
  'statement_ledger',case when b.id is not null then coalesce((select sum(value) from legs where account_id=(a->>'id')::uuid and transaction_date<=b.effective_date),0) end,
  'variance',case when b.id is not null then b.statement_balance-coalesce((select sum(value) from legs where account_id=(a->>'id')::uuid and transaction_date<=b.effective_date),0) end)
  order by a->>'name'),'[]') into enriched
 from jsonb_array_elements(result->'accounts') a
 left join lateral (select * from public.finance_cash_account_controls where account_id=(a->>'id')::uuid and effective_date<=p_to order by effective_date desc,created_at desc,id desc limit 1) c on true
 left join lateral (select * from public.finance_cash_account_controls where account_id=(a->>'id')::uuid and effective_date<=p_to and statement_balance is not null order by effective_date desc,created_at desc,id desc limit 1) b on true
 left join lateral (
  select sum(amount) filter(where as_of_status='released') released,
    sum(amount) filter(where as_of_status='scheduled') scheduled
  from payment_state where account_id=(a->>'id')::uuid and scheduled_date<=p_to
 ) q on true
 left join lateral (
  select sum(direction*amount) filter(where effective_kind='opening' and to_account_id=(a->>'id')::uuid) openings,
   sum(direction*amount) filter(where effective_kind='inflow' and to_account_id=(a->>'id')::uuid) cash_in,
   sum(direction*(amount-fee)) filter(where effective_kind='collection' and to_account_id=(a->>'id')::uuid) collections,
   sum(direction*(amount-fee)) filter(where effective_kind='transfer' and to_account_id=(a->>'id')::uuid) transfers_in,
   sum(direction*amount) filter(where effective_kind='outflow' and from_account_id=(a->>'id')::uuid) payments,
   sum(direction*amount) filter(where effective_kind='transfer' and from_account_id=(a->>'id')::uuid) transfers_out,
   sum(direction*fee) filter(where effective_kind='transfer' and from_account_id=(a->>'id')::uuid) transfer_fees
  from movement where transaction_date between p_from and p_to
 ) m on true;
 select coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object('account_name',a.name,'status_as_of',
  (select event->>'status' from jsonb_array_elements(p.audit_log) with ordinality events(event,position) where (event->>'date')::date<=p_to order by position desc limit 1))
  order by p.due_date,p.created_at),'[]') into payments
 from public.finance_cash_payment_queue p join public.finance_cash_accounts a on a.id=p.account_id where p.scheduled_date<=p_to;
 return result||jsonb_build_object('accounts',enriched,'payment_queue',payments);
end $$;
revoke all on function public.finance_cash_save_controls(jsonb),public.finance_cash_schedule_payment(jsonb),public.finance_cash_payment_action(uuid,text,date,text,uuid),public.finance_cash_position_snapshot(date,date) from public,anon;
grant execute on function public.finance_cash_save_controls(jsonb),public.finance_cash_schedule_payment(jsonb),public.finance_cash_payment_action(uuid,text,date,text,uuid),public.finance_cash_position_snapshot(date,date) to authenticated;
notify pgrst,'reload schema';
commit;
