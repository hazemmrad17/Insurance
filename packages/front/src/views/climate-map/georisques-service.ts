/**
 * Géorisques API Service — v1 (consolidated) + v2 (thematic enrichment)
 * ====================================================================
 *
 * Architecture:
 *   ┌─ v1 (no auth) ──────────────────────────────────────────────┐
 *   │  /api/v1/resultats_rapport_risque?latlon=...               │
 *   │  Consolidated risk report (all risks, commune level)        │
 *   │  Also: /api/v1/gaspar/catnat for CATNAT history            │
 *   └─────────────────────────────────────────────────────────────┘
 *
 *   ┌─ v2 (requires Bearer token) ───────────────────────────────┐
 *   │  /api/v2/rga?codesParcelle=... Argile per parcel (max prec)│
 *   │  /api/v2/rga?codesInsee=...    Argile per commune (fallback)│
 *   │  /api/v2/cavites?latlon=...    Cavités souterraines        │
 *   │  /api/v2/ssp?latlon=...        Sites et Sols Pollués       │
 *   │                                                             │
 *   │  Parcel ID obtained via IGN reverse geocoding:              │
 *   │  /ign-geocodage/reverse?index=parcel&lon=...&lat=...       │
 *   │  Returns id like "75102000AB0052" → reformatted to         │
 *   │  Géorisques format: "75102-000-AB-0052"                    │
 *   │                                                             │
 *   │  NOTE: v2 has NO consolidated report endpoint.              │
 *   │  Each risk type is queried individually.                    │
 *   └─────────────────────────────────────────────────────────────┘
 *
 * Flow:
 *   fetchRisks(lon, lat)
 *     ├─ v1: consolidated commune-level report (always, no auth)
 *     ├─ IGN: reverse geocode → cadastral parcel ID (if token available)
 *     │   └─ v2: rga by parcel (max precision)
 *     └─ IGN fails? → v2: rga by commune (fallback)
 */

import { fetchWithTimeout } from './fetch-utils.js';

/* ═══════════════════════════════════════════════════════════════
   Types
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

export interface CatnatRecord {
  code_insee: string;
  libelle_risque: string;
  libelle_commune: string;
  date_debut: string;
  date_fin: string;
  date_arrete: string;
  date_jo: string;
  nature_risque: string;
}

export interface GeorisquesResult {
  risks: {
    naturels: NaturalRisks;
    technologiques: TechnoRisks;
    naturalRiskCount: number;
    technoRiskCount: number;
  };
  commune: string | null;
  communeCode: string | null;
  /** Source of the consolidated report (v1 always) */
  source: 'v1' | 'v1+v2';
  /** v2 thematic enrichment (only when token available) */
  enrichment?: {
    /** Argile exposure from /api/v2/rga — more structured than v1 */
    argileExposition: { code: number; label: string }[] | null;
    /** Number of cavities near location (from v2) */
    cavitiesNearby: number | null;
    /** Number of polluted sites near location (from v2) */
    pollutedSitesNearby: number | null;
  };
}

/* ═══════════════════════════════════════════════════════════════
   Token management
   ═══════════════════════════════════════════════════════════════ */

function getV2Token(): string | null {
  const token = (import.meta as any).env?.VITE_GEORISQUES_V2_TOKEN;
  return token?.trim() || null;
}

/* ═══════════════════════════════════════════════════════════════
   Public API — MAIN ENTRY POINT
   ═══════════════════════════════════════════════════════════════ */

/**
 * Fetch ALL risk data for a given location:
 *   1. v1 consolidated report (commune level) — always
 *   2. v2 thematic enrichment (if token available)
 */
export async function fetchRisks(
  lon: number,
  lat: number,
): Promise<GeorisquesResult> {
  // Step 1: v1 consolidated report (all risks at commune level)
  const v1Result = await fetchV1Consolidated(lon, lat);

  const token = getV2Token();
  if (!token) return v1Result;

  // Step 2: Try to get cadastral parcel ID from IGN (for per-parcel v2 queries)
  let cadastralId: string | undefined;
  try {
    cadastralId = await fetchCadastralParcel(lon, lat);
    if (cadastralId) {
      console.log('[Géorisques] Cadastral parcel:', cadastralId);
    }
  } catch {
    // IGN geocoding failed — continue with commune-level v2
  }

  // Step 3: v2 thematic enrichment (parcel-level if we have cadastral ID)
  try {
    const [argileData, cavitiesData, sspData] = await Promise.all([
      fetchV2Argile(token, v1Result.communeCode || '', cadastralId),
      fetchV2Cavites(token, lon, lat),
      fetchV2Ssp(token, lon, lat),
    ]);

    return {
      ...v1Result,
      source: 'v1+v2',
      enrichment: {
        argileExposition: argileData,
        cavitiesNearby: cavitiesData,
        pollutedSitesNearby: sspData,
      },
    };
  } catch (err) {
    console.warn('[Géorisques v2] Thematic enrichment failed:', err);
    return v1Result;
  }
}

