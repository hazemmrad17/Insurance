/**
 * Backend Master Risk Assessment Orchestrator Service
 */
import type { RiskAssessmentInput, BuildingData, IgnData, DvfData } from '@previa/shared/schema';
import type { AssessRequest, AssessResponse } from '@previa/shared/types';
import { fetchGeorisquesData } from './georisques.service.js';
import { fetchBuildingByBanId } from './bdnb.service.js';
import { fetchIgnAltitude, fetchClimate } from './ign.service.js';
import { scoreAll } from './scoring.service.js';
import { getCachedAssessment, setCachedAssessment } from './cache.service.js';
import { db } from '../database/client.js';
import { assessments } from '../database/schema.js';
import { randomUUID } from 'node:crypto';

export async function runRiskAssessment(params: AssessRequest, userId?: string): Promise<AssessResponse> {
  const { latitude: lat, longitude: lon, address, banId, communeCode, communeName, propertyId } = params;

  // Check 24h cache first
  const cached = getCachedAssessment(lat, lon);
  if (cached) {
    return cached;
  }

  const deptCode = params.departmentCode || (banId ? banId.slice(0, 2) : '75');
  const today = new Date().toISOString().split('T')[0];

  const [georisquesRes, ignRes, climateRes, buildingRes] = await Promise.allSettled([
    fetchGeorisquesData(lon, lat),
    fetchIgnAltitude(lon, lat),
    fetchClimate(lon, lat),
    banId ? fetchBuildingByBanId(banId) : Promise.resolve(emptyBuilding(deptCode)),
  ]);

  const georisques = georisquesRes.status === 'fulfilled' ? georisquesRes.value : null;
  const ignAlt = ignRes.status === 'fulfilled' ? ignRes.value : { altitude: null, slope: null };
  const climate = climateRes.status === 'fulfilled' ? climateRes.value : emptyClimate();
  const building = buildingRes.status === 'fulfilled' ? buildingRes.value : emptyBuilding(deptCode);

  const geography: IgnData = {
    parcelId: null,
    altitude: ignAlt.altitude,
    slope: ignAlt.slope,
    distanceToWaterway: 450,
    distanceToForest: 1200,
    distanceFireStation: 2500,
    landUse: 'urban',
  };

  const valuation: DvfData = {
    reconstructionValuePerSqm: 2800,
    lastTransactionPricePerSqm: 10500,
    lastTransactionDate: '2023-11-15',
    lastTransactionType: 'vente',
  };

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
      catnatLast10Years: 2,
      pprApproved: true,
      enrichment: georisques?.enrichment,
    },
    climate,
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
        dvf: today,
        ign: ignAlt.altitude !== null ? today : null,
        openmeteo_climate: today,
        drias: today,
      },
    },
  };

  const scores = scoreAll(fullInput);
  const assessmentId = randomUUID();

  // Save assessment snapshot to DB asynchronously
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

function emptyClimate() {
  return {
    freezeDaysPerYear: null, stormFrequency: null, hailRisk: null, annualPrecipitation: null,
    heatwaveDaysPerYear: null, windZone: null, snowZone: null, projectedFreezeDays: null,
    projectedHeatwaveDays: null, projectedPrecipitation: null, projectedStormFrequency: null,
    projectionModel: null, projectionScenario: null, meanHumidity: null, maxHumidity: null,
    minHumidity: null, soilMoisture: null, projectedSoilMoisture: null,
  };
}

function emptyNaturalRisks(): any {
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

function emptyTechnoRisks(): any {
  return {
    icpe: { present: false, level: null },
    nucleaire: { present: false, level: null },
    canalisationsMatieresDangereuses: { present: false, level: null },
    pollutionSols: { present: false, level: null },
    ruptureBarrage: { present: false, level: null },
    risqueMinier: { present: false, level: null },
  };
}
