const APP = "MARKET EDGE — UNIVERSAL OBSERVER";
const VERSION = "0.5.2";
import { runObservationCycle } from "./observer/run.js";

const MODE = "OBSERVATION_ONLY";

const ENGINES = {
  weather: {
    id: "weather-v0",
    status: "ACTIVE_RESEARCH",
    executionEligible: false,
  },
  economics: {
    id: "economics-v0",
    status: "RESERVED",
    executionEligible: false,
  },
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    },
  });
}

function dashboard() {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${APP}</title><style>
*{box-sizing:border-box}body{font-family:system-ui,sans-serif;background:#07111f;color:#eef6ff;margin:0}main{max-width:1180px;margin:auto;padding:24px}
h1{margin:0}.sub{color:#91a8c4}.badge{display:inline-block;padding:6px 10px;border-radius:999px;background:#123a2a;color:#85efb5;font-weight:700}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin:18px 0}.card{background:#0d1b2e;border:1px solid #213754;border-radius:14px;padding:16px}
.big{font-size:28px;font-weight:800}.muted{color:#91a8c4}.warn{color:#ffd166}.good{color:#85efb5}table{width:100%;border-collapse:collapse}td,th{padding:9px;border-bottom:1px solid #213754;text-align:left;font-size:14px}
button{background:#1f6feb;color:white;border:0;border-radius:9px;padding:10px 14px;font-weight:700;cursor:pointer}code{color:#a5d6ff}
.weatherRun{display:inline-block;background:#1677ff;color:#fff;text-decoration:none;font-weight:700;padding:10px 14px;border-radius:8px;margin:8px 0}.weatherRun:hover{filter:brightness(1.08)}</style></head><body><main>
<h1>🔭 MARKET EDGE — UNIVERSAL OBSERVER</h1><p class="sub">Neutral discovery · routing · evidence · reconciliation control plane</p>
<p><span class="badge">OBSERVATION ONLY · ZERO ORDER CAPABILITY</span></p>
<div class="grid">
<div class="card"><div class="muted">Discovered</div><div class="big" id="discovered">—</div></div>
<div class="card"><div class="muted">Weather routed</div><div class="big" id="weather">—</div></div>
<div class="card"><div class="muted">Predictions</div><div class="big" id="predictions">—</div></div>
<div class="card"><div class="muted">Ledger</div><div class="big" id="ledger">D1 READY</div></div>
</div>
<div class="card"><strong>Engine registry</strong><table><tr><th>Engine</th><th>State</th><th>Execution</th></tr><tr><td>Weather V0</td><td class="good">ACTIVE RESEARCH</td><td>NO</td></tr><tr><td>Economics V0</td><td class="warn">RESERVED</td><td>NO</td></tr></table></div>
<div class="card"><strong>🌦️ Weather Research — first evidence cycle</strong><p class="muted">Public Kalshi discovery → Weather routing → NWS evidence → experimental probability → isolated D1 evidence ledger.</p><p class="muted" id="status">Ready for a read-only Weather observation. No orders, bankroll, or trading credentials exist here.</p><a id="run" class="weatherRun" href="/observe" target="_blank" rel="noopener">Run Weather observation</a><div style="overflow:auto"><table><thead><tr><th>Contract</th><th>Prediction</th><th>Probability</th><th>Evidence</th><th>Reason</th></tr></thead><tbody id="rows"></tbody></table></div></div>
<div class="card"><strong>Protected separation</strong><p>🔒 Baseline Real untouched &nbsp; 🔒 Payne untouched &nbsp; 🔒 NFE Reasoning untouched</p><p class="muted">No bankroll · no order endpoint · no trading credentials.</p></div>
<script>
function esc(v){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]))}
</script><small class="muted">Version ${VERSION} · <code>/health</code> · <code>/observe</code></small></main></body></html>`,{headers:{"content-type":"text/html; charset=utf-8"}});
}
async function observe(env) {
  return runObservationCycle(env);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/") return dashboard();
    if (url.pathname === "/health") {
      let d1={bound:Boolean(env?.DB),schemaReady:false,status:env?.DB?"BOUND_NOT_CHECKED":"D1_NOT_BOUND"};
      if(env?.DB){
        try{
          const row=await env.DB.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name IN ('observation_cycles','observations','resolutions')").first();
          const n=Number(row?.n||0);
          d1={bound:true,schemaReady:n===3,status:n===3?"D1_SCHEMA_READY":"D1_BOUND_SCHEMA_PENDING",expectedTables:3,presentTables:n};
        }catch(error){d1={bound:true,schemaReady:false,status:"D1_HEALTH_READ_FAILED",error:String(error?.message||error).slice(0,120)};}
      }
      return json({
        ok: true,
        app: APP,
        version: VERSION,
        mode: MODE,
        tradingCapability: false,
        engines: ENGINES,
        d1,
      });
    }
    if (url.pathname === "/observe") return json(await observe(env));
    return json({ ok: false, error: "NOT_FOUND" }, 404);
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(observe(env));
  },
};
