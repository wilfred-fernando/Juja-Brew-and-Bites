alter table public.finance_references
  add column if not exists supplier_company_name text,
  add column if not exists supplier_city_address text,
  add column if not exists supplier_tin_number text;

comment on column public.finance_references.supplier_company_name is
  'Supplier reference company name used for finance expense supplier records.';

comment on column public.finance_references.supplier_city_address is
  'Supplier reference city address used for finance expense supplier records.';

comment on column public.finance_references.supplier_tin_number is
  'Supplier reference TIN number used for finance expense supplier records.';
