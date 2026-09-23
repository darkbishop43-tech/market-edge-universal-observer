export async function ensureLedgerSchema(db) {
  if(!db) return {ok:false,status:"D1_NOT_BOUND"};
  const statements=[
    `CREATE TABLE IF NOT EXISTS observation_cycles (id TEXT PRIMARY KEY, observed_at TEXT NOT NULL, discovered INTEGER NOT NULL DEFAULT 0, weather_count INTEGER NOT NULL DEFAULT 0, economics_count INTEGER NOT NULL DEFAULT 0, unclassified_count INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL, detail_json TEXT)`,
    `CREATE TABLE IF NOT EXISTS observations (observation_id TEXT PRIMARY KEY, cycle_id TEXT NOT NULL, observed_at TEXT NOT NULL, domain TEXT NOT NULL, engine TEXT NOT NULL, ticker TEXT, event_ticker TEXT, title TEXT, close_time TEXT, prediction_status TEXT NOT NULL, prediction TEXT, probability REAL, yes_bid REAL, yes_ask REAL, no_bid REAL, no_ask REAL, liquidity REAL, evidence_source TEXT, evidence_retrieved_at TEXT, model TEXT, model_status TEXT, failure_reason TEXT, payload_json TEXT NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS idx_obs_domain_time ON observations(domain, observed_at)`,
    `CREATE INDEX IF NOT EXISTS idx_obs_ticker_time ON observations(ticker, observed_at)`,
    `CREATE TABLE IF NOT EXISTS resolutions (observation_id TEXT PRIMARY KEY, resolved_at TEXT NOT NULL, result TEXT, settlement_value REAL, hypothetical_pnl REAL, estimated_fees REAL, calibration_error REAL, liquidity_note TEXT, reconciliation_json TEXT)`,
    `CREATE TABLE IF NOT EXISTS signal_state (domain TEXT NOT NULL, ticker TEXT NOT NULL, first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL, sample_count INTEGER NOT NULL DEFAULT 0, first_score REAL, last_score REAL, recent_peak REAL, recent_trough REAL, threshold_first_at TEXT, threshold_continuous_since TEXT, last_source_at TEXT, updated_at TEXT NOT NULL, PRIMARY KEY(domain,ticker))`,
    `CREATE INDEX IF NOT EXISTS idx_signal_state_updated ON signal_state(domain,updated_at)`,
    `CREATE TABLE IF NOT EXISTS provider_cache (cache_key TEXT PRIMARY KEY, provider TEXT NOT NULL, payload_json TEXT NOT NULL, fetched_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS stream_evidence (evidence_id TEXT PRIMARY KEY, evidence_class TEXT NOT NULL, provider TEXT NOT NULL, channel TEXT NOT NULL, market_ticker TEXT, provider_source_time TEXT, ingested_at TEXT NOT NULL, message_type TEXT NOT NULL, connection_id TEXT, subscription_id TEXT, market_state_json TEXT NOT NULL, raw_source_json TEXT NOT NULL, created_at TEXT NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS idx_stream_evidence_real_time ON stream_evidence(evidence_class,channel,ingested_at)`
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


export async function getSignalState(db,domain,ticker) {
  if(!db||!ticker) return null;
  await ensureLedgerSchema(db);
  return await db.prepare(`SELECT * FROM signal_state WHERE domain=? AND ticker=?`).bind(domain,ticker).first();
}

export async function upsertSignalState(db,{domain,ticker,observedAt,score,sourceAt,threshold=0.5}) {
  if(!db||!ticker) return {ok:false,status:"D1_NOT_BOUND_OR_TICKER_MISSING"};
  await ensureLedgerSchema(db);
  const prev=await getSignalState(db,domain,ticker);
  const n=Number(score);
  const valid=Number.isFinite(n);
  const firstSeen=prev?.first_seen_at||observedAt;
  const firstScore=prev?.first_score??(valid?n:null);
  const peak=valid?Math.max(Number(prev?.recent_peak??n),n):(prev?.recent_peak??null);
  const trough=valid?Math.min(Number(prev?.recent_trough??n),n):(prev?.recent_trough??null);
  const thresholdFirst=prev?.threshold_first_at||(valid&&n>=threshold?observedAt:null);
  const continuous=valid&&n>=threshold?(prev?.threshold_continuous_since||observedAt):null;
  await db.prepare(`INSERT INTO signal_state
    (domain,ticker,first_seen_at,last_seen_at,sample_count,first_score,last_score,recent_peak,recent_trough,threshold_first_at,threshold_continuous_since,last_source_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(domain,ticker) DO UPDATE SET last_seen_at=excluded.last_seen_at,sample_count=excluded.sample_count,last_score=excluded.last_score,recent_peak=excluded.recent_peak,recent_trough=excluded.recent_trough,threshold_first_at=excluded.threshold_first_at,threshold_continuous_since=excluded.threshold_continuous_since,last_source_at=excluded.last_source_at,updated_at=excluded.updated_at`)
    .bind(domain,ticker,firstSeen,observedAt,Number(prev?.sample_count||0)+1,firstScore,valid?n:null,peak,trough,thresholdFirst,continuous,sourceAt||null,observedAt).run();
  const ageSec=Math.max(0,(Date.parse(observedAt)-Date.parse(firstSeen))/1000);
  const persistenceSec=continuous?Math.max(0,(Date.parse(observedAt)-Date.parse(continuous))/1000):0;
  const freshnessSec=sourceAt?Math.max(0,(Date.parse(observedAt)-Date.parse(sourceAt))/1000):null;
  return {ok:true,status:"SIGNAL_STATE_UPDATED",trajectory:{priorScore:prev?.last_score??null,currentScore:valid?n:null,delta:valid&&prev?.last_score!=null?n-Number(prev.last_score):null,peak,distanceFromPeak:valid&&peak!=null?peak-n:null,trough},persistence:{threshold,continuousSince:continuous,seconds:persistenceSec},signalAgeSeconds:ageSec,freshnessSeconds:freshnessSec,sampleCount:Number(prev?.sample_count||0)+1};
}


export async function getProviderCache(db,cacheKey,{maxAgeSeconds=300}={}) {
  if(!db||!cacheKey) return {ok:false,status:"CACHE_UNAVAILABLE",fresh:false,payload:null};
  await ensureLedgerSchema(db);
  const row=await db.prepare(`SELECT payload_json,fetched_at FROM provider_cache WHERE cache_key=?`).bind(cacheKey).first();
  if(!row) return {ok:true,status:"CACHE_MISS",fresh:false,payload:null,fetchedAt:null,ageSeconds:null};
  let payload=null; try{payload=JSON.parse(row.payload_json);}catch{}
  const ageSeconds=Math.max(0,(Date.now()-Date.parse(row.fetched_at))/1000);
  return {ok:true,status:ageSeconds<=maxAgeSeconds?"CACHE_FRESH":"CACHE_STALE",fresh:ageSeconds<=maxAgeSeconds,payload,fetchedAt:row.fetched_at,ageSeconds};
}

export async function putProviderCache(db,cacheKey,provider,payload,fetchedAt=new Date().toISOString()) {
  if(!db||!cacheKey||!payload) return {ok:false,status:"CACHE_WRITE_SKIPPED"};
  await ensureLedgerSchema(db);
  await db.prepare(`INSERT INTO provider_cache(cache_key,provider,payload_json,fetched_at,updated_at)
    VALUES(?,?,?,?,?)
    ON CONFLICT(cache_key) DO UPDATE SET provider=excluded.provider,payload_json=excluded.payload_json,fetched_at=excluded.fetched_at,updated_at=excluded.updated_at`)
    .bind(cacheKey,provider,JSON.stringify(payload),fetchedAt,new Date().toISOString()).run();
  return {ok:true,status:"CACHE_UPDATED",fetchedAt};
}


export async function persistStreamEvidence(db,evidence) {
  if(!db) return {ok:false,status:"D1_NOT_BOUND"};
  await ensureLedgerSchema(db);
  const evidenceClass=String(evidence?.evidenceClass||"").trim();
  if(!["REAL_PROVIDER","SIMULATED_TEST_FIXTURE"].includes(evidenceClass)) return {ok:false,status:"INVALID_EVIDENCE_CLASS"};
  const ingestedAt=evidence?.ingestedAt||new Date().toISOString();
  const ticker=evidence?.marketTicker||null;
  const id=[evidenceClass,evidence?.provider||"UNKNOWN",evidence?.channel||"UNKNOWN",ticker||"NO_TICKER",ingestedAt,crypto.randomUUID()].join(":");
  await db.prepare(`INSERT INTO stream_evidence
    (evidence_id,evidence_class,provider,channel,market_ticker,provider_source_time,ingested_at,message_type,connection_id,subscription_id,market_state_json,raw_source_json,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(
      id,
      evidenceClass,
      evidence?.provider||"UNKNOWN",
      evidence?.channel||"UNKNOWN",
      ticker,
      evidence?.providerSourceTime||null,
      ingestedAt,
      evidence?.messageType||"unknown",
      evidence?.connectionId||null,
      evidence?.subscriptionId!=null?String(evidence.subscriptionId):null,
      JSON.stringify(evidence?.marketState||{}),
      JSON.stringify(evidence?.rawSource||{}),
      new Date().toISOString()
    ).run();
  return {ok:true,status:"PERSISTED",evidenceId:id,evidenceClass};
}

export async function getLastStreamEvidence(db,{evidenceClass="REAL_PROVIDER",channel="ticker"}={}) {
  if(!db) return {ok:false,status:"D1_NOT_BOUND",evidence:null};
  await ensureLedgerSchema(db);
  const row=await db.prepare(`SELECT evidence_id,evidence_class,provider,channel,market_ticker,provider_source_time,ingested_at,message_type,connection_id,subscription_id,market_state_json,raw_source_json
    FROM stream_evidence WHERE evidence_class=? AND channel=? ORDER BY ingested_at DESC LIMIT 1`)
    .bind(evidenceClass,channel).first();
  if(!row) return {ok:true,status:"NO_EVIDENCE",evidence:null};
  let marketState={}; let rawSource={};
  try{marketState=JSON.parse(row.market_state_json||"{}");}catch{}
  try{rawSource=JSON.parse(row.raw_source_json||"{}");}catch{}
  return {ok:true,status:"FOUND",evidence:{
    evidenceId:row.evidence_id,
    evidenceClass:row.evidence_class,
    provider:row.provider,
    channel:row.channel,
    marketTicker:row.market_ticker,
    providerSourceTime:row.provider_source_time,
    ingestedAt:row.ingested_at,
    messageType:row.message_type,
    connectionId:row.connection_id,
    subscriptionId:row.subscription_id,
    marketState,
    rawSource
  }};
}
