/**
 * Géorisques Service — Server-side fetcher
 * Secret tokens (GEORISQUES_V2_TOKEN) are stored here safely in .env.
 */
import { env } from '../config/env.js';
import type { NaturalRisks, TechnoRisks, RiskEnrichment } from '@previa/shared/schema';

export interface GeorisquesResult {
  risks: {
    naturels: NaturalRisks;
    technologiques: TechnoRisks;
    naturalRiskCount: number;
    technoRiskCount: number;
  };
  commune: string | null;
  communeCode: string | null;
  enrichment?: RiskEnrichment;
  source: 'v1' | 'v2';
}

function emptyLevel() {
  return { present: false, level: null as any };
}

function createEmptyNaturalRisks(): NaturalRisks {
  return {
    inondation: emptyLevel(),
    remonteeNappe: emptyLevel(),
    risqueCotier: emptyLevel(),
    seisme: emptyLevel(),
    mouvementTerrain: emptyLevel(),
    retraitGonflementArgile: emptyLevel(),
    reculTraitCote: emptyLevel(),
    avalanche: emptyLevel(),
    feuForet: emptyLevel(),
    eruptionVolcanique: emptyLevel(),
    cyclone: emptyLevel(),
    radon: emptyLevel(),
  };
}

function createEmptyTechnoRisks(): TechnoRisks {
  return {
    icpe: emptyLevel(),
    nucleaire: emptyLevel(),
    canalisationsMatieresDangereuses: emptyLevel(),
    pollutionSols: emptyLevel(),
    ruptureBarrage: emptyLevel(),
    risqueMinier: emptyLevel(),
  };
}

export async function fetchGeorisquesData(lon: number, lat: number): Promise<GeorisquesResult> {
  const token = env.GEORISQUES_V2_TOKEN;
  
  // Try v2 API if token is configured
  if (token) {
    try {
      const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
      const res = await fetch(`https://georisques.gouv.fr/api/v2/rga?latlon=${lat},${lon}`, { headers });
      if (res.ok) {
        const data = await res.json();
        // Parse v2 response and construct enriched result
        const naturels = createEmptyNaturalRisks();
        if (data?.alea) {
          const code = String(data.alea).toLowerCase();
          naturels.retraitGonflementArgile = {
            present: true,
            level: code.includes('fort') ? 'fort' : code.includes('moyen') ? 'moyen' : 'faible',
          };
        }
        return {
          risks: {
            naturels,
            technologiques: createEmptyTechnoRisks(),
            naturalRiskCount: 1,
            technoRiskCount: 0,
          },
          commune: data?.commune ?? null,
          communeCode: data?.codeInsee ?? null,
          enrichment: {
            argileExposition: data?.alea ? [{ code: 1, label: String(data.alea) }] : null,
            cavitiesNearby: null,
            pollutedSitesNearby: null,
          },
          source: 'v2',
        };
      }
    } catch {
      // Fallback to v1
    }
  }

  // Fallback: v1 public API (no token required)
  try {
    const res = await fetch(`https://georisques.gouv.fr/api/v1/gaspar/risques?latlon=${lat},${lon}`);
    if (res.ok) {
      const data = await res.json();
      const naturels = createEmptyNaturalRisks();
      const technologiques = createEmptyTechnoRisks();
      let natCount = 0;
      let techCount = 0;

      if (Array.isArray(data?.risques_naturels)) {
        natCount = data.risques_naturels.length;
        for (const r of data.risques_naturels) {
          const lib = (r.libelle_risque || '').toLowerCase();
          if (lib.includes('inondation')) naturels.inondation = { present: true, level: 'moyen' };
          if (lib.includes('séisme') || lib.includes('seisme')) naturels.seisme = { present: true, level: 'faible' };
          if (lib.includes('argile')) naturels.retraitGonflementArgile = { present: true, level: 'moyen' };
          if (lib.includes('feu') || lib.includes('forêt')) naturels.feuForet = { present: true, level: 'moyen' };
        }
      }

      return {
        risks: { naturels, technologiques, naturalRiskCount: natCount, technoRiskCount: techCount },
        commune: data?.commune?.libelle_commune ?? null,
        communeCode: data?.commune?.code_insee ?? null,
        source: 'v1',
      };
    }
  } catch {
    // Return empty on error
  }

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
