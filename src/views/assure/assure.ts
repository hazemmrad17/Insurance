/**
 * Espace Assuré — Client Portal view module.
 *
 * Provides view lifecycle and state management for the Assuré pages:
 *   assure-bien        → Mon Bien (property card + climate risk gauges)
 *   assure-travaux     → Mes Travaux (3D house + component selection)
 *   assure-engagement  → Mon Engagement (score gauges + premium impact + sign CTA)
 *   assure-dossier     → Mon Dossier (assessment history + documents + advisor contact)
 */

import { store } from '../../data.js';
import { housePartData, initHouse, destroyHouse } from '../../house3d.js';
import { navContext } from '../../context.js';
import { navigateTo } from '../../router.js';

/* ═══════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════ */

interface AssureState {
  selectedClientId: string | null;
  selectedPropertyId: string | null;
  selectedWorks: Set<string>;
  engagementSigned: boolean;
}

/* ═══════════════════════════════════════════════════════════════
   State
   ═══════════════════════════════════════════════════════════════ */

let initialized = false;
const state: AssureState = {
  selectedClientId: null,
  selectedPropertyId: null,
  selectedWorks: new Set(),
  engagementSigned: false,
};

/* ═══════════════════════════════════════════════════════════════
   Exported API (router lifecycle contract)
   ═══════════════════════════════════════════════════════════════ */

export function initAssure(viewName: string = 'assure-bien'): void {
  if (!initialized) {
    initialized = true;
    loadClientData();
    setupSignModal();
    setupCrossTabNavigation();
  }

  // Render content based on current view
  renderBien();
  renderTravaux();
  renderEngagement();
  renderDossier();

  if (viewName === 'assure-travaux') {
    requestAnimationFrame(() => {
      initHouse('assureHouseContainer');
    });
  }

  console.log(`[Assure] View ${viewName} initialized`);
}

export function destroyAssure(): void {
  destroyHouse();
  initialized = false;
}

/* ═══════════════════════════════════════════════════════════════
   Data loading
   ═══════════════════════════════════════════════════════════════ */

function loadClientData(): void {
  const ctx = navContext.context;
  if (ctx.selectedClientId) state.selectedClientId = ctx.selectedClientId;
  if (ctx.selectedPropertyId) state.selectedPropertyId = ctx.selectedPropertyId;

  if (!state.selectedClientId) {
    const clients = store.getAllClients();
    if (clients.length > 0) {
      state.selectedClientId = clients[0].id;
      const props = store.getClientProperties(state.selectedClientId);
      if (props.length > 0) state.selectedPropertyId = props[0].id;
    }
  }

  if (state.selectedWorks.size === 0) {
    state.selectedWorks = new Set(Object.keys(housePartData));
  }
}

/* ═══════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════ */

function setText(id: string, text: string): void {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function getColorForScore(score: number): string {
  if (score >= 70) return '#ef4444';
  if (score >= 50) return '#f59e0b';
  if (score >= 30) return '#3b82f6';
  return '#10b981';
}

function getRiskLabel(score: number): string {
  if (score >= 70) return 'Risque Élevé';
  if (score >= 50) return 'Risque Modéré';
  if (score >= 30) return 'Risque Faible';
  return 'Risque Minime';
}

function computeCurrentScore(): number {
  const comps = Object.values(housePartData);
  if (comps.length === 0) return 0;
  return Math.round(comps.reduce((s, c) => s + c.score, 0) / comps.length);
}

function computeProjectedScore(selectedIds: string[]): number {
  const comps = Object.values(housePartData);
  if (comps.length === 0) return 0;
  const total = comps.reduce((s, c) =>
    s + (selectedIds.includes(c.id) ? Math.max(0, c.score - Math.round(c.score * 0.55)) : c.score), 0);
  return Math.round(total / comps.length);
}

function computeAnnualSavings(selectedIds: string[]): number {
  let total = 0;
  for (const c of Object.values(housePartData)) {
    if (selectedIds.includes(c.id)) {
      const match = c.annualSavings.replace(/\s/g, '').match(/([0-9]+)/);
      if (match) total += parseInt(match[1], 10);
    }
  }
  return total;
}

function computeTotalCost(selectedIds: string[]): number {
  let total = 0;
  for (const c of Object.values(housePartData)) {
    if (selectedIds.includes(c.id)) {
      const match = c.cost.replace(/\s/g, '').match(/([0-9]+)/);
      if (match) total += parseInt(match[1], 10);
    }
  }
  return total;
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

/* ═══════════════════════════════════════════════════════════════
   Cross-page navigation
   ═══════════════════════════════════════════════════════════════ */

function setupCrossTabNavigation(): void {
  const nextBtn = document.getElementById('assureTravauxNextBtn');
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      navigateTo('assure-engagement');
    });
  }
}

