begin;
alter table public.finance_references drop constraint if exists finance_references_ref_type_check;
alter table public.finance_references add constraint finance_references_ref_type_check
check (ref_type in ('item', 'item_category', 'supplier', 'payment_type', 'unit', 'category', 'fund_source', 'tax_type', 'receipt_type'));
alter table public.finance_references add constraint finance_references_tax_receipt_name_check
check ((ref_type <> 'tax_type' or name in ('Non-VAT', 'VAT', 'AR'))
  and (ref_type <> 'receipt_type' or name in ('OR', 'SI', 'DR')));
insert into public.finance_references(id, ref_type, name)
select 'fin_ref_' || gen_random_uuid()::text, v.ref_type, v.name
from (values ('tax_type', 'Non-VAT'), ('tax_type', 'VAT'), ('tax_type', 'AR'),
  ('receipt_type', 'OR'), ('receipt_type', 'SI'), ('receipt_type', 'DR')) v(ref_type, name)
where not exists (select 1 from public.finance_references r where r.ref_type = v.ref_type and r.name = v.name);
notify pgrst, 'reload schema';
commit;
