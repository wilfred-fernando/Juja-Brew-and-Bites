begin;
create function public.finance_shopee_settlement(p_gross numeric,p_others numeric default 0) returns jsonb
language sql immutable set search_path=pg_catalog as $$
 select jsonb_build_object('commission',-round(p_gross*.27/1.12,2),'tax_on_commission',-round(p_gross*.27/1.12*.12,2),
 'gross_remittance',round(p_gross*.622855,2),'ewt',-round(p_gross*.622855*.005,2),'others',round(coalesce(p_others,0),2),
 'net_sales',round(p_gross-p_gross*.27/1.12-p_gross*.27/1.12*.12-p_gross*.622855*.005+coalesce(p_others,0),2),
 'calculated_deductions',p_gross-round(p_gross-p_gross*.27/1.12-p_gross*.27/1.12*.12-p_gross*.622855*.005+coalesce(p_others,0),2));
$$;
create table public.finance_shopee_adjustments (
 id uuid primary key default gen_random_uuid(),request_id uuid not null unique,
 receivable_id uuid not null references public.finance_cash_receivables(id),store_id text,reference text,effective_date date not null,
 others numeric(14,2) not null,notes text not null check(length(trim(notes))>0),
 created_by uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default clock_timestamp()
);
create index finance_shopee_adjustment_date on public.finance_shopee_adjustments(receivable_id,effective_date desc,created_at desc);
alter table public.finance_shopee_adjustments enable row level security;
revoke all on public.finance_shopee_adjustments from public,anon,authenticated;
grant select on public.finance_shopee_adjustments to authenticated;
create policy shopee_adjustments_admin_read on public.finance_shopee_adjustments for select to authenticated using(exists(select 1 from public.profiles where id=auth.uid() and lower(role) in ('admin','super_admin')));
create trigger finance_entry_edit_audit after insert or update or delete on public.finance_shopee_adjustments for each row execute function public.finance_capture_entry_edit();
create trigger finance_shopee_adjustment_immutable before update or delete on public.finance_shopee_adjustments for each row execute function public.finance_entry_log_immutable();

create function public.finance_shopee_save_adjustment(p_data jsonb) returns uuid
language plpgsql security definer set search_path=pg_catalog,public as $$
declare r public.finance_cash_receivables; result uuid; net numeric; remitted numeric; settled numeric; v_date date:=(p_data->>'effective_date')::date;
begin
 perform public.finance_cash_require_admin();
 perform pg_advisory_xact_lock(hashtextextended(p_data->>'request_id',0));
 select id into result from public.finance_shopee_adjustments where request_id=(p_data->>'request_id')::uuid;
 if result is not null then return result; end if;
 select * into r from public.finance_cash_receivables where id=(p_data->>'receivable_id')::uuid for update;
 if not found or lower(replace(r.channel,' ',''))<>'shopeefood' then raise exception 'Choose a ShopeeFood collection'; end if;
 if v_date is null or v_date<r.period_end or exists(select 1 from public.finance_cash_transactions where receivable_id=r.id and transaction_date>v_date)
 or exists(select 1 from public.finance_shopee_adjustments where receivable_id=r.id and effective_date>v_date) then raise exception 'Adjustment date cannot precede the sales date or the latest adjustment/remittance'; end if;
 net:=(public.finance_shopee_settlement(r.gross_amount,(p_data->>'others')::numeric)->>'net_sales')::numeric;
 select coalesce(sum((case when kind='reversal' then -1 else 1 end)*(amount-fee)),0),coalesce(sum((case when kind='reversal' then -1 else 1 end)*amount),0) into remitted,settled from public.finance_cash_transactions where receivable_id=r.id;
 if net<0 or net>r.gross_amount or net<remitted or net-remitted>r.gross_amount-settled then raise exception 'Others conflicts with gross sales or posted remittances; review/reverse the affected remittance first'; end if;
 insert into public.finance_shopee_adjustments(request_id,receivable_id,store_id,reference,effective_date,others,notes)
 values((p_data->>'request_id')::uuid,r.id,r.store_id,r.reference,v_date,(p_data->>'others')::numeric,p_data->>'notes') returning id into result;
 return result;
end $$;

create function public.finance_shopee_remittance_amounts(p_id uuid,p_date date,p_net numeric) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare r public.finance_cash_receivables; others numeric; expected numeric; paid numeric; settled numeric; net_left numeric; gross_left numeric; gross_settled numeric;
begin
 perform public.finance_cash_require_admin();
 select * into r from public.finance_cash_receivables where id=p_id for update;
 if not found or lower(replace(r.channel,' ',''))<>'shopeefood' then raise exception 'Choose a ShopeeFood collection'; end if;
 if p_date is null or p_date<r.period_end or exists(select 1 from public.finance_cash_transactions where receivable_id=r.id and transaction_date>p_date)
 or exists(select 1 from public.finance_shopee_adjustments where receivable_id=r.id and effective_date>p_date) then raise exception 'Remittance date cannot precede the sales date or latest adjustment/remittance'; end if;
 select a.others into others from public.finance_shopee_adjustments a where receivable_id=r.id and effective_date<=p_date order by effective_date desc,created_at desc,id desc limit 1;
 expected:=(public.finance_shopee_settlement(r.gross_amount,coalesce(others,0))->>'net_sales')::numeric;
 select coalesce(sum((case when kind='reversal' then -1 else 1 end)*(amount-fee)),0),coalesce(sum((case when kind='reversal' then -1 else 1 end)*amount),0) into paid,settled from public.finance_cash_transactions where receivable_id=r.id;
 net_left:=expected-paid;gross_left:=r.gross_amount-settled;
 if p_net is null or p_net<=0 or p_net<>round(p_net,2) or p_net>net_left or net_left<=0 or gross_left<net_left then raise exception 'Remittance exceeds the ShopeeFood net balance or conflicts with posted deductions'; end if;
 gross_settled:=case when p_net=net_left then gross_left else round(gross_left*p_net/net_left,2) end;
 return jsonb_build_object('amount',gross_settled,'fee',gross_settled-p_net,'net_amount',p_net);
