/**
 * BDNB Building Map — MapLibre GL JS
 *
 * Shows building footprints colored by DPE class via the BDNB REST API
 * (GeoJSON), overlaid on OSM raster tiles. Supports address search,
 * building selection with attribute display, and Géorisques WMS risk
 * overlays (inondation, argiles, séisme, etc.).
 *
 * Providers:
 *   - Base:  OSM raster tiles
 *   - Buildings: BDNB REST API → GeoJSON on the map
 *   - Risks: Géorisques WMS overlays
 *   - Geocoding: BDNB geocoding API → BAN fallback
 */

import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import proj4 from 'proj4';
import { loadGeorisques, clearGeorisques, initWmsOnMap } from './georisques-viz.js';
import { fetchWithTimeout } from './fetch-utils.js';
import { orchestrate } from '../../risk-assessment/risk-orchestrator.js';
import { setResultsPanelContainer, renderResults, renderLoadingState } from '../../risk-assessment/results-panel.js';

/* ═══════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════ */

interface GeocodedAddress {
  lon: number;
  lat: number;
  label: string;
  banId?: string;
}

/* ═══════════════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════════════ */

// DPE color scale (A → G)
const DPE_COLORS: Record<string, string> = {
  A: '#10b981', B: '#34d399', C: '#facc15', D: '#f59e0b', E: '#f97316', F: '#ef4444', G: '#dc2626',
};

// EPSG:2154 (Lambert-93) → WGS84 projection
const LAMBERT93 = '+proj=lcc +lat_0=46.5 +lon_0=3 +lat_1=49 +lat_2=44 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs';
const WGS84 = '+proj=longlat +datum=WGS84 +no_defs';

/* ═══════════════════════════════════════════════════════════════
   State
   ═══════════════════════════════════════════════════════════════ */

let map: maplibregl.Map | null = null;
let geocoded: GeocodedAddress | null = null;
let highlightSourceId: string | null = null;
let markerInstance: maplibregl.Marker | null = null;
let mapResizeObserver: ResizeObserver | null = null;
let lastBuildingFeatures: any[] = []; // raw records from the last fetch, for index lookup
let labelSourceId: string | null = null;

/* ═══════════════════════════════════════════════════════════════
   Exported API
   ═══════════════════════════════════════════════════════════════ */

export function initClimateMap(): void {
  const container = document.getElementById('climateMapContainer');
  if (!container || map) return;

  // Force explicit dimensions by measuring the parent
  const parent = container.parentElement;
  if (parent) {
    const rect = parent.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      container.style.width = rect.width + 'px';
      container.style.height = rect.height + 'px';
    } else {
      container.style.width = '100%';
      container.style.height = '400px';
    }
  } else {
    container.style.width = '100%';
    container.style.height = '400px';
  }

  // Ensure the container is visible with a subtle background
  container.style.backgroundColor = '#e8ecf0';

  map = new maplibregl.Map({
    container: 'climateMapContainer',
    style: {
      version: 8,
      sources: {
        // OSM raster tiles — visible basemap so the map isn't blank
        'osm-raster': {
          type: 'raster',
          tiles: ['/osm-tiles/{z}/{x}/{y}.png'],
          tileSize: 256,
          minzoom: 0,
          maxzoom: 19,
          attribution: '&copy; <a href="https://openstreetmap.org/copyright">OSM contributors</a>',
        },

        // GeoJSON source for BDNB buildings (populated dynamically via REST API)
        'bdnb-geojson': {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        },
      },
      layers: [
        // ── OSM Raster Basemap ──
        {
          id: 'osm-raster-layer',
          type: 'raster',
          source: 'osm-raster',
          minzoom: 0,
          maxzoom: 19,
          paint: {
            'raster-opacity': 0.85,
          },
        },

        // ── BDNB building footprints (GeoJSON, filled when data loads) ──
        {
          id: 'bdnb-buildings-fill',
          type: 'fill',
          source: 'bdnb-geojson',
          minzoom: 14,
          maxzoom: 18,
          paint: {
            'fill-color': ['match', ['get', 'classe_bilan_dpe'],
              'A', '#10b981', 'B', '#34d399', 'C', '#facc15',
              'D', '#f59e0b', 'E', '#f97316', 'F', '#ef4444', 'G', '#dc2626',
              '#c56a3d'
            ],
            'fill-opacity': 0.55,
            'fill-outline-color': 'rgba(148, 163, 184, 0.6)',
          },
        },
        {
          id: 'bdnb-buildings-outline',
          type: 'line',
          source: 'bdnb-geojson',
          minzoom: 14,
          maxzoom: 18,
          paint: {
            'line-color': 'rgba(148, 163, 184, 0.7)',
            'line-width': 1.2,
          },
        },
      ],
    },
    center: [2.3522, 48.8566],
    zoom: 14,
    minZoom: 3,
    maxZoom: 18,
    attributionControl: { compact: false },
  });

  // Navigation controls
  map.addControl(new maplibregl.NavigationControl(), 'top-left');
  map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

  // Force a resize after creation to ensure proper rendering
  setTimeout(() => {
    if (map) {
      map.resize();
      console.log('[BDNB Map] Resize called');
    }
  }, 100);

  // Watch for container size changes and resize the map
  if (mapResizeObserver) mapResizeObserver.disconnect();
  mapResizeObserver = new ResizeObserver(() => {
    if (map) map.resize();
  });
  mapResizeObserver.observe(container);

  // Wait for style to load
  map.on('load', () => {
    console.log('[BDNB Map] MapLibre GL initialized with BDNB tiles');

    // Register Géorisques WMS overlays
    initWmsOnMap(map!);

    // Add DPE legend
    addDpeLegend();

    // Add unified layer panel (admin boundaries + BDNB + WMS)
    addLayerPanel();

    // Click on building → show info
    const onBuildingClick = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] | undefined }) => {
      if (e.features && e.features.length > 0) {
        const props = e.features[0].properties || {};
        const idx = props.building_index;
        if (typeof idx === 'number' && idx >= 1 && idx <= lastBuildingFeatures.length) {
          selectBuildingByIndex(idx);
        } else {
          showBuildingInfo(props);
        }
      }
    };

    map!.on('click', 'bdnb-buildings-fill', onBuildingClick);
    map!.on('click', 'bdnb-buildings-label', onBuildingClick);

    map!.on('mouseenter', 'bdnb-buildings-fill', () => {
      if (map) map.getCanvas().style.cursor = 'pointer';
    });
    map!.on('mouseenter', 'bdnb-buildings-label', () => {
      if (map) map.getCanvas().style.cursor = 'pointer';
    });
    map!.on('mouseleave', 'bdnb-buildings-fill', () => {
      if (map) map.getCanvas().style.cursor = '';
    });
    map!.on('mouseleave', 'bdnb-buildings-label', () => {
      if (map) map.getCanvas().style.cursor = '';
    });
  });

  // Log tile loading errors
  map.on('error', (e) => {
    if (e.error && typeof e.error === 'object' && 'status' in e.error) {
      console.warn('[BDNB Map] Tile error:', e.error);
    }
  });

  setupSearch();

  // Initialize results panel container
  const panelEl = document.getElementById('riskResultsPanel');
  if (panelEl) {
    setResultsPanelContainer(panelEl);
  }

  console.log('[BDNB Map] Init complete');
}

