-- Return only a fingerprint of the catalog visible to the caller. This detects
-- deletes and edits even when an older admin path does not touch updated_at.
create or replace function public.pos_catalog_fingerprint()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select md5(
    coalesce((select jsonb_agg(to_jsonb(m) order by m.id)::text from public.menu_items m), '[]')
    || ':' ||
    coalesce((select jsonb_agg(to_jsonb(c) order by c.id)::text from public.menu_categories c), '[]')
  );
$$;

revoke all on function public.pos_catalog_fingerprint() from public, anon;
grant execute on function public.pos_catalog_fingerprint() to authenticated, service_role;
notify pgrst, 'reload schema';
