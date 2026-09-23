import { discoverOpenMarkets } from "./kalshi.js";
import { classifyMarket } from "./classify.js";
import { observeWeatherMarket } from "../engines/weather-v0.js";
import { persistCycle } from "../ledger/d1.js";

const MAX_WEATHER_PER_CYCLE=8;

export async function runObservationCycle(env={}) {
  const observedAt=new Date().toISOString();
  const discovery=await discoverOpenMarkets({limit:500});
  if(!discovery.ok) return {ok:false,observedAt,tradingCapability:false,discovery,counts:{discovered:0,weather:0,economics:0,unclassified:0},weatherObservations:[],persistence:{ok:false,status:"SKIPPED_DISCOVERY_FAILED"}};

  const counts={discovered:discovery.markets.length,weather:0,economics:0,unclassified:0};
  const weatherCandidates=[];
  for(const market of discovery.markets){
    const classification=classifyMarket(market);
    counts[classification.domain]=(counts[classification.domain]||0)+1;
    if(classification.domain==="weather") weatherCandidates.push({market,classification});
  }

  // Bound external evidence calls per cycle. Prioritize markets closing first.
  weatherCandidates.sort((a,b)=>String(a.market.close_time||"").localeCompare(String(b.market.close_time||"")));
  const selected=weatherCandidates.slice(0,MAX_WEATHER_PER_CYCLE);
  const weatherObservations=[];
  for(const item of selected) weatherObservations.push(await observeWeatherMarket(item.market,item.classification,observedAt));

  const cycle={ok:true,observedAt,mode:"OBSERVATION_ONLY",tradingCapability:false,
    discovery:{ok:true,source:discovery.source,httpStatus:discovery.httpStatus,latencyMs:discovery.latencyMs,cursorPresent:Boolean(discovery.cursor)},
    limits:{maxWeatherPerCycle:MAX_WEATHER_PER_CYCLE,weatherCandidates:weatherCandidates.length,weatherDeferred:Math.max(0,weatherCandidates.length-selected.length)},
    counts,weatherObservations};
  cycle.persistence=await persistCycle(env.DB,cycle);
  return cycle;
}
