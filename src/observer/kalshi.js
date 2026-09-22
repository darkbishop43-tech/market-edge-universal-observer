const KALSHI_MARKETS_URL = "https://external-api.kalshi.com/trade-api/v2/markets";

export async function discoverOpenMarkets({ limit = 1000 } = {}) {
  const url = new URL(KALSHI_MARKETS_URL);
  url.searchParams.set("status", "open");
  url.searchParams.set("mve_filter", "exclude");
  url.searchParams.set("limit", String(Math.min(1000, Math.max(1, limit))));

  const started = Date.now();
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "market-edge-universal-observer/0.2" },
  });
  if (!response.ok) {
    return { ok:false, source:"KALSHI_PUBLIC_MARKETS", httpStatus:response.status, latencyMs:Date.now()-started, markets:[], cursor:null };
  }
  const body = await response.json();
  return {
    ok:true, source:"KALSHI_PUBLIC_MARKETS", httpStatus:response.status,
    latencyMs:Date.now()-started, markets:Array.isArray(body.markets)?body.markets:[],
    cursor:body.cursor || null
  };
}
