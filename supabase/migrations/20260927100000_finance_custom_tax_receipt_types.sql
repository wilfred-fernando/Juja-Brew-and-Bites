begin;
alter table public.finance_references drop constraint if exists finance_references_tax_receipt_name_check;
alter table public.finance_references add constraint finance_references_tax_receipt_name_check
check (ref_type not in ('tax_type', 'receipt_type') or length(trim(name)) > 0);

alter table public.finance_expenses drop constraint if exists finance_expenses_tax_type_check;
alter table public.finance_expenses drop constraint if exists finance_expenses_receipt_type_check;
alter table public.finance_petty_cash_entries drop constraint if exists finance_petty_cash_entries_tax_type_check;
alter table public.finance_petty_cash_entries drop constraint if exists finance_petty_cash_entries_receipt_type_check;

create or replace function public.validate_finance_tax_receipt_types()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare field_name text; field_value text; old_value text;
begin
  foreach field_name in array array['tax_type', 'receipt_type'] loop
    field_value := to_jsonb(NEW)->>field_name;
    if TG_OP = 'UPDATE' then
      old_value := to_jsonb(OLD)->>field_name;
      if field_value is not distinct from old_value then continue; end if;
    end if;
    if field_value is null then continue; end if;
    -- Original values remain valid for older clients and historical records.
    if field_name = 'tax_type' and field_value in ('Non-VAT', 'VAT', 'AR') then continue; end if;
    if field_name = 'receipt_type' and field_value in ('OR', 'SI', 'DR') then continue; end if;
    if length(trim(field_value)) > 0 and exists (
      select 1 from public.finance_references r where r.ref_type = field_name
        and r.name = field_value and r.is_active is not false
    ) then continue; end if;
    raise exception 'Choose an active % from References.', replace(field_name, '_', ' ') using errcode = '23514';
  end loop;
  return NEW;
end;
$$;
revoke all on function public.validate_finance_tax_receipt_types() from public, anon, authenticated;
create trigger validate_finance_tax_receipt_types before insert or update of tax_type, receipt_type on public.finance_expenses
for each row execute function public.validate_finance_tax_receipt_types();
create trigger validate_finance_tax_receipt_types before insert or update of tax_type, receipt_type on public.finance_petty_cash_entries
for each row execute function public.validate_finance_tax_receipt_types();
notify pgrst, 'reload schema';
commit;
