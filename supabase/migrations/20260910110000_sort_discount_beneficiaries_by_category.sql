begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table public.pos_discount_beneficiaries
  add column if not exists beneficiary_category_sort smallint
  generated always as (
    case
      when beneficiary_type = 'senior_citizen' then 1
      when beneficiary_type = 'pwd' then 2
      when beneficiary_type = 'qcid' and residency_status = 'resident' then 3
      when beneficiary_type = 'qcid' and residency_status = 'non_resident' then 4
      else 99
    end
  ) stored;

create index if not exists pos_discount_beneficiaries_category_name_idx
  on public.pos_discount_beneficiaries (beneficiary_category_sort, full_name, id);

notify pgrst, 'reload schema';
commit;
