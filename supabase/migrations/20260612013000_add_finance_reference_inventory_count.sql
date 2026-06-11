-- Add manual inventory count reference fields for finance item references.
-- Example: Item Name = EASY Cheese Sauce 500g, reference_quantity = 500, reference_unit = gram.

begin;

alter table public.finance_references
  add column if not exists reference_quantity numeric(14, 3),
  add column if not exists reference_unit text;

comment on column public.finance_references.reference_quantity is
  'Manual inventory count quantity for item references. Example: 1 pack contains 500 grams.';

comment on column public.finance_references.reference_unit is
  'Manual inventory count unit for item references. Example: gram, kg, ml, liter, pc.';

commit;
