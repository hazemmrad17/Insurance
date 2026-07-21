/**
 * Risk Assessment — Unified Input Schema
 * ========================================
 *
 * Aggregates data from all providers into a single, normalized JSON input
 * for the scoring formula. Only useful fields — no raw geometries, no
 * technical IDs, no display-only noise.
 *
 * Providers mapped:
 *   - BDNB       → property (building characteristics)
 *   - Géorisques → risks (natural + technological)
 *   - DVF        → property (reconstruction value)
 *   - IGN        → property (altitude, cadastral parcel)
 *   - MétéoFrance → environment (climate norms)
 *   - ADEME       → covered by BDNB (DPE already present)
 *   - BRGM        → covered by Géorisques (argiles, cavités already present)
 */

/* ═══════════════════════════════════════════════════════════════
   Provider: BDNB (api.bdnb.io)
   Building characteristics — already integrated
   ═══════════════════════════════════════════════════════════════ */

export interface BuildingData {
  /** Year of construction — key age/vetusty factor */
  builtYear: number | null;
  /** Construction period band — more predictive than exact year */
  constructionPeriod: '<1915' | '1915_1948' | '1949_1974' | '1975_2000' | '2001_2012' | '2013_2021' | '>2021' | null;
  /** Total useful floor area (m²) — reconstruction cost basis */
  surfaceUtile: number | null;
  /** Ground footprint (m²) */
  surfaceEmprise: number | null;
  /** Number of levels */
  levels: number | null;
  /** Mean height (m) */
  height: number | null;
  /** DPE class (A–G) — building quality proxy */
  dpeClass: string | null;
  /** Annual energy consumption (kWh/m²/an) */
  energyConsumption: number | null;
  /** GHG emissions (kgCO₂/m²/an) */
  emissionGes: number | null;
  /** Wall material (e.g. BETON_BANCHES, BRIQUES, PIERRE) */
  wallMaterial: string | null;
  /** Roof material (e.g. TUILES, ARDOISES, METAL) */
  roofMaterial: string | null;
  /** Heating system type (e.g. GAZ, ELECTRIQUE, BOIS) */
  heatingType: string | null;
  /** Main usage (e.g. habitation, commercial, bureaux) */
  usageType: string | null;
  /** Number of housing units */
  nbLogements: number | null;
  /** INSEE department code */
  departmentCode: string | null;
}

/* ═══════════════════════════════════════════════════════════════
   Provider: DVF (data.gouv.fr — Demandes de Valeurs Foncières)
   Property transaction values — CSV files, no official REST API
   ═══════════════════════════════════════════════════════════════ */

export interface DvfData {
  /** Estimated reconstruction value per m² (€) */
  reconstructionValuePerSqm: number | null;
  /** Market price per m² from last transaction (€) */
  lastTransactionPricePerSqm: number | null;
  /** Date of last recorded transaction (ISO) */
  lastTransactionDate: string | null;
  /** Property type in transaction (maison, appartement, terrain) */
  lastTransactionType: string | null;
  /** Confidence level based on number of recent transactions */
  dataConfidence: 'high' | 'medium' | 'low' | null;
}

/* ═══════════════════════════════════════════════════════════════
   Provider: IGN (geoservices.ign.fr — API Carto + Altimétrie)
   Cadastral parcels, altitude, slope
   — Requires API key (free registration)
   ═══════════════════════════════════════════════════════════════ */

export interface IgnData {
  /** Cadastral parcel ID (e.g. "75056000AN0123") */
  parcelId: string | null;
  /** Altitude at building location (m) — flood/crucial */
  altitude: number | null;
  /** Slope category */
  slope: 'flat' | 'moderate' | 'steep' | null;
  /** Distance to nearest waterway (m) — flood risk */
  distanceToWaterway: number | null;
  /** Distance to nearest fire station (m) — emergency response time */
  distanceFireStation: number | null;
  /** Land occupation type */
  landUse: 'urban' | 'rural' | 'forest' | 'agricultural' | null;
}

