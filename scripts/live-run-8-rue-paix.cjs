/**
 * live-run-8-rue-paix.cjs
 *
 * Calls ALL providers via their real API endpoints (no Vite proxy) and
 * saves the assembled RiskAssessmentInput as address-8-rue-paix.json.
 *
 * Run: node scripts/live-run-8-rue-paix.cjs
 *
 * APIs used (all live):
 *   ✓ BAN geocoding     → api-adresse.data.gouv.fr
 *   ✓ BDNB building     → api.bdnb.io/v1/bdnb/donnees/
 *   ✓ Géorisques v1     → georisques.gouv.fr/api/v1/
 *   ✓ IGN altimetry     → data.geopf.fr/altimetrie/
 *   ✓ Open-Meteo climate→ climate-api.open-meteo.com
 *   ✓ CATNAT (GASPAR)   → georisques.gouv.fr/api/v1/gaspar/
 *   ✓ DVF               → local departments.json lookup
 *   ✓ DRIAS             → local drias.json lookup
 */

const fs = require('fs');
const path = require('path');

/* ── API base URLs (real, no proxy) ── */

const BAN_BASE       = 'https://api-adresse.data.gouv.fr';
const BDNB_BASE      = 'https://api.bdnb.io/v1/bdnb';
const GEORISQUES_V1  = 'https://georisques.gouv.fr/api/v1';
const GEORISQUES_V2  = 'https://georisques.gouv.fr/api/v2';
const IGN_ALTITUDE   = 'https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json';
const IGN_GEOCODAGE  = 'https://data.geopf.fr/geocodage';
const OPENMETEO      = 'https://climate-api.open-meteo.com/v1/climate';

/* ── Read Géorisques v2 token from .env ── */
const envPath = path.resolve(__dirname, '..', '.env');
let GEORISQUES_V2_TOKEN = null;
try {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  const match = envContent.match(/^VITE_GEORISQUES_V2_TOKEN=(.+)$/m);
  if (match) GEORISQUES_V2_TOKEN = match[1].trim();
} catch { /* no .env file */ }

/* ── Helpers ── */