export function destroyClimateMap(): void {
  clearHighlight();
  clearBuildingLabels();
  removeMarker();
  removeLayerPanel();
  if (mapResizeObserver) {
    mapResizeObserver.disconnect();
    mapResizeObserver = null;
  }
  if (map) {
    map.remove();
    map = null;
  }
  geocoded = null;
  lastBuildingFeatures = [];
  const legend = document.getElementById('bdnbDpeLegend');
  if (legend) legend.remove();
}

/* ═══════════════════════════════════════════════════════════════
   Unified Layer Panel — BDNB buildings + Géorisques WMS
   ═══════════════════════════════════════════════════════════════ */

function addLayerPanel(): void {
  const container = document.getElementById('climateMapContainer');
  if (!container) return;
  const existing = document.getElementById('layerPanel');
  if (existing) return;

  const div = document.createElement('div');
  div.id = 'layerPanel';
  div.className = 'layer-panel';
  div.innerHTML = `
    <div class="layer-header">
      <span class="material-symbols-outlined" style="font-size:16px!important;color:var(--color-primary);">layers</span>
      Couches
      <button class="layer-close" id="layerPanelClose"><span class="material-symbols-outlined">close</span></button>
    </div>
    <div class="layer-body" id="layerBody">
      <!-- ── BDNB ── -->
      <div class="layer-group">
        <div class="layer-group-title">
          <span class="material-symbols-outlined" style="font-size:12px!important;">apartment</span>
          Bâtiments (BDNB)
        </div>
        <label class="layer-item" data-layer="bdnb-buildings">
          <input type="checkbox" class="layer-toggle" data-layer="bdnb-buildings" checked />
          <span class="layer-swatch" style="background:rgba(197,106,61,0.4);border:1px solid rgba(197,106,61,0.7);"></span>
          <span class="layer-label">Empreintes DPE (via API)</span>
        </label>
        <div style="font-size:9px;color:var(--text-muted);padding:2px 10px 6px;">
          Charge les données BDNB automatiquement lors de la recherche
        </div>
      </div>
      <!-- ── WMS sections will be injected here by georisques-wms.ts ── -->
      <div id="wmsLayerSections"></div>
    </div>
    <div class="layer-opacity">
      <label class="layer-opacity-label">
        <span class="material-symbols-outlined" style="font-size:12px!important;">opacity</span>
        Opacité WMS
        <input type="range" class="layer-opacity-slider" id="layerOpacitySlider" min="10" max="90" value="50" />
        <span class="layer-opacity-val" id="layerOpacityVal">50%</span>
      </label>
    </div>
  `;
  container.appendChild(div);

  // Wire BDNB buildings toggle
  const bdnbToggle = div.querySelector('.layer-toggle[data-layer="bdnb-buildings"]') as HTMLInputElement | null;
  if (bdnbToggle && map!) {
    bdnbToggle.checked = true;
    bdnbToggle.addEventListener('change', () => {
      const visible = bdnbToggle.checked;
      for (const sub of ['fill', 'outline', 'label']) {
        try {
          map!.setLayoutProperty(`bdnb-buildings-${sub}`, 'visibility', visible ? 'visible' : 'none');
        } catch (_) { /* ok */ }
      }
    });
  }

  // Wire close button
  const closeBtn = div.querySelector('#layerPanelClose');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      div.classList.toggle('collapsed');
      closeBtn.querySelector('.material-symbols-outlined')!.textContent =
        div.classList.contains('collapsed') ? 'expand_less' : 'close';
    });
  }

  // Wire opacity slider
  const slider = div.querySelector('#layerOpacitySlider') as HTMLInputElement | null;
  const valSpan = div.querySelector('#layerOpacityVal');
  if (slider && valSpan) {
    slider.addEventListener('input', () => {
      const val = parseInt(slider.value, 10) / 100;
      valSpan.textContent = `${Math.round(val * 100)}%`;
      // Dispatch event for WMS layers to pick up
      window.dispatchEvent(new CustomEvent('wms-opacity-change', { detail: { opacity: val } }));
    });
  }
}

