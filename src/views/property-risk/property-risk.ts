/**
 * Property Risk Hub — Unified Map + 3D Viewer + Underwriter
 *
 * Three-step workflow within one view:
 *   1. Locate   → BDNB building map + address search
 *   2. Inspect  → 3D house viewer + component scores + recommendations
 *   3. Evaluate → Score gauges + actuarial impact + avenant
 *
 * Shared state persists across all three steps.
 */

import { housePartData, selectHousePart, onHousePartSelect } from '../../house3d.js';
import { initClimateMap, destroyClimateMap, escapeHtml } from '../climate-map/climate-map.js';
import { initHouse, destroyHouse } from '../../house3d.js';

/* ═══════════════════════════════════════════════════════════════
   State
   ═══════════════════════════════════════════════════════════════ */

interface RiskState {
  selectedAddress: string | null;
  selectedBuilding: Record<string, string> | null; // BDNB attributes
  selectedWorks: Set<string>;
}

let initialized = false;
const state: RiskState = {
  selectedAddress: null,
  selectedBuilding: null,
  selectedWorks: new Set(),
};

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

function getRiskClass(score: number): string {
  if (score >= 70) return 'high';
  if (score >= 50) return 'medium';
  return 'low';
}

function computeCurrentScore(ids: string[] = []): number {
  const comps = Object.values(housePartData);
  const filtered = ids.length > 0 ? comps.filter(c => ids.includes(c.id)) : comps;
  if (filtered.length === 0) return 0;
  return Math.round(filtered.reduce((s, c) => s + c.score, 0) / filtered.length);
}

function computeProjectedScore(ids: string[]): number {
  const comps = Object.values(housePartData);
  let totalProjected = 0;
  for (const c of comps) {
    totalProjected += ids.includes(c.id) ? Math.max(0, c.score - Math.round(c.score * 0.55)) : c.score;
  }
  return Math.round(totalProjected / comps.length);
}

function computeSavings(ids: string[]): number {
  let total = 0;
  for (const c of Object.values(housePartData)) {
    if (ids.includes(c.id)) {
      const cleaned = c.annualSavings.replace(/\s/g, '');
      const match = cleaned.match(/([0-9]+)/);
      if (match) total += parseInt(match[1], 10);
    }
  }
  return total;
}

function computeCost(ids: string[]): number {
  let total = 0;
  for (const c of Object.values(housePartData)) {
    if (ids.includes(c.id)) {
      const cleaned = c.cost.replace(/\s/g, '');
      const match = cleaned.match(/([0-9]+)/);
      if (match) total += parseInt(match[1], 10);
    }
  }
  return total;
}

/* ═══════════════════════════════════════════════════════════════
   Exported API
   ═══════════════════════════════════════════════════════════════ */

export function initPropertyRisk(): void {
  if (initialized) return;
  initialized = true;

  // Default: all works selected
  state.selectedWorks = new Set(Object.keys(housePartData));

  setupStepNav();
  setupRiskNav();
  setupMapInterop();
  setupInspect();
  setupEvaluate();

  // Initialize the map on first load if Locate tab is active
  const locatePanel = document.querySelector('.risk-tab-content[data-content="locate"]');
  if (locatePanel?.classList.contains('active')) {
    requestAnimationFrame(() => initClimateMap());
  }

  console.log('[PropertyRisk] View initialized');
}

export function destroyPropertyRisk(): void {
  destroyClimateMap();
  destroyHouse();
  initialized = false;
}

/* ── Step navigation ──────────────────────────────────────── */

function setupStepNav(): void {
  document.querySelectorAll('.risk-step').forEach(step => {
    step.addEventListener('click', () => {
      const tab = step.getAttribute('data-step');
      if (!tab) return;
      // Simulate clicking the header tab with the matching key
      const headerTabs = document.getElementById('headerTabs');
      if (!headerTabs) return;
      const btn = headerTabs.querySelector(`.tab-btn[data-tab="${tab}"]`);
      if (btn) (btn as HTMLButtonElement).click();
    });
  });
}

