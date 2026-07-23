/**
 * Assureur (Underwriter) view module.
 *
 * Links together:
 *   - data.ts     → client/property/assessment store
 *   - house3d.ts  → per-component risk scores & premiumAfter
 *   - context.ts  → selected client/property state
 *
 * Three sub-tabs:
 *   Score Dynamique  → before/after risk score with component breakdown
 *   Impact Actuariel → premium calculation, S/P ratio projection
 *   Avenant          → new premium, reduced deductible, non-cancellation clause
 */

import { store } from '../../data.js';
import { housePartData } from '../../house3d.js';
import { navContext } from '../../context.js';

/* ═══════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════ */

interface ComponentScore {
  id: string;
  label: string;
  currentScore: number;
  projectedScore: number;
  premiumReductionPct: number;
  annualSavings: string;
  cost: string;
  works: string[];
}

interface AssureurState {
  selectedClientId: string | null;
  selectedPropertyId: string | null;
  selectedWorks: Set<string>;
}

/* ═══════════════════════════════════════════════════════════════
   State
   ═══════════════════════════════════════════════════════════════ */

let initialized = false;
const state: AssureurState = {
  selectedClientId: null,
  selectedPropertyId: null,
  selectedWorks: new Set(),
};

// Map housePartData to our component model
function getComponents(): ComponentScore[] {
  return Object.entries(housePartData).map(([id, data]) => {
    const reductionPct = parseFloat(data.premiumAfter.replace(/[−−]/g, '-').match(/[0-9]+/)?.[0] || '0');
    return {
      id,
      label: data.label,
      currentScore: data.score,
      projectedScore: Math.max(0, data.score - Math.round(data.score * 0.55)),
      premiumReductionPct: reductionPct,
      annualSavings: data.annualSavings,
      cost: data.cost,
      works: data.works,
    };
  });
}

// Derive a combined risk score from component scores (weighted average)
function computeCurrentScore(selectedIds: string[] = []): number {
  const comps = getComponents();
  const scores = selectedIds.length > 0
    ? comps.filter(c => selectedIds.includes(c.id))
    : comps;
  if (scores.length === 0) return 0;
  return Math.round(scores.reduce((sum, c) => sum + c.currentScore, 0) / scores.length);
}

function computeProjectedScore(selectedIds: string[]): number {
  const comps = getComponents();
  // For selected components, use projected score; for unselected, keep current
  let totalCurrent = 0;
  let totalProjected = 0;
  const count = comps.length;
  for (const c of comps) {
    totalCurrent += c.currentScore;
    totalProjected += selectedIds.includes(c.id) ? c.projectedScore : c.currentScore;
  }
  return Math.round(totalProjected / count);
}

function computeAnnualSavings(selectedIds: string[]): number {
  let total = 0;
  for (const c of getComponents()) {
    if (selectedIds.includes(c.id)) {
      const cleaned = c.annualSavings.replace(/\s/g, '');
      const match = cleaned.match(/([0-9]+)/);
      if (match) total += parseInt(match[1], 10);
    }
  }
  return total;
}

function computeTotalCost(selectedIds: string[]): number {
  let total = 0;
  for (const c of getComponents()) {
    if (selectedIds.includes(c.id)) {
      const cleaned = c.cost.replace(/\s/g, '');
      const match = cleaned.match(/([0-9]+)/);
      if (match) total += parseInt(match[1], 10);
    }
  }
  return total;
}

function getClientAnnualPremium(): number {
  if (state.selectedClientId) {
    const client = store.getClient(state.selectedClientId);
    if (client) return client.annualPremium;
  }
  // Default from seed data
  return 1240;
}

function getCurrentPropertyScore(): number {
  if (state.selectedPropertyId) {
    const prop = store.getProperty(state.selectedPropertyId);
    if (prop) return prop.riskScore;
  }
  return computeCurrentScore([]) || 65;
}

/* ═══════════════════════════════════════════════════════════════
   Exported API
   ═══════════════════════════════════════════════════════════════ */

export function initAssureur(): void {
  if (initialized) return;
  initialized = true;

  setupClientSearch();
  loadDefaultSelection();
  renderScoreTab();
  renderActuarialTab();
  renderAvenantTab();

  console.log('[Assureur] View initialized');
}

export function destroyAssureur(): void {
  initialized = false;
}

/* ═══════════════════════════════════════════════════════════════
   Client Selection
   ═══════════════════════════════════════════════════════════════ */

