# Spec Delta: Product Scope — Prévia French Market Strategy

This file contains specification changes for `spec/specs/product-scope/spec.md`.

---

## Clarifications

### Session 2026-07-22

- Q: Should Prévia's risk scores reflect current (2026) climate hazard data, or also future projections? → A: **Future projections are required.** Insurance contracts run 1, 2, 5, and 10 years. A 10-year contract signed in 2026 must be priced against 2036 climate risk, not just today's. Risk scores MUST include projection horizons matched to the contract duration, using IPCC RCP scenarios (short-term: 2030, medium-term: 2040, long-term: 2050+).

- Q: How should the 5 Géorisques hazard dimensions be weighted in the composite risk score? → A: **Option B — Adaptive weighting, no formula yet defined.** The risk orchestrator (`risk-orchestrator.ts`) already fetches data from 8 parallel providers: Géorisques v1+v2, IGN Altitude, Open-Meteo (CMIP6), BDNB building, CATNAT/GASPAR history, DVF valuation, IGN WFS waterway distance, and IGN WFS forest distance. The DRIAS data (Explore2 2022, EC_Earth3P_HR model, +4°C TRACC 2050 scenario) is also included as a department-level lookup. The scoring formula must be designed to consume ALL of these inputs, not just the 5 Géorisques hazards. The formula is currently undefined and MUST be specified in a dedicated `add-risk-scoring-formula` proposal before implementation.

- Q: Should the risk scoring formula be specified in this proposal or a dedicated proposal? → A: **Option B — Dedicated proposal (`add-risk-scoring-formula`).** To maintain clean separation of concerns under SDD Principle VII, a separate proposal will be created to formally define the actuarial weighting matrix across all 8 data providers.

- Q: How detailed should the climate risk display be for the Assuré vs Assureur role? → A: **Option A — Role-differentiated display.** Assuré receives clear, accessible risk badges (Faible / Moyen / Élevé) with prevention guidance on "Mon Bien". Assureur accesses the full 8-provider diagnostic hub on `/risk-hub` (Open-Meteo CMIP6 data, DRIAS +4°C heatwave days, BDNB building parameters, WFS distances).

- Q: What trigger should unlock Phase 2 (Enterprises & Factories)? → A: **Option C — Parallel development.** Scaffolding for Phase 2 enterprise data models (`entreprise` contract type, SIRET/SIREN fields, ICPE risk fields) will be included in the data layer immediately alongside Phase 1 MRH work, allowing both domain models to grow together without breaking changes later.





---

## ADDED Requirements

### Requirement: Phase 1 — MRH Habitation as Primary Insurance Line

WHEN the platform is used by an assureur or assuré,
the system SHALL treat MRH (Multirisques Habitation) as the primary and fully-supported
insurance contract type, with complete risk intelligence sourced from the Géorisques v2 API.

#### Scenario: Assureur Views Enriched Property Risk Profile
GIVEN an assureur is logged in and has navigated to the Risk Hub (`/risk-hub`)
WHEN the assureur enters a French property address and triggers a risk assessment
THEN the system SHALL display a complete Géorisques risk profile covering:
  flood zone category, seismic zone (1–5), clay soil risk index, radon potential, and industrial proximity
AND the system SHALL compute a composite risk score (0–100) from these five hazard dimensions
AND the system SHALL display the risk score for multiple time horizons: **Current (2026)**, **2030**, **2040**, **2050**
AND display a French-language risk narrative suitable for client reporting

#### Scenario: Assureur Views Contract-Duration Matched Risk Projection
GIVEN an assureur is viewing a property risk assessment
AND the associated client contract has a duration (e.g. 5 years, expiring 2031)
WHEN the risk projection tab is shown
THEN the system SHALL highlight the projection horizon closest to the contract expiry date
AND display a delta indicator showing how the risk score is expected to change over the contract period
AND express this as a risk trend label: "Stable", "En hausse" (increasing), or "En forte hausse" (sharply increasing)

#### Scenario: Géorisques API Unavailable
GIVEN the assureur is on the Risk Hub
WHEN the Géorisques v2 API returns an error or timeout
THEN the system SHALL display a graceful error state card in French: "Données Géorisques temporairement indisponibles"
AND the system SHALL NOT crash or display a blank screen
AND the system SHALL still display any cached risk data from the DataStore if available

---

### Requirement: Climate Projection Horizons Matched to Contract Duration

WHEN an assureur generates a risk assessment for a property,
the system SHALL display climate risk projections for four time horizons:
- **Current (2026)**: Based on live Géorisques v2 API data
- **2030**: Short-term projection (IPCC RCP4.5/RCP8.5 scenario)
- **2040**: Medium-term projection — aligned with standard 10-year contract cycle
- **2050**: Long-term projection — aligned with French national climate adaptation plan (PNACC)

The system SHALL visually highlight the horizon that matches the client's contract expiry date,
so the assureur immediately understands the climate risk at end-of-contract.

#### Scenario: 1-Year Contract — Current Horizon Highlighted
GIVEN an assureur is pricing a 1-year MRH policy starting 2026-07-22
WHEN the risk projection panel is displayed
THEN the "Current (2026)" horizon SHALL be the primary reference
AND the "2030" horizon SHALL be shown as a secondary forward-looking indicator

