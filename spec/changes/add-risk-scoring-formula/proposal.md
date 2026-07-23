# Proposal: Multi-Provider Actuarial Climate Risk Scoring Formula

**Change ID**: `add-risk-scoring-formula`
**Date**: 2026-07-22
**Status**: Draft — Awaiting Actuarial & Technical Review
**Constitution**: v1.1.0 (Climate-First Risk Intelligence)

---

## Why

The `risk-orchestrator.ts` module fetches data from 8 parallel providers:
1. **Géorisques v1+v2**: 12 natural risks + 6 technological risks
2. **IGN Altimetry**: Elevation and terrain slope
3. **Open-Meteo CMIP6**: 100-year daily climate series (1950–2050)
4. **BDNB**: Building construction period, DPE, wall/roof materials, parcel IDs
5. **CATNAT / GASPAR**: 10-year natural disaster declaration history
6. **DVF**: Departmental real estate transaction values
7. **IGN WFS BD TOPO**: Waterway proximity (meters)
8. **IGN WFS Masque Forêt**: Forest proximity (meters)

Additionally, department-level **DRIAS / Explore2-2022** data (+4°C TRACC 2050 scenario) is integrated.

Currently, the composite `riskScore` (0–100) aggregation formula is undefined. To ensure actuarial credibility and fulfill Constitution Principle VIII (Climate-First Risk Intelligence), a formal multi-provider weighting formula MUST be specified.

---

## What Changes

- Specify an adaptive 8-provider weighting matrix that calculates:
  - `currentRiskScore` (0–100) based on 2026 baseline data
  - `projectedRiskScore2030` (0–100)
  - `projectedRiskScore2040` (0–100)
  - `projectedRiskScore2050` (0–100)
- Implement null-safe fallback handling for missing provider responses (e.g. BDNB unavailable).
- Define regional weighting adjustments (e.g. higher flood weight in river basins, higher clay weight in drought-prone departments).

---

## Impact

### Affected Code
- `src/risk-assessment/risk-orchestrator.ts` — Implement `calculateCompositeRiskScore()`
- `src/views/property-risk/` — Render 8-provider diagnostic breakdown
