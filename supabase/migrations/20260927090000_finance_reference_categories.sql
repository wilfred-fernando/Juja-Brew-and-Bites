begin;
alter table public.finance_expenses drop constraint if exists finance_expenses_category_check;
alter table public.finance_expenses add constraint finance_expenses_category_check check (length(trim(category)) > 0);
alter table public.finance_petty_cash_entries drop constraint if exists finance_petty_cash_entries_category_check;
alter table public.finance_petty_cash_entries add constraint finance_petty_cash_entries_category_check check (length(trim(category)) > 0);

create or replace function public.validate_finance_expense_category()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  -- Preserve historical categories when editing unrelated expense fields.
  if TG_OP = 'UPDATE' and NEW.category is not distinct from OLD.category then return NEW; end if;
  if NEW.category in ('OP-EX', 'PERSONAL', 'WILFERN') then return NEW; end if;
  if exists (
    select 1 from public.finance_references r
    where r.ref_type = 'category' and r.name = NEW.category and r.is_active is not false
  ) then return NEW; end if;
  raise exception 'Choose an active expense category from References.' using errcode = '23514';
end;
$$;
revoke all on function public.validate_finance_expense_category() from public, anon, authenticated;
drop trigger if exists validate_finance_expense_category on public.finance_expenses;
create trigger validate_finance_expense_category before insert or update of category on public.finance_expenses
for each row execute function public.validate_finance_expense_category();
drop trigger if exists validate_finance_expense_category on public.finance_petty_cash_entries;
create trigger validate_finance_expense_category before insert or update of category on public.finance_petty_cash_entries
for each row execute function public.validate_finance_expense_category();
notify pgrst, 'reload schema';
commit;
