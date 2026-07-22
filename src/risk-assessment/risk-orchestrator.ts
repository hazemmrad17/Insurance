/**
 * Risk Assessment Orchestrator
 * =============================
 *
 * Calls ALL providers in parallel and assembles a RiskAssessmentInput.
 *
 * Flow:
 *   orchestrate(lon, lat, address, banId)
 *     ├─ Géorisques v1+v2  (risks + enrichment)
 *     ├─ IGN altitude       (geography)
 *     ├─ Open-Meteo climate (climate)
 *     ├─ BDNB building      (if banId available)
 *     ├─ CATNAT history     (via GASPAR)
 *     └─ DVF lookup         (by department, sync)
 *
 * All HTTP calls are timed out independently so one slow provider
 * doesn't block the others.
 */

import type { RiskAssessmentInput, BuildingData, DvfData, IgnData, ClimateData, DriasData, AssessmentMetadata } from './schema.js';
import { fetchRisks, fetchCatnat, type GeorisquesResult } from '../views/climate-map/georisques-service.js';
import { fetchWithTimeout } from '../views/climate-map/fetch-utils.js';

/* ═══════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════ */

export interface OrchestratorParams {
  lon: number;
  lat: number;
  addressLabel: string;
  banId?: string;
  communeCode?: string;
  communeName?: string;
  departmentCode?: string;
}

export interface OrchestratorProgress {
  message: string;
  done: number;
  total: number;
}

export type ProgressCallback = (progress: OrchestratorProgress) => void;

/* ═══════════════════════════════════════════════════════════════
   Construction period helper
   ═══════════════════════════════════════════════════════════════ */

function constructionPeriod(year: number | null): BuildingData['constructionPeriod'] {
  if (!year) return null;
  if (year < 1915) return '<1915';
  if (year <= 1948) return '1915_1948';
  if (year <= 1974) return '1949_1974';
  if (year <= 2000) return '1975_2000';
  if (year <= 2012) return '2001_2012';
  if (year <= 2021) return '2013_2021';
  return '>2021';
}

/* ═══════════════════════════════════════════════════════════════
   IGN Altitude
   ═══════════════════════════════════════════════════════════════ */

interface IgnAltimetryResult {
  altitude: number | null;
  slope: IgnData['slope'];
}

async function fetchIgnAltitude(lon: number, lat: number): Promise<IgnAltimetryResult> {
  try {
    const res = await fetchWithTimeout(
      `https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json?lon=${lon}&lat=${lat}&resource=ign_rge_alti_wld`,
      {},
      4000,
    );
    if (!res.ok) return { altitude: null, slope: null };

    const data = await res.json();
    // IGN API returns { elevations: [{ lon, lat, z, acc }] }
    const elev = data?.elevations?.[0]?.z ?? null;
    // Compute a rough slope from the elevation value (flat for most urban areas)
    const slope: IgnData['slope'] = elev === null ? null : elev < 10 ? 'flat' : elev < 100 ? 'moderate' : 'steep';
    return { altitude: elev, slope };
  } catch {
    return { altitude: null, slope: null };
  }
}

/* ═══════════════════════════════════════════════════════════════
   Open-Meteo Climate API (CMIP6 projections)
   = Uses Copernicus CMIP6 high-resolution models
   = Single call gives both historical norms AND future projections
   = In-memory cache: same lat/lon avoids duplicate 10s API calls
   ═══════════════════════════════════════════════════════════════ */

const climateCache = new Map<string, ClimateData>();

