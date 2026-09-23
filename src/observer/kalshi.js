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

export async function discoverOpenMarkets({limit=500}={}) {
  // Contract discovery is intentionally independent from /series catalog discovery.
  // Kalshi market rows already carry series_ticker, so one bounded open-markets
  // request avoids a second /series call and the fragile series->event join.
  const mr=await getJson("/markets",{status:"open",limit:Math.min(100,Math.max(20,limit*20)),mve_filter:"exclude"});
  if(!mr.ok) return {ok:false,source:"KALSHI_OPEN_MARKETS",variant:"bounded_open_markets",httpStatus:mr.httpStatus,latencyMs:mr.latencyMs,retryAfter:mr.retryAfter,markets:[],cursor:null,error:mr.httpStatus===429?"KALSHI_OPEN_MARKETS_RATE_LIMITED":"KALSHI_OPEN_MARKETS_FAILED",attempts:[mr]};
  const all=Array.isArray(mr.data?.markets)?mr.data.markets:[];
  const weather=all.filter(m=>weatherSeries({ticker:m?.series_ticker||m?.ticker,title:[m?.title,m?.subtitle].filter(Boolean).join(" ")}));
  const suitable=weather.filter(m=>US_RESEARCH_CITY.test([m?.title,m?.subtitle,m?.series_ticker].filter(Boolean).join(" ")) && /temp|temperature/i.test([m?.title,m?.subtitle,m?.series_ticker].filter(Boolean).join(" ")));
  const selected=(suitable.length?suitable:weather).slice(0,limit);
  if(!selected.length) return {ok:false,source:"KALSHI_OPEN_MARKETS",variant:"bounded_open_markets",httpStatus:200,latencyMs:mr.latencyMs,markets:[],cursor:mr.data?.cursor||null,error:"NO_OPEN_WEATHER_MARKETS_IN_BOUNDED_PAGE",marketsExamined:all.length};
  return {ok:true,source:"KALSHI_OPEN_MARKETS",variant:"bounded_open_markets",httpStatus:200,latencyMs:mr.latencyMs,markets:selected,cursor:mr.data?.cursor||null,attemptCount:1,marketsExamined:all.length,weatherMarketsFound:weather.length};
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
