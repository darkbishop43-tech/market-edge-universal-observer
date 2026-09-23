const KALSHI_BASE = "https://api.elections.kalshi.com/trade-api/v2";

const WEATHER_PATTERNS = [
  /\bweather\b/i,
  /\btemperatures?\b/i,
  /\b(?:daily|monthly|weekly|hourly|average|avg|maximum|max|minimum|min|highest|lowest|high|low|directional)\s+(?:[a-z]+\s+){0,3}temp(?:erature)?s?\b/i,
  /\btemp(?:erature)?s?\s+(?:in|at|for|of)\b/i,
  /\brain(?:fall|y|ing)?\b/i,
  /\bprecipitation\b/i,
  /\bsnow(?:fall|y|ing)?\b/i,
  /\bhurricanes?\b/i,
  /\btropical storms?\b/i,
  /\btornado(?:es)?\b/i,
  /\bheat(?:\s+waves?|wave|waves|\s+warning|warning)?\b/i,
  /\bclimate\b/i,
  /\bel ni(?:n|ñ)o\b/i,
  /\bsea ice\b/i,
  /\bheating degree days?\b/i,
  /\bdegrees?\s+(?:fahrenheit|celsius)\b/i,
];

const NON_WEATHER_PATTERNS = [
  /\bmarket share\b/i,
  /\bbusiness climate\b/i,
  /\b(?:approve|approval|project|transmission)\b.*\bwind\b|\bwind\b.*\b(?:approve|approval|project|transmission)\b/i,
  /\b(?:mountain|resort)\b.*\b(?:opening|closing)\b|\b(?:opening|closing)\b.*\b(?:mountain|resort)\b/i,
];

async function getJson(path, params={}) {
  const url=new URL(KALSHI_BASE+path);
  for(const [k,v] of Object.entries(params)) if(v!=null) url.searchParams.set(k,String(v));
  const started=Date.now();
  try{
    const response=await fetch(url,{headers:{accept:"application/json","user-agent":"market-edge-universal-observer/0.5.6"},cache:"no-store"});
    const retryAfter=response.headers.get("retry-after");
    if(!response.ok) return {ok:false,httpStatus:response.status,latencyMs:Date.now()-started,retryAfter:retryAfter||null,data:null,error:"HTTP_"+response.status,url:url.toString()};
    return {ok:true,httpStatus:response.status,latencyMs:Date.now()-started,retryAfter:null,data:await response.json(),error:null,url:url.toString()};
  }catch(error){return {ok:false,httpStatus:null,latencyMs:Date.now()-started,retryAfter:null,data:null,error:String(error?.message||error),url:url.toString()};}
}

function seriesText(series){return [series?.ticker,series?.title].flat().filter(Boolean).join(" ");}
function weatherSeries(series){
  const text=seriesText(series);
  return WEATHER_PATTERNS.some(pattern=>pattern.test(text)) && !NON_WEATHER_PATTERNS.some(pattern=>pattern.test(text));
}
function selectWeatherSeries(allSeries, limit){
  return allSeries.filter(weatherSeries).filter(s=>!/(tsunami|natural disaster)/i.test(seriesText(s))).slice(0,limit);
}

