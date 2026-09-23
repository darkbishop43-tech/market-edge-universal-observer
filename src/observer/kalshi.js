const KALSHI_BASE = "https://external-api.kalshi.com/trade-api/v2";

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

const sleep=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));

async function getJson(path, params={}, {max429Retries=2}={}) {
  const url=new URL(KALSHI_BASE+path);
  for(const [k,v] of Object.entries(params)) if(v!=null) url.searchParams.set(k,String(v));
  const started=Date.now();
  try{
    let response=null;
    let retryCount=0;
    do {
      response=await fetch(url,{headers:{accept:"application/json","user-agent":"market-edge-universal-observer/0.5.25"},cache:"no-store"});
      if(response.status!==429 || retryCount>=max429Retries) break;
      await sleep(500*Math.pow(2,retryCount));
      retryCount++;
    } while(true);
    const retryAfter=response.headers.get("retry-after");
    if(!response.ok) return {ok:false,httpStatus:response.status,latencyMs:Date.now()-started,retryAfter:retryAfter||null,retryCount,data:null,error:"HTTP_"+response.status,url:url.toString()};
    return {ok:true,httpStatus:response.status,latencyMs:Date.now()-started,retryAfter:null,retryCount,data:await response.json(),error:null,url:url.toString()};
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

export async function discoverOpenMarkets({limit=2,seriesTickers=[],maxSeriesScan=12}={}) {
  // Authoritative Weather discovery path: series -> open events -> nested markets.
  const requested=[...new Set((seriesTickers||[]).map(x=>String(x||"").trim().toUpperCase()).filter(x=>/^[A-Z0-9_-]{2,40}$/.test(x)))].slice(0,Math.max(1,maxSeriesScan));
  if(!requested.length) return {ok:false,source:"KALSHI_SERIES_EVENTS",variant:"open_events_nested_markets",markets:[],error:"NO_GOVERNED_WEATHER_SERIES"};
  const attempts=[], found=[];
  for(const ticker of requested){
    let cursor=null, pages=0;
    do {
      const er=await getJson("/events",{series_ticker:ticker,status:"open",with_nested_markets:"true",limit:100,cursor:cursor||undefined});
      pages++;
      attempts.push({seriesTicker:ticker,page:pages,ok:er.ok,httpStatus:er.httpStatus,latencyMs:er.latencyMs,retryAfter:er.retryAfter,error:er.error});
      if(!er.ok) break;
      const events=Array.isArray(er.data?.events)?er.data.events:[];
      for(const event of events){
        const markets=Array.isArray(event?.markets)?event.markets:[];
        for(const m of markets){
          if(!m?.ticker || found.some(x=>x.ticker===m.ticker)) continue;
          found.push({...m,event_ticker:event?.event_ticker||event?.ticker||null,event_title:event?.title||null});
          if(found.length>=limit) break;
        }
        if(found.length>=limit) break;
      }
      cursor=er.data?.cursor||null;
    } while(cursor && pages<3 && found.length<limit);
    if(found.length>=limit) break;
  }
  if(found.length) return {ok:true,source:"KALSHI_SERIES_EVENTS",variant:"open_events_nested_markets",httpStatus:200,markets:found.slice(0,limit),attemptCount:attempts.length,attempts,seriesTickers:requested};
  const rateLimited=attempts.some(x=>x.httpStatus===429);
  return {ok:false,source:"KALSHI_SERIES_EVENTS",variant:"open_events_nested_markets",httpStatus:rateLimited?429:(attempts.find(x=>x.httpStatus)?.httpStatus||200),markets:[],error:rateLimited?"KALSHI_EVENTS_RATE_LIMITED":"NO_OPEN_NESTED_MARKETS_FOR_GOVERNED_WEATHER_SERIES",attempts,seriesTickers:requested};
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

  // Use the same authoritative Weather hierarchy as the seed path:
  // series -> open events -> nested markets. This avoids a separate direct
  // series /markets lookup that can be rate-limited independently.
  let cursor=null, pages=0;
  const markets=[];
  do {
    const er=await getJson("/events",{series_ticker:ticker,status:"open",with_nested_markets:"true",limit:100,cursor:cursor||undefined});
    pages++;
    if(!er.ok) return {
      ok:false,
      seriesTicker:ticker,
      httpStatus:er.httpStatus,
      retryAfter:er.retryAfter,
      error:er.httpStatus===429?"KALSHI_SERIES_EVENTS_RATE_LIMITED":"KALSHI_SERIES_EVENTS_FAILED",
      markets:[]
    };
    for(const event of (Array.isArray(er.data?.events)?er.data.events:[])) {
      for(const m of (Array.isArray(event?.markets)?event.markets:[])) {
        if(!m?.ticker || markets.some(x=>x.ticker===m.ticker)) continue;
        markets.push({
          eventTicker:event?.event_ticker||event?.ticker||null,
          eventTitle:event?.title||null,
          ticker:m.ticker||null,
          title:m.title||null,
          subtitle:m.subtitle||null,
          status:m.status||null,
          openTime:m.open_time||null,
          closeTime:m.close_time||null,
          yesAsk:m.yes_ask??null,
          yesBid:m.yes_bid??null,
          noAsk:m.no_ask??null,
          noBid:m.no_bid??null,
          rulesPrimary:m.rules_primary||null
        });
      }
    }
    cursor=er.data?.cursor||null;
  } while(cursor && pages<3);

  return {ok:true,seriesTicker:ticker,httpStatus:200,source:"KALSHI_SERIES_EVENTS",variant:"open_events_nested_markets",markets};
}
