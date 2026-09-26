begin;
-- Existing records remain NULL (unclassified); new records default to Non-VAT.
alter table public.finance_expenses
  add column tax_type text check (tax_type in ('Non-VAT', 'VAT', 'AR')),
  add column vatable_sales numeric(12,2) generated always as
    (case when tax_type = 'VAT' then round(total / 1.12, 2) else 0 end) stored,
  add column vat_amount numeric(12,2) generated always as
    (case when tax_type = 'VAT' then total - round(total / 1.12, 2) else 0 end) stored;
alter table public.finance_expenses alter column tax_type set default 'Non-VAT';
alter table public.finance_petty_cash_entries
  add column tax_type text check (tax_type in ('Non-VAT', 'VAT', 'AR')),
  add column vatable_sales numeric(12,2) generated always as
    (case when tax_type = 'VAT' then round(total / 1.12, 2) else 0 end) stored,
  add column vat_amount numeric(12,2) generated always as
    (case when tax_type = 'VAT' then total - round(total / 1.12, 2) else 0 end) stored;
alter table public.finance_petty_cash_entries alter column tax_type set default 'Non-VAT';
-- Refresh existing Cloudflare snapshots with the new classification fields.
do $$
begin
  if to_regclass('public.finance_cloudflare_outbox') is not null then
    insert into public.finance_cloudflare_outbox(source_table, source_id, operation, payload)
    select 'finance_expenses', id::text, 'UPDATE', to_jsonb(e) from public.finance_expenses e;
    insert into public.finance_cloudflare_outbox(source_table, source_id, operation, payload)
    select 'finance_petty_cash_entries', id::text, 'UPDATE', to_jsonb(e) from public.finance_petty_cash_entries e;
  end if;
end;
$$;
notify pgrst, 'reload schema';
commit;