#### Scenario: 10-Year Contract — Contract-End Risk Score
GIVEN an assureur is pricing a 10-year policy starting 2026-07-22 (expiry 2036)
WHEN the risk projection panel is displayed
THEN the system SHALL interpolate between the "2030" and "2040" horizons to estimate 2036 risk
AND display this interpolated score as the **Contract-End Risk Score**
AND flag properties where Contract-End Risk Score exceeds Current score by more than 15 points
as "Risque croissant — à surveiller" (growing risk — monitor)

#### Scenario: Climate Projection Data Unavailable
GIVEN the climate projection data source is unavailable
WHEN an assureur requests a projection-enabled risk assessment
THEN the system SHALL display the current Géorisques score normally
AND show a banner: "Projections climatiques temporairement indisponibles"
AND SHALL NOT block the risk assessment flow

---

### Requirement: Phase 1 — Complete Assuré MRH Self-Service Journey


WHEN an assuré logs into the platform and navigates to their property section (`/assure/*`),
the system SHALL provide a complete 4-tab self-service journey with meaningful, data-driven content.

#### Scenario: Assuré Views Their Property (Mon Bien)
GIVEN an assuré is logged in
WHEN the assuré navigates to the "Mon Bien" tab
THEN the system SHALL display their property address, DPE energy class, construction year,
  and Géorisques risk badges (one badge per hazard category with color-coded severity)
AND all data SHALL be sourced from the DataStore — no hardcoded DOM content

#### Scenario: Assuré Views Their Policy Engagement (Mon Engagement)
GIVEN an assuré is logged in
WHEN the assuré navigates to the "Mon Engagement" tab
THEN the system SHALL display: policy number, effective date, expiry date, annual premium,
  payment frequency, and payment method
AND the system SHALL highlight upcoming renewal if expiry is within 90 days

#### Scenario: Assuré Views Their Dossier (Mon Dossier)
GIVEN an assuré is logged in
WHEN the assuré navigates to the "Mon Dossier" tab
THEN the system SHALL render a document checklist showing each required document
  with a status chip: "Déposé" (complete) or "En attente" (pending)
AND documents SHALL be sourced from `DataStore.getDocuments(clientId)`

---

### Requirement: Phase 2 — SME & Enterprise Insurance (Future — Not in Phase 1 Scope)

IF the product roadmap progresses to Phase 2 (minimum 6 months post-Phase 1 launch),
the system SHALL support a new contract type `entreprise` with SIRET/SIREN identification,
ICPE risk layer overlay on the portfolio map, and multi-site portfolio management.

#### Scenario: Phase 2 Gating Condition
GIVEN Phase 1 is shipped and validated in production
WHEN the team evaluates Phase 2 readiness
THEN the team SHALL create a new proposal `add-enterprise-insurance` with its own spec-delta
AND SHALL NOT begin Phase 2 implementation before `add-enterprise-insurance` is approved

---

### Requirement: Graceful Degradation for Optional External APIs

WHEN any optional external API token (Mapbox, Géorisques) is absent or expired,
the system SHALL degrade gracefully to a functional fallback state without any JavaScript errors.

#### Scenario: Mapbox Token Absent
GIVEN `VITE_MAPBOX_TOKEN` is empty or not set in the `.env` file
WHEN any map view initializes
THEN the system SHALL automatically use the CARTO dark basemap via MapLibre GL
AND the user SHALL see no error and the map SHALL render normally

#### Scenario: Géorisques Token Expired
GIVEN the `VITE_GEORISQUES_V2_TOKEN` has expired (JWT exp claim in the past)
WHEN the Risk Hub attempts an API call
THEN the system SHALL catch the 401 HTTP error
AND display a localized French message: "Votre token Géorisques a expiré. Veuillez le renouveler sur georisques.gouv.fr."
AND SHALL log the error to the browser console for debugging

---

## MODIFIED Requirements

### Requirement: Property Entity — Enrich with Géorisques Fields
**Previous**: The `Property` interface contained only basic fields: `id`, `address`, `riskScore`, `riskLevel`, `dpeClass`, `builtYear`.

WHEN a Property entity is created or updated in the DataStore,
the system SHALL include a `georisques` sub-object containing:
- `floodZone: string` — AZI flood zone category (rouge / bleu / blanc / non concerné)
- `seismicZone: 1 | 2 | 3 | 4 | 5` — national seismic hazard zone
- `clayRiskIndex: 'faible' | 'moyen' | 'fort' | 'très fort'` — retrait-gonflement des argiles
- `radonPotential: 1 | 2 | 3` — radon gas potential (1=low, 3=high)
- `industrialRisk: boolean` — proximity to a Seveso or ICPE site

#### Scenario: Property Seeded with Géorisques Profile
GIVEN the DataStore seeds a new client property (e.g., address in Lyon)
WHEN the property is created in the DataStore constructor
THEN the `georisques` sub-object SHALL be populated with realistic values
  appropriate for the French geographic region of the property's city
AND the `riskScore` SHALL be recalculated to reflect the Géorisques fields

---

## Notes

- All new requirements in this delta are ADDED except "Property Entity" which is MODIFIED.
- Phase 2 requirement is gated and SHALL NOT trigger any implementation in the current sprint.
- All scenarios use French-language user-facing strings to align with the target market.
- ACPR compliance note: No personal data (PII) is persisted server-side — all data is
  in the in-memory DataStore. This avoids RGPD data processor obligations for this MVP.
