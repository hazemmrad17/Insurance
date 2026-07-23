/**
 * Risk Assessment Schema — Core Types
 * =====================================
 *
 * Single source of truth for all types shared between packages/front and packages/api.
 * DO NOT copy this file — import it via `@previa/shared/schema`.
 *
 * Each section maps to one or more API providers:
 *   property   ← BDNB (Base Nationale des Bâtiments)
 *   valuation  ← DVF (Demandes de Valeurs Foncières)
 *   geography  ← IGN (Institut National de l'Information Géographique)
 *   risks      ← Géorisques (v1 consolidated + v2 thematic)
 *   climate    ← Open-Meteo Climate API (CMIP6) + DRIAS ADAMONT
 *   metadata   ← computed / static
 */

/* ═══════════════════════════════════════════════════════════════
   Building (BDNB)
   ═══════════════════════════════════════════════════════════════ */

export interface BuildingData {
  builtYear: number | null;
  constructionPeriod: '<1915' | '1915_1948' | '1949_1974' | '1975_2000' | '2001_2012' | '2013_2021' | '>2021' | null;
  surfaceUtile: number | null;
  surfaceEmprise: number | null;
  levels: number | null;
  height: number | null;
  dpeClass: string | null;
  energyConsumption: number | null;
  emissionGes: number | null;
  wallMaterial: string | null;
  roofMaterial: string | null;
  heatingType: string | null;
  usageType: string | null;
  nbLogements: number | null;
  departmentCode: string | null;
  nbLogementsRnc: number | null;
  clayExposure: string | null;
  altitudeSolMean: number | null;
  heatingEnergyType: string | null;
  parcelIds: string[] | null;
  quartierPrioritaire: boolean | null;
  zonePatrimoniale: string | boolean | null;
}

/* ═══════════════════════════════════════════════════════════════
   Valuation (DVF)
   ═══════════════════════════════════════════════════════════════ */

export interface DvfData {
  reconstructionValuePerSqm: number | null;
  lastTransactionPricePerSqm: number | null;
  lastTransactionDate: string | null;
  lastTransactionType: string | null;
}

/* ═══════════════════════════════════════════════════════════════
   Geography (IGN)
   ═══════════════════════════════════════════════════════════════ */

export interface IgnData {
  parcelId: string | null;
  altitude: number | null;
  slope: 'flat' | 'moderate' | 'steep' | null;
  distanceToWaterway: number | null;
  distanceToForest: number | null;
  distanceFireStation: number | null;
  landUse: string | null;
}

/* ═══════════════════════════════════════════════════════════════
   Risks (Géorisques v1 + v2)
   ═══════════════════════════════════════════════════════════════ */

export interface RiskLevel {
  present: boolean;
  level: 'faible' | 'moyen' | 'fort' | 'tres_fort' | null;
}

export interface NaturalRisks {
  inondation: RiskLevel;
  remonteeNappe: RiskLevel;
  risqueCotier: RiskLevel;
  seisme: RiskLevel;
  mouvementTerrain: RiskLevel;
  retraitGonflementArgile: RiskLevel;
  reculTraitCote: RiskLevel;
  avalanche: RiskLevel;
  feuForet: RiskLevel;
  eruptionVolcanique: RiskLevel;
  cyclone: RiskLevel;
  radon: RiskLevel;
}

export interface TechnoRisks {
  icpe: RiskLevel;
  nucleaire: RiskLevel;
  canalisationsMatieresDangereuses: RiskLevel;
  pollutionSols: RiskLevel;
  ruptureBarrage: RiskLevel;
  risqueMinier: RiskLevel;
}

export interface RiskEnrichment {
  argileExposition: { code: number; label: string }[] | null;
  cavitiesNearby: number | null;
  pollutedSitesNearby: number | null;
}

export interface RiskData {
  naturels: NaturalRisks;
  technologiques: TechnoRisks;
  commune: string | null;
  communeCode: string | null;
  naturalRiskCount: number;
  technoRiskCount: number;
  catnatLast10Years: number | null;
  pprApproved: boolean;
  enrichment?: RiskEnrichment;
}

/* ═══════════════════════════════════════════════════════════════
   Climate (Open-Meteo CMIP6 + DRIAS ADAMONT)
   ═══════════════════════════════════════════════════════════════ */

export interface DriasData {
  method: string;
  warmingLevel: string;
  heatwaveDays: number | null;
  tropicalNights: number | null;
  summerDays: number | null;
  heavyPrecipDays: number | null;
  max5dayPrecip: number | null;
  consecutiveDryDays: number | null;
  fireWeatherIndex: number | null;
  frostDays: number | null;
  dataSource: string | null;
}

export interface ClimateData {
  freezeDaysPerYear: number | null;
  stormFrequency: number | null;
  hailRisk: number | null;
  annualPrecipitation: number | null;
  heatwaveDaysPerYear: number | null;
  windZone: number | null;
  snowZone: string | null;
  projectedFreezeDays: number | null;
  projectedHeatwaveDays: number | null;
  projectedPrecipitation: number | null;
  projectedStormFrequency: number | null;
  projectionModel: string | null;
  projectionScenario: string | null;
  meanHumidity: number | null;
  maxHumidity: number | null;
  minHumidity: number | null;
  soilMoisture: number | null;
  projectedSoilMoisture: number | null;
  drias?: DriasData;
}

/* ═══════════════════════════════════════════════════════════════
   Metadata
   ═══════════════════════════════════════════════════════════════ */

export interface AssessmentMetadata {
  addressLabel: string;
  longitude: number;
  latitude: number;
  communeName: string;
  communeCode: string;
  assessmentDate: string;
  dataFreshness: {
    bdnb: string | null;
    georisques: string | null;
    dvf: string | null;
    ign: string | null;
    openmeteo_climate: string | null;
    drias: string | null;
  };
}

/* ═══════════════════════════════════════════════════════════════
   Root — RiskAssessmentInput
   ═══════════════════════════════════════════════════════════════ */

export interface RiskAssessmentInput {
  property: BuildingData;
  valuation?: DvfData;
  geography: IgnData;
  risks: RiskData;
  climate: ClimateData;
  metadata: AssessmentMetadata;
}

/* ═══════════════════════════════════════════════════════════════
   Peril Scores
   ═══════════════════════════════════════════════════════════════ */

export interface PerilScores {
  inondation: number;
  rga: number;
  tempete: number;
  incendie: number;
  seisme: number;
  global: number;
}
