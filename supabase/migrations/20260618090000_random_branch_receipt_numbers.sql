-- Change POS/web receipt numbering to branch-prefixed random labels.
-- Pasong Tamo receipts use P + seven digits; Diliman receipts use D + seven digits.
-- The RPC keeps the same return columns used by the app.

create or replace function public.generate_receipt_number(p_store_id uuid)
returns table(receipt_number text, receipt_sequence integer, receipt_date date)
language plpgsql
as $$
declare
  v_store_name text;
  v_store_code text;
  v_prefix text;
  v_random integer;
  v_generated_number text;
  v_generated_date date := (now() at time zone 'Asia/Manila')::date;
  v_attempt integer := 0;
begin
  select s.name, s.store_code
    into v_store_name, v_store_code
  from public.stores s
  where s.id = p_store_id;

  if v_store_name is null and v_store_code is null then
    raise exception 'Store not found for receipt number generation';
  end if;

  v_prefix := case
    when lower(coalesce(v_store_name, '') || ' ' || coalesce(v_store_code, '')) like '%diliman%' then 'D'
    when upper(left(coalesce(v_store_code, ''), 1)) = 'D' then 'D'
    else 'P'
  end;

  loop
    v_attempt := v_attempt + 1;
    v_random := floor(random() * 10000000)::integer;
    v_generated_number := v_prefix || lpad(v_random::text, 7, '0');

    exit when not exists (
      select 1 from public.orders o where o.receipt_number = v_generated_number
    ) and not exists (
      select 1 from public.web_orders w where w.receipt_number = v_generated_number
    );

    if v_attempt >= 50 then
      raise exception 'Unable to generate a unique receipt number after % attempts', v_attempt;
    end if;
  end loop;

  generate_receipt_number.receipt_number := v_generated_number;
  generate_receipt_number.receipt_sequence := v_random;
  generate_receipt_number.receipt_date := v_generated_date;
  return next;
end;
$$;

grant execute on function public.generate_receipt_number(uuid) to authenticated;