function removeLayerPanel(): void {
  const el = document.getElementById('layerPanel');
  if (el) el.remove();
}

/* ═══════════════════════════════════════════════════════════════
   Search UI
   ═══════════════════════════════════════════════════════════════ */

function setupSearch(): void {
  const input = document.getElementById('bdnbSearchInput') as HTMLInputElement | null;
  const btn = document.getElementById('bdnbSearchBtn');
  const clearBtn = document.getElementById('bdnbSearchClear');

  if (input) {
    input.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' && input.value.trim()) {
        handleSearch(input.value.trim());
      }
    });
  }

  if (btn) {
    btn.addEventListener('click', () => {
      if (input?.value.trim()) handleSearch(input.value.trim());
    });
  }

  if (clearBtn && input) {
    clearBtn.addEventListener('click', () => {
      input.value = '';
      clearBtn.classList.add('hidden');
      clearResults();
    });
    input.addEventListener('input', () => {
      clearBtn.classList.toggle('hidden', !input.value);
    });
  }
}

function clearResults(): void {
  clearHighlight();
  clearBuildingLabels();
  removeMarker();
  geocoded = null;
  lastBuildingFeatures = [];
  hideDpeLegend();
  if (map) {
    clearGeorisques(map);
    // Reset GeoJSON source so old footprints disappear
    try {
      const src = map.getSource('bdnb-geojson') as maplibregl.GeoJSONSource;
      if (src) src.setData({ type: 'FeatureCollection', features: [] });
    } catch (_) { /* ok */ }
  }

  const panel = document.getElementById('bdnbPanel');
  if (panel) {
    panel.innerHTML = `<div class="bdnb-panel-empty">
      <span class="material-symbols-outlined" style="font-size:32px;color:var(--text-muted);">search</span>
      <p style="font-size:13px;color:var(--text-muted);margin-top:8px;">Search for an address to load BDNB building data</p>
    </div>`;
  }

  const statusEl = document.getElementById('bdnbStatus');
  if (statusEl) statusEl.textContent = '';
}

/* ═══════════════════════════════════════════════════════════════
   Search handler
   ═══════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════
   Geocoding helpers — parallel BDNB + BAN
   ═══════════════════════════════════════════════════════════════ */

interface GeocoderResult {
  lon: number;
  lat: number;
  label: string;
  banId?: string;
}

async function geocodeBdnb(query: string): Promise<GeocoderResult | null> {
  const encoded = encodeURIComponent(query);
  try {
    const res = await fetchWithTimeout(
      `/bdnb-api/geocodage?q=${encoded}`,
      { headers: { Accept: 'application/json' } },
      4000
    );
    if (!res.ok) return null;
    const data = await res.json();

    let lon: number | undefined;
    let lat: number | undefined;
    let label = query;
    let banId: string | undefined;

    if (data.features?.length > 0) {
      const f = data.features[0];
      if (f.geometry?.coordinates) {
        lon = f.geometry.coordinates[0];
        lat = f.geometry.coordinates[1];
      }
      banId = f.properties?.id || f.ban_id;
      label = f.properties?.label || f.adresse || label;
    }

    if (data.results?.length > 0) {
      const r = data.results[0];
      lon = r.lon ?? r.lng ?? lon;
      lat = r.lat ?? lat;
      banId = r.ban_id || banId;
      label = r.adresse || r.label || label;
    }

    if (lon === undefined || lat === undefined) return null;
    return { lon, lat, label, banId };
  } catch {
    return null;
  }
}

async function geocodeBan(query: string): Promise<GeocoderResult | null> {
  const encoded = encodeURIComponent(query);
  try {
    const res = await fetchWithTimeout(`/ban-api/search/?q=${encoded}&limit=1`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.features?.length) return null;

    const f = data.features[0];
    const coords = f.geometry?.coordinates;
    if (!coords) return null;

    return {
      lon: coords[0],
      lat: coords[1],
      label: f.properties?.label || query,
      banId: f.properties?.id,
    };
  } catch {
    return null;
  }
}

/* ═══════════════════════════════════════════════════════════════
   Search handler — parallel geocoding
   ═══════════════════════════════════════════════════════════════ */