async function fetchClimate(lon: number, lat: number): Promise<ClimateData> {
  // Round to 3 decimals for cache key (~111m grid)
  const cacheKey = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  const cached = climateCache.get(cacheKey);
  if (cached) return cached;
  try {
    // Fetch 100 years: historical (1950–2014) + projected (2015–2050)
    const res = await fetchWithTimeout(
      `https://climate-api.open-meteo.com/v1/climate?latitude=${lat}&longitude=${lon}` +
      `&start_date=1950-01-01&end_date=2050-01-01` +
      `&daily=temperature_2m_min,temperature_2m_max,precipitation_sum,wind_speed_10m_max` +
      `&models=EC_Earth3P_HR`,
      {},
      15000,
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

    // Split into historical baseline (2000–2014) and future projection (2040–2050)
    const historicalMask = times.map(t => t >= '2000-01-01' && t <= '2014-12-31');
    const projectionMask = times.map(t => t >= '2040-01-01' && t <= '2050-01-01');

    const computeStats = (mask: boolean[]) => {
      const daysInPeriod = mask.filter(Boolean).length;
      if (daysInPeriod < 30) return null; // Need meaningful sample

      const freeze = tempsMin.filter((_, i) => mask[i] && tempsMin[i] < 0).length;
      const heatwave = tempsMax.filter((_, i) => mask[i] && tempsMax[i] > 35).length;
      const totalPrecip = precip.reduce<number>((s, v, i) => s + (mask[i] ? (v ?? 0) : 0), 0);
      const maxWind = winds.reduce<number>(
        (max, w, i) => (mask[i] && w !== null && w > max ? w : max),
        0,
      );

      const freezePerYear = Math.round((freeze / daysInPeriod) * 365);
      const heatwavePerYear = Math.round((heatwave / daysInPeriod) * 365);
      const annualPrecip = Math.round((totalPrecip / daysInPeriod) * 365);

      return { freezePerYear, heatwavePerYear, annualPrecip, maxWind, daysInPeriod };
    };

    const historical = computeStats(historicalMask);
    const projected = computeStats(projectionMask);

    const windToStorm = (max: number) => max > 100 ? 4 : max > 80 ? 3 : max > 60 ? 2 : 1;

    const result: ClimateData = {
      freezeDaysPerYear: historical?.freezePerYear ?? null,
      stormFrequency: historical ? windToStorm(historical.maxWind) : null,
      hailRisk: 1, // Default safe estimate
      annualPrecipitation: historical?.annualPrecip ?? null,
      heatwaveDaysPerYear: historical?.heatwavePerYear ?? null,
      windZone: historical ? windToStorm(historical.maxWind) : null,
      snowZone: 'A1', // Default for most of France
      projectedFreezeDays: projected?.freezePerYear ?? null,
      projectedHeatwaveDays: projected?.heatwavePerYear ?? null,
      projectedPrecipitation: projected?.annualPrecip ?? null,
      projectedStormFrequency: projected ? windToStorm(projected.maxWind) : null,
      projectionModel: projected ? 'EC_Earth3P_HR' : null,
      projectionScenario: projected ? 'CMIP6 high-resolution (≈RCP8.5)' : null,
    };

    // Cache for subsequent lookups at same location
    climateCache.set(cacheKey, result);
    return result;
  } catch {
    return emptyClimate();
  }
}

function emptyClimate(): ClimateData {
  return {
    freezeDaysPerYear: null,
    stormFrequency: null,
    hailRisk: null,
    annualPrecipitation: null,
    heatwaveDaysPerYear: null,
    windZone: null,
    snowZone: null,
    projectedFreezeDays: null,
    projectedHeatwaveDays: null,
    projectedPrecipitation: null,
    projectedStormFrequency: null,
    projectionModel: null,
    projectionScenario: null,
  };
}

/* ═══════════════════════════════════════════════════════════════
   BDNB Building (via banId)
   ═══════════════════════════════════════════════════════════════ */

async function fetchBuildingByBanId(banId: string): Promise<BuildingData> {
  const deptCode = banId.slice(0, 2);
  const empty: BuildingData = {
    builtYear: null, constructionPeriod: null, surfaceUtile: null, surfaceEmprise: null,
    levels: null, height: null, dpeClass: null, energyConsumption: null,
    emissionGes: null, wallMaterial: null, roofMaterial: null, heatingType: null,
    usageType: null, nbLogements: null, departmentCode: deptCode,
  };

  const parseRecord = (record: any) => {
    const props = record.properties || record;
    const year = props.annee_construction ?? null;
    return {
      builtYear: year,
      constructionPeriod: constructionPeriod(year),
      surfaceUtile: props.surface_habitable ?? null,
      surfaceEmprise: props.surface_emprise_sol ?? null,
      levels: props.nb_niveau ?? null,
      height: props.hauteur_mean ?? props.hauteur ?? null,
      dpeClass: props.classe_bilan_dpe ?? null,
      energyConsumption: props.conso_energie ?? null,
      emissionGes: props.emission_ges ?? null,
      wallMaterial: props.mat_mur_txt && props.mat_mur_txt !== 'INDETERMINE' ? props.mat_mur_txt : null,
      roofMaterial: props.mat_toit_txt && props.mat_toit_txt !== 'INDETERMINE' ? props.mat_toit_txt : null,
      heatingType: props.etat_chauffage_txt && props.etat_chauffage_txt !== 'INDETERMINE' ? props.etat_chauffage_txt : null,
      usageType: props.usage_principal_bdnb_open ?? null,
      nbLogements: props.nb_logements ?? null,
      departmentCode: deptCode,
    };
  };

  try {
    // Strategy 1: Get building group ID from address (relational table)
    const relUrl = `/bdnb-api/donnees/rel_batiment_groupe_adresse?cle_interop_adr=eq.${banId}&select=batiment_groupe_id`;
    const relRes = await fetchWithTimeout(relUrl, { headers: { Accept: 'application/json' } }, 4000);

    if (relRes.ok) {
      const relData = await relRes.json();
      const groupIds: string[] = (Array.isArray(relData) ? relData : [])
        .map((r: any) => r.batiment_groupe_id)
        .filter(Boolean);

      if (groupIds.length > 0) {
        const idsParam = groupIds.map((id: string) => `"${id}"`).join(',');
        const bdgUrl = `/bdnb-api/donnees/batiment_groupe_complet?batiment_groupe_id=in.(${idsParam})`;
        const bdgRes = await fetchWithTimeout(bdgUrl, { headers: { Accept: 'application/json' } }, 4000);

        if (bdgRes.ok) {
          const bdgData = await bdgRes.json();
          const arr = Array.isArray(bdgData) ? bdgData : bdgData?.features || [];
          if (arr.length > 0) return parseRecord(arr[0]);
        }
      }
    }
  } catch {
    // Fall through to fallback
  }

  // Strategy 2 (fallback): query by commune INSEE code (first 5 chars of banId)
  const communeCode = banId.slice(0, 5);
  if (communeCode.length === 5) {
    try {
      const fallbackUrl = `/bdnb-api/donnees/batiment_groupe_complet?code_commune_insee=eq.${communeCode}&limit=5`;
      const fallbackRes = await fetchWithTimeout(fallbackUrl, { headers: { Accept: 'application/json' } }, 6000);

      if (fallbackRes.ok) {
        const fallbackData = await fallbackRes.json();
        const arr = Array.isArray(fallbackData) ? fallbackData : fallbackData?.features || [];
        if (arr.length > 0) return parseRecord(arr[0]);
      }
    } catch {
      // Return empty
    }
  }

  return empty;
}

/* ═══════════════════════════════════════════════════════════════
   CATNAT → catnatLast10Years + pprApproved
   ═══════════════════════════════════════════════════════════════ */

function countCatnatLast10Years(records: any[]): number {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 10);
  return records.filter(r => {
    const d = new Date(r.date_arrete || r.date_debut);
    return d >= cutoff;
  }).length;
}

