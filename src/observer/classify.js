const WEATHER_TERMS = [
  "weather","temperature","high temperature","low temperature","rain","rainfall",
  "precipitation","snow","snowfall","hurricane","tropical storm","wind","heat",
  "degrees fahrenheit","degrees celsius"
];

const ECON_TERMS = ["cpi","inflation","unemployment","jobless","fed","federal reserve","interest rate","gdp"];

function haystack(market) {
  return [market.ticker,market.event_ticker,market.title,market.subtitle,market.yes_sub_title,
    market.no_sub_title,market.rules_primary,market.rules_secondary].filter(Boolean).join(" ").toLowerCase();
}

export function classifyMarket(market) {
  const text = haystack(market);
  if (WEATHER_TERMS.some(term => text.includes(term))) return { domain:"weather", engine:"weather-v0", confidence:"TERM_MATCH" };
  if (ECON_TERMS.some(term => text.includes(term))) return { domain:"economics", engine:"economics-v0", confidence:"TERM_MATCH" };
  return { domain:"unclassified", engine:null, confidence:"NONE" };
}