function loadDefaultSelection(): void {
  // Try to pick up context
  const ctx = navContext.context;
  if (ctx.selectedClientId) {
    state.selectedClientId = ctx.selectedClientId;
  }
  if (ctx.selectedPropertyId) {
    state.selectedPropertyId = ctx.selectedPropertyId;
  }

  // If no property selected, pick first client's first property
  if (!state.selectedClientId) {
    const clients = store.getAllClients();
    if (clients.length > 0) {
      state.selectedClientId = clients[0].id;
      const props = store.getClientProperties(state.selectedClientId);
      if (props.length > 0) {
        state.selectedPropertyId = props[0].id;
      }
    }
  }

  // Default: all works selected
  state.selectedWorks = new Set(getComponents().map(c => c.id));

  renderClientBadges();
}

function setupClientSearch(): void {
  const searchInput = document.getElementById('assurClientSearch') as HTMLInputElement | null;
  if (!searchInput) return;
  const input: HTMLInputElement = searchInput;

  // Build a dropdown of all clients
  const clients = store.getAllClients();
  const dropdown = document.createElement('div');
  dropdown.className = 'assur-client-dropdown';
  dropdown.style.display = 'none';
  input.parentElement?.appendChild(dropdown);

  function renderDropdown(query: string) {
    const q = query.toLowerCase().trim();
    const filtered = clients.filter(c =>
      `${c.firstName} ${c.lastName} ${c.clientRef} ${c.policyNumber}`.toLowerCase().includes(q)
    );
    dropdown.innerHTML = filtered.map(c => {
      const props = store.getClientProperties(c.id);
      return `<div class="assur-client-dropdown-item" data-client="${c.id}" data-property="${props[0]?.id || ''}">
        <span class="assur-client-dd-name">${c.firstName} ${c.lastName}</span>
        <span class="assur-client-dd-ref">${c.clientRef} · ${c.policyNumber}</span>
        <span class="assur-client-dd-prop">${props[0]?.addressShort || 'Aucun bien'}</span>
      </div>`;
    }).join('');

    dropdown.querySelectorAll('.assur-client-dropdown-item').forEach(item => {
      item.addEventListener('click', () => {
        const clientId = (item as HTMLElement).getAttribute('data-client') || '';
        const propId = (item as HTMLElement).getAttribute('data-property') || '';
        selectClient(clientId, propId);
        dropdown.style.display = 'none';
        input.value = '';
      });
    });

    dropdown.style.display = filtered.length > 0 && query.length > 0 ? 'block' : 'none';
  }

  input.addEventListener('input', () => renderDropdown(input.value));
  input.addEventListener('blur', () => setTimeout(() => { dropdown.style.display = 'none'; }, 200));
  input.addEventListener('focus', () => { if ((input as HTMLInputElement).value) renderDropdown(input.value); });
}

function selectClient(clientId: string, propertyId: string): void {
  state.selectedClientId = clientId;
  state.selectedPropertyId = propertyId || null;
  navContext.selectClient(clientId);
  if (propertyId) navContext.selectProperty(propertyId);

  renderClientBadges();
  renderScoreTab();
  renderActuarialTab();
  renderAvenantTab();
}

function renderClientBadges(): void {
  const container = document.getElementById('assurClientBadges');
  if (!container) return;

  const client = state.selectedClientId ? store.getClient(state.selectedClientId) : null;
  const prop = state.selectedPropertyId ? store.getProperty(state.selectedPropertyId) : null;

  if (!client) {
    container.innerHTML = '<span class="assur-client-empty">Aucun client sélectionné</span>';
    return;
  }

  container.innerHTML = `
    <div class="assur-client-badge">
      <span class="assur-client-badge-avatar">${client.firstName[0]}${client.lastName[0]}</span>
      <div class="assur-client-badge-info">
        <span class="assur-client-badge-name">${client.firstName} ${client.lastName}</span>
        <span class="assur-client-badge-ref">${client.clientRef} · ${client.policyNumber}</span>
      </div>
    </div>
    ${prop ? `
    <div class="assur-client-badge property">
      <span class="material-symbols-outlined" style="font-size:16px!important;">home</span>
      <span class="assur-client-badge-addr">${prop.addressShort}</span>
      <span class="assur-risk-tag ${prop.riskLevel}">${prop.riskScore}</span>
    </div>` : ''}
  `;
}

/* ═══════════════════════════════════════════════════════════════
   Score Dynamique Tab
   ═══════════════════════════════════════════════════════════════ */

