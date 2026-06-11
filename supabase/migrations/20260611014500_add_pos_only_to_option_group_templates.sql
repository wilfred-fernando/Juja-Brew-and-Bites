begin;

alter table public.option_group_templates
  add column if not exists pos_only boolean not null default false;

commit;
