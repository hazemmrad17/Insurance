# Data Dictionary — Risk Assessment Pipeline

**Date :** 22 juillet 2026
**Version :** 1.0
**Providers :** 8 APIs live + 2 lookups locaux
**Variables total :** ~55

---

## Structure du document

Chaque champ est documenté avec :
- **Provider** : API source
- **Endpoint** : URL ou service utilisé
- **Type** : Type de données (number, string, boolean)
- **Typical** : Valeur typique pour un bien Parisien
- **Remplissage** : Taux de remplissage estimé

---

# 1. PROPERTY — Données bâtiment (BDNB)

**Provider :** Base Nationale des Bâtiments (api.bdnb.io/v1/bdnb)
**Endpoint :** `batiment_groupe_complet?batiment_groupe_id=in.(...)`
**Lookup relationnel :** `rel_batiment_groupe_adresse?cle_interop_adr=eq.{banId}`

## Champs de base (existants)

| Champ | BDNB Field | Type | Exemple (Paris) | Remplissage |
|---|---|---|---|---|
| `builtYear` | `annee_construction` | `number | null` | 1850 | ~70% |
| `constructionPeriod` | Dérivé de `annee_construction` | `'<1915'\|'1915_1948'\|'1949_1974'\|'1975_2000'\|'2001_2012'\|'2013_2021'\|'>2021'\|null` | `<1915` | ~70% |
| `surfaceUtile` | `surface_habitable` | `number | null` | null (lié au DPE) | ~30% |
| `surfaceEmprise` | `surface_emprise_sol` | `number | null` | 1506 m² | ~85% |
| `levels` | `nb_niveau` | `number | null` | 8 | ~85% |
| `height` | `hauteur_mean` | `number | null` | 22 m | ~85% |
| `dpeClass` | `classe_bilan_dpe` | `string | null` | "D" | ~40% |
| `energyConsumption` | `conso_energie` | `number | null` | null | ~30% |
| `emissionGes` | `emission_ges` | `number | null` | null | ~30% |
| `wallMaterial` | `mat_mur_txt` | `string | null` | "PIERRE" | ~70% |
| `roofMaterial` | `mat_toit_txt` | `string | null` | "ZINC ALUMINIUM - AUTRES" | ~70% |
| `heatingType` | `etat_chauffage_txt` | `string | null` | null | ~40% |
| `usageType` | `usage_principal_bdnb_open` | `string | null` | "Résidentiel collectif" | ~90% |
| `nbLogements` | `nb_logements` | `number | null` | null | ~40% |
| `departmentCode` | `code_departement_insee` | `string | null` | "75" | ~100% |

## Nouveaux champs BDNB (ajoutés 22/07/2026)

| Champ | BDNB Field | Type | Exemple (Paris) | Remplissage |
|---|---|---|---|---|
| `nbLogementsRnc` | `nb_log` | `number | null` | 73 | ~60% |
| `clayExposure` | `alea_argile` | `string | null` | null (Paris centre) | ~80% |
| `altitudeSolMean` | `altitude_sol_mean` | `number | null` | 34 m | ~85% |
| `heatingEnergyType` | `type_energie_chauffage` | `string | null` | "reseau de chaleur" | ~40% |
| `parcelIds` | `l_parcelle_id` | `string[] | null` | ["75102000AB0048"] | ~90% |
| `quartierPrioritaire` | `quartier_prioritaire` | `boolean | null` | null (false le plus souvent) | ~95% |
| `zonePatrimoniale` | `zone_plu_bati_patrimonial` | `string\|boolean\|null` | true | ~95% |

---

# 2. VALUATION — Valorisation (DVF)

**Provider :** Lookup local (`departments.json`)
**Endpoint :** Import depuis `data.gouv.fr` (CSVs DVF semi-annuels)
**Couverture :** 10 départements les plus peuplés

| Champ | Type | Exemple (Paris 75) | Notes |
|---|---|---|---|
| `reconstructionValuePerSqm` | `number | null` | 2800 €/m² | Coût de reconstruction estimé |
| `lastTransactionPricePerSqm` | `number | null` | 10500 €/m² | Prix de marché moyen |
| `lastTransactionDate` | `string | null` | null | Date dernière transaction connue |
| `lastTransactionType` | `string | null` | null | Type (vente, donation…) |

---

# 3. GEOGRAPHY — Géographie (IGN + WFS)

## Champs IGN Altimétrie

**Provider :** IGN Géoplateforme
**Endpoint :** `data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json`

| Champ | Source | Type | Exemple (Paris) |
|---|---|---|---|
| `altitude` | IGN RGE ALTI | `number | null` | 34.19 m |
| `slope` | Dérivé d'altitude | `'flat'\|'moderate'\|'steep'\|null` | "moderate" |

## Champs IGN Géocodage

