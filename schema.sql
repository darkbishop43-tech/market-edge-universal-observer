CREATE TABLE IF NOT EXISTS observation_cycles (
  id TEXT PRIMARY KEY, observed_at TEXT NOT NULL, discovered INTEGER NOT NULL DEFAULT 0,
  weather_count INTEGER NOT NULL DEFAULT 0, economics_count INTEGER NOT NULL DEFAULT 0,
  unclassified_count INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL, detail_json TEXT
);
CREATE TABLE IF NOT EXISTS observations (
  observation_id TEXT PRIMARY KEY, cycle_id TEXT NOT NULL, observed_at TEXT NOT NULL,
  domain TEXT NOT NULL, engine TEXT NOT NULL, ticker TEXT, event_ticker TEXT, title TEXT,
  close_time TEXT, prediction_status TEXT NOT NULL, prediction TEXT, probability REAL,
  yes_bid REAL, yes_ask REAL, no_bid REAL, no_ask REAL, liquidity REAL,
  evidence_source TEXT, evidence_retrieved_at TEXT, model TEXT, model_status TEXT,
  failure_reason TEXT, payload_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_obs_domain_time ON observations(domain, observed_at);
CREATE INDEX IF NOT EXISTS idx_obs_ticker_time ON observations(ticker, observed_at);
CREATE TABLE IF NOT EXISTS resolutions (
  observation_id TEXT PRIMARY KEY, resolved_at TEXT NOT NULL, result TEXT,
  settlement_value REAL, hypothetical_pnl REAL, estimated_fees REAL,
  calibration_error REAL, liquidity_note TEXT, reconciliation_json TEXT
);
