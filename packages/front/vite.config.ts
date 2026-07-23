import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    proxy: {
      // Backend API proxy
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },

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
    },
  },
});