async function handleSearch(query: string): Promise<void> {
  if (!map) return;

  setStatus('Géocodage...');
  clearResults();

  // Launch BDNB + BAN geocoding IN PARALLEL
  // Whichever returns first with coordinates wins
  const [bdnbResult, banResult] = await Promise.allSettled([
    geocodeBdnb(query),
    geocodeBan(query),
  ]);

  // Prefer BAN result (reliable, fast) unless BDNB has better data
  // BAN returns coordinates + banId, BDNB might be unreachable
  let result = banResult.status === 'fulfilled' && banResult.value
    ? banResult.value
    : null;

  // If BAN failed, try BDNB (unlikely but possible)
  if (!result && bdnbResult.status === 'fulfilled' && bdnbResult.value) {
    result = bdnbResult.value;
  }

  if (!result) {
    const errMsg = 'Impossible de trouver les coordonnées — essayez une adresse plus précise';
    console.error('[BDNB Map] Search error:', errMsg);
    setStatus(errMsg);
    updatePanel({ type: 'error', message: errMsg });
    return;
  }

  // Log which geocoder won
  const winner = result.banId?.includes('_') ? 'BAN' : 'BDNB';
  console.log(`[BDNB Map] Geocoded via ${winner}:`, result);

  geocoded = { ...result };

  addMarker(geocoded.lat, geocoded.lon);
  map.flyTo({ center: [geocoded.lon, geocoded.lat], zoom: 16, duration: 1500 });
  updatePanel({ type: 'address', address: geocoded });

  // Derive commune code from banId for CATNAT lookup
  const communeCode = geocoded.banId ? geocoded.banId.slice(0, 5) : undefined;

  // Parse commune name from address label (last word, typically the city name)
  const labelParts = geocoded.label.split(' ');
  const lastPart = labelParts[labelParts.length - 1] || '';
  const communeName = lastPart && !lastPart.match(/^[0-9]/) && lastPart.length > 2 ? lastPart : undefined;

  // Orchestrate ALL providers in parallel
  setStatus('Chargement des données...');

  const assessment = await orchestrate({
    lon: geocoded.lon,
    lat: geocoded.lat,
    addressLabel: geocoded.label,
    banId: geocoded.banId,
    communeCode,
    communeName,
  }, (progress) => {
    renderLoadingState(progress);
    setStatus(progress.message);
  });

  // Render full results panel
  renderResults(assessment);

  // Load Géorisques WMS on the map (visual overlays, separate from data)
  loadGeorisques(map!, geocoded.lon, geocoded.lat).catch(() => {});

  // Try BDNB building footprints in background (non-blocking)
  fetchBuilding(geocoded).catch(() => {});

  setStatus('');
}

/* ═══════════════════════════════════════════════════════════════
   Marker
   ═══════════════════════════════════════════════════════════════ */

function addMarker(lat: number, lon: number): void {
  removeMarker();
  if (!map) return;

  const el = document.createElement('div');
  el.className = 'bdnb-marker';
  el.innerHTML = '<div class="bdnb-marker-inner">📍</div>';

  markerInstance = new maplibregl.Marker({ element: el, anchor: 'center' })
    .setLngLat([lon, lat])
    .addTo(map);
}

function removeMarker(): void {
  if (markerInstance) {
    markerInstance.remove();
    markerInstance = null;
  }
}

/* ═══════════════════════════════════════════════════════════════
   Building Polygon Highlight
   ═══════════════════════════════════════════════════════════════ */

function clearHighlight(): void {
  if (highlightSourceId && map) {
    try {
      map.removeLayer('bdnb-highlight-fill');
      map.removeLayer('bdnb-highlight-outline');
    } catch (_) { /* ok */ }
    try {
      map.removeSource(highlightSourceId);
    } catch (_) { /* ok */ }
    highlightSourceId = null;
  }
}

function addHighlightPolygon(geom: any, dpeClass: string): void {
  if (!map) return;
  clearHighlight();

  const id = `highlight-${Date.now()}`;
  highlightSourceId = id;

  const color = DPE_COLORS[dpeClass] || '#c56a3d';

  map.addSource(id, {
    type: 'geojson',
    data: {
      type: 'Feature',
      properties: {},
      geometry: geom,
    },
  });

  map.addLayer({
    id: 'bdnb-highlight-fill',
    type: 'fill',
    source: id,
    paint: {
      'fill-color': color,
      'fill-opacity': 0.65,
      'fill-outline-color': color,
    },
  });

  map.addLayer({
    id: 'bdnb-highlight-outline',
    type: 'line',
    source: id,
    paint: {
      'line-color': '#ffffff',
      'line-width': 3,
      'line-opacity': 0.9,
    },
  });
}

/* ═══════════════════════════════════════════════════════════════
   Building Number Labels
   ═══════════════════════════════════════════════════════════════ */

function clearBuildingLabels(): void {
  if (!map) return;
  try { map.removeLayer('bdnb-buildings-label'); } catch (_) { /* ok */ }
  if (labelSourceId) {
    try { map.removeSource(labelSourceId); } catch (_) { /* ok */ }
    labelSourceId = null;
  }
}

