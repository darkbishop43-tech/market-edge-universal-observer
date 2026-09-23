const APP = "MARKET EDGE — UNIVERSAL OBSERVER";
const VERSION = "0.5.6";
import { runObservationCycle } from "./observer/run.js";

const MODE = "OBSERVATION_ONLY";

const ENGINES = {
  weather: { id: "weather-v0", status: "ACTIVE_RESEARCH", executionEligible: false },
  economics: { id: "economics-v0", status: "RESERVED", executionEligible: false },
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","access-control-allow-origin":"*"}});
}
function escHtml(v){return String(v??"").replace(/[&<>"]/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[ch]));}

async function dashboard() {
  const m=await import("./observer/kalshi.js");
  const d=await m.discoverWeatherSeriesCatalog();
  const rows=(d.weatherSeries||[]).map(x=>'<tr><td>'+escHtml(x.title||x.ticker)+'</td><td><code>'+escHtml(x.ticker)+'</code></td><td><span class="ok">CATALOGED</span></td><td>NO</td></tr>').join("");
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${APP}</title><style>
*{box-sizing:border-box}body{font-family:system-ui,sans-serif;background:#07111f;color:#eef6ff;margin:0}main{max-width:1180px;margin:auto;padding:24px}
h1{margin:0}.sub,.muted,small{color:#91a8c4}.badge{display:inline-block;padding:6px 10px;border-radius:999px;background:#123a2a;color:#85efb5;font-weight:700}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin:18px 0}.card{background:#0d1b2e;border:1px solid #213754;border-radius:14px;padding:16px;margin-top:12px}
.big{font-size:28px;font-weight:800}.warn{color:#ffd166}.good,.ok{color:#85efb5}table{width:100%;border-collapse:collapse;margin-top:10px}td,th{padding:9px;border-bottom:1px solid #213754;text-align:left;font-size:14px}th{color:#9fc7f4}code{color:#a5d6ff}
</style></head><body><main>
<h1>🔭 MARKET EDGE — UNIVERSAL OBSERVER</h1><p class="sub">Neutral discovery · routing · evidence · reconciliation control plane</p>
<p><span class="badge">OBSERVATION ONLY · ZERO ORDER CAPABILITY</span></p>
<div class="grid">
<div class="card"><div class="muted">Kalshi series examined</div><div class="big">${escHtml(d.seriesExamined||0)}</div></div>
<div class="card"><div class="muted">Weather routed</div><div class="big">${escHtml((d.weatherSeries||[]).length)}</div></div>
<div class="card"><div class="muted">Predictions</div><div class="big">—</div></div>
<div class="card"><div class="muted">Ledger</div><div class="big">D1 READY</div></div>
</div>
<div class="card"><strong>Engine registry</strong><table><tr><th>Engine</th><th>State</th><th>Execution</th></tr><tr><td>Weather V0</td><td class="good">ACTIVE RESEARCH</td><td>NO</td></tr><tr><td>Economics V0</td><td class="warn">RESERVED</td><td>NO</td></tr></table></div>
<div class="card"><strong>🌦️ Weather Contract Catalog</strong><p class="muted">Verified Weather contract families from the Kalshi series catalog. Individual live market details remain provider-rate-limited and are not represented as available until verified.</p>
<table><thead><tr><th>Weather contract family</th><th>Ticker</th><th>Research state</th><th>Execution</th></tr></thead><tbody>${rows||'<tr><td colspan="4">No Weather series returned.</td></tr>'}</tbody></table></div>
<div class="card"><strong>Protected separation</strong><p>🔒 Baseline Real untouched &nbsp; 🔒 Payne untouched &nbsp; 🔒 NFE Reasoning untouched</p><p class="muted">No bankroll · no order endpoint · no trading credentials.</p></div>
<small>Version ${VERSION} · <code>/health</code> · <code>/weather-dashboard</code> · <code>/observe</code></small></main></body></html>`,{headers:{"content-type":"text/html; charset=utf-8"}});
}

async function observe(env) { return runObservationCycle(env); }

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/") return dashboard();
    if (url.pathname === "/health") {
      let d1={bound:Boolean(env?.DB),schemaReady:false,status:env?.DB?"BOUND_NOT_CHECKED":"D1_NOT_BOUND"};
      if(env?.DB){try{const row=await env.DB.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name IN ('observation_cycles','observations','resolutions')").first();const n=Number(row?.n||0);d1={bound:true,schemaReady:n===3,status:n===3?"D1_SCHEMA_READY":"D1_BOUND_SCHEMA_PENDING",expectedTables:3,presentTables:n};}catch(error){d1={bound:true,schemaReady:false,status:"D1_HEALTH_READ_FAILED",error:String(error?.message||error).slice(0,120)};}}
      return json({ok:true,app:APP,version:VERSION,mode:MODE,tradingCapability:false,engines:ENGINES,d1});
    }
    if (url.pathname === "/weather-catalog") {const m=await import("./observer/kalshi.js");return json(await m.discoverWeatherSeriesCatalog());}
    if (url.pathname === "/weather-dashboard") return dashboard();
    if (url.pathname === "/observe") return json(await observe(env));
    return json({ ok: false, error: "NOT_FOUND" }, 404);
  },
  async scheduled(controller, env, ctx) { ctx.waitUntil(observe(env)); },
};
