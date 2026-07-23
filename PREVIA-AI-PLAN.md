# Prévia Risk Hub — AI Architecture & Sprint Plan

**Date:** 23 juillet 2026  
**Scope:** User-input collection · Deterministic scoring upgrade · Mistral agentic layer · Expert review loop · Client portal  
**Team:** 12 developers across 4 squads

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Phase 0 — Fix Critical Blockers](#2-phase-0--fix-critical-blockers)
3. [Phase 1 — User-Input Collection (15 Variables)](#3-phase-1--user-input-collection-15-variables)
4. [Phase 2 — Scoring Engine Upgrade](#4-phase-2--scoring-engine-upgrade)
5. [Phase 3 — Mistral Agentic Layer](#5-phase-3--mistral-agentic-layer)
6. [Phase 4 — Expert Review Loop (Human-in-the-Loop)](#6-phase-4--expert-review-loop-human-in-the-loop)
7. [Phase 5 — Client Portal](#7-phase-5--client-portal)
8. [Data Model Changes](#8-data-model-changes)
9. [API Endpoints Summary](#9-api-endpoints-summary)
10. [Task Allocation (12 Devs)](#10-task-allocation-12-devs)
11. [Open Questions](#11-open-questions)

---

## 1. Architecture Overview

### Design Principle

> **LLMs never decide risk. They only narrate deterministic results.**

The pipeline is strictly ordered:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  STEP 1           STEP 2              STEP 3            STEP 4          │
│                                                                         │
│  Data             Deterministic       Mistral           Human           │
│  Collection  →    Scoring Engine  →   Narrator     →   Expert      →   │
│                                       (grounded)        Review          │
│  26 API vars      Produces:           Translates        Approves /      │
│  + 15 user        • score/100         scores +          edits /         │
│  inputs           • contributors      contributors      rejects         │
│                   • data gaps         → French prose    before client   │
│                   • confidence                          sees anything   │
│                                                                         │
│                                              ↓ APPROVED                │
│                                         Client Portal                   │
│                                         (simplified view)               │
└─────────────────────────────────────────────────────────────────────────┘
```

### Why This Order Matters

| Risk | Mitigation |
|---|---|
| LLM hallucinating risk factors | Grounded prompt: can only reference factors in the JSON |
| LLM inventing French legislation | System prompt explicitly forbids citing any reference not in data |
| LLM giving fabricated recommendations | Recommendations come from a deterministic rule table; LLM only rephrases them |
| Wrong data reaching clients | Expert approval gate: `narrativeStatus = 'approved'` required before client access |
| Regulatory audit trail | Every score, contributor, LLM draft, and human edit is persisted in DB |

### User Roles

| Role | Portal | What They See | AI Access |
|---|---|---|---|
| **Assureur** | `/dashboard` | Full scores, contributors, AI narrative, pricing signal | Read-only Underwriter output |
| **Expert** | `/dashboard` + `/review/:id` | Same + score override + inline narrative editing | Can re-prompt Underwriter Agent |
| **Assuré (Client)** | `/client-portal` | 🟢🟡🔴 badges + approved plain-French text only | Reporter Agent output (post-approval) |

---

## 2. Phase 0 — Fix Critical Blockers

> **Duration:** 1.5 days  
> **Priority:** P0 — Nothing else works until these are done

### 2.1 Wire `property-risk.ts` to the backend

**Problem:** `property-risk.ts` calls `orchestrate()` from `risk-orchestrator.ts` (browser-side). All scoring formulas are visible in DevTools. External API tokens are exposed.

**Fix:** Replace the call with `POST /api/risk/assess`.

```typescript
// BEFORE (packages/front/src/risk-assessment/risk-orchestrator.ts)
const result = await orchestrate(lat, lon, address, banId);

// AFTER (packages/front/src/api/risks.ts)
const result = await runAssessment({ latitude, longitude, address, banId });
// → calls POST /api/risk/assess via fetch with credentials: 'same-origin'
```

**Files to change:**
- `packages/front/src/views/property-risk/property-risk.ts` — remove import of `orchestrate`, import `runAssessment` from `../api/risks.ts`
- `packages/front/src/risk-assessment/risk-orchestrator.ts` — mark as `@deprecated` (keep for reference, remove calls)

### 2.2 Wire auth forms to the backend

**Problem:** `auth.ts` `wireSubmitButtons()` submits forms with `return false` — no API call.

**Fix:** Wire `POST /api/auth/login` and `POST /api/auth/register` using `apiFetch`.

**Files to change:**
- `packages/front/src/views/auth/auth.ts` — `wireSubmitButtons()` must call `login()` / `register()` from `../api/auth.ts`
- On success: `destroyAuth()` + `navigateToView('assureur')`
- On failure: display error message in the form card

---

## 3. Phase 1 — User-Input Collection (15 Variables)

> **Duration:** 2 days  
> **Priority:** P0 — Without these, scores are meaningless for same-address properties

### 3.1 The 15 Variables

These cannot be fetched from any API and must be collected from the user.

#### Group A — General Property (always collected)

| Field | Key | Type | UI Control |
|---|---|---|---|
| Type de bien | `propertyType` | `'individuelle' \| 'mitoyenne' \| 'appartement' \| 'immeuble'` | Radio buttons |
| Nombre de pièces | `roomCount` | `number \| null` | Number input |
| Présence sous-sol | `basement` | `boolean \| null` | Toggle (Oui / Non / NSP) |
| Valeur assurée | `insuranceValue` | `number \| null` | Currency input (€) |
| Historique de sinistres | `claimsHistory` | `string \| null` | Textarea |
| Travaux de rénovation | `renovationNotes` | `string \| null` | Textarea |

#### Group B — Peril-Specific (shown only when peril is relevant)

| Field | Key | Shown When | Type |
|---|---|---|---|
| Hauteur plancher habitable | `floodFloorHeight` | `inondation.present = true` | Number (cm) |
| Clapet anti-retour | `backflowValve` | `inondation.present = true` | Boolean |
| Équipements électriques en zone basse | `lowElectricals` | `inondation.present = true` | Boolean |
| Profondeur des fondations | `foundationDepth` | `rga.present = true` | `'<50cm' \| '50-80cm' \| '>80cm' \| null` |
| Fissures existantes | `cracksPresent` | `rga.present = true` | `'aucune' \| 'légères' \| 'importantes'` |
| Arbres proches (< 5m) | `treesNearby` | `rga.present = true` | Boolean |
| Débroussaillement réalisé | `clearanceCompleted` | `feuForet.present = true` | Boolean |
| Âge et état de la toiture | `roofAge` | always | Number (années) |
| Panneaux solaires | `solarPanels` | always | Boolean |

### 3.2 UI Implementation

The 15-variable form replaces the current "Step 2 — Expert" placeholder in the Risk Hub wizard.

**Pattern:** Accordion-style, one group per peril. Groups collapse when the peril score = 0 (irrelevant).

```
┌─────────────────────────────────────────────┐
│  Informations complémentaires               │
│                                             │
│  ▼ Général (toujours affiché)               │
│    Type de bien:  ○ Individuelle  ○ Appart  │
│    Valeur assurée: [________] €             │
│    Nb pièces:      [__]                     │
│                                             │
│  ▼ Inondation (affiché si score > 10)       │
│    Hauteur plancher: [__] cm                │
│    Clapet anti-retour: ○ Oui  ○ Non         │
│                                             │
│  ▼ RGA — Argile (affiché si score > 10)     │
│    Fissures: ○ Aucune  ○ Légères  ○ Import  │
│    Arbres proches: ○ Oui  ○ Non             │
│                                             │
│  ▼ Toiture / Tempête (toujours affiché)     │
│    Âge toiture: [__] ans                    │
│    Panneaux solaires: ○ Oui  ○ Non          │
│                              [Lancer l'IA ▶]│
└─────────────────────────────────────────────┘
```

### 3.3 TypeScript Interface

```typescript
// packages/shared/src/types.ts — add to AssessRequest

export interface UserInputs {
  // General
  propertyType?: 'individuelle' | 'mitoyenne' | 'appartement' | 'immeuble';
  roomCount?: number;
  basement?: boolean;
  insuranceValue?: number;
  claimsHistory?: string;
  renovationNotes?: string;
  // Flood (inondation)
  floodFloorHeight?: number;     // cm above ground
  backflowValve?: boolean;
  lowElectricals?: boolean;
  // RGA
  foundationDepth?: '<50cm' | '50-80cm' | '>80cm';
  cracksPresent?: 'aucune' | 'légères' | 'importantes';
  treesNearby?: boolean;
  // Fire
  clearanceCompleted?: boolean;
  // Roof / Storm
  roofAge?: number;              // years
  solarPanels?: boolean;
}
```

---

## 4. Phase 2 — Scoring Engine Upgrade

> **Duration:** 1.5 days  
> **Priority:** P0 — Must emit contributors before the LLM can narrate anything

### 4.1 From `scoreAll()` to `scoreAllWithContributors()`

**Current output:**
```typescript
{ inondation: 45, rga: 20, tempete: 30, incendie: 0, seisme: 5, global: 26 }
```

**Required output:**
```typescript
interface ScoredPeril {
  score: number;
  confidence: 'high' | 'medium' | 'low'; // drops when user inputs are missing
  contributors: {
    name: string;       // human-readable factor name
    value: string;      // the actual value used
    impact: number;     // +N or -N points contribution
    source: 'api' | 'user_input' | 'default';
  }[];
  dataGaps: string[];   // missing inputs that would change the score
}

interface ScoredAssessment {
  inondation: ScoredPeril;
  rga: ScoredPeril;
  tempete: ScoredPeril;
  incendie: ScoredPeril;
  seisme: ScoredPeril;
  global: number;
  missingCriticalInputs: string[];  // blocks AI generation if non-empty
}
```

**Example output:**
```json
{
  "inondation": {
    "score": 45,
    "confidence": "medium",
    "contributors": [
      { "name": "Distance cours d'eau", "value": "681m", "impact": +12, "source": "api" },
      { "name": "Altitude terrain", "value": "34m", "impact": +8, "source": "api" },
      { "name": "Zone PPRI", "value": "présent", "impact": +15, "source": "api" },
      { "name": "Hauteur plancher", "value": "non renseigné", "impact": 0, "source": "default" }
    ],
    "dataGaps": ["Hauteur du plancher habitable non renseignée — facteur critique"]
  }
}
```

### 4.2 Actuarial Formulas to Encode

#### Inondation (MRN vulnerability curves)
```
base  = PPRI_zone_factor  (0 / 20 / 35 / 50 based on zone blanc/bleu/rouge/TRI)
water = proximity_score(distanceToWaterway, 1000m max)  × 0.30
alt   = altitude_risk(altitude)                          × 0.20
mitigation:
  - backflowValve = true        → -10 pts
  - lowElectricals = false      → -5 pts
  - floodFloorHeight > 50cm     → -8 pts
```

#### RGA (BRGM × DTU 13.12)
```
base  = alea_argile_brgm (Faible=15, Moyen=40, Fort=70, Très Fort=90)
soil  = soil_moisture_delta (projected - current)  × modifier
aggravants:
  - cracksPresent = 'importantes' → +20 pts
  - foundationDepth = '<50cm'     → +15 pts
  - treesNearby = true            → +10 pts
```

#### Tempête (NV65 wind zones)
```
base  = wind_zone_nv65 (1-4)  × 20
material_factor:
  - ZINC/ARDOISE → 0
  - TUILES       → +5
  - AUTRES       → +10
vulnerability:
  - roofAge > 30    → +15 pts
  - solarPanels     → +8 pts
```

#### Séisme (Eurocode 8)
```
score = seismic_zone_ec8 (Faible=10, Moyen=30, Fort=60, Très Fort=90)
modifier:
  - builtYear < 1948 → +15 (pre-parasismique construction)
  - builtYear < 1975 → +10
  - levels > 5       → +10
```

#### Incendie (DFCI + FWI)
```
if !feuForet.present → score = 0
else:
  base  = levelToSeverity(feuForet.level)
  fwi   = fwi_factor(fireWeatherIndex)  × 0.30
  dist  = proximity_score(distanceToForest, 2000m)  × 0.30
mitigation:
  - clearanceCompleted = true → -20 pts
```

### 4.3 `identifyDataGaps()` Function

```typescript
function identifyDataGaps(
  assessment: RiskAssessmentInput,
  userInputs: UserInputs
): DataGap[] {
  const gaps: DataGap[] = [];

  if (assessment.risks.naturels.inondation.present) {
    if (!userInputs.floodFloorHeight)
      gaps.push({ field: 'floodFloorHeight', impact: 'high', peril: 'inondation' });
    if (userInputs.backflowValve === undefined)
      gaps.push({ field: 'backflowValve', impact: 'medium', peril: 'inondation' });
  }

  if (assessment.risks.naturels.retraitGonflementArgile.present) {
    if (!userInputs.foundationDepth)
      gaps.push({ field: 'foundationDepth', impact: 'high', peril: 'rga' });
    if (userInputs.cracksPresent === undefined)
      gaps.push({ field: 'cracksPresent', impact: 'medium', peril: 'rga' });
  }

  if (userInputs.roofAge === undefined)
    gaps.push({ field: 'roofAge', impact: 'medium', peril: 'tempete' });

  return gaps;
}
```

---

## 5. Phase 3 — Mistral Agentic Layer

> **Duration:** 2.5 days  
> **Priority:** P0 (demo) / P1 (production)  
> **Model:** `mistral-large-latest` for Underwriter, `mistral-small-latest` for Reporter

### 5.1 Setup

```bash
npm install @mistralai/mistralai --workspace=packages/api
```

```bash
# packages/api/.env
MISTRAL_API_KEY=your_key_from_console.mistral.ai
MISTRAL_MODEL_UNDERWRITER=mistral-large-latest
MISTRAL_MODEL_REPORTER=mistral-small-latest
MISTRAL_MODEL_VISION=pixtral-large-latest
MISTRAL_STREAM=true
```

### 5.2 Agent 1 — Underwriter Agent

**File:** `packages/api/src/services/mistral-underwriter.service.ts`

**Input:** `ScoredAssessment` + `RiskAssessmentInput` + `UserInputs`

**Output:**
```typescript
interface UnderwriterAnalysis {
  executiveSummary: string;        // 2-3 sentences, formal French
  perilNarratives: {
    inondation: string;            // explains the score using only contributors
    rga: string;
    tempete: string;
    incendie: string;
    seisme: string;
  };
  keyRiskFactors: string[];        // max 3, sourced from contributors only
  mitigatingFactors: string[];     // max 3, sourced from contributors only
  recommendations: string[];       // sourced from deterministic rule table only
  pricingSignal: 'favorable' | 'standard' | 'surcharge' | 'decliner';
  confidenceNote: string;          // flags if score confidence is 'low'
  expertDraft: boolean;            // always true — requires expert approval
}
```

**System prompt (anti-hallucination guardrails):**
```
Vous êtes un rédacteur technique spécialisé en assurance immobilière.
Votre UNIQUE rôle est de traduire des résultats de calcul actuariel 
en français professionnel compréhensible par un assureur senior.

RÈGLES ABSOLUES — violation = réponse invalide:
1. Ne mentionnez AUCUN facteur de risque absent de la liste "contributors" fournie.
2. Ne faites AUCUNE recommandation absente de la liste "allowedRecommendations" fournie.
3. Ne citez aucune loi, norme ou référence non présente dans les données.
4. Si une donnée a "source": "default", précisez que cette valeur est estimée.
5. Si confidence = "low", indiquez explicitement que l'évaluation est partielle.
6. Répondez UNIQUEMENT en JSON valide selon le schéma fourni.
7. Le signal de tarification DOIT correspondre au score global:
   0-30 = favorable, 31-50 = standard, 51-70 = surcharge, >70 = decliner
```

**Streaming response** (for the typewriter demo effect):
```typescript
const stream = await mistral.chat.stream({
  model: env.MISTRAL_MODEL_UNDERWRITER,
  messages: [{ role: 'user', content: prompt }],
  responseFormat: { type: 'json_object' },
});

// Stream tokens via SSE to the frontend
for await (const chunk of stream) {
  res.write(`data: ${JSON.stringify(chunk)}\n\n`);
}
```

### 5.3 Agent 2 — Reporter Agent

**File:** `packages/api/src/services/mistral-reporter.service.ts`

Two output modes:
- `mode: 'expert'` → formal French, full detail, includes `pricingSignal` and `confidenceNote`
- `mode: 'client'` → plain French, reassuring tone, NO raw numbers, badges only (🟢🟡🔴)

The `mode: 'client'` output is ONLY generated AFTER an expert has set `narrativeStatus = 'approved'`.

### 5.4 Agent 3 — Pixtral Vision (Optional, P1)

**File:** `packages/api/src/services/pixtral.service.ts`  
**Endpoint:** `POST /api/risk/analyze-photo`

**What it extracts:**
- `roofCondition: 'bon' | 'moyen' | 'mauvais'`
- `cracksVisible: boolean`
- `vegetationWithin10m: boolean`
- `solarPanels: boolean`
- `buildingType: 'maison' | 'immeuble' | 'autre'`

These pre-fill the User Input form fields. The user can override them.

**System prompt:** Forces JSON output, forbids interpretation beyond what's visible.

### 5.5 New Endpoint

```
POST /api/risk/assess-ai
{
  ...AssessRequest,           // lat, lon, address, banId
  userInputs: UserInputs,     // the 15 variables
  photos?: string[]           // base64 — triggers Pixtral pre-fill
}

Response:
{
  ...AssessResponse,          // existing data + scores
  scoredAssessment: ScoredAssessment,  // with contributors
  aiAnalysis: UnderwriterAnalysis,     // Mistral output (draft)
  assessmentId: string,
  narrativeStatus: 'pending_review'    // always starts here
}
```

---

## 6. Phase 4 — Expert Review Loop (Human-in-the-Loop)

> **Duration:** 2 days  
> **Priority:** P1 (required for production) / demo-optional

### 6.1 The Review Flow

```
Assessment Created (narrativeStatus = 'pending_review')
        ↓
Expert opens /dashboard/review/:id
        ↓
Side-by-side view:
  Left:  Raw scores + contributors table
  Right: AI-generated narrative (editable rich text)
        ↓
Expert actions:
  [Approve ✅]       → narrativeStatus = 'approved'  → client can see it
  [Request Revision] → triggers new Mistral generation with expert notes
  [Override Score]   → manual score + rationale saved
  [Edit Narrative]   → free edit of the draft text
        ↓
On Approval:
  - Notification sent to client (if linked to a /client-portal user)
  - PDF avenant generated
  - Assessment locked (no further edits without new review)
```

### 6.2 Database Changes Required

```sql
ALTER TABLE assessments ADD COLUMN narrative_status TEXT 
  DEFAULT 'pending_review' 
  CHECK (narrative_status IN ('pending_review', 'approved', 'rejected'));

ALTER TABLE assessments ADD COLUMN ai_analysis TEXT;         -- JSON: UnderwriterAnalysis draft
ALTER TABLE assessments ADD COLUMN expert_narrative TEXT;    -- Final approved text
ALTER TABLE assessments ADD COLUMN expert_user_id TEXT;      -- Who approved
ALTER TABLE assessments ADD COLUMN expert_approved_at TEXT;  -- When

ALTER TABLE assessments ADD COLUMN contributors_data TEXT;   -- JSON: ScoredAssessment
ALTER TABLE assessments ADD COLUMN user_inputs TEXT;         -- JSON: UserInputs collected
```

### 6.3 New Endpoints

```
GET  /api/assessments/pending-review     → list for expert dashboard
PUT  /api/assessments/:id/approve        → { expertNotes?: string }
PUT  /api/assessments/:id/reject         → { reason: string }
PUT  /api/assessments/:id/override-score → { peril, newScore, rationale }
POST /api/assessments/:id/regenerate-ai  → re-runs Underwriter with expertNotes
```

### 6.4 Expert Review UI (Property Risk Hub — Step 4)

```
┌──────────────────────────────────────────────────────────────────┐
│  EXPERT REVIEW — 8 Rue de la Paix, 75002 Paris                  │
├───────────────────────────┬──────────────────────────────────────┤
│ SCORES & CONTRIBUTORS     │ AI NARRATIVE (éditable)              │
│                           │                                      │
│ 🌊 Inondation: 45/100 ▼  │ "Le bien présente un risque         │
│   • Distance eau: +12     │  d'inondation modéré lié à sa       │
│   • Altitude 34m: +8      │  proximité avec la Seine (681m)     │
│   • PPRI présent: +15     │  et son altitude basse (34m)..."    │
│   ⚠️ Plancher: manquant   │                                      │
│                           │  [Override score: ____]              │
│ 🏺 RGA: 20/100     ▼     │                                      │
│   • Argile: faible: +15   │ ─────────────────────────────────── │
│   • Fissures: aucune: -5  │                                      │
│                           │ SIGNAL TARIFICATION: STANDARD 🟡     │
│ 🌪️ Tempête: 30/100  ▼   │                                      │
│   • Zone vent 1: +10      │ NOTES EXPERT (privées):              │
│   • Toit zinc: +5         │ [                              ]     │
│   • Toit 15 ans: +8       │                                      │
│                           │ [🔄 Régénérer] [✅ Approuver]        │
└───────────────────────────┴──────────────────────────────────────┘
```

---

## 7. Phase 5 — Client Portal

> **Duration:** 3 days  
> **Priority:** P1

### 7.1 Architecture Decision

**Same Vite SPA, separate shell component** — no new repo, no new npm package.

- Route: `/client-portal` and `/client-portal/*`
- New shell: `packages/front/src/views/client-portal/` (separate from dashboard shell)
- Authenticated with `role = 'assure'`
- No access to `/dashboard` routes

### 7.2 Five-Step Flow

**Step 1: Mon bien**
- BAN address autocomplete
- Type de bien selector
- Rooms, basement toggle

**Step 2: Photos (Pixtral)**
- Drag-and-drop photo upload
- Pixtral auto-fills roofAge, solarPanels, cracksPresent
- User confirms/overrides pre-filled values

**Step 3: Questions ciblées**
- Only shows questions relevant to perils detected at the address
- e.g., if no `feuForet.present` → no fire questions
- Max 5 questions (hidden wizard)

**Step 4: En cours d'analyse**
- Progress animation while `POST /api/risk/assess-ai` runs
- "Nos experts vérifient votre dossier" message
- Shows `narrativeStatus = 'pending_review'` state

**Step 5: Mon rapport**
- Only shows content once `narrativeStatus = 'approved'`
- No raw scores — only 🟢🟡🔴 badges per peril
- Plain-French paragraph per peril (Reporter Agent output)
- Recommendations list
- "Partager avec mon assureur" button

### 7.3 What the Client Never Sees

- No `/100` scores
- No API data (altitudes, distances, BDNB fields)
- No pricing signal
- No `confidence` level
- No expert notes
- Nothing until `narrativeStatus = 'approved'`

---

## 8. Data Model Changes

### 8.1 DB Schema Additions

```typescript
// packages/api/src/database/schema.ts — add columns to assessments table

narrativeStatus: text('narrative_status', {
  enum: ['pending_review', 'approved', 'rejected']
}).default('pending_review'),

userInputs: text('user_inputs'),           // JSON: UserInputs
contributorsData: text('contributors_data'), // JSON: ScoredAssessment
aiAnalysis: text('ai_analysis'),           // JSON: UnderwriterAnalysis (draft)
expertNarrative: text('expert_narrative'), // Final approved text
expertUserId: text('expert_user_id').references(() => users.id),
expertApprovedAt: text('expert_approved_at'),
clientSummary: text('client_summary'),     // Reporter Agent output (post-approval)
```

### 8.2 Users Table — Add `expert` Role

```typescript
// packages/api/src/database/schema.ts
role: text('role', { 
  enum: ['assureur', 'assure', 'expert']  // add 'expert'
}).notNull().default('assureur'),
```

### 8.3 Shared Types — Add `UserInputs`

```typescript
// packages/shared/src/types.ts
export interface UserInputs { ... } // (defined in Phase 1 above)

export interface ScoredPeril { ... }
export interface ScoredAssessment { ... }
export interface UnderwriterAnalysis { ... }

// Update AssessRequest:
export interface AssessAiRequest extends AssessRequest {
  userInputs: UserInputs;
  photos?: string[];
}
```

---

## 9. API Endpoints Summary

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/risk/assess` | Optional | Deterministic scores only (existing) |
| `POST` | `/api/risk/assess-ai` | Required | Full pipeline: data + scoring + Mistral |
| `POST` | `/api/risk/analyze-photo` | Required | Pixtral vision pre-fill |
| `GET` | `/api/assessments` | Required | List all (assureur sees own) |
| `GET` | `/api/assessments/pending-review` | Expert only | Queue for expert review |
| `GET` | `/api/assessments/:id` | Required | Full assessment detail |
| `PUT` | `/api/assessments/:id/approve` | Expert only | Approve narrative |
| `PUT` | `/api/assessments/:id/reject` | Expert only | Reject with reason |
| `PUT` | `/api/assessments/:id/override-score` | Expert only | Override peril score |
| `POST` | `/api/assessments/:id/regenerate-ai` | Expert only | Re-run Underwriter |
| `GET` | `/api/assessments/:id/client-view` | Assuré only | Approved summary |
| `GET` | `/api/assessments/:id/stream-ai` | Expert only | SSE stream for typewriter demo |

---

## 10. Task Allocation (12 Devs)

| Dev | Phase | Tasks |
|---|---|---|
| **Dev 1** | 0 | Wire auth forms to `/api/auth/login` and `/api/auth/register` |
| **Dev 2** | 4 | Expert review endpoints (approve, reject, override, regenerate) + `expert` role in JWT |
| **Dev 3** | 1 | 15-variable user input form (accordion UI in Risk Hub Step 2) |
| **Dev 4** | 0 | Wire `property-risk.ts` to `POST /api/risk/assess` |
| **Dev 5** | 3 | `mistral-underwriter.service.ts` + `/api/risk/assess-ai` endpoint |
| **Dev 6** | 3 | Pixtral `analyze-photo` service + `/api/risk/analyze-photo` endpoint |
| **Dev 7** | 2 | `scoreAllWithContributors()` upgrade to scoring engine |
| **Dev 8** | 2 | `identifyDataGaps()` function + confidence level computation |
| **Dev 9** | 4 | Expert review UI (side-by-side panel in Risk Hub Step 4) + SSE stream display |
| **Dev 10** | 5 | Client portal shell + Step 1 (property declaration form) |
| **Dev 11** | 5 | Client portal Steps 2-4 (Pixtral upload + questionnaire + pending state) |
| **Dev 12** | 5 | Client portal Step 5 (approved report view) + PDF avenant export |

---

## 11. Open Questions

| # | Question | Options | Recommendation |
|---|---|---|---|
| 1 | Mistral tier for demo? | `small` (cheap) vs `large` (best French) | Use `large` for demo, `small` for CI tests |
| 2 | Streaming in demo? | `mistral.chat()` (sync) vs `.stream()` (SSE) | Stream — typewriter effect is the "wow moment" |
| 3 | Pixtral: demo or skip? | Add now vs Phase 2 | Add as optional — impressive but not blocking |
| 4 | Expert approval: demo or always required? | Configurable flag `REQUIRE_EXPERT_APPROVAL=true` | Flag — demo can bypass, production enforces |
| 5 | Client portal auth: Supabase or current JWT? | Wait for migration vs implement now | Implement with current JWT cookies (replace later) |
| 6 | PDF generation: Puppeteer or external? | Puppeteer (heavy) vs `@react-pdf/renderer` | Puppeteer in a dedicated worker process |
| 7 | Deterministic recommendations table | Hardcoded TypeScript map vs DB table | Hardcoded TS for now (easier to version-control) |
| 8 | When is confidence = 'low'? | < 3 user inputs filled vs < 50% | If ANY critical input missing → `'low'` |

---

## Appendix — Implementation Order (Sprint Gantt)

```
Day 1:    [Dev 4] Wire property-risk.ts → /api/risk/assess
          [Dev 1] Wire auth forms → backend

Day 2:    [Dev 3] User input form (15 vars, accordion)
          [Dev 7] scoreAllWithContributors() 
          [Dev 8] identifyDataGaps()

Day 3:    [Dev 5] mistral-underwriter.service.ts
          [Dev 6] pixtral.service.ts
          
Day 4:    [Dev 5] POST /api/risk/assess-ai endpoint
          [Dev 9] SSE stream + typewriter display in Expert tab

Day 5:    [Dev 10] Client portal shell + Step 1
          [Dev 2]  Expert approval endpoints

Day 6:    [Dev 11] Client portal Steps 2-4
          [Dev 9]  Expert review UI

Day 7:    [Dev 12] Client portal Step 5 (approved view)
          [Dev 2]  Expert override-score UI

Day 8:    All: integration testing + demo rehearsal
          [Dev 12] PDF avenant (stretch goal)
```

---

*Document: `PREVIA-AI-PLAN.md` — last updated 23 juillet 2026*