/* ═══════════════════════════════════════════════════════════════
   Provider: Géorisques (georisques.gouv.fr/api/v1)
   Natural + technological risks — already integrated
   ═══════════════════════════════════════════════════════════════ */

export interface RiskLevel {
  present: boolean;
  /** Normalised severity — only meaningful when present is true */
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

export interface GeorisquesData {
  naturels: NaturalRisks;
  technologiques: TechnoRisks;
  /** Commune name */
  commune: string | null;
  /** INSEE commune code */
  communeCode: string | null;
  /** Total number of present natural risks (convenience) */
  naturalRiskCount: number;
  /** Total number of present techno risks (convenience) */
  technoRiskCount: number;
  /** Number of CATNAT decrees in the last 10 years — disaster frequency */
  catnatLast10Years: number | null;
  /** Whether a PPR (Plan de Prévention des Risques) is approved for this commune */
  pprApproved: boolean | null;
  /**
   * v2 enrichment (from Géorisques v2 thematic endpoints)
   * Populated when a v2 API token is available.
   * These supplement the commune-level v1 data with more structured per-thematic data.
   */
  enrichment?: {
    /** Argile exposure codes from /api/v2/rga — e.g. [{code: 3, label: "Exposition forte"}] */
    argileExposition: { code: number; label: string }[] | null;
    /** Number of underground cavities found near the location (from /api/v2/cavites) */
    cavitiesNearby: number | null;
    /** Number of polluted/industrial sites near the location (from /api/v2/ssp) */
    pollutedSitesNearby: number | null;
  };
}

/* ═══════════════════════════════════════════════════════════════
   Provider: Météo-France (meteo.data.gouv.fr)
   Climate norms & extreme event frequency by station/department
   — CSV/Parquet files, processed from station records
   ═══════════════════════════════════════════════════════════════ */

export interface ClimateData {
  /** Average annual freeze days (T < 0°C) */
  freezeDaysPerYear: number | null;
  /** Storm frequency index (1–5) */
  stormFrequency: number | null;
  /** Hail risk index (1–5) */
  hailRisk: number | null;
  /** Average annual precipitation (mm) */
  annualPrecipitation: number | null;
  /** Heatwave days per year (T > 35°C) */
  heatwaveDaysPerYear: number | null;
  /** Wind zone (1–4 per French building code) */
  windZone: number | null;
  /** Snow load zone (A1–C2 per French building code) */
  snowZone: string | null;
}

/* ═══════════════════════════════════════════════════════════════
   Metadata — source tracking & freshness
   ═══════════════════════════════════════════════════════════════ */

export interface AssessmentMetadata {
  /** Geocoded address label */
  addressLabel: string;
  /** Longitude (WGS84) */
  longitude: number;
  /** Latitude (WGS84) */
  latitude: number;
  /** Commune name */
  communeName: string;
  /** INSEE commune code */
  communeCode: string;
  /** ISO date of data collection */
  assessmentDate: string;
  /** Per-provider data freshness */
  dataFreshness: {
    bdnb: string | null;
    georisques: string | null;
    dvf: string | null;
    ign: string | null;
    meteofrance: string | null;
  };
}

/* ═══════════════════════════════════════════════════════════════
   UNIFIED INPUT — THE JSON TO FEED THE SCORING FORMULA
   ═══════════════════════════════════════════════════════════════ */

export interface RiskAssessmentInput {
  /** Building characteristics (BDNB) */
  property: BuildingData;

  /** Property valuation (DVF) — optional, CSV import */
  valuation?: DvfData;

  /** Geographical context (IGN) — optional, API key required */
  geography?: IgnData;

  /** Risk exposure (Géorisques) */
  risks: GeorisquesData;

  /** Climate exposure (Météo France) — optional, processed data */
  climate?: ClimateData;