/**
 * Fetch CATNAT history by commune INSEE code.
 * Supports both v1 and v2 (same GASPAR endpoint).
 */
export async function fetchCatnat(codeInsee: string): Promise<CatnatRecord[]> {
  // GASPAR endpoint — same in both v1 and v2, using v1 (no auth needed)
  const url = `/georisques-api/gaspar/catnat?code_insee=${codeInsee}`;

  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    const res = await fetchWithTimeout(url, { headers }, 6000);
    if (!res.ok) {
      console.warn(`[Géorisques] CATNAT API: ${res.status}`);
      return [];
    }

    const raw: any = await res.json();
    // API v1 returns paginated: { results: N, data: [...] } or flat array
    const records: any[] = raw?.data || (Array.isArray(raw) ? raw : []);

    // Normalise field names: API uses date_publication_arrete, code uses date_arrete
    return records.map(r => ({
      code_insee: r.code_insee,
      libelle_risque: r.libelle_risque_jo || r.libelle_risque,
      libelle_commune: r.libelle_commune,
      date_debut: r.date_debut_evt || r.date_debut,
      date_fin: r.date_fin_evt || r.date_fin,
      date_arrete: r.date_publication_arrete || r.date_arrete,
      date_jo: r.date_publication_jo || r.date_jo,
      nature_risque: r.nature_risque,
    }));
  } catch (e) {
    console.warn('[Géorisques] CATNAT fetch failed:', e);
    return [];
  }
}

/* ═══════════════════════════════════════════════════════════════
   v1 — Consolidated report (commune level, no auth)
   ═══════════════════════════════════════════════════════════════ */

interface V1Risk {
  present: boolean;
  libelle: string;
  libelleStatutCommune: string | null;
  libelleStatutAdresse: string | null;
}

interface V1Response {
  adresse?: { libelle?: string; latitude?: number; longitude?: number };
  commune?: { libelle?: string; codePostal?: string; codeInsee?: string };
  risquesNaturels?: Record<string, V1Risk>;
  risquesTechnologiques?: Record<string, V1Risk>;
}

async function fetchV1Consolidated(lon: number, lat: number): Promise<GeorisquesResult> {
  const url = `/georisques-api/resultats_rapport_risque?latlon=${lon},${lat}`;

  const maxRetries = 1;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } }, 6000);
      if (res.ok) {
        const data: V1Response = await res.json();
        return parseV1Response(data);
      }
      if (res.status !== 502 || attempt === maxRetries) {
        throw new Error(`Géorisques v1: ${res.status}`);
      }
      console.warn(`[Géorisques v1] 502, retrying...`);
      await new Promise(r => setTimeout(r, 1000));
    } catch (e) {
      if (attempt === maxRetries) throw e;
      if (e instanceof DOMException && e.name === 'AbortError') {
        console.warn(`[Géorisques v1] Timeout, retrying...`);
        await new Promise(r => setTimeout(r, 1000));
      } else {
        throw e;
      }
    }
  }
  throw new Error('Géorisques v1: max retries exceeded');
}

function parseV1Response(data: V1Response): GeorisquesResult {
  const commune = data.commune?.libelle || null;
  const communeCode = data.commune?.codeInsee || null;

  const naturels = parseV1RiskGroup(data.risquesNaturels || {});
  const technologiques = parseV1RiskGroup(data.risquesTechnologiques || {});

  return {
    risks: {
      naturels,
      technologiques,
      naturalRiskCount: countPresent(naturels),
      technoRiskCount: countPresent(technologiques),
    },
    commune,
    communeCode,
    source: 'v1',
  };
}

function parseV1RiskGroup(risks: Record<string, V1Risk>): any {
  const result: Record<string, RiskLevel> = {};
  for (const [key, risk] of Object.entries(risks)) {
    result[key] = {
      present: !!risk.present,
      level: normalizeLevel(risk.libelleStatutAdresse || risk.libelleStatutCommune),
    };
  }
  return result;
}

function normalizeLevel(raw: string | null): RiskLevel['level'] {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower.includes('fort')) return 'fort';
  if (lower.includes('moyen')) return 'moyen';
  if (lower.includes('faible')) return 'faible';
  return null;
}

