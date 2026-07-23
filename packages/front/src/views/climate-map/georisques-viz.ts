/**
 * Géorisques Risk Visualization — DISPATCHES TO WMS OVERLAYS
 *
 * Uses the unified georisques-service.ts for API calls (v2 with v1 fallback).
 * Risk-zone polygon tiles from the Géorisques WMS server via georisques-wms.ts.
 *
 * Flow:
 *   1. initWmsOnMap() — called from climate-map.ts on map 'load'
 *      Registers all WMS raster sources + layers (hidden by default)
 *   2. loadGeorisques() — called after address geocoding
 *      Fetches risk classification data via georisques-service.ts (v2 parcel-level if token available)
 *      Shows the WMS legend panel with toggle-able layer checkboxes
 *   3. toggleWmsLayer() / setAllWmsOpacity() — from legend checkboxes/slider
 */

import maplibregl from 'maplibre-gl';
import { addWmsOverlays, createWmsLegend, removeWmsLegend } from './georisques-wms.js';
import { fetchRisks as fetchRisksV2, fetchCatnat, type CatnatRecord } from './georisques-service.js';

/* ═══════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════ */

interface PresentRiskInfo {
  key: string;
  label: string;
  status: string;
}

/* ═══════════════════════════════════════════════════════════════
   State
   ═══════════════════════════════════════════════════════════════ */

let legendShown = false;

/* ═══════════════════════════════════════════════════════════════
   Public API
   ═══════════════════════════════════════════════════════════════ */

/** Called from climate-map.ts on map 'load' */
export function initWmsOnMap(map: maplibregl.Map): void {
  addWmsOverlays(map);
}

/** Called after address geocoding — fetches data + shows legend */
export async function loadGeorisques(
  map: maplibregl.Map,
  lon: number,
  lat: number
): Promise<void> {
  let codeInsee: string | undefined;

  // Fetch risk data via unified service (v1 + v2 enrichment if token available)
  try {
    const response = await fetchGeorisques(lon, lat);

    const presentRisks = extractPresentRisks(response);
    console.log(`[Géorisques] ${presentRisks.length} risks present (${response.source})`);

    // Store commune code for side panel
    updateRiskInfoPanel(response, presentRisks);

    codeInsee = response.communeCode || response.commune?.codeInsee;
  } catch (err) {
    console.warn('[Géorisques] API fetch failed (WMS layers may still work):', err);
  }

  // Fetch historical CATNAT data via unified service (v2 with v1 fallback)
  if (codeInsee) {
    try {
      const catnatRecords = await fetchCatnat(codeInsee);
      if (catnatRecords.length > 0) {
        displayHistoriqueCard(catnatRecords);
      }
    } catch (err) {
      console.warn('[Géorisques] Failed to fetch CATNAT history:', err);
    }
  }

  // Show the WMS legend with toggle panel
  if (!legendShown) {
    createWmsLegend(map);
    legendShown = true;
  }
}

/** Cleanup on view destroy */
export function clearGeorisques(_map: maplibregl.Map | null): void {
  removeWmsLegend();
  legendShown = false;
  removeRiskInfoCard();
}

/* ═══════════════════════════════════════════════════════════════
   API Fetch — delegated to georisques-service.ts
   ═══════════════════════════════════════════════════════════════ */

async function fetchGeorisques(lon: number, lat: number): Promise<any> {
  console.log('[Géorisques] Fetching risk data for', lat.toFixed(4), lon.toFixed(4));
  const result = await fetchRisksV2(lon, lat);
  console.log(`[Géorisques] Source: ${result.source}, ${result.risks.naturalRiskCount} naturals, ${result.risks.technoRiskCount} technos`);
  if (result.enrichment) {
    console.log('[Géorisques] v2 enrichment: argile=' + JSON.stringify(result.enrichment.argileExposition) + ', cavities=' + result.enrichment.cavitiesNearby + ', polluted=' + result.enrichment.pollutedSitesNearby);
  }
  return result;
}

/* ═══════════════════════════════════════════════════════════════
   Side Panel — Risk Info Card
   ═══════════════════════════════════════════════════════════════ */

