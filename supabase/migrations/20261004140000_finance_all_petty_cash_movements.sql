begin;
alter table public.finance_petty_cash_funds drop constraint finance_petty_cash_funds_remittance_transaction_id_key;
create unique index finance_petty_movement_branch on public.finance_petty_cash_funds(remittance_transaction_id,store_id);
create or replace function public.finance_protect_remittance_fund() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare t public.finance_cash_transactions; expected numeric;
begin
 if TG_OP<>'INSERT' then
  if OLD.remittance_transaction_id is not null or (TG_OP='UPDATE' and NEW.remittance_transaction_id is not null) then raise exception 'Correct this movement through the Cash Ledger'; end if;
  if TG_OP='DELETE' then return OLD; else return NEW; end if;
 end if;
 if NEW.remittance_transaction_id is null then return NEW; end if;
 select * into t from public.finance_cash_transactions where id=NEW.remittance_transaction_id;
 select sum(value) into expected from (
 select a.petty_store_id branch,(t.amount-t.fee) value from public.finance_cash_accounts a where a.id=t.to_account_id
 union all select a.petty_store_id,-t.amount from public.finance_cash_accounts a where a.id=t.from_account_id
 ) legs where legs.branch=NEW.store_id;
 expected:=expected*(case when t.kind='reversal' then -1 else 1 end);
 if expected is null or NEW.fund_date is distinct from t.transaction_date or NEW.amount is distinct from expected or t.source_table is not null then raise exception 'Invalid petty cash movement link'; end if;
 return NEW;
end $$;
create or replace function public.finance_petty_cash_ledger_trigger() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if TG_TABLE_NAME='finance_petty_cash_funds' and coalesce(to_jsonb(NEW),to_jsonb(OLD))->>'remittance_transaction_id' is not null then return null; end if;
 perform public.finance_sync_petty_cash_row(TG_TABLE_NAME,case when TG_OP='DELETE' then to_jsonb(OLD) else to_jsonb(NEW) end,TG_OP='DELETE');
 return null;
end $$;

create or replace function public.finance_guard_petty_cash_posting() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if NEW.source_table is null and exists(select 1 from public.finance_cash_transactions where id=NEW.reversal_of and source_table is not null) then
  raise exception 'Correct this movement in its originating Petty Cash or Payments record';
 end if;
 return NEW;
end $$;
create or replace function public.finance_remittance_petty_cash_trigger() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare leg record; channel text;
begin
 if NEW.source_table is not null then return null; end if;
 select r.channel into channel from public.finance_cash_receivables r where id=NEW.receivable_id;
 for leg in
 select a.petty_store_id branch,sum(value)*(case when NEW.kind='reversal' then -1 else 1 end) amount from (
 select NEW.to_account_id account_id,NEW.amount-NEW.fee value where NEW.to_account_id is not null
 union all select NEW.from_account_id,-NEW.amount where NEW.from_account_id is not null
 ) legs join public.finance_cash_accounts a on a.id=legs.account_id where a.petty_store_id is not null group by a.petty_store_id
 loop
  insert into public.finance_petty_cash_funds(id,store_id,fund_date,source_of_fund,particular,amount,created_by,remittance_transaction_id)
  values('movement_'||NEW.id::text||'_'||leg.branch,leg.branch,NEW.transaction_date,
   case when channel is not null then 'REMITTANCE - '||channel when leg.amount<0 then 'CASH MOVEMENT OUT' else 'CASH MOVEMENT IN' end,
   NEW.reference,leg.amount,NEW.created_by,NEW.id);
 end loop;
 return null;
end $$;
revoke all on function public.finance_protect_remittance_fund(),public.finance_remittance_petty_cash_trigger() from public,anon,authenticated;
notify pgrst,'reload schema';
insert into public.finance_cash_accounts(name,kind,petty_store_id,created_by)
 select 'Petty Cash - '||coalesce(s.name,s.id::text)||' ['||s.id::text||']','cash',s.id::text,
 (select id from public.profiles where lower(role) in ('admin','super_admin') order by id limit 1)
 from public.stores s on conflict(petty_store_id) do nothing;
commit;
