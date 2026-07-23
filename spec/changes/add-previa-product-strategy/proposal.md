# Proposal: Prévia — Climate Risk Intelligence Platform · Product Strategy & Scope

**Change ID**: `add-previa-product-strategy`
**Date**: 2026-07-22
**Status**: Draft — Awaiting Approval
**Constitution**: v1.1.0 (Climate-First Risk Intelligence)

---

## Why

**Climate change is the defining challenge for the French insurance industry in the 21st century.**

France faces accelerating climate-related losses: floods (*crues*) cost €4B+ in 2024 alone,
heatwaves are causing unprecedented soil subsidence (*retrait-gonflement des argiles*) that
cracks foundations across entire regions, Mediterranean wildfires destroyed 26,000 ha in the
2022 Gironde disaster, and Atlantic storms are intensifying each decade.

Yet most French insurance tools treat risk as a static label. **Prévia's mission is to transform
climate risk data into real-time, visual, actionable intelligence** — for advisors pricing
climate-exposed properties, and for policyholders who need to understand what they're covered for.

This proposal formalizes that mission and answers two key product scope questions:
1. **Is the project feasible and maintainable for the French insurance market?**
2. **Should the product scope cover only habitations (MRH), or expand to enterprises and factories?**

**Context**:
- France's insurance market is governed by the **Code des assurances** and overseen by the **ACPR**
  (Autorité de Contrôle Prudentiel et de Résolution).
- The **Géorisques v2 API** (already integrated) is the authoritative source for natural and
  technological risks in France — covering flooding zones, seismic activity, soil subsidence
  (retrait-gonflement des argiles), and Seveso industrial sites.
- The MRH (Multirisques Habitation) market in France is highly competitive (~30M households insured)
  but also highly commoditized — the opportunity lies in **superior risk intelligence**.
