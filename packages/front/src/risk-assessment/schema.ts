/**
 * Risk Assessment Schema — Core Types
 * =====================================
 *
 * Defines the full shape of a RiskAssessmentInput produced by the
 * orchestrator and consumed by the results panel / risk hub.
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
  /** Année de construction (estimée ou observée) */
  builtYear: number | null;
  /** Période de construction catégorisée (<1915, 1915_1948, …, >2021) */
  constructionPeriod: '<1915' | '1915_1948' | '1949_1974' | '1975_2000' | '2001_2012' | '2013_2021' | '>2021' | null;
  /** Surface habitable en m² (issue du DPE — souvent null) */
  surfaceUtile: number | null;
  /** Surface d'emprise au sol en m² (géométrie du groupe) */
  surfaceEmprise: number | null;
  /** Nombre de niveaux (étages + RDC) */
  levels: number | null;
  /** Hauteur moyenne du bâtiment en mètres (hauteur_mean) */
  height: number | null;
  /** Classe DPE (A–G) */
  dpeClass: string | null;
  /** Consommation d'énergie primaire (kWh/m²/an) */
  energyConsumption: number | null;
  /** Émissions de gaz à effet de serre (kgCO₂/m²/an) */
  emissionGes: number | null;
  /** Matériau principal des murs extérieurs (ex: PIERRE, BETON, BOIS) */
  wallMaterial: string | null;
  /** Matériau principal de la toiture (ex: TUILES, ZINC) */
  roofMaterial: string | null;
  /** Type de chauffage principal */
  heatingType: string | null;
  /** Usage principal (Résidentiel individuel / collectif, Tertiaire, Mixte) */
  usageType: string | null;
  /** Nombre de logements (nb_logements — source RNC) */
  nbLogements: number | null;
  /** Code département INSEE */
  departmentCode: string | null;

  /* ── Nouveaux champs BDNB ── */

  /** Nombre de logements source RNC (nb_log — plus fiable) */
  nbLogementsRnc: number | null;
  /** Exposition argile (alea_argile: Faible, Moyen, Fort) */
  clayExposure: string | null;
  /** Altitude du sol moyenne (altitude_sol_mean — mètres IGN69) */
  altitudeSolMean: number | null;
  /** Type d'énergie de chauffage (type_energie_chauffage) */
  heatingEnergyType: string | null;
  /** Liste des IDs parcellaires cadastraux (l_parcelle_id) */
  parcelIds: string[] | null;
  /** Quartier prioritaire politique de la ville (quartier_prioritaire) */
  quartierPrioritaire: boolean | null;
  /** Zone PLU bâti patrimonial (zone_plu_bati_patrimonial) */
  zonePatrimoniale: string | boolean | null;
}

/* ═══════════════════════════════════════════════════════════════
   Valuation (DVF — department-level lookup)
   ═══════════════════════════════════════════════════════════════ */

export interface DvfData {
  /** Valeur de reconstruction estimée en €/m² */
  reconstructionValuePerSqm: number | null;
  /** Prix de marché moyen en €/m² (dernières transactions connues) */
  lastTransactionPricePerSqm: number | null;
  /** Date de la dernière transaction (si connue) */
  lastTransactionDate: string | null;
  /** Type de transaction (vente, donation, etc.) */
  lastTransactionType: string | null;
}

/* ═══════════════════════════════════════════════════════════════
   Geography (IGN)
   ═══════════════════════════════════════════════════════════════ */

export interface IgnData {
  /** ID parcelle cadastrale (format: 75102-000-AB-0047) */
  parcelId: string | null;
  /** Altitude du terrain en mètres (RGE ALTI) */
  altitude: number | null;
  /** Pente estimée (flat < 10m, moderate < 100m, steep ≥ 100m) */
  slope: 'flat' | 'moderate' | 'steep' | null;
  /** Distance au cours d'eau le plus proche en mètres (WFS BD TOPO) */
  distanceToWaterway: number | null;
  /** Distance à la forêt la plus proche en mètres (WFS Masque Forêt IGN) */
  distanceToForest: number | null;
  /** Distance à la caserne de pompiers la plus proche en mètres */
  distanceFireStation: number | null;
  /** Occupation du sol (urban, forest, agricultural, etc.) */
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
  /** Exposition argile par parcelle (v2 /rga) — code BRGM + label */
  argileExposition: { code: number; label: string }[] | null;
  /** Nombre de cavités souterraines à proximité (v2 /cavites) */
  cavitiesNearby: number | null;
  /** Nombre de sites pollués à proximité (v2 /ssp) */
  pollutedSitesNearby: number | null;
}