/* ═══════════════════════════════════════════════════════════════
   MON BIEN — Property overview + risk gauges
   ═══════════════════════════════════════════════════════════════ */

function renderBien(): void {
  const client = state.selectedClientId ? store.getClient(state.selectedClientId) : null;
  const prop = state.selectedPropertyId ? store.getProperty(state.selectedPropertyId) : null;
  const currentScore = computeCurrentScore();
  const works = Array.from(state.selectedWorks);
  const projectedScore = computeProjectedScore(works);
  const savings = computeAnnualSavings(works);

  if (client) {
    setText('assureBannerName', `${client.civility} ${client.firstName} ${client.lastName}`);
    setText('assureBannerPolicy', client.policyNumber);
  }
  if (prop) {
    setText('assureBannerAddress', `${prop.address}, ${prop.city}`);
  }
  setText('assureBannerScore', `${currentScore}%`);
  setText('assureBannerRisk', getRiskLabel(currentScore));

  setText('assureStatScore', String(currentScore));
  setText('assureStatSavings', `${savings.toLocaleString('fr-FR')} €/an`);
  const engEl = document.getElementById('assureStatEngagement');
  if (engEl) {
    engEl.textContent = state.engagementSigned ? 'Engagement signé' : 'En attente de signature';
    engEl.style.color = state.engagementSigned ? '#10b981' : 'var(--text-muted)';
  }

  if (prop) {
    setText('assurePropAddress', prop.address);
    setText('assurePropCity', prop.city);
    setText('assurePropDpe', prop.dpeClass);
    setText('assurePropYear', String(prop.builtYear));
    setText('assurePropRisk', getRiskLabel(prop.riskScore));
    setText('assurePropScore', `${prop.riskScore}%`);
  }

  const gaugeData = [
    { arcId: 'assurGaugeBienFlood', valId: 'assurGaugeBienFloodVal', score: Math.min(100, Math.round(currentScore * 1.15)) },
    { arcId: 'assurGaugeBienClay', valId: 'assurGaugeBienClayVal', score: Math.min(100, Math.round(currentScore * 0.9)) },
    { arcId: 'assurGaugeBienSeismic', valId: 'assurGaugeBienSeismicVal', score: Math.min(100, Math.round(currentScore * 0.55)) },
  ];

  for (const g of gaugeData) {
    const color = getColorForScore(g.score);
    const totalArcLen = 70.685;
    const offset = totalArcLen - (g.score / 100) * totalArcLen;
    const arc = document.getElementById(g.arcId) as SVGElement | null;
    const val = document.getElementById(g.valId);
    if (arc) {
      arc.setAttribute('stroke-dashoffset', String(offset.toFixed(2)));
      arc.setAttribute('stroke', color);
    }
    if (val) val.textContent = String(g.score) + '%';
  }

  const diff = currentScore - projectedScore;
  setText('assureBienImprove', diff > 0 ? `−${diff} pts ▲` : 'Score optimal');
}

/* ═══════════════════════════════════════════════════════════════
   MES TRAVAUX — 3D house + component selection
   ═══════════════════════════════════════════════════════════════ */

function renderTravaux(): void {
  renderComponentGrid();
  renderWorksSummary();
}

