alter table public.option_group_templates add column show_public boolean, add column show_customer boolean, add column show_pos boolean;
create or replace function public.option_template_group(t jsonb, g jsonb)
returns jsonb language sql immutable set search_path=public as $$
select g || jsonb_build_object('templateId',t->>'id','name',t->'name',
 'show_public',t->'show_public','show_customer',t->'show_customer','show_pos',t->'show_pos',
 'isRequired',coalesce((t->>'is_required')::boolean,false),
 'isMultiSelect',coalesce((t->>'is_multi_select')::boolean,false),
 'maxSelection',t->'max_selection','posOnly',coalesce((t->>'pos_only')::boolean,false),
 'hidePublic',coalesce((t->>'hide_public')::boolean,false),
 'options',coalesce((select jsonb_agg(o.value || jsonb_build_object('id',coalesce(
  (select old.value->'id' from jsonb_array_elements(coalesce(g->'options','[]')) old where old.value->>'name'=o.value->>'name' limit 1),
  o.value->'id',to_jsonb((t->>'id') || ':' || o.ordinality))) order by o.ordinality)
  from jsonb_array_elements(coalesce(t->'options','[]')) with ordinality o), '[]'::jsonb));
$$;


update public.option_group_templates set show_public=not coalesce(pos_only,false) and not coalesce(hide_public,false), show_customer=not coalesce(pos_only,false), show_pos=true;