export interface RiskData {
  naturels: NaturalRisks;
  technologiques: TechnoRisks;
  commune: string | null;
  communeCode: string | null;
  naturalRiskCount: number;
  technoRiskCount: number;
  /** Nombre d'arrêtés CATNAT sur les 10 dernières années */
  catnatLast10Years: number | null;
  /** PPR approuvé (true par défaut pour la plupart des communes) */
  pprApproved: boolean;
  /** Enrichissement thématique v2 (quand token disponible) */
  enrichment?: RiskEnrichment;
}

/* ═══════════════════════════════════════════════════════════════
   Climate (Open-Meteo CMIP6 + DRIAS ADAMONT)
   ═══════════════════════════════════════════════════════════════ */

export interface ClimateData {
  /* ── Historical norms (2000–2014) ── */
  /** Jours de gel (Tmin < 0°C) par an — moyenne 2000–2014 */
  freezeDaysPerYear: number | null;
  /** Fréquence des tempêtes (1–5) — dérivé du vent max */
  stormFrequency: number | null;
  /** Risque de grêle estimé (1–5) */
  hailRisk: number | null;
  /** Précipitations annuelles moyennes (mm) — 2000–2014 */
  annualPrecipitation: number | null;
  /** Jours de canicule (Tmax > 35°C) par an — 2000–2014 */
  heatwaveDaysPerYear: number | null;
  /** Zone de vent (1–5) — dérivé max wind */
  windZone: number | null;
  /** Zone de neige (A1, A2, B1, B2, C1, C2) */
  snowZone: string | null;

  /* ── Future projections (2040–2050, CMIP6 EC_Earth3P_HR) ── */
  /** Jours de gel projetés par an (2040–2050) */
  projectedFreezeDays: number | null;
  /** Jours de canicule projetés par an (2040–2050) */
  projectedHeatwaveDays: number | null;
  /** Précipitations annuelles projetées (mm) — 2040–2050 */
  projectedPrecipitation: number | null;
  /** Fréquence des tempêtes projetée (1–5) */
  projectedStormFrequency: number | null;
  /** Modèle de projection */
  projectionModel: string | null;
  /** Scénario de projection */
  projectionScenario: string | null;

  /* ── Nouveaux champs Open-Meteo ── */
  /** Humidité relative moyenne (%) — 2000–2014 */
  meanHumidity: number | null;
  /** Humidité relative maximale moyenne (%) — 2000–2014 */
  maxHumidity: number | null;
  /** Humidité relative minimale moyenne (%) — 2000–2014 */
  minHumidity: number | null;
  /** Humidité du sol 0-10cm (m³/m³) — moyenne 2000–2014 */
  soilMoisture: number | null;
  /** Humidité du sol projetée 0-10cm (m³/m³) — 2040–2050 */
  projectedSoilMoisture: number | null;

  /* ── DRIAS ADAMONT bias-corrected ── */
  drias?: DriasData;
}

export interface DriasData {
  /** Méthode de correction (ADAMONT sur SAFRAN 1959-2019) */
  method: string;
  /** Niveau de réchauffement (+4°C France TRACC horizon 2050) */
  warmingLevel: string;
  /** Jours de canicule corrigés (/an) */
  heatwaveDays: number | null;
  /** Nuits tropicales corrigées (/an) */
  tropicalNights: number | null;
  /** Jours d'été corrigés (/an) */
  summerDays: number | null;
  /** Jours de fortes précipitations corrigés (/an) */
  heavyPrecipDays: number | null;
  /** Précipitation max sur 5 jours (mm) */
  max5dayPrecip: number | null;
  /** Jours secs consécutifs max */
  consecutiveDryDays: number | null;
  /** Indice Feux de Forêt (FWI — maximum) */
  fireWeatherIndex: number | null;
  /** Jours de gel corrigés (/an) */
  frostDays: number | null;
  /** Source du jeu de données */
  dataSource: string | null;
}

/* ═══════════════════════════════════════════════════════════════
   Metadata
   ═══════════════════════════════════════════════════════════════ */

export interface AssessmentMetadata {
  /** Libellé complet de l'adresse */
  addressLabel: string;
  /** Longitude WGS84 */
  longitude: number;
  /** Latitude WGS84 */
  latitude: number;
  /** Nom de la commune */
  communeName: string;
  /** Code INSEE de la commune */
  communeCode: string;
  /** Date de l'évaluation (ISO 8601) */
  assessmentDate: string;
  /** Fraîcheur des données par provider */
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
  /** Données bâtiment (BDNB) */
  property: BuildingData;
  /** Valorisation (DVF) */
  valuation?: DvfData;
  /** Données géographiques (IGN) */
  geography: IgnData;
  /** Risques naturels et technologiques (Géorisques) */
  risks: RiskData;
  /** Données climatiques (Open-Meteo CMIP6 + DRIAS) */
  climate: ClimateData;
  /** Métadonnées */
  metadata: AssessmentMetadata;
}
