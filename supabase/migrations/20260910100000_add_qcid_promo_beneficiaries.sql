begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

update public.pos_discounts
set requires_discount_beneficiary = true,
    scope = 'item'
where lower(trim(coalesce(name, ''))) = 'qcid promo';

alter table public.pos_discount_beneficiaries
  add column if not exists residency_status text;

alter table public.pos_discount_beneficiaries
  drop constraint if exists pos_discount_beneficiaries_beneficiary_type_check;
alter table public.pos_discount_beneficiaries
  add constraint pos_discount_beneficiaries_beneficiary_type_check
  check (beneficiary_type in ('senior_citizen', 'pwd', 'qcid'));

alter table public.pos_discount_beneficiaries
  drop constraint if exists pos_discount_beneficiaries_residency_status_check;
alter table public.pos_discount_beneficiaries
  add constraint pos_discount_beneficiaries_residency_status_check
  check (coalesce(
    (beneficiary_type in ('senior_citizen', 'pwd') and residency_status is null)
    or (beneficiary_type = 'qcid' and residency_status in ('resident', 'non_resident')),
    false
  ));

alter table public.pos_discount_redemptions
  add column if not exists beneficiary_residency_status text;
alter table public.pos_discount_redemptions
  drop constraint if exists pos_discount_redemptions_residency_status_check;
alter table public.pos_discount_redemptions
  add constraint pos_discount_redemptions_residency_status_check
  check (beneficiary_residency_status is null or beneficiary_residency_status in ('resident', 'non_resident'));

drop function if exists public.save_pos_discount_beneficiary(text, text, text);
drop function if exists public.save_pos_discount_beneficiary(text, text, text, text);
create function public.save_pos_discount_beneficiary(
  p_beneficiary_type text,
  p_full_name text,
  p_id_number text,
  p_residency_status text default null
)
returns public.pos_discount_beneficiaries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text := lower(trim(coalesce(p_beneficiary_type, '')));
  v_residency text := nullif(lower(trim(coalesce(p_residency_status, ''))), '');
  v_name text := trim(regexp_replace(coalesce(p_full_name, ''), '\s+', ' ', 'g'));
  v_id_number text := trim(coalesce(p_id_number, ''));
  v_normalized text := upper(regexp_replace(coalesce(p_id_number, ''), '[^A-Za-z0-9]', '', 'g'));
  v_row public.pos_discount_beneficiaries;
begin
  if not public.pos_discount_staff_allowed() then
    raise exception 'Only authorized POS staff can manage discount beneficiaries.';
  end if;
  if v_type not in ('senior_citizen', 'pwd', 'qcid') then
    raise exception 'Select Senior Citizen, PWD, or QCID.';
  end if;
  if v_type = 'qcid' and not coalesce(v_residency in ('resident', 'non_resident'), false) then
    raise exception 'Select whether the QCID customer is a Quezon City resident or non-resident.';
  end if;
  if v_type <> 'qcid' then
    v_residency := null;
  end if;
  if length(v_name) < 3 then
    raise exception 'Full name is required.';
  end if;
  if length(v_normalized) < 3 then
    raise exception 'A valid ID number is required.';
  end if;

  insert into public.pos_discount_beneficiaries (
    beneficiary_type, full_name, id_number, normalized_id_number,
    residency_status, created_by
  ) values (
    v_type, v_name, v_id_number, v_normalized,
    v_residency, auth.uid()
  )
  on conflict (beneficiary_type, normalized_id_number) do update
    set full_name = excluded.full_name,
        id_number = excluded.id_number,
        residency_status = excluded.residency_status,
        is_active = true,
        updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.reserve_pos_discount_claims(
  p_claim_key uuid,
  p_store_id uuid,
  p_claims jsonb
)
returns setof public.pos_discount_redemptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim jsonb;
  v_business_date date := (now() at time zone 'Asia/Manila')::date;
  v_group text;
  v_beneficiary_type text;
  v_residency text;
  v_discount_name text;
  v_discount_requires_beneficiary boolean;
begin
  if not public.pos_discount_staff_allowed() then
    raise exception 'Only authorized POS staff can reserve discount claims.';
  end if;
  if p_claim_key is null or jsonb_typeof(p_claims) <> 'array' or jsonb_array_length(p_claims) = 0 then
    raise exception 'Discount claim details are required.';
  end if;

  delete from public.pos_discount_redemptions
  where status = 'reserved' and expires_at < now();

  for v_claim in select value from jsonb_array_elements(p_claims)
  loop
    v_group := lower(trim(coalesce(v_claim->>'entitlement_group', '')));
    if v_group not in ('drink', 'food', 'dessert') then
      raise exception 'Every beneficiary-discounted item must be classified as drink, food, or dessert.';
    end if;

    select b.beneficiary_type, b.residency_status
      into v_beneficiary_type, v_residency
    from public.pos_discount_beneficiaries b
    where b.id = (v_claim->>'beneficiary_id')::uuid
      and b.is_active;
    if not found then
      raise exception 'Select an active discount beneficiary.';
    end if;

    select d.name, d.requires_discount_beneficiary
      into v_discount_name, v_discount_requires_beneficiary
    from public.pos_discounts d
    where d.id = nullif(v_claim->>'discount_id', '')::uuid
      and d.is_active;
    if not found or not coalesce(v_discount_requires_beneficiary, false) then
      raise exception 'Select an active beneficiary-controlled discount.';
    end if;

    if lower(trim(coalesce(v_discount_name, ''))) = 'qcid promo' then
      if v_beneficiary_type <> 'qcid' or not coalesce(v_residency in ('resident', 'non_resident'), false) then
        raise exception 'QCID Promo requires a QCID name, ID number, and resident or non-resident selection.';
      end if;
    elsif v_beneficiary_type = 'qcid' then
      raise exception 'A QCID beneficiary can only be used with QCID Promo.';
    end if;

    insert into public.pos_discount_redemptions (
      beneficiary_id, discount_id, business_date, entitlement_group,
      beneficiary_residency_status, store_id, claim_key, status,
      expires_at, created_by
    ) values (
      (v_claim->>'beneficiary_id')::uuid,
      nullif(v_claim->>'discount_id', '')::uuid,
      v_business_date,
      v_group,
      v_residency,
      p_store_id,
      p_claim_key,
      'reserved',
      now() + interval '10 minutes',
      auth.uid()
    );
  end loop;

  return query
    select r.* from public.pos_discount_redemptions r
    where r.claim_key = p_claim_key
    order by r.created_at;
exception
  when unique_violation then
    delete from public.pos_discount_redemptions
    where claim_key = p_claim_key and status = 'reserved';
    raise exception 'This beneficiary already used the selected drink, food, or dessert entitlement today.';
end;
$$;

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
        case v_existing_type when 'pwd' then 'PWD' when 'qcid' then 'QCID' else 'SC' end);
  end if;
  return new;
end;
$$;

revoke all on function public.save_pos_discount_beneficiary(text, text, text, text) from public;
grant execute on function public.save_pos_discount_beneficiary(text, text, text, text) to authenticated;
revoke all on function public.reserve_pos_discount_claims(uuid, uuid, jsonb) from public;
grant execute on function public.reserve_pos_discount_claims(uuid, uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;