function updateSteps(activeTab: string): void {
  // step states derived from the order array and activeTab

  // Mark steps before active as completed
  const order = ['locate', 'expert', 'inspect', 'evaluate'];
  const activeIdx = order.indexOf(activeTab);

  document.querySelectorAll('.risk-step').forEach(el => {
    const tab = el.getAttribute('data-step') || '';
    const idx = order.indexOf(tab);
    el.classList.toggle('active', tab === activeTab);
    el.classList.toggle('completed', idx < activeIdx);
  });

  document.querySelectorAll('.risk-step-line').forEach((el, i) => {
    el.classList.toggle('completed', i < activeIdx);
  });
}

/* ═══════════════════════════════════════════════════════════════
   Numbered Navigation (Previous / Next arrows)
   ═══════════════════════════════════════════════════════════════ */

const TAB_ORDER = ['locate', 'expert', 'inspect', 'evaluate'];
const TAB_LABELS: Record<string, string> = {
  locate: 'Locate',
  expert: 'Expert',
  inspect: 'Inspect',
  evaluate: 'Evaluate',
};

function setupRiskNav(): void {
  const prevBtn = document.getElementById('riskNavPrev');
  const nextBtn = document.getElementById('riskNavNext');

  prevBtn?.addEventListener('click', () => {
    const activeTab = getActiveRiskTab();
    const idx = TAB_ORDER.indexOf(activeTab);
    if (idx <= 0) return;
    navigateToTab(TAB_ORDER[idx - 1]);
  });

  nextBtn?.addEventListener('click', () => {
    const activeTab = getActiveRiskTab();
    const idx = TAB_ORDER.indexOf(activeTab);
    if (idx < 0 || idx >= TAB_ORDER.length - 1) return;
    navigateToTab(TAB_ORDER[idx + 1]);
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Only when risk hub is the active view
    const view = document.getElementById('view-property-risk');
    if (!view?.classList.contains('active')) return;

    // Don't navigate when user is typing in an input field
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return;

    if (e.key === 'ArrowLeft') {
      prevBtn?.click();
      e.preventDefault();
    }
    if (e.key === 'ArrowRight') {
      nextBtn?.click();
      e.preventDefault();
    }
  });

  updateRiskNav();
}

function getActiveRiskTab(): string {
  const active = document.querySelector('.risk-tab-content.active');
  return active?.getAttribute('data-content') || 'locate';
}

function navigateToTab(tabKey: string): void {
  const headerTabs = document.getElementById('headerTabs');
  if (!headerTabs) return;
  const btn = headerTabs.querySelector(`.tab-btn[data-tab="${tabKey}"]`) as HTMLButtonElement | null;
  if (btn) btn.click();
}

function updateRiskNav(): void {
  const prevBtn = document.getElementById('riskNavPrev');
  const nextBtn = document.getElementById('riskNavNext');
  if (!prevBtn || !nextBtn) return;

  const activeTab = getActiveRiskTab();
  const idx = TAB_ORDER.indexOf(activeTab);

  // Show/hide based on position
  prevBtn.classList.toggle('visible', idx > 0);
  nextBtn.classList.toggle('visible', idx < TAB_ORDER.length - 1);

  // Update aria-labels and tooltips
  if (idx > 0) {
    const prevTab = TAB_ORDER[idx - 1];
    prevBtn.setAttribute('aria-label', `Previous: ${TAB_LABELS[prevTab]}`);
    prevBtn.title = `${TAB_LABELS[prevTab]} (←)`;
  }
  if (idx < TAB_ORDER.length - 1) {
    const nextTab = TAB_ORDER[idx + 1];
    nextBtn.setAttribute('aria-label', `Next: ${TAB_LABELS[nextTab]}`);
    nextBtn.title = `${TAB_LABELS[nextTab]} (→)`;
  }

  // Update step indicator numbers to show nav context
  document.querySelectorAll('.risk-step').forEach(el => {
    const tab = el.getAttribute('data-step') || '';
    const tabIdx = TAB_ORDER.indexOf(tab);
    // Highlight next/prev steps subtly
    el.classList.toggle('nav-adjacent', Math.abs(tabIdx - idx) === 1 && tabIdx !== idx);
  });
}

/* ── Tab lifecycle interop ────────────────────────────────── */

