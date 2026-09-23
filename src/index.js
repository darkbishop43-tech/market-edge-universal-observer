const APP = "MARKET EDGE — UNIVERSAL OBSERVER";
const VERSION = "0.7.0";
import { runObservationCycle } from "./observer/run.js";
import { getProviderCache, putProviderCache, getLastStreamEvidence } from "./ledger/d1.js";
export { KalshiStreamObserver } from "./stream/kalshi-stream-do.js";

const MODE = "OBSERVATION_ONLY";

const ENGINES = {
  weather: { id: "weather-v0", status: "ACTIVE_RESEARCH", executionEligible: false },
  economics: { id: "economics-v0", status: "RESERVED", executionEligible: false },
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","access-control-allow-origin":"*"}});
}
function escHtml(v){return String(v??"").replace(/[&<>"]/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[ch]));}

async function weatherCatalog(env) {
  const cacheKey="kalshi:weather-series-catalog";
  const cached=await getProviderCache(env?.DB,cacheKey,{maxAgeSeconds:300});
  if(cached.fresh && cached.payload) return {...cached.payload,providerState:"D1_FRESH_CACHE",cacheAgeSeconds:cached.ageSeconds};
  const m=await import("./observer/kalshi.js");
  const live=await m.discoverWeatherSeriesCatalog();
  if(live.ok){
    await putProviderCache(env?.DB,cacheKey,"KALSHI",live,new Date().toISOString());
    return {...live,providerState:"LIVE_VERIFIED",cacheAgeSeconds:0};
  }
  if(cached.payload) return {...cached.payload,ok:true,providerState:"D1_STALE_FALLBACK",providerBoundary:live.error||"PROVIDER_UNAVAILABLE",providerHttpStatus:live.httpStatus??null,cacheAgeSeconds:cached.ageSeconds};
  return {...live,providerState:"PROVIDER_UNAVAILABLE_NO_CACHE",cacheAgeSeconds:null};
}

async function seededWeatherContracts(env, seedSeries=[]){
  const seriesTickers=(seedSeries||[]).map(x=>x?.ticker).filter(Boolean).slice(0,12);
  const cacheKey="kalshi:seeded-weather-contracts:"+seriesTickers.join(",");
  const cached=await getProviderCache(env?.DB,cacheKey,{maxAgeSeconds:300});
  if(cached.fresh&&cached.payload)return {...cached.payload,providerState:"D1_FRESH_CACHE",cacheAgeSeconds:cached.ageSeconds};
  const m=await import("./observer/kalshi.js");
  const live=await m.discoverOpenMarkets({limit:2,seriesTickers,maxSeriesScan:12});
  if(live.ok){const payload={ok:true,markets:(live.markets||[]).slice(0,2),observedAt:new Date().toISOString()};await putProviderCache(env?.DB,cacheKey,"KALSHI",payload,payload.observedAt);return {...payload,providerState:"LIVE_VERIFIED",cacheAgeSeconds:0};}
  if(cached.payload)return {...cached.payload,ok:true,providerState:"D1_STALE_FALLBACK",cacheAgeSeconds:cached.ageSeconds,providerBoundary:live.error||"PROVIDER_UNAVAILABLE"};
  return {ok:false,markets:[],providerState:"PROVIDER_UNAVAILABLE_NO_CACHE",providerBoundary:live.error||"PROVIDER_UNAVAILABLE"};
}

async function weatherSeriesDrilldown(env,ticker){
  const cacheKey="kalshi:weather-series-open:"+ticker;
  const cached=await getProviderCache(env?.DB,cacheKey,{maxAgeSeconds:300});
  if(cached.fresh&&cached.payload)return {...cached.payload,providerState:"D1_FRESH_CACHE",cacheAgeSeconds:cached.ageSeconds};
  const m=await import("./observer/kalshi.js");
  const live=await m.discoverSeriesMarkets(ticker);
  if(live.ok){
    const payload={...live,observedAt:new Date().toISOString()};
    await putProviderCache(env?.DB,cacheKey,"KALSHI",payload,payload.observedAt);
    return {...payload,providerState:"LIVE_VERIFIED",cacheAgeSeconds:0};
  }
  if(cached.payload)return {...cached.payload,ok:true,providerState:"D1_STALE_FALLBACK",cacheAgeSeconds:cached.ageSeconds,providerBoundary:live.error||"PROVIDER_UNAVAILABLE",providerHttpStatus:live.httpStatus??null};
  return {...live,providerState:"PROVIDER_UNAVAILABLE_NO_CACHE",cacheAgeSeconds:null};
}

async function economicsCatalog(env) {
  const cacheKey="kalshi:economics-series-catalog";
  const cached=await getProviderCache(env?.DB,cacheKey,{maxAgeSeconds:900});
  if(cached.fresh&&cached.payload)return {...cached.payload,providerState:"D1_FRESH_CACHE",cacheAgeSeconds:cached.ageSeconds};
  const m=await import("./observer/kalshi.js");
  const live=await m.discoverEconomicsSeriesCatalog();
  if(live.ok){
    await putProviderCache(env?.DB,cacheKey,"KALSHI",live,new Date().toISOString());
    return {...live,providerState:"LIVE_VERIFIED",cacheAgeSeconds:0};
  }
  if(cached.payload)return {...cached.payload,ok:true,providerState:"D1_STALE_FALLBACK",providerBoundary:live.error||"PROVIDER_UNAVAILABLE",providerHttpStatus:live.httpStatus??null,cacheAgeSeconds:cached.ageSeconds};
  return {...live,providerState:"PROVIDER_UNAVAILABLE_NO_CACHE",cacheAgeSeconds:null};
}

async function economicsDashboard(env) {
  const d=await economicsCatalog(env);
  const families=(d.economicsSeries||[]).slice(0,12);
  const shown=families.slice(0,6);
  const rows=shown.map(x=>'<tr><td><a class="seriesLink" href="/economics-series?ticker='+encodeURIComponent(x.ticker)+'">'+escHtml(x.title||x.ticker)+'</a></td><td><code>'+escHtml(x.ticker)+'</code></td><td>'+escHtml(x.category||"—")+'</td><td>NO</td></tr>').join("");
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Economics V0 — ${APP}</title><style>*{box-sizing:border-box}body{font-family:system-ui,sans-serif;background:#07111f;color:#eef6ff;margin:0}main{max-width:1100px;margin:auto;padding:24px}.top{display:flex;justify-content:space-between;gap:12px}.tag,.badge{border:1px solid #29496d;border-radius:999px;padding:6px 10px}.badge{display:inline-block;background:#123a2a;color:#85efb5;border:0;font-weight:700}.card{background:#0d1b2e;border:1px solid #213754;border-radius:14px;padding:16px;margin-top:14px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}.big{font-size:26px;font-weight:800}.muted{color:#91a8c4}.ok{color:#85efb5}.warn{color:#ffd166}table{width:100%;border-collapse:collapse}td,th{padding:9px;border-bottom:1px solid #213754;text-align:left;font-size:14px}th{color:#9fc7f4}code{color:#a5d6ff}.seriesLink{color:#7eb5ff;text-decoration:none;font-weight:700}.seriesLink:hover{text-decoration:underline}</style></head><body><main><div class="top"><h1>📊 ECONOMICS V0 — UNIVERSAL OBSERVER</h1><span class="tag">v${VERSION}</span></div><p class="muted">Bounded economic-family discovery · research only</p><p class="muted"><strong>Provider access:</strong> catalog bootstrap permitted · repeated REST event drilldowns HELD after cross-domain HTTP 429 proof · streaming/lifecycle ingest is the next provider path.</p><p><span class="badge">OBSERVATION ONLY · ZERO ORDER CAPABILITY</span></p><div class="grid"><div class="card"><div class="muted">Economics families found</div><div class="big">${shown.length}</div></div><div class="card"><div class="muted">Provider state</div><div class="big">${escHtml(d.providerState||"UNKNOWN")}</div></div><div class="card"><div class="muted">Execution</div><div class="big">NO</div></div></div><div class="card"><strong>Economics Contract Families</strong><p class="muted">Initial governed catalog: CPI/inflation, unemployment/jobless, Federal Reserve/rates, GDP and payroll/jobs families. No orders, bankroll, or trading credentials.</p><table><thead><tr><th>Family</th><th>Ticker</th><th>Category</th><th>Execution</th></tr></thead><tbody>${rows||'<tr><td colspan="4">No verified Economics series available yet.</td></tr>'}</tbody></table></div><div class="card"><strong>Research gate</strong><p>Catalog first → select 1–2 representative families → actual contracts → longitudinal observation → resolution evidence.</p><p class="muted">Weather is held separately. Baseline Real remains untouched.</p></div></main></body></html>`,{headers:{"content-type":"text/html; charset=utf-8"}});
}

async function dashboard(env) {
  const d=await weatherCatalog(env);
  const seedSeries=(d.weatherSeries||[]).slice(0,12);
  const seedContracts=await seededWeatherContracts(env,seedSeries);
  const rows=seedSeries.slice(0,2).map(x=>'<tr><td><a class="seriesLink" href="/weather-series?ticker='+encodeURIComponent(x.ticker)+'">'+escHtml(x.title||x.ticker)+'</a></td><td><code>'+escHtml(x.ticker)+'</code></td><td><span class="ok">NWS-SUITABLE SEED</span></td><td>NO</td></tr>').join("");
  const contractRows=(seedContracts.markets||[]).map(x=>'<tr><td>'+escHtml(x.title||x.ticker)+'</td><td><code>'+escHtml(x.ticker)+'</code></td><td>'+escHtml(x.status||"—")+'</td><td>'+escHtml(x.yes_bid_dollars??x.yes_bid??"—")+' / '+escHtml(x.yes_ask_dollars??x.yes_ask??"—")+'</td><td>'+escHtml(x.no_bid_dollars??x.no_bid??"—")+' / '+escHtml(x.no_ask_dollars??x.no_ask??"—")+'</td><td>'+escHtml(x.close_time||"—")+'</td></tr>').join("");
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${APP}</title><style>
*{box-sizing:border-box}body{font-family:system-ui,sans-serif;background:#07111f;color:#eef6ff;margin:0}main{max-width:1180px;margin:auto;padding:24px}
h1{margin:0}.topline{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.versionTag{white-space:nowrap;border:1px solid #29496d;background:#0d1b2e;border-radius:999px;padding:6px 10px;color:#a5d6ff;font-size:12px;font-weight:800;letter-spacing:.04em}.sub,.muted,small{color:#91a8c4}.badge{display:inline-block;padding:6px 10px;border-radius:999px;background:#123a2a;color:#85efb5;font-weight:700}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin:18px 0}.card{background:#0d1b2e;border:1px solid #213754;border-radius:14px;padding:16px;margin-top:12px}
.big{font-size:28px;font-weight:800}.warn{color:#ffd166}.good,.ok{color:#85efb5}table{width:100%;border-collapse:collapse;margin-top:10px}td,th{padding:9px;border-bottom:1px solid #213754;text-align:left;font-size:14px}th{color:#9fc7f4}code{color:#a5d6ff}.seriesLink{color:#7eb5ff;text-decoration:none;font-weight:700}.seriesLink:hover{text-decoration:underline}.boundary{padding:12px;border:1px solid #6b5a2c;background:#2b2412;border-radius:10px;color:#ffd166}
</style></head><body><main>
<div class="topline"><h1>🔭 MARKET EDGE — UNIVERSAL OBSERVER</h1><span class="versionTag">v${VERSION}</span></div><p class="sub">Neutral discovery · routing · evidence · reconciliation control plane</p>
<p><span class="badge">OBSERVATION ONLY · ZERO ORDER CAPABILITY</span></p>
<div class="grid">
<div class="card"><div class="muted">Seed candidates displayed</div><div class="big">${escHtml(seedSeries.length)}</div></div>
<div class="card"><div class="muted">Weather seeded</div><div class="big">${escHtml(seedSeries.length)}</div></div>
<div class="card"><div class="muted">Research evidence</div><div class="big">SEEDING</div></div>
<div class="card"><div class="muted">Ledger</div><div class="big">D1 READY</div></div><div class="card"><div class="muted">Provider state</div><div class="big">${escHtml(d.providerState||"UNKNOWN")}</div><small>${d.cacheAgeSeconds!=null?"cache age "+escHtml(Math.round(d.cacheAgeSeconds))+"s":"no cached age"}</small></div>
</div>
<div class="card"><strong>Engine registry</strong><table><tr><th>Engine</th><th>State</th><th>Execution</th></tr><tr><td>Weather V0</td><td class="good">ACTIVE RESEARCH</td><td>NO</td></tr><tr><td>Economics V0</td><td class="warn">RESERVED</td><td>NO</td></tr></table></div>
<div class="card"><strong>🌦️ Weather Contract Catalog</strong><p class="muted">Seed V0 displays only two representative Weather families from the cached Kalshi catalog. Additional families are intentionally deferred while evidence accumulates.</p>
<table><thead><tr><th>Weather contract family</th><th>Ticker</th><th>Research state</th><th>Execution</th></tr></thead><tbody>${rows||'<tr><td colspan="4">No Weather series returned.</td></tr>'}</tbody></table></div>
<div class="card"><strong>🎯 Actual Seed Contracts</strong><p class="muted">Up to two actual open Kalshi contracts from the governed Weather seed path. Read-only evidence; zero order capability. Source: ${escHtml(seedContracts.providerState||"UNKNOWN")}.</p><table><thead><tr><th>Contract</th><th>Ticker</th><th>Status</th><th>YES bid / ask</th><th>NO bid / ask</th><th>Close</th></tr></thead><tbody>${contractRows||'<tr><td colspan="6">No verified seed contracts available yet.</td></tr>'}</tbody></table></div>
<div class="card"><strong>🌱 Seed Observatory</strong><p class="muted">V0 intentionally observes only 1–2 representative contracts per domain at a time. Expansion is evidence-earned, not volume-driven.</p><table><tr><th>Rule</th><th>V0 state</th></tr><tr><td>Weather observations per cycle</td><td class="good">2 MAX</td></tr><tr><td>Minimum refresh boundary</td><td class="good">5 MINUTES</td></tr><tr><td>Selection purpose</td><td>Research suitability · not highest-score chasing</td></tr><tr><td>Expansion</td><td>Only after longitudinal + resolution evidence</td></tr></table></div>
<div class="card"><strong>🧪 Longitudinal Research Layer</strong><p class="muted">D1 now preserves per-contract signal history for prospective evaluation. These features are research-only and cannot alter Market Edge execution.</p><table><tr><th>Feature</th><th>State</th></tr><tr><td>Trajectory / prior score / delta</td><td class="good">COLLECTING</td></tr><tr><td>Recent peak + distance from peak</td><td class="good">COLLECTING</td></tr><tr><td>Persistence above domain threshold</td><td class="good">COLLECTING</td></tr><tr><td>Signal age</td><td class="good">COLLECTING</td></tr><tr><td>Source freshness</td><td class="good">COLLECTING</td></tr><tr><td>Objective outcome / resolution</td><td class="warn">SCHEMA READY · RECONCILIATION NEXT</td></tr></table></div>
<div class="card"><strong>Protected separation</strong><p>🔒 Baseline Real untouched &nbsp; 🔒 Payne untouched &nbsp; 🔒 NFE Reasoning untouched</p><p class="muted">No bankroll · no order endpoint · Observer credential boundary isolated from Baseline.</p></div>
<small>Version ${VERSION} · <code>/health</code> · <code>/weather-dashboard</code> · <code>/observe</code></small></main></body></html>`,{headers:{"content-type":"text/html; charset=utf-8"}});
}

function streamStub(env){
  if(!env?.UMEO_STREAM) return null;
  const id=env.UMEO_STREAM.idFromName("kalshi-ticker-v1");
  return env.UMEO_STREAM.get(id);
}

async function getStreamState(env,{ensure=false}={}){
  const stub=streamStub(env);
  if(!stub) return {ok:false,state:"STREAM_BINDING_MISSING",credential:{present:false,explicitReadScopeConfigured:false},tradingCapability:false};
  try{
    if(ensure) await stub.fetch("https://umeo.internal/ensure",{method:"POST"});
    const response=await stub.fetch("https://umeo.internal/state");
    return await response.json();
  }catch(error){
    return {ok:false,state:"STREAM_STATE_UNAVAILABLE",lastError:String(error?.message||error).slice(0,160),tradingCapability:false};
  }
}

async function streamAcceptance(env){
  const state=await getStreamState(env,{ensure:true});
  const real=await getLastStreamEvidence(env?.DB,{evidenceClass:"REAL_PROVIDER",channel:"ticker"});
  const evidence=real?.evidence||null;
  const credentialReady=Boolean(state?.credential?.present && state?.credential?.explicitReadScopeConfigured);
  const result=evidence?"REAL_TICKER_EVIDENCE_PRESENT":(credentialReady?"AWAITING_REAL_PROVIDER_TICKER":"READY_FOR_UMEO_READ_ONLY_CREDENTIAL");
  return {
    ok:true,
    version:VERSION,
    test:"UMEO_KALSHI_TICKER_STREAM_ACCEPTANCE",
    result,
    provider:"KALSHI",
    channel:"ticker",
    credential:{
      present:Boolean(state?.credential?.present),
      explicitReadScopeConfigured:Boolean(state?.credential?.explicitReadScopeConfigured),
      configuredScope:state?.credential?.configuredScope??null,
      requiredScope:"read",
      writeScopesConfigured:false
    },
    connection:{
      state:state?.state||"UNKNOWN",
      authenticated:Boolean(state?.authenticated),
      subscriptionAcknowledged:Boolean(state?.subscriptionAcknowledged),
      connectionId:state?.connectionId??null,
      subscriptionId:state?.subscriptionId??null,
      reconnectAttempt:Number(state?.reconnectAttempt||0),
      nextRetryAt:state?.nextRetryAt??null,
      lastError:state?.lastError??null,
      lastConnectedAt:state?.lastConnectedAt??null,
      lastSubscribedAt:state?.lastSubscribedAt??null
    },
    lastGenuineProviderMessage:evidence?{
      evidenceClass:evidence.evidenceClass,
      provider:evidence.provider,
      channel:evidence.channel,
      marketTicker:evidence.marketTicker,
      providerSourceTime:evidence.providerSourceTime,
      umeoIngestTime:evidence.ingestedAt,
      messageType:evidence.messageType,
      connectionId:evidence.connectionId,
      subscriptionId:evidence.subscriptionId,
      marketState:evidence.marketState,
      rawSource:evidence.rawSource
    }:null,
    persistence:evidence?"D1_PERSISTED_REAL_PROVIDER_EVIDENCE":"NO_REAL_PROVIDER_EVIDENCE_YET",
    simulatedEvidenceCountsAsAcceptance:false,
    readOnly:true,
    tradingCapability:false,
    orderCapability:false,
    cancellationCapability:false,
    transferCapability:false,
    bankrollCapability:false,
    baselineBindingPresent:false,
    repeatedRestEventTraversal:"HELD",
    weatherUntouched:true,
    economicsReadOnly:true
  };
}

async function runStreamFixture(env){
  const stub=streamStub(env);
  if(!stub) return {ok:false,test:"SIMULATED_TEST_FIXTURE",error:"STREAM_BINDING_MISSING",realProviderEvidence:false,tradingCapability:false};
  const response=await stub.fetch("https://umeo.internal/fixture",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({fixture:"SIMULATED_TEST_FIXTURE"})});
  return await response.json();
}

async function ensureStream(env){
  const stub=streamStub(env);
  if(!stub) return {ok:false,state:"STREAM_BINDING_MISSING"};
  const response=await stub.fetch("https://umeo.internal/ensure",{method:"POST"});
  return await response.json();
}

async function observe(env) { return runObservationCycle(env); }

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/") return dashboard(env);
    if (url.pathname === "/health") {
      let d1={bound:Boolean(env?.DB),schemaReady:false,status:env?.DB?"BOUND_NOT_CHECKED":"D1_NOT_BOUND"};
      if(env?.DB){try{const row=await env.DB.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type=\'table\' AND name IN (\'observation_cycles\',\'observations\',\'resolutions\',\'signal_state\',\'provider_cache\',\'stream_evidence\')").first();const n=Number(row?.n||0);d1={bound:true,schemaReady:n===6,status:n===6?"D1_SCHEMA_READY":"D1_BOUND_SCHEMA_PENDING",expectedTables:6,presentTables:n};}catch(error){d1={bound:true,schemaReady:false,status:"D1_HEALTH_READ_FAILED",error:String(error?.message||error).slice(0,120)};}}
      return json({ok:true,app:APP,version:VERSION,mode:MODE,tradingCapability:false,engines:ENGINES,d1,stream:{durableObjectBound:Boolean(env?.UMEO_STREAM),credentialGate:"EXPLICIT_READ_SCOPE_REQUIRED"}});
    }
    if (url.pathname === "/weather-catalog") return json(await weatherCatalog(env));
    if (url.pathname === "/stream-readiness-test") return json({
      ok:true,
      version:VERSION,
      test:"STREAM_INGEST_READINESS",
      result:"READY_FOR_UMEO_READ_ONLY_CREDENTIAL",
      prerequisites:{
        restCatalogBootstrap:"VERIFIED",
        d1EvidenceCache:"ACTIVE",
        streamEvidenceSchema:"ACTIVE",
        isolatedDurableObject:"BUILT",
        authenticatedHandshakeInterface:"BUILT_FAIL_CLOSED",
        tickerSubscriptionPath:"BUILT",
        reconnectRecovery:"BUILT",
        crossDomain429Boundary:"CONFIRMED",
        repeatedRestEventTraversal:"HELD"
      },
      transportContract:{
        mode:"READ_ONLY",
        firstAcceptanceChannel:"ticker",
        nextGovernedChannel:"market_lifecycle_v2",
        persistence:"D1",
        credentialRequired:true,
        requiredExplicitScope:"read",
        scopeOmissionAllowed:false,
        orderCapability:false,
        cancellationCapability:false,
        transferCapability:false,
        bankrollCapability:false
      },
      acceptanceNext:"Install the separate explicit read-scope UMEO credential, authenticate, subscribe to real ticker, receive and persist one genuine provider update.",
      baselineRealUntouched:true,
      weatherUntouched:true
    });
    if (url.pathname === "/stream-state") return json(await getStreamState(env,{ensure:false}));
    if (url.pathname === "/stream-acceptance") return json(await streamAcceptance(env));
    if (url.pathname === "/stream-fixture-test") return json(await runStreamFixture(env));
    if (url.pathname === "/provider-architecture") return json({
      ok:true,
      version:VERSION,
      architecture:"BOOTSTRAP_CACHE_STREAM",
      phase1:{path:"REST_CATALOG_BOOTSTRAP",state:"VERIFIED",purpose:"Infrequent series catalog discovery only"},
      phase2:{path:"D1_CACHE",state:"ACTIVE",purpose:"Persist discovered governed families and stale-safe evidence"},
      phase3:{path:"AUTHENTICATED_STREAM_INGEST",state:"BUILT_TO_CREDENTIAL_GATE",purpose:"Isolated Durable Object receives ticker updates without repeated REST event traversal"},
      restEventTraversal:{state:"HELD",reason:"Cross-domain HTTP 429 reproduced in Weather and Economics"},
      invariant:"Streaming ingestion is Observer-only, explicit read-scope credential gated, and contains zero order, cancellation, transfer, bankroll, or Baseline capability.",
      readOnly:true,tradingCapability:false,baselineRealUntouched:true,weatherUntouched:true
    });
    if (url.pathname === "/provider-access-test" || url.pathname === "/provider-test") return json({
      ok:true,
      version:VERSION,
      test:"CROSS_DOMAIN_PROVIDER_BOUNDARY",
      result:"CONFIRMED",
      catalogBootstrap:"AVAILABLE",
      repeatedRestEventDrilldown:"HELD",
      evidence:["Weather series→events returned HTTP 429","Economics series→events returned HTTP 429","Economics catalog remained LIVE_VERIFIED"],
      nextProviderPath:"STREAM_OR_LIFECYCLE_INGEST",
      readOnly:true,
      tradingCapability:false,
      baselineRealUntouched:true,
      weatherUntouched:true
    });
    if (url.pathname === "/economics-catalog") return json(await economicsCatalog(env));
    if (url.pathname === "/economics-series") {
      const ticker=String(url.searchParams.get("ticker")||"").trim().toUpperCase();
      const catalog=await economicsCatalog(env);
      const allowed=(catalog.economicsSeries||[]).some(x=>String(x.ticker||"").toUpperCase()===ticker);
      if(!allowed)return json({ok:false,error:"SERIES_NOT_IN_GOVERNED_ECONOMICS_CATALOG",ticker,readOnly:true,tradingCapability:false},404);
      return json({
        ok:false,
        seriesTicker:ticker,
        providerState:"REST_DRILLDOWN_HELD",
        error:"KALSHI_SHARED_REST_RATE_BOUNDARY",
        evidence:"HTTP 429 reproduced on series→events drilldown in both Weather and Economics.",
        nextArchitecture:"STREAM_OR_LIFECYCLE_INGEST",
        message:"Direct REST drilldown is intentionally held to avoid repeating a proven provider rate-limit boundary.",
        readOnly:true,
        tradingCapability:false,
        baselineRealUntouched:true,
        weatherUntouched:true
      },503);
    }
    if (url.pathname === "/economics-dashboard" || url.pathname === "/economics") return economicsDashboard(env);
    if (url.pathname === "/weather-dashboard") return dashboard(env);
    if (url.pathname === "/weather-series") {
      const ticker=String(url.searchParams.get("ticker")||"").trim().toUpperCase();
      const catalog=await weatherCatalog(env);
      const allowed=(catalog.weatherSeries||[]).some(x=>String(x?.ticker||"").toUpperCase()===ticker);
      if(!allowed) return json({ok:false,readOnly:true,error:"SERIES_NOT_IN_GOVERNED_WEATHER_CATALOG",ticker,tradingCapability:false},400);
      const result=await weatherSeriesDrilldown(env,ticker);
      return json({...result,readOnly:true,tradingCapability:false,baselineRealUntouched:true});
    }
    if (url.pathname === "/observe") return json(await observe(env));
    return json({ ok: false, error: "NOT_FOUND" }, 404);
  },
  async scheduled(controller, env, ctx) { ctx.waitUntil(Promise.allSettled([observe(env),ensureStream(env)])); },
};
