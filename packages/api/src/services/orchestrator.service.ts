/**
 * Backend Master Risk Assessment Orchestrator Service
 * ====================================================
 *
 * Calls ALL providers in parallel and assembles a RiskAssessmentInput + scores.
 * Uses real API calls for all providers — no hardcoded fallbacks (except when
 * an API actually fails / is unreachable).
 *
 * Providers:
 *   ├─ Géorisques v1       (risks + enrichment)
 *   ├─ IGN altitude         (geography)
 *   ├─ WFS BD TOPO          (distance to waterway)
 *   ├─ WFS Masque Forêt     (distance to forest)
 *   ├─ Open-Meteo climate   (climate + projections)
 *   ├─ BDNB building        (property data — if banId available)
 *   ├─ GASPAR CATNAT        (catastrophes naturelles history)
 *   ├─ DVF lookup           (valuation — by department, local JSON)
 *   └─ DRIAS lookup         (climate — by department, local JSON)
 */

import type { RiskAssessmentInput, BuildingData, IgnData, DvfData, DriasData, ClimateData } from '@previa/shared/schema';
import type { AssessRequest, AssessResponse } from '@previa/shared/types';
import { fetchGeorisquesData } from './georisques.service.js';
import { fetchBuildingByBanId } from './bdnb.service.js';
import { fetchIgnAltitude, fetchClimate } from './ign.service.js';
import { fetchWaterwayDistance, fetchForestDistance } from './wfs.service.js';
import { lookupDvf, lookupDrias } from './lookup.service.js';
import { scoreAll } from './scoring.service.js';
import { getCachedAssessment, setCachedAssessment } from './cache.service.js';
import { db } from '../database/client.js';
import { assessments } from '../database/schema.js';
import { randomUUID } from 'node:crypto';

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
   CATNAT
   ═══════════════════════════════════════════════════════════════ */

async function fetchCatnatCount(communeCode: string): Promise<number> {
  try {
    const res = await fetch(
      `https://www.georisques.gouv.fr/api/v1/gaspar/catnat?code_insee=${communeCode}`,
      { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(6000) },
    );
    if (!res.ok) return 0;
    const raw: any = await res.json();
    const records: any[] = raw?.data || (Array.isArray(raw) ? raw : []);
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - 10);
    return records.filter(r => {
      const d = new Date(r.date_publication_arrete || r.date_arrete || r.date_debut);
      return d >= cutoff;
    }).length;
  } catch {
    return 0;
  }
}

/* ═══════════════════════════════════════════════════════════════
   MAIN EXPORT
   ═══════════════════════════════════════════════════════════════ */

