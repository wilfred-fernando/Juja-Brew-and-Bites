begin;

alter table public.option_group_templates
  add column if not exists hide_public boolean not null default false;

commit;
