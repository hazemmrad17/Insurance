/**
 * Scoring Engine — 5-Peril Risk Scoring (frontend subset)
 * ========================================================
 *
 * ⚠️ The full scoring engine now runs on the backend (packages/api/src/services/scoring.service.ts).
 * This frontend file keeps only what the UI needs:
 *   - scoreProjected: recompute projected scores after user mitigates perils
 *   - PERIL_META: display metadata for the 5 perils
 *
 * The core scoring functions are NOT exported anymore — they are internal
 * helpers for scoreProjected.
 */

import type { RiskAssessmentInput, RiskLevel } from './schema.js';
import type { PerilScores } from '../views/property-risk/risk-state.js';

/* ═══════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════ */

/** Map a risk level string to a numeric severity (0-100) */
function levelToSeverity(level: RiskLevel['level']): number {
  switch (level) {
    case 'tres_fort': return 90;
    case 'fort':      return 70;
    case 'moyen':     return 40;
    case 'faible':    return 15;
    default:          return 0;
  }
}

/** Clamp a number between 0 and 100 */
function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Normalize a distance (m) to a 0-100 proximity score: closer = higher risk */
function proximityScore(distance: number | null, maxDist: number): number {
  if (distance === null) return 0;
  if (distance >= maxDist) return 0;
  return Math.round((1 - distance / maxDist) * 100);
}

/* ═══════════════════════════════════════════════════════════════
   Per-Peril Scoring Functions
   ═══════════════════════════════════════════════════════════════ */

/**
 * Inondation (flooding)
 * Sources: Géorisques inondation level + distance to waterway + altitude
 */
function scoreInondation(assessment: RiskAssessmentInput): number {
  const inondation = assessment.risks.naturels.inondation;
  const waterDist = assessment.geography?.distanceToWaterway ?? null;
  const altitude = assessment.geography?.altitude ?? null;

  // Component 1: Géorisques inondation presence/level (40% weight)
  const georisqueScore = inondation.present
    ? Math.max(levelToSeverity(inondation.level), 25) // at least 25 if present
    : 0;

  // Component 2: Distance to waterway (30% weight)
  // <100m = high risk, >1000m = negligible
  const waterScore = proximityScore(waterDist, 1000);

  // Component 3: Altitude (30% weight)
  // <10m = high risk (flood plain), >50m = low risk
  let altitudeScore = 0;
  if (altitude !== null) {
    if (altitude < 10) altitudeScore = 70;
    else if (altitude < 30) altitudeScore = 40;
    else if (altitude < 50) altitudeScore = 20;
    else altitudeScore = 5;
  }

  return clamp(georisqueScore * 0.40 + waterScore * 0.30 + altitudeScore * 0.30);
}

/**
 * RGA — Retrait-Gonflement des Argiles (clay soil subsidence)
 * Sources: Géorisques RGA level + soil moisture + BDNB clayExposure
 */
function scoreRga(assessment: RiskAssessmentInput): number {
  const rga = assessment.risks.naturels.retraitGonflementArgile;
  const soilMoisture = assessment.climate?.soilMoisture ?? null;
  const clayExposure = assessment.property?.clayExposure ?? null;

  // Component 1: Géorisques RGA level (50% weight)
  const rgaScore = rga.present
    ? Math.max(levelToSeverity(rga.level), 20)
    : 0;

  // Component 2: Soil moisture (25% weight)
  // Lower soil moisture = higher RGA risk (dry = shrinkage)
  let moistureScore = 15; // default moderate
  if (soilMoisture !== null) {
    if (soilMoisture < 0.15) moistureScore = 60;
    else if (soilMoisture < 0.25) moistureScore = 40;
    else if (soilMoisture < 0.35) moistureScore = 20;
    else moistureScore = 5;
  }

  // Component 3: BDNB clay exposure (25% weight)
  let bdnbClayScore = 0;
  if (clayExposure) {
    const upper = clayExposure.toUpperCase();
    if (upper.includes('FORT')) bdnbClayScore = 70;
    else if (upper.includes('MOYEN')) bdnbClayScore = 40;
    else if (upper.includes('FAIBLE')) bdnbClayScore = 15;
  }

  return clamp(rgaScore * 0.50 + moistureScore * 0.25 + bdnbClayScore * 0.25);
}

/**
 * Tempête / Vent violent (storm / violent wind)
 * Sources: Open-Meteo wind zone + storm frequency + Géorisques cyclone
 */
function scoreTempete(assessment: RiskAssessmentInput): number {
  const windZone = assessment.climate?.windZone ?? null;
  const stormFreq = assessment.climate?.stormFrequency ?? null;
  const cyclone = assessment.risks.naturels.cyclone;

  // Component 1: Wind zone (40% weight)
  // windZone is 1-5, map to score
  let windScore = 0;
  if (windZone !== null) {
    windScore = windZone <= 1 ? 10 : windZone === 2 ? 30 : windZone === 3 ? 55 : windZone >= 4 ? 80 : 10;
  }

  // Component 2: Storm frequency (40% weight)
  let stormScore = 0;
  if (stormFreq !== null) {
    stormScore = stormFreq <= 1 ? 10 : stormFreq === 2 ? 30 : stormFreq === 3 ? 55 : stormFreq >= 4 ? 80 : 10;
  }

  // Component 3: Cyclone present (20% weight)
  const cycloneScore = cyclone.present ? 60 : 0;

  return clamp(windScore * 0.40 + stormScore * 0.40 + cycloneScore * 0.20);
}

