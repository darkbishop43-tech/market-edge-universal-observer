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
const US_RESEARCH_CITY=/\b(new york|nyc|chicago|miami|austin|dallas|houston|los angeles|san francisco|seattle|denver|boston|philadelphia|atlanta|phoenix|charlotte)\b/i;
function selectWeatherSeries(allSeries, limit){
  const weather=allSeries.filter(weatherSeries).filter(s=>!/(tsunami|natural disaster)/i.test(seriesText(s)));
  const researchSuitable=weather.filter(s=>US_RESEARCH_CITY.test(seriesText(s)) && /temp|temperature/i.test(seriesText(s)));
  return (researchSuitable.length?researchSuitable:weather).slice(0,limit);
}

export async function discoverOpenMarkets({limit=2,seriesTickers=[]}={}) {
  // Deterministic Weather contract discovery: query known governed Weather series
  // directly instead of hoping a Weather contract appears in a generic market page.
  const requested=[...new Set((seriesTickers||[]).map(x=>String(x||"").trim().toUpperCase()).filter(x=>/^[A-Z0-9_-]{2,40}$/.test(x)))].slice(0,Math.max(1,limit));
  if(!requested.length) return {ok:false,source:"KALSHI_SERIES_MARKETS",variant:"governed_series_direct",httpStatus:null,markets:[],error:"NO_GOVERNED_WEATHER_SERIES"};

  const attempts=[];
  const found=[];
  for(const ticker of requested){
    const mr=await getJson("/markets",{series_ticker:ticker,status:"open",limit:100,mve_filter:"exclude"});
    attempts.push({seriesTicker:ticker,ok:mr.ok,httpStatus:mr.httpStatus,latencyMs:mr.latencyMs,retryAfter:mr.retryAfter,error:mr.error});
    if(!mr.ok) continue;
    const markets=Array.isArray(mr.data?.markets)?mr.data.markets:[];
    for(const m of markets){
      if(!m?.ticker || found.some(x=>x.ticker===m.ticker)) continue;
      found.push(m);
      if(found.length>=limit) break;
    }
    if(found.length>=limit) break;
  }
  if(found.length) return {ok:true,source:"KALSHI_SERIES_MARKETS",variant:"governed_series_direct",httpStatus:200,markets:found.slice(0,limit),attemptCount:attempts.length,attempts,seriesTickers:requested};
  const rateLimited=attempts.some(x=>x.httpStatus===429);
  return {ok:false,source:"KALSHI_SERIES_MARKETS",variant:"governed_series_direct",httpStatus:rateLimited?429:(attempts.find(x=>x.httpStatus)?.httpStatus||200),markets:[],error:rateLimited?"KALSHI_SERIES_MARKETS_RATE_LIMITED":"NO_OPEN_CONTRACTS_FOR_GOVERNED_WEATHER_SERIES",attempts,seriesTickers:requested};
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
