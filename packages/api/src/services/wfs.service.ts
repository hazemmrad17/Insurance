/**
 * IGN WFS Distance Queries — Waterway + Forest
 * =============================================
 *
 * Fetches minimum distance from a coordinate point to:
 *   - Waterway (BD TOPO V3: troncon_hydrographique + surface_hydrographique)
 *   - Forest (Masque Forêt IGN 2021-2023)
 *
 * Both use the IGN WFS 2.0 endpoint at data.geopf.fr
 */

/**
 * Haversine distance between two lon/lat points in metres
 */
function haversine(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const R = 6371000;
  const toRad = (d: number) => d * Math.PI / 180;
  const dLon = toRad(lon2 - lon1);
  const dLat = toRad(lat2 - lat1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Compute minimum distance from (lon,lat) to a GeoJSON geometry.
 * Supports Point, MultiPoint, LineString, MultiLineString, Polygon, MultiPolygon.
 */
function minDistanceToGeometry(lon: number, lat: number, geom: any): number | null {
  if (!geom || !geom.type || !geom.coordinates) return null;
  const extractCoords = (coords: any[], type: string): [number, number][] => {
    if (type === 'Point') return [[coords[0], coords[1]]];
    if (type === 'MultiPoint' || type === 'LineString') return coords.map((c: any) => [c[0], c[1]]);
    if (type === 'MultiLineString' || type === 'Polygon') return coords.flat().map((c: any) => [c[0], c[1]]);
    if (type === 'MultiPolygon') return coords.flat(2).map((c: any) => [c[0], c[1]]);
    return [];
  };
  const points = extractCoords(geom.coordinates, geom.type);
  if (points.length === 0) return null;
  let minDist = Infinity;
  for (const [plon, plat] of points) {
    const d = haversine(lon, lat, plon, plat);
    if (d < minDist) minDist = d;
  }
  return minDist === Infinity ? null : Math.round(minDist);
}

/**
 * Fetch minimum distance to waterway using BD TOPO V3 WFS.
 * Queries troncon_hydrographique (lines) + surface_hydrographique (polygons).
 */
export async function fetchWaterwayDistance(lon: number, lat: number): Promise<number | null> {
  const bbox = `${lat - 0.05},${lon - 0.05},${lat + 0.05},${lon + 0.05}`;
  let minDist = Infinity;

  for (const typeName of ['BDTOPO_V3:troncon_hydrographique', 'BDTOPO_V3:surface_hydrographique']) {
    try {
      const url = `https://data.geopf.fr/wfs/ows?service=WFS&version=2.0.0` +
        `&request=GetFeature&typeNames=${typeName}&bbox=${bbox}` +
        `&outputFormat=application/json&count=50`;
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (!data?.features?.length) continue;
      for (const feature of data.features) {
        const d = minDistanceToGeometry(lon, lat, feature.geometry);
        if (d !== null && d < minDist) minDist = d;
      }
    } catch {
      continue;
    }
  }

  return minDist === Infinity ? null : minDist;
}

/**
 * Fetch minimum distance to forest using IGN Masque Forêt WFS.
 * Uses IGNF_MASQUE-FORET.2021-2023:masque_foret filtered by nature=Forêt.
 */
export async function fetchForestDistance(lon: number, lat: number): Promise<number | null> {
  const bbox = `${lat - 0.05},${lon - 0.05},${lat + 0.05},${lon + 0.05}`;
  let minDist = Infinity;

  try {
    const url = `https://data.geopf.fr/wfs/ows?service=WFS&version=2.0.0` +
      `&request=GetFeature&typeNames=IGNF_MASQUE-FORET.2021-2023:masque_foret` +
      `&bbox=${bbox}&outputFormat=application/json&count=50`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(6000),
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.features?.length) {
        for (const feature of data.features) {
          if (feature.properties?.nature !== 'Forêt') continue;
          const d = minDistanceToGeometry(lon, lat, feature.geometry);
          if (d !== null && d < minDist) minDist = d;
        }
      }
    }
  } catch {
    // return null
  }

  return minDist === Infinity ? null : minDist;
}