const LABEL_MAP: Record<string, string> = {
  inondation: 'Inondation', remonteeNappe: 'Remontée de nappe',
  risqueCotier: 'Risque côtier', seisme: 'Séisme',
  mouvementTerrain: 'Mouvement de terrain',
  retraitGonflementArgile: 'Retrait gonflement argiles',
  reculTraitCote: 'Recul trait de côte', avalanche: 'Avalanche',
  feuForet: 'Feu de forêt', eruptionVolcanique: 'Volcan',
  cyclone: 'Vent violent', radon: 'Radon',
  icpe: 'ICPE', nucleaire: 'Nucléaire',
  canalisationsMatieresDangereuses: 'Canalisations dangereuses',
  pollutionSols: 'Pollution des sols', ruptureBarrage: 'Rupture de barrage',
  risqueMinier: 'Risques miniers',
};

function extractPresentRisks(response: any): PresentRiskInfo[] {
  const results: PresentRiskInfo[] = [];
  const naturels = response.risks?.naturels || response.risquesNaturels || {};
  const technos = response.risks?.technologiques || response.risquesTechnologiques || {};
  for (const risks of [naturels, technos]) {
    for (const [key, risk] of Object.entries(risks) as any) {
      if (risk.present) {
        results.push({
          key,
          label: LABEL_MAP[key] || risk.libelle || key,
          status: risk.libelleStatutAdresse || risk.level || 'Présent',
        });
      }
    }
  }
  return results;
}

function updateRiskInfoPanel(response: any, risks: PresentRiskInfo[]): void {
  const panel = document.getElementById('bdnbPanel');
  if (!panel) return;

  removeRiskInfoCard();

  if (risks.length === 0) return;

  const commune = response.commune || response.commune?.libelle || '';
  const html = `
    <div class="bdnb-building-card georisques-risk-info">
      <div class="bdnb-building-header">
        <span class="material-symbols-outlined" style="font-size:16px;">warning</span>
        <span style="font-size:12px;font-weight:600;color:var(--text-primary);">
          Risques ${commune ? `— ${escapeHtml(commune)}` : 'Géorisques'}
        </span>
        <span style="font-size:10px;padding:1px 6px;border-radius:4px;background:var(--color-primary);color:#fff;font-weight:600;margin-left:auto;">${risks.length}</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:3px;padding:4px 0;">
        ${risks.map(r => `
          <div style="display:flex;justify-content:space-between;font-size:11px;padding:3px 0;border-bottom:1px solid var(--border-color);">
            <span style="color:var(--text-primary);">${escapeHtml(r.label)}</span>
            <span style="color:var(--text-muted);font-size:10px;">${escapeHtml(r.status)}</span>
          </div>
        `).join('')}
      </div>
      <div style="font-size:9px;color:var(--text-muted);padding-top:6px;border-top:1px solid var(--border-color);text-align:center;">
        Activer/désactiver les zones dans le panneau « Zones de risque » sur la carte
      </div>
    </div>
  `;
  panel.insertAdjacentHTML('beforeend', html);
}

function removeRiskInfoCard(): void {
  document.querySelectorAll('.georisques-risk-info').forEach(el => el.remove());
  document.querySelectorAll('.georisques-historique').forEach(el => el.remove());
}

/* ═══════════════════════════════════════════════════════════════
   Side Panel — Historical CATNAT Card
   ═══════════════════════════════════════════════════════════════ */

const RISQUE_ICONS: Record<string, string> = {
  inondation: 'water', crue: 'water', 'inondations et coulées de boue': 'water',
  'mouvement de terrain': 'terrain',
  sécheresse: 'sunny', 'retrait-gonflement des argiles': 'sunny',
  'feu de forêt': 'local_fire_department',
  'phénomène climatique': 'air', 'vents violents': 'air',
  avalanche: 'landslide',
  sismique: 'earthquake', séisme: 'earthquake',
  'risque côtier': 'tsunami', 'submersion marine': 'tsunami',
  cyclonique: 'cyclone',
};