export function onRiskTabChange(tabKey: string): void {
  updateSteps(tabKey);
  updateRiskNav();

  if (tabKey === 'locate') {
    // Make sure the map container has size before init
    const container = document.getElementById('climateMapContainer');
    if (container && container.offsetWidth === 0) {
      container.style.width = '100%';
      container.style.height = '400px';
    }
    requestAnimationFrame(() => initClimateMap());
    renderLocatePanel();
  } else {
    // Don't destroy map on tab change — keep it alive
  }

  if (tabKey === 'expert') {
    renderExpertTab();
  }

  if (tabKey === 'inspect') {
    requestAnimationFrame(() => initHouse('riskHouseContainer'));
    renderInspectTab();
  } else if (tabKey !== 'expert') {
    // Only destroy house when leaving inspect, not when going to expert
    destroyHouse();
  }

  if (tabKey === 'evaluate') {
    renderEvaluateTab();
  }
}

/* ═══════════════════════════════════════════════════════════════
   TAB 1: LOCATE — Map integration
   ═══════════════════════════════════════════════════════════════ */

function setupMapInterop(): void {
  // Observe BDNB side panel for building selection
  const observer = new MutationObserver(() => {
    const bdnbCard = document.querySelector('.bdnb-building-card');
    if (bdnbCard) {
      // Extract attributes
      const attrs: Record<string, string> = {};
      bdnbCard.querySelectorAll('.bdnb-attr-item').forEach(item => {
        const label = item.querySelector('.bdnb-attr-label')?.textContent?.trim();
        const value = item.querySelector('.bdnb-attr-value')?.textContent?.trim();
        if (label && value) attrs[label] = value;
      });

      if (Object.keys(attrs).length > 0) {
        state.selectedBuilding = attrs;
        renderLocatePanel();
      }
    }

    // Also observe address card
    const addrCard = document.querySelector('.bdnb-addr-card');
    if (addrCard) {
      const addr = addrCard.querySelector('.bdnb-addr-body > div:first-child')?.textContent?.trim();
      if (addr) {
        state.selectedAddress = addr;
        renderLocatePanel();
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

/* ── Toast Notification System ────────────────────────────── */

function ensureToastContainer(): HTMLElement {
  let container = document.getElementById('riskToastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'riskToastContainer';
    container.className = 'risk-toast-container';
    document.body.appendChild(container);
  }
  return container;
}

function showToast(html: string, durationMs: number = 6000): () => void {
  const container = ensureToastContainer();
  const toast = document.createElement('div');
  toast.className = 'risk-toast';
  toast.innerHTML = html;
  container.appendChild(toast);

  // Wire close button
  const closeBtn = toast.querySelector('.risk-toast-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => removeToast());
  }

  const removeToast = () => {
    if (!toast.parentNode) return;
    toast.classList.add('removing');
    setTimeout(() => {
      if (toast.parentNode) toast.remove();
    }, 250);
  };

  // Auto-dismiss
  const timeoutId = setTimeout(removeToast, durationMs);

  // Allow the toast to persist if user interacts with buttons inside
  toast.addEventListener('mouseenter', () => clearTimeout(timeoutId));
  toast.addEventListener('mouseleave', () => setTimeout(removeToast, durationMs));

  return removeToast;
}

function renderLocatePanel(): void {
  // Don't show empty-state panel; instead show nothing on the map
  if (!state.selectedBuilding && !state.selectedAddress) {
    // Hide floating button
    const floatBtn = document.getElementById('riskLocateFloatBtn');
    if (floatBtn) floatBtn.classList.remove('visible');
    return;
  }

  // Show toast with building info
  let attrsHtml = '';
  if (state.selectedBuilding) {
    const entries = Object.entries(state.selectedBuilding).slice(0, 6);
    attrsHtml = `
      <div class="risk-toast-attr-grid">
        ${entries.map(([k, v]) => `
          <div class="risk-toast-attr-item">
            <span class="risk-toast-attr-label">${k}</span>
            <span class="risk-toast-attr-value">${v}</span>
          </div>
        `).join('')}
      </div>`;
  }

  const addr = state.selectedAddress || 'Adresse chargée';
  const attrCount = state.selectedBuilding ? Object.keys(state.selectedBuilding).length : 0;

  showToast(`
    <div class="risk-toast-header">
      <span class="material-symbols-outlined" style="color:var(--color-primary);">location_on</span>
      <span class="risk-toast-title">${escapeHtml(addr)}</span>
      <button class="risk-toast-close"><span class="material-symbols-outlined">close</span></button>
    </div>
    <div class="risk-toast-body">
      Données BDNB · ${attrCount} attributs chargés
    </div>
    ${attrsHtml}
    <div class="risk-toast-actions">
      <button class="risk-toast-btn" id="riskToastInspect">
        <span class="material-symbols-outlined">home</span>
        Inspecter le bâtiment
      </button>
    </div>
  `, 8000);

  // Wire the inspect button inside the toast
  setTimeout(() => {
    const inspectBtn = document.getElementById('riskToastInspect');
    if (inspectBtn) {
      inspectBtn.addEventListener('click', () => {
        const headerTabs = document.getElementById('headerTabs');
        if (!headerTabs) return;
        const btn = headerTabs.querySelector('.tab-btn[data-tab="inspect"]');
        if (btn) (btn as HTMLButtonElement).click();
      });
    }
  }, 50);

  // Show floating button on map
  let floatBtn = document.getElementById('riskLocateFloatBtn');
  if (!floatBtn) {
    const mapEl = document.getElementById('riskLocateMap');
    if (!mapEl) return;
    floatBtn = document.createElement('button');
    floatBtn.id = 'riskLocateFloatBtn';
    floatBtn.className = 'risk-locate-float-btn';
    floatBtn.innerHTML = '<span class="material-symbols-outlined">home</span> Inspecter le bâtiment';
    mapEl.appendChild(floatBtn);
    floatBtn.addEventListener('click', () => {
      const headerTabs = document.getElementById('headerTabs');
      if (!headerTabs) return;
      const btn = headerTabs.querySelector('.tab-btn[data-tab="inspect"]');
      if (btn) (btn as HTMLButtonElement).click();
    });
  }
  floatBtn.classList.add('visible');
}

/* ═══════════════════════════════════════════════════════════════
   TAB 2: EXPERT — Send expert, wait for evaluation
   ═══════════════════════════════════════════════════════════════ */

function renderExpertTab(): void {
  // Set the mobilization date
  const dateEl = document.getElementById('riskExpertDate');
  if (dateEl) {
    const now = new Date();
    dateEl.textContent = now.toLocaleDateString('fr-FR', {
      day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  // Wire simulate button
  const simulateBtn = document.getElementById('riskExpertSimulate');
  if (simulateBtn) {
    simulateBtn.onclick = () => simulateExpertReport();
  }

  // Wire contact button
  const contactBtn = document.getElementById('riskExpertContact');
  if (contactBtn) {
    contactBtn.onclick = () => {
      alert('Module de contact expert à implémenter — numéro: +33 6 12 34 56 78');
    };
  }

  // Wire resend button
  const resendBtn = document.getElementById('riskExpertResend');
  if (resendBtn) {
    resendBtn.onclick = () => {
      const badge = document.getElementById('riskExpertBadge');
      if (badge) {
        badge.innerHTML = '<span class="risk-status-pulse"></span>Demande relancée ✓';
        setTimeout(() => {
          badge.innerHTML = '<span class="risk-status-pulse"></span>En attente du rapport';
        }, 2000);
      }
      alert('Demande d\'expertise relancée. Le prestataire a été notifié.');
    };
  }
}

function simulateExpertReport(): void {
  const banner = document.getElementById('riskExpertBanner');
  const badge = document.getElementById('riskExpertBadge');
  const simulateBtn = document.getElementById('riskExpertSimulate');

  if (!banner || !badge || !simulateBtn) return;

  // Animate through the timeline
  const items = document.querySelectorAll('.risk-expert-timeline-item');

  (simulateBtn as HTMLButtonElement).disabled = true;
  simulateBtn.innerHTML = '<span class="material-symbols-outlined">sync</span> Réception en cours...';

  badge.innerHTML = '<span class="risk-status-pulse"></span>Rapport en cours de traitement...';

  // Step through timeline with delays
  let step = 3; // Start from step 3 (Expert mandaté → Rapport reçu)

  const advance = () => {
    if (step >= items.length) {
      // Complete!
      badge.innerHTML = '✅ Rapport reçu';
      banner.classList.add('received');
      simulateBtn.innerHTML = '<span class="material-symbols-outlined">check</span> Rapport reçu ✓';
      (simulateBtn as HTMLButtonElement).disabled = false;

      // Show toast to navigate to Inspect
      const toast = document.createElement('div');
      toast.className = 'risk-expert-toast';
      toast.innerHTML = `
        <span class="material-symbols-outlined">check_circle</span>
        Rapport d'expertise reçu !
        <button class="risk-expert-toast-btn" id="riskExpertGoInspect">
          Voir les composants
          <span class="material-symbols-outlined">arrow_forward</span>
        </button>
      `;
      document.querySelector('.risk-expert-main')?.prepend(toast);

      setTimeout(() => {
        const goBtn = document.getElementById('riskExpertGoInspect');
        if (goBtn) {
          goBtn.onclick = () => {
            const headerTabs = document.getElementById('headerTabs');
            if (!headerTabs) return;
            const btn = headerTabs.querySelector('.tab-btn[data-tab="inspect"]') as HTMLButtonElement | null;
            if (btn) btn.click();
          };
        }
      }, 50);

      return;
    }

    const item = items[step];
    item.classList.add('active');
    item.classList.remove('active');
    item.classList.add('complete');

    step++;
    setTimeout(advance, 600);
  };

  setTimeout(advance, 800);
}

/* ═══════════════════════════════════════════════════════════════
   TAB 3: INSPECT — 3D House + Components + Recommendations
   ═══════════════════════════════════════════════════════════════ */

function setupInspect(): void {
  onHousePartSelect((data) => {
    renderInspectPartInfo(data.id);
  });
}

function renderInspectTab(): void {
  renderComponents();
  // Select first part by default
  const firstId = Object.keys(housePartData)[0];
  if (firstId) selectHousePart(firstId);
}

function renderComponents(): void {
  // Render into both Inspect and Evaluate grids (synced)
  const gridIds = ['riskComponentGrid', 'riskEvaluateComponents'];

  const gridHtml = Object.entries(housePartData).map(([id, data]) => {
    const selected = state.selectedWorks.has(id);
    const riskColor = data.risk === 'high' ? '#fef2f2' : data.risk === 'medium' ? '#fffbeb' : '#ecfdf5';
    const iconColor = data.risk === 'high' ? '#ef4444' : data.risk === 'medium' ? '#f59e0b' : '#10b981';
    const icons: Record<string, string> = {
      roof: 'roofing', walls: 'foundation', ground: 'landslide',
      windows: 'window', chimney: 'mode_heat',
    };
    return `
    <div class="risk-inspect-comp ${selected ? 'selected' : ''}" data-comp="${id}">
      <div class="risk-inspect-comp-icon" style="background:${riskColor};">
        <span class="material-symbols-outlined" style="color:${iconColor};">${icons[id] || 'home'}</span>
      </div>
      <span class="risk-inspect-comp-name">${data.label}</span>
      <div class="risk-inspect-comp-score-row">
        <span class="risk-inspect-comp-score">${data.score}</span>
        <span class="risk-badge ${data.risk}">${data.risk}</span>
      </div>
      <div class="risk-inspect-comp-label-toggle">
        <span class="risk-inspect-comp-savings">${data.annualSavings}</span>
        <span class="risk-inspect-comp-chip ${selected ? 'active' : ''}" data-comp="${id}">
          ${selected ? '✓ Inclus' : '+ Inclure'}
        </span>
      </div>
    </div>`;
  }).join('');

  // Set HTML on both grids
  for (const id of gridIds) {
    const grid = document.getElementById(id);
    if (grid) grid.innerHTML = gridHtml;
  }

  // Wire clicks and chip toggles on both grids
  for (const id of gridIds) {
    const grid = document.getElementById(id);
    if (!grid) continue;

    grid.querySelectorAll('.risk-inspect-comp').forEach(el => {
      el.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('.risk-inspect-comp-chip')) return;
        const compId = (el as HTMLElement).getAttribute('data-comp');
        if (!compId) return;

        if (state.selectedWorks.has(compId)) {
          state.selectedWorks.delete(compId);
        } else {
          state.selectedWorks.add(compId);
        }

        renderInspectPartInfo(compId);
        selectHousePart(compId);
        renderComponents();
        renderEvaluateMetrics();
        updateSteps('inspect');
      });
    });

    grid.querySelectorAll('.risk-inspect-comp-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const compId = (chip as HTMLElement).getAttribute('data-comp');
        if (!compId) return;

        if (state.selectedWorks.has(compId)) {
          state.selectedWorks.delete(compId);
        } else {
          state.selectedWorks.add(compId);
        }

        renderInspectPartInfo(compId);
        selectHousePart(compId);
        renderComponents();
        renderEvaluateMetrics();
        updateSteps('inspect');
      });
    });
  }

}

function renderInspectPartInfo(partId: string): void {
  const data = housePartData[partId];
  if (!data) return;

  const infoEl = document.getElementById('riskInspectInfo');
  if (!infoEl) return;

  const selected = state.selectedWorks.has(partId);
  const projScore = Math.max(0, data.score - Math.round(data.score * 0.55));

  infoEl.innerHTML = `
    <div class="risk-inspect-part-header">
      <span class="risk-inspect-part-title">${data.label}</span>
      <span class="risk-inspect-part-score">${data.score}</span>
    </div>
    <span class="risk-badge ${data.risk}">${data.risk === 'high' ? 'Risque Élevé' : data.risk === 'medium' ? 'Risque Modéré' : 'Risque Faible'}</span>
    <p class="risk-inspect-part-desc">${data.description}</p>
    <div class="risk-inspect-part-meta">
      <span>Coût: ${data.cost}</span>
      <span>Économie: ${data.annualSavings}</span>
    </div>
    <div style="display:flex;gap:8px;align-items:center;padding:6px 0;border-top:1px solid var(--border-color);">
      <span style="font-size:11px;color:var(--text-muted);">Inclure dans les travaux</span>
      <span class="risk-inspect-comp-chip ${selected ? 'active' : ''}" data-comp="${partId}">
        ${selected ? '✓ Inclus' : '+ Inclure'}
      </span>
      <span style="font-size:10px;color:var(--text-muted);margin-left:auto;">
        Score projeté: <strong style="color:${getColorForScore(projScore)};">${projScore}</strong>
      </span>
    </div>
    <div style="display:flex;flex-direction:column;gap:2px;padding:4px 0;">
      <span style="font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;">Travaux recommandés</span>
      ${data.works.map(w => `<span style="font-size:11px;color:var(--text-secondary);padding:2px 0;">• ${w}</span>`).join('')}
    </div>
  `;

  // Wire chip inside info panel
  infoEl.querySelectorAll('.risk-inspect-comp-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const compId = (chip as HTMLElement).getAttribute('data-comp');
      if (!compId) return;
      if (state.selectedWorks.has(compId)) {
        state.selectedWorks.delete(compId);
      } else {
        state.selectedWorks.add(compId);
      }
      renderComponents();
      renderEvaluateMetrics();
      updateSteps('inspect');
    });
  });
}