function renderComponentGrid(): void {
  const grid = document.getElementById('assureCompGrid');
  if (!grid) return;

  grid.innerHTML = Object.values(housePartData).map(c => {
    const selected = state.selectedWorks.has(c.id);
    return `
    <div class="assure-comp-card ${selected ? 'selected' : ''}" data-comp="${c.id}">
      <div class="assure-comp-card-header">
        <span class="assure-comp-card-name">
          <span class="material-symbols-outlined" style="font-size:14px!important;vertical-align:middle;margin-right:3px;">${getPartIcon(c.id)}</span>
          ${c.label}
        </span>
        <label class="assure-comp-toggle" title="Inclure dans les travaux">
          <input type="checkbox" class="assure-comp-check" data-comp="${c.id}" ${selected ? 'checked' : ''}>
          <span class="assure-comp-checkmark"></span>
        </label>
      </div>
      <span class="assure-comp-risk-badge ${c.risk}">${getRiskLabel(c.score)}</span>
      <p class="assure-comp-desc">${c.description}</p>
      <div class="assure-comp-footer">
        <span>Coût estimé : <strong>${c.cost}</strong></span>
        <span class="assure-comp-saving">Éco. ${c.annualSavings}</span>
      </div>
    </div>`;
  }).join('');

  grid.querySelectorAll('.assure-comp-check').forEach(cb => {
    cb.addEventListener('change', () => {
      const compId = (cb as HTMLInputElement).getAttribute('data-comp');
      if (!compId) return;
      if ((cb as HTMLInputElement).checked) {
        state.selectedWorks.add(compId);
      } else {
        state.selectedWorks.delete(compId);
      }
      renderComponentGrid();
      renderWorksSummary();
      renderEngagement();
    });
  });
}

function getPartIcon(id: string): string {
  const icons: Record<string, string> = {
    roof: 'roofing',
    walls: 'layers',
    basement: 'foundation',
    windows: 'window',
    plumbing: 'plumbing',
    heating: 'local_fire_department',
  };
  return icons[id] || 'home_repair_service';
}

function renderWorksSummary(): void {
  const works = Array.from(state.selectedWorks);
  const cost = computeTotalCost(works);
  const savings = computeAnnualSavings(works);
  const annualPremium = getAnnualPremium();
  const newPremium = Math.max(0, annualPremium - savings);

  setText('assureTravauxCost', `${cost.toLocaleString('fr-FR')} €`);
  setText('assureTravauxSavings', `${savings.toLocaleString('fr-FR')} €/an`);
  setText('assureTravauxPremium', `${newPremium.toLocaleString('fr-FR')} €/an`);

  const listEl = document.getElementById('assureWorksList');
  if (!listEl) return;

  const selectedComps = Object.values(housePartData).filter(c => works.includes(c.id));
  if (selectedComps.length === 0) {
    listEl.innerHTML = '<span class="assure-works-empty">Cochez des composants ci-dessus pour voir les travaux recommandés.</span>';
    return;
  }
  listEl.innerHTML = selectedComps.map(c => `
    <div class="assure-works-item">
      <span class="assure-works-item-name">${c.label}</span>
      <ul class="assure-works-item-list">
        ${c.works.map(w => `<li>${w}</li>`).join('')}
      </ul>
    </div>
  `).join('');
}

/* ═══════════════════════════════════════════════════════════════
   MON ENGAGEMENT — score gauges + premium impact + sign CTA
   ═══════════════════════════════════════════════════════════════ */

