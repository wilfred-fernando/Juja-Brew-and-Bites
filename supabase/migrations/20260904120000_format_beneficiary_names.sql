begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function public.format_pos_beneficiary_name(p_name text)
returns text
language sql
immutable
set search_path = public
as $$
  select initcap(lower(trim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'))));
$$;

revoke all on function public.format_pos_beneficiary_name(text) from public;

create or replace function public.normalize_pos_beneficiary_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.full_name := public.format_pos_beneficiary_name(new.full_name);
  return new;
end;
$$;

revoke all on function public.normalize_pos_beneficiary_name() from public;

drop trigger if exists trg_beneficiaries_00_format_name on public.pos_discount_beneficiaries;
create trigger trg_beneficiaries_00_format_name
before insert or update of full_name
on public.pos_discount_beneficiaries
for each row execute function public.normalize_pos_beneficiary_name();

do $$
begin
  if public.format_pos_beneficiary_name('  mARK   lESTER arCE ') <> 'Mark Lester Arce' then
    raise exception 'Beneficiary name formatter verification failed.';
  end if;
end;
$$;

notify pgrst, 'reload schema';
commit;