/* ═══════════════════════════════════════════════════════════════
   TAB 3: EVALUATE — Score + Actuarial + Avenant
   ═══════════════════════════════════════════════════════════════ */

function setupEvaluate(): void {
  // Avenant generation
  const genBtn = document.getElementById('riskGenAvenant');
  if (genBtn) {
    genBtn.addEventListener('click', () => {
      const works = Array.from(state.selectedWorks);
      if (works.length === 0) {
        alert('Veuillez sélectionner au moins un travail dans l\'onglet Inspect.');
        return;
      }
      generateAvenant();
    });
  }

  const printBtn = document.getElementById('riskPrintAvenant');
  if (printBtn) {
    printBtn.addEventListener('click', () => {
      alert('Aperçu de l\'avenant — module PDF à implémenter.');
    });
  }
}

/** Recalculate and update all Evaluate tab KPIs/metrics in real-time (extracted from renderEvaluateTab) */
function renderEvaluateMetrics(): void {
  const works = Array.from(state.selectedWorks);
  const currentScore = computeCurrentScore();
  const projectedScore = computeProjectedScore(works);
  const savings = computeSavings(works);
  const cost = computeCost(works);
  const diff = projectedScore - currentScore;

  const annualPremium = 1240;
  const newPremium = Math.max(0, annualPremium - savings);

  const loadingRate = 0.28;
  const currentPure = Math.round(annualPremium * (1 - loadingRate));
  const projectedPure = Math.round(newPremium * (1 - loadingRate));

  const currentSP = Math.min(95, Math.round(30 + currentScore * 0.6));
  const projectedSP = Math.min(95, Math.round(30 + projectedScore * 0.6));

  const currentFranchise = 500;
  const reductionRatio = Math.max(0.3, 1 - (diff / 100));
  const newFranchise = Math.max(100, Math.round(currentFranchise * reductionRatio));

  // ── Score gauges ──
  updateGauge('riskGaugeArcCurrent', 'riskGaugeValCurrent', currentScore, getColorForScore(currentScore));
  updateGauge('riskGaugeArcProjected', 'riskGaugeValProjected', projectedScore, getColorForScore(projectedScore));

  setText('riskBadgeCurrent', currentScore >= 70 ? 'Risque Élevé' : currentScore >= 50 ? 'Risque Modéré' : 'Risque Faible');
  const badgeCur = document.getElementById('riskBadgeCurrent');
  if (badgeCur) { badgeCur.className = `risk-badge ${getRiskClass(currentScore)}`; }

  setText('riskBadgeProjected', projectedScore >= 70 ? 'Risque Élevé' : projectedScore >= 50 ? 'Risque Modéré' : 'Risque Faible');
  const badgeProj = document.getElementById('riskBadgeProjected');
  if (badgeProj) { badgeProj.className = `risk-badge ${getRiskClass(projectedScore)}`; }

  const improveEl = document.getElementById('riskImproveVal');
  if (improveEl) {
    improveEl.textContent = diff >= 0 ? `+${diff}` : String(diff);
    improveEl.style.color = diff >= 0 ? '#10b981' : 'var(--color-danger)';
  }

  // ── KPI cards ──
  setText('riskPrimePure', `${currentPure.toLocaleString('fr-FR')} €`);
  setText('riskPrimeProj', `${projectedPure.toLocaleString('fr-FR')} €`);
  setText('riskSPCurrent', `${currentSP}%`);
  setText('riskSPProj', `${projectedSP}%`);

  // ── Premium bar ──
  const premiumBar = document.getElementById('riskPremiumBarFill');
  if (premiumBar) {
    const pctMax = 2000;
    const currPct = Math.round((annualPremium / pctMax) * 100);
    const newPct = Math.round((newPremium / pctMax) * 100);
    premiumBar.innerHTML = `
      <div class="risk-premium-bar-track" style="display:flex;gap:2px;">
        <div class="risk-premium-bar-fill" style="width:${Math.min(currPct, 100)}%;background:#ef4444;">${annualPremium} €</div>
        <div class="risk-premium-bar-fill" style="width:${Math.min(newPct, 100)}%;background:#10b981;">${newPremium} €</div>
      </div>
      <div class="risk-premium-bar-labels">
        <span style="color:#ef4444;">Prime actuelle</span>
        <span style="color:#10b981;">Nouvelle prime</span>
      </div>
    `;
  }

  // ── Savings recap ──
  setText('riskSavingsTotal', `−${savings.toLocaleString('fr-FR')} €/an`);
  setText('riskCostTotal', `${cost.toLocaleString('fr-FR')} €`);
  const reductionPct = annualPremium > 0 ? Math.round((savings / annualPremium) * 100) : 0;
  setText('riskReductionPct', `−${reductionPct}%`);

  // ── Avenant ──
  setText('riskAvenantPremium', `${newPremium.toLocaleString('fr-FR')} €`);
  setText('riskAvenantFranchise', `${newFranchise.toLocaleString('fr-FR')} €`);
  setText('riskAvenantSavings', `−${savings.toLocaleString('fr-FR')} €/an`);
}