function renderScoreTab(): void {
  const comps = getComponents();
  const works = Array.from(state.selectedWorks);

  const currentScore = getCurrentPropertyScore();
  const projectedScore = computeProjectedScore(works);
  const savings = computeAnnualSavings(works);
  const cost = computeTotalCost(works);

  // Update gauge: current
  updateGauge('assurGaugeArcCurrent', 'assurGaugeValCurrent', currentScore, getColorForScore(currentScore));
  updateRiskBadge('assurRiskBadgeCurrent', currentScore);

  // Update gauge: projected
  updateGauge('assurGaugeArcProjected', 'assurGaugeValProjected', projectedScore, getColorForScore(projectedScore));
  updateRiskBadge('assurRiskBadgeProjected', projectedScore);

  // Improvement
  const diff = projectedScore - currentScore;
  const improveEl = document.getElementById('assurImproveVal');
  if (improveEl) {
    improveEl.textContent = diff >= 0 ? `+${diff}` : String(diff);
    improveEl.style.color = diff >= 0 ? '#10b981' : 'var(--color-danger)';
  }

  // Component grid
  const grid = document.getElementById('assurCompGrid');
  if (grid) {
    grid.innerHTML = comps.map(c => {
      const selected = state.selectedWorks.has(c.id);
      const projScore = selected ? c.projectedScore : c.currentScore;
      return `
      <div class="assur-comp-card ${selected ? 'selected' : ''}" data-comp="${c.id}">
        <div class="assur-comp-header">
          <span class="assur-comp-name">${c.label}</span>
          <label class="assur-comp-toggle">
            <input type="checkbox" class="assur-comp-check" data-comp="${c.id}" ${selected ? 'checked' : ''}>
            <span class="assur-comp-checkmark"></span>
          </label>
        </div>
        <div class="assur-comp-scores">
          <div class="assur-comp-score-row">
            <span class="assur-comp-score-label">Actuel</span>
            <span class="assur-comp-score-val ${getScoreClass(c.currentScore)}">${c.currentScore}</span>
          </div>
          <div class="assur-comp-arrow">
            <span class="material-symbols-outlined" style="font-size:14px!important;">arrow_forward</span>
          </div>
          <div class="assur-comp-score-row">
            <span class="assur-comp-score-label">Projeté</span>
            <span class="assur-comp-score-val ${getScoreClass(projScore)}">${projScore}</span>
          </div>
        </div>
        <div class="assur-comp-meta">
          <span>Éco. ${c.annualSavings}</span>
          <span>${c.cost}</span>
        </div>
      </div>`;
    }).join('');

    // Wire checkboxes
    grid.querySelectorAll('.assur-comp-check').forEach(cb => {
      cb.addEventListener('change', () => {
        const compId = (cb as HTMLInputElement).getAttribute('data-comp');
        if (!compId) return;
        if ((cb as HTMLInputElement).checked) {
          state.selectedWorks.add(compId);
        } else {
          state.selectedWorks.delete(compId);
        }
        renderScoreTab();
        renderActuarialTab();
        renderAvenantTab();
      });
    });
  }

  // Works sidebar
  renderWorksSidebar(comps, works, savings, cost);
}

function renderWorksSidebar(comps: ComponentScore[], works: string[], savings: number, cost: number): void {
  const listEl = document.getElementById('assurWorksList');
  const footerEl = document.getElementById('assurWorksFooter');
  const hintEl = document.getElementById('assurWorksHint');
  const costEl = document.getElementById('assurWorksCost');
  const savingsEl = document.getElementById('assurWorksSavings');

  if (!listEl || !footerEl || !hintEl) return;

  const selectedComps = comps.filter(c => works.includes(c.id));
  if (selectedComps.length === 0) {
    listEl.innerHTML = '';
    footerEl.style.display = 'none';
    hintEl.textContent = 'Cochez des composants pour voir les travaux recommandés';
    return;
  }

  hintEl.textContent = '';
  footerEl.style.display = 'flex';

  listEl.innerHTML = selectedComps.map(c => `
    <div class="assur-works-item">
      <span class="assur-works-item-name">${c.label}</span>
      <ul class="assur-works-item-list">
        ${c.works.map(w => `<li>${w}</li>`).join('')}
      </ul>
    </div>
  `).join('');

  if (costEl) costEl.textContent = `${cost.toLocaleString('fr-FR')} €`;
  if (savingsEl) savingsEl.textContent = `${savings.toLocaleString('fr-FR')} €/an`;
}

/* ═══════════════════════════════════════════════════════════════
   Impact Actuariel Tab
   ═══════════════════════════════════════════════════════════════ */