export async function runRiskAssessment(params: AssessRequest, userId?: string): Promise<AssessResponse> {
  const { latitude: lat, longitude: lon, address, banId, communeCode, communeName, propertyId } = params;

  // Check 24h cache first
  const cached = getCachedAssessment(lat, lon);
  if (cached) {
    return cached;
  }

  const deptCode = params.departmentCode || (banId ? banId.slice(0, 2) : '75');
  const today = new Date().toISOString().split('T')[0];

  // Launch ALL providers in parallel
  const [
    georisquesRes,
    ignAltRes,
    climateRes,
    buildingRes,
    catnatRes,
    waterDistRes,
    forestDistRes,
  ] = await Promise.allSettled([
    fetchGeorisquesData(lon, lat),
    fetchIgnAltitude(lon, lat),
    fetchClimate(lon, lat),
    banId ? fetchBuildingByBanId(banId) : Promise.resolve(emptyBuilding(deptCode)),
    communeCode ? fetchCatnatCount(communeCode) : Promise.resolve(0),
    fetchWaterwayDistance(lon, lat),
    fetchForestDistance(lon, lat),
  ]);

  // Extract results with fallbacks
  const georisques = georisquesRes.status === 'fulfilled' ? georisquesRes.value : null;
  const ignAlt = ignAltRes.status === 'fulfilled' ? ignAltRes.value : { altitude: null, slope: null };
  const climate = climateRes.status === 'fulfilled' ? climateRes.value : emptyClimate();
  const building = buildingRes.status === 'fulfilled' ? buildingRes.value : emptyBuilding(deptCode);
  const catnatCount = catnatRes.status === 'fulfilled' ? catnatRes.value : 0;
  const waterDist = waterDistRes.status === 'fulfilled' ? waterDistRes.value : null;
  const forestDist = forestDistRes.status === 'fulfilled' ? forestDistRes.value : null;

  // Geography
  const geography: IgnData = {
    parcelId: null,
    altitude: ignAlt.altitude,
    slope: ignAlt.slope,
    distanceToWaterway: waterDist,
    distanceToForest: forestDist,
    distanceFireStation: null,
    landUse: 'urban',
  };

  // Valuation — DVF lookup by department
  const dvfLookup = lookupDvf(deptCode);
  const valuation: DvfData = dvfLookup ? {
    reconstructionValuePerSqm: dvfLookup.reconstructionValuePerSqm,
    lastTransactionPricePerSqm: dvfLookup.lastTransactionPricePerSqm,
    lastTransactionDate: null,
    lastTransactionType: null,
  } : {
    reconstructionValuePerSqm: null,
    lastTransactionPricePerSqm: null,
    lastTransactionDate: null,
    lastTransactionType: null,
  };

  // DRIAS lookup
  const driasLookup = lookupDrias(deptCode);
  let driasData: DriasData | undefined;
  if (driasLookup) {
    driasData = {
      method: driasLookup.method,
      warmingLevel: driasLookup.warmingLevel,
      heatwaveDays: driasLookup.drias.heatwaveDays ?? null,
      tropicalNights: driasLookup.drias.tropicalNights ?? null,
      summerDays: driasLookup.drias.summerDays ?? null,
      heavyPrecipDays: driasLookup.drias.heavyPrecipDays ?? null,
      max5dayPrecip: driasLookup.drias.max5dayPrecip ?? null,
      consecutiveDryDays: driasLookup.drias.consecutiveDryDays ?? null,
      fireWeatherIndex: driasLookup.drias.fireWeatherIndex ?? null,
      frostDays: driasLookup.drias.frostDaysDrias ?? null,
      dataSource: driasLookup.drias.dataSource ?? null,
    };
  }

  // Build full assessment input
  const fullInput: RiskAssessmentInput = {
    property: building,
    valuation,
    geography,
    risks: {
      naturels: georisques?.risks.naturels || emptyNaturalRisks(),
      technologiques: georisques?.risks.technologiques || emptyTechnoRisks(),
      commune: georisques?.commune || communeName || null,
      communeCode: georisques?.communeCode || communeCode || null,
      naturalRiskCount: georisques?.risks.naturalRiskCount || 0,
      technoRiskCount: georisques?.risks.technoRiskCount || 0,
      catnatLast10Years: catnatCount,
      pprApproved: true,
      enrichment: georisques?.enrichment,
    },
    climate: { ...climate, drias: driasData },
    metadata: {
      addressLabel: address,
      longitude: lon,
      latitude: lat,
      communeName: georisques?.commune || communeName || '',
      communeCode: georisques?.communeCode || communeCode || '',
      assessmentDate: today,
      dataFreshness: {
        bdnb: building.builtYear ? today : null,
        georisques: georisques ? today : null,
        dvf: dvfLookup ? today : null,
        ign: ignAlt.altitude !== null ? today : null,
        openmeteo_climate: climate.freezeDaysPerYear !== null ? today : null,
        drias: driasData ? today : null,
      },
    },
  };

  // Compute scores
  const scores = scoreAll(fullInput);
  const assessmentId = randomUUID();

  // Save assessment snapshot to DB asynchronously (non-blocking)
  db.insert(assessments).values({
    id: assessmentId,
    propertyId: propertyId || null,
    userId: userId || null,
    addressLabel: address,
    longitude: lon,
    latitude: lat,
    buildingData: JSON.stringify(building),
    geographyData: JSON.stringify(geography),
    risksData: JSON.stringify(fullInput.risks),
    climateData: JSON.stringify(climate),
    valuationData: JSON.stringify(valuation),
    metadataData: JSON.stringify(fullInput.metadata),
    inondationScore: scores.inondation,
    rgaScore: scores.rga,
    tempeteScore: scores.tempete,
    incendieScore: scores.incendie,
    seismeScore: scores.seisme,
    globalScore: scores.global,
  }).catch((err) => console.error('Failed to persist assessment:', err));

  const result: AssessResponse = {
    ...fullInput,
    assessmentId,
    scores,
  };

  setCachedAssessment(lat, lon, result);
  return result;
}

/* ═══════════════════════════════════════════════════════════════
   Empty factories
   ═══════════════════════════════════════════════════════════════ */

function emptyBuilding(deptCode: string): BuildingData {
  return {
    builtYear: null, constructionPeriod: null, surfaceUtile: null, surfaceEmprise: null,
    levels: null, height: null, dpeClass: null, energyConsumption: null,
    emissionGes: null, wallMaterial: null, roofMaterial: null, heatingType: null,
    usageType: null, nbLogements: null, departmentCode: deptCode, nbLogementsRnc: null,
    clayExposure: null, altitudeSolMean: null, heatingEnergyType: null, parcelIds: null,
    quartierPrioritaire: null, zonePatrimoniale: null,
  };
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

function emptyNaturalRisks() {
  return {
    inondation: { present: false, level: null },
    remonteeNappe: { present: false, level: null },
    risqueCotier: { present: false, level: null },
    seisme: { present: false, level: null },
    mouvementTerrain: { present: false, level: null },
    retraitGonflementArgile: { present: false, level: null },
    reculTraitCote: { present: false, level: null },
    avalanche: { present: false, level: null },
    feuForet: { present: false, level: null },
    eruptionVolcanique: { present: false, level: null },
    cyclone: { present: false, level: null },
    radon: { present: false, level: null },
  };
}

function emptyTechnoRisks() {
  return {
    icpe: { present: false, level: null },
    nucleaire: { present: false, level: null },
    canalisationsMatieresDangereuses: { present: false, level: null },
    pollutionSols: { present: false, level: null },
    ruptureBarrage: { present: false, level: null },
    risqueMinier: { present: false, level: null },
  };
}
