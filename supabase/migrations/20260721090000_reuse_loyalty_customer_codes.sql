create or replace function public.next_loyalty_customer_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code_year text := to_char(now() at time zone 'Asia/Manila', 'YYYY');
  v_next_number bigint;
begin
  perform pg_advisory_xact_lock(hashtext('loyalty_customer_code_gap_reuse'));

  with used_numbers as (
    select substring(customer_code from '^JUJA[0-9]{4}([0-9]{6})$')::bigint as n
    from public.loyalty_members
    where customer_code ~ '^JUJA[0-9]{10}$'
  ),
  candidate_numbers as (
    select generate_series(
      1,
      greatest(1, (select coalesce(max(n), 0) + 1 from used_numbers))
    ) as n
  )
  select candidate_numbers.n
  into v_next_number
  from candidate_numbers
  left join used_numbers on used_numbers.n = candidate_numbers.n
  where used_numbers.n is null
  order by candidate_numbers.n
  limit 1;

  return 'JUJA' || v_code_year || lpad(coalesce(v_next_number, 1)::text, 6, '0');
end;
$$;

create or replace function public.generate_loyalty_customer_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.customer_code is null or btrim(new.customer_code) = '' then
    new.customer_code := public.next_loyalty_customer_code();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_generate_loyalty_customer_code on public.loyalty_members;
create trigger trg_generate_loyalty_customer_code
before insert or update of customer_code on public.loyalty_members
for each row
execute function public.generate_loyalty_customer_code();

do $$
declare
  v_member record;
begin
  for v_member in
    select id
    from public.loyalty_members
    where customer_code is null or btrim(customer_code) = ''
    order by id
  loop
    update public.loyalty_members
    set customer_code = public.next_loyalty_customer_code()
    where id = v_member.id
      and (customer_code is null or btrim(customer_code) = '');
  end loop;
end $$;