function renderEvaluateTab(): void {
  renderComponents();
  renderEvaluateMetrics();
}

function updateGauge(arcId: string, valId: string, score: number, color: string): void {
  const circumference = 251; // 2 * π * 40 for r=40
  const offset = circumference - (score / 100) * circumference;

  const arc = document.getElementById(arcId) as SVGPathElement | null;
  const val = document.getElementById(valId);
  if (arc) {
    arc.setAttribute('stroke-dashoffset', String(offset));
    arc.setAttribute('stroke', color);
  }
  if (val) val.textContent = String(score);
}

function generateAvenant(): void {
  const works = Array.from(state.selectedWorks);
  const currentScore = computeCurrentScore();
  const projectedScore = computeProjectedScore(works);
  const diff = projectedScore - currentScore;
  const savings = computeSavings(works);
  const annualPremium = 1240;
  const newPremium = Math.max(0, annualPremium - savings);
  const currentFranchise = 500;
  const reductionRatio = Math.max(0.3, 1 - (diff / 100));
  const newFranchise = Math.max(100, Math.round(currentFranchise * reductionRatio));
  const expiry = new Date();
  expiry.setFullYear(expiry.getFullYear() + 3);

  const modalHtml = `
    <div class="modal-overlay open" id="riskAvenantModal">
      <div class="modal-dialog" style="max-width:520px;">
        <div class="modal-header">
          <h3>Avenant — Confirmation</h3>
          <button class="modal-close" id="riskAvenantClose"><span class="material-symbols-outlined">close</span></button>
        </div>
        <div class="modal-body">
          <div class="avenant-confirm-details">
            <p><strong>Référence police :</strong> POL-${String(Date.now()).slice(-6)}</p>
            <p><strong>Nouvelle prime annuelle :</strong> ${newPremium.toLocaleString('fr-FR')} € <span style="color:#10b981;">(−${savings} €/an)</span></p>
            <p><strong>Nouvelle franchise :</strong> ${newFranchise.toLocaleString('fr-FR')} € <span style="color:#10b981;">(−${currentFranchise - newFranchise} €)</span></p>
            <p><strong>Clause de non-résiliation :</strong> Jusqu'au ${expiry.toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
            <p><strong>Amélioration du score :</strong> ${currentScore} → ${projectedScore} <span style="color:#10b981;">(+${diff} pts)</span></p>
            <p><strong>Travaux validés :</strong> ${works.length} composants (${works.map(w => housePartData[w]?.label || w).join(', ')})</p>
          </div>
          <p style="font-size:11px;color:var(--text-muted);padding:8px 0;border-top:1px solid var(--border-color);">
            En confirmant, vous acceptez d'émettre un avenant au contrat existant intégrant la clause de non-résiliation et la réduction de franchise calculée.
          </p>
        </div>
        <div class="modal-footer">
          <button class="risk-btn secondary" id="riskAvenantCancel">Annuler</button>
          <button class="risk-btn" id="riskAvenantConfirm">
            <span class="material-symbols-outlined">check</span> Confirmer l'avenant
          </button>
        </div>
      </div>
    </div>
  `;

  // Append modal
  const existing = document.getElementById('riskAvenantModal');
  if (existing) existing.remove();
  document.body.insertAdjacentHTML('beforeend', modalHtml);

  // Wire modal buttons
  document.getElementById('riskAvenantClose')?.addEventListener('click', () => {
    document.getElementById('riskAvenantModal')?.remove();
  });
  document.getElementById('riskAvenantCancel')?.addEventListener('click', () => {
    document.getElementById('riskAvenantModal')?.remove();
  });
  document.getElementById('riskAvenantConfirm')?.addEventListener('click', () => {
    document.getElementById('riskAvenantModal')?.remove();
    // Update UI
    const confirmEl = document.getElementById('riskGenAvenant');
    if (confirmEl) {
      confirmEl.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px!important;">check</span> Avenant émis ✓';
      setTimeout(() => {
        confirmEl.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px!important;">description</span> Générer l\'avenant';
      }, 3000);
    }
    alert('Avenant émis avec succès ! Les nouvelles conditions ont été appliquées au contrat.');
  });
}
