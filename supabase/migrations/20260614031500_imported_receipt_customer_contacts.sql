create extension if not exists pg_trgm with schema extensions;

alter table public.imported_sales_receipts
add column if not exists customer_contacts text;

create or replace function public.set_imported_sales_receipt_contacts()
returns trigger
language plpgsql
as $$
begin
  select string_agg(distinct nullif(trim(s.customer_contacts), ''), ', ' order by nullif(trim(s.customer_contacts), ''))
  into new.customer_contacts
  from public.imported_sales s
  where s.receipt_day is not distinct from new.receipt_day
    and s.receipt_number is not distinct from new.receipt_number
    and s.store_name is not distinct from new.store_name;

  return new;
end;
$$;

drop trigger if exists set_imported_sales_receipt_contacts on public.imported_sales_receipts;
create trigger set_imported_sales_receipt_contacts
before insert or update of receipt_day, receipt_number, store_name
on public.imported_sales_receipts
for each row
execute function public.set_imported_sales_receipt_contacts();

update public.imported_sales_receipts r
set customer_contacts = contacts.customer_contacts
from (
  select
    receipt_day,
    receipt_number,
    store_name,
    string_agg(distinct nullif(trim(customer_contacts), ''), ', ' order by nullif(trim(customer_contacts), '')) as customer_contacts
  from public.imported_sales
  group by receipt_day, receipt_number, store_name
) contacts
where r.receipt_day is not distinct from contacts.receipt_day
  and r.receipt_number is not distinct from contacts.receipt_number
  and r.store_name is not distinct from contacts.store_name;

create index if not exists idx_imported_sales_receipts_contacts
on public.imported_sales_receipts using gin (customer_contacts extensions.gin_trgm_ops);
