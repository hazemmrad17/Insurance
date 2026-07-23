import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    proxy: {
      // Backend API proxy
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },

      // ── Map tile / layer proxies (used by climate-map.ts) ──

      // OSM raster tiles — bypass CORS blocking in Firefox
      '/osm-tiles': {
        target: 'https://tile.openstreetmap.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/osm-tiles/, ''),
      },

      // Géorisques WMS (risk zone polygon tiles for map layers)
      '/georisques-wms': {
        target: 'https://www.georisques.gouv.fr',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/georisques-wms/, '/services'),
      },

      // BDNB MVT vector tiles (building footprints for map layers)
      '/bdnb-tiles': {
        target: 'https://api.bdnb.io',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/bdnb-tiles/, '/v1/bdnb/tuiles'),
      },

      // IGN Geocodage (cadastral parcel lookup via reverse geocoding)
      '/ign-geocodage': {
        target: 'https://data.geopf.fr',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ign-geocodage/, '/geocodage'),
      },

      // ── Data API proxies (used by georisques-service.ts, climate-map.ts) ──

      // BAN (Base Adresse Nationale) — address search / autocomplete
      '/ban-api': {
        target: 'https://api-adresse.data.gouv.fr',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ban-api/, ''),
      },

      // Géorisques API v1 — consolidated risk report + GASPAR CATNAT
      '/georisques-api': {
        target: 'https://www.georisques.gouv.fr',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/georisques-api/, '/api/v1'),
      },

      // Géorisques API v2 — thematic enrichment (argile, cavités, SSP) with Bearer token
      '/georisques-v2-api': {
        target: 'https://www.georisques.gouv.fr',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/georisques-v2-api/, '/api/v2'),
      },

      // BDNB REST API (PostgREST) — building data queries
      '/bdnb-api': {
        target: 'https://api.bdnb.io',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/bdnb-api/, '/v1/bdnb'),
      },
    },
  },
});
