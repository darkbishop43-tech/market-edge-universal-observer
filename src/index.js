const APP = "MARKET EDGE — UNIVERSAL OBSERVER";
const VERSION = "0.5.16";
import { runObservationCycle } from "./observer/run.js";
import { getProviderCache, putProviderCache } from "./ledger/d1.js";

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

async function seededWeatherContracts(env){
  const cacheKey="kalshi:seeded-weather-contracts";
  const cached=await getProviderCache(env?.DB,cacheKey,{maxAgeSeconds:300});
  if(cached.fresh&&cached.payload)return {...cached.payload,providerState:"D1_FRESH_CACHE",cacheAgeSeconds:cached.ageSeconds};
  const m=await import("./observer/kalshi.js");
  const live=await m.discoverOpenMarkets({limit:2});
  if(live.ok){const payload={ok:true,markets:(live.markets||[]).slice(0,2),observedAt:new Date().toISOString()};await putProviderCache(env?.DB,cacheKey,"KALSHI",payload,payload.observedAt);return {...payload,providerState:"LIVE_VERIFIED",cacheAgeSeconds:0};}
  if(cached.payload)return {...cached.payload,ok:true,providerState:"D1_STALE_FALLBACK",cacheAgeSeconds:cached.ageSeconds,providerBoundary:live.error||"PROVIDER_UNAVAILABLE"};
  return {ok:false,markets:[],providerState:"PROVIDER_UNAVAILABLE_NO_CACHE",providerBoundary:live.error||"PROVIDER_UNAVAILABLE"};
}

async function dashboard(env) {
  const d=await weatherCatalog(env);
  const seedContracts=await seededWeatherContracts(env);
  const seedSeries=(d.weatherSeries||[]).slice(0,2);
  const rows=seedSeries.map(x=>'<tr><td><a class="seriesLink" data-disabled="/weather-series?ticker='+encodeURIComponent(x.ticker)+'">'+escHtml(x.title||x.ticker)+'</a></td><td><code>'+escHtml(x.ticker)+'</code></td><td><span class="ok">NWS-SUITABLE SEED</span></td><td>NO</td></tr>').join("");
  const contractRows=(seedContracts.markets||[]).map(x=>'<tr><td>'+escHtml(x.title||x.ticker)+'</td><td><code>'+escHtml(x.ticker)+'</code></td><td>'+escHtml(x.status||"—")+'</td><td>'+escHtml(x.yes_bid_dollars??x.yes_bid??"—")+' / '+escHtml(x.yes_ask_dollars??x.yes_ask??"—")+'</td><td>'+escHtml(x.no_bid_dollars??x.no_bid??"—")+' / '+escHtml(x.no_ask_dollars??x.no_ask??"—")+'</td><td>'+escHtml(x.close_time||"—")+'</td></tr>').join("");
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${APP}</title><style>
*{box-sizing:border-box}body{font-family:system-ui,sans-serif;background:#07111f;color:#eef6ff;margin:0}main{max-width:1180px;margin:auto;padding:24px}
h1{margin:0}.sub,.muted,small{color:#91a8c4}.badge{display:inline-block;padding:6px 10px;border-radius:999px;background:#123a2a;color:#85efb5;font-weight:700}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin:18px 0}.card{background:#0d1b2e;border:1px solid #213754;border-radius:14px;padding:16px;margin-top:12px}
.big{font-size:28px;font-weight:800}.warn{color:#ffd166}.good,.ok{color:#85efb5}table{width:100%;border-collapse:collapse;margin-top:10px}td,th{padding:9px;border-bottom:1px solid #213754;text-align:left;font-size:14px}th{color:#9fc7f4}code{color:#a5d6ff}.seriesLink{color:#7eb5ff;text-decoration:none;font-weight:700}.seriesLink:hover{text-decoration:underline}.boundary{padding:12px;border:1px solid #6b5a2c;background:#2b2412;border-radius:10px;color:#ffd166}
</style></head><body><main>
<h1>🔭 MARKET EDGE — UNIVERSAL OBSERVER</h1><p class="sub">Neutral discovery · routing · evidence · reconciliation control plane</p>
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
<div class="card"><strong>Protected separation</strong><p>🔒 Baseline Real untouched &nbsp; 🔒 Payne untouched &nbsp; 🔒 NFE Reasoning untouched</p><p class="muted">No bankroll · no order endpoint · no trading credentials.</p></div>
<small>Version ${VERSION} · <code>/health</code> · <code>/weather-dashboard</code> · <code>/observe</code></small></main></body></html>`,{headers:{"content-type":"text/html; charset=utf-8"}});
}

async function observe(env) { return runObservationCycle(env); }

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/") return dashboard(env);
    if (url.pathname === "/health") {
      let d1={bound:Boolean(env?.DB),schemaReady:false,status:env?.DB?"BOUND_NOT_CHECKED":"D1_NOT_BOUND"};
      if(env?.DB){try{const row=await env.DB.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name IN ('observation_cycles','observations','resolutions','signal_state','provider_cache')").first();const n=Number(row?.n||0);d1={bound:true,schemaReady:n===5,status:n===5?"D1_SCHEMA_READY":"D1_BOUND_SCHEMA_PENDING",expectedTables:5,presentTables:n};}catch(error){d1={bound:true,schemaReady:false,status:"D1_HEALTH_READ_FAILED",error:String(error?.message||error).slice(0,120)};}}
      return json({ok:true,app:APP,version:VERSION,mode:MODE,tradingCapability:false,engines:ENGINES,d1});
    }
    if (url.pathname === "/weather-catalog") return json(await weatherCatalog(env));
    if (url.pathname === "/weather-dashboard") return dashboard(env);
    if (url.pathname === "/weather-series") return json({ok:false,readOnly:true,status:"SEED_DRILLDOWN_PAUSED",reason:"DIRECT_PROVIDER_LOOKUP_DISABLED_DURING_RATE_GOVERNANCE",tradingCapability:false,baselineRealUntouched:true},503);
    if (url.pathname === "/observe") return json(await observe(env));
    return json({ ok: false, error: "NOT_FOUND" }, 404);
  },
  async scheduled(controller, env, ctx) { ctx.waitUntil(observe(env)); },
};