function renderActuarialTab(): void {
  const annualPremium = getClientAnnualPremium();
  const works = Array.from(state.selectedWorks);
  const savings = computeAnnualSavings(works);
  const newPremium = Math.max(0, annualPremium - savings);
  const currentScore = getCurrentPropertyScore();
  const projectedScore = computeProjectedScore(works);

  // Pure premium = ~72% of commercial premium (loading ~28%)
  const loadingRate = 0.28;
  const currentPure = Math.round(annualPremium * (1 - loadingRate));
  const projectedPure = Math.round(newPremium * (1 - loadingRate));

  // S/P ratio: derived from risk score (higher score → higher S/P)
  const currentSP = Math.min(95, Math.round(30 + currentScore * 0.6));
  const projectedSP = Math.min(95, Math.round(30 + projectedScore * 0.6));

  // KPI cards
  setText('assurPrimePure', `${currentPure.toLocaleString('fr-FR')} €`);
  setText('assurPrimeProjetee', `${projectedPure.toLocaleString('fr-FR')} €`);
  setText('assurSPRatio', `${currentSP}%`);
  setText('assurSPProjetee', `${projectedSP}%`);

  // S/P ratio bars
  const barFillActuel = document.querySelector('.assur-ratio-bar-group:first-child .assur-ratio-bar-fill') as HTMLElement;
  const barFillProj = document.querySelector('.assur-ratio-bar-group:last-child .assur-ratio-bar-fill') as HTMLElement;
  if (barFillActuel) {
    barFillActuel.style.width = `${currentSP}%`;
    barFillActuel.style.background = currentSP > 70 ? 'var(--color-danger)' : currentSP > 50 ? '#f59e0b' : '#10b981';
    const pctActuel = barFillActuel.closest('.assur-ratio-bar-group')?.querySelector('.assur-ratio-bar-pct');
    if (pctActuel) pctActuel.textContent = `${currentSP}%`;
  }
  if (barFillProj) {
    barFillProj.style.width = `${projectedSP}%`;
    barFillProj.style.background = projectedSP > 70 ? 'var(--color-danger)' : projectedSP > 50 ? '#f59e0b' : '#10b981';
    const pctProj = barFillProj.closest('.assur-ratio-bar-group')?.querySelector('.assur-ratio-bar-pct');
    if (pctProj) pctProj.textContent = `${projectedSP}%`;
  }

  // Breakdown table
  const tableBody = document.getElementById('assurActTable');
  if (tableBody) {
    const comps = getComponents();
    const rows = comps.map(c => {
      const selected = works.includes(c.id);
      const compPure = Math.round(currentPure * (c.currentScore / 100) * 0.08);
      const compProj = selected ? Math.round(compPure * (1 - c.premiumReductionPct / 100)) : compPure;
      const compSav = compPure - compProj;
      return `
      <div class="assur-act-row ${selected ? 'selected' : ''}">
        <span>${c.label}</span>
        <span>${compPure.toLocaleString('fr-FR')} €</span>
        <span>${compProj.toLocaleString('fr-FR')} €</span>
        <span style="color:${selected ? '#10b981' : 'var(--text-muted)'};">${selected ? `−${compSav} €` : '—'}</span>
      </div>`;
    }).join('');

    // Replace existing rows (keep header)
    const header = tableBody.querySelector('.header');
    tableBody.innerHTML = header ? header.outerHTML + rows : rows;

    // Update total row
    setText('assurActTotalCurr', `${annualPremium.toLocaleString('fr-FR')} €`);
    setText('assurActTotalProj', `${newPremium.toLocaleString('fr-FR')} €`);
    setText('assurActTotalSav', `−${savings.toLocaleString('fr-FR')} € / an`);
  }
}

/* ═══════════════════════════════════════════════════════════════
   Avenant Tab
   ═══════════════════════════════════════════════════════════════ */

