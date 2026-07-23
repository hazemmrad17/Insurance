/**
 * Géorisques WMS Overlays — Risk Zone Polygons
 *
 * Loads actual risk-zone polygon boundaries as WMS raster tile overlays
 * from the Géorisques map server. Each risk category gets its own
 * toggle-able WMS raster layer.
 *
 * WMS Base: https://www.georisques.gouv.fr/services
 * Tile URL uses MapLibre GL's {bbox-epsg-3857} placeholder.
 *
 * Server test (2026-07-21): Confirmed working with valid French bbox.
 * Returns 256x256 PNG tiles. Server supports EPSG:3857.
 */

import maplibregl from 'maplibre-gl';

/* ═══════════════════════════════════════════════════════════════
   WMS Layer Definitions
   ═══════════════════════════════════════════════════════════════ */

export interface WmsLayerConfig {
  id: string;
  wmsName: string;
  label: string;
  group: 'naturel' | 'technologique';
  icon: string;
  order: number;
  minzoom: number;
}

// Proxied through Vite dev server to bypass Firefox CORS/extension issues
const WMS_BASE = '/georisques-wms';

function wmsTileUrl(layerName: string): string {
  return `${WMS_BASE}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap` +
    `&LAYERS=${layerName}` +
    `&CRS=EPSG:3857&BBOX={bbox-epsg-3857}` +
    `&WIDTH=256&HEIGHT=256` +
    `&FORMAT=image/png&TRANSPARENT=true&STYLES=default`;
}

export const WMS_LAYERS: WmsLayerConfig[] = [
  // ── Risques Naturels ──
  { id: 'wms-inondation',       wmsName: 'ALEA_SYNT_01_02MOY_FXX', label: 'Inondation (débordement centennal)',  group: 'naturel', icon: 'water',     order: 0, minzoom: 8 },
  { id: 'wms-ruissellement',    wmsName: 'ALEA_SYNT_02_02MOY_FXX', label: 'Inondation (ruissellement)',          group: 'naturel', icon: 'water',     order: 1, minzoom: 8 },
  { id: 'wms-submersion',       wmsName: 'ALEA_SYNT_03_02MOY_FXX', label: 'Submersion marine centennale',       group: 'naturel', icon: 'tsunami',   order: 2, minzoom: 8 },
  { id: 'wms-argiles',          wmsName: 'ALEARG_REALISE',          label: 'Retrait-gonflement des argiles',     group: 'naturel', icon: 'landslide', order: 3, minzoom: 7 },
  { id: 'wms-seisme',           wmsName: 'risq_zonage_sismique',    label: 'Zonage sismique de la France',       group: 'naturel', icon: 'earthquake',order: 4, minzoom: 6 },
  { id: 'wms-mvt-terrain',      wmsName: 'MVT_LOCALISE',           label: 'Mouvements de terrain localisés',    group: 'naturel', icon: 'terrain',   order: 5, minzoom: 9 },
  { id: 'wms-cavites',          wmsName: 'CAVITE_LOCALISEE',        label: 'Cavités souterraines',               group: 'naturel', icon: 'cave',      order: 6, minzoom: 10 },
  { id: 'wms-pprn',             wmsName: 'PPRN_COMMUNE_GASPAR',     label: 'PPR — Plans de prévention naturels', group: 'naturel', icon: 'gavel',     order: 7, minzoom: 6 },
  // ── Risques Technologiques ──
  { id: 'wms-icpe',             wmsName: 'INSTALLATIONS_CLASSEES_SIMPLIFIE_GE', label: 'Installations classées (ICPE)', group: 'technologique', icon: 'factory',      order: 10, minzoom: 8 },
  { id: 'wms-nucleaire',        wmsName: 'INSTALLATIONS_NUCLEAIRES',            label: 'Installations nucléaires (INB)',  group: 'technologique', icon: 'nuclear',      order: 11, minzoom: 6 },
  { id: 'wms-canalisations',    wmsName: 'CANALISATIONS',                       label: 'Canalisations matières dangereuses', group: 'technologique', icon: 'pipe',        order: 12, minzoom: 8 },
  { id: 'wms-pollution',        wmsName: 'ETABLISSEMENTS_POLLUEURS',            label: 'Établissements pollueurs',        group: 'technologique', icon: 'contamination',order: 13, minzoom: 8 },
  { id: 'wms-risque-minier',    wmsName: 'PPRM_COMMUNE_RISQMIN_APPROUV',        label: 'PPR Risques miniers',             group: 'technologique', icon: 'mining',       order: 14, minzoom: 7 },
];

/* ═══════════════════════════════════════════════════════════════
   State
   ═══════════════════════════════════════════════════════════════ */

let initialized = false;

/* ═══════════════════════════════════════════════════════════════
   Public API
   ═══════════════════════════════════════════════════════════════ */

/**
 * Register all WMS raster layers on the map (hidden by default).
 * Idempotent — safe to call multiple times.
 */