**Provider :** IGN Géoplateforme
**Endpoint :** `data.geopf.fr/geocodage/reverse?index=parcel`

| Champ | Source | Type | Exemple (Paris) |
|---|---|---|---|
| `parcelId` | IGN Reverse Geocoding | `string | null` | "75102-000-AB-0047" |

## Nouveaux champs WFS Distance (ajoutés 22/07/2026)

**Provider :** IGN Géoplateforme WFS
**Endpoint :** `data.geopf.fr/wfs/ows`

**Mécanisme :** Requête WFS 2.0 avec BBOX (5km), récupération des features en GeoJSON, calcul de distance Haversine point → géométrie (minimum).

### Distance au cours d'eau

| Champ | Type Layer WFS | Type | Exemple (Paris) |
|---|---|---|---|
| `distanceToWaterway` | `BDTOPO_V3:troncon_hydrographique` (lignes) + `BDTOPO_V3:surface_hydrographique` (polygones) | `number | null` | 681 m (Seine) |

### Distance à la forêt

| Champ | Type Layer WFS | Type | Exemple (Paris) |
|---|---|---|---|
| `distanceToForest` | `IGNF_MASQUE-FORET.2021-2023:masque_foret` (polygones, filtre `nature='Forêt'`) | `number | null` | null (aucune forêt dans 5km) |

### Autres

| Champ | Source | Type | Exemple |
|---|---|---|---|
| `distanceFireStation` | Non implémenté | `number | null` | null |
| `landUse` | Valeur par défaut | `string | null` | "urban" |

---

# 4. RISKS — Risques (Géorisques v1 + v2)

## Risques naturels

**Provider :** Géorisques v1 (no auth)
**Endpoint :** `georisques.gouv.fr/api/v1/resultats_rapport_risque?latlon={lon},{lat}`

Chaque risque a : `{ present: boolean, level: 'faible'|'moyen'|'fort'|'tres_fort'|null }`

| Risque | Clé | Level Paris | Notes |
|---|---|---|---|
| Inondation | `inondation` | null (présent mais pas de niveau) | API retourne "Risque Existant" |
| Remontée de nappe | `remonteeNappe` | null | |
| Risque côtier | `risqueCotier` | null | |
| Séisme | `seisme` | "faible" | ✅ Niveau présent |
| Mouvement de terrain | `mouvementTerrain` | null | |
| Retrait gonflement argiles | `retraitGonflementArgile` | null | API dit "Risque non Connu" à l'adresse |
| Recul trait de côte | `reculTraitCote` | null | |
| Avalanche | `avalanche` | null | |
| Feu de forêt | `feuForet` | null | |
| Volcan | `eruptionVolcanique` | null | |
| Vent violent | `cyclone` | null | |
| Radon | `radon` | "faible" | ✅ Niveau présent |

## Risques technologiques

| Risque | Clé | Level Paris |
|---|---|---|
| ICPE | `icpe` | null |
| Nucléaire | `nucleaire` | null |
| Canalisations mat. dangereuses | `canalisationsMatieresDangereuses` | null |
| Pollution des sols | `pollutionSols` | null |
| Rupture de barrage | `ruptureBarrage` | null |
| Risques miniers | `risqueMinier` | null |

## Enrichissement v2 (token requis)

**Provider :** Géorisques v2 (Bearer token)
**Endpoints :** `/api/v2/rga`, `/api/v2/cavites`, `/api/v2/ssp`

| Champ | Endpoint v2 | Type | Exemple |
|---|---|---|---|
| `argileExposition` | `/rga?codesParcelle=` | `{code,label}[] | null` | null (rate-limité) |
| `cavitiesNearby` | `/cavites?longitude=&latitude=` | `number | null` | 0 |
| `pollutedSitesNearby` | `/ssp?longitude=&latitude=` | `number | null` | null (rate-limité) |

## CATNAT

**Provider :** Géorisques GASPAR
**Endpoint :** `/api/v1/gaspar/catnat?code_insee=`

| Champ | Type | Exemple |
|---|---|---|
| `catnatLast10Years` | `number | null` | 0 (Paris) |
| `pprApproved` | `boolean` | true |

---

# 5. CLIMATE — Climat (Open-Meteo CMIP6 + DRIAS)

## Open-Meteo Climate API

**Provider :** Open-Meteo
**Endpoint :** `climate-api.open-meteo.com/v1/climate?latitude={lat}&longitude={lon}&models=EC_Earth3P_HR`
**Variables daily :** `temperature_2m_min,max,mean`, `precipitation_sum`, `wind_speed_10m_max`, `relative_humidity_2m_mean,max,min`, `soil_moisture_0_to_10cm_mean`
**Période :** 1950–2050
**Baseline historique :** 2000–2014
**Projection :** 2040–2050

### Indicateurs historiques (moyenne 2000–2014)