const fetchJson = async (url, timeoutMs = 8000, retries = 0) => {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (res.ok) {
        return await res.json();
      }
      if (res.status === 429 && attempt < retries) {
        const wait = 2000 * (attempt + 1);
        console.warn(`  ⏳ 429, retry ${attempt + 1}/${retries} after ${wait}ms`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      console.warn(`  ⚠  HTTP ${res.status}`);
      return null;
    } catch (err) {
      if (err?.name === 'AbortError' && attempt < retries) {
        const wait = 1000 * (attempt + 1);
        console.warn(`  ⏳ Timeout, retry ${attempt + 1}/${retries} after ${wait}ms`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      console.warn(`  ⚠  ${err?.message || err}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
};

/* ── Step 1: Geocode via BAN API ── */

async function geocodeAddress(query) {
  console.log('\n📍 Geocoding…');
  const encoded = encodeURIComponent(query);
  const data = await fetchJson(`${BAN_BASE}/search/?q=${encoded}&limit=1`, 5000);
  if (!data?.features?.length) {
    console.error('  ✗ No geocoding result');
    return null;
  }
  const f = data.features[0];
  const coords = f.geometry?.coordinates;
  if (!coords) {
    console.error('  ✗ No coordinates');
    return null;
  }
  const result = {
    lon: coords[0],
    lat: coords[1],
    label: f.properties?.label || query,
    banId: f.properties?.id || null,
  };
  console.log(`  ✓ ${result.label}`);
  console.log(`    ${result.lat.toFixed(5)}, ${result.lon.toFixed(5)}  banId: ${result.banId}`);
  return result;
}

/* ── Step 2: IGN Altitude ── */

async function fetchAltitude(lon, lat) {
  console.log('\n🏔  IGN Altitude…');
  const data = await fetchJson(`${IGN_ALTITUDE}?lon=${lon}&lat=${lat}&resource=ign_rge_alti_wld`, 8000, 1);
  // IGN API returns { elevations: [{ lon, lat, z, acc }] }
  const elev = data?.elevations?.[0]?.z ?? null;
  const slope = elev === null ? null : elev < 10 ? 'flat' : elev < 100 ? 'moderate' : 'steep';
  console.log(`  ✓ ${elev !== null ? `${elev}m (${slope})` : 'null'}`);
  return { altitude: elev, slope };
}

/* ── Step 3: Open-Meteo Climate ── */

async function fetchClimate(lon, lat) {
  console.log('\n🌤  Open-Meteo Climate…');
  const url = `${OPENMETEO}?latitude=${lat}&longitude=${lon}` +
    `&start_date=1950-01-01&end_date=2050-01-01` +
    `&daily=temperature_2m_min,temperature_2m_max,precipitation_sum,wind_speed_10m_max` +
    `&models=EC_Earth3P_HR`;
  // Wait for parallel batch to finish before hitting climate API
  await new Promise(r => setTimeout(r, 3000));
  const data = await fetchJson(url, 25000, 3);
  const days = data?.daily;
  if (!days?.time?.length) {
    console.log('  ⚠  No data');
    return null;
  }

  const times = days.time;
  const tempsMin = days.temperature_2m_min || [];
  const tempsMax = days.temperature_2m_max || [];
  const precip = days.precipitation_sum || [];
  const winds = days.wind_speed_10m_max || [];

  const computeStats = (mask) => {
    const daysInPeriod = mask.filter(Boolean).length;
    if (daysInPeriod < 30) return null;
    const freeze = tempsMin.filter((_, i) => mask[i] && tempsMin[i] < 0).length;
    const heatwave = tempsMax.filter((_, i) => mask[i] && tempsMax[i] > 35).length;
    const totalPrecip = precip.reduce((s, v, i) => s + (mask[i] ? (v ?? 0) : 0), 0);
    const maxWind = winds.reduce((max, w, i) => (mask[i] && w !== null && w > max ? w : max), 0);
    return {
      freezePerYear: Math.round((freeze / daysInPeriod) * 365),
      heatwavePerYear: Math.round((heatwave / daysInPeriod) * 365),
      annualPrecip: Math.round((totalPrecip / daysInPeriod) * 365),
      maxWind,
    };
  };

  const historicalMask = times.map(t => t >= '2000-01-01' && t <= '2014-12-31');
  const projectionMask = times.map(t => t >= '2040-01-01' && t <= '2050-01-01');
  const historical = computeStats(historicalMask);
  const projected = computeStats(projectionMask);

  const windToStorm = (max) => max > 100 ? 4 : max > 80 ? 3 : max > 60 ? 2 : 1;

  const result = {
    freezeDaysPerYear: historical?.freezePerYear ?? null,
    stormFrequency: historical ? windToStorm(historical.maxWind) : null,
    hailRisk: 1,
    annualPrecipitation: historical?.annualPrecip ?? null,
    heatwaveDaysPerYear: historical?.heatwavePerYear ?? null,
    windZone: historical ? windToStorm(historical.maxWind) : null,
    snowZone: 'A1',
    projectedFreezeDays: projected?.freezePerYear ?? null,
    projectedHeatwaveDays: projected?.heatwavePerYear ?? null,
    projectedPrecipitation: projected?.annualPrecip ?? null,
    projectedStormFrequency: projected ? windToStorm(projected.maxWind) : null,
    projectionModel: projected ? 'EC_Earth3P_HR' : null,
    projectionScenario: projected ? 'CMIP6 high-resolution (≈RCP8.5)' : null,
  };

  console.log(`  ✓ ${result.freezeDaysPerYear} freeze days/yr, ${result.annualPrecipitation}mm rain/yr`);
  return result;
}

/* ── Step 4: Géorisques v1 ── */

async function fetchGeorisques(lon, lat) {
  console.log('\n⚠️  Géorisques risks…');
  const data = await fetchJson(`${GEORISQUES_V1}/resultats_rapport_risque?latlon=${lon},${lat}`, 10000, 1);
  if (!data) {
    console.log('  ⚠  No data');
    return null;
  }

  const commune = data.commune?.libelle || null;
  const communeCode = data.commune?.codeInsee || null;

  const parseRiskGroup = (risks, isNatural) => {
    const result = {};
    for (const [key, val] of Object.entries(risks || {})) {
      const present = !!val?.present;
      let level = null;
      const raw = val?.libelleStatutAdresse || val?.libelleStatutCommune;
      if (raw) {
        const s = raw.toLowerCase();
        if (s.includes('fort') || s.includes('important')) level = 'fort';
        else if (s.includes('moyen')) level = 'moyen';
        else if (s.includes('faible')) level = 'faible';
      }
      result[key] = { present, level };
    }
    // Ensure ALL expected keys exist (different sets for natural vs techno)
    const allKeys = isNatural
      ? ['inondation', 'remonteeNappe', 'risqueCotier', 'seisme', 'mouvementTerrain',
         'retraitGonflementArgile', 'reculTraitCote', 'avalanche', 'feuForet',
         'eruptionVolcanique', 'cyclone', 'radon']
      : ['icpe', 'nucleaire', 'canalisationsMatieresDangereuses',
         'pollutionSols', 'ruptureBarrage', 'risqueMinier'];
    for (const k of allKeys) {
      if (!result[k]) result[k] = { present: false, level: null };
    }
    return result;
  };

  const naturels = parseRiskGroup(data.risquesNaturels, true);
  const technologiques = parseRiskGroup(data.risquesTechnologiques, false);

  const naturalCount = Object.values(naturels).filter(r => r.present).length;
  const technoCount = Object.values(technologiques).filter(r => r.present).length;

  console.log(`  ✓ ${commune} (${communeCode}) — ${naturalCount} naturaux, ${technoCount} technos`);
  return { naturels, technologiques, naturalCount, technoCount, commune, communeCode };
}

/* ── Step 5: BDNB building data ── */

async function fetchBdnbBuilding(banId) {
  console.log('\n🏢  BDNB building…');
  if (!banId) {
    console.log('  ⚠  No banId');
    return null;
  }

  // Strategy 1: relational lookup
  const relUrl = `${BDNB_BASE}/donnees/rel_batiment_groupe_adresse?cle_interop_adr=eq.${banId}&select=batiment_groupe_id`;
  const relData = await fetchJson(relUrl, 6000, 1);

  let records = null;

  if (Array.isArray(relData) && relData.length > 0) {
    const groupIds = relData.map(r => r.batiment_groupe_id).filter(Boolean);
    if (groupIds.length > 0) {
      const idsParam = groupIds.map(id => `"${id}"`).join(',');
      const bdgUrl = `${BDNB_BASE}/donnees/batiment_groupe_complet?batiment_groupe_id=in.(${idsParam})`;
      const bdgData = await fetchJson(bdgUrl, 6000, 1);
      if (bdgData) {
        records = Array.isArray(bdgData) ? bdgData : bdgData?.features || [];
      }
    }
  }

  // Strategy 2: fallback by commune code
  if (!records?.length && banId.length >= 5) {
    const communeCode = banId.slice(0, 5);
    console.log(`  ↳ Fallback by commune INSEE: ${communeCode}`);
    const fallbackUrl = `${BDNB_BASE}/donnees/batiment_groupe_complet?code_commune_insee=eq.${communeCode}&limit=5`;
    const fallbackData = await fetchJson(fallbackUrl, 8000, 1);
    if (fallbackData) {
      records = Array.isArray(fallbackData) ? fallbackData : fallbackData?.features || [];
    }
  }

  if (!records?.length) {
    console.log('  ⚠  No building data');
    return null;
  }

  const parseRecord = (rec) => {
    const props = rec.properties || rec;
    const year = props.annee_construction ?? null;
    const constructionPeriod =
      !year ? null
      : year < 1915 ? '<1915'
      : year <= 1948 ? '1915_1948'
      : year <= 1974 ? '1949_1974'
      : year <= 2000 ? '1975_2000'
      : year <= 2012 ? '2001_2012'
      : year <= 2021 ? '2013_2021'
      : '>2021';

    return {
      builtYear: year,
      constructionPeriod,
      surfaceUtile: props.surface_habitable ?? null,
      surfaceEmprise: props.surface_emprise_sol ?? null,
      levels: props.nb_niveau ?? null,
      height: props.hauteur_mean ?? props.hauteur ?? null,
      dpeClass: props.classe_bilan_dpe ?? null,
      energyConsumption: props.conso_energie ?? null,
      emissionGes: props.emission_ges ?? null,
      wallMaterial: props.mat_mur_txt && props.mat_mur_txt !== 'INDETERMINE' ? props.mat_mur_txt : null,
      roofMaterial: props.mat_toit_txt && props.mat_toit_txt !== 'INDETERMINE' ? props.mat_toit_txt : null,
      heatingType: props.etat_chauffage_txt && props.etat_chauffage_txt !== 'INDETERMINE' ? props.etat_chauffage_txt : null,
      usageType: props.usage_principal_bdnb_open ?? null,
      nbLogements: props.nb_logements ?? null,
      departmentCode: banId.slice(0, 2),
    };
  };

  const parsed = parseRecord(records[0]);
  console.log(`  ✓ ${parsed.builtYear} built, DPE ${parsed.dpeClass}, ${parsed.levels} levels, ${parsed.nbLogements} logements`);
  if (parsed.wallMaterial) console.log(`    Mur: ${parsed.wallMaterial}, Toit: ${parsed.roofMaterial}, Chauffage: ${parsed.heatingType}`);
  console.log(`    Usage: ${parsed.usageType}, ${parsed.surfaceEmprise}m² emprise`);
  return parsed;
}

/* ── Step X: IGN reverse geocoding → Cadastral parcel ── */

async function fetchCadastralParcel(lon, lat) {
  console.log('\n🗺  IGN Cadastral parcel…');
  const data = await fetchJson(`${IGN_GEOCODAGE}/reverse?lon=${lon}&lat=${lat}&index=parcel`, 6000, 1);
  const features = data?.features;
  if (!features?.length) {
    console.log('  ⚠  No parcel found');
    return null;
  }
  const rawId = features[0]?.properties?.id;
  if (!rawId || typeof rawId !== 'string' || rawId.length < 14) {
    console.log('  ⚠  Invalid parcel ID');
    return null;
  }
  // Reformat: "75102000AB0052" → "75102-000-AB-0052"
  const parcelId = `${rawId.slice(0, 5)}-${rawId.slice(5, 8)}-${rawId.slice(8, 10)}-${rawId.slice(10, 14)}`;
  const section = rawId.slice(8, 10);
  const number = rawId.slice(10, 14);
  console.log(`  ✓ ${parcelId} (${section}/${number})`);
  return parcelId;
}

/* ── Step X: Géorisques v2 enrichment ── */

async function fetchV2Enrichment(token, communeCode, cadastralParcelId, lon, lat) {
  console.log('\n🔬  Géorisques v2 enrichment…');
  if (!token) {
    console.log('  ⚠  No token — skipping');
    return null;
  }

  const headers = { Accept: 'application/json', Authorization: `Bearer ${token}` };

  // Argile: prefer per-parcel, fallback to commune
  let argileExposition = null;
  const parcelParam = cadastralParcelId ? `codesParcelle=${encodeURIComponent(cadastralParcelId)}` : null;
  const communeParam = communeCode ? `codesInsee=${encodeURIComponent(communeCode)}` : null;

  const argileParam = parcelParam || communeParam;
  if (argileParam) {
    const argileUrl = `${GEORISQUES_V2}/rga?${argileParam}`;
    const argileData = await fetchJsonWithHeaders(argileUrl, headers, 8000, 3);
    if (argileData?.content?.length) {
      argileExposition = argileData.content.map(r => ({
        code: parseInt(r.codeExposition, 10),
        label: r.exposition,
      }));
    }
  }

  // Delay between calls to avoid rate limiting
  await new Promise(r => setTimeout(r, 1000));

  // Cavités
  let cavitiesNearby = null;
  const cavUrl = `${GEORISQUES_V2}/cavites?longitude=${lon}&latitude=${lat}&size=1`;
  const cavData = await fetchJsonWithHeaders(cavUrl, headers, 8000, 3);
  if (cavData) cavitiesNearby = cavData?.totalElements ?? null;

  await new Promise(r => setTimeout(r, 1000));

  // Sites et Sols Pollués
  let pollutedSitesNearby = null;
  const sspUrl = `${GEORISQUES_V2}/ssp?longitude=${lon}&latitude=${lat}&size=1`;
  const sspData = await fetchJsonWithHeaders(sspUrl, headers, 8000, 3);
  if (sspData) pollutedSitesNearby = sspData?.totalElements ?? null;

  console.log(`  ✓ Argile: ${argileExposition ? argileExposition.length + ' zones' : 'N/A'}, Cavités: ${cavitiesNearby ?? 'N/A'}, SSP: ${pollutedSitesNearby ?? 'N/A'}`);
  return { argileExposition, cavitiesNearby, pollutedSitesNearby };
}

/** fetchJson with custom headers (for Bearer token) */
const fetchJsonWithHeaders = async (url, headers, timeoutMs = 8000, retries = 0) => {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { headers, signal: controller.signal });
      if (res.ok) return await res.json();
      if (res.status === 429 && attempt < retries) {
        const wait = 2000 * (attempt + 1);
        console.warn(`  ⏳ 429, retry ${attempt + 1}/${retries} after ${wait}ms`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      console.warn(`  ⚠  HTTP ${res.status} — ${url.slice(0, 80)}`);
      return null;
    } catch (err) {
      if (err?.name === 'AbortError' && attempt < retries) {
        const wait = 1000 * (attempt + 1);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      console.warn(`  ⚠  ${err?.message || err}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
};

/* ── Step 7: CATNAT ── */

async function fetchCatnat(communeCode) {
  console.log('\n📋  CATNAT history…');
  if (!communeCode) {
    console.log('  ⚠  No commune code');
    return [];
  }
  const raw = await fetchJson(`${GEORISQUES_V1}/gaspar/catnat?code_insee=${communeCode}`, 15000, 2);
  if (!raw) {
    console.log('  ⚠  No data');
    return [];
  }
  // API v1 returns paginated: { results: N, data: [...] }
  const records = raw?.data || (Array.isArray(raw) ? raw : []);
  // Normalise field names
  const normalised = records.map(r => ({
    date_arrete: r.date_publication_arrete || r.date_arrete,
    date_debut: r.date_debut_evt || r.date_debut,
  }));
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 10);
  const recent = normalised.filter(r => {
    const d = new Date(r.date_arrete || r.date_debut);
    return d >= cutoff;
  });
  console.log(`  ✓ ${recent.length} CATNAT(s) in last 10 years (${records.length} total)`);
  return recent;
}

/* ── Step 7: DVF department lookup ── */

function lookupDvf(deptCode) {
  const lookupPath = path.resolve(__dirname, '..', 'src', 'risk-assessment', 'lookup', 'departments.json');
  const data = JSON.parse(fs.readFileSync(lookupPath, 'utf-8'));
  const dept = data.departments?.[deptCode];
  if (!dept) return null;
  return {
    reconstructionValuePerSqm: dept.valuation.reconstructionValuePerSqm,
    lastTransactionPricePerSqm: dept.valuation.avgMarketPricePerSqm,
    lastTransactionDate: null,
    lastTransactionType: null,
  };
}

/* ── Step 8: DRIAS lookup ── */

function lookupDrias(deptCode) {
  try {
    const driasPath = path.resolve(__dirname, '..', 'src', 'risk-assessment', 'lookup', 'drias.json');
    const driasData = JSON.parse(fs.readFileSync(driasPath, 'utf-8'));
    const dept = driasData.departments?.[deptCode];
    if (!dept?.drias) return null;
    return {
      method: driasData.method || 'ADAMONT',
      warmingLevel: driasData.warmingLevel || '+4°C France (TRACC horizon 2050)',
      heatwaveDays: dept.drias.heatwaveDays ?? null,
      tropicalNights: dept.drias.tropicalNights ?? null,
      summerDays: dept.drias.summerDays ?? null,
      heavyPrecipDays: dept.drias.heavyPrecipDays ?? null,
      max5dayPrecip: dept.drias.max5dayPrecip ?? null,
      consecutiveDryDays: dept.drias.consecutiveDryDays ?? null,
      fireWeatherIndex: dept.drias.fireWeatherIndex ?? null,
      frostDays: dept.drias.frostDaysDrias ?? null,
      dataSource: dept.drias.dataSource ?? null,
    };
  } catch {
    return null;
  }
}

/* ═══════════════════════════════════════════════════════════════
   MAIN
   ═══════════════════════════════════════════════════════════════ */

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  LIVE RISK ASSESSMENT — 8 Rue de la Paix');
  console.log('═══════════════════════════════════════════\n');

  // 1. Geocode
  const geo = await geocodeAddress('8 Rue de la Paix 75002 Paris');
  if (!geo) { process.exit(1); }

  const deptCode = geo.banId ? geo.banId.slice(0, 2) : '75';
  const communeCode = geo.banId ? geo.banId.slice(0, 5) : null;

  // 2–6: Run all in parallel
  console.log('\n── Fetching providers ──');
  const [altitude, climate, risks, parcelId, building, catnat] = await Promise.all([
    fetchAltitude(geo.lon, geo.lat),
    fetchClimate(geo.lon, geo.lat),
    fetchGeorisques(geo.lon, geo.lat),
    fetchCadastralParcel(geo.lon, geo.lat),
    fetchBdnbBuilding(geo.banId),
    fetchCatnat(communeCode),
  ]);

  // Step X: Géorisques v2 enrichment (after parcel is resolved)
  let enrichment = null;
  if (GEORISQUES_V2_TOKEN) {
    enrichment = await fetchV2Enrichment(GEORISQUES_V2_TOKEN, communeCode, parcelId, geo.lon, geo.lat);
  }

  // 7–8: Local lookups
  console.log('\n── Local lookups ──');
  const dvf = lookupDvf(deptCode);
  console.log(`  ✓ DVF (${deptCode}): ${dvf?.reconstructionValuePerSqm ?? '—'} €/m² reconstruction`);

  const driasData = lookupDrias(deptCode);
  if (driasData) {
    console.log(`  ✓ DRIAS (${deptCode}): ${driasData.heatwaveDays} canicule days`);
  } else {
    console.log('  ⚠  DRIAS: not available');
  }

  // ── Assemble ──
  const today = new Date().toISOString().split('T')[0];

  const buildingData = building || {
    builtYear: null, constructionPeriod: null, surfaceUtile: null, surfaceEmprise: null,
    levels: null, height: null, dpeClass: null, energyConsumption: null,
    emissionGes: null, wallMaterial: null, roofMaterial: null, heatingType: null,
    usageType: null, nbLogements: null, departmentCode: deptCode,
  };

  const ignData = altitude || { altitude: null, slope: null };

  const result = {
    property: {
      ...buildingData,
      departmentCode: deptCode,
    },

    valuation: dvf ?? undefined,

    geography: {
      parcelId: parcelId || null,
      altitude: ignData.altitude,
      slope: ignData.slope,
      distanceToWaterway: null,
      distanceFireStation: null,
      landUse: 'urban',
    },

    risks: {
      naturels: risks?.naturels || createEmptyNaturalRisks(),
      technologiques: risks?.technologiques || createEmptyTechnoRisks(),
      commune: risks?.commune || null,
      communeCode: risks?.communeCode || communeCode || null,
      naturalRiskCount: risks?.naturalCount ?? 0,
      technoRiskCount: risks?.technoCount ?? 0,
      catnatLast10Years: catnat?.length ?? 0,
      pprApproved: true,
      enrichment: enrichment || undefined,
    },

    climate: {
      ...(climate || {
        freezeDaysPerYear: null, stormFrequency: null, hailRisk: null,
        annualPrecipitation: null, heatwaveDaysPerYear: null, windZone: null,
        snowZone: null, projectedFreezeDays: null, projectedHeatwaveDays: null,
        projectedPrecipitation: null, projectedStormFrequency: null,
        projectionModel: null, projectionScenario: null,
      }),
      drias: driasData ?? undefined,
    },

    metadata: {
      addressLabel: geo.label,
      longitude: geo.lon,
      latitude: geo.lat,
      communeName: risks?.commune || '',
      communeCode: risks?.communeCode || communeCode || '',
      assessmentDate: today,
      dataFreshness: {
        bdnb: building ? today : null,
        georisques: risks ? today : null,
        dvf: dvf ? today : null,
        ign: ignData.altitude ? today : null,
        openmeteo_climate: climate?.freezeDaysPerYear !== null ? today : null,
        drias: driasData ? today : null,
      },
    },
  };

  // ── Write output ──
  const outPath = path.resolve(__dirname, '..', 'src', 'risk-assessment', 'address-8-rue-paix.json');
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf-8');
  console.log(`\n✅ Written: ${outPath}`);
  console.log('────────────────────────────────────────');
  console.log(`  Address:     ${result.metadata.addressLabel}`);
  console.log(`  Coords:      ${result.metadata.latitude.toFixed(5)}, ${result.metadata.longitude.toFixed(5)}`);
  console.log(`  Building:    ${result.property.builtYear || '?'} built, DPE ${result.property.dpeClass || '?'}, ${result.property.levels || '?'} levels`);
  console.log(`  Altitude:    ${result.geography.altitude ?? '?'}m`);
  console.log(`  Risks:       ${result.risks.naturalRiskCount} naturaux, ${result.risks.technoRiskCount} technos, ${result.risks.catnatLast10Years} CATNAT`);
  console.log(`  Climate:     ${result.climate.freezeDaysPerYear ?? '?'} freeze/yr, ${result.climate.annualPrecipitation ?? '?'}mm/yr`);
  console.log(`  DVF:         ${result.valuation?.reconstructionValuePerSqm ?? '?'} €/m² reconstruction`);
  console.log(`  DRIAS:       ${driasData ? `${driasData.heatwaveDays} canicule days` : 'no data'}`);
  console.log(`  Providers:   ${[
    building && 'BDNB',
    risks && 'Géorisques',
    ignData.altitude !== null && 'IGN',
    climate && 'Open-Meteo',
    catnat && 'CATNAT',
    dvf && 'DVF',
    driasData && 'DRIAS',
  ].filter(Boolean).join(', ')}`);
  console.log('────────────────────────────────────────\n');
}

/* ── Empty risk factories ── */

function createEmptyNaturalRisks() {
  const keys = ['inondation', 'remonteeNappe', 'risqueCotier', 'seisme', 'mouvementTerrain',
    'retraitGonflementArgile', 'reculTraitCote', 'avalanche', 'feuForet',
    'eruptionVolcanique', 'cyclone', 'radon'];
  const obj = {};
  for (const k of keys) obj[k] = { present: false, level: null };
  return obj;
}

function createEmptyTechnoRisks() {
  const keys = ['icpe', 'nucleaire', 'canalisationsMatieresDangereuses',
    'pollutionSols', 'ruptureBarrage', 'risqueMinier'];
  const obj = {};
  for (const k of keys) obj[k] = { present: false, level: null };
  return obj;
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
