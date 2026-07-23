/**
 * BDNB Building Data Service — Server-side fetcher
 */
import type { BuildingData } from '@previa/shared/schema';

function constructionPeriod(year: number | null): BuildingData['constructionPeriod'] {
  if (!year) return null;
  if (year < 1915) return '<1915';
  if (year <= 1948) return '1915_1948';
  if (year <= 1974) return '1949_1974';
  if (year <= 2000) return '1975_2000';
  if (year <= 2012) return '2001_2012';
  if (year <= 2021) return '2013_2021';
  return '>2021';
}

export async function fetchBuildingByBanId(banId: string): Promise<BuildingData> {
  const deptCode = banId.slice(0, 2);
  const empty: BuildingData = {
    builtYear: null, constructionPeriod: null, surfaceUtile: null, surfaceEmprise: null,
    levels: null, height: null, dpeClass: null, energyConsumption: null,
    emissionGes: null, wallMaterial: null, roofMaterial: null, heatingType: null,
    usageType: null, nbLogements: null, departmentCode: deptCode,
    nbLogementsRnc: null, clayExposure: null, altitudeSolMean: null,
    heatingEnergyType: null, parcelIds: null, quartierPrioritaire: null,
    zonePatrimoniale: null,
  };

  try {
    const url = `https://api.bdnb.io/v1/bdnb/donnees/rel_batiment_groupe_adresse?cle_interop_adr=eq.${banId}&select=batiment_groupe_id`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (res.ok) {
      const relData = await res.json();
      const groupIds: string[] = (Array.isArray(relData) ? relData : [])
        .map((r: any) => r.batiment_groupe_id)
        .filter(Boolean);

      if (groupIds.length > 0) {
        const idsParam = groupIds.map((id: string) => `"${id}"`).join(',');
        const bdgUrl = `https://api.bdnb.io/v1/bdnb/donnees/batiment_groupe_complet?batiment_groupe_id=in.(${idsParam})`;
        const bdgRes = await fetch(bdgUrl, { headers: { Accept: 'application/json' } });
        if (bdgRes.ok) {
          const bdgData = await bdgRes.json();
          const arr = Array.isArray(bdgData) ? bdgData : bdgData?.features || [];
          if (arr.length > 0) {
            const props = arr[0].properties || arr[0];
            const year = props.annee_construction ?? null;
            return {
              builtYear: year,
              constructionPeriod: constructionPeriod(year),
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
              departmentCode: deptCode,
              nbLogementsRnc: props.nb_log ?? null,
              clayExposure: props.alea_argile && props.alea_argile !== 'INDETERMINE' ? props.alea_argile : null,
              altitudeSolMean: props.altitude_sol_mean ?? null,
              heatingEnergyType: props.type_energie_chauffage ?? null,
              parcelIds: Array.isArray(props.l_parcelle_id) ? props.l_parcelle_id : null,
              quartierPrioritaire: props.quartier_prioritaire === true || props.quartier_prioritaire === 'true',
              zonePatrimoniale: props.zone_plu_bati_patrimonial ?? null,
            };
          }
        }
      }
    }
  } catch {
    // Ignore error and return empty fallback
  }

  return empty;
}