| Champ | Calcul | Type | Exemple (Paris) |
|---|---|---|---|
| `freezeDaysPerYear` | Jours avec Tmin < 0°C | `number | null` | 46 |
| `heatwaveDaysPerYear` | Jours avec Tmax > 35°C | `number | null` | 0 |
| `annualPrecipitation` | Précipitations annuelles moyennes (mm) | `number | null` | 634 |
| `stormFrequency` | Dérivé de vent max (1-5) | `number | null` | 1 |
| `hailRisk` | Valeur par défaut (1-5) | `number | null` | 1 |
| `windZone` | Dérivé de vent max (1-5) | `number | null` | 1 |
| `snowZone` | Valeur par défaut | `string | null` | "A1" |
| `meanHumidity` | Humidité relative moyenne (%) | `number | null` | 77 |
| `maxHumidity` | Humidité relative max moyenne (%) | `number | null` | 91 |
| `minHumidity` | Humidité relative min moyenne (%) | `number | null` | 60 |
| `soilMoisture` | Humidité sol 0-10cm (m³/m³) | `number | null` | 0.311 |

### Indicateurs projetés (2040–2050)

| Champ | Type | Exemple (Paris) |
|---|---|---|
| `projectedFreezeDays` | `number | null` | 33 |
| `projectedHeatwaveDays` | `number | null` | 1 |
| `projectedPrecipitation` | `number | null` | 660 |
| `projectedStormFrequency` | `number | null` | 1 |
| `projectedSoilMoisture` | `number | null` | 0.31 |
| `projectionModel` | `string | null` | "EC_Earth3P_HR" |
| `projectionScenario` | `string | null` | "CMIP6 high-resolution (≈RCP8.5)" |

## DRIAS ADAMONT (correction de biais)

**Provider :** Lookup local (`drias.json`)
**Source :** DRIAS-Explore2 / ADAMONT sur SAFRAN (1959-2019)
**Horizon :** 2041–2070 (+4°C France TRACC 2050)
**Couverture :** 10 départements

| Champ | Type | Exemple (Paris 75) |
|---|---|---|
| `method` | `string` | "Bias-correction ADAMONT sur SAFRAN…" |
| `warmingLevel` | `string` | "+4°C France (TRACC horizon 2050)" |
| `heatwaveDays` | `number | null` | 28/an |
| `tropicalNights` | `number | null` | 22/an |
| `summerDays` | `number | null` | 60/an |
| `heavyPrecipDays` | `number | null` | 5/an |
| `max5dayPrecip` | `number | null` | 48 mm |
| `consecutiveDryDays` | `number | null` | 22 j |
| `fireWeatherIndex` | `number | null` | 25 |
| `frostDays` | `number | null` | 15/an |
| `dataSource` | `string | null` | "explore2-climat-2022" |

---

# 6. METADATA

| Champ | Source | Type | Exemple |
|---|---|---|---|
| `addressLabel` | BAN Géocodage | `string` | "8 Rue de la Paix 75002 Paris" |
| `longitude` | BAN Géocodage | `number` | 2.330992 |
| `latitude` | BAN Géocodage | `number` | 48.868831 |
| `communeName` | Géorisques v1 | `string` | "Paris" |
| `communeCode` | Géorisques v1 | `string` | "75056" |
| `assessmentDate` | Date du jour | `string` | "2026-07-22" |
| `dataFreshness.*` | Par provider | `string | null` | "2026-07-22" |

---

# Annexe — Providers références

| Provider | API URL | Auth | docs |
|---|---|---|---|
| BAN | `api-adresse.data.gouv.fr/search/` | None | [Doc](https://adresse.data.gouv.fr/api-doc) |
| BDNB | `api.bdnb.io/v1/bdnb/donnees/` | None | [Doc](https://bdnb.io/documentation/modele_donnees/) |
| Géorisques v1 | `georisques.gouv.fr/api/v1/` | None | [Doc](https://www.georisques.gouv.fr/doc-api) |
| Géorisques v2 | `georisques.gouv.fr/api/v2/` | Bearer token | [Doc](https://www.georisques.gouv.fr/doc-api) |
| IGN Altimétrie | `data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json` | None | [Doc](https://geoservices.ign.fr/documentation) |
| IGN Géocodage | `data.geopf.fr/geocodage/reverse` | None | [Doc](https://geoservices.ign.fr/documentation) |
| IGN WFS | `data.geopf.fr/wfs/ows` | None | [Doc](https://cartes.gouv.fr/aide/) |
| Open-Meteo Climate | `climate-api.open-meteo.com/v1/climate` | None | [Doc](https://open-meteo.com/en/docs/climate-api) |
| DVF (local) | `departments.json` | — | data.gouv.fr |
| DRIAS (local) | `drias.json` | — | drias-climat.fr |

---

*Document généré depuis le pipeline Risk Orchestrator v1 — 22 juillet 2026*
