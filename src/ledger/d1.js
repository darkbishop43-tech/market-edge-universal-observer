export async function persistCycle(db,cycle) {
  if(!db) return {ok:false,status:"D1_NOT_BOUND",writes:0};
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
  return {ok:true,status:"PERSISTED",writes:statements.length,batches:1,resultCount:result.length};
}
