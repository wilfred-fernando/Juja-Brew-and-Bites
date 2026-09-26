begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
create or replace function public.enforce_five_digit_beneficiary_id()
returns trigger language plpgsql set search_path = public as $$
begin
  -- Existing unresolved IDs may remain until Admin supplies the correct number.
  if TG_OP = 'UPDATE' then
    if new.id_number is not distinct from old.id_number and new.beneficiary_type is not distinct from old.beneficiary_type then
      return new;
    end if;
  end if;
  if new.beneficiary_type in ('pwd', 'senior_citizen') and new.id_number !~ '^[0-9]{5}$' then
    raise exception 'SC/PWD ID must contain exactly 5 digits, including leading zeros.' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_beneficiaries_00_five_digit_id on public.pos_discount_beneficiaries;
create trigger trg_beneficiaries_00_five_digit_id before insert or update of id_number, beneficiary_type
on public.pos_discount_beneficiaries for each row execute function public.enforce_five_digit_beneficiary_id();
commit;
