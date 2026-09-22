const CITY_COORDS = new Map([
  ["new york city",[40.7128,-74.0060]],["new york",[40.7128,-74.0060]],["nyc",[40.7128,-74.0060]],
  ["chicago metro area",[41.8781,-87.6298]],["chicago",[41.8781,-87.6298]],["miami",[25.7617,-80.1918]],
  ["austin",[30.2672,-97.7431]],["dallas",[32.7767,-96.7970]],["houston",[29.7604,-95.3698]],
  ["coastal los angeles",[33.9425,-118.4081]],["los angeles",[34.0522,-118.2437]],
  ["san francisco",[37.7749,-122.4194]],["seattle",[47.6062,-122.3321]],["denver",[39.7392,-104.9903]],
  ["boston",[42.3601,-71.0589]],["philadelphia",[39.9526,-75.1652]],["atlanta",[33.7490,-84.3880]],
  ["phoenix",[33.4484,-112.0740]],["charlotte",[35.2271,-80.8431]]
]);

export function inferWeatherLocation(market) {
  const text=[market.title,market.subtitle,market.yes_sub_title,market.rules_primary].filter(Boolean).join(" ").toLowerCase();
  for(const [name,coords] of CITY_COORDS) if(text.includes(name)) return {ok:true,method:"EXPLICIT_CITY_TERM",name,latitude:coords[0],longitude:coords[1]};
  return {ok:false,reason:"LOCATION_NOT_MAPPED"};
}

export function inferWeatherQuestion(market) {
  const text=[market.title,market.subtitle,market.yes_sub_title].filter(Boolean).join(" ");
  const lower=text.toLowerCase();
  // Kalshi currently publishes temperature titles such as "above 80.99°" without an F suffix.
  // Parse the comparison direction as well as the threshold so the Weather model knows what YES means.
  const comparison=lower.match(/\b(above|over|greater than|below|under|less than)\s*(-?\d+(?:\.\d+)?)\s*(?:°|degrees?\s*)?(?:f(?:ahrenheit)?)?\b/i);
  if(comparison) return {ok:true,metric:"temperature_f",operator:/above|over|greater/.test(comparison[1])?"above":"below",threshold:Number(comparison[2]),raw:text};
  const temp=lower.match(/(-?\d+(?:\.\d+)?)\s*(?:°|degrees?\s*)?f(?:ahrenheit)?\b/i);
  if(temp) return {ok:true,metric:"temperature_f",operator:null,threshold:Number(temp[1]),raw:text};
  if(/rain|precipitation/.test(lower)) return {ok:true,metric:"precipitation",threshold:null,raw:text};
  if(/snow|snowfall/.test(lower)) return {ok:true,metric:"snow",threshold:null,raw:text};
  return {ok:false,reason:"QUESTION_NOT_PARSED",raw:text};
}
