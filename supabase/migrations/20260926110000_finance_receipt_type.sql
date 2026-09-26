begin;
alter table public.finance_expenses
  add column receipt_type text check (receipt_type in ('OR', 'SI', 'DR'));
alter table public.finance_petty_cash_entries
  add column receipt_type text check (receipt_type in ('OR', 'SI', 'DR'));
-- Existing receipt types are unknown. Include the new field in mirrored rows.
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