function getRiskIcon(libelle: string): string {
  const lower = libelle.toLowerCase();
  for (const [key, icon] of Object.entries(RISQUE_ICONS)) {
    if (lower.includes(key)) return icon;
  }
  return 'history';
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—';
  // Handle YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss
  const parts = dateStr.split('T')[0].split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

function groupCatnatByRisk(records: CatnatRecord[]): { label: string; icon: string; events: CatnatRecord[] }[] {
  const groups = new Map<string, CatnatRecord[]>();
  for (const r of records) {
    const key = r.libelle_risque || r.nature_risque || 'Autre';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }
  return Array.from(groups.entries()).map(([label, events]) => ({
    label,
    icon: getRiskIcon(label),
    events: events.sort((a, b) => (b.date_arrete || '').localeCompare(a.date_arrete || '')),
  }));
}

function displayHistoriqueCard(records: CatnatRecord[]): void {
  const panel = document.getElementById('bdnbPanel');
  if (!panel) return;

  // Inject minimal CATNAT styles once
  const styleId = 'catnat-styles';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .catnat-group { border-radius:6px; margin:2px 0; }
      .catnat-group summary { cursor:pointer; display:flex; align-items:center; gap:6px; padding:5px 6px; border-radius:4px; transition:background 0.15s; user-select:none; }
      .catnat-group summary:hover { background:var(--hover-bg, rgba(128,128,128,0.08)); }
      .catnat-group summary::-webkit-details-marker { display:none; }
      .catnat-group summary::marker { display:none; content:''; }
      .catnat-event { padding:5px 0; border-bottom:1px solid var(--border-color, rgba(128,128,128,0.12)); }
      .catnat-event:last-child { border-bottom:none; }
    `;
    document.head.appendChild(style);
  }

  // Remove old historique card if present
  document.querySelectorAll('.georisques-historique').forEach(el => el.remove());

  if (records.length === 0) return;

  const grouped = groupCatnatByRisk(records);
  const total = records.length;

  const html = `
    <div class="bdnb-building-card georisques-historique">
      <div class="bdnb-building-header">
        <span class="material-symbols-outlined" style="font-size:16px;">history</span>
        <span style="font-size:12px;font-weight:600;color:var(--text-primary);">
          Historique — Arrêtés CATNAT
        </span>
        <span style="font-size:10px;padding:1px 6px;border-radius:4px;background:var(--color-primary);color:#fff;font-weight:600;margin-left:auto;">${total}</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;padding:4px 0;">
        ${grouped.map(g => `
          <details class="catnat-group" ${grouped.length === 1 ? 'open' : ''}>
            <summary>
              <span class="material-symbols-outlined" style="font-size:14px!important;color:var(--text-muted);">${escapeHtml(g.icon)}</span>
              <span style="font-size:11px;font-weight:600;color:var(--text-primary);flex:1;">${escapeHtml(g.label)}</span>
              <span style="font-size:10px;color:var(--text-muted);font-weight:500;">${g.events.length}</span>
            </summary>
            <div style="display:flex;flex-direction:column;gap:2px;padding:4px 0 2px 20px;">
              ${g.events.map(r => {
                const dateArrete = formatDate(r.date_arrete);
                const dateJo = formatDate(r.date_jo);
                const dateDebut = formatDate(r.date_debut);
                const dateFin = formatDate(r.date_fin);
                return `
                  <div class="catnat-event">
                    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:6px;">
                      <span style="font-size:10px;font-weight:500;color:var(--text-primary);">Arrêté du ${dateArrete}</span>
                      ${dateJo !== '—' ? `<span style="font-size:9px;color:var(--text-muted);">JO: ${dateJo}</span>` : ''}
                    </div>
                    <div style="display:flex;gap:6px;font-size:9px;color:var(--text-muted);">
                      <span>Période: ${dateDebut} → ${dateFin}</span>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </details>
        `).join('')}
      </div>
      <div style="font-size:9px;color:var(--text-muted);padding-top:6px;border-top:1px solid var(--border-color);text-align:center;">
        Source: GASPAR · Géorisques · BRGM
      </div>
    </div>
  `;
  panel.insertAdjacentHTML('beforeend', html);
}

/* ═══════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════ */

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
