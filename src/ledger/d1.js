export async function ensureLedgerSchema(db) {
  if(!db) return {ok:false,status:"D1_NOT_BOUND"};
  const statements=[
    `CREATE TABLE IF NOT EXISTS observation_cycles (id TEXT PRIMARY KEY, observed_at TEXT NOT NULL, discovered INTEGER NOT NULL DEFAULT 0, weather_count INTEGER NOT NULL DEFAULT 0, economics_count INTEGER NOT NULL DEFAULT 0, unclassified_count INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL, detail_json TEXT)`,
    `CREATE TABLE IF NOT EXISTS observations (observation_id TEXT PRIMARY KEY, cycle_id TEXT NOT NULL, observed_at TEXT NOT NULL, domain TEXT NOT NULL, engine TEXT NOT NULL, ticker TEXT, event_ticker TEXT, title TEXT, close_time TEXT, prediction_status TEXT NOT NULL, prediction TEXT, probability REAL, yes_bid REAL, yes_ask REAL, no_bid REAL, no_ask REAL, liquidity REAL, evidence_source TEXT, evidence_retrieved_at TEXT, model TEXT, model_status TEXT, failure_reason TEXT, payload_json TEXT NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS idx_obs_domain_time ON observations(domain, observed_at)`,
    `CREATE INDEX IF NOT EXISTS idx_obs_ticker_time ON observations(ticker, observed_at)`,
    `CREATE TABLE IF NOT EXISTS resolutions (observation_id TEXT PRIMARY KEY, resolved_at TEXT NOT NULL, result TEXT, settlement_value REAL, hypothetical_pnl REAL, estimated_fees REAL, calibration_error REAL, liquidity_note TEXT, reconciliation_json TEXT)`
  ];
  await db.batch(statements.map(sql=>db.prepare(sql)));
  return {ok:true,status:"D1_SCHEMA_READY"};
}

export async function persistCycle(db,cycle) {
  if(!db) return {ok:false,status:"D1_NOT_BOUND",writes:0};
  await ensureLedgerSchema(db);
  const cycleId=`cycle:${cycle.observedAt}`;
  const statements=[
    db.prepare(`INSERT OR IGNORE INTO observation_cycles
      (id,observed_at,discovered,weather_count,economics_count,unclassified_count,status,detail_json)
      VALUES (?,?,?,?,?,?,?,?)`).bind(cycleId,cycle.observedAt,cycle.counts?.discovered||0,cycle.counts?.weather||0,cycle.counts?.economics||0,cycle.counts?.unclassified||0,cycle.ok?"OK":"FAILED",JSON.stringify(cycle.discovery||{}))
  ];
  for(const o of cycle.weatherObservations||[]) {
    statements.push(db.prepare(`INSERT OR IGNORE INTO observations
      (observation_id,cycle_id,observed_at,domain,engine,ticker,event_ticker,title,close_time,prediction_status,prediction,probability,yes_bid,yes_ask,no_bid,no_ask,liquidity,evidence_source,evidence_retrieved_at,model,model_status,failure_reason,payload_json)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
      o.observationId,cycleId,o.observedAt,o.domain,o.engine,o.market?.ticker||null,o.market?.eventTicker||null,o.market?.title||null,o.market?.closeTime||null,
      o.predictionStatus,o.prediction,o.probability,o.market?.yesBid,o.market?.yesAsk,o.market?.noBid,o.market?.noAsk,o.market?.liquidity,
      o.evidence?.source||null,o.evidence?.retrievedAt||null,o.model?.model||null,o.model?.modelStatus||null,o.failureReason||null,JSON.stringify(o)
    ));
  }
  const result=await db.batch(statements);
  return {ok:true,status:"PERSISTED",writes:statements.length,batches:1,resultCount:result.length,schema:"WEATHER_LEDGER_V0"};
}
