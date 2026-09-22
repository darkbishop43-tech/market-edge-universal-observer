function logistic(x){return 1/(1+Math.exp(-x));}
function clamp(x,a,b){return Math.max(a,Math.min(b,x));}

export function evaluateTemperatureQuestion(question,evidence,market) {
  if(question?.metric!=="temperature_f") return {status:"NO_MODEL",reason:"WEATHER_METRIC_MODEL_NOT_IMPLEMENTED"};
  const temps=evidence?.periods?.map(p=>Number(p.temperature)).filter(Number.isFinite)||[];
  if(!temps.length) return {status:"NO_MODEL",reason:"NWS_TEMPERATURE_FORECAST_MISSING"};
  const forecastPeak=Math.max(...temps);
  // YES semantics must follow the parsed Kalshi comparison direction.
  // For "below" questions the distance is reversed; unknown direction is not guessed.
  if(question.operator!=="above" && question.operator!=="below") return {status:"NO_MODEL",reason:"TEMPERATURE_OPERATOR_REQUIRED"};
  const delta=question.operator==="above" ? forecastPeak-question.threshold : question.threshold-forecastPeak;
  const probability=clamp(logistic(delta/5),0.05,0.95);
  return {
    status:"EXPERIMENTAL_PREDICTION", model:"weather-temp-logistic-v0.1",
    modelStatus:"UNCALIBRATED", side:probability>=0.5?"YES":"NO",
    probability:Number(probability.toFixed(4)), forecastPeakF:forecastPeak,
    operator:question.operator,thresholdF:question.threshold,deltaF:Number(delta.toFixed(2)),
    uncertaintyScaleF:5, executionEligible:false,
    warning:"OBSERVATION_ONLY_UNCALIBRATED_HEURISTIC"
  };
}
