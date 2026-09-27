-- Preserve three-decimal expense quantities in both ledgers.
alter table public.finance_expenses
  alter column quantity type numeric(13, 3);
alter table public.finance_petty_cash_entries
  alter column quantity type numeric(13, 3);
