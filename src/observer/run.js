import { discoverOpenMarkets } from "./kalshi.js";
import { classifyMarket } from "./classify.js";
import { observeWeatherMarket } from "../engines/weather-v0.js";

export async function runObservationCycle() {
  const observedAt = new Date().toISOString();
  const discovery = await discoverOpenMarkets({ limit:1000 });
  if (!discovery.ok) {
    return { ok:false, observedAt, tradingCapability:false, discovery, counts:{discovered:0,weather:0,economics:0,unclassified:0}, weatherObservations:[] };
  }

  const counts={discovered:discovery.markets.length,weather:0,economics:0,unclassified:0};
  const weatherObservations=[];
  for (const market of discovery.markets) {
    const classification=classifyMarket(market);
    counts[classification.domain]=(counts[classification.domain] || 0)+1;
    if (classification.domain === "weather") {
      weatherObservations.push(observeWeatherMarket(market,classification,observedAt));
    }
  }
  return {
    ok:true, observedAt, mode:"OBSERVATION_ONLY", tradingCapability:false,
    discovery:{ok:true,source:discovery.source,httpStatus:discovery.httpStatus,latencyMs:discovery.latencyMs,cursorPresent:Boolean(discovery.cursor)},
    counts, persistence:"NOT_CONNECTED", weatherObservations
  };
}
