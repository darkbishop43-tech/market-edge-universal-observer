const APP = "MARKET EDGE — UNIVERSAL OBSERVER";
const VERSION = "0.1.0";
import { runObservationCycle } from "./observer/run.js";

const MODE = "OBSERVATION_ONLY";

const ENGINES = {
  weather: {
    id: "weather-v0",
    status: "READY_FOR_DATA_WIRING",
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
    },
  });
}

function dashboard() {
  const engineRows = Object.values(ENGINES)
    .map((engine) => `<tr><td>${engine.id}</td><td>${engine.status}</td><td>NO</td></tr>`)
    .join("");

  return new Response(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${APP}</title>
<style>
body{font-family:system-ui,sans-serif;background:#0b1020;color:#eef2ff;margin:0;padding:24px}
main{max-width:1000px;margin:auto}.card{background:#151c32;border:1px solid #2a3558;border-radius:14px;padding:18px;margin:14px 0}
h1{margin:0 0 8px}.ok{color:#7ee787}.lock{color:#f2cc60}table{width:100%;border-collapse:collapse}td,th{padding:10px;border-bottom:1px solid #2a3558;text-align:left}
small{color:#aab4d0}
</style>
</head>
<body><main>
<h1>🔭 ${APP}</h1>
<p class="ok">OBSERVATION ONLY · NO LIVE TRADING CAPABILITY</p>
<div class="card"><strong>V0 control plane</strong><p>Discovery → classify → route → timestamp → preserve → reconcile → compare.</p></div>
<div class="card"><strong>Protected separation</strong><p class="lock">Baseline Real untouched · Payne untouched · NFE Reasoning untouched</p></div>
<div class="card"><table><thead><tr><th>Engine</th><th>Status</th><th>Execution</th></tr></thead><tbody>${engineRows}</tbody></table></div>
<div class="card"><strong>Evidence ledger</strong><p>Not connected yet. D1 is the intended historical ledger after an isolated database is created and verified.</p></div>
<small>Version ${VERSION}</small>
</main></body></html>`, { headers: { "content-type": "text/html; charset=utf-8" } });
}

async function observe(env) {
  return runObservationCycle();
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/") return dashboard();
    if (url.pathname === "/health") {
      return json({
        ok: true,
        app: APP,
        version: VERSION,
        mode: MODE,
        tradingCapability: false,
        engines: ENGINES,
      });
    }
    if (url.pathname === "/observe") return json(await observe(env));
    return json({ ok: false, error: "NOT_FOUND" }, 404);
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(observe(env));
  },
};