function addBuildingLabels(features: any[]): void {
  if (!map) return;
  clearBuildingLabels();

  const srcId = `labels-${Date.now()}`;
  labelSourceId = srcId;

  map.addSource(srcId, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features },
  });

  map.addLayer({
    id: 'bdnb-buildings-label',
    type: 'symbol',
    source: srcId,
    minzoom: 14,
    maxzoom: 18,
    layout: {
      'text-field': ['get', 'building_index'],
      'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
      'text-size': 11,
      'text-offset': [0, 0],
      'text-anchor': 'center',
      'symbol-placement': 'point',
    },
    paint: {
      'text-color': '#ffffff',
      'text-halo-color': 'rgba(0, 0, 0, 0.75)',
      'text-halo-width': 2.5,
    },
  });

  console.log(`[BDNB Map] Added ${features.length} building number labels`);
}

/** Highlight and show info for a building by its 1-based index */
function selectBuildingByIndex(index: number): void {
  if (!map) return;
  const record = lastBuildingFeatures[index - 1];
  if (!record) return;

  const { props, rawGeom, isWgs84 } = normalizeRecord(record);
  const dpeClass = props.classe_bilan_dpe || '';

  // Highlight this building
  if (rawGeom?.coordinates) {
    const geom = isWgs84 ? rawGeom : convertLambertToWgs84(rawGeom);
    if (geom) {
      addHighlightPolygon(geom, dpeClass);
    }
  }

  // Build attributes from this building's record
  const attrs: Record<string, string> = {};
  if (props.annee_construction) attrs['Année construction'] = String(props.annee_construction);
  if (props.mat_mur_txt && props.mat_mur_txt !== 'INDETERMINE') attrs['Matériau mur'] = String(props.mat_mur_txt);
  if (props.mat_toit_txt && props.mat_toit_txt !== 'INDETERMINE') attrs['Matériau toit'] = String(props.mat_toit_txt);
  if (dpeClass) {
    const c = DPE_COLORS[dpeClass] || 'var(--text-primary)';
    attrs['DPE'] = `<span style="display:inline-block;width:12px;height:12px;border-radius:2px;background:${c};vertical-align:middle;margin-right:4px;"></span>${dpeClass}`;
  }
  if (props.conso_energie) attrs['Conso. énergie'] = `${Number(props.conso_energie).toFixed(0)} kWh/m²/an`;
  if (props.emission_ges) attrs['Émissions GES'] = `${Number(props.emission_ges).toFixed(1)} kgCO₂/m²/an`;
  if (props.hauteur_mean) attrs['Hauteur'] = `${Number(props.hauteur_mean).toFixed(1)} m`;
  if (props.nb_niveau) attrs['Niveaux'] = String(props.nb_niveau);
  if (props.surface_emprise_sol) attrs['Emprise sol'] = `${Number(props.surface_emprise_sol).toFixed(0)} m²`;
  if (props.surface_utile_totale) attrs['Surface utile'] = `${Number(props.surface_utile_totale).toFixed(0)} m²`;
  if (props.nb_logements) attrs['Logements'] = String(props.nb_logements);
  if (props.usage_principal_bdnb_open) attrs['Usage'] = String(props.usage_principal_bdnb_open);
  if (props.etat_chauffage_txt && props.etat_chauffage_txt !== 'INDETERMINE') attrs['Chauffage'] = String(props.etat_chauffage_txt);
  if (props.code_departement_insee) attrs['Département'] = String(props.code_departement_insee);

  updatePanel({ type: 'building', attrs, hasGeometry: !!rawGeom?.coordinates, count: lastBuildingFeatures.length });
}

/* ═══════════════════════════════════════════════════════════════
   BDNB Building Data Fetch — with /adresse endpoint fix
   ═══════════════════════════════════════════════════════════════ */

function normalizeRecord(record: any): { props: any; rawGeom: any; isWgs84: boolean } {
  let rawGeom: any;
  let isWgs84 = false;
  let props: any = record;
  if (record?.type === 'Feature' && record?.geometry) {
    rawGeom = record.geometry;
    isWgs84 = true;
    props = record.properties || record;
  } else {
    rawGeom = record?.geom_groupe;
    isWgs84 = false;
  }
  return { props, rawGeom, isWgs84 };
}

function computeCentroid(geom: any, isWgs84: boolean): [number, number] | null {
  const converted = isWgs84 ? geom : convertLambertToWgs84(geom);
  if (!converted?.coordinates) return null;
  const coords = converted.coordinates;
  const ring = converted.type === 'MultiPolygon' ? coords[0][0] : coords[0];
  if (!ring || ring.length < 2) return null;
  let sumLat = 0, sumLon = 0, n = 0;
  for (const pt of ring) {
    sumLon += pt[0]; sumLat += pt[1]; n++;
  }
  return [sumLon / n, sumLat / n];
}

function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = (b[1] - a[1]) * Math.PI / 180;
  const dLon = (b[0] - a[0]) * Math.PI / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const s = sinLat * sinLat + Math.cos(a[1] * Math.PI / 180) * Math.cos(b[1] * Math.PI / 180) * sinLon * sinLon;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

