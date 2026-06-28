-- Fill receipt/report customer names from already-linked loyalty members.
-- This keeps historical linked receipts from displaying as Walk-in when
-- older POS rows only saved customer_id / loyalty_member_id.

update public.orders as o
set customer_name = lm.customer_name
from public.loyalty_members as lm
where lm.customer_name is not null
  and trim(lm.customer_name) <> ''
  and (
    o.loyalty_member_id = lm.id
    or o.customer_id = lm.id::text
  )
  and (
    o.customer_name is null
    or trim(o.customer_name) = ''
    or lower(trim(o.customer_name)) in ('walk-in', 'walk in')
  );
