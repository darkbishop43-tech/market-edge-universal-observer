const NWS = "https://api.weather.gov";
const HEADERS = {
  accept: "application/geo+json",
  "user-agent": "market-edge-universal-observer/0.3 (observation-only research)"
};

async function getJson(url) {
  const started=Date.now();
  const response=await fetch(url,{headers:HEADERS});
  if(!response.ok) return {ok:false,httpStatus:response.status,latencyMs:Date.now()-started,data:null};
  return {ok:true,httpStatus:response.status,latencyMs:Date.now()-started,data:await response.json()};
}

export async function getNwsEvidence(latitude,longitude) {
  if(!Number.isFinite(latitude)||!Number.isFinite(longitude)) return {ok:false,error:"COORDINATES_REQUIRED"};
  const point=await getJson(`${NWS}/points/${latitude.toFixed(4)},${longitude.toFixed(4)}`);
  if(!point.ok) return {ok:false,error:"NWS_POINT_FAILED",point};
  const p=point.data?.properties || {};
  if(!p.forecastHourly || !p.forecastGridData) return {ok:false,error:"NWS_FORECAST_LINKS_MISSING"};
  const [hourly,grid]=await Promise.all([getJson(p.forecastHourly),getJson(p.forecastGridData)]);
  if(!hourly.ok || !grid.ok) return {ok:false,error:"NWS_FORECAST_FAILED",hourlyStatus:hourly.httpStatus,gridStatus:grid.httpStatus};
  return {
    ok:true, source:"NWS_API", retrievedAt:new Date().toISOString(),
    location:{latitude,longitude,forecastOffice:p.forecastOffice||null,gridId:p.gridId||null,gridX:p.gridX??null,gridY:p.gridY??null,timeZone:p.timeZone||null},
    hourlyUpdated:hourly.data?.properties?.updated||null,
    gridUpdated:grid.data?.properties?.updateTime||null,
    periods:(hourly.data?.properties?.periods||[]).slice(0,168).map(x=>({startTime:x.startTime,endTime:x.endTime,temperature:x.temperature,temperatureUnit:x.temperatureUnit,probabilityOfPrecipitation:x.probabilityOfPrecipitation?.value??null,windSpeed:x.windSpeed,shortForecast:x.shortForecast})),
    maxTemperature:grid.data?.properties?.maxTemperature?.values||[],
    minTemperature:grid.data?.properties?.minTemperature?.values||[],
    probabilityOfPrecipitation:grid.data?.properties?.probabilityOfPrecipitation?.values||[]
  };
}
