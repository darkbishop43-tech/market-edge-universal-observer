const KALSHI_BASES = [
  "https://api.elections.kalshi.com/trade-api/v2",
  "https://external-api.kalshi.com/trade-api/v2"
];

async function fetchMarkets(base, limit, variant) {
  const url = new URL(base + "/markets");
  url.searchParams.set("status", "open");
  url.searchParams.set("limit", String(Math.min(1000, Math.max(1, limit))));
  if (variant === "exclude_mve") url.searchParams.set("mve_filter", "exclude");
  const started=Date.now();
  try {
    const response=await fetch(url,{headers:{accept:"application/json"},cache:"no-store"});
    if(!response.ok) return {ok:false,source:base,variant,httpStatus:response.status,latencyMs:Date.now()-started,markets:[],cursor:null,error:"HTTP_"+response.status};
    const body=await response.json();
    const markets=Array.isArray(body.markets)?body.markets:[];
    if(!markets.length) return {ok:false,source:base,variant,httpStatus:response.status,latencyMs:Date.now()-started,markets:[],cursor:body.cursor||null,error:"EMPTY_MARKETS"};
    return {ok:true,source:base,variant,httpStatus:response.status,latencyMs:Date.now()-started,markets,cursor:body.cursor||null};
  } catch(error) {
    return {ok:false,source:base,variant,httpStatus:null,latencyMs:Date.now()-started,markets:[],cursor:null,error:String(error?.message||error)};
  }
}

export async function discoverOpenMarkets({limit=1000}={}) {
  const attempts=[];
  for (const base of KALSHI_BASES) {
    for (const variant of ["exclude_mve","plain"]) {
      const attempt=await fetchMarkets(base,limit,variant);
      attempts.push(attempt);
      if(attempt.ok) return {...attempt,attemptCount:attempts.length,priorFailures:attempts.slice(0,-1).map(a=>({source:a.source,variant:a.variant,httpStatus:a.httpStatus,error:a.error}))};
    }
  }
  return {ok:false,source:"KALSHI_PUBLIC_MARKETS",httpStatus:attempts.map(a=>a.httpStatus).find(Boolean)||null,latencyMs:attempts.reduce((n,a)=>n+(a.latencyMs||0),0),markets:[],cursor:null,error:"KALSHI_PUBLIC_DISCOVERY_FAILED",attempts};
}
