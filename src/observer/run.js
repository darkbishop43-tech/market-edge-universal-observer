import { discoverOpenMarkets } from "./kalshi.js";
import { classifyMarket } from "./classify.js";
import { observeWeatherMarket } from "../engines/weather-v0.js";
import { persistCycle, upsertSignalState } from "../ledger/d1.js";

function intSetting(env,key,fallback,min,max){
  const n=Number(env?.[key]);
  return Number.isFinite(n)?Math.max(min,Math.min(max,Math.floor(n))):fallback;
}

export async function runObservationCycle(env={}) {
  const observedAt=new Date().toISOString();
  // Configurable governor: safe V0 defaults, expandable later without architecture changes.
  const totalActiveCeiling=intSetting(env,"OBSERVER_ACTIVE_CEILING",100,1,5000);
  const weatherPerCycle=intSetting(env,"WEATHER_PER_CYCLE",10,1,totalActiveCeiling);
  const discoveryLimit=intSetting(env,"DISCOVERY_MARKET_LIMIT",Math.min(100,totalActiveCeiling),1,5000);
  const minRefreshSeconds=intSetting(env,"MIN_REFRESH_SECONDS",300,60,86400);

  const discovery=await discoverOpenMarkets({limit:discoveryLimit});
  if(!discovery.ok) return {ok:false,observedAt,tradingCapability:false,discovery,
    governor:{totalActiveCeiling,weatherPerCycle,discoveryLimit,minRefreshSeconds},
    counts:{discovered:0,weather:0,economics:0,unclassified:0},weatherObservations:[],persistence:{ok:false,status:"SKIPPED_DISCOVERY_FAILED"}};

  const counts={discovered:discovery.markets.length,weather:0,economics:0,unclassified:0};
  const weatherCandidates=[];
  for(const market of discovery.markets){
    const classification=classifyMarket(market);
    counts[classification.domain]=(counts[classification.domain]||0)+1;
    if(classification.domain==="weather") weatherCandidates.push({market,classification});
  }

  weatherCandidates.sort((a,b)=>String(a.market.close_time||"").localeCompare(String(b.market.close_time||"")));
  const selected=weatherCandidates.slice(0,weatherPerCycle);
  const weatherObservations=[];
  for(const item of selected) {
    const o=await observeWeatherMarket(item.market,item.classification,observedAt);
    const score=o.probability ?? (o.market?.yesAsk!=null ? Number(o.market.yesAsk)/100 : null);
    o.longitudinal=await upsertSignalState(env.DB,{domain:"weather",ticker:o.market?.ticker||item.market?.ticker,observedAt,score,sourceAt:o.evidence?.retrievedAt||observedAt,threshold:0.5});
    weatherObservations.push(o);
  }

  const cycle={ok:true,observedAt,mode:"OBSERVATION_ONLY",tradingCapability:false,
    discovery:{ok:true,source:discovery.source,httpStatus:discovery.httpStatus,latencyMs:discovery.latencyMs,cursorPresent:Boolean(discovery.cursor)},
    governor:{totalActiveCeiling,weatherPerCycle,discoveryLimit,minRefreshSeconds,configuration:"ENV_OVERRIDABLE",hardcodedContractCeiling:false},
    limits:{weatherCandidates:weatherCandidates.length,weatherSelected:selected.length,weatherDeferred:Math.max(0,weatherCandidates.length-selected.length)},
    counts,weatherObservations};
  cycle.persistence=await persistCycle(env.DB,cycle);
  return cycle;
}
