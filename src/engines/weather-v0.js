import { inferWeatherLocation, inferWeatherQuestion } from "./weather-parse.js";
import { getNwsEvidence } from "../evidence/nws.js";
import { evaluateTemperatureQuestion } from "./weather-model.js";

function dollars(value){const n=Number(value);return Number.isFinite(n)?n:null;}

export async function observeWeatherMarket(market,classification,observedAt) {
  const location=inferWeatherLocation(market);
  const question=inferWeatherQuestion(market);
  let evidence=null, prediction=null, failureReason=null;

  if(!location.ok) failureReason=location.reason;
  else if(!question.ok) failureReason=question.reason;
  else {
    evidence=await getNwsEvidence(location.latitude,location.longitude);
    if(!evidence.ok) failureReason=evidence.error || "NWS_EVIDENCE_FAILED";
    else {
      prediction=evaluateTemperatureQuestion(question,evidence,market);
      if(prediction.status!=="EXPERIMENTAL_PREDICTION") failureReason=prediction.reason;
    }
  }

  return {
    schemaVersion:2,
    observationId:`weather-v0:${market.ticker}:${observedAt}`,
    observedAt,domain:"weather",engine:"weather-v0",
    predictionStatus:prediction?.status || "EVIDENCE_REQUIRED",
    prediction:prediction?.side || null,
    probability:prediction?.probability ?? null,
    executionEligible:false,
    model:prediction,
    evidence:evidence?{source:evidence.source,retrievedAt:evidence.retrievedAt,location:evidence.location,hourlyUpdated:evidence.hourlyUpdated,gridUpdated:evidence.gridUpdated}:null,
    parsed:{location,question},
    market:{ticker:market.ticker||null,eventTicker:market.event_ticker||null,title:market.title||null,subtitle:market.subtitle||null,status:market.status||null,closeTime:market.close_time||null,yesBid:dollars(market.yes_bid_dollars),yesAsk:dollars(market.yes_ask_dollars),noBid:dollars(market.no_bid_dollars),noAsk:dollars(market.no_ask_dollars),lastPrice:dollars(market.last_price_dollars),liquidity:dollars(market.liquidity_dollars),volume:dollars(market.volume_fp),strikeType:market.strike_type||null,floorStrike:market.floor_strike??null,capStrike:market.cap_strike??null},
    routing:classification,failureReason
  };
}
