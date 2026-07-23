/**
 * Portfolio Map — Dark 3D map for portfolio visualization
 *
 * Shows all 24 portfolio properties as 3D markers colored by risk level
 * with pitch/tilt for a modern geo-visualization.
 *
 * Supports both:
 * 1. Custom Mapbox GL style if VITE_MAPBOX_TOKEN is provided in .env
 * 2. CARTO Dark Matter raster fallback if no token is set (prevents Mapbox API errors)
 */

import mapboxgl from 'mapbox-gl';

/* ═══════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════ */

interface PortfolioProperty {
  address: string;
  client: string;
  risk: 'high' | 'medium' | 'low';
  score: number;
  lat: number;
  lon: number;
}

/* ═══════════════════════════════════════════════════════════════
   Portfolio property data (matches the 24 properties in portfolio grid)
   ═══════════════════════════════════════════════════════════════ */

const PROPERTIES: PortfolioProperty[] = [
  { address: '8 Rue de la Paix, Paris 2e', client: 'Jean Dupont', risk: 'high', score: 66, lat: 48.8691, lon: 2.3313 },
  { address: '15 Bd Haussmann, Paris 9e', client: 'Marie Bernard', risk: 'medium', score: 48, lat: 48.8755, lon: 2.3372 },
  { address: '2 Pl. Bourse, Lyon 2e', client: 'Pierre Lefevre', risk: 'low', score: 22, lat: 45.7675, lon: 4.8389 },
  { address: '12 Av. Champs-Elysees, Paris 8e', client: 'Jean Dupont', risk: 'high', score: 72, lat: 48.8712, lon: 2.3069 },
  { address: '5 Rue de Rennes, Paris 6e', client: 'Marie Bernard', risk: 'medium', score: 44, lat: 48.8520, lon: 2.3310 },
  { address: '34 Rue de Rivoli, Paris 4e', client: 'Pierre Lefevre', risk: 'high', score: 81, lat: 48.8570, lon: 2.3580 },
  { address: '18 Rue Lafayette, Paris 9e', client: 'Jean Dupont', risk: 'low', score: 18, lat: 48.8770, lon: 2.3430 },
  { address: '7 Rue du Bac, Paris 7e', client: 'Marie Bernard', risk: 'medium', score: 53, lat: 48.8565, lon: 2.3260 },
  { address: '50 Rue de la Pompe, Paris 16e', client: 'Sophie Nguyen', risk: 'medium', score: 40, lat: 48.8640, lon: 2.2780 },
  { address: '23 Rue Paradis, Marseille 6e', client: 'Pierre Lefevre', risk: 'high', score: 75, lat: 43.2870, lon: 5.3790 },
  { address: '8 Cours Martinique, Bordeaux', client: 'Sophie Nguyen', risk: 'low', score: 28, lat: 44.8371, lon: -0.5761 },
  { address: '15 Rue Monnaie, Lille', client: 'Claire Petit', risk: 'medium', score: 45, lat: 50.6380, lon: 3.0680 },
  { address: '2 Pl. Capitole, Toulouse', client: 'Lucas Richard', risk: 'low', score: 15, lat: 43.6045, lon: 1.4440 },
  { address: '5 Rue Cathedrale, Strasbourg', client: 'Claire Petit', risk: 'medium', score: 50, lat: 48.5810, lon: 7.7480 },
  { address: '10 Rue Crebillon, Nantes', client: 'Lucas Richard', risk: 'high', score: 70, lat: 47.2130, lon: -1.5560 },
  { address: '18 Rue Republique, Lyon 3e', client: 'Marie Bernard', risk: 'low', score: 20, lat: 45.7600, lon: 4.8420 },
  { address: '25 Rue de la Paix, Paris 2e', client: 'Jean Dupont', risk: 'medium', score: 55, lat: 48.8695, lon: 2.3300 },
  { address: '12 Rue Eglise, Marseille 6e', client: 'Pierre Lefevre', risk: 'medium', score: 38, lat: 43.2920, lon: 5.3750 },
  { address: '3 Pl. Bourse, Lille', client: 'Claire Petit', risk: 'high', score: 68, lat: 50.6390, lon: 3.0650 },
  { address: '7 Rue des Arts, Toulouse', client: 'Lucas Richard', risk: 'medium', score: 42, lat: 43.6050, lon: 1.4460 },
  { address: '14 Rue Fleurs, Bordeaux', client: 'Sophie Nguyen', risk: 'low', score: 25, lat: 44.8380, lon: -0.5750 },
  { address: '9 Rue Universite, Nantes', client: 'Lucas Richard', risk: 'medium', score: 35, lat: 47.2140, lon: -1.5550 },
  { address: '4 Rue Pont, Strasbourg', client: 'Claire Petit', risk: 'high', score: 78, lat: 48.5820, lon: 7.7490 },
  { address: '6 Rue Victor Hugo, Lyon 2e', client: 'Marie Bernard', risk: 'low', score: 30, lat: 45.7580, lon: 4.8350 },
];

