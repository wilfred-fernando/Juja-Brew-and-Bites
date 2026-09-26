-- Full finance rows, including receipt lines, reference and supplier details.
CREATE TABLE IF NOT EXISTS finance_records (
  source_table TEXT NOT NULL,
  source_id TEXT NOT NULL,
  event_id INTEGER NOT NULL,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL,
  source_changed_at TEXT NOT NULL,
  synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (source_table, source_id)
);
CREATE TABLE IF NOT EXISTS finance_events (
  event_id INTEGER PRIMARY KEY,
  source_table TEXT NOT NULL,
  source_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  source_changed_at TEXT NOT NULL,
  synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS finance_events_source ON finance_events(source_table, source_id, event_id);
