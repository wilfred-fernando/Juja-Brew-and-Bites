PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS archive_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS archive_orders (
  source_id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL DEFAULT 'POS',
  business_date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  paid_at TEXT,
  store_id TEXT,
  branch_id TEXT,
  receipt_number TEXT,
  order_number TEXT,
  status TEXT,
  payment_method TEXT,
  customer_id TEXT,
  loyalty_member_id TEXT,
  gross_amount REAL NOT NULL DEFAULT 0,
  discount_amount REAL NOT NULL DEFAULT 0,
  refund_amount REAL NOT NULL DEFAULT 0,
  net_amount REAL NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL,
  archived_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_archive_orders_date_store ON archive_orders(business_date, store_id);
CREATE INDEX IF NOT EXISTS idx_archive_orders_receipt ON archive_orders(receipt_number);
CREATE INDEX IF NOT EXISTS idx_archive_orders_customer ON archive_orders(loyalty_member_id, business_date);

CREATE TABLE IF NOT EXISTS archive_order_items (
  source_id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  business_date TEXT NOT NULL,
  store_id TEXT,
  menu_item_id TEXT,
  item_name TEXT,
  category_name TEXT,
  quantity REAL NOT NULL DEFAULT 0,
  gross_amount REAL NOT NULL DEFAULT 0,
  discount_amount REAL NOT NULL DEFAULT 0,
  refund_amount REAL NOT NULL DEFAULT 0,
  net_amount REAL NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL,
  archived_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_archive_items_order ON archive_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_archive_items_date_store ON archive_order_items(business_date, store_id);
CREATE INDEX IF NOT EXISTS idx_archive_items_item_date ON archive_order_items(menu_item_id, business_date);

CREATE TABLE IF NOT EXISTS archive_shifts (
  source_id TEXT PRIMARY KEY,
  business_date TEXT NOT NULL,
  store_id TEXT,
  cashier_id TEXT,
  mode TEXT NOT NULL,
  created_at TEXT NOT NULL,
  cash_total REAL NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL,
  archived_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_archive_shifts_date_store ON archive_shifts(business_date, store_id);

CREATE TABLE IF NOT EXISTS archive_inventory_daily (
  source_id TEXT PRIMARY KEY,
  inventory_date TEXT NOT NULL,
  store_id TEXT NOT NULL,
  inventory_item_id TEXT NOT NULL,
  ending_quantity REAL NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL,
  archived_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_archive_inventory_daily_date_store ON archive_inventory_daily(inventory_date, store_id);

CREATE TABLE IF NOT EXISTS archive_inventory_transactions (
  source_id TEXT PRIMARY KEY,
  business_date TEXT NOT NULL,
  store_id TEXT,
  inventory_item_id TEXT,
  transaction_type TEXT NOT NULL,
  quantity_effect REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  archived_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_archive_inventory_tx_date ON archive_inventory_transactions(business_date, inventory_item_id);

CREATE TABLE IF NOT EXISTS archive_audit_logs (
  source_id TEXT PRIMARY KEY,
  business_date TEXT NOT NULL,
  store_id TEXT,
  actor_user_id TEXT,
  entity TEXT,
  action TEXT,
  created_at TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  archived_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_archive_audit_date_store ON archive_audit_logs(business_date, store_id);

CREATE TABLE IF NOT EXISTS archive_notifications (
  source_id TEXT PRIMARY KEY,
  business_date TEXT NOT NULL,
  store_id TEXT,
  target_user_id TEXT,
  type TEXT,
  created_at TEXT NOT NULL,
  read_at TEXT,
  payload_json TEXT NOT NULL,
  archived_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_archive_notifications_date_user ON archive_notifications(business_date, target_user_id);

CREATE TABLE IF NOT EXISTS sales_daily_summary (
  business_date TEXT NOT NULL,
  store_id TEXT NOT NULL DEFAULT '',
  gross_amount REAL NOT NULL DEFAULT 0,
  discount_amount REAL NOT NULL DEFAULT 0,
  refund_amount REAL NOT NULL DEFAULT 0,
  net_amount REAL NOT NULL DEFAULT 0,
  order_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (business_date, store_id)
);

CREATE TABLE IF NOT EXISTS sales_payment_daily (
  business_date TEXT NOT NULL,
  store_id TEXT NOT NULL DEFAULT '',
  payment_method TEXT NOT NULL DEFAULT 'Other',
  amount REAL NOT NULL DEFAULT 0,
  transaction_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (business_date, store_id, payment_method)
);

CREATE TABLE IF NOT EXISTS archive_sync_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  archive_through TEXT NOT NULL,
  status TEXT NOT NULL,
  counts_json TEXT NOT NULL DEFAULT '{}',
  error_text TEXT
);

CREATE TABLE IF NOT EXISTS archive_shift_batches (
  shift_id TEXT PRIMARY KEY,
  store_id TEXT,
  cashier_id TEXT,
  opened_at TEXT NOT NULL,
  closed_at TEXT NOT NULL,
  business_date TEXT NOT NULL,
  expected_counts_json TEXT NOT NULL DEFAULT '{}',
  expected_totals_json TEXT NOT NULL DEFAULT '{}',
  expected_checksum TEXT NOT NULL,
  actual_counts_json TEXT,
  actual_totals_json TEXT,
  actual_checksum TEXT,
  status TEXT NOT NULL DEFAULT 'uploading',
  verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_archive_shift_batches_status ON archive_shift_batches(status, business_date);

CREATE TABLE IF NOT EXISTS archive_shift_batch_records (
  shift_id TEXT NOT NULL,
  table_name TEXT NOT NULL,
  source_id TEXT NOT NULL,
  row_hash TEXT NOT NULL,
  PRIMARY KEY (shift_id, table_name, source_id),
  FOREIGN KEY (shift_id) REFERENCES archive_shift_batches(shift_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_archive_shift_records_shift ON archive_shift_batch_records(shift_id, table_name);