/* ═══════════════════════════════════════════════════════════════
   DVF Department Lookup (sync, cheap)
   ═══════════════════════════════════════════════════════════════ */

// Lazy-loaded lookup to avoid import issues in the browser
let _lookupModule: any = null;
async function getDeptLookup(): Promise<any> {
  if (!_lookupModule) {
    _lookupModule = await import('./lookup/lookup.js');
  }
  return _lookupModule;
}

async function lookupValuation(deptCode: string): Promise<DvfData | null> {
  try {
    const lookup = await getDeptLookup();
    const result = lookup.lookupDepartment(deptCode);
    return result?.dept?.valuation ?? null;
  } catch {
    return null;
  }
}

/* ═══════════════════════════════════════════════════════════════
   MAIN ORCHESTRATOR
   ═══════════════════════════════════════════════════════════════ */

export async function orchestrate(
  params: OrchestratorParams,
  onProgress?: ProgressCallback,
): Promise<RiskAssessmentInput> {
  const { lon, lat, addressLabel, banId, communeCode, communeName } = params;
  const deptCode = params.departmentCode || (banId ? banId.slice(0, 2) : null) || '75';
  const today = new Date().toISOString().split('T')[0];

  const totalSteps = 6;
  let done = 0;

  const report = (msg: string) => {
    done++;
    onProgress?.({ message: msg, done, total: totalSteps });
  };

  // Launch all providers in parallel
  const [risksResult, ignResult, climateResult, buildingResult, catnatRecords, dvfResult] = await Promise.allSettled([
    // 1. Géorisques risks (v1 + v2 enrichment)
    (async () => {
      const result = await fetchRisks(lon, lat);
      report('Risques Géorisques chargés');
      return result;
    })(),

    // 2. IGN altitude
    (async () => {
      const result = await fetchIgnAltitude(lon, lat);
      report('Altitude IGN chargée');
      return result;
    })(),

    // 3. Open-Meteo climate
    (async () => {
      const result = await fetchClimate(lon, lat);
      report('Données climatiques chargées');
      return result;
    })(),

    // 4. BDNB building data (if we have a banId)
    (async (): Promise<BuildingData> => {
      if (!banId) {
        report('Données bâtiment : BDNB indisponible');
        return {
          builtYear: null, constructionPeriod: null, surfaceUtile: null, surfaceEmprise: null,
          levels: null, height: null, dpeClass: null, energyConsumption: null,
          emissionGes: null, wallMaterial: null, roofMaterial: null, heatingType: null,
          usageType: null, nbLogements: null, departmentCode: deptCode,
        };
      }
      const result = await fetchBuildingByBanId(banId);
      report('Données bâtiment BDNB chargées');
      return result;
    })(),

    // 5. CATNAT history
    (async (): Promise<any[]> => {
      if (!communeCode) {
        report('CATNAT : pas de commune');
        return [];
      }
      const records = await fetchCatnat(communeCode);
      report('Historique CATNAT chargé');
      return records;
    })(),

    // 6. DVF department lookup
    (async (): Promise<DvfData | null> => {
      const result = await lookupValuation(deptCode);
      report('Valorisation DVF chargée');
      return result;
    })(),
  ]);

  // Extract values with fallbacks
  const risks = extractRisks(risksResult);
  const ign = extractIgn(ignResult);
  const climate = extractClimate(climateResult);
  const building = extractBuilding(buildingResult, deptCode);
  const catnatRecordsArray = catnatRecords.status === 'fulfilled' ? catnatRecords.value : [];
  const dvf = dvfResult.status === 'fulfilled' ? dvfResult.value : null;

  // Compute catnat count
  const catnatCount = countCatnatLast10Years(catnatRecordsArray);

  // DRIAS lookup (by department, sync)
  let driasData: DriasData | undefined;
  const driasResult = await lookupDriasData(deptCode);
  if (driasResult) {
    driasData = {
      method: driasResult.method,
      warmingLevel: driasResult.warmingLevel || '+4°C France (TRACC horizon 2050)',
      heatwaveDays: driasResult.drias.heatwaveDays ?? null,
      tropicalNights: driasResult.drias.tropicalNights ?? null,
      summerDays: driasResult.drias.summerDays ?? null,
      heavyPrecipDays: driasResult.drias.heavyPrecipDays ?? null,
      max5dayPrecip: driasResult.drias.max5dayPrecip ?? null,
      consecutiveDryDays: driasResult.drias.consecutiveDryDays ?? null,
      fireWeatherIndex: driasResult.drias.fireWeatherIndex ?? null,
      frostDays: driasResult.drias.frostDaysDrias ?? null,
      dataSource: driasResult.drias.dataSource ?? null,
    };
  }

  // Compute data freshness
  const now = today;
  const freshness: AssessmentMetadata['dataFreshness'] = {
    bdnb: building.builtYear ? now : null,
    georisques: risks.communeCode ? now : null,
    dvf: dvf ? now : null,
    ign: ign.altitude ? now : null,
    openmeteo_climate: climate.freezeDaysPerYear !== null ? now : null,
    drias: driasData ? now : null,
  };

  return {
    property: building,
    valuation: dvf ?? undefined,
    geography: ign,
    risks: {
      naturels: risks.risks.naturels,
      technologiques: risks.risks.technologiques,
      commune: risks.commune || communeName || null,
      communeCode: risks.communeCode || communeCode || null,
      naturalRiskCount: risks.risks.naturalRiskCount,
      technoRiskCount: risks.risks.technoRiskCount,
      catnatLast10Years: catnatCount,
      pprApproved: true, // Default — PPR is approved for most communes
      enrichment: risks.enrichment,
    },
    climate: { ...climate, drias: driasData },
    metadata: {
      addressLabel,
      longitude: lon,
      latitude: lat,
      communeName: risks.commune || communeName || '',
      communeCode: risks.communeCode || communeCode || '',
      assessmentDate: now,
      dataFreshness: freshness,
    },
  };
}

