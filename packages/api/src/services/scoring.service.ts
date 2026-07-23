/**
 * Scoring Engine Service
 * Moved to backend — scoring formulas are completely hidden from frontend source maps.
 */
import type { RiskAssessmentInput, RiskLevel, PerilScores } from '@previa/shared/schema';

function levelToSeverity(level: RiskLevel['level']): number {
  switch (level) {
    case 'tres_fort': return 90;
    case 'fort':      return 70;
    case 'moyen':     return 40;
    case 'faible':    return 15;
    default:          return 0;
  }
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function proximityScore(distance: number | null, maxDist: number): number {
  if (distance === null) return 0;
  if (distance >= maxDist) return 0;
  return Math.round((1 - distance / maxDist) * 100);
}

function scoreInondation(assessment: RiskAssessmentInput): number {
  const inondation = assessment.risks.naturels.inondation;
  const waterDist = assessment.geography?.distanceToWaterway ?? null;
  const altitude = assessment.geography?.altitude ?? null;

  const georisqueScore = inondation.present
    ? Math.max(levelToSeverity(inondation.level), 25)
    : 0;

  const waterScore = proximityScore(waterDist, 1000);

  let altitudeScore = 0;
  if (altitude !== null) {
    if (altitude < 10) altitudeScore = 70;
    else if (altitude < 30) altitudeScore = 40;
    else if (altitude < 50) altitudeScore = 20;
    else altitudeScore = 5;
  }

  return clamp(georisqueScore * 0.40 + waterScore * 0.30 + altitudeScore * 0.30);
}

function scoreRga(assessment: RiskAssessmentInput): number {
  const rga = assessment.risks.naturels.retraitGonflementArgile;
  const soilMoisture = assessment.climate?.soilMoisture ?? null;
  const clayExposure = assessment.property?.clayExposure ?? null;

  const rgaScore = rga.present
    ? Math.max(levelToSeverity(rga.level), 20)
    : 0;

  let moistureScore = 15;
  if (soilMoisture !== null) {
    if (soilMoisture < 0.15) moistureScore = 60;
    else if (soilMoisture < 0.25) moistureScore = 40;
    else if (soilMoisture < 0.35) moistureScore = 20;
    else moistureScore = 5;
  }

  let bdnbClayScore = 0;
  if (clayExposure) {
    const upper = clayExposure.toUpperCase();
    if (upper.includes('FORT')) bdnbClayScore = 70;
    else if (upper.includes('MOYEN')) bdnbClayScore = 40;
    else if (upper.includes('FAIBLE')) bdnbClayScore = 15;
  }

  return clamp(rgaScore * 0.50 + moistureScore * 0.25 + bdnbClayScore * 0.25);
}

function scoreTempete(assessment: RiskAssessmentInput): number {
  const windZone = assessment.climate?.windZone ?? null;
  const stormFreq = assessment.climate?.stormFrequency ?? null;
  const cyclone = assessment.risks.naturels.cyclone;

  let windScore = 0;
  if (windZone !== null) {
    windScore = windZone <= 1 ? 10 : windZone === 2 ? 30 : windZone === 3 ? 55 : windZone >= 4 ? 80 : 10;
  }

  let stormScore = 0;
  if (stormFreq !== null) {
    stormScore = stormFreq <= 1 ? 10 : stormFreq === 2 ? 30 : stormFreq === 3 ? 55 : stormFreq >= 4 ? 80 : 10;
  }

  const cycloneScore = cyclone.present ? 60 : 0;

  return clamp(windScore * 0.40 + stormScore * 0.40 + cycloneScore * 0.20);
}

function scoreIncendie(assessment: RiskAssessmentInput): number {
  const feuForet = assessment.risks.naturels.feuForet;
  const fwi = assessment.climate?.drias?.fireWeatherIndex ?? null;
  const forestDist = assessment.geography?.distanceToForest ?? null;

  if (!feuForet.present) return 0;

  const feuScore = levelToSeverity(feuForet.level) || 30;

  let fwiScore = 15;
  if (fwi !== null) {
    if (fwi >= 50) fwiScore = 80;
    else if (fwi >= 35) fwiScore = 55;
    else if (fwi >= 20) fwiScore = 30;
    else if (fwi >= 10) fwiScore = 15;
    else fwiScore = 5;
  }

  const forestScore = proximityScore(forestDist, 2000);

  return clamp(feuScore * 0.40 + fwiScore * 0.30 + forestScore * 0.30);
}

function scoreSeisme(assessment: RiskAssessmentInput): number {
  const seisme = assessment.risks.naturels.seisme;
  if (!seisme.present) return 0;
  return clamp(levelToSeverity(seisme.level));
}

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

export function scoreAll(assessment: RiskAssessmentInput): PerilScores {
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
