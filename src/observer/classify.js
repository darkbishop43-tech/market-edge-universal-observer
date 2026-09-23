const WEATHER_PATTERNS = [
  /\bweather\b/i,
  /\btemperatures?\b/i,
  /\btemp\b/i,
  /\brain(?:fall|y|ing)?\b/i,
  /\bprecipitation\b/i,
  /\bsnow(?:fall|y|ing)?\b/i,
  /\bhurricanes?\b/i,
  /\btropical storms?\b/i,
  /\btornado(?:es)?\b/i,
  /\bheat(?:\s+waves?|wave|waves|\s+warning|warning)?\b/i,
  /\bclimate\b/i,
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
const ECON_TERMS = ["cpi","inflation","unemployment","jobless","fed","federal reserve","interest rate","gdp"];

function haystack(market) {
  return [market.ticker,market.event_ticker,market.title,market.subtitle,market.yes_sub_title,
    market.no_sub_title,market.rules_primary,market.rules_secondary].filter(Boolean).join(" ");
}

export function classifyMarket(market) {
  const text = haystack(market);
  if (WEATHER_PATTERNS.some(pattern => pattern.test(text)) && !NON_WEATHER_PATTERNS.some(pattern => pattern.test(text))) return { domain:"weather", engine:"weather-v0", confidence:"SEMANTIC_TERM_MATCH" };
  const lower=text.toLowerCase();
  if (ECON_TERMS.some(term => lower.includes(term))) return { domain:"economics", engine:"economics-v0", confidence:"TERM_MATCH" };
  return { domain:"unclassified", engine:null, confidence:"NONE" };
}
