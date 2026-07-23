/**
 * Lookup Service — DVF (valuation) + DRIAS (climate) by department
 * ==================================================================
 *
 * Both providers have no public REST API. DVF is published as CSV files
 * on data.gouv.fr, DRIAS as NetCDF files on the DRIAS portal.
 * We pre-load the most populated departments and serve them from JSON.
 *
 * === DVF ===
 * Source: MeilleursAgents, INSEE 2024-2025 estimates
 * Fields: reconstructionValuePerSqm, avgMarketPricePerSqm
 *
 * === DRIAS ===
 * Source: Explore2/DRIAS-2020, ADAMONT bias-correction, CMIP6 multi-model ensemble
 * Fields: heatwaveDays, tropicalNights, summerDays, heavyPrecipDays, etc.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DvfData } from '@previa/shared/schema';

const __dirname = dirname(fileURLToPath(import.meta.url));

/* ═══════════════════════════════════════════════════════════════
   JSON file loading
   ═══════════════════════════════════════════════════════════════ */

function loadJson(filename: string): any {
  const dir = join(__dirname, '..', '..', 'data');
  const path = join(dir, filename);
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, 'utf-8');
  return JSON.parse(raw);
}

let departmentsCache: any = null;
let driasCache: any = null;

function getDepartments(): any {
  if (!departmentsCache) {
    departmentsCache = loadJson('departments.json');
  }
  return departmentsCache;
}

function getDrias(): any {
  if (!driasCache) {
    driasCache = loadJson('drias.json');
  }
  return driasCache;
}

/* ═══════════════════════════════════════════════════════════════
   DVF Lookup
   ═══════════════════════════════════════════════════════════════ */

export interface DvfLookupResult {
  reconstructionValuePerSqm: number | null;
  lastTransactionPricePerSqm: number | null;
}

/**
 * Look up DVF valuation data by department INSEE code.
 * Returns department-level averages (not property-specific).
 */
export function lookupDvf(deptCode: string): DvfLookupResult | null {
  const data = getDepartments();
  if (!data) return null;

  const dept = data.departments?.[deptCode];
  if (!dept?.valuation) return null;

  return {
    reconstructionValuePerSqm: dept.valuation.reconstructionValuePerSqm ?? null,
    lastTransactionPricePerSqm: dept.valuation.avgMarketPricePerSqm ?? null,
  };
}

/* ═══════════════════════════════════════════════════════════════
   DRIAS Lookup
   ═══════════════════════════════════════════════════════════════ */

export interface DriasDepartmentData {
  heatwaveDays: number;
  tropicalNights: number;
  summerDays: number;
  heavyPrecipDays: number;
  max5dayPrecip: number;
  consecutiveDryDays: number;
  fireWeatherIndex: number;
  frostDaysDrias: number;
  dataSource: string;
  dataConfidence: 'high' | 'medium' | 'low';
}

export interface DriasLookupResult {
  drias: DriasDepartmentData;
  method: string;
  warmingLevel: string;
}

/**
 * Look up DRIAS ADAMONT-corrected climate indicators by department INSEE code.
 */
export function lookupDrias(deptCode: string): DriasLookupResult | null {
  const data = getDrias();
  if (!data) return null;

  const dept = data.departments?.[deptCode];
  if (!dept?.drias) return null;

  return {
    drias: { ...dept.drias },
    method: data.method || 'ADAMONT',
    warmingLevel: data.warmingLevel || '+4°C France (TRACC horizon 2050)',
  };
}
