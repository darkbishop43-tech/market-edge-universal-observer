const KALSHI_BASE = "https://api.elections.kalshi.com/trade-api/v2";
const FALLBACK_BASE = "https://external-api.kalshi.com/trade-api/v2";

async function fetchMarkets(base, limit) {
  const url = new URL(base + "/markets");
  url.searchParams.set("status", "open");
  url.searchParams.set("mve_filter", "exclude");
  url.searchParams.set("limit", String(Math.min(1000, Math.max(1, limit))));
  const started=Date.now();
  try {
    const response=await fetch(url,{headers:{accept:"application/json","user-agent":"market-edge-universal-observer/0.4.3"}});
    if(!response.ok) return {ok:false,source:base,httpStatus:response.status,latencyMs:Date.now()-started,markets:[],cursor:null,error:"HTTP_"+response.status};
    const body=await response.json();
    return {ok:true,source:base,httpStatus:response.status,latencyMs:Date.now()-started,markets:Array.isArray(body.markets)?body.markets:[],cursor:body.cursor||null};
  } catch(error) {
    return {ok:false,source:base,httpStatus:null,latencyMs:Date.now()-started,markets:[],cursor:null,error:String(error?.message||error)};
  }
}

export async function discoverOpenMarkets({limit=1000}={}) {
  const primary=await fetchMarkets(KALSHI_BASE,limit);
  if(primary.ok) return primary;
  const fallback=await fetchMarkets(FALLBACK_BASE,limit);
  if(fallback.ok) return {...fallback,fallbackUsed:true,primaryFailure:{httpStatus:primary.httpStatus,error:primary.error}};
  return {ok:false,source:"KALSHI_PUBLIC_MARKETS",httpStatus:fallback.httpStatus||primary.httpStatus,latencyMs:(primary.latencyMs||0)+(fallback.latencyMs||0),markets:[],cursor:null,error:"KALSHI_PUBLIC_DISCOVERY_FAILED",attempts:[primary,fallback]};
}
