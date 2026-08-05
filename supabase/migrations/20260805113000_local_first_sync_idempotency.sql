-- Additive support for durable mobile outboxes and incremental synchronization.

alter table if exists public.web_orders
  add column if not exists client_idempotency_key text,
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.orders
  add column if not exists client_idempotency_key text,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists web_orders_client_idempotency_key_uidx
  on public.web_orders (client_idempotency_key)
  where client_idempotency_key is not null;

create unique index if not exists orders_client_idempotency_key_uidx
  on public.orders (client_idempotency_key)
  where client_idempotency_key is not null;

create or replace function public.touch_local_sync_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_web_orders_local_sync_updated_at on public.web_orders;
create trigger trg_web_orders_local_sync_updated_at
before update on public.web_orders
for each row execute function public.touch_local_sync_updated_at();

drop trigger if exists trg_orders_local_sync_updated_at on public.orders;
create trigger trg_orders_local_sync_updated_at
before update on public.orders
for each row execute function public.touch_local_sync_updated_at();

-- These configuration tables are cached by the installed POS/customer apps.
alter table if exists public.menu_items add column if not exists updated_at timestamptz not null default now();
alter table if exists public.open_tickets add column if not exists updated_at timestamptz not null default now();
alter table if exists public.pos_discounts add column if not exists updated_at timestamptz not null default now();
alter table if exists public.cashier_shifts add column if not exists updated_at timestamptz not null default now();
alter table if exists public.menu_categories add column if not exists updated_at timestamptz not null default now();
alter table if exists public.stores add column if not exists updated_at timestamptz not null default now();
alter table if exists public.menu_item_store_availability add column if not exists updated_at timestamptz not null default now();
alter table if exists public.menu_category_store_availability add column if not exists updated_at timestamptz not null default now();
alter table if exists public.option_group_store_availability add column if not exists updated_at timestamptz not null default now();
alter table if exists public.option_selection_store_availability add column if not exists updated_at timestamptz not null default now();
alter table if exists public.menu_item_ingredients add column if not exists updated_at timestamptz not null default now();
alter table if exists public.inventory_items add column if not exists updated_at timestamptz not null default now();

drop trigger if exists trg_menu_items_local_sync_updated_at on public.menu_items;
create trigger trg_menu_items_local_sync_updated_at before update on public.menu_items
for each row execute function public.touch_local_sync_updated_at();

drop trigger if exists trg_open_tickets_local_sync_updated_at on public.open_tickets;
create trigger trg_open_tickets_local_sync_updated_at before update on public.open_tickets
for each row execute function public.touch_local_sync_updated_at();

drop trigger if exists trg_pos_discounts_local_sync_updated_at on public.pos_discounts;
create trigger trg_pos_discounts_local_sync_updated_at before update on public.pos_discounts
for each row execute function public.touch_local_sync_updated_at();

drop trigger if exists trg_cashier_shifts_local_sync_updated_at on public.cashier_shifts;
create trigger trg_cashier_shifts_local_sync_updated_at before update on public.cashier_shifts
for each row execute function public.touch_local_sync_updated_at();

drop trigger if exists trg_menu_categories_local_sync_updated_at on public.menu_categories;
create trigger trg_menu_categories_local_sync_updated_at before update on public.menu_categories
for each row execute function public.touch_local_sync_updated_at();

drop trigger if exists trg_stores_local_sync_updated_at on public.stores;
create trigger trg_stores_local_sync_updated_at before update on public.stores
for each row execute function public.touch_local_sync_updated_at();

drop trigger if exists trg_menu_item_store_availability_local_sync_updated_at on public.menu_item_store_availability;
create trigger trg_menu_item_store_availability_local_sync_updated_at before update on public.menu_item_store_availability
for each row execute function public.touch_local_sync_updated_at();

drop trigger if exists trg_menu_category_store_availability_local_sync_updated_at on public.menu_category_store_availability;
create trigger trg_menu_category_store_availability_local_sync_updated_at before update on public.menu_category_store_availability
for each row execute function public.touch_local_sync_updated_at();

drop trigger if exists trg_option_group_store_availability_local_sync_updated_at on public.option_group_store_availability;
create trigger trg_option_group_store_availability_local_sync_updated_at before update on public.option_group_store_availability
for each row execute function public.touch_local_sync_updated_at();

drop trigger if exists trg_option_selection_store_availability_local_sync_updated_at on public.option_selection_store_availability;
create trigger trg_option_selection_store_availability_local_sync_updated_at before update on public.option_selection_store_availability
for each row execute function public.touch_local_sync_updated_at();

drop trigger if exists trg_menu_item_ingredients_local_sync_updated_at on public.menu_item_ingredients;
create trigger trg_menu_item_ingredients_local_sync_updated_at before update on public.menu_item_ingredients
for each row execute function public.touch_local_sync_updated_at();

drop trigger if exists trg_inventory_items_local_sync_updated_at on public.inventory_items;
create trigger trg_inventory_items_local_sync_updated_at before update on public.inventory_items
for each row execute function public.touch_local_sync_updated_at();