function showBuildingInfo(props: any): void {
  if (!props) return;
  const attrs: Record<string, string> = {};

  const dpeClass = props.classe_bilan_dpe || '';
  if (props.annee_construction) attrs['Année construction'] = String(props.annee_construction);
  if (dpeClass) {
    const c = DPE_COLORS[dpeClass] || 'var(--text-primary)';
    attrs['DPE'] = `<span style="display:inline-block;width:12px;height:12px;border-radius:2px;background:${c};vertical-align:middle;margin-right:4px;"></span>${dpeClass}`;
  }
  if (props.hauteur) attrs['Hauteur'] = `${Number(props.hauteur).toFixed(1)} m`;
  if (props.nb_niveau) attrs['Niveaux'] = String(props.nb_niveau);
  if (props.surface_emprise_sol) attrs['Emprise sol'] = `${Number(props.surface_emprise_sol).toFixed(0)} m²`;
  if (props.code_departement_insee) attrs['Département'] = String(props.code_departement_insee);

  updatePanel({ type: 'building', attrs, hasGeometry: !!dpeClass, count: 1 });
}

/**
 * Fetch building data from BDNB, trying multiple strategies:
 *   1. Address lookup via rel_batiment_groupe_adresse → batiment_groupe_complet
 *   2. Commune proximity fallback
 */
async function fetchBuilding(addr: GeocodedAddress): Promise<void> {
  if (!map) return;

  // Strategy 1: Address lookup via rel_batiment_groupe_adresse
  // BDNB uses PostgREST. The cle_interop_adr column exists in rel_batiment_groupe_adresse,
  // NOT in batiment_groupe_complet directly. So we do a two-step lookup.
  if (addr.banId) {
    setStatus('Recherche du bâtiment par adresse...');
    try {
      // Step 1: Get batiment_groupe_id(s) for this address
      const relUrl = `/bdnb-api/donnees/rel_batiment_groupe_adresse?cle_interop_adr=eq.${addr.banId}&select=batiment_groupe_id`;
      const relRes = await fetchWithTimeout(relUrl, { headers: { Accept: 'application/json' } }, 6000);
      if (relRes.ok) {
        const relData = await relRes.json();
        const groupIds: string[] = (Array.isArray(relData) ? relData : [])
          .map((r: any) => r.batiment_groupe_id)
          .filter(Boolean);

        if (groupIds.length > 0) {
          console.log(`[BDNB Map] Found ${groupIds.length} building group(s) for this address`);

          // Step 2: Fetch full building data for those IDs
          // PostgREST supports the `in.(...)` operator for list filtering
          const idsParam = groupIds.map((id: string) => `"${id}"`).join(',');
          const bdgUrl = `/bdnb-api/donnees/batiment_groupe_complet?batiment_groupe_id=in.(${idsParam})`;
          const bdgRes = await fetchWithTimeout(bdgUrl, { headers: { Accept: 'application/json' } }, 6000);
          if (bdgRes.ok) {
            const bdgData = await bdgRes.json();
            const arr = Array.isArray(bdgData) ? bdgData : bdgData?.features || [];
            if (arr.length > 0) {
              console.log(`[BDNB Map] Found ${arr.length} buildings via address lookup`);
              processBuildingResults(arr, 0);
              return;
            }
          }
        }
      }
    } catch (e) {
      console.warn('[BDNB Map] Address lookup failed, trying commune proximity:', e);
    }
  }

  // Strategy 2: Commune proximity fallback
  const communeCode = addr.banId ? addr.banId.slice(0, 5) : '';
  if (communeCode) {
    setStatus('Recherche des bâtiments à proximité...');
    try {
      const commUrl = `/bdnb-api/donnees/batiment_groupe_complet?code_commune_insee=eq.${communeCode}&limit=20`;
      const commRes = await fetchWithTimeout(commUrl, { headers: { Accept: 'application/json' } }, 8000);

      if (commRes.ok) {
        const data = await commRes.json();
        const arr = Array.isArray(data) ? data : data?.features || [];
        console.log(`[BDNB Map] Commune returned ${arr.length} buildings`);

        if (arr.length > 0) {
          const withGeom = arr.filter((b: any) => b?.geom_groupe?.coordinates || b?.geometry?.coordinates);
          console.log(`[BDNB Map] ${withGeom.length}/${arr.length} have geometry`);

          if (withGeom.length > 0) {
            const searchPt: [number, number] = [addr.lon, addr.lat];
            const scored = arr.map((b: any, i: number) => {
              const { rawGeom, isWgs84 } = normalizeRecord(b);
              const centroid = rawGeom?.coordinates ? computeCentroid(rawGeom, isWgs84) : null;
              const dist = centroid ? haversineKm(searchPt, centroid) : Infinity;
              return { index: i, dist };
            });
            scored.sort((a: any, b: any) => a.dist - b.dist);
            processBuildingResults(arr, scored[0].index);
            return;
          }
        }
      }
    } catch (e) {
      console.warn('[BDNB Map] Commune lookup failed:', e);
    }
  }

  updatePanel({ type: 'no-building', message: 'Aucun bâtiment BDNB trouvé pour cette adresse' });
}

