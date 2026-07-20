# Prévia — Project Context & Roadmap
*Generative AI at the service of institutional uses — Finance & Insurance*

---

## 1. Internship Theme

**"Generative AI at the service of institutional uses"** — design and develop
GenAI-based solutions to modernize institutional services, automate
administrative processes, facilitate access to information, and improve
operational efficiency, while ensuring security, compliance, and quality of
service. Sector focus: **Finance & Insurance**, built on **Mistral**
(sovereign, French AI).

---

## 2. Problem Research (background phase)

Before scoping the solution, we mapped real, cited problems across fintech
and insurance:

**Insurance**
- Global protection gap: ~$9 trillion/year in uninsured risk (life, pensions,
  cyber, health, natural catastrophes).
- Claims processing is slow: property claims average 32+ days.
- Underwriting is static/point-in-time, not continuous.
- AI-vs-AI fraud arms race (deepfakes, synthetic fraud).
- Actuarial/underwriting talent drain (retirements outpacing replacement).
- Regulatory fragmentation (DORA, IAIS climate framework, EU AI Act).
- No liability framework yet for autonomous AI agents' decisions.

**Fintech**
- Compliance built reactively (bolted on after product launch).
- Jurisdictional compliance overload for multi-country fintechs.
- Third-party/Banking-as-a-Service (BaaS) dependency risk — fintechs exposed
  to failures they don't control (e.g., Synapse/Evolve Bank collapse).
- EU AI Act explainability mandate colliding with black-box AI credit/fraud
  models (enforceable August 2026).
- Broken identity verification for underbanked populations.

**Chosen angle:** climate change accelerating insurance risk faster than
historical-data-based pricing models can adapt — directly connects to the
protection gap (static underwriting → denied coverage or unaffordable
premiums) and to the "prevention vs. reaction" theme of the internship brief.

---

## 3. The Project: Prévia

A **multi-agent system**, built on **Mistral**, for climate-risk assessment
and insurance-contract personalization, intended for implementation at a
large French insurance firm ("cabinet X").

### Core principle
1. A policyholder (or advisor on their behalf) submits: property address,
   photos (façade, garden, basement, roof), a building information form
   (construction year, type, materials), and supporting documents (invoices,
   permits, past declarations to the mairie).
2. **Agent 1 (document verification)** cross-checks invoices, form data, and
   photos to establish reliable facts about the property's current state —
   and should also verify document authenticity (metadata, format
   consistency) to prevent fraud.
3. **Agent 2 (public data)** retrieves climate projections, historical
   weather, natural-risk maps, topography, and water-proximity data via
   public APIs (Géorisques, BDNB, NASA POWER, DRIAS).
4. **Agent 3 (risk & recommendation)** cross-references both agents' outputs
   to assess future risk and recommend specific preventive works.
5. The policyholder chooses which works to complete and signs a 10-year
   engagement with the insurer.

### Example economics (from the original brief)
- Roof insulation (~1,000€) prevents an estimated future water-leak risk.
- Policyholder signs a 10-year engagement to do the work.
- Annual premium drops by 100€/year — amortizing the work over 10 years.
- Insurer avoids the larger payout it would have faced without prevention.

### Market differentiation
Existing players (Descartes Underwriting, ZestyAI) compute climate risk
scores and apply **malus only** — e.g., CSAT-based premium penalties up to
+20% for high-risk properties. **Nobody currently offers a bonus** for
provably low-risk or improved properties. This bonus mechanism is Prévia's
core differentiator, and it directly narrows the protection gap by making
prevention/coverage economically attractive rather than punitive.

---

## 4. Data Sources (research + status)

