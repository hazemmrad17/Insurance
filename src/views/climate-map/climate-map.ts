/**
 * BDNB Building Map — MapLibre GL JS
 *
 * Uses BDNB's own MVT vector tile infrastructure to show
 * building footprints colored by DPE class (when available).
 *
 * Providers:
 *   - Map tiles:   OpenStreetMap raster tiles (base)
 *   - Buildings:   BDNB MVT vector tiles (batiment_groupe)
 *   - Geocoding:   BDNB geocoding API → BAN fallback
 *   - Attributes:  BDNB batiment_groupe_complet REST API
 */

import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import proj4 from 'proj4';

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

// BDNB MVT vector tile endpoint — the "map viewer" the user wants
const BDNB_TILE_URL = 'https://api.bdnb.io/v1/bdnb/tuiles/batiment_groupe/{z}/{x}/{y}.pbf';

// DPE color scale (A → G) — used in both tile expression and fallback
const DPE_COLORS: Record<string, string> = {
  A: '#10b981', B: '#34d399', C: '#facc15', D: '#f59e0b', E: '#f97316', F: '#ef4444', G: '#dc2626',
};

// MapLibre match expression for DPE → color (for vector tile layer)
function dpeColorExpression(): maplibregl.DataDrivenPropertyValueSpecification<string> {
  const entries: any[] = ['match', ['get', 'classe_bilan_dpe']];
  for (const [letter, color] of Object.entries(DPE_COLORS)) {
    entries.push(letter, color);
  }
  entries.push('#c56a3d'); // default (no DPE data) — BDNB brand terracotta
  return entries as maplibregl.DataDrivenPropertyValueSpecification<string>;
}

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

/* ═══════════════════════════════════════════════════════════════
   Exported API
   ═══════════════════════════════════════════════════════════════ */

