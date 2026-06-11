-- Avoid PL/pgSQL output-column ambiguity in generate_receipt_number by using
-- the receipt counter unique constraint instead of ON CONFLICT column names.

create or replace function public.generate_receipt_number(p_store_id uuid)
returns table(receipt_number text, receipt_sequence integer, receipt_date date)
language plpgsql
as $$
declare
  v_code text;
  v_sequence integer;
  v_generated_date date := (now() at time zone 'Asia/Manila')::date;
begin
  select coalesce(nullif(s.store_code, ''), upper(left(regexp_replace(s.name, '[^A-Za-z0-9]', '', 'g'), 3)))
    into v_code
  from public.stores s
  where s.id = p_store_id;

  if v_code is null or v_code = '' then
    raise exception 'Store not found for receipt number generation';
  end if;

  insert into public.receipt_counters (store_id, receipt_date, last_sequence)
  values (p_store_id, v_generated_date, 1)
  on conflict on constraint receipt_counters_store_id_receipt_date_key
  do update
    set last_sequence = public.receipt_counters.last_sequence + 1,
        updated_at = now()
  returning public.receipt_counters.last_sequence into v_sequence;

  generate_receipt_number.receipt_number := v_code || '-' || lpad(v_sequence::text, 4, '0');
  generate_receipt_number.receipt_sequence := v_sequence;
  generate_receipt_number.receipt_date := v_generated_date;
  return next;
end;
$$;

grant execute on function public.generate_receipt_number(uuid) to authenticated;
