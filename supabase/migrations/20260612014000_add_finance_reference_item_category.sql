-- Add Item Category support to finance references.
-- `category` remains the expense accounting category; `item_category` is for inventory/item grouping.

begin;

alter table public.finance_references
  add column if not exists item_category text;

alter table public.finance_references
  drop constraint if exists finance_references_ref_type_check;

alter table public.finance_references
  add constraint finance_references_ref_type_check
  check (ref_type in ('item', 'item_category', 'supplier', 'payment_type', 'unit', 'category', 'fund_source'));

commit;