function countPresent(risks: any): number {
  return Object.values(risks).filter((r: any) => r.present).length;
}

/* ═══════════════════════════════════════════════════════════════
   IGN reverse geocoding → Cadastral parcel ID
   ═══════════════════════════════════════════════════════════════ */

/**
 * Fetch the cadastral parcel ID for a given coordinate point.
 * Uses IGN reverse geocoding with index=parcel.
 *
 * IGN returns: "75102000AB0052"
 * Géorisques expects: "75102-000-AB-0052"
 *
 * Parsing the IGN ID (14 chars):
 *   - chars 0-4: commune code (75102)
 *   - chars 5-7: prefix (000)
 *   - chars 8-9: section (AB)
 *   - chars 10-13: number (0052)
 */
async function fetchCadastralParcel(lon: number, lat: number): Promise<string | undefined> {
  const url = `/ign-geocodage/reverse?lon=${lon}&lat=${lat}&index=parcel`;

  try {
    const res = await fetchWithTimeout(url, {}, 4000);
    if (!res.ok) return undefined;

    const data: any = await res.json();
    const features = data?.features;
    if (!features || !Array.isArray(features) || features.length === 0) {
      return undefined;
    }

    // Take the closest parcel (first result = highest score)
    const parcel = features[0]?.properties;
    const rawId: string = parcel?.id;
    if (!rawId || typeof rawId !== 'string' || rawId.length < 14) {
      return undefined;
    }

    // Reformat: "75102000AB0052" → "75102-000-AB-0052"
    const commune = rawId.slice(0, 5);
    const prefix = rawId.slice(5, 8);
    const section = rawId.slice(8, 10);
    const number = rawId.slice(10, 14);

    return `${commune}-${prefix}-${section}-${number}`;
  } catch {
    return undefined;
  }
}

/* ═══════════════════════════════════════════════════════════════
   v2 — /api/v2/rga (Retrait-Gonflement Argiles)
   ═══════════════════════════════════════════════════════════════ */

async function fetchV2Argile(
  token: string,
  communeCode: string,
  cadastralParcelId?: string,
): Promise<{ code: number; label: string }[] | null> {
  // Prefer per-parcel query for maximum precision
  if (cadastralParcelId) {
    const parcelResult = await fetchV2ArgileRecords(token, 'codesParcelle', cadastralParcelId);
    if (parcelResult) return parcelResult;
  }

  // Fallback: commune-level query
  if (!communeCode) return null;
  return fetchV2ArgileRecords(token, 'codesInsee', communeCode);
}

async function fetchV2ArgileRecords(
  token: string,
  queryParam: string,
  queryValue: string,
): Promise<{ code: number; label: string }[] | null> {
  const url = `/georisques-v2-api/rga?${queryParam}=${encodeURIComponent(queryValue)}`;
  const headers = { Accept: 'application/json', Authorization: `Bearer ${token}` };

  try {
    const res = await fetchWithTimeout(url, { headers }, 4000);
    if (!res.ok) return null;
    const data: any = await res.json();
    const raw: any = data?.content;
    if (!raw || !Array.isArray(raw) || raw.length === 0) return null;

    return raw.map((r: any) => ({
      code: parseInt(r.codeExposition, 10),
      label: r.exposition,
    }));
  } catch {
    return null;
  }
}

/* ═══════════════════════════════════════════════════════════════
   v2 — /api/v2/cavites (Cavités souterraines)
   ═══════════════════════════════════════════════════════════════ */

async function fetchV2Cavites(token: string, lon: number, lat: number): Promise<number | null> {
  const url = `/georisques-v2-api/cavites?longitude=${lon}&latitude=${lat}&size=1`;
  const headers = { Accept: 'application/json', Authorization: `Bearer ${token}` };

  try {
    const res = await fetchWithTimeout(url, { headers }, 4000);
    if (!res.ok) return null;
    const data = await res.json();
    return data?.totalElements ?? null;
  } catch {
    return null;
  }
}

/* ═══════════════════════════════════════════════════════════════
   v2 — /api/v2/ssp (Sites et Sols Pollués)
   ═══════════════════════════════════════════════════════════════ */

async function fetchV2Ssp(token: string, lon: number, lat: number): Promise<number | null> {
  const url = `/georisques-v2-api/ssp?longitude=${lon}&latitude=${lat}&size=1`;
  const headers = { Accept: 'application/json', Authorization: `Bearer ${token}` };

  try {
    const res = await fetchWithTimeout(url, { headers }, 4000);
    if (!res.ok) return null;
    const data = await res.json();
    return data?.totalElements ?? null;
  } catch {
    return null;
  }
}
