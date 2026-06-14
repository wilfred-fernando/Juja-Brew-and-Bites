begin;

create sequence if not exists public.loyalty_customer_code_seq;

select setval(
  'public.loyalty_customer_code_seq',
  greatest(
    coalesce((
      select max((substring(customer_code from '^JUJA[0-9]{4}([0-9]{6})$'))::bigint)
      from public.loyalty_members
      where customer_code ~ '^JUJA[0-9]{10}$'
    ), 0),
    0
  ),
  true
);

create or replace function public.generate_loyalty_customer_code()
returns trigger
language plpgsql
as $$
begin
  if new.customer_code is null or btrim(new.customer_code) = '' then
    new.customer_code :=
      'JUJA'
      || to_char(now() at time zone 'Asia/Manila', 'YYYY')
      || lpad(nextval('public.loyalty_customer_code_seq')::text, 6, '0');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_generate_loyalty_customer_code on public.loyalty_members;
create trigger trg_generate_loyalty_customer_code
before insert on public.loyalty_members
for each row
execute function public.generate_loyalty_customer_code();

notify pgrst, 'reload schema';

commit;
