# Implementation Tasks — Prévia Product Strategy (Phase 1: MRH Habitation)

**Change ID**: `add-previa-product-strategy`
**Scope**: Phase 1 tasks only — MRH habitation focus for the French market.

---

## Phase 1: Foundation — Enrich Data Model with Géorisques Fields

- [x] 1. Add `georisques` risk profile sub-object to the `Property` interface in `src/data.ts`:
   - `floodZone: string` (Zones AZI: rouge, bleu, blanc)
   - `seismicZone: 1 | 2 | 3 | 4 | 5`
   - `clayRiskIndex: 'faible' | 'moyen' | 'fort' | 'très fort'`
   - `radonPotential: 1 | 2 | 3`
   - `industrialRisk: boolean`

- [x] 2. Seed the `DataStore` with realistic Géorisques values for all existing mock properties
   (use real French cities: Lyon, Bordeaux, Marseille — each with distinct risk profiles).

- [x] 3. Update the `Assessment` interface in `src/data.ts` to include a `georisquesSnapshot` field
   capturing the risk profile at time of assessment.

- [x] 3b. [P] Scaffold Enterprise / Industrial Data Model in `src/data.ts`:
    - Add `'entreprise'` to `ContractType` union (`'mrh' | 'auto' | 'pro' | 'vie' | 'sante' | 'entreprise'`)
    - Add optional `siret?: string` and `companyName?: string` fields to `Client` interface
    - Add optional `icpeClassification?: string` and `sevesoStatus?: 'non_seveso' | 'seveso_seuil_bas' | 'seveso_seuil_haut'` fields to `Property` interface



---

## Phase 2: Core Implementation — Risk Hub Enhancement

4. Extend `src/views/property-risk/` Locate tab to call the live Géorisques v2 API for a
   queried address and display the full 5-hazard risk card (flood, seismic, clay, radon, industrial).

5. Build a risk score aggregation function in `property-risk` that maps Géorisques API response
   to a single composite `riskScore` (0-100) matching the existing `Property.riskScore` field.

6. Update the Expert tab in `property-risk` to show a structured risk narrative in French,
   suitable for an insurance advisor to copy into a client report.

7. Update the Inspect tab to display a Géorisques-sourced risk heatmap overlay on the MapLibre
   map (use the `georisques.gouv.fr/mapservices` WMS layers).

8. Update the Evaluate tab to show premium impact guidance based on risk score bands
   (e.g., score > 70 → high-risk surcharge indicator, not a real premium calculation).

---

## Phase 3: Assuré Journey — Complete the 4 MRH Tabs

- [x] 9. **Mon Bien tab** (`assure-bien`): Display property details (address, DPE class, built year,
   Géorisques risk badges) pulled from `DataStore.getProperty()`.

- [x] 10. **Mes Travaux tab** (`assure-travaux`): Show a works timeline with status chips
    (planned / in progress / completed) — seeded from mock data in `DataStore`.

- [x] 11. **Mon Engagement tab** (`assure-engagement`): Display contract summary — policy number,
    effective/expiry dates, annual premium, payment method from `DataStore.getClient()`.

- [x] 12. **Mon Dossier tab** (`assure-dossier`): Render a document list using `DataStore.getDocuments()`
    — showing status chips (complete / pending) for each required document.


---

## Phase 4: Assureur Portfolio Intelligence

13. Update `src/views/overview/` KPIs tab to include a "Portfolio Risk Concentration" KPI card
    showing % of clients in high / medium / low Géorisques risk zones.

14. Update `src/views/portfolio/` Map tab to color-code client markers by `riskLevel` field
    using MapLibre data-driven styling expressions.

---

## Phase 5: Quality & Documentation

15. Validate all Géorisques API calls fail gracefully — show an error state card (not a crash)
    when the token is expired or the API is unreachable.

16. Confirm all new UI components use `@material/web` and match the existing glassmorphism design
    system in `src/base.css`.

17. Update `.specify/memory/constitution.md` — bump to version 1.1.0 with the Phase roadmap
    context added to the "Project Identity" section.

---

**Notes**:
- Tasks 1-3 MUST be completed before tasks 4-12 (views depend on the enriched data model).
- Tasks 4-8 (Risk Hub) and tasks 9-12 (Assuré journey) can be worked in parallel after Task 3.
- All tasks MUST pass Charter Check Principles I–VII before merging (see `plan-template.md`).
- Phase 2 (SME/enterprise) tasks will be created in a separate proposal: `add-enterprise-insurance`.
