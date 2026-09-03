begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Keep the existing per-type ID constraint: SC and PWD issuers may reuse an ID
-- number for different people. Reject the same name AND ID across both types.
-- Existing duplicates are retained for an administrator to reconcile safely.
create or replace function public.prevent_cross_type_beneficiary_duplicate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := lower(trim(regexp_replace(coalesce(new.full_name, ''), '\s+', ' ', 'g')));
  v_id text := upper(regexp_replace(coalesce(new.id_number, ''), '[^A-Za-z0-9]', '', 'g'));
  v_existing_type text;
begin
  new.normalized_id_number := v_id;
  if not new.is_active then
    return new;
  end if;

  -- Serialize registrations for the same ID so simultaneous SC/PWD saves
  -- cannot both pass the check before either transaction commits.
  perform pg_advisory_xact_lock(hashtextextended(v_id, 0));
  select b.beneficiary_type into v_existing_type
  from public.pos_discount_beneficiaries b
  where b.id <> new.id
    and b.is_active
    and b.beneficiary_type <> new.beneficiary_type
    and b.normalized_id_number = v_id
    and lower(trim(regexp_replace(b.full_name, '\s+', ' ', 'g'))) = v_name
  limit 1;

  if found then
    raise exception using
      errcode = '23505',
      constraint = 'pos_discount_beneficiaries_cross_type_identity',
      message = format('This name and ID are already saved as %s. Select the saved beneficiary or ask an admin to correct the type; do not register it again.',
        case when v_existing_type = 'pwd' then 'PWD' else 'SC' end);
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_cross_type_beneficiary_duplicate() from public;

drop trigger if exists trg_beneficiaries_cross_type_identity on public.pos_discount_beneficiaries;
create trigger trg_beneficiaries_cross_type_identity
before insert or update of full_name, id_number, normalized_id_number, beneficiary_type, is_active
on public.pos_discount_beneficiaries
for each row execute function public.prevent_cross_type_beneficiary_duplicate();

notify pgrst, 'reload schema';
commit;
