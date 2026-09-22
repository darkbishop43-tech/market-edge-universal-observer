function logistic(x){return 1/(1+Math.exp(-x));}
function clamp(x,a,b){return Math.max(a,Math.min(b,x));}

export function evaluateTemperatureQuestion(question,evidence,market) {
  if(question?.metric!=="temperature_f") return {status:"NO_MODEL",reason:"WEATHER_METRIC_MODEL_NOT_IMPLEMENTED"};
  const temps=evidence?.periods?.map(p=>Number(p.temperature)).filter(Number.isFinite)||[];
  if(!temps.length) return {status:"NO_MODEL",reason:"NWS_TEMPERATURE_FORECAST_MISSING"};
  // V0 research heuristic only: forecast peak versus threshold with a deliberately
  // broad 5°F uncertainty scale. It is NOT yet calibrated and cannot be execution eligible.
  const forecastPeak=Math.max(...temps);
  const delta=forecastPeak-question.threshold;
  const probability=clamp(logistic(delta/5),0.05,0.95);
  return {
    status:"EXPERIMENTAL_PREDICTION", model:"weather-temp-logistic-v0",
    modelStatus:"UNCALIBRATED", side:probability>=0.5?"YES":"NO",
    probability:Number(probability.toFixed(4)), forecastPeakF:forecastPeak,
    thresholdF:question.threshold, deltaF:Number(delta.toFixed(2)),
    uncertaintyScaleF:5, executionEligible:false,
    warning:"OBSERVATION_ONLY_UNCALIBRATED_HEURISTIC"
  };
}
