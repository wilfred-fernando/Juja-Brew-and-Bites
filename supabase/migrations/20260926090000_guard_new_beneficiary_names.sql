begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function public.beneficiary_name_identity(p_name text)
returns text language sql immutable set search_path = public as $$
  select string_agg(word, ' ' order by word)
  from regexp_split_to_table(trim(regexp_replace(lower(coalesce(p_name, '')), '[^[:alnum:]]+', ' ', 'g')), '\s+') word
  where word <> '';
$$;

create or replace function public.guard_new_beneficiary_name()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  name_key text := public.beneficiary_name_identity(new.full_name);
  existing public.pos_discount_beneficiaries;
begin
  perform pg_advisory_xact_lock(hashtextextended('beneficiary-name:' || coalesce(name_key, ''), 0));
  select b.* into existing from public.pos_discount_beneficiaries b
  where b.id <> new.id
    and public.beneficiary_name_identity(b.full_name) = name_key
    and (b.beneficiary_type = new.beneficiary_type or
      (b.beneficiary_type in ('pwd','senior_citizen') and new.beneficiary_type in ('pwd','senior_citizen')))
    -- Allow the existing RPC to reuse the exact same type/ID through its upsert.
    and not (b.beneficiary_type = new.beneficiary_type and b.normalized_id_number = upper(regexp_replace(new.id_number, '[^A-Za-z0-9]', '', 'g')))
  limit 1;
  if found then
    raise exception using errcode = '23505', message = format(
      'Beneficiary %s is already saved as %s, ID %s. Select the saved record or ask Admin to correct its details.',
      existing.full_name, existing.beneficiary_type, existing.id_number);
  end if;
  return new;
end;
$$;
revoke all on function public.guard_new_beneficiary_name() from public;
drop trigger if exists trg_beneficiaries_01_guard_new_name on public.pos_discount_beneficiaries;
create trigger trg_beneficiaries_01_guard_new_name before insert on public.pos_discount_beneficiaries
for each row execute function public.guard_new_beneficiary_name();
commit;
