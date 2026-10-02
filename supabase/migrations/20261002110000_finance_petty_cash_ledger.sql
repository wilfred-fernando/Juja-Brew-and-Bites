begin;

alter table public.finance_cash_accounts add column petty_store_id text unique;
alter table public.finance_cash_transactions
  add column source_table text,
  add column source_record_id text;
create index finance_cash_transaction_source on public.finance_cash_transactions(source_table,source_record_id);

-- Cashiers can choose fund names without access to treasury balances or transactions.
create function public.finance_petty_cash_sources() returns table(name text)
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if not exists (select 1 from public.profiles where id=auth.uid() and
    (lower(role) in ('admin','super_admin') or (lower(role)='cashier' and store_id is not null))) then
    raise exception 'Finance access required';
  end if;
  return query select a.name from public.finance_cash_accounts a where petty_store_id is null order by a.name;
end $$;
revoke all on function public.finance_petty_cash_sources() from public,anon;
grant execute on function public.finance_petty_cash_sources() to authenticated;

create function public.finance_sync_petty_cash_row(p_table text,p_row jsonb,p_deleted boolean default false) returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  prior public.finance_cash_transactions;
  branch_account uuid; source_account uuid; actor uuid; branch_name text;
  v_amount numeric(14,2); v_date date; v_source text; v_kind text;
begin
  if p_table not in ('finance_petty_cash_funds','finance_petty_cash_entries') then raise exception 'Invalid petty cash table'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_table||':'||(p_row->>'id'),0));
  select t.* into prior from public.finance_cash_transactions t
    where t.source_table=p_table and t.source_record_id=p_row->>'id' and t.kind<>'reversal'
      and not exists(select 1 from public.finance_cash_transactions r where r.reversal_of=t.id)
    order by t.created_at desc limit 1;
  actor := coalesce(auth.uid(),nullif(p_row->>'created_by','')::uuid,
    (select id from public.profiles where lower(role) in ('super_admin','admin') order by id limit 1));
  if actor is null then raise exception 'A finance administrator is required to attribute legacy cash movements'; end if;
  if p_deleted then
    if prior.id is not null then
      insert into public.finance_cash_transactions(request_id,transaction_date,kind,from_account_id,to_account_id,amount,fee,reversal_of,reference,notes,created_by,source_table,source_record_id)
      values(gen_random_uuid(),prior.transaction_date,'reversal',prior.from_account_id,prior.to_account_id,prior.amount,prior.fee,prior.id,'Deleted petty cash: '||(p_row->>'id'),'Source record deleted; original retained.',actor,p_table,p_row->>'id');
    end if;
    return;
  end if;
  select coalesce(s.name,p_row->>'store_id') into branch_name from public.stores s where s.id::text=p_row->>'store_id';
  branch_name := coalesce(branch_name,p_row->>'store_id');
  insert into public.finance_cash_accounts(name,kind,petty_store_id,created_by)
    values('Petty Cash - '||branch_name||' ['||(p_row->>'store_id')||']','cash',p_row->>'store_id',actor)
    on conflict (petty_store_id) do nothing;
  select id into branch_account from public.finance_cash_accounts where petty_store_id=p_row->>'store_id';
  if p_table='finance_petty_cash_funds' then
    v_amount := (p_row->>'amount')::numeric; v_date := (p_row->>'fund_date')::date;
    v_source := trim(coalesce(nullif(p_row->>'source_of_fund',''),'CASH SALES'));
    v_kind := 'inflow';
    if upper(v_source)<>'CASH SALES' then
      -- Reuse the named treasury source rather than creating a second wallet/bank.
      insert into public.finance_cash_accounts(name,kind,created_by)
      values(v_source,case when v_source ilike '%gcash%' or v_source ilike '%pay%' then 'wallet' when v_source ilike '%cash%' then 'cash' else 'bank' end,actor)
      on conflict do nothing;
      select id into source_account from public.finance_cash_accounts where lower(trim(name))=lower(v_source) and petty_store_id is null;
      if source_account is null then raise exception 'Select a bank, wallet, or general cash source'; end if;
      v_kind := 'transfer';
    end if;
  else
    v_amount := (p_row->>'total')::numeric; v_date := (p_row->>'expense_date')::date; v_kind := 'outflow';
  end if;
  if v_amount<0 then raise exception 'Petty cash amount cannot be negative'; end if;
  if prior.id is not null and prior.amount=v_amount and prior.transaction_date=v_date and prior.kind=v_kind
    and prior.from_account_id is not distinct from (case when v_kind='outflow' then branch_account else source_account end)
    and prior.to_account_id is not distinct from (case when v_kind='outflow' then null::uuid else branch_account end)
    and prior.notes is not distinct from coalesce(p_row->>'particular',p_row->>'description') then return; end if;
  if prior.id is not null then
    insert into public.finance_cash_transactions(request_id,transaction_date,kind,from_account_id,to_account_id,amount,fee,reversal_of,reference,notes,created_by,source_table,source_record_id)
    values(gen_random_uuid(),prior.transaction_date,'reversal',prior.from_account_id,prior.to_account_id,prior.amount,prior.fee,prior.id,'Updated petty cash: '||(p_row->>'id'),'Source record corrected; original retained.',actor,p_table,p_row->>'id');
  end if;
  if v_amount=0 then return; end if;
  insert into public.finance_cash_transactions(request_id,transaction_date,kind,from_account_id,to_account_id,amount,reference,notes,created_by,source_table,source_record_id)
  values(gen_random_uuid(),v_date,v_kind,case when v_kind='outflow' then branch_account else source_account end,
    case when v_kind='outflow' then null::uuid else branch_account end,v_amount,'Petty cash: '||(p_row->>'id'),
    coalesce(p_row->>'particular',p_row->>'description'),actor,p_table,p_row->>'id');
