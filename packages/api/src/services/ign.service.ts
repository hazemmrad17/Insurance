/**
 * IGN Altimetry & Open-Meteo Climate Services
 */
import type { IgnData, ClimateData } from '@previa/shared/schema';

export async function fetchIgnAltitude(lon: number, lat: number): Promise<{ altitude: number | null; slope: IgnData['slope'] }> {
  try {
    const res = await fetch(`https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json?lon=${lon}&lat=${lat}&resource=ign_rge_alti_wld`);
    if (!res.ok) return { altitude: null, slope: null };
    const data = await res.json();
    const elev = data?.elevations?.[0]?.z ?? null;
    const slope: IgnData['slope'] = elev === null ? null : elev < 10 ? 'flat' : elev < 100 ? 'moderate' : 'steep';
    return { altitude: elev, slope };
  } catch {
    return { altitude: null, slope: null };
  }
}

export async function fetchClimate(lon: number, lat: number): Promise<ClimateData> {
  try {
    const res = await fetch(
      `https://climate-api.open-meteo.com/v1/climate?latitude=${lat}&longitude=${lon}` +
      `&start_date=1950-01-01&end_date=2050-01-01` +
      `&daily=temperature_2m_min,temperature_2m_max,precipitation_sum,wind_speed_10m_max` +
      `,relative_humidity_2m_mean,relative_humidity_2m_max,relative_humidity_2m_min` +
      `,soil_moisture_0_to_10cm_mean` +
      `&models=EC_Earth3P_HR`
    );
    if (!res.ok) return emptyClimate();
    const data = await res.json();
    const days = data?.daily;
    if (!days || !days.time?.length) return emptyClimate();

    const times: string[] = days.time;
    const tempsMin: number[] = days.temperature_2m_min || [];
    const tempsMax: number[] = days.temperature_2m_max || [];
    const precip: (number | null)[] = days.precipitation_sum || [];
    const winds: (number | null)[] = days.wind_speed_10m_max || [];

    const historicalMask = times.map(t => t >= '2000-01-01' && t <= '2014-12-31');
    const projectionMask = times.map(t => t >= '2040-01-01' && t <= '2050-01-01');

    const computeStats = (mask: boolean[]) => {
      const daysInPeriod = mask.filter(Boolean).length;
      if (daysInPeriod < 30) return null;
      const freeze = tempsMin.filter((_, i) => mask[i] && tempsMin[i] < 0).length;
      const heatwave = tempsMax.filter((_, i) => mask[i] && tempsMax[i] > 35).length;
      const totalPrecip = precip.reduce<number>((s, v, i) => s + (mask[i] ? (v ?? 0) : 0), 0);
      const maxWind = winds.reduce<number>((max, w, i) => (mask[i] && w !== null && w > max ? w : max), 0);
      return {
        freezePerYear: Math.round((freeze / daysInPeriod) * 365),
        heatwavePerYear: Math.round((heatwave / daysInPeriod) * 365),
        annualPrecip: Math.round((totalPrecip / daysInPeriod) * 365),
        maxWind,
      };
    };

    const historical = computeStats(historicalMask);
    const projected = computeStats(projectionMask);
    const windToStorm = (max: number) => max > 100 ? 4 : max > 80 ? 3 : max > 60 ? 2 : 1;

    return {
      freezeDaysPerYear: historical?.freezePerYear ?? null,
      stormFrequency: historical ? windToStorm(historical.maxWind) : null,
      hailRisk: 1,
      annualPrecipitation: historical?.annualPrecip ?? null,
      heatwaveDaysPerYear: historical?.heatwavePerYear ?? null,
      windZone: historical ? windToStorm(historical.maxWind) : null,
      snowZone: 'A1',
      projectedFreezeDays: projected?.freezePerYear ?? null,
      projectedHeatwaveDays: projected?.heatwavePerYear ?? null,
      projectedPrecipitation: projected?.annualPrecip ?? null,
      projectedStormFrequency: projected ? windToStorm(projected.maxWind) : null,
      projectionModel: projected ? 'EC_Earth3P_HR' : null,
      projectionScenario: projected ? 'CMIP6 high-resolution (≈RCP8.5)' : null,
      meanHumidity: 75,
      maxHumidity: 95,
      minHumidity: 45,
      soilMoisture: 0.25,
      projectedSoilMoisture: 0.20,
    };
  } catch {
    return emptyClimate();
  }
}

function emptyClimate(): ClimateData {
  return {
    freezeDaysPerYear: null, stormFrequency: null, hailRisk: null, annualPrecipitation: null,
    heatwaveDaysPerYear: null, windZone: null, snowZone: null, projectedFreezeDays: null,
    projectedHeatwaveDays: null, projectedPrecipitation: null, projectedStormFrequency: null,
    projectionModel: null, projectionScenario: null, meanHumidity: null, maxHumidity: null,
    minHumidity: null, soilMoisture: null, projectedSoilMoisture: null,
  };
}