function renderAvenantTab(): void {
  const client = state.selectedClientId ? store.getClient(state.selectedClientId) : null;
  const prop = state.selectedPropertyId ? store.getProperty(state.selectedPropertyId) : null;
  const works = Array.from(state.selectedWorks);
  const annualPremium = client?.annualPremium || getClientAnnualPremium();
  const savings = computeAnnualSavings(works);
  const newPremium = Math.max(0, annualPremium - savings);
  const currentScore = getCurrentPropertyScore();
  const projectedScore = computeProjectedScore(works);
  const diff = projectedScore - currentScore;

  // Current franchise: ~40% of monthly premium
  const currentFranchise = client?.depositGuarantee || 500;
  // Reduced franchise: proportional to score improvement (min 100€)
  const reductionRatio = Math.max(0.3, 1 - (diff / 100));
  const newFranchise = Math.max(100, Math.round(currentFranchise * reductionRatio));

  // Policy info
  if (client) {
    setText('assurPolNumber', client.policyNumber);
    setText('assurPolClient', `${client.firstName} ${client.lastName}`);
    setText('assurPolPremium', `${annualPremium.toLocaleString('fr-FR')} €`);
    setText('assurPolFranchise', `${currentFranchise.toLocaleString('fr-FR')} €`);
  }
  if (prop) {
    setText('assurPolProperty', prop.address);
  }

  // New conditions
  setText('assurNewPremium', `${newPremium.toLocaleString('fr-FR')} €`);
  setText('assurNewFranchise', `${newFranchise.toLocaleString('fr-FR')} €`);
  setText('assurNewSavings', `−${savings.toLocaleString('fr-FR')} € / an`);

  // Recap
  const reductionPct = annualPremium > 0 ? Math.round((savings / annualPremium) * 100) : 0;
  const franchiseReducPct = currentFranchise > 0 ? Math.round(((currentFranchise - newFranchise) / currentFranchise) * 100) : 0;
  setText('assurRecapReduc', `−${reductionPct}%`);
  setText('assurRecapFranchise', `−${franchiseReducPct}%`);
  setText('assurRecapScore', diff >= 0 ? `+${diff} pts` : `${diff} pts`);

  // Works list
  const worksEl = document.getElementById('assurAvenantWorks');
  if (worksEl) {
    const comps = getComponents().filter(c => works.includes(c.id));
    if (comps.length === 0) {
      worksEl.innerHTML = '<p style="font-size:12px;color:var(--text-muted);">Aucun travail sélectionné</p>';
    } else {
      worksEl.innerHTML = comps.map(c => `
        <div class="assur-avenant-works-item">
          <span class="material-symbols-outlined" style="font-size:16px!important;color:#10b981;">check_circle</span>
          <span>${c.label}</span>
          <span style="margin-left:auto;font-size:11px;color:var(--text-muted);">${c.cost}</span>
        </div>
      `).join('');
    }
  }

  // Avenant button
  const genBtn = document.getElementById('assurAvenantBtn');
  if (genBtn) {
    genBtn.onclick = () => {
      if (works.length === 0) {
        alert('Veuillez sélectionner au moins un travail à valider.');
        return;
      }
      generateAvenant(client, newPremium, newFranchise);
    };
  }

  // Print/Aperçu button
  const printBtn = document.getElementById('assurAvenantPrintBtn');
  if (printBtn) {
    printBtn.onclick = () => {
      alert('Aperçu de l\'avenant — module PDF à implémenter.');
    };
  }
}

function generateAvenant(client: ReturnType<typeof store.getClient> | null, newPremium: number, newFranchise: number): void {
  // Update modal
  setText('avenantPolRef', client?.policyNumber || 'POL-XXXX');
  setText('avenantConfirmPrime', `${newPremium.toLocaleString('fr-FR')} € / an`);
  setText('avenantConfirmFran', `${newFranchise.toLocaleString('fr-FR')} €`);

  // Clause date: 3 years from now
  const expiry = new Date();
  expiry.setFullYear(expiry.getFullYear() + 3);
  setText('avenantConfirmDate', expiry.toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' }));

  // Show modal
  const modal = document.getElementById('avenantModal');
  if (modal) modal.classList.add('open');
}

/* ═══════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════ */

function setText(id: string, text: string): void {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function getColorForScore(score: number): string {
  if (score >= 70) return '#ef4444';     // high → red
  if (score >= 50) return '#f59e0b';     // medium → amber
  if (score >= 30) return '#3b82f6';     // moderate → blue
  return '#10b981';                       // low → green
}

function getScoreClass(score: number): string {
  if (score >= 70) return 'score-high';
  if (score >= 50) return 'score-medium';
  if (score >= 30) return 'score-moderate';
  return 'score-low';
}

function updateGauge(arcId: string, valId: string, score: number, color: string): void {
  const circumference = 314; // 2 * π * 50
  const offset = circumference - (score / 100) * circumference;

  const arc = document.getElementById(arcId) as SVGElement | null;
  const val = document.getElementById(valId);

  if (arc) {
    arc.setAttribute('stroke-dashoffset', String(offset));
    arc.setAttribute('stroke', color);
  }
  if (val) val.textContent = String(score);
}

function updateRiskBadge(id: string, score: number): void {
  const el = document.getElementById(id);
  if (!el) return;

  let label: string;
  let cls: string;

  if (score >= 70) { label = 'Risque Élevé'; cls = 'high'; }
  else if (score >= 50) { label = 'Risque Modéré'; cls = 'medium'; }
  else if (score >= 30) { label = 'Risque Faible'; cls = 'low'; }
  else { label = 'Risque Minime'; cls = 'low'; }

  el.textContent = label;
  el.className = `assur-risk-badge ${cls}`;
}