/* ═══════════════════════════════════════════════════════════════
   State
   ═══════════════════════════════════════════════════════════════ */

let map: mapboxgl.Map | null = null;
let popup: mapboxgl.Popup | null = null;

// Read optional Mapbox token from environment
const RAW_TOKEN = (import.meta.env.VITE_MAPBOX_TOKEN as string || '').trim();
const HAS_VALID_MAPBOX_TOKEN = Boolean(RAW_TOKEN && RAW_TOKEN.startsWith('pk.'));
const MAPBOX_STYLE = 'mapbox://styles/hazicore/cmrrmizig008301qk941gg6od';

// Fallback CARTO Dark Matter style (no API token required)
const CARTO_DARK_STYLE: mapboxgl.Style = {
  version: 8,
  sources: {
    'carto-dark': {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
      ],
      tileSize: 256,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    },
  },
  layers: [
    {
      id: 'carto-dark-layer',
      type: 'raster',
      source: 'carto-dark',
      minzoom: 0,
      maxzoom: 22,
    },
  ],
};

/* ═══════════════════════════════════════════════════════════════
   Exported API
   ═══════════════════════════════════════════════════════════════ */

export function initPortfolioMap(): void {
  const container = document.getElementById('portfolioMapContainer');
  if (!container || map) return;

  container.style.width = '100%';
  container.style.height = '100%';
  container.style.minHeight = '460px';

  const centerLon = PROPERTIES.reduce((s, p) => s + p.lon, 0) / PROPERTIES.length;
  const centerLat = PROPERTIES.reduce((s, p) => s + p.lat, 0) / PROPERTIES.length;

  if (HAS_VALID_MAPBOX_TOKEN) {
    mapboxgl.accessToken = RAW_TOKEN;
  }

  try {
    map = new mapboxgl.Map({
      container: 'portfolioMapContainer',
      style: HAS_VALID_MAPBOX_TOKEN ? MAPBOX_STYLE : CARTO_DARK_STYLE,
      center: [centerLon, centerLat],
      zoom: 5.8,
      pitch: 50,
      bearing: -12,
      minZoom: 3,
      maxZoom: 18,
    });

    map.addControl(new mapboxgl.NavigationControl(), 'top-right');
    map.addControl(new mapboxgl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    map.on('load', () => {
      addPortfolioLayers();
      addLegend();
    });

    map.on('error', (e) => {
      // If custom mapbox style fails (e.g. invalid token), fallback to CARTO dark style safely
      if (HAS_VALID_MAPBOX_TOKEN && e && String(e.error?.message || '').includes('access token')) {
        console.warn('[PortfolioMap] Mapbox token error detected, switching to fallback basemap');
        map?.setStyle(CARTO_DARK_STYLE);
      }
    });
  } catch (err) {
    console.warn('[PortfolioMap] Failed initializing Mapbox GL with token, retrying with fallback basemap:', err);
    // Initialize without token using CARTO dark style
    map = new mapboxgl.Map({
      container: 'portfolioMapContainer',
      style: CARTO_DARK_STYLE,
      center: [centerLon, centerLat],
      zoom: 5.8,
      pitch: 50,
      bearing: -12,
      minZoom: 3,
      maxZoom: 18,
    });

    map.addControl(new mapboxgl.NavigationControl(), 'top-right');
    map.addControl(new mapboxgl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    map.on('load', () => {
      addPortfolioLayers();
      addLegend();
    });
  }
}

export function destroyPortfolioMap(): void {
  if (popup) { popup.remove(); popup = null; }
  if (map) {
    map.remove();
    map = null;
  }
  const legend = document.getElementById('portfolioMapLegend');
  if (legend) legend.remove();
}

/* ═══════════════════════════════════════════════════════════════
   Portfolio data layers
   ═══════════════════════════════════════════════════════════════ */

function addPortfolioLayers(): void {
  if (!map) return;

  const geoJson: Record<string, unknown> = {
    type: 'FeatureCollection',
    features: PROPERTIES.map((p, i) => ({
      type: 'Feature',
      properties: {
        id: i,
        address: p.address,
        client: p.client,
        risk: p.risk,
        score: p.score,
      },
      geometry: {
        type: 'Point',
        coordinates: [p.lon, p.lat],
      },
    })),
  };

  if (!map.getSource('portfolio-props')) {
    map.addSource('portfolio-props', {
      type: 'geojson',
      data: geoJson as any,
    });
  }

  // 3D building extrusions
  if (!map.getLayer('portfolio-extrusions')) {
    map.addLayer({
      id: 'portfolio-extrusions',
      type: 'fill-extrusion',
      source: 'portfolio-props',
      paint: {
        'fill-extrusion-color': [
          'match', ['get', 'risk'],
          'high', '#ef4444',
          'medium', '#f59e0b',
          'low', '#10b981',
          '#94a3b8',
        ],
        'fill-extrusion-height': ['interpolate', ['linear'], ['get', 'score'], 0, 10, 50, 60, 100, 120],
        'fill-extrusion-base': 0,
        'fill-extrusion-opacity': 0.6,
      },
    });
  }

  // Glow rings
  if (!map.getLayer('portfolio-glow')) {
    map.addLayer({
      id: 'portfolio-glow',
      type: 'circle',
      source: 'portfolio-props',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 8, 10, 18, 15, 30],
        'circle-color': [
          'match', ['get', 'risk'],
          'high', '#ef4444',
          'medium', '#f59e0b',
          'low', '#10b981',
          '#94a3b8',
        ],
        'circle-opacity': 0.15,
        'circle-blur': 0.6,
      },
    });
  }

  // Center dot markers
  if (!map.getLayer('portfolio-dots')) {
    map.addLayer({
      id: 'portfolio-dots',
      type: 'circle',
      source: 'portfolio-props',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 4, 10, 8, 15, 12],
        'circle-color': [
          'match', ['get', 'risk'],
          'high', '#ef4444',
          'medium', '#f59e0b',
          'low', '#10b981',
          '#94a3b8',
        ],
        'circle-opacity': 0.9,
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-opacity': 0.6,
      },
    });
  }

  // Wire interactions
  map.on('click', 'portfolio-dots', (e) => {
    if (e.features && e.features.length > 0) {
      showPropertyPopup(e.features[0].properties || {}, e.lngLat);
    }
  });
  map.on('click', 'portfolio-extrusions', (e) => {
    if (e.features && e.features.length > 0) {
      showPropertyPopup(e.features[0].properties || {}, e.lngLat);
    }
  });

  map.on('mouseenter', 'portfolio-dots', () => {
    if (map) map.getCanvas().style.cursor = 'pointer';
  });
  map.on('mouseleave', 'portfolio-dots', () => {
    if (map) map.getCanvas().style.cursor = '';
  });
  map.on('mouseenter', 'portfolio-extrusions', () => {
    if (map) map.getCanvas().style.cursor = 'pointer';
  });
  map.on('mouseleave', 'portfolio-extrusions', () => {
    if (map) map.getCanvas().style.cursor = '';
  });
}