function processBuildingResults(arr: any[], selectedIdx: number): void {
  if (!map) return;

  // Store raw records for index-based lookup
  lastBuildingFeatures = arr;

  const selectedRecord = arr[selectedIdx];
  const { props: selProps, rawGeom: selGeom, isWgs84: selWgs84 } = normalizeRecord(selectedRecord);
  const selDpeClass = selProps.classe_bilan_dpe || '';

  // Show DPE legend if any building has a DPE class
  const hasDpe = arr.some((b: any) => b.classe_bilan_dpe || (b.properties?.classe_bilan_dpe));
  if (hasDpe) showDpeLegend(); else hideDpeLegend();

  // Build GeoJSON FeatureCollection from ALL buildings
  const features: any[] = [];
  for (const [i, record] of arr.entries()) {
    const { props, rawGeom, isWgs84 } = normalizeRecord(record);
    if (!rawGeom?.coordinates) continue;
    const geom = isWgs84 ? rawGeom : convertLambertToWgs84(rawGeom);
    if (!geom) continue;
    features.push({
      type: 'Feature',
      geometry: geom,
      properties: {
        building_index: i + 1, // 1-based for display
        classe_bilan_dpe: props.classe_bilan_dpe || null,
        batiment_groupe_id: props.batiment_groupe_id || '',
        annee_construction: props.annee_construction || null,
        hauteur: props.hauteur || props.hauteur_mean || null,
        nb_niveau: props.nb_niveau || null,
        surface_emprise_sol: props.surface_emprise_sol || null,
        mat_mur_txt: props.mat_mur_txt || null,
        mat_toit_txt: props.mat_toit_txt || null,
        conso_energie: props.conso_energie || null,
        emission_ges: props.emission_ges || null,
        code_departement_insee: props.code_departement_insee || null,
        usage_principal_bdnb_open: props.usage_principal_bdnb_open || null,
        adresse: props.libelle_adr_principale_ban || '',
      },
    });
  }

  // Update the GeoJSON source with all buildings
  try {
    const src = map.getSource('bdnb-geojson') as maplibregl.GeoJSONSource;
    if (src) {
      src.setData({ type: 'FeatureCollection', features });
      console.log(`[BDNB Map] Added ${features.length} buildings as GeoJSON`);
    }
  } catch (_) { /* ok */ }

  // Highlight the selected building
  if (selGeom?.coordinates) {
    const geom = selWgs84 ? selGeom : convertLambertToWgs84(selGeom);
    if (geom) {
      addHighlightPolygon(geom, selDpeClass);
    }
  }

  // Add building number labels
  addBuildingLabels(features);

  // Build attributes for the selected building
  const attrs: Record<string, string> = {};
  if (selProps.annee_construction) attrs['Année construction'] = String(selProps.annee_construction);
  if (selProps.mat_mur_txt && selProps.mat_mur_txt !== 'INDETERMINE') attrs['Matériau mur'] = String(selProps.mat_mur_txt);
  if (selProps.mat_toit_txt && selProps.mat_toit_txt !== 'INDETERMINE') attrs['Matériau toit'] = String(selProps.mat_toit_txt);
  if (selDpeClass) {
    const c = DPE_COLORS[selDpeClass] || 'var(--text-primary)';
    attrs['DPE'] = `<span style="display:inline-block;width:12px;height:12px;border-radius:2px;background:${c};vertical-align:middle;margin-right:4px;"></span>${selDpeClass}`;
  }
  if (selProps.conso_energie) attrs['Conso. énergie'] = `${Number(selProps.conso_energie).toFixed(0)} kWh/m²/an`;
  if (selProps.emission_ges) attrs['Émissions GES'] = `${Number(selProps.emission_ges).toFixed(1)} kgCO₂/m²/an`;
  if (selProps.hauteur_mean) attrs['Hauteur'] = `${Number(selProps.hauteur_mean).toFixed(1)} m`;
  if (selProps.nb_niveau) attrs['Niveaux'] = String(selProps.nb_niveau);
  if (selProps.surface_emprise_sol) attrs['Emprise sol'] = `${Number(selProps.surface_emprise_sol).toFixed(0)} m²`;
  if (selProps.surface_utile_totale) attrs['Surface utile'] = `${Number(selProps.surface_utile_totale).toFixed(0)} m²`;
  if (selProps.nb_logements) attrs['Logements'] = String(selProps.nb_logements);
  if (selProps.usage_principal_bdnb_open) attrs['Usage'] = String(selProps.usage_principal_bdnb_open);
  if (selProps.etat_chauffage_txt && selProps.etat_chauffage_txt !== 'INDETERMINE') attrs['Chauffage'] = String(selProps.etat_chauffage_txt);
  if (selProps.code_departement_insee) attrs['Département'] = String(selProps.code_departement_insee);

  updatePanel({ type: 'building', attrs, hasGeometry: !!selGeom?.coordinates, count: arr.length });
}

/* ═══════════════════════════════════════════════════════════════
   DPE Legend
   ═══════════════════════════════════════════════════════════════ */

function addDpeLegend(): void {
  if (!map) return;

  const existing = document.getElementById('bdnbDpeLegend');
  if (existing) existing.remove();

  const legendEl = document.createElement('div');
  legendEl.className = 'bdnb-dpe-legend maplibregl-ctrl';
  legendEl.id = 'bdnbDpeLegend';
  legendEl.style.display = 'none';
  legendEl.innerHTML = `
    <div class="bdnb-legend-title">DPE</div>
    ${Object.entries(DPE_COLORS).map(([letter, color]) => `
      <div class="bdnb-legend-row">
        <span class="bdnb-legend-swatch" style="background:${color};"></span>
        <span class="bdnb-legend-letter">${letter}</span>
      </div>
    `).join('')}
  `;

  const container = document.getElementById('climateMapContainer');
  if (container) container.appendChild(legendEl);
}

