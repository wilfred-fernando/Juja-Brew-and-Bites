begin;
create table public.menu_availability_audit (
 id uuid primary key default gen_random_uuid(), table_name text not null, record_key jsonb not null,
 actor_id uuid, actor_store_id text, source text not null, client_id uuid,
 previous_available boolean, next_available boolean, changed_at timestamptz not null default now()
);
create index menu_availability_audit_changed on public.menu_availability_audit(changed_at desc);
alter table public.menu_availability_audit enable row level security;
revoke all on public.menu_availability_audit from public,anon,authenticated;
grant select on public.menu_availability_audit to authenticated;
grant all on public.menu_availability_audit to service_role;
create policy "Admins read availability history" on public.menu_availability_audit for select to authenticated
using(exists(select 1 from public.profiles where id=auth.uid() and replace(lower(role),'-','_') in ('admin','super_admin')));

create function public.guard_shared_menu_availability() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if old.is_available is distinct from new.is_available
   and current_setting('app.menu_availability_item',true) is distinct from new.id::text then
   raise exception 'Use the item availability switch to change availability. Reload an older item editor before saving';
 end if;
 return new;
end $$;
revoke all on function public.guard_shared_menu_availability() from public,anon,authenticated;
create trigger guard_shared_menu_availability before update of is_available on public.menu_items
for each row execute function public.guard_shared_menu_availability();

create function public.audit_menu_availability() returns trigger
language plpgsql security definer set search_path=public as $$
declare before_row jsonb:=to_jsonb(old); after_row jsonb:=to_jsonb(new); actor_store text;
begin
 if before_row->'is_available' is not distinct from after_row->'is_available' then return new; end if;
 select store_id::text into actor_store from profiles where id=auth.uid();
 insert into menu_availability_audit(table_name,record_key,actor_id,actor_store_id,source,client_id,previous_available,next_available)
 values(tg_table_name,jsonb_strip_nulls(jsonb_build_object('id',coalesce(after_row,before_row)->>'id','item_id',coalesce(after_row,before_row)->>'item_id',
   'store_id',coalesce(after_row,before_row)->>'store_id','category_id',coalesce(after_row,before_row)->>'category_id','group_key',coalesce(after_row,before_row)->>'group_key','option_key',coalesce(after_row,before_row)->>'option_key')),
   auth.uid(),actor_store,coalesce(nullif(current_setting('app.menu_availability_source',true),''),'direct'),
   nullif(current_setting('app.menu_availability_client',true),'')::uuid,(before_row->>'is_available')::boolean,(after_row->>'is_available')::boolean);
 return new;
end $$;
revoke all on function public.audit_menu_availability() from public,anon,authenticated;
create trigger audit_menu_availability after update of is_available on public.menu_items for each row execute function public.audit_menu_availability();
create trigger audit_menu_availability after insert or update of is_available or delete on public.menu_item_store_availability for each row execute function public.audit_menu_availability();
create trigger audit_menu_availability after insert or update of is_available or delete on public.menu_category_store_availability for each row execute function public.audit_menu_availability();
create trigger audit_menu_availability after insert or update of is_available or delete on public.option_group_store_availability for each row execute function public.audit_menu_availability();
create trigger audit_menu_availability after insert or update of is_available or delete on public.option_selection_store_availability for each row execute function public.audit_menu_availability();

create function public.set_shared_menu_availability_checked(p_item_key text,p_available boolean,p_expected_updated_at timestamptz,p_source text,p_client_id uuid default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare item public.menu_items; previous_context text:=current_setting('app.menu_availability_item',true);
 previous_source text:=current_setting('app.menu_availability_source',true); previous_client text:=current_setting('app.menu_availability_client',true);
begin
 if not exists(select 1 from profiles where id=auth.uid() and replace(lower(role),'-','_') in ('admin','super_admin','cashier','kitchen','kds')) then raise exception using errcode='42501',message='Staff access required'; end if;
 if p_available is null or p_source not in ('pos','admin','kds','legacy') or p_source is null then raise exception 'Invalid availability update'; end if;
 select * into item from menu_items where id::text=p_item_key for update;
 if item.id is null then raise exception 'Menu item not found'; end if;
 if coalesce(item.is_available,true) is distinct from p_available then
   if p_expected_updated_at is null or item.updated_at is distinct from p_expected_updated_at then raise exception 'Availability changed on another device. Refresh the item list and try again'; end if;
   perform set_config('app.menu_availability_item',p_item_key,true);
   perform set_config('app.menu_availability_source',p_source,true);
   perform set_config('app.menu_availability_client',coalesce(p_client_id::text,''),true);
   update menu_items set is_available=p_available where id=item.id returning * into item;
   perform set_config('app.menu_availability_item',coalesce(previous_context,''),true);
   perform set_config('app.menu_availability_source',coalesce(previous_source,''),true);
   perform set_config('app.menu_availability_client',coalesce(previous_client,''),true);
 end if;
 return jsonb_build_object('id',item.id,'is_available',coalesce(item.is_available,true),'updated_at',item.updated_at);
end $$;
revoke all on function public.set_shared_menu_availability_checked(text,boolean,timestamptz,text,uuid) from public,anon;
grant execute on function public.set_shared_menu_availability_checked(text,boolean,timestamptz,text,uuid) to authenticated;

-- Keep old terminals working, with auditing and an idempotent desired state.
create or replace function public.set_shared_menu_availability(item_key text,available boolean) returns void
language plpgsql security definer set search_path=public as $$
declare item public.menu_items;
begin
 if not exists(select 1 from profiles where id=auth.uid() and replace(lower(role),'-','_') in ('admin','super_admin','cashier','kitchen','kds')) then raise exception using errcode='42501',message='Staff access required'; end if;
 select * into item from menu_items where id::text=item_key for update;
 perform public.set_shared_menu_availability_checked(item_key,available,item.updated_at,'legacy',null);
end $$;
notify pgrst,'reload schema';
commit;
