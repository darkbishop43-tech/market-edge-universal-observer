function dollars(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function observeWeatherMarket(market, classification, observedAt) {
  // Weather V0 does NOT manufacture a probability before independent weather
  // evidence is wired. It records a routable candidate and the contemporaneous
  // market state so later predictions cannot be back-filled.
  return {
    schemaVersion:1,
    observationId:`weather-v0:${market.ticker}:${observedAt}`,
    observedAt,
    domain:"weather",
    engine:"weather-v0",
    predictionStatus:"EVIDENCE_REQUIRED",
    prediction:null,
    probability:null,
    executionEligible:false,
    market:{
      ticker:market.ticker || null,
      eventTicker:market.event_ticker || null,
      title:market.title || null,
      subtitle:market.subtitle || null,
      status:market.status || null,
      closeTime:market.close_time || null,
      yesBid:dollars(market.yes_bid_dollars),
      yesAsk:dollars(market.yes_ask_dollars),
      noBid:dollars(market.no_bid_dollars),
      noAsk:dollars(market.no_ask_dollars),
      lastPrice:dollars(market.last_price_dollars),
      liquidity:dollars(market.liquidity_dollars),
      volume:dollars(market.volume_fp),
      strikeType:market.strike_type || null,
      floorStrike:market.floor_strike ?? null,
      capStrike:market.cap_strike ?? null
    },
    routing:classification,
    failureReason:"INDEPENDENT_WEATHER_EVIDENCE_NOT_YET_WIRED"
  };
}