function showDpeLegend(): void {
  const el = document.getElementById('bdnbDpeLegend');
  if (el) el.style.display = 'flex';
}

function hideDpeLegend(): void {
  const el = document.getElementById('bdnbDpeLegend');
  if (el) el.style.display = 'none';
}

/* ═══════════════════════════════════════════════════════════════
   Side Panel
   ═══════════════════════════════════════════════════════════════ */

type PanelContent =
  | { type: 'address'; address: GeocodedAddress }
  | { type: 'building'; attrs: Record<string, string>; hasGeometry: boolean; count: number }
  | { type: 'no-building'; message: string }
  | { type: 'error'; message: string };

function updatePanel(content: PanelContent): void {
  const panel = document.getElementById('bdnbPanel');
  if (!panel) return;

  if (content.type === 'address') {
    panel.innerHTML = `
      <div class="bdnb-addr-card">
        <div class="bdnb-addr-header">
          <span class="material-symbols-outlined" style="font-size:16px;">location_on</span>
          <span style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--color-primary);">Adresse geocodée</span>
        </div>
        <div class="bdnb-addr-body">
          <div style="font-size:14px;font-weight:600;color:var(--text-primary);">${escapeHtml(content.address.label)}</div>
          <div style="font-size:11px;color:var(--text-muted);">${content.address.lat.toFixed(5)}, ${content.address.lon.toFixed(5)}</div>
          ${content.address.banId ? `<div style="font-size:10px;color:var(--text-muted);margin-top:2px;">BAN: ${escapeHtml(content.address.banId)}</div>` : ''}
        </div>
      </div>
      <div class="bdnb-loading">Chargement des données du bâtiment...</div>
    `;
  }

  if (content.type === 'building') {
    const loadingEl = panel.querySelector('.bdnb-loading');
    if (loadingEl) loadingEl.remove();

    const attrsHtml = Object.entries(content.attrs).map(([key, val]) => {
      const escaped = val.startsWith('<span') ? val : escapeHtml(val);
      return `
      <div class="bdnb-attr-item">
        <span class="bdnb-attr-label">${escapeHtml(key)}</span>
        <span class="bdnb-attr-value">${escaped}</span>
      </div>`;
    }).join('');

    const existingCard = panel.querySelector('.bdnb-building-card');
    if (existingCard) existingCard.remove();

    panel.insertAdjacentHTML('beforeend', `
      <div class="bdnb-building-card">
        <div class="bdnb-building-header">
          <span class="material-symbols-outlined" style="font-size:16px;">apartment</span>
          <span style="font-size:12px;font-weight:600;color:var(--text-primary);">Bâtiment (BDNB)</span>
          ${content.hasGeometry ? '<span class="bdnb-badge-geo">Empreinte</span>' : ''}
        </div>
        <div class="bdnb-attrs">${attrsHtml}</div>
        <div class="bdnb-footer">BDNB · bdnb.io · ${content.count} résultat${content.count > 1 ? 's' : ''}</div>
      </div>
    `);
  }

  if (content.type === 'no-building') {
    const card = panel.querySelector('.bdnb-building-card') || document.createElement('div');
    if (!card.parentNode) {
      panel.innerHTML += `
      <div class="bdnb-building-card">
        <div class="bdnb-building-header">
          <span class="material-symbols-outlined" style="font-size:16px;">info</span>
          <span style="font-size:12px;font-weight:500;color:var(--text-muted);">${escapeHtml(content.message)}</span>
        </div>
      </div>`;
    }
  }

  if (content.type === 'error') {
    const loadingEl = panel.querySelector('.bdnb-loading');
    if (loadingEl) {
      loadingEl.textContent = content.message;
      loadingEl.className = 'bdnb-error';
    } else {
      panel.innerHTML += `<div class="bdnb-error">${escapeHtml(content.message)}</div>`;
    }
  }
}

/* ═══════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════ */

function setStatus(msg: string): void {
  const el = document.getElementById('bdnbStatus');
  if (el) el.textContent = msg;
}

export function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* ═══════════════════════════════════════════════════════════════
   EPSG:2154 (Lambert-93) → WGS84 conversion
   ═══════════════════════════════════════════════════════════════ */

function convertCoordsL93(coords: number[]): number[] {
  return proj4(LAMBERT93, WGS84, coords);
}

function convertRingL93(ring: number[][]): number[][] {
  return ring.map(pt => convertCoordsL93(pt));
}

function convertMultiPolygonL93(multi: number[][][][]): number[][][][] {
  return multi.map(poly => poly.map(ring => convertRingL93(ring)));
}

function convertLambertToWgs84(geom: any): any {
  if (!geom || !geom.coordinates) return null;
  try {
    let newCoords;
    if (geom.type === 'MultiPolygon') {
      newCoords = convertMultiPolygonL93(geom.coordinates);
    } else if (geom.type === 'Polygon') {
      newCoords = geom.coordinates.map((ring: number[][]) => convertRingL93(ring));
    } else {
      return null;
    }
    return { type: geom.type, coordinates: newCoords };
  } catch (e) {
    console.warn('[BDNB Map] Lambert conversion error:', e);
    return null;
  }
}
