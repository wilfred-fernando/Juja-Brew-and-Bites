-- Preserve existing visibility while allowing independent channel selection.
alter table public.menu_items add column show_public boolean, add column show_customer boolean, add column show_pos boolean;
alter table public.menu_categories add column show_public boolean, add column show_customer boolean, add column show_pos boolean;
update public.menu_items set show_public=not coalesce(pos_only,false), show_customer=not coalesce(pos_only,false), show_pos=true;
update public.menu_categories set show_public=not coalesce(pos_only,false), show_customer=not coalesce(pos_only,false), show_pos=true;
