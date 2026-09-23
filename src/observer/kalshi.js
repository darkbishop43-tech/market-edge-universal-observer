const KALSHI_BASE = "https://api.elections.kalshi.com/trade-api/v2";
const WEATHER_TERMS = ["weather","temperature","rain","snow","snowfall","hurricane","wind","heat","degrees"];

async function getJson(path, params={}) {
  const url=new URL(KALSHI_BASE+path);
  for(const [k,v] of Object.entries(params)) if(v!=null) url.searchParams.set(k,String(v));
  const started=Date.now();
  try{
    const response=await fetch(url,{headers:{accept:"application/json","user-agent":"market-edge-universal-observer/0.5.2"},cache:"no-store"});
    const retryAfter=response.headers.get("retry-after");
    if(!response.ok) return {ok:false,httpStatus:response.status,latencyMs:Date.now()-started,retryAfter:retryAfter||null,data:null,error:"HTTP_"+response.status,url:url.toString()};
    return {ok:true,httpStatus:response.status,latencyMs:Date.now()-started,retryAfter:null,data:await response.json(),error:null,url:url.toString()};
  }catch(error){return {ok:false,httpStatus:null,latencyMs:Date.now()-started,retryAfter:null,data:null,error:String(error?.message||error),url:url.toString()};}
}

function weatherSeries(series){
  const text=[series?.ticker,series?.title,series?.category,series?.tags].flat().filter(Boolean).join(" ").toLowerCase();
  return WEATHER_TERMS.some(t=>text.includes(t));
}

export async function discoverOpenMarkets({limit=500}={}) {
  // Narrow discovery: find Weather series first, then request only markets belonging
  // to those series. This avoids the broad all-open-markets scan that Kalshi throttles.
  const sr=await getJson("/series");
  if(!sr.ok) return {ok:false,source:"KALSHI_WEATHER_SERIES",variant:"series_first",httpStatus:sr.httpStatus,latencyMs:sr.latencyMs,retryAfter:sr.retryAfter,markets:[],cursor:null,error:sr.httpStatus===429?"KALSHI_SERIES_RATE_LIMITED":"KALSHI_SERIES_DISCOVERY_FAILED",attempts:[sr]};
  const allSeries=Array.isArray(sr.data?.series)?sr.data.series:[];
  const selected=allSeries.filter(weatherSeries).filter(s=>!/(tsunami|natural disaster)/i.test([s?.ticker,s?.title,s?.category].filter(Boolean).join(" "))).slice(0,24);
  if(!selected.length) return {ok:false,source:"KALSHI_WEATHER_SERIES",variant:"series_first",httpStatus:200,latencyMs:sr.latencyMs,markets:[],cursor:null,error:"NO_WEATHER_SERIES",seriesExamined:allSeries.length,seriesSelected:0};

  const markets=[]; const attempts=[];
  for(const series of selected){
    if(markets.length>=limit) break;
    const mr=await getJson("/markets",{status:"open",series_ticker:series.ticker,limit:Math.min(100,limit-markets.length),mve_filter:"exclude"});
    attempts.push({seriesTicker:series.ticker,httpStatus:mr.httpStatus,latencyMs:mr.latencyMs,retryAfter:mr.retryAfter,error:mr.error});
    if(mr.httpStatus===429) break; // never retry-storm a throttled provider
    if(mr.ok && Array.isArray(mr.data?.markets)) markets.push(...mr.data.markets);
  }
  if(!markets.length) return {ok:false,source:"KALSHI_WEATHER_SERIES",variant:"series_first",httpStatus:attempts.find(a=>a.httpStatus)?.httpStatus||200,latencyMs:sr.latencyMs+attempts.reduce((n,a)=>n+(a.latencyMs||0),0),markets:[],cursor:null,error:attempts.some(a=>a.httpStatus===429)?"KALSHI_WEATHER_MARKETS_RATE_LIMITED":"NO_OPEN_WEATHER_MARKETS",seriesExamined:allSeries.length,seriesSelected:selected.length,weatherSeries:selected.map(s=>({ticker:s.ticker,title:s.title||null})),attempts};
  return {ok:true,source:"KALSHI_WEATHER_SERIES",variant:"series_first",httpStatus:200,latencyMs:sr.latencyMs+attempts.reduce((n,a)=>n+(a.latencyMs||0),0),markets:markets.slice(0,limit),cursor:null,attemptCount:1+attempts.length,priorFailures:attempts.filter(a=>a.error),seriesExamined:allSeries.length,seriesSelected:selected.length,weatherSeries:selected.map(s=>({ticker:s.ticker,title:s.title||null}))};
}
