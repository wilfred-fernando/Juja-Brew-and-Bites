# JUJA Database Cleanup Report - 2026-Jun-11

## Scope
- Inventory
- Expenses and petty cash purchases
- POS orders and order items
- Menu items and recipe ingredients
- Stock movement audit
- Profiles, stores, and RLS policies

## Schema Findings
- Inventory tables already existed:
  - `common_inventory_names`
  - `inventory_items`
  - `inventory_transactions`
  - `menu_item_ingredients`
  - `expense_inventory_links`
  - `inventory_settings`
  - `inventory_warnings`
- Existing `stock_movements` table also existed and had 0 rows.
- `inventory_items` had 0 rows before normalization, while expenses already had purchase data.
- `finance_expenses` had 39 rows.
- `finance_petty_cash_entries` had 30 rows.
- `menu_item_ingredients` had 0 rows.
- `expense_inventory_links` had 0 rows.
- No duplicate inventory item names were found before migration because inventory was empty.
- No duplicate common names were found in `common_inventory_names`.
- 37 overall expenses could not match inventory before migration because master inventory items did not exist yet.

## Problems Found
- Expenses stored item/common names as text but did not have a direct `inventory_item_id` relationship.
- Petty cash expenses also lacked a direct `inventory_item_id` relationship.
- `inventory_items` did not have direct `common_name` / `normalized_common_name` fields, so the master source of truth was split between `inventory_items` and `common_inventory_names`.
- `stock_movements` existed but did not match the requested normalized stock audit shape.
- Existing recipe table uses `menu_item_id text` while `menu_items.id` is `uuid`; a direct FK was not added because that needs a separate compatibility migration.

## Migration Applied
Applied:
- `supabase/migrations/20260611013000_normalize_inventory_expense_pos_links.sql`

The migration is additive and safe:
- Does not drop tables.
- Does not truncate data.
- Does not delete production records.
- Does not rename columns.
- Creates backup snapshot tables before linking/backfilling.

## Changes Applied
- Added `inventory_items.common_name`.
- Added `inventory_items.normalized_common_name`.
- Seeded `inventory_items` from existing overall and petty cash expense rows.
- Added `finance_expenses.inventory_item_id`.
- Added `finance_petty_cash_entries.inventory_item_id`.
- Backfilled all existing overall expenses to `inventory_item_id`.
- Backfilled all existing petty cash expenses to `inventory_item_id`.
- Extended `stock_movements` with:
  - `inventory_item_id`
  - `movement_type`
  - `unit`
  - `source_type`
  - `source_id`
  - `notes`
- Replaced `add_inventory_transaction()` so future stock movements are written to both:
  - `inventory_transactions`
  - `stock_movements`
- Tightened/confirmed RLS policies for:
  - `inventory_items`
  - `menu_item_ingredients`
  - `inventory_transactions`
  - `stock_movements`

## Verification After Migration
- `inventory_items`: 33 rows
- `finance_expenses`: 39 rows
- `finance_expenses` linked to inventory: 39 rows
- `finance_petty_cash_entries`: 30 rows
- Petty cash expenses linked to inventory: 30 rows
- Duplicate active normalized common names: 0
- Backup tables created:
  - `backup_inventory_items_20260611`
  - `backup_finance_expenses_inventory_links_20260611`
  - `backup_finance_petty_inventory_links_20260611`

## Manual Follow-Up
- Build menu recipes in Admin Inventory before expecting POS deductions.
- A separate reviewed migration is needed if `menu_item_ingredients.menu_item_id` should be converted from `text` to `uuid` and FK-linked to `menu_items.id`.
- Existing public menu and customer menu item block design were not changed.
