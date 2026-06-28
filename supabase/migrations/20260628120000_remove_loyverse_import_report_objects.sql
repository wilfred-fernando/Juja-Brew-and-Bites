begin;

-- Remove obsolete report/import helpers after the Loyverse import tables were retired.
-- This migration intentionally does not drop production sales tables or order data.

drop view if exists public.loyverse_customer_points_preview cascade;
drop view if exists public.loyverse_migration_validation_report cascade;

do $$
begin
  if to_regclass('public.imported_sales_receipts') is not null then
    drop trigger if exists set_imported_sales_receipt_contacts on public.imported_sales_receipts;
  end if;
end $$;

drop function if exists public.get_imported_item_sales_report(date, date) cascade;
drop function if exists public.get_imported_category_sales_report(date, date) cascade;
drop function if exists public.get_imported_modifier_sales_report(date, date) cascade;
drop function if exists public.refresh_imported_sales_tables() cascade;
drop function if exists public.set_imported_sales_receipt_contacts() cascade;
drop function if exists public.imported_sales_year_table_exists(text, integer) cascade;
drop function if exists public.ensure_imported_sales_year_tables(integer) cascade;
drop function if exists public.refresh_imported_sales_year_tables() cascade;

drop function if exists public.refresh_loyverse_sales_staging() cascade;
drop function if exists public.migrate_loyverse_staged_orders(uuid, boolean) cascade;
drop function if exists public.rollback_loyverse_migration(uuid) cascade;
drop function if exists public.loyverse_normalize_text(text) cascade;
drop function if exists public.loyverse_digits(text) cascade;
drop function if exists public.loyverse_email_from_contacts(text) cascade;

commit;