/* ═══════════════════════════════════════════════════════════════
   Result extractors
   ═══════════════════════════════════════════════════════════════ */

function extractRisks(result: PromiseSettledResult<GeorisquesResult>): GeorisquesResult {
  if (result.status === 'fulfilled') return result.value;
  return {
    risks: {
      naturels: createEmptyNaturalRisks(),
      technologiques: createEmptyTechnoRisks(),
      naturalRiskCount: 0,
      technoRiskCount: 0,
    },
    commune: null,
    communeCode: null,
    source: 'v1',
  };
}

function extractIgn(result: PromiseSettledResult<IgnAltimetryResult>): IgnData {
  if (result.status === 'fulfilled' && result.value) {
    return {
      parcelId: null,
      altitude: result.value.altitude,
      slope: result.value.slope,
      distanceToWaterway: null,
      distanceFireStation: null,
      landUse: 'urban',
    };
  }
  return {
    parcelId: null, altitude: null, slope: null,
    distanceToWaterway: null, distanceFireStation: null, landUse: null,
  };
}

function extractClimate(result: PromiseSettledResult<ClimateData>): ClimateData {
  if (result.status === 'fulfilled' && result.value) return result.value;
  return emptyClimate();
}

function extractBuilding(result: PromiseSettledResult<BuildingData>, deptCode: string): BuildingData {
  if (result.status === 'fulfilled' && result.value) return result.value;
  return {
    builtYear: null, constructionPeriod: null, surfaceUtile: null, surfaceEmprise: null,
    levels: null, height: null, dpeClass: null, energyConsumption: null,
    emissionGes: null, wallMaterial: null, roofMaterial: null, heatingType: null,
    usageType: null, nbLogements: null, departmentCode: deptCode,
  };
}