function renderEngagement(): void {
  const works = Array.from(state.selectedWorks);
  const currentScore = computeCurrentScore();
  const projectedScore = computeProjectedScore(works);
  const annualPremium = getAnnualPremium();
  const savings = computeAnnualSavings(works);
  const newPremium = Math.max(0, annualPremium - savings);
  const totalCost = computeTotalCost(works);
  const diff = currentScore - projectedScore;

  updateGauge('assureGaugeArcCurrent', 'assureGaugeValCurrent', currentScore, getColorForScore(currentScore));
  updateGauge('assureGaugeArcProjected', 'assureGaugeValProjected', projectedScore, getColorForScore(projectedScore));

  const improvEl = document.getElementById('assureImproveVal');
  if (improvEl) {
    improvEl.textContent = diff > 0 ? `−${diff} pts` : diff === 0 ? '0 pts' : `+${Math.abs(diff)} pts`;
    improvEl.style.color = diff > 0 ? '#10b981' : diff === 0 ? 'var(--text-muted)' : 'var(--color-danger)';
  }

  setText('assureEngPremiumCurrent', `${annualPremium.toLocaleString('fr-FR')} €/an`);
  setText('assureEngPremiumNew', `${newPremium.toLocaleString('fr-FR')} €/an`);
  setText('assureEngPremiumSaving', `− ${savings.toLocaleString('fr-FR')} €/an`);

  const reductionPct = annualPremium > 0 ? Math.round((savings / annualPremium) * 100) : 0;
  const paybackYears = savings > 0 ? Math.ceil(totalCost / savings) : 0;
  setText('assureRecapReduc', `-${reductionPct}%`);
  setText('assureRecapImprov', diff > 0 ? `-${diff} pts` : '0 pts');
  setText('assureRecapPayback', paybackYears > 0 ? `${paybackYears} ans` : '—');

  const worksEl = document.getElementById('assureAvenantWorks');
  if (worksEl) {
    const selected = Object.values(housePartData).filter(c => works.includes(c.id));
    if (selected.length === 0) {
      worksEl.innerHTML = '<p style="font-size:12px;color:var(--text-muted);">Aucun travail sélectionné — rendez-vous sur "Mes Travaux" pour en choisir.</p>';
    } else {
      worksEl.innerHTML = selected.map(c => `
        <div class="assure-avenant-works-item">
          <span class="material-symbols-outlined" style="color:#10b981;">check_circle</span>
          <span>${c.label}</span>
          <span style="margin-left:auto;font-size:11px;color:var(--text-muted);">${c.cost}</span>
        </div>
      `).join('');
    }
  }

  const client = state.selectedClientId ? store.getClient(state.selectedClientId) : null;
  const prop = state.selectedPropertyId ? store.getProperty(state.selectedPropertyId) : null;
  if (client) {
    setText('assurePolNumber', client.policyNumber);
    setText('assurePolClient', `${client.civility} ${client.firstName} ${client.lastName}`);
    setText('assurePolPremiumCurrent', `${annualPremium.toLocaleString('fr-FR')} €`);
  }
  if (prop) {
    setText('assurePolProperty', prop.address + ', ' + prop.city);
  }
  setText('assurePolPremiumNew', `${newPremium.toLocaleString('fr-FR')} €`);

  const signBtn = document.getElementById('assureSignBtn') as HTMLButtonElement | null;
  if (signBtn) {
    signBtn.disabled = works.length === 0;
  }
}

/* ═══════════════════════════════════════════════════════════════
   MON DOSSIER — assessment history + documents + advisor
   ═══════════════════════════════════════════════════════════════ */

function renderDossier(): void {
  const client = state.selectedClientId ? store.getClient(state.selectedClientId) : null;
  if (!client) return;

  const historyEl = document.getElementById('assureHistoryList');
  if (historyEl) {
    const assessments = store.getClientAssessments(client.id);
    if (assessments.length === 0) {
      historyEl.innerHTML = '<span class="assure-works-empty">Aucune évaluation disponible.</span>';
    } else {
      historyEl.innerHTML = assessments.map(a => `
        <div class="assure-history-item">
          <div class="assure-history-icon">
            <span class="material-symbols-outlined">analytics</span>
          </div>
          <div class="assure-history-info">
            <div class="assure-history-title">Évaluation · ${a.date}</div>
            <div class="assure-history-meta">${a.riskSummary} · ${a.pages} pages</div>
          </div>
          <span class="assure-history-score" style="color:${getColorForScore(a.score)};">${a.score}</span>
        </div>
      `).join('');
    }
  }

  const docsEl = document.getElementById('assureDocList');
  if (docsEl) {
    const docs = store.getClientDocuments(client.id);
    if (docs.length === 0) {
      docsEl.innerHTML = '<span class="assure-works-empty">Aucun document disponible.</span>';
    } else {
      docsEl.innerHTML = docs.map(d => `
        <div class="assure-doc-item">
          <div class="assure-doc-icon" style="background:${d.iconColor}18;">
            <span class="material-symbols-outlined" style="color:${d.iconColor};">${d.icon}</span>
          </div>
          <div class="assure-doc-info">
            <div class="assure-doc-name">${d.name}</div>
            <div class="assure-doc-meta">${d.type} · ${d.size} · ${d.date}</div>
          </div>
          <span class="assure-doc-status ${d.status}">${d.status === 'complete' ? 'Complet' : 'En attente'}</span>
        </div>
      `).join('');
    }
  }

  setText('assureAdvisorName', 'Jean Dupont');
  setText('assureAdvisorEmail', 'jean.dupont@previa.fr');
  setText('assureAdvisorPhone', '+33 1 42 86 XX XX');
  setText('assureAdvisorRef', client.clientRef);

  setText('assureDossierPolicy', client.policyNumber);
  setText('assureDossierType', client.contractTypeLabel);
  setText('assureDossierPremium', `${client.annualPremium.toLocaleString('fr-FR')} €/an`);
  setText('assureDossierExpiry', client.expiryDate);
}

