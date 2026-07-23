/**
 * Department Lookup Service
 *
 * Provides DVF (property valuation) data by department code.
 * Data sourced from semi-annual CSV imports on data.gouv.fr.
 *
 * Usage:
 *   import { lookupDepartment } from './lookup.js';
 *   const dept = lookupDepartment('75');
 *   // dept.valuation.reconstructionValuePerSqm
 */

import raw from './departments.json' with { type: 'json' };
import type { DvfData } from '../schema.js';

export interface DepartmentInfo {
  name: string;
  region: string;
  population: number;
  valuation: DvfData;
}

export interface DepartmentLookupResult {
  dept: DepartmentInfo;
  /** Whether the data comes from precise department-level stats (true) or a regional fallback (false) */
  exact: boolean;
}

/**
 * Look up department data by INSEE department code.
 * Returns null if the department is not in the lookup table.
 */
export function lookupDepartment(code: string): DepartmentLookupResult | null {
  const data = (raw as any).departments?.[code];
  if (!data) return null;

  return {
    dept: {
      name: data.name,
      region: data.region,
      population: data.population,
      valuation: {
        reconstructionValuePerSqm: data.valuation.reconstructionValuePerSqm,
        lastTransactionPricePerSqm: data.valuation.avgMarketPricePerSqm,
        lastTransactionDate: null,
        lastTransactionType: null,
      },
    },
    exact: true,
  };
}

/**
 * Get all available department codes in the lookup table.
 */
export function listAvailableDepartments(): string[] {
  return Object.keys((raw as any).departments || {});
}

/**
 * Enrich a partial RiskAssessmentInput with department-level
 * valuation data (only if not already provided).
 */
export function enrichWithDepartmentData(
  departmentCode: string,
  target: { valuation?: DvfData },
): void {
  const result = lookupDepartment(departmentCode);
  if (!result) return;

  if (!target.valuation) {
    target.valuation = result.dept.valuation;
  }
}
