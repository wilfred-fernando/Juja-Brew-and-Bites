begin;
create table if not exists public.menu_variant_unlink_backup_20261021 as
select id,variants from public.menu_items;
alter table public.menu_variant_unlink_backup_20261021 enable row level security;
revoke all on public.menu_variant_unlink_backup_20261021 from anon,authenticated;

create or replace function public.resolve_menu_option_templates()
returns trigger language plpgsql security definer set search_path=public as $$
declare g jsonb; t public.option_group_templates%rowtype; linked jsonb := '[]';
begin
 if new.variants is null then return new; end if;
 for g in select value from jsonb_array_elements(new.variants) loop
  if coalesce((g->>'isRequired')::boolean,false) or lower(trim(coalesce(g->>'name',''))) in ('variant','variants') then
   linked := linked || jsonb_build_array(g-'templateId');
  else
   select * into t from public.option_group_templates where id::text=g->>'templateId' for share;
   if not found then raise exception 'Attach a saved template for optional option groups.'; end if;
   linked := linked || jsonb_build_array(public.option_template_group(to_jsonb(t),g));
  end if;
 end loop;
 new.variants := linked;
 return new;
end $$;

update public.menu_items m set variants=(
 select jsonb_agg(case when coalesce((g->>'isRequired')::boolean,false)
   or lower(trim(coalesce(g->>'name',''))) in ('variant','variants')
   or exists(select 1 from public.option_group_templates t where t.id::text=g->>'templateId' and (t.is_required or lower(trim(t.name)) in ('variant','variants')))
   then g-'templateId' else g end order by position)
 from jsonb_array_elements(m.variants) with ordinality groups(g,position)
) where exists(select 1 from jsonb_array_elements(coalesce(m.variants,'[]')) g where coalesce((g->>'isRequired')::boolean,false) or lower(trim(coalesce(g->>'name',''))) in ('variant','variants'));
delete from public.option_group_templates where is_required or lower(trim(name)) in ('variant','variants');
alter table public.option_group_templates add constraint optional_templates_only
check (not is_required and lower(trim(name)) not in ('variant','variants'));
commit;