end $$;
revoke all on function public.finance_sync_petty_cash_row(text,jsonb,boolean) from public,anon,authenticated;

create function public.finance_petty_cash_ledger_trigger() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  perform public.finance_sync_petty_cash_row(TG_TABLE_NAME,case when TG_OP='DELETE' then to_jsonb(OLD) else to_jsonb(NEW) end,TG_OP='DELETE');
  return null;
end $$;
revoke all on function public.finance_petty_cash_ledger_trigger() from public,anon,authenticated;
create trigger finance_petty_cash_ledger after insert or update or delete on public.finance_petty_cash_funds
  for each row execute function public.finance_petty_cash_ledger_trigger();
create trigger finance_petty_cash_ledger after insert or update or delete on public.finance_petty_cash_entries
  for each row execute function public.finance_petty_cash_ledger_trigger();

-- Prevent manual ledger corrections from drifting away from the petty-cash record.
create function public.finance_guard_petty_cash_posting() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if NEW.source_table is null then
    if exists(select 1 from public.finance_cash_accounts where petty_store_id is not null and id in (NEW.from_account_id,NEW.to_account_id))
      or exists(select 1 from public.finance_cash_transactions where id=NEW.reversal_of and source_table is not null) then
      raise exception 'Record or correct this movement in Finance Expenses > Petty Cash';
    end if;
  end if;
  return NEW;
end $$;
revoke all on function public.finance_guard_petty_cash_posting() from public,anon,authenticated;
create trigger finance_guard_petty_cash_posting before insert on public.finance_cash_transactions
  for each row execute function public.finance_guard_petty_cash_posting();

-- Lock both source tables so historical imports and subsequent writes cannot race.
lock table public.finance_petty_cash_funds, public.finance_petty_cash_entries in share row exclusive mode;
do $$ declare r record; begin
  for r in select to_jsonb(f) payload from public.finance_petty_cash_funds f order by fund_date,id loop
    perform public.finance_sync_petty_cash_row('finance_petty_cash_funds',r.payload);
  end loop;
  for r in select to_jsonb(e) payload from public.finance_petty_cash_entries e order by expense_date,id loop
    perform public.finance_sync_petty_cash_row('finance_petty_cash_entries',r.payload);
  end loop;
end $$;
notify pgrst,'reload schema';
commit;