export async function discoverOpenMarkets({limit=500}={}) {
  const sr=await getJson("/series");
  if(!sr.ok) return {ok:false,source:"KALSHI_WEATHER_SERIES",variant:"series_first",httpStatus:sr.httpStatus,latencyMs:sr.latencyMs,retryAfter:sr.retryAfter,markets:[],cursor:null,error:sr.httpStatus===429?"KALSHI_SERIES_RATE_LIMITED":"KALSHI_SERIES_DISCOVERY_FAILED",attempts:[sr]};
  const allSeries=Array.isArray(sr.data?.series)?sr.data.series:[];
  const selected=selectWeatherSeries(allSeries,24);
  if(!selected.length) return {ok:false,source:"KALSHI_WEATHER_SERIES",variant:"series_first",httpStatus:200,latencyMs:sr.latencyMs,markets:[],cursor:null,error:"NO_WEATHER_SERIES",seriesExamined:allSeries.length,seriesSelected:0};
  const markets=[]; const attempts=[];
  for(const series of selected){
    if(markets.length>=limit) break;
    const mr=await getJson("/markets",{status:"open",series_ticker:series.ticker,limit:Math.min(100,limit-markets.length),mve_filter:"exclude"});
    attempts.push({seriesTicker:series.ticker,httpStatus:mr.httpStatus,latencyMs:mr.latencyMs,retryAfter:mr.retryAfter,error:mr.error});
    if(mr.httpStatus===429) break;
    if(mr.ok && Array.isArray(mr.data?.markets)) markets.push(...mr.data.markets);
  }
  if(!markets.length) return {ok:false,source:"KALSHI_WEATHER_SERIES",variant:"series_first",httpStatus:attempts.find(a=>a.httpStatus)?.httpStatus||200,latencyMs:sr.latencyMs+attempts.reduce((n,a)=>n+(a.latencyMs||0),0),markets:[],cursor:null,error:attempts.some(a=>a.httpStatus===429)?"KALSHI_WEATHER_MARKETS_RATE_LIMITED":"NO_OPEN_WEATHER_MARKETS",seriesExamined:allSeries.length,seriesSelected:selected.length,weatherSeries:selected.map(s=>({ticker:s.ticker,title:s.title||null})),attempts};
  return {ok:true,source:"KALSHI_WEATHER_SERIES",variant:"series_first",httpStatus:200,latencyMs:sr.latencyMs+attempts.reduce((n,a)=>n+(a.latencyMs||0),0),markets:markets.slice(0,limit),cursor:null,attemptCount:1+attempts.length,priorFailures:attempts.filter(a=>a.error),seriesExamined:allSeries.length,seriesSelected:selected.length,weatherSeries:selected.map(s=>({ticker:s.ticker,title:s.title||null}))};
}

export async function discoverWeatherSeriesCatalog() {
  const sr=await getJson("/series");
  if(!sr.ok) return {ok:false,httpStatus:sr.httpStatus,error:sr.httpStatus===429?"KALSHI_SERIES_RATE_LIMITED":"KALSHI_SERIES_DISCOVERY_FAILED",seriesExamined:0,weatherSeries:[]};
  const allSeries=Array.isArray(sr.data?.series)?sr.data.series:[];
  const selected=selectWeatherSeries(allSeries,50);
  return {ok:true,source:"KALSHI_SERIES_CATALOG",seriesExamined:allSeries.length,weatherSeries:selected.map(s=>({ticker:s.ticker,title:s.title||null,category:s.category||null}))};
}


export async function discoverSeriesMarkets(seriesTicker) {
  const ticker=String(seriesTicker||"").trim().toUpperCase();
  if(!/^[A-Z0-9_-]{2,40}$/.test(ticker)) return {ok:false,error:"INVALID_SERIES_TICKER",markets:[]};
  const mr=await getJson("/markets",{series_ticker:ticker,limit:100,mve_filter:"exclude"});
  if(!mr.ok) return {ok:false,seriesTicker:ticker,httpStatus:mr.httpStatus,retryAfter:mr.retryAfter,error:mr.httpStatus===429?"KALSHI_SERIES_MARKETS_RATE_LIMITED":"KALSHI_SERIES_MARKETS_FAILED",markets:[]};
  const markets=Array.isArray(mr.data?.markets)?mr.data.markets:[];
  return {ok:true,seriesTicker:ticker,httpStatus:mr.httpStatus,markets:markets.map(m=>({ticker:m.ticker||null,title:m.title||null,subtitle:m.subtitle||null,status:m.status||null,openTime:m.open_time||null,closeTime:m.close_time||null,yesAsk:m.yes_ask??null,yesBid:m.yes_bid??null,noAsk:m.no_ask??null,noBid:m.no_bid??null,rulesPrimary:m.rules_primary||null}))};
}