/* ═══════════════════════════════════════════════════════════════
   Property popup
   ═══════════════════════════════════════════════════════════════ */

function showPropertyPopup(props: Record<string, unknown>, lngLat: mapboxgl.LngLatLike): void {
  if (popup) popup.remove();

  const risk = (props.risk as string) || 'low';
  const color = risk === 'high' ? '#ef4444' : risk === 'medium' ? '#f59e0b' : '#10b981';
  const riskLabel = risk === 'high' ? 'Haut risque' : risk === 'medium' ? 'Risque modéré' : 'Faible risque';

  const html = '<div class="portfolio-map-popup">'
    + '<div class="portfolio-popup-header" style="border-left:3px solid ' + color + ';padding-left:8px;">'
    + '<div class="portfolio-popup-addr">' + escapeHtml(String(props.address || 'Propriété')) + '</div>'
    + '<div class="portfolio-popup-client">' + escapeHtml(String(props.client || '')) + '</div>'
    + '</div>'
    + '<div class="portfolio-popup-body">'
    + '<div class="portfolio-popup-row">'
    + '<span>Score de risque</span>'
    + '<span class="portfolio-popup-score" style="color:' + color + ';">' + (props.score ?? '---') + '</span>'
    + '</div>'
    + '<div class="portfolio-popup-row">'
    + '<span>Niveau</span>'
    + '<span class="portfolio-popup-badge" style="background:' + color + '20;color:' + color + ';">' + riskLabel + '</span>'
    + '</div>'
    + '</div>'
    + '</div>';

  popup = new mapboxgl.Popup({
    closeButton: true,
    closeOnClick: true,
    maxWidth: '280px',
    offset: 15,
  })
    .setLngLat(lngLat)
    .setHTML(html)
    .addTo(map!);
}

/* ═══════════════════════════════════════════════════════════════
   Legend
   ═══════════════════════════════════════════════════════════════ */

function addLegend(): void {
  const existing = document.getElementById('portfolioMapLegend');
  if (existing) existing.remove();

  const container = document.getElementById('portfolioMapContainer');
  if (!container) return;

  const legend = document.createElement('div');
  legend.id = 'portfolioMapLegend';
  legend.className = 'portfolio-map-legend mapboxgl-ctrl';
  legend.innerHTML = '<div class="portfolio-legend-title">Niveau de risque</div>'
    + '<div class="portfolio-legend-item"><span class="portfolio-legend-dot" style="background:#ef4444;"></span>Haut risque</div>'
    + '<div class="portfolio-legend-item"><span class="portfolio-legend-dot" style="background:#f59e0b;"></span>Risque modéré</div>'
    + '<div class="portfolio-legend-item"><span class="portfolio-legend-dot" style="background:#10b981;"></span>Faible risque</div>'
    + '<div class="portfolio-legend-divider"></div>'
    + '<div class="portfolio-legend-count">' + PROPERTIES.length + ' propriétés · ' + PROPERTIES.filter(p => p.risk === 'high').length + ' haut risque</div>';
  container.appendChild(legend);
}

/* ═══════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════ */

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
