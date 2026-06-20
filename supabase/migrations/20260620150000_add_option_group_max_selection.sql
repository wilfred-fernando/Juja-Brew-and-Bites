begin;

alter table public.option_group_templates
  add column if not exists max_selection integer;

alter table public.option_group_templates
  drop constraint if exists option_group_templates_max_selection_check;

alter table public.option_group_templates
  add constraint option_group_templates_max_selection_check
  check (max_selection is null or max_selection >= 1);

comment on column public.option_group_templates.max_selection is
  'Optional maximum number of options allowed when this option group is multi-select. Null means unlimited.';

commit;