/**
 * Incendie / Feu de forêt (wildfire)
 * Sources: Géorisques feuForet + DRIAS fireWeatherIndex + distance to forest
 */
function scoreIncendie(assessment: RiskAssessmentInput): number {
  const feuForet = assessment.risks.naturels.feuForet;
  const fwi = assessment.climate?.drias?.fireWeatherIndex ?? null;
  const forestDist = assessment.geography?.distanceToForest ?? null;

  // Component 1: Géorisques feuForet presence (40% weight)
  if (!feuForet.present) return 0; // If no fire risk flagged, score is 0

  const feuScore = levelToSeverity(feuForet.level) || 30;

  // Component 2: Fire Weather Index (30% weight)
  let fwiScore = 15; // default moderate
  if (fwi !== null) {
    if (fwi >= 50) fwiScore = 80;
    else if (fwi >= 35) fwiScore = 55;
    else if (fwi >= 20) fwiScore = 30;
    else if (fwi >= 10) fwiScore = 15;
    else fwiScore = 5;
  }

  // Component 3: Distance to forest (30% weight)
  // <100m = high risk, >2000m = negligible
  const forestScore = proximityScore(forestDist, 2000);

  return clamp(feuScore * 0.40 + fwiScore * 0.30 + forestScore * 0.30);
}

/**
 * Séisme (earthquake / seismic)
 * Sources: Géorisques seisme level
 */
function scoreSeisme(assessment: RiskAssessmentInput): number {
  const seisme = assessment.risks.naturels.seisme;
  if (!seisme.present) return 0;
  return clamp(levelToSeverity(seisme.level));
}

/* ═══════════════════════════════════════════════════════════════
   Global Score — Weighted Composite
   ═══════════════════════════════════════════════════════════════ */

/**
 * Weights reflect typical French insurance claim frequency/severity:
 * - Inondation: 30% (most frequent + severe claims)
 * - RGA: 25% (growing rapidly with climate change)
 * - Tempête: 20% (frequent but lower severity)
 * - Incendie: 15% (rare but very high severity)
 * - Séisme: 10% (rare in mainland France, but high severity)
 */
const GLOBAL_WEIGHTS = {
  inondation: 0.30,
  rga: 0.25,
  tempete: 0.20,
  incendie: 0.15,
  seisme: 0.10,
};

function weightedGlobal(perilScores: Omit<PerilScores, 'global'>): number {
  const weighted =
    perilScores.inondation * GLOBAL_WEIGHTS.inondation +
    perilScores.rga * GLOBAL_WEIGHTS.rga +
    perilScores.tempete * GLOBAL_WEIGHTS.tempete +
    perilScores.incendie * GLOBAL_WEIGHTS.incendie +
    perilScores.seisme * GLOBAL_WEIGHTS.seisme;

  return clamp(weighted);
}

/* ═══════════════════════════════════════════════════════════════
   Public API
   ═══════════════════════════════════════════════════════════════ */

/**
 * Compute all 5 per-peril scores + weighted global score
 * from a single RiskAssessmentInput.
 */
/** @internal — used by scoreProjected. Backend version is in packages/api */
function scoreAll(assessment: RiskAssessmentInput): PerilScores {
  const scores = {
    inondation: scoreInondation(assessment),
    rga: scoreRga(assessment),
    tempete: scoreTempete(assessment),
    incendie: scoreIncendie(assessment),
    seisme: scoreSeisme(assessment),
  };

  return {
    ...scores,
    global: weightedGlobal(scores),
  };
}

/**
 * Compute the projected scores after mitigating specific perils.
 * @param assessment The current assessment
 * @param mitigatedPerils Array of peril keys that have been mitigated
 */
export function scoreProjected(
  assessment: RiskAssessmentInput,
  mitigatedPerils: ('inondation' | 'rga' | 'tempete' | 'incendie' | 'seisme')[],
): PerilScores {
  const base = scoreAll(assessment);

  const mitigationFactor = 0.55; // 55% reduction per mitigated peril

  const projected = { ...base };
  for (const peril of mitigatedPerils) {
    projected[peril] = Math.round(base[peril] * (1 - mitigationFactor));
  }

  projected.global = weightedGlobal(projected);
  return projected;
}

/* ── Per-peril metadata for UI rendering ── */

export interface PerilMeta {
  key: string;
  label: string;
  icon: string;
  description: string;
}

export const PERIL_META: PerilMeta[] = [
  { key: 'inondation', label: 'Inondation', icon: 'water_flood', description: 'Risque de crues et submersions' },
  { key: 'rga',        label: 'Retrait-gonflement argiles', icon: 'landslide', description: 'Risque de sécheresse et gonflement des sols argileux' },
  { key: 'tempete',    label: 'Tempête / Vent', icon: 'air', description: 'Risque de vents violents et tempêtes' },
  { key: 'incendie',   label: 'Feu de forêt', icon: 'local_fire_department', description: 'Risque d\'incendie de végétation' },
  { key: 'seisme',     label: 'Séisme', icon: 'earthquake', description: 'Risque sismique' },
];
