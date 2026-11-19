begin;
set local lock_timeout = '5s';

update public.pos_discounts
set promotion_rules = coalesce(promotion_rules, '{}'::jsonb) || '{"weekdays":[1,2,3]}'::jsonb
where lower(trim(name)) = 'qcid promo' or promotion_rules->>'beneficiary_type' = 'qcid';

-- Validate actual redemption time, including completion of a previously reserved claim.
create or replace function public.guard_qcid_redemption_weekday()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if extract(isodow from (now() at time zone 'Asia/Manila')) not in (1,2,3)
    and exists (select 1 from public.pos_discount_beneficiaries where id = new.beneficiary_id and beneficiary_type = 'qcid') then
    raise exception 'QCID Promo can only be redeemed Monday to Wednesday (Manila time).';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_qcid_redemption_weekday() from public;
drop trigger if exists guard_qcid_redemption_weekday on public.pos_discount_redemptions;
create trigger guard_qcid_redemption_weekday before insert or update of status on public.pos_discount_redemptions
for each row execute function public.guard_qcid_redemption_weekday();
commit;
