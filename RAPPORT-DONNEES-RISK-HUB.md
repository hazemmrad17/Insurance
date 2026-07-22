# Rapport — Cartographie des Données Risk Hub

**Date :** 22 juillet 2026  
**Auteur :** Agent collecteur (pipeline données)  
**Objet :** Inventaire complet des variables/paramètres par source, avec leur statut de récupération.

---

## Sommaire

1. [Résumé exécutif](#1-résumé-exécutif)
2. [Légende](#2-légende)
3. [Localisation et relief](#3-localisation-et-relief)
4. [Données climatiques](#4-données-climatiques)
5. [Zonages et phénomènes naturels](#5-zonages-et-phénomènes-naturels)
6. [Données bâtiment (BDNB)](#6-données-bâtiment-bdnb)
7. [Ce qui nécessite une saisie utilisateur](#7-ce-qui-nécessite-une-saisie-utilisateur)
8. [Rapport de synthèse](#8-rapport-de-synthèse)

---

## 1. Résumé exécutif

Notre pipeline de données utilise **8 providers API live** (dont 2 WFS Géoplateforme) + **2 lookups locaux** pour collecter automatiquement les informations d'une adresse. Sur ~60 variables identifiées dans le référentiel métier :

| Statut | Nb variables |
|---|---|
| ✅ **Déjà récupérées automatiquement** | 26 |
| ⚠️ **Récupérables via API (non implémenté)** | 8 |
| ❌ **Non récupérables via API publique** | 6 |
| 👤 **Nécessite saisie utilisateur/assureur** | ~15 |
| **Autres (calculées, dérivées)** | ~5 |

---

## 2. Légende

```
✅ RÉCUPÉRÉ    — Déjà implémenté dans le pipeline
⚠️ RÉCUPÉRABLE — L'API expose ces données, mais pas encore parsé
❌ NON DISPO   — Aucune API publique française ne fournit cette donnée
👤 SAISIE      — Doit être renseigné par l'utilisateur ou l'assureur
🧮 CALCULÉ     — Dérivé d'autres données (calcul local)
```

---

## 3. Localisation et relief

| Variable | Statut | Provider | Endpoint / Champ | Détails |
|---|---|---|---|---|
| **latitude / longitude** | ✅ RÉCUPÉRÉ | BAN | `api-adresse.data.gouv.fr/search/?q=...` | Géocodage à partir de l'adresse |
| **altitude du terrain** | ✅ RÉCUPÉRÉ | IGN Altimétrie | `data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json?lon=...&lat=...` | RGE ALTI, précision 1m |
| **pente** | ✅ RÉCUPÉRÉ | IGN (dérivé) | Calculé depuis altitude : `flat < 10m / moderate < 100m / steep` | Approximation simple |
| **orientation du terrain** | ⚠️ RÉCUPÉRABLE | IGN RGE ALTI 5m | Données disponibles via WCS, nécessite calcul local de l'aspect | Pas implémenté |
| **forme du relief** | ❌ NON DISPO | — | Classification (vallée, crête, plaine) | Pas d'API directe |
| **distance au cours d'eau** | ✅ **RÉCUPÉRÉ** | IGN BD TOPO WFS | `BDTOPO_V3:troncon_hydrographique` + `surface_hydrographique` via `data.geopf.fr/wfs/ows` | **681m** pour Paris 8e (Seine) |
| **distance à la forêt** | ✅ **RÉCUPÉRÉ** | IGN Masque Forêt WFS | `IGNF_MASQUE-FORET.2021-2023:masque_foret` via `data.geopf.fr/wfs/ows` | null pour Paris centre (aucune forêt dans 5km) |
| **distance au littoral** | ⚠️ RÉCUPÉRABLE | IGN BD TOPO | WFS BD TOPO — trait de côte | Pas implémenté |
| **occupation du sol** | ⚠️ RÉCUPÉRABLE | OCS GE (IGN) | WFS Géoplateforme — `OCSGE` | Pas implémenté |
| **imperméabilisation du sol** | ⚠️ RÉCUPÉRABLE | OCS GE (IGN) | Idem — taux d'artificialisation | Pas implémenté |

## Champs végétation — état des lieux

### ✅ Champs implémentés

| Champ | Source | Valeur (Paris 8e) | Statut |
|---|---|---|---|
| **`geography.distanceToForest`** | IGN WFS Masque Forêt | `null` (pas de forêt dans 5km) | ✅ **Implémenté** |
| **`risks.naturels.feuForet`** | Géorisques v1 | `{ present: false, level: null }` | ✅ **Implémenté** |
| **`climate.drias.fireWeatherIndex`** | DRIAS ADAMONT | `25` | ✅ **Implémenté** |
| **`climate.soilMoisture`** | Open-Meteo | `0.311 m³/m³` | ✅ **Implémenté** |

### ⚠️ Non implémenté (LiDAR HD trop lourd pour API REST)

Le **LiDAR HD** IGN classifie les points en végétation basse/moyenne/haute et produit un **MNH** (hauteur des arbres). Mais ce sont des dalles `.laz`/`.tif` de 1km×1km à télécharger — pas d'API REST pour une valeur ponctuelle. Pour la distance à la forêt, l'approche **WFS Masque Forêt** ci-dessus est plus adaptée.

### 🔜 À ajouter facilement (même pattern WFS)

| Donnée | Layer WFS | Priorité |
|---|---|---|
| **Type d'occupation du sol** (urbain/forestier/agricole) | `LANDCOVER.CLC18_FR` | 🟡 Moyenne |
| **Zones de débroussaillement** | `DEBROUSSAILLEMENT` | 🟢 Faible |
| **Haies et bocages** | `ADEME_EPCI_lineaire-haie-*` | 🟢 Faible |

---

## 4. Données climatiques

| Variable | Statut | Provider | Champ API | Valeur actuelle (Paris 8e) |
|---|---|---|---|---|
| **Température max** | ✅ RÉCUPÉRÉ | Open-Meteo Climate | `temperature_2m_max` | Utilisé pour heatwaveDaysPerYear |
| **Jours très chauds (>35°C)** | ✅ RÉCUPÉRÉ | Open-Meteo | Calculé | `0/an` (2000-2014), `1/an` (2050 projeté) |
| **Jours canicule (corrigé DRIAS)** | ✅ RÉCUPÉRÉ | DRIAS ADAMONT | Lookup local | `28/an` (horizon 2050) |
| **Nuits tropicales (corrigé DRIAS)** | ✅ RÉCUPÉRÉ | DRIAS ADAMONT | Lookup local | `22/an` |
| **Jours d'été (corrigé DRIAS)** | ✅ RÉCUPÉRÉ | DRIAS ADAMONT | Lookup local | `60/an` |
| **Jours de gel** | ✅ RÉCUPÉRÉ | Open-Meteo + DRIAS | Calculé + lookup | `46/an` (CMIP6), `15/an` (DRIAS) |
| **Précipitations annuelles** | ✅ RÉCUPÉRÉ | Open-Meteo | `precipitation_sum` | `634 mm` |
| **Fortes précip. (corrigé DRIAS)** | ✅ RÉCUPÉRÉ | DRIAS ADAMONT | Lookup local | `5/an` |
| **Max 5j précip. (corrigé DRIAS)** | ✅ RÉCUPÉRÉ | DRIAS ADAMONT | Lookup local | `48 mm` |
| **Jours secs consécutifs (corrigé DRIAS)** | ✅ RÉCUPÉRÉ | DRIAS ADAMONT | Lookup local | `22 j` |
| **Indice Feux Forêt (corrigé DRIAS)** | ✅ RÉCUPÉRÉ | DRIAS ADAMONT | Lookup local | `25` |
| **Fréquence tempêtes** | ✅ RÉCUPÉRÉ | Open-Meteo | Dérivé de `wind_speed_10m_max` | `1/5` |
| **Zone vent** | ✅ RÉCUPÉRÉ | Open-Meteo | Dérivé | `1/5` |
| **Zone neige** | ✅ RÉCUPÉRÉ | Open-Meteo | Valeur par défaut | `A1` |
| **Risque grêle** | ✅ RÉCUPÉRÉ | Open-Meteo | Valeur par défaut | `1/5` |
| **💧 Humidité relative moyenne** | ✅ RÉCUPÉRÉ **NOUVEAU** | Open-Meteo | `relative_humidity_2m_mean` | `77%` |
| **💧 Humidité relative max** | ✅ RÉCUPÉRÉ **NOUVEAU** | Open-Meteo | `relative_humidity_2m_max` | `91%` |
| **💧 Humidité relative min** | ✅ RÉCUPÉRÉ **NOUVEAU** | Open-Meteo | `relative_humidity_2m_min` | `60%` |
| **🌱 Humidité du sol 0-10cm** | ✅ RÉCUPÉRÉ **NOUVEAU** | Open-Meteo | `soil_moisture_0_to_10cm_mean` | `0.311 m³/m³` |
| **🌱 Humidité sol projetée 2050** | ✅ RÉCUPÉRÉ **NOUVEAU** | Open-Meteo | Calculé | `0.31 m³/m³` |
| **Fréquence/durée vagues de chaleur** | ⚠️ RÉCUPÉRABLE | Open-Meteo | À calculer des séries quotidiennes brutes | Pas implémenté |
| **Sécheresse cumulée** | ⚠️ RÉCUPÉRABLE | Open-Meteo | Calcul possible depuis `precipitation_sum` | Partiellement (DRIAS donnée) |
| **Évapotranspiration** | ❌ NON DISPO | — | Pas dans Climate API | Formule FAO possible |
| **Direction du vent** | ❌ NON DISPO | — | Pas dans Climate API | Uniquement vitesse |
| **Indices FWI / FFMC / DMC / DC / ISI / BUI** | ❌ NON DISPO | — | Pas dans Climate API | Disponible dans Historical API seulement |

---

## 5. Zonages et phénomènes naturels

| Variable | Statut | Provider | Détails |
|---|---|---|---|
| **Exposition RGA (argiles)** | ✅ RÉCUPÉRÉ | Géorisques v1 + v2 | v1: présent/level ; v2: code exposition par parcelle |
| **Nature géologique du sol** | ❌ NON DISPO | BRGM | Pas d'API REST simple (WFS/WMS lourd) |
| **PPRI / PPRL / PPR** | ✅ RÉCUPÉRÉ (partiel) | Géorisques v1 | Présence/absence seulement, pas le zonage détaillé |
| **Profondeur inondation** | ❌ NON DISPO | — | Pas d'API publique |
| **Zone submersion marine** | ✅ RÉCUPÉRÉ | Géorisques v1 | `risqueCotier: present` (booléen) |
| **Zonage sismique** | ✅ RÉCUPÉRÉ | Géorisques v1 | Niveau `faible / moyen / fort` |
| **Cavités** | ✅ RÉCUPÉRÉ | Géorisques v2 | Nombre de cavités à proximité |
| **Mouvements de terrain** | ✅ RÉCUPÉRÉ | Géorisques v1 | `mouvementTerrain: present` |
| **Zonage vent NV65** | ⚠️ PARTIEL | Eurocode | Actuellement dérivé grossièrement d'Open-Meteo |
| **Zonage neige NV65** | ⚠️ PARTIEL | Eurocode | Actuellement `A1` par défaut |
| **Historique incendies** | ❌ NON DISPO | Prométhée / IGN | Données existent mais pas d'API REST |
| **Historique CATNAT** | ✅ RÉCUPÉRÉ | Géorisques GASPAR | Comptage sur 10 ans |
| **Sites pollués** | ✅ RÉCUPÉRÉ | Géorisques v2 | Nombre de sites SSP à proximité |

---

## 6. Données bâtiment (BDNB)

### Champs déjà récupérés

| Variable | Champ BDNB | Valeur (Paris 8e) |
|---|---|---|
| **Année de construction** | `annee_construction` | 1850 |
| **Période de construction** | Dérivé | `<1915` |
| **Nombre de niveaux** | `nb_niveau` | 8 |
| **Hauteur** | `hauteur_mean` | 22 m |
| **Surface habitable** | `surface_habitable` | null (souvent null) |
| **Emprise au sol** | `surface_emprise_sol` | 1506 m² |
| **Classe DPE** | `classe_bilan_dpe` | D |
| **Conso énergie** | `conso_energie` | null |
| **Émissions GES** | `emission_ges` | null |
| **Matériau mur** | `mat_mur_txt` | PIERRE |
| **Matériau toit** | `mat_toit_txt` | ZINC ALUMINIUM |
| **Type chauffage** | `etat_chauffage_txt` | null |
| **Usage** | `usage_principal_bdnb_open` | Résidentiel collectif |
| **Nombre logements** | `nb_logements` | null |
| **Département** | `code_departement_insee` | 75 |

### Nouveaux champs BDNB — AJOUTÉS (22/07/2026)

| Variable | Champ BDNB | Valeur (Paris 8e) | Utilité |
|---|---|---|---|
| **📦 Logements (RNC)** | `nb_log` | **73** | Plus fiable que `nb_logements` (source RNC) |
| **🏺 Exposition argile** | `alea_argile` | null | Complémentaire à Géorisques v1 |
| **🏔 Altitude sol moyenne** | `altitude_sol_mean` | **34 m** | Complémentaire à IGN |
| **🔥 Énergie de chauffage** | `type_energie_chauffage` | **"reseau de chaleur"** | Pour le scoring énergétique |
| **📐 Parcelles cadastrales** | `l_parcelle_id` | **["75102000AB0048"]** | Liens vers parcelle |
| **🏙 Quartier prioritaire (QPV)** | `quartier_prioritaire` | null | Info politique de la ville |
| **🏛 Zone patrimoniale** | `zone_plu_bati_patrimonial` | **true** | Contrainte urbanisme |

### Taux de remplissage BDNB (estimé)

| Champ | Taux remplissage |
|---|---|
| `annee_construction` | ~70% (estimé pour les anciens) |
| `hauteur_mean`, `nb_niveau`, `surface_emprise_sol` | ~85% |
| `mat_mur_txt`, `mat_toit_txt` | ~70% |
| `classe_bilan_dpe` | ~40% |
| `surface_habitable`, `conso_energie` | ~30% (lié au DPE) |
| `nb_log` (RNC) | ~60% |
| `type_energie_chauffage` | ~40% |
| `alea_argile` | ~80% |
| `l_parcelle_id` | ~90% |
| `quartier_prioritaire` | ~95% |
| `zone_plu_bati_patrimonial` | ~95% |

---

## 7. Ce qui nécessite une saisie utilisateur

Ces données ne sont disponibles **dans aucune API publique française** et doivent être renseignées par l'utilisateur ou l'assureur :

### Données générales du bien

| Champ | Justification | Type attendu |
|---|---|---|
| **Type de bien** | BDNB donne usage mais pas distinction individuel/mitoyen | Menu (individuelle / mitoyenne / appartement / immeuble) |
| **Nombre de pièces** | Aucune base ne contient cette info | Champ libre |
| **Présence sous-sol / cave / vide sanitaire** | Pas collecté par la BDNB | Oui/Non/Ne sait pas |
| **Valeur assurée / capital bâtiment** | Donnée privée de l'assureur | Champ libre (€) |
| **Historique de sinistres** | Donnée privée de l'assureur | Liste/texte |
| **Travaux de rénovation** | Aucune base publique | Texte libre + factures |

### Spécifique inondation

| Champ | Justification |
|---|---|
| **Hauteur plancher habitable** | Critique — la courbe de dommage utilise la hauteur d'eau au-dessus du plancher |
| **Présence clapet anti-retour** | Protection connue |
| **Équipements électriques au niveau bas** | Vulnérabilité |

### Spécifique RGA (argile)

| Champ | Justification |
|---|---|
| **Profondeur des fondations** | Si connue (facture, permis) |
| **Fissures existantes** | Évolution temporelle |
| **Arbres proches** | Distance + hauteur |
| **Fuite de canalisation connue** | Facteur aggravant |

### Spécifique feu de forêt

| Champ | Justification |
|---|---|
| **Débroussaillement réalisé** | Obligation légale |
| **Accès pompiers** | Critique |
| **Réserve d'eau** | Dispositif de protection |

### Spécifique tempête

| Champ | Justification |
|---|---|
| **Âge et état de la toiture** | Vulnérabilité |
| **Panneaux solaires / antennes** | Vulnérabilité |
| **Véranda / abri léger** | Vulnérabilité |

---

## 8. Rapport de synthèse

### Ce qu'on récupère automatiquement (✅ 26 variables)

**Via API live :**
- BAN : coordonnées GPS + banId
- IGN Altimétrie : altitude + pente (dérivée)
- IGN Géocodage : parcelle cadastrale
- **IGN WFS BD TOPO** : distance au cours d'eau le plus proche (mètres)
- **IGN WFS Masque Forêt** : distance à la forêt la plus proche (mètres)
- Open-Meteo Climate : températures (min/max), précipitations, vent, **humidité**, **humidité du sol**, jours de gel, canicule, projections 2050
- Géorisques v1 : 12 risques naturels (présence/niveau), 6 technos, commune, CATNAT
- Géorisques v2 (si token) : argile par parcelle, cavités, sites pollués
- BDNB : 22 champs bâtiment (dont 7 nouveaux ajoutés)
- CATNAT (GASPAR) : historique des arrêtés

**Via lookup local :**
- DVF : valeur reconstruction, prix marché
- DRIAS : 10 indicateurs climatiques corrigés (ADAMONT)

### Ce qui est récupérable mais pas encore fait (⚠️ 8 variables)

Priorité haute :
1. **Durée des vagues de chaleur** — Recalcul depuis les séries Open-Meteo brutes

Priorité moyenne :
2. **Distance au littoral** — IGN BD TOPO WFS (même pattern que cours d'eau)
3. **Orientation du terrain** — RGE ALTI (calcul d'aspect)
4. **Occupation du sol** — OCS GE WFS
5. **Zonage vent NV65** — Table de correspondance communale

Priorité faible :
6. **Évapotranspiration** — Formule FAO Penman-Monteith
7. **Indices FWI** — Calcul manuel depuis variables climatiques (formule publique)
8. **Géologie du sol** — WFS BRGM

### Ce qui n'est pas récupérable via API (❌ 6 variables)

1. Direction du vent (pas dans Climate API)
2. Profondeur d'inondation par période de retour
3. Historique des incendies (pas d'API REST)
4. Valeur assurée / capital (donnée privée)
5. Nombre de pièces (aucune base)
6. Forme du relief (calcul DEM complexe)

### Ce qui nécessite saisie utilisateur (👤 ~15 questions)

Voir section 7 ci-dessus. Le principe directeur : **ne jamais demander deux fois une information déjà connue** (via BDNB ou autre provider).

---

## Annexe — Providers utilisés

| Provider | API | Auth | Type | Statut |
|---|---|---|---|---|
| BAN | `api-adresse.data.gouv.fr` | None | Live | ✅ |
| BDNB | `api.bdnb.io/v1/bdnb` | None | Live | ✅ |
| Géorisques v1 | `georisques.gouv.fr/api/v1` | None | Live | ✅ |
| Géorisques v2 | `georisques.gouv.fr/api/v2` | Bearer token | Live | ✅ (si token) |
| IGN Altitude | `data.geopf.fr/altimetrie/1.0` | None | Live | ✅ |
| IGN Géocodage | `data.geopf.fr/geocodage` | None | Live | ✅ |
| IGN WFS Géoplateforme | `data.geopf.fr/wfs/ows` | None | Live | ✅ (eau + forêt) |
| Open-Meteo Climate | `climate-api.open-meteo.com/v1/climate` | None | Live | ✅ |
| DVF | `departments.json` (local) | — | Local | ✅ |
| DRIAS | `drias.json` (local) | — | Local | ✅ |

---

*Document généré le 22 juillet 2026 — Source : pipeline Risk Orchestrator v1*