- Industrial/enterprise insurance (IARD Entreprises) is far more complex but far more profitable
  per policy. It requires assessment of ICPE (Installations Classées pour la Protection de
  l'Environnement) sites, business interruption, and third-party liability limits.

**Current state**: The app has a solid technical foundation but no defined product scope or phased
roadmap. The `DataStore` supports `contractType: 'mrh' | 'auto' | 'pro' | 'vie' | 'sante'` —
indicating intent for multiple insurance lines but no implementation priority.

**Desired state**: A clearly scoped, phased product roadmap with:
- Phase 1: Domination of the MRH (habitation) market via superior geospatial risk intelligence.
- Phase 2: Expansion into SME and enterprise/industrial insurance leveraging the same risk platform.

---

## Feasibility Assessment

### ✅ What Makes Prévia Feasible in the French Market

| Factor | Assessment | Evidence |
|---|---|---|
| **Regulatory Data Access** | ✅ Excellent | Géorisques v2 API already integrated with valid token |
| **Technical Stack** | ✅ Modern & maintainable | Vite 8, TS 6, MapLibre — all actively maintained |
| **Risk Visualization** | ✅ Differentiating | Three.js 3D + Leaflet 2D already implemented |
| **SPA Architecture** | ✅ Low infrastructure cost | No backend, no server costs — Netlify/Vercel hostable |
| **Dual-Role Design** | ✅ Covers the full value chain | Assureur AND Assuré portals in one app |
| **French Gov API** | ✅ Authoritative & free | `georisques.gouv.fr` — no licensing cost |

### ⚠️ Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Géorisques API deprecation | Low (Gov API) | Use versioned endpoint v2; monitor BRGM announcements |
| ACPR compliance (data privacy) | Medium | No PII stored server-side; all data is in-memory (DataStore) |
| Mapbox pricing | Medium | MapLibre (open-source) is the primary fallback — already integrated |
| Competition from incumbents (AXA, Allianz, MAIF APIs) | High | Differentiate via UI quality and geospatial intelligence depth |
| MRH market commoditization | High | Focus on advisor tooling, not direct-to-consumer sales |

---

## What Changes

### Phase 1 — MRH Habitation (Recommended Immediate Focus)

- **Formalize MRH as the primary contract type** in `data.ts` — enrich `Property` entity with
  Géorisques risk zone fields (flood zone category, seismic zone, clay soil index, radon level).
- **Enhance the Risk Hub** (`/risk-hub`) to display a complete French risk profile per address
  using the 5 main Géorisques hazard categories.
- **Build the Assuré MRH journey** — completing the 4 tabs (Mon Bien, Mes Travaux, Mon Engagement,
  Mon Dossier) with meaningful content for homeowners.
- **KPI Dashboard** (`/overview`) to show portfolio-level risk concentration maps for advisors.

### Phase 2 — SME & Enterprises (6-12 Month Horizon)

- **Add `entreprise` contract type** to `data.ts` with SIRET/SIREN identification.
- **ICPE Risk Layer** — overlay Seveso sites and industrial classified installations on the
  portfolio map using Géorisques technological risk data.
- **Multi-property portfolio** — enterprise clients may have dozens of insured sites; the
  portfolio view needs clustering and site-level drill-down.
- **Business Interruption Module** — a new view for enterprise clients to manage business
  continuity risk assessments.

### Phase 3 — Factories & Industrial (12-24 Month Horizon)

- **Dedicated Industrial Risk Scoring model** integrating ICPE classifications, Seveso thresholds,
  and proximity-to-population risk calculations.
- **B2B Portal** — a separate enterprise-facing view with multi-user access simulation.
- **Report Export** — PDF risk assessment reports for enterprise underwriting.

---

## Impact

### Affected Specifications
- `spec/specs/product-scope/spec.md` — **NEW**: defines the two-phase product scope
- `.specify/memory/constitution.md` — MODIFIED to add Phase roadmap context (minor)

### Affected Code
- `src/data.ts` — Enrich `Property` with Géorisques risk fields (Phase 1)
- `src/views/property-risk/` — Enhance with full 5-hazard Géorisques profile (Phase 1)
- `src/views/assure/` — Complete Mon Bien / Mon Dossier content (Phase 1)
- `src/data.ts` — Add `entreprise` ContractType + SIRET field (Phase 2)
- `src/views/` — New `enterprise-risk` view (Phase 2)

### User Impact
- **Assureur**: Richer risk intelligence on the Risk Hub; portfolio KPIs with geographic risk heatmap.
- **Assuré (MRH)**: A complete, meaningful property dossier — not just placeholder tabs.
- **Assuré (Entreprise)** *(Phase 2)*: New enterprise portal with multi-site risk visibility.

### API Changes
- No breaking changes in Phase 1.
- Phase 2 will add new Géorisques endpoint calls (technological risks / ICPE data).

### Migration Required
- [x] No database migration (in-memory DataStore)
- [ ] No API version bump required (Phase 1)
- [ ] Update constitution.md to reference Phase roadmap *(minor)*
- [ ] Update `spec-template.md` to include `entreprise` as a known entity type *(Phase 2)*

---

## Timeline Estimate

| Phase | Scope | Estimate |
|---|---|---|
| **Phase 1** | MRH habitation — Géorisques enrichment + Assuré journey | Medium (3-6 weeks) |
| **Phase 2** | SME / enterprise — new entity type + ICPE overlay | Large (2-3 months) |
| **Phase 3** | Industrial factory insurance — full B2B portal | X-Large (3-6 months) |

---

## Risks

- **Scope creep**: Trying to build Phase 2 before Phase 1 is shipped will create technical debt
  and dilute the MRH value proposition. *Mitigation: Strict SDD workflow enforced by constitution.*
- **Géorisques rate limits**: The API has undocumented rate limits. *Mitigation: Cache API
  responses client-side with a TTL; add graceful error handling in `property-risk` view.*
- **Regulatory complexity (IARD Entreprises)**: Enterprise insurance in France requires specific
  actuarial models. *Mitigation: Phase 2 is advisory/visualization only — no premium calculation
  engine. This avoids ACPR licensing requirements.*