  /** Assessment context */
  metadata: AssessmentMetadata;
}

/* ═══════════════════════════════════════════════════════════════
   EXAMPLE — Complete JSON for a Parisian property
   ═══════════════════════════════════════════════════════════════ */

export const EXAMPLE_INPUT: RiskAssessmentInput = {
  property: {
    builtYear: 1978,
    constructionPeriod: '1949_1974',
    surfaceUtile: 120,
    surfaceEmprise: 85,
    levels: 3,
    height: 9.5,
    dpeClass: 'D',
    energyConsumption: 180,
    emissionGes: 28.5,
    wallMaterial: 'BETON_BANCHES',
    roofMaterial: 'TUILES',
    heatingType: 'GAZ_INDIVIDUEL',
    usageType: 'habitation',
    nbLogements: 1,
    departmentCode: '75',
  },
  valuation: {
    reconstructionValuePerSqm: 2800,
    lastTransactionPricePerSqm: 10500,
    lastTransactionDate: '2025-09-15',
    lastTransactionType: 'appartement',
    dataConfidence: 'high',
  },
  geography: {
    parcelId: '75056000AN0123',
    altitude: 42,
    slope: 'flat',
    distanceToWaterway: 850,
    distanceFireStation: 1200,
    landUse: 'urban',
  },
  risks: {
    naturels: {
      inondation: { present: true, level: 'fort' },
      remonteeNappe: { present: true, level: 'moyen' },
      risqueCotier: { present: false, level: null },
      seisme: { present: false, level: null },
      mouvementTerrain: { present: false, level: null },
      retraitGonflementArgile: { present: true, level: 'fort' },
      reculTraitCote: { present: false, level: null },
      avalanche: { present: false, level: null },
      feuForet: { present: false, level: null },
      eruptionVolcanique: { present: false, level: null },
      cyclone: { present: false, level: null },
      radon: { present: true, level: 'faible' },
    },
    technologiques: {
      icpe: { present: false, level: null },
      nucleaire: { present: false, level: null },
      canalisationsMatieresDangereuses: { present: false, level: null },
      pollutionSols: { present: false, level: null },
      ruptureBarrage: { present: false, level: null },
      risqueMinier: { present: false, level: null },
    },
    commune: 'Paris',
    communeCode: '75056',
    naturalRiskCount: 4,
    technoRiskCount: 0,
    catnatLast10Years: 3,
    pprApproved: true,
  },
  climate: {
    freezeDaysPerYear: 12,
    stormFrequency: 2,
    hailRisk: 1,
    annualPrecipitation: 637,
    heatwaveDaysPerYear: 18,
    windZone: 2,
    snowZone: 'A1',
  },
  metadata: {
    addressLabel: '8 Rue de la Paix, 75002 Paris',
    longitude: 2.3322,
    latitude: 48.8698,
    communeName: 'Paris',
    communeCode: '75056',
    assessmentDate: '2026-07-21',
    dataFreshness: {
      bdnb: '2026-06-15',
      georisques: '2026-07-21',
      dvf: '2026-04-01',
      ign: null,
      meteofrance: null,
    },
  },
};

/* ═══════════════════════════════════════════════════════════════
   PROVIDER ACCESS SUMMARY (for reference)
   ═══════════════════════════════════════════════════════════════
 
   Provider   | Data              | Access                    | Auth     | Cost
   -----------|-------------------|---------------------------|----------|------
   BDNB       | Building          | REST API / PostgREST      | None     | Free
   Géorisques | Natural/techno    | REST API v1               | None     | Free
              | risks             | WMS/WFS (map overlays)    |          |
   DVF        | Property values   | CSV files (data.gouv.fr)  | None     | Free
              |                   | Third-party DVF+ API      | API key  | Paid
   IGN        | Parcels, altitude | API Carto + Altimétrie    | API key  | Free
   MétéoFrance| Climate norms     | CSV files (meteo.data.)   | None     | Free
              |                   | API (forecast only)       | API key  | Free
   ADEME      | DPE (energy)      | CSV files (data.ademe.fr) | None     | Free
              |                   | (covered by BDNB)         |          |
   BRGM       | Soil, cavités     | Via Géorisques (included) | None     | Free
   Vigicrues  | Real-time flood   | REST API                  | None     | Free
              |                   | (not relevant for static  |          |
              |                   |  scoring)                 |          |
   ═══════════════════════════════════════════════════════════════ */
