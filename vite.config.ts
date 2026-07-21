import { defineConfig } from 'vite';

function stripCookieDomain() {
  return {
    configure: (proxy: any) => {
      proxy.on('proxyRes', (proxyRes: any) => {
        const setCookie = proxyRes.headers['set-cookie'];
        if (setCookie) {
          const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
          proxyRes.headers['set-cookie'] = cookies.map((c: string) =>
            c.replace(/;\s*Domain=[^;]+/gi, '')
          );
        }
      });
    },
  };
}

export default defineConfig({
  server: {
    proxy: {
      // OSM raster tiles — bypass CORS blocking in Firefox
      '/osm-tiles': {
        target: 'https://tile.openstreetmap.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/osm-tiles/, ''),
      },

      // Géorisques WMS (risk zone polygon tiles)
      '/georisques-wms': {
        target: 'https://www.georisques.gouv.fr',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/georisques-wms/, '/services'),
        ...stripCookieDomain(),
      },

      // Géorisques REST API v1 (commune-level, no auth)
      '/georisques-api': {
        target: 'https://georisques.gouv.fr',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/georisques-api/, '/api/v1'),
        ...stripCookieDomain(),
      },

      // Géorisques REST API v2 (parcel-level, requires token)
      '/georisques-v2-api': {
        target: 'https://georisques.gouv.fr',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/georisques-v2-api/, '/api/v2'),
        ...stripCookieDomain(),
      },

      // BDNB API (geocoding + building data)
      '/bdnb-api': {
        target: 'https://api.bdnb.io',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/bdnb-api/, '/v1/bdnb'),
      },

      // BDNB MVT vector tiles (building footprints)
      '/bdnb-tiles': {
        target: 'https://api.bdnb.io',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/bdnb-tiles/, '/v1/bdnb/tuiles'),
      },

      // BAN geocoding fallback
      '/ban-api': {
        target: 'https://api-adresse.data.gouv.fr',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ban-api/, ''),
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