| Source | Role | Access | Status |
|---|---|---|---|
| **BAN / BDNB géocodage** | Address → coordinates | `api.bdnb.io/v1/bdnb/geocodage` | ✅ Free, no key, working |
| **BDNB building data** | Construction year, materials, DPE, morphology | `api.bdnb.io/v1/bdnb/donnees/...` | ✅ Free, no key |
| **Géorisques API** | Current natural/technological risk zones | `georisques.gouv.fr/api/v1/resultats_rapport_risque?latlon=lon,lat` | ✅ Working (note: **longitude first**, caused earlier 404s) |
| **NASA POWER** | Historical climate data (temp, precipitation, humidity) by coordinates | `power.larc.nasa.gov/api/temporal/climatology/point` | ✅ Free, live, no key |
| **DRIAS (TRACC-2023)** | Official French future climate projections (+2°C 2030, +2.7°C 2050, +4°C 2100) | Manual export only, no live API | ⚠️ Static/pre-downloaded fallback dataset — recommended model: `ALADIN63_CNRM-CM5` (Météo-France, for sovereignty narrative) |
| **Sitadel / DVF** | Building permits, property transaction history | data.gouv.fr open data | Identified, not yet integrated |
| Descartes Underwriting, ZestyAI, Copernicus C3S | Competitive/scientific reference | Not directly usable (proprietary or bulk-dataset oriented) | Reference only, cite in pitch |
| Real contracts, photos, invoices | Needed for realistic demo | No public dataset exists (privacy) | To be synthesized/mocked manually |

---

## 5. Technical Prototype — n8n Pipeline

Working end-to-end pipeline built and debugged:

```
Address input → Geocodage BDNB
                   → Building Data BDNB
                   → Risk Data Géorisques (parallel)
                   → NASA POWER climate data (parallel)
                   → DRIAS static fallback (parallel)
                   → Merge
                   → Mistral AI Agent (risk cross-referencing)
                   → Output
```

**Debugged issues:**
- BDNB nodes initially failed on missing credentials — resolved: free
  "open" tier requires **no API key** up to 10k requests/month.
- Géorisques returned 404 ("Les paramètres saisis ne sont pas correct")
  — root cause: `latlon` parameter was empty because coordinate field
  names from BDNB's geocoding response weren't correctly mapped; also
  confirmed the API requires **longitude before latitude**.
- DRIAS has no live API — it's a manual, account-gated export tool
  (JSP/frame-based UI). Resolved by treating it as a one-time export
  feeding a static store (Google Sheets / JSON), not a live node.
- NASA POWER added as a live, no-key alternative for **historical**
  climate data (distinct from DRIAS's **future projections** — both are
  kept, for different purposes).

**Milestone achieved:** full pipeline produced a real climate risk report
for a test address (8 Rue de la Paix, Paris), covering flood, heat stress,
clay-shrinkage, seismic, and pollution risks with cost-estimated
recommendations.

**Open issue:** the AI Agent returned free-form markdown instead of the
structured JSON schema specified in its system prompt — needs a stricter
prompt / JSON-mode setting so output is machine-usable (needed for any
real frontend to consume it).

---

## 6. Frontend / Product Design Direction

Decided to move away from a generic "sidebar + top nav" admin-panel look
toward a **premium, RonDesignLab-inspired product design**.

**Design language**
- Bold, single warm accent color (terracotta/clay — `#C56A3D`) instead of
  generic insurance blue, muted neutrals, large rounded cards, generous
  whitespace, subtle depth/shadows — "minimal luxury" over "enterprise
  admin panel."
- Layout: split-hero for the property detail screen (map/visual on one
  side, data panel on the other) or bento-grid for the portfolio overview
  — explicitly avoiding the standard boxed sidebar template.
- 3D used sparingly, as an accent/hero moment (e.g., a stylized property
  visualization with animated risk overlays), not throughout the whole UI.

**Reality check on production build**
- Most Dribbble-style "3D dashboards" are **pre-rendered static images**
  (Blender/Cinema4D) composited into an otherwise flat Figma design — not
  live 3D engines.
- Custom React Three Fiber / Three.js city-scale visualization is a
  multi-week specialization, unrealistic for the timeline.
- **Recommended approach:** use **Mapbox GL JS's native 3D building
  extrusion and terrain** (achieves ~80% of the "wow" effect for a
  fraction of the effort) instead of hand-built WebGL scenes.
- Skip PostGIS and full backend infrastructure for the prototype stage —
  not needed until there's a real multi-property portfolio to manage.

**Confirmed tech stack for implementation**
- Next.js (App Router) + TypeScript
- **Material Web (`@material/web`)** as the sole component/asset library
  (Material Design 3 foundation, custom-themed — not default M3 styling)