export function addWmsOverlays(map: maplibregl.Map): void {
  if (initialized) return;
  initialized = true;

  for (const cfg of WMS_LAYERS) {
    const srcId = `georisques-src-${cfg.id}`;
    const layId = `georisques-${cfg.id}`;

    map.addSource(srcId, {
      type: 'raster',
      tiles: [wmsTileUrl(cfg.wmsName)],
      tileSize: 256,
      minzoom: cfg.minzoom,
      maxzoom: 18,
      attribution: 'Géorisques · BRGM',
    });

    map.addLayer({
      id: layId,
      type: 'raster',
      source: srcId,
      minzoom: cfg.minzoom,
      maxzoom: 18,
      paint: {
        'raster-opacity': 0.5,
        'raster-opacity-transition': { duration: 200 },
      },
      layout: {
        visibility: 'none',
      },
    });
  }

  console.log('[Géorisques WMS] Registered', WMS_LAYERS.length, 'layers');
}

/**
 * Toggle a WMS layer's visibility
 */
export function toggleWmsLayer(map: maplibregl.Map, cfgId: string, visible: boolean): void {
  const layId = `georisques-${cfgId}`;
  try {
    map.setLayoutProperty(layId, 'visibility', visible ? 'visible' : 'none');
  } catch (_) { /* layer may not exist yet */ }
}

/**
 * Remove all WMS layers and sources
 */
export function clearWmsOverlays(map: maplibregl.Map | null): void {
  if (!map) return;
  for (const cfg of WMS_LAYERS) {
    try { map.removeLayer(`georisques-${cfg.id}`); } catch (_) { /* ok */ }
    try { map.removeSource(`georisques-src-${cfg.id}`); } catch (_) { /* ok */ }
  }
  initialized = false;
}

/**
 * Set opacity for all WMS layers (0–1)
 */
export function setAllWmsOpacity(map: maplibregl.Map, opacity: number): void {
  const o = Math.max(0, Math.min(1, opacity));
  for (const cfg of WMS_LAYERS) {
    try { map.setPaintProperty(`georisques-${cfg.id}`, 'raster-opacity', o); } catch (_) { /* ok */ }
  }
}

/* ═══════════════════════════════════════════════════════════════
   Unified Panel — injects WMS items into the layer panel
   ═══════════════════════════════════════════════════════════════ */

/**
 * Injects WMS toggle items into the unified layer panel.
 * Looks for #wmsLayerSections inside #layerPanel and fills it.
 */
export function createWmsLegend(map: maplibregl.Map): HTMLElement {
  const existing = document.getElementById('georisquesWmsLegend');
  if (existing) existing.remove();

  const target = document.getElementById('wmsLayerSections');
  if (!target) return document.createElement('div');

  const naturels = WMS_LAYERS.filter(l => l.group === 'naturel');
  const technos = WMS_LAYERS.filter(l => l.group === 'technologique');

  function itemsHtml(layers: WmsLayerConfig[]): string {
    return layers.map(cfg => `
      <label class="layer-item" data-wms="${cfg.id}">
        <input type="checkbox" class="layer-toggle" data-wms="${cfg.id}" />
        <span class="layer-swatch" style="background:rgba(197,106,61,0.2);border:1px solid rgba(197,106,61,0.5);"></span>
        <span class="layer-label">${escapeHtml(cfg.label)}</span>
      </label>
    `).join('');
  }

  target.innerHTML = `
    <div class="layer-group">
      <div class="layer-group-title">
        <span class="material-symbols-outlined" style="font-size:12px!important;">warning</span>
        Risques naturels
      </div>
      ${itemsHtml(naturels)}
    </div>
    <div class="layer-group">
      <div class="layer-group-title">
        <span class="material-symbols-outlined" style="font-size:12px!important;">precision_manufacturing</span>
        Risques technologiques
      </div>
      ${itemsHtml(technos)}
    </div>
  `;

  // Wire all WMS toggles inside the target
  target.querySelectorAll('.layer-toggle[data-wms]').forEach(cb => {
    cb.addEventListener('change', () => {
      const wmsId = (cb as HTMLElement).getAttribute('data-wms');
      if (!wmsId) return;
      toggleWmsLayer(map, wmsId, (cb as HTMLInputElement).checked);
    });
  });

  // Listen for opacity changes from the unified panel's slider
  const opacityHandler = (e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (detail && typeof detail.opacity === 'number') {
      setAllWmsOpacity(map, detail.opacity);
    }
  };
  window.addEventListener('wms-opacity-change', opacityHandler);

  // Store cleanup on the target
  (target as any)._opacityHandler = opacityHandler;

  return target;
}

export function removeWmsLegend(): void {
  const target = document.getElementById('wmsLayerSections');
  if (target) {
    // Remove the event listener
    if ((target as any)._opacityHandler) {
      window.removeEventListener('wms-opacity-change', (target as any)._opacityHandler);
      delete (target as any)._opacityHandler;
    }
    target.innerHTML = '';
  }
}

/* ═══════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════ */

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