end $$;
create function public.finance_shopee_post_remittance(p_data jsonb) returns uuid
language plpgsql security definer set search_path=pg_catalog,public as $$
declare existing uuid; amounts jsonb;
begin
 perform public.finance_cash_require_admin();
 perform pg_advisory_xact_lock(hashtextextended(p_data->>'request_id',0));
 select id into existing from public.finance_cash_transactions where request_id=(p_data->>'request_id')::uuid;
 if existing is not null then return existing; end if;
 amounts:=public.finance_shopee_remittance_amounts((p_data->>'receivable_id')::uuid,(p_data->>'transaction_date')::date,(p_data->>'net_amount')::numeric);
 return public.finance_cash_post(p_data||amounts||jsonb_build_object('kind','collection','from_account_id',null));
end $$;
create function public.finance_guard_shopee_remittance() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare amounts jsonb;
begin
 if NEW.kind='collection' and exists(select 1 from public.finance_cash_receivables where id=NEW.receivable_id and lower(replace(channel,' ',''))='shopeefood') then
  amounts:=public.finance_shopee_remittance_amounts(NEW.receivable_id,NEW.transaction_date,NEW.amount-NEW.fee);
  if NEW.amount<>(amounts->>'amount')::numeric or NEW.fee<>(amounts->>'fee')::numeric then raise exception 'Use the ShopeeFood remittance form so deductions match the settlement computation'; end if;
 end if;
 return NEW;
end $$;
create trigger finance_guard_shopee_remittance before insert on public.finance_cash_transactions for each row execute function public.finance_guard_shopee_remittance();

create or replace function public.finance_cash_collection_snapshot(p_to date) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare result jsonb;
begin
 perform public.finance_cash_require_admin();
 select coalesce(jsonb_agg(to_jsonb(r)||coalesce(calculation.value,'{}')||jsonb_build_object('is_shopee',lower(replace(r.channel,' ',''))='shopeefood',
 'store_name',coalesce(s.name,r.store_id,'Manual entry'),'remitted',coalesce(p.remitted,0),'deductions',coalesce(p.deductions,0),
 'gross_outstanding',r.gross_amount-coalesce(p.remitted,0)-coalesce(p.deductions,0),
 'outstanding',case when calculation.value is not null then (calculation.value->>'net_sales')::numeric-coalesce(p.remitted,0) else r.gross_amount-coalesce(p.remitted,0)-coalesce(p.deductions,0) end,
 'others_date',adjustment.effective_date,'others_notes',adjustment.notes,'remittances',coalesce(p.history,'[]')) order by r.period_end desc,r.channel),'[]') into result
 from public.finance_cash_reporting_receivables r left join public.stores s on s.id::text=r.store_id
 left join lateral(select * from public.finance_shopee_adjustments where receivable_id=r.id and effective_date<=p_to order by effective_date desc,created_at desc,id desc limit 1) adjustment on true
 left join lateral(select public.finance_shopee_settlement(r.gross_amount,coalesce(adjustment.others,0)) value where lower(replace(r.channel,' ',''))='shopeefood') calculation on true
 left join lateral(
  select sum((case when kind='reversal' then -1 else 1 end)*(amount-fee)) remitted,sum((case when kind='reversal' then -1 else 1 end)*fee) deductions,
   jsonb_agg(jsonb_build_object('id',t.id,'date',t.transaction_date,'amount',t.amount-t.fee,'deductions',t.fee,'reference',t.reference,'kind',t.kind,
    'reversed',exists(select 1 from public.finance_cash_transactions rev where rev.reversal_of=t.id and rev.transaction_date<=p_to)) order by t.transaction_date desc,t.created_at desc) history
  from public.finance_cash_reporting_transactions t where t.receivable_id=r.id and transaction_date<=p_to
 ) p on true where r.period_end<=p_to and r.cash_sales_date is null;
 return result;
end $$;
revoke all on function public.finance_shopee_settlement(numeric,numeric),public.finance_shopee_save_adjustment(jsonb),public.finance_shopee_remittance_amounts(uuid,date,numeric),public.finance_shopee_post_remittance(jsonb),public.finance_guard_shopee_remittance() from public,anon;
revoke all on function public.finance_guard_shopee_remittance() from authenticated;
grant execute on function public.finance_shopee_settlement(numeric,numeric),public.finance_shopee_save_adjustment(jsonb),public.finance_shopee_remittance_amounts(uuid,date,numeric),public.finance_shopee_post_remittance(jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
