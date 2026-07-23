/**
 * DRIAS Climate Indicators Lookup
 * ================================
 *
 * Pre-computed DRIAS ADAMONT bias-corrected climate projection indicators
 * for French departments. Data sourced from the Explore2/DRIAS-2020 portal.
 *
 * Like DVF, DRIAS has no public REST API — we pre-load corrected values
 * to avoid downloading NetCDF files at runtime.
 *
 * Usage:
 *   import { lookupDrias } from './drias.js';
 *   const data = lookupDrias('75');
 *   // data?.drias.heatwaveDays (DRIAS-corrected, not raw CMIP6)
 */

import raw from './drias.json' with { type: 'json' };

export interface DriasDepartmentData {
  /** Bias-corrected heatwave days (Tmax > 35°C) per year — horizon 2050 */
  heatwaveDays: number;
  /** Bias-corrected tropical nights (Tmin > 20°C) per year */
  tropicalNights: number;
  /** Bias-corrected summer days (Tmax > 25°C) per year */
  summerDays: number;
  /** Heavy precipitation days (> 20mm/day) per year */
  heavyPrecipDays: number;
  /** Maximum 5-day cumulative precipitation (mm) */
  max5dayPrecip: number;
  /** Maximum consecutive dry days (< 1mm) per year */
  consecutiveDryDays: number;
  /** Forest Fire Weather Index (maximum) */
  fireWeatherIndex: number;
  /** Bias-corrected frost days (Tmin < 0°C) per year */
  frostDaysDrias: number;
  /** Source dataset name */
  dataSource: string;
  /** Confidence level based on model agreement */
  dataConfidence: 'high' | 'medium' | 'low';
}

export interface DriasDepartmentInfo {
  name: string;
  region: string;
  population: number;
  drias: DriasDepartmentData;
}

export interface DriasLookupResult {
  dept: DriasDepartmentInfo;
  exact: boolean;
}

/**
 * Look up DRIAS ADAMONT-corrected indicators by department INSEE code.
 * Returns null if the department is not in the lookup table.
 */
export function lookupDrias(code: string): DriasLookupResult | null {
  const data = (raw as any).departments?.[code];
  if (!data) return null;

  return {
    dept: {
      name: data.name,
      region: data.region,
      population: data.population,
      drias: { ...data.drias },
    },
    exact: true,
  };
}

/**
 * Get all department codes available in the DRIAS lookup.
 */
export function listAvailableDepartments(): string[] {
  return Object.keys((raw as any).departments || {});
}

/**
 * Get the warming level and metadata for the DRIAS dataset.
 */
export function getDriasMetadata(): {
  method: string;
  warmingLevel: string;
  lastUpdated: string;
} {
  return {
    method: (raw as any).method || 'ADAMONT',
    warmingLevel: (raw as any).warmingLevel || '+4°C France (TRACC horizon 2050)',
    lastUpdated: (raw as any).lastUpdated || '2026-07-21',
  };
}
