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

import type { RiskAssessmentInput, BuildingData, DvfData, IgnData, ClimateData, AssessmentMetadata } from './schema.js';
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
    const elev = data?.elevation ?? null;
    // Compute a rough slope from the elevation value (flat for most urban areas)
    const slope: IgnData['slope'] = elev === null ? null : elev < 10 ? 'flat' : elev < 100 ? 'moderate' : 'steep';
    return { altitude: elev, slope };
  } catch {
    return { altitude: null, slope: null };
  }
}

/* ═══════════════════════════════════════════════════════════════
   Open-Meteo Climate
   ═══════════════════════════════════════════════════════════════ */

async function fetchClimate(lon: number, lat: number): Promise<ClimateData> {
  try {
    // Fetch 3 years of daily data to compute norms
    const res = await fetchWithTimeout(
      `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}` +
      `&start_date=2021-01-01&end_date=2023-12-31` +
      `&daily=temperature_2m_min,temperature_2m_max,precipitation_sum,wind_speed_10m_max` +
      `&timezone=Europe/Paris`,
      {},
      5000,
    );
    if (!res.ok) return emptyClimate();

    const data = await res.json();
    const days = data?.daily;
    if (!days || !days.time?.length) return emptyClimate();

    const tempsMin: number[] = days.temperature_2m_min || [];
    const tempsMax: number[] = days.temperature_2m_max || [];
    const precip: (number | null)[] = days.precipitation_sum || [];
    const winds: (number | null)[] = days.wind_speed_10m_max || [];
    const totalDays = days.time.length;

    // Freeze days: Tmin < 0°C
    const freezeDays = tempsMin.filter((t: number) => t < 0).length;
    const freezePerYear = Math.round((freezeDays / totalDays) * 365);

    // Heatwave days: Tmax > 35°C
    const heatwaveDays = tempsMax.filter((t: number) => t > 35).length;
    const heatwavePerYear = Math.round((heatwaveDays / totalDays) * 365);

    // Annual precipitation
    const totalPrecip = precip.reduce((s: number, v: number | null) => s + (v ?? 0), 0);
    const annualPrecip = Math.round((totalPrecip / totalDays) * 365);

    // Max wind speed
    const validWinds = winds.filter((w: number | null): w is number => w !== null);
    const maxWind = validWinds.length > 0 ? Math.max(...validWinds) : 0;

    return {
      freezeDaysPerYear: freezePerYear,
      stormFrequency: maxWind > 100 ? 4 : maxWind > 80 ? 3 : maxWind > 60 ? 2 : 1,
      hailRisk: 1, // Default safe estimate
      annualPrecipitation: annualPrecip,
      heatwaveDaysPerYear: heatwavePerYear,
      windZone: maxWind > 100 ? 4 : maxWind > 80 ? 3 : maxWind > 60 ? 2 : 1,
      snowZone: 'A1', // Default for most of France
    };
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
  };
}

/* ═══════════════════════════════════════════════════════════════
   BDNB Building (via banId)
   ═══════════════════════════════════════════════════════════════ */

async function fetchBuildingByBanId(banId: string): Promise<BuildingData> {
  const empty: BuildingData = {
    builtYear: null, constructionPeriod: null, surfaceUtile: null, surfaceEmprise: null,
    levels: null, height: null, dpeClass: null, energyConsumption: null,
    emissionGes: null, wallMaterial: null, roofMaterial: null, heatingType: null,
    usageType: null, nbLogements: null, departmentCode: banId.slice(0, 2),
  };

  try {
    // Step 1: get building group ID from address
    const relUrl = `/bdnb-api/donnees/rel_batiment_groupe_adresse?cle_interop_adr=eq.${banId}&select=batiment_groupe_id`;
    const relRes = await fetchWithTimeout(relUrl, { headers: { Accept: 'application/json' } }, 4000);
    if (!relRes.ok) return empty;

    const relData = await relRes.json();
    const groupIds: string[] = (Array.isArray(relData) ? relData : [])
      .map((r: any) => r.batiment_groupe_id)
      .filter(Boolean);

    if (groupIds.length === 0) return empty;

    // Step 2: get full building data
    const idsParam = groupIds.map((id: string) => `"${id}"`).join(',');
    const bdgUrl = `/bdnb-api/donnees/batiment_groupe_complet?batiment_groupe_id=in.(${idsParam})`;
    const bdgRes = await fetchWithTimeout(bdgUrl, { headers: { Accept: 'application/json' } }, 4000);
    if (!bdgRes.ok) return empty;

    const bdgData = await bdgRes.json();
    const arr = Array.isArray(bdgData) ? bdgData : bdgData?.features || [];
    if (arr.length === 0) return empty;

    // Take the first result
    const b = arr[0];
    const props = b.properties || b;
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
      departmentCode: banId.slice(0, 2),
    };
  } catch {
    return empty;
  }
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

  // Compute data freshness
  const now = today;
  const freshness: AssessmentMetadata['dataFreshness'] = {
    bdnb: building.builtYear ? now : null,
    georisques: risks.communeCode ? now : null,
    dvf: dvf ? now : null,
    ign: ign.altitude ? now : null,
    meteofrance: climate.freezeDaysPerYear ? now : null,
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
    climate: climate,
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