/* ═══════════════════════════════════════════════════════════════
   DRIAS Department Lookup (sync, cheap — like DVF)
   ═══════════════════════════════════════════════════════════════ */

let _driasModule: any = null;
async function getDriasLookup(): Promise<any> {
  if (!_driasModule) {
    _driasModule = await import('./lookup/drias.js');
  }
  return _driasModule;
}

async function lookupDriasData(deptCode: string): Promise<{ drias: any; method: string; warmingLevel: string } | null> {
  try {
    const mod = await getDriasLookup();
    const result = mod.lookupDrias(deptCode);
    if (!result) return null;

    const meta = mod.getDriasMetadata();
    return {
      drias: result.dept.drias,
      method: meta.method,
      warmingLevel: meta.warmingLevel,
    };
  } catch {
    return null;
  }
}

/* ═══════════════════════════════════════════════════════════════
   Empty risk factories
   ═══════════════════════════════════════════════════════════════ */

function emptyLevel() { return { present: false, level: null as any }; }

function createEmptyNaturalRisks() {
  const keys = ['inondation', 'remonteeNappe', 'risqueCotier', 'seisme', 'mouvementTerrain',
    'retraitGonflementArgile', 'reculTraitCote', 'avalanche', 'feuForet',
    'eruptionVolcanique', 'cyclone', 'radon'];
  const obj: any = {};
  for (const k of keys) obj[k] = emptyLevel();
  return obj;
}

function createEmptyTechnoRisks() {
  const keys = ['icpe', 'nucleaire', 'canalisationsMatieresDangereuses',
    'pollutionSols', 'ruptureBarrage', 'risqueMinier'];
  const obj: any = {};
  for (const k of keys) obj[k] = emptyLevel();
  return obj;
}
