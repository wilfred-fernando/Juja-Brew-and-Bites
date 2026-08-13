begin;

alter table public.paymongo_payments
  add column if not exists paid_at_manila text;

create or replace function public.sync_paymongo_paid_at_manila()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.paid_at_manila = case
    when new.paid_at is null then null
    else to_char(new.paid_at at time zone 'Asia/Manila', 'YYYY-Mon-DD HH12:MI:SS AM') || ' Asia/Manila'
  end;
  return new;
end;
$$;

drop trigger if exists sync_paymongo_paid_at_manila on public.paymongo_payments;
create trigger sync_paymongo_paid_at_manila
before insert or update of paid_at on public.paymongo_payments
for each row execute function public.sync_paymongo_paid_at_manila();

update public.paymongo_payments
set paid_at_manila = case
  when paid_at is null then null
  else to_char(paid_at at time zone 'Asia/Manila', 'YYYY-Mon-DD HH12:MI:SS AM') || ' Asia/Manila'
end;

comment on column public.paymongo_payments.paid_at is
  'Canonical PayMongo payment instant stored as timestamptz (UTC internally).';

comment on column public.paymongo_payments.paid_at_manila is
  'Operations display of paid_at converted to Asia/Manila by database trigger.';

commit;