/* ═══════════════════════════════════════════════════════════════
   SIGN MODAL
   ═══════════════════════════════════════════════════════════════ */

function setupSignModal(): void {
  const signBtn = document.getElementById('assureSignBtn');
  const modal = document.getElementById('assureSignModal');
  const closeBtn = document.getElementById('assureSignModalClose');
  const confirmBtn = document.getElementById('assureSignConfirm');

  if (signBtn && modal) {
    signBtn.addEventListener('click', () => {
      if (Array.from(state.selectedWorks).length === 0) return;
      populateSignModal();
      modal.classList.add('open');
    });
  }

  if (closeBtn && modal) {
    closeBtn.addEventListener('click', () => modal.classList.remove('open'));
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('open'); });
  }

  if (confirmBtn && modal) {
    confirmBtn.addEventListener('click', () => {
      state.engagementSigned = true;
      modal.classList.remove('open');

      setText('assureEngagementStatusLabel', 'Engagement signé');
      const pill = document.getElementById('assureEngagementPill');
      if (pill) {
        pill.className = 'assure-engagement-status signed';
        pill.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px!important;">verified</span> Engagement signé';
      }

      renderBien();
    });
  }
}

function populateSignModal(): void {
  const works = Array.from(state.selectedWorks);
  const client = state.selectedClientId ? store.getClient(state.selectedClientId) : null;
  const savings = computeAnnualSavings(works);
  const annualPremium = getAnnualPremium();
  const newPremium = Math.max(0, annualPremium - savings);
  const cost = computeTotalCost(works);

  setText('assureModalPolRef', client?.policyNumber || '—');
  setText('assureModalClient', client ? `${client.civility} ${client.firstName} ${client.lastName}` : '—');
  setText('assureModalNewPremium', `${newPremium.toLocaleString('fr-FR')} € / an`);
  setText('assureModalSavings', `− ${savings.toLocaleString('fr-FR')} € / an`);
  setText('assureModalTotalCost', `${cost.toLocaleString('fr-FR')} €`);

  const expiry = new Date();
  expiry.setFullYear(expiry.getFullYear() + 10);
  setText('assureModalExpiry', expiry.toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' }));

  const worksEl = document.getElementById('assureModalWorks');
  if (worksEl) {
    const selected = Object.values(housePartData).filter(c => works.includes(c.id));
    worksEl.innerHTML = selected.map(c => `
      <div class="assure-avenant-works-item">
        <span class="material-symbols-outlined" style="color:#10b981;">check_circle</span>
        <span>${c.label}</span>
        <span style="margin-left:auto;font-size:11px;color:var(--text-muted);">${c.cost}</span>
      </div>
    `).join('');
  }
}

/* ═══════════════════════════════════════════════════════════════
   Utility
   ═══════════════════════════════════════════════════════════════ */

function getAnnualPremium(): number {
  if (state.selectedClientId) {
    const client = store.getClient(state.selectedClientId);
    if (client) return client.annualPremium;
  }
  return 1240;
}