export function initClimateMap(): void {
  const container = document.getElementById('climateMapContainer');
  if (!container || map) return;

  // Ensure container has size
  container.style.width = '100%';
  container.style.height = '100%';

  map = new maplibregl.Map({
    container: 'climateMapContainer',
    style: {
      version: 8,
      sources: {
        'osm-raster': {
          type: 'raster',
          tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
          attribution: '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        },
        'bdnb-buildings': {
          type: 'vector',
          tiles: [BDNB_TILE_URL],
          minzoom: 10,
          maxzoom: 18,
          attribution: 'BDNB &copy; <a href="https://bdnb.io">bdnb.io</a>',
        },
      },
      layers: [
        // Base OSM raster
        {
          id: 'osm-raster-layer',
          type: 'raster',
          source: 'osm-raster',
          minzoom: 0,
          maxzoom: 19,
        },
        // BDNB building footprints — DPE-colored fill
        {
          id: 'bdnb-buildings-fill',
          type: 'fill',
          source: 'bdnb-buildings',
          'source-layer': 'batiment_groupe',
          minzoom: 14,
          maxzoom: 18,
          paint: {
            'fill-color': dpeColorExpression(),
            'fill-opacity': 0.35,
            'fill-outline-color': 'rgba(148, 163, 184, 0.4)',
          },
        },
        // BDNB building outlines (subtle stroke)
        {
          id: 'bdnb-buildings-outline',
          type: 'line',
          source: 'bdnb-buildings',
          'source-layer': 'batiment_groupe',
          minzoom: 14,
          maxzoom: 18,
          paint: {
            'line-color': 'rgba(148, 163, 184, 0.5)',
            'line-width': 0.5,
          },
        },
      ],
    },
    center: [2.3522, 48.8566], // Paris
    zoom: 13,
    minZoom: 3,
    maxZoom: 18,
    attributionControl: { compact: false },
  });

  // Navigation controls
  map.addControl(new maplibregl.NavigationControl(), 'top-left');

  // Scale control
  map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

  // Wait for style to load then set up interactions
  map.on('load', () => {
    console.log('[BDNB Map] MapLibre GL initialized with BDNB tiles');

    // Add DPE legend
    addDpeLegend();

    // Click on building → show info
    map!.on('click', 'bdnb-buildings-fill', (e) => {
      if (e.features && e.features.length > 0) {
        const props = e.features[0].properties || {};
        showBuildingInfo(props);
      }
    });

    // Cursor change on hover
    map!.on('mouseenter', 'bdnb-buildings-fill', () => {
      if (map) map.getCanvas().style.cursor = 'pointer';
    });
    map!.on('mouseleave', 'bdnb-buildings-fill', () => {
      if (map) map.getCanvas().style.cursor = '';
    });
  });

  // Log tile loading errors (CORS issues, etc.)
  map.on('error', (e) => {
    if (e.error && typeof e.error === 'object' && 'status' in e.error) {
      console.warn('[BDNB Map] Tile error:', e.error);
    }
  });

  // Wire up search
  setupSearch();

  console.log('[BDNB Map] Init complete');
}

export function destroyClimateMap(): void {
  clearHighlight();
  removeMarker();
  if (map) {
    map.remove();
    map = null;
  }
  geocoded = null;
  const legend = document.getElementById('bdnbDpeLegend');
  if (legend) legend.remove();
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
  removeMarker();
  geocoded = null;
  hideDpeLegend();

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

async function handleSearch(query: string): Promise<void> {
  if (!map) return;

  setStatus('Géocodage...');
  clearResults();

  try {
    const encoded = encodeURIComponent(query);
    const res = await fetch(
      `https://api.bdnb.io/v1/bdnb/geocodage?q=${encoded}`,
      { headers: { Accept: 'application/json' } }
    );
    if (!res.ok) throw new Error(`BDNB geocoding: ${res.status}`);

    const data = await res.json();
    console.log('[BDNB Map] Geocoding response:', data);

    let lon: number | undefined;
    let lat: number | undefined;
    let label = query;
    let banId: string | undefined;

    // Parse response
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

    // Fallback to BAN API
    if (lon === undefined || lat === undefined) {
      setStatus('BDNB géocodage insuffisant, essai BAN...');
      const banRes = await fetch(
        `https://api-adresse.data.gouv.fr/search/?q=${encoded}&limit=1`
      );
      if (banRes.ok) {
        const banData = await banRes.json();
        if (banData.features?.length > 0) {
          const f = banData.features[0];
          lon = f.geometry.coordinates[0];
          lat = f.geometry.coordinates[1];
          label = f.properties?.label || label;
        }
      }
    }

    if (lon === undefined || lat === undefined) {
      throw new Error('Impossible de trouver les coordonnées — essayez une adresse plus précise');
    }

    geocoded = { lon, lat, label, banId };

    // Drop marker
    addMarker(lat, lon);

    // Fly to location
    map.flyTo({ center: [lon, lat], zoom: 16, duration: 1500 });

    // Update panel with address
    updatePanel({ type: 'address', address: geocoded });

    // Fetch building data
    setStatus('Recherche des données BDNB...');
    await fetchBuilding(geocoded);
    setStatus('');
  } catch (err) {
    console.error('[BDNB Map] Search error:', err);
    setStatus(err instanceof Error ? err.message : 'Échec de la recherche');
    updatePanel({ type: 'error', message: err instanceof Error ? err.message : 'Échec de la recherche' });
  }
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
    } catch (_) { /* may not exist */ }
    try {
      map.removeSource(highlightSourceId);
    } catch (_) { /* may not exist */ }
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
      'fill-opacity': 0.45,
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
   BDNB Building Data Fetch
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

async function fetchBuilding(addr: GeocodedAddress): Promise<void> {
  if (!map) return;

  try {
    if (!addr.banId) {
      // Try to query by spatial proximity regardless of BAN ID
      setStatus('Aucun identifiant BAN — recherche par proximité...');
    }

    if (addr.banId) {
      setStatus('Recherche du bâtiment par clé BAN...');

      const banUrl = `https://api.bdnb.io/v1/bdnb/donnees/batiment_groupe_complet?cle_interop_adr_principale_ban=eq.${addr.banId}`;
      const banRes = await fetch(banUrl, { headers: { Accept: 'application/json' } });

      if (banRes.ok) {
        const data = await banRes.json();
        const arr = Array.isArray(data) ? data : data?.features || [];
        if (arr.length > 0) {
          processBuildingResults(arr, 0);
          return;
        }
      }
    }

    // Fallback: commune filter + spatial proximity
    const communeCode = addr.banId ? addr.banId.slice(0, 5) : '';
    if (communeCode) {
      setStatus('Recherche des bâtiments à proximité...');
      const commUrl = `https://api.bdnb.io/v1/bdnb/donnees/batiment_groupe_complet?code_commune_insee=eq.${communeCode}&limit=20`;
      const commRes = await fetch(commUrl, { headers: { Accept: 'application/json' } });

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
    }

    updatePanel({ type: 'no-building', message: 'Aucun bâtiment BDNB trouvé pour cette adresse' });
  } catch (err) {
    console.error('[BDNB Map] Building fetch error:', err);
    updatePanel({ type: 'error', message: 'Erreur lors du chargement des données BDNB' });
  }
}

function processBuildingResults(arr: any[], selectedIdx: number): void {
  const record = arr[selectedIdx];
  const { props, rawGeom, isWgs84 } = normalizeRecord(record);

  const dpeClass = props.classe_bilan_dpe || '';

  // Highlight the building polygon on the map
  if (rawGeom?.coordinates) {
    const geom = isWgs84 ? rawGeom : convertLambertToWgs84(rawGeom);
    if (geom) {
      addHighlightPolygon(geom, dpeClass);
    }
  }

  // Show attributes in side panel
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
  if (props.etat_avancement_txt && props.etat_avancement_txt !== 'INDETERMINE') attrs['État'] = String(props.etat_avancement_txt);
  if (props.code_departement_insee) attrs['Département'] = String(props.code_departement_insee);

  updatePanel({ type: 'building', attrs, hasGeometry: !!rawGeom?.coordinates, count: arr.length });

  // Show DPE legend if we have DPE data
  if (dpeClass) showDpeLegend(); else hideDpeLegend();
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

    // Remove existing building card if any
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

function escapeHtml(str: string): string {
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
