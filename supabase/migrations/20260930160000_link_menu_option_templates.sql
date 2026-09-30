-- Keep consumer-compatible variant snapshots, backed by shared saved templates.
create or replace function public.option_template_group(t jsonb, g jsonb)
returns jsonb language sql immutable set search_path=public as $$
select g || jsonb_build_object('templateId',t->>'id','name',t->'name',
 'isRequired',coalesce((t->>'is_required')::boolean,false),
 'isMultiSelect',coalesce((t->>'is_multi_select')::boolean,false),
 'maxSelection',t->'max_selection','posOnly',coalesce((t->>'pos_only')::boolean,false),
 'hidePublic',coalesce((t->>'hide_public')::boolean,false),
 'options',coalesce((select jsonb_agg(o.value || jsonb_build_object('id',coalesce(
  (select old.value->'id' from jsonb_array_elements(coalesce(g->'options','[]')) old where old.value->>'name'=o.value->>'name' limit 1),
  o.value->'id',to_jsonb((t->>'id') || ':' || o.ordinality))) order by o.ordinality)
  from jsonb_array_elements(coalesce(t->'options','[]')) with ordinality o), '[]'::jsonb));
$$;

create or replace function public.option_group_signature(g jsonb)
returns jsonb language sql immutable set search_path=public as $$
select jsonb_build_object('name',g->>'name','isRequired',coalesce((g->>'isRequired')::boolean,false),
 'isMultiSelect',coalesce((g->>'isMultiSelect')::boolean,false),'maxSelection',nullif(g->>'maxSelection',''),
 'posOnly',coalesce((g->>'posOnly')::boolean,false),'hidePublic',coalesce((g->>'hidePublic')::boolean,false),
 'options',coalesce((select jsonb_agg(value-'id' order by ordinality) from jsonb_array_elements(coalesce(g->'options','[]')) with ordinality),'[]'::jsonb));
$$;

-- Preserve the original definitions for recovery before linking legacy groups.
create table public.menu_template_link_backup_20260930 as select id, variants from public.menu_items;
alter table public.menu_template_link_backup_20260930 enable row level security;
revoke all on public.menu_template_link_backup_20260930 from anon, authenticated;

do $$
declare item record; g jsonb; t public.option_group_templates%rowtype; linked jsonb;
begin
 for item in select id,variants from public.menu_items where jsonb_typeof(variants)='array' loop
  linked := '[]'::jsonb;
  for g in select value from jsonb_array_elements(item.variants) loop
   select * into t from public.option_group_templates candidate
    where public.option_group_signature(public.option_template_group(to_jsonb(candidate),'{}')) = public.option_group_signature(g)
    order by created_at,id limit 1;
   if not found then
    insert into public.option_group_templates(name,is_required,is_multi_select,max_selection,pos_only,hide_public,options)
    values(g->>'name',coalesce((g->>'isRequired')::boolean,false),coalesce((g->>'isMultiSelect')::boolean,false),
      nullif(g->>'maxSelection','')::integer,coalesce((g->>'posOnly')::boolean,false),coalesce((g->>'hidePublic')::boolean,false),g->'options') returning * into t;
   end if;
   linked := linked || jsonb_build_array(public.option_template_group(to_jsonb(t),g));
  end loop;
  update public.menu_items set variants=linked where id=item.id;
 end loop;
end $$;

create or replace function public.resolve_menu_option_templates()
returns trigger language plpgsql security definer set search_path=public as $$
declare g jsonb; t public.option_group_templates%rowtype; linked jsonb := '[]';
begin
 if new.variants is null then return new; end if;
 for g in select value from jsonb_array_elements(new.variants) loop
  select * into t from public.option_group_templates where id::text=g->>'templateId' for share;
  if not found then raise exception 'Attach a saved template for each option group.'; end if;
  linked := linked || jsonb_build_array(public.option_template_group(to_jsonb(t),g));
 end loop;
 new.variants := linked;
 return new;
end $$;
create trigger resolve_menu_option_templates before insert or update of variants on public.menu_items
 for each row execute function public.resolve_menu_option_templates();

create or replace function public.sync_menu_option_template()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_op='DELETE' then
  if exists(select 1 from public.menu_items m cross join lateral jsonb_array_elements(coalesce(m.variants,'[]')) g where g->>'templateId'=old.id::text) then
   raise exception 'This template is attached to menu items. Remove its attachments before deleting it.';
  end if;
  return old;
 end if;
 update public.menu_items m set variants=m.variants
 where exists(select 1 from jsonb_array_elements(coalesce(m.variants,'[]')) g where g->>'templateId'=new.id::text);
 return new;
end $$;
create trigger sync_menu_option_template after update on public.option_group_templates for each row execute function public.sync_menu_option_template();
create trigger protect_menu_option_template before delete on public.option_group_templates for each row execute function public.sync_menu_option_template();
