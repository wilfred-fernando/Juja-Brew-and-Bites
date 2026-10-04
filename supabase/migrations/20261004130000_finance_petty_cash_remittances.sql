begin;
alter table public.finance_petty_cash_funds add column remittance_transaction_id uuid unique references public.finance_cash_transactions(id);

create function public.finance_protect_remittance_fund() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare t public.finance_cash_transactions; a public.finance_cash_accounts; original public.finance_cash_transactions;
begin
 if TG_OP<>'INSERT' then
  if OLD.remittance_transaction_id is not null or (TG_OP='UPDATE' and NEW.remittance_transaction_id is not null) then
   raise exception 'Correct this remittance through the Cash Ledger';
  end if;
  if TG_OP='DELETE' then return OLD; else return NEW; end if;
 end if;
 if NEW.remittance_transaction_id is null then return NEW; end if;
 select * into t from public.finance_cash_transactions where id=NEW.remittance_transaction_id;
 select * into a from public.finance_cash_accounts where id=t.to_account_id;
 if t.kind='reversal' then select * into original from public.finance_cash_transactions where id=t.reversal_of; end if;
 if a.petty_store_id is null or (t.kind<>'collection' and coalesce(original.kind,'')<>'collection')
  or NEW.store_id is distinct from a.petty_store_id or NEW.fund_date is distinct from t.transaction_date
  or NEW.amount is distinct from (case when t.kind='reversal' then -1 else 1 end)*(t.amount-t.fee) then
  raise exception 'Invalid petty cash remittance link';
 end if;
 return NEW;
end $$;
create trigger finance_protect_remittance_fund before insert or update or delete on public.finance_petty_cash_funds
for each row execute function public.finance_protect_remittance_fund();

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
 if NEW.source_table is null then
  if NEW.from_account_id is null and NEW.receivable_id is not null and
   (NEW.kind='collection' or (NEW.kind='reversal' and exists(select 1 from public.finance_cash_transactions where id=NEW.reversal_of and kind='collection' and source_table is null))) then return NEW; end if;
  if exists(select 1 from public.finance_cash_transactions where id=NEW.reversal_of and source_table='finance_cash_payment_queue') then raise exception 'Correct clearance through the Payments queue'; end if;
  if exists(select 1 from public.finance_cash_accounts where petty_store_id is not null and id in (NEW.from_account_id,NEW.to_account_id))
   or exists(select 1 from public.finance_cash_transactions where id=NEW.reversal_of and source_table is not null) then raise exception 'Record or correct this movement in Finance Expenses > Petty Cash'; end if;
 end if;
 return NEW;
end $$;

create function public.finance_remittance_petty_cash_trigger() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare branch text; channel text; original public.finance_cash_transactions;
begin
 select petty_store_id into branch from public.finance_cash_accounts where id=NEW.to_account_id;
 if branch is null then return null; end if;
 if NEW.kind='reversal' then select * into original from public.finance_cash_transactions where id=NEW.reversal_of; end if;
 if NEW.kind<>'collection' and coalesce(original.kind,'')<>'collection' then return null; end if;
 select r.channel into channel from public.finance_cash_receivables r where id=NEW.receivable_id;
 insert into public.finance_petty_cash_funds(id,store_id,fund_date,source_of_fund,particular,amount,created_by,remittance_transaction_id)
 values('remittance_'||NEW.id::text,branch,NEW.transaction_date,'REMITTANCE - '||coalesce(channel,'Non-cash'),NEW.reference,
 (case when NEW.kind='reversal' then -1 else 1 end)*(NEW.amount-NEW.fee),NEW.created_by,NEW.id);
 return null;
end $$;
create trigger finance_remittance_petty_cash after insert on public.finance_cash_transactions
for each row execute function public.finance_remittance_petty_cash_trigger();
revoke all on function public.finance_protect_remittance_fund(),public.finance_remittance_petty_cash_trigger() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
