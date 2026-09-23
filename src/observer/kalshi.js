const KALSHI_BASE = "https://api.elections.kalshi.com/trade-api/v2";

async function fetchMarkets(limit) {
  const url = new URL(KALSHI_BASE + "/markets");
  url.searchParams.set("status", "open");
  url.searchParams.set("limit", String(Math.min(500, Math.max(1, limit))));
  url.searchParams.set("mve_filter", "exclude");
  const started=Date.now();
  try {
    const response=await fetch(url,{headers:{accept:"application/json","user-agent":"market-edge-universal-observer/0.5.1"},cache:"no-store"});
    const retryAfter=response.headers.get("retry-after");
    if(!response.ok) return {ok:false,source:KALSHI_BASE,variant:"single_bounded",httpStatus:response.status,latencyMs:Date.now()-started,retryAfter:retryAfter||null,markets:[],cursor:null,error:"HTTP_"+response.status};
    const body=await response.json();
    const markets=Array.isArray(body.markets)?body.markets:[];
    if(!markets.length) return {ok:false,source:KALSHI_BASE,variant:"single_bounded",httpStatus:response.status,latencyMs:Date.now()-started,retryAfter:null,markets:[],cursor:body.cursor||null,error:"EMPTY_MARKETS"};
    return {ok:true,source:KALSHI_BASE,variant:"single_bounded",httpStatus:response.status,latencyMs:Date.now()-started,retryAfter:null,markets,cursor:body.cursor||null,attemptCount:1,priorFailures:[]};
  } catch(error) {
    return {ok:false,source:KALSHI_BASE,variant:"single_bounded",httpStatus:null,latencyMs:Date.now()-started,retryAfter:null,markets:[],cursor:null,error:String(error?.message||error)};
  }
}

export async function discoverOpenMarkets({limit=500}={}) {
  const attempt=await fetchMarkets(limit);
  if(attempt.ok) return attempt;
  return {...attempt,error:attempt.httpStatus===429?"KALSHI_RATE_LIMITED":"KALSHI_PUBLIC_DISCOVERY_FAILED",attempts:[attempt]};
}