- Tailwind CSS for layout/spacing only (not component styling)
- Framer Motion for animation/transitions
- Mapbox GL JS (3D-enabled, not custom Three.js) for the map/hero visual
- Mock JSON data shaped to mirror real BDNB / Géorisques / NASA POWER
  fields, for an easy swap to live data later

**Scoped first deliverable:** the **Property Detail screen** (split-hero
layout: map on one side, risk/recommendation panel on the other) — this is
the actual live demo moment ("conseiller saisit l'adresse") and should be
built and polished before the portfolio/overview screen.

---

## 7. Roadmap

### Phase 1 — Foundations (done / in progress)
- [x] Problem research across fintech & insurance, cited
- [x] Solution concept defined (multi-agent, bonus-based prevention model)
- [x] Public data sources identified and tested (BDNB, Géorisques, NASA
      POWER, DRIAS)
- [x] n8n prototype pipeline built and debugged end-to-end
- [x] First real AI-generated risk report produced (Paris test address)
- [ ] **Fix AI Agent output to strict structured JSON** (blocking item for
      frontend integration)
- [ ] Finalize DRIAS static dataset (real exported values, not
      placeholders) for 2–3 demo communes

### Phase 2 — Demo Data & Content
- [ ] Select 2–3 real demo addresses (varying risk profiles: high, medium,
      low) and pull real BDNB/Géorisques/NASA/DRIAS data for each
- [ ] Draft synthetic sample insurance contract(s) styled on standard
      French *contrat MRH* clause structure
- [ ] Draft synthetic invoices/permits for demo "past works" scenarios
- [ ] Source or stage demo photos (façade, roof, basement) for the 2–3
      demo properties
- [ ] Expand FAQ (fraud/document-authenticity risk, adverse selection,
      what happens if works are done but a disaster still occurs, data
      privacy commitments)

### Phase 3 — Frontend Build
- [ ] Set up Next.js + TypeScript + Material Web + Tailwind + Framer
      Motion project scaffold
- [ ] Build the **Property Detail screen** first (split-hero: Mapbox 3D
      view + risk/recommendation panel), using mock data shaped like real
      API responses
- [ ] Wire in Mapbox (free token), enable 3D building extrusion + risk
      layer toggles
- [ ] Build the address-search entry screen
- [ ] Build the portfolio/overview screen (bento-grid KPIs + map preview +
      recent assessments list)

### Phase 4 — Integration
- [ ] Connect frontend to the (fixed, JSON-structured) n8n/Mistral
      pipeline as a real API instead of mock data
- [ ] End-to-end test: type a real address → live data pulled → AI
      recommendation generated → displayed in the polished UI
- [ ] Add the "sign engagement / accept works" interaction (can remain a
      UI-only mock for demo purposes — no real contract signing backend
      needed)

### Phase 5 — Pitch & Delivery
- [ ] Assemble competitive-landscape slide (Descartes Underwriting,
      ZestyAI — malus-only vs. Prévia's bonus model)
- [ ] Document data-sovereignty argument (Mistral + Météo-France/DRIAS +
      French public APIs = "IA souveraine et française")
- [ ] Prepare risk/compliance section (data privacy, human-in-the-loop,
      fraud-verification role of Agent 1, EU AI Act explainability
      alignment)
- [ ] Rehearse the live demo flow: address input → 3D property hero
      moment → risk breakdown → recommendations → bonus/engagement signing

---

## 8. Open Questions to Resolve

- How to source realistic demo photos without using real customer data
- Final decision on DRIAS variable set (temperature, precipitation,
  drought/fire-risk days — confirm which combination best supports the
  three priority risk categories: flood, wildfire/clay-shrinkage, heat)
- Whether to keep NASA POWER as a permanent second climate source or treat
  it as a temporary stand-in until a full DRIAS export pipeline exists
- Adverse selection mitigation strategy (only low-risk owners opting in)
- Exact legal/insurance framing of the bonus: guaranteed for completing
  the work regardless of outcome, or contingent — needs a clear, explicit
  answer for the FAQ
