/**
 * Property Risk Hub — Unified Map + 3D Viewer + Underwriter
 *
 * Three-step workflow within one view:
 *   1. Locate   → BDNB building map + address search + live risk assessment
 *   2. Expert   → Live risk data from orchestrator (BDNB, Géorisques, IGN, climate)
 *   3. Inspect  → 3D house viewer + component scores + recommendations
 *   4. Evaluate → Live per-peril scores + actuarial impact + avenant
 *
 * Shared state via RiskState singleton persists across all four steps.
 */

import { housePartData, selectHousePart, onHousePartSelect } from '../../house3d.js';
import { initClimateMap, destroyClimateMap, escapeHtml } from '../climate-map/climate-map.js';
import { initHouse, destroyHouse } from '../../house3d.js';
import { RiskState } from './risk-state.js';
import { scoreAll, scoreProjected, PERIL_META } from '../../risk-assessment/scoring-engine.js';
import { setResultsPanelContainer, renderResults, renderLoadingState } from '../../risk-assessment/results-panel.js';
import { orchestrate } from '../../risk-assessment/risk-orchestrator.js';

/* ═══════════════════════════════════════════════════════════════
   State
   ═══════════════════════════════════════════════════════════════ */

interface ViewState {
  selectedAddress: string | null;
  selectedBuilding: Record<string, string> | null; // BDNB attributes
  selectedWorks: Set<string>;
}

let initialized = false;
const state: ViewState = {
  selectedAddress: null,
  selectedBuilding: null,
  selectedWorks: new Set(),
};

// Re-derive selectedWorks from per-peril keys for Evaluate tab
let selectedPerils: Set<string> = new Set();

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

/* ═══════════════════════════════════════════════════════════════
   Exported API
   ═══════════════════════════════════════════════════════════════ */

export function initPropertyRisk(): void {
  if (initialized) return;
  initialized = true;

  // Default: all perils selected for Evaluate tab
  selectedPerils = new Set(PERIL_META.map(p => p.key));

  setupStepNav();
  setupRiskNav();
  setupMoreMenu();
  setupMapInterop();
  setupAddressSearch();
  setupResultsPanel();
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
  locate: 'Localiser',
  expert: 'Expert',
  inspect: 'Inspecter',
  evaluate: 'Évaluer',
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
    const view = document.getElementById('view-property-risk');
    if (!view?.classList.contains('active')) return;

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
  if (headerTabs) {
    headerTabs.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
    const btn = headerTabs.querySelector(`.tab-btn[data-tab="${tabKey}"]`);
    if (btn) btn.classList.add('active');
  }

  const panels = document.querySelectorAll('.risk-tab-content');
  panels.forEach(el => el.classList.remove('active'));
  const target = document.querySelector(`.risk-tab-content[data-content="${tabKey}"]`);
  if (target) target.classList.add('active');

  window.history.pushState(
    { view: 'property-risk', subTab: tabKey },
    '',
    `/risk-hub/${tabKey}`
  );

  onRiskTabChange(tabKey);
}

function updateRiskNav(): void {
  const prevBtn = document.getElementById('riskNavPrev');
  const nextBtn = document.getElementById('riskNavNext');
  if (!prevBtn || !nextBtn) return;

  const activeTab = getActiveRiskTab();
  const idx = TAB_ORDER.indexOf(activeTab);

  prevBtn.classList.toggle('visible', idx > 0);
  nextBtn.classList.toggle('visible', idx < TAB_ORDER.length - 1);

  if (idx > 0) {
    const prevTab = TAB_ORDER[idx - 1];
    prevBtn.setAttribute('aria-label', `Précédent: ${TAB_LABELS[prevTab]}`);
    prevBtn.title = `${TAB_LABELS[prevTab]} (←)`;
  }
  if (idx < TAB_ORDER.length - 1) {
    const nextTab = TAB_ORDER[idx + 1];
    nextBtn.setAttribute('aria-label', `Suivant: ${TAB_LABELS[nextTab]}`);
    nextBtn.title = `${TAB_LABELS[nextTab]} (→)`;
  }

  document.querySelectorAll('.risk-step').forEach(el => {
    const tab = el.getAttribute('data-step') || '';
    const tabIdx = TAB_ORDER.indexOf(tab);
    el.classList.toggle('nav-adjacent', Math.abs(tabIdx - idx) === 1 && tabIdx !== idx);
  });
}

/* ── 3-dots More Menu ────────────────────────────────────── */

function setupMoreMenu(): void {
  const moreBtn = document.getElementById('riskMoreBtn');
  const moreMenu = document.getElementById('riskMoreMenu');
  if (!moreBtn || !moreMenu) return;

  moreBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    moreMenu.classList.toggle('open');
  });

  document.addEventListener('click', (e) => {
    if (!moreMenu.contains(e.target as Node) && e.target !== moreBtn) {
      moreMenu.classList.remove('open');
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') moreMenu.classList.remove('open');
  });

  moreMenu.querySelectorAll('.risk-more-item').forEach(item => {
    item.addEventListener('click', () => {
      const action = (item as HTMLElement).getAttribute('data-action');
      moreMenu.classList.remove('open');

      switch (action) {
        case 'export':
          const exportBtn = document.getElementById('rpExportBtn');
          if (exportBtn) {
            exportBtn.click();
          } else {
            showToast('<div class="risk-toast-body">Aucune donnée à exporter — recherchez d\'abord une adresse.</div>', 3000);
          }
          break;

        case 'print':
          window.print();
          break;

        case 'darkmode':
          const html = document.documentElement;
          const isDark = html.classList.toggle('dark-mode');
          localStorage.setItem('previa-dark-mode', String(isDark));
          const settingsToggle = document.getElementById('settingsDarkMode') as HTMLInputElement | null;
          if (settingsToggle) settingsToggle.checked = isDark;
          showToast(`<div class="risk-toast-body">${isDark ? '🌙 Mode sombre activé' : '☀️ Mode clair activé'}</div>`, 2000);
          break;

        case 'reset':
          if (confirm('Réinitialiser la recherche et l\'évaluation en cours ?')) {
            state.selectedAddress = null;
            state.selectedBuilding = null;
            selectedPerils = new Set(PERIL_META.map(p => p.key));
            RiskState.clear();
            const panel = document.getElementById('riskResultsPanel');
            if (panel) {
              panel.innerHTML = `
                <div class="rp-empty-state">
                  <span class="material-symbols-outlined" style="font-size:40px;color:var(--text-muted);opacity:0.3;">gps_fixed</span>
                  <p style="font-size:12px;color:var(--text-muted);margin:0;">Recherchez une adresse pour voir l'évaluation complète des risques</p>
                </div>`;
            }
            navigateToTab('locate');
            showToast('<div class="risk-toast-body">✅ Évaluation réinitialisée</div>', 2000);
          }
          break;
      }
    });
  });
}

/* ── Tab lifecycle interop ────────────────────────────────── */

export function onRiskTabChange(tabKey: string): void {
  updateSteps(tabKey);
  updateRiskNav();

  if (tabKey === 'locate') {
    const container = document.getElementById('climateMapContainer');
    if (container && container.offsetWidth === 0) {
      container.style.width = '100%';
      container.style.height = '400px';
    }
    requestAnimationFrame(() => initClimateMap());
    renderLocatePanel();
  }

  if (tabKey === 'expert') {
    renderExpertTab();
  }

  if (tabKey === 'inspect') {
    requestAnimationFrame(() => initHouse('riskHouseContainer'));
    renderInspectTab();
  } else if (tabKey !== 'expert') {
    destroyHouse();
  }

  if (tabKey === 'evaluate') {
    renderEvaluateTab();
  }
}

/* ═══════════════════════════════════════════════════════════════
   TAB 1: LOCATE — Address search + Map + Orchestrate pipeline
   ═══════════════════════════════════════════════════════════════ */

/** Debounce helper */
function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout>;
  return ((...args: any[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}

function setupAddressSearch(): void {
  const searchInput = document.getElementById('riskAddressSearch') as HTMLInputElement | null;
  if (!searchInput) return;

  let autocompleteContainer: HTMLElement | null = null;

  const doSearch = debounce(async (query: string) => {
    if (query.length < 3) {
      removeAutocomplete();
      return;
    }

    try {
      const res = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=5&autocomplete=1`);
      if (!res.ok) return;
      const data = await res.json();

      if (!autocompleteContainer) {
        autocompleteContainer = document.createElement('div');
        autocompleteContainer.className = 'risk-address-autocomplete';
        searchInput.parentNode?.appendChild(autocompleteContainer);
      }

      if (!data.features?.length) {
        autocompleteContainer.innerHTML = '<div class="ra-item ra-no-results">Aucune adresse trouvée</div>';
        return;
      }

      autocompleteContainer.innerHTML = data.features.map((f: any) => {
        const props = f.properties;
        const label = props.label || props.name || '';
        const context = props.context || '';
        return `<div class="ra-item" data-lon="${f.geometry.coordinates[0]}" data-lat="${f.geometry.coordinates[1]}" data-id="${props.id || ''}" data-label="${escapeHtml(label)}">
          <span class="material-symbols-outlined">location_on</span>
          <div><div class="ra-label">${escapeHtml(label)}</div><div class="ra-context">${escapeHtml(context)}</div></div>
        </div>`;
      }).join('');

      // Wire autocomplete item clicks
      autocompleteContainer.querySelectorAll('.ra-item').forEach(item => {
        item.addEventListener('click', () => {
          const lon = parseFloat((item as HTMLElement).getAttribute('data-lon') || '0');
          const lat = parseFloat((item as HTMLElement).getAttribute('data-lat') || '0');
          const banId = (item as HTMLElement).getAttribute('data-id') || undefined;
          const label = (item as HTMLElement).getAttribute('data-label') || query;

          searchInput.value = label;
          removeAutocomplete();

          // Start assessment
          startAssessment(lon, lat, label, banId);
        });
      });
    } catch {
      // Silently fail
    }
  }, 300);

  searchInput.addEventListener('input', (e) => {
    doSearch((e.target as HTMLInputElement).value);
  });

  searchInput.addEventListener('blur', () => {
    setTimeout(removeAutocomplete, 200);
  });

  function removeAutocomplete(): void {
    if (autocompleteContainer) {
      autocompleteContainer.remove();
      autocompleteContainer = null;
    }
  }
}

let abortController: AbortController | null = null;

async function startAssessment(lon: number, lat: number, addressLabel: string, banId?: string): Promise<void> {
  // Cancel any in-flight assessment
  if (abortController) {
    abortController.abort();
  }

  RiskState.clear();
  RiskState.setCoords({ lat, lon });
  RiskState.setAddress(addressLabel);
  RiskState.setBanId(banId || null);
  RiskState.setLoading(true);

  const container = document.getElementById('riskResultsPanel');
  if (container) {
    renderLoadingState({ message: 'Démarrage de l\'évaluation…', done: 0, total: 8 });
  }

  try {
    const assessment = await orchestrate(
      { lon, lat, addressLabel, banId },
      (progress) => {
        RiskState.setLoadingProgress(progress);
        if (container) renderLoadingState(progress);
      },
    );

    // Compute scores
    const scores = scoreAll(assessment);

    RiskState.setAssessment(assessment);
    RiskState.setScores(scores);
    RiskState.setLoading(false);

    // Show results in Expert tab
    if (container) renderResults(assessment);

    // Navigate to Expert tab
    const expertTab = document.querySelector('.tab-btn[data-tab="expert"]') as HTMLButtonElement | null;
    if (expertTab) expertTab.click();

    showToast(`<div class="risk-toast-body">✅ Évaluation terminée — ${assessment.metadata.communeName}</div>`, 3000);
  } catch (err: any) {
    if (err?.name === 'AbortError') return; // Cancelled by new search
    RiskState.setLoading(false);
    showToast('<div class="risk-toast-body">❌ Erreur lors de l\'évaluation. Veuillez réessayer.</div>', 5000);
  }
}

function setupMapInterop(): void {
  const observer = new MutationObserver(() => {
    const bdnbCard = document.querySelector('.bdnb-building-card');
    if (bdnbCard) {
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

  const timeoutId = setTimeout(removeToast, durationMs);

  toast.addEventListener('mouseenter', () => clearTimeout(timeoutId));
  toast.addEventListener('mouseleave', () => setTimeout(removeToast, durationMs));

  return removeToast;
}

function renderLocatePanel(): void {
  if (!state.selectedBuilding && !state.selectedAddress) {
    const floatBtn = document.getElementById('riskLocateFloatBtn');
    if (floatBtn) floatBtn.classList.remove('visible');
    return;
  }

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
   TAB 2: EXPERT — Live risk data from orchestrator
   ═══════════════════════════════════════════════════════════════ */

/** Wire the results panel container once */
function setupResultsPanel(): void {
  const container = document.getElementById('riskResultsPanel');
  if (container) {
    setResultsPanelContainer(container);
  }
}

function renderExpertTab(): void {
  const assessment = RiskState.getAssessment();

  if (!assessment) {
    // Show "search first" prompt
    const container = document.getElementById('riskResultsPanel');
    if (container) {
      container.innerHTML = `
        <div class="rp-empty-state" style="display:flex;flex-direction:column;align-items:center;gap:12px;padding:40px 24px;">
          <span class="material-symbols-outlined" style="font-size:48px;color:var(--text-muted);opacity:0.3;">search</span>
          <p style="font-size:13px;color:var(--text-secondary);text-align:center;max-width:280px;">
            Recherchez d'abord une adresse dans l'onglet <strong>Localisation</strong> pour voir l'évaluation complète des risques.
          </p>
          <button class="risk-btn" id="riskExpertGoLocate" style="max-width:200px;">
            <span class="material-symbols-outlined">location_on</span>
            Aller à la Localisation
          </button>
        </div>`;

      const goBtn = document.getElementById('riskExpertGoLocate');
      if (goBtn) {
        goBtn.onclick = () => navigateToTab('locate');
      }
    }
    return;
  }

  // Render live data into the results panel
  const container = document.getElementById('riskResultsPanel');
  if (container) {
    renderResults(assessment);
  }

  // Check if scores are computed
  const scores = RiskState.getScores();
  if (scores) {
    // Update the Expert tab sidebar with score summary
    const summaryEl = document.getElementById('riskExpertScoreSummary');
    if (summaryEl) {
      const scoreColor = getColorForScore(scores.global);
      summaryEl.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;">
          <div style="width:48px;height:48px;border-radius:50%;background:${scoreColor}20;display:flex;align-items:center;justify-content:center;">
            <span style="font-size:18px;font-weight:700;color:${scoreColor};">${scores.global}</span>
          </div>
          <div>
            <div style="font-size:12px;font-weight:600;color:var(--text-primary);">Score global</div>
            <div style="font-size:10px;color:var(--text-muted);">Basé sur ${Object.keys(scores).length - 1} périls</div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:8px;">
          ${PERIL_META.map(p => {
            const val = (scores as any)[p.key] || 0;
            const c = getColorForScore(val);
            return `<div style="display:flex;justify-content:space-between;padding:4px 6px;background:var(--bg-panel);border-radius:4px;font-size:10px;">
              <span style="color:var(--text-secondary);">${p.label.split(' ')[0]}</span>
              <span style="color:${c};font-weight:600;">${val}</span>
            </div>`;
          }).join('')}
        </div>`;
    }
  }
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
  const firstId = Object.keys(housePartData)[0];
  if (firstId) selectHousePart(firstId);
}

function renderComponents(): void {
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

  for (const id of gridIds) {
    const grid = document.getElementById(id);
    if (grid) grid.innerHTML = gridHtml;
  }

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
   TAB 4: EVALUATE — Live per-peril scores + Actuarial + Avenant
   ═══════════════════════════════════════════════════════════════ */

function setupEvaluate(): void {
  const genBtn = document.getElementById('riskGenAvenant');
  if (genBtn) {
    genBtn.addEventListener('click', () => {
      const perils = Array.from(selectedPerils);
      if (perils.length === 0) {
        alert('Veuillez sélectionner au moins un péril à atténuer.');
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

/** Recalculate and update all Evaluate tab KPIs/metrics from live scores */
function renderEvaluateMetrics(): void {
  const scores = RiskState.getScores();
  if (!scores) {
    // No assessment yet — show empty state
    const gaugeContainer = document.getElementById('riskEvaluateGauges');
    if (gaugeContainer) {
      gaugeContainer.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;gap:12px;padding:40px;text-align:center;">
          <span class="material-symbols-outlined" style="font-size:48px;color:var(--text-muted);opacity:0.3;">search</span>
          <p style="font-size:13px;color:var(--text-secondary);">Recherchez d'abord une adresse pour voir les scores de risque.</p>
        </div>`;
    }
    return;
  }

  const perils = Array.from(selectedPerils) as ('inondation' | 'rga' | 'tempete' | 'incendie' | 'seisme')[];
  const assessment = RiskState.getAssessment()!;
  const projected = scoreProjected(assessment, perils);

  const currentScore = scores.global;
  const projectedScore = projected.global;
  const diff = projectedScore - currentScore;

  const annualPremium = 1240;
  // Savings: each mitigated peril reduces premium proportionally
  const savingsPerPeril = Math.round(annualPremium * 0.08); // ~8% savings per peril
  const savings = perils.length * savingsPerPeril;
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
  setText('riskCostTotal', `${perils.length * 1500} €`); // ~1500€ per mitigation
  const reductionPct = annualPremium > 0 ? Math.round((savings / annualPremium) * 100) : 0;
  setText('riskReductionPct', `−${reductionPct}%`);

  // ── Avenant ──
  setText('riskAvenantPremium', `${newPremium.toLocaleString('fr-FR')} €`);
  setText('riskAvenantFranchise', `${newFranchise.toLocaleString('fr-FR')} €`);
  setText('riskAvenantSavings', `−${savings.toLocaleString('fr-FR')} €/an`);
}

/** Render per-peril components instead of house part components for Evaluate tab */
function renderPerilComponents(): void {
  const scores = RiskState.getScores();
  if (!scores) {
    renderComponents(); // fallback to house parts
    return;
  }

  const grid = document.getElementById('riskEvaluateComponents');
  if (!grid) return;

  const gridHtml = PERIL_META.map(p => {
    const val = (scores as any)[p.key] as number;
    const selected = selectedPerils.has(p.key);
    const riskColor = val >= 70 ? '#fef2f2' : val >= 50 ? '#fffbeb' : '#ecfdf5';
    const iconColor = val >= 70 ? '#ef4444' : val >= 50 ? '#f59e0b' : '#10b981';
    return `
    <div class="risk-inspect-comp ${selected ? 'selected' : ''}" data-peril="${p.key}">
      <div class="risk-inspect-comp-icon" style="background:${riskColor};">
        <span class="material-symbols-outlined" style="color:${iconColor};">${p.icon}</span>
      </div>
      <span class="risk-inspect-comp-name" style="font-size:10px;">${p.label.length > 20 ? p.label.substring(0, 18) + '…' : p.label}</span>
      <div class="risk-inspect-comp-score-row">
        <span class="risk-inspect-comp-score">${val}</span>
        <span class="risk-badge ${getRiskClass(val)}">${val >= 70 ? 'Élevé' : val >= 50 ? 'Modéré' : 'Faible'}</span>
      </div>
      <div class="risk-inspect-comp-label-toggle">
        <span class="risk-inspect-comp-savings">−${Math.round(val * 0.55)} pts</span>
        <span class="risk-inspect-comp-chip ${selected ? 'active' : ''}" data-peril="${p.key}">
          ${selected ? '✓ Atténué' : '+ Atténuer'}
        </span>
      </div>
    </div>`;
  }).join('');

  grid.innerHTML = gridHtml;

  // Wire clicks
  grid.querySelectorAll('.risk-inspect-comp').forEach(el => {
    el.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.risk-inspect-comp-chip')) return;
      const perilKey = (el as HTMLElement).getAttribute('data-peril');
      if (!perilKey) return;

      if (selectedPerils.has(perilKey)) {
        selectedPerils.delete(perilKey);
      } else {
        selectedPerils.add(perilKey);
      }
      renderPerilComponents();
      renderEvaluateMetrics();
    });
  });

  grid.querySelectorAll('.risk-inspect-comp-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const perilKey = (chip as HTMLElement).getAttribute('data-peril');
      if (!perilKey) return;

      if (selectedPerils.has(perilKey)) {
        selectedPerils.delete(perilKey);
      } else {
        selectedPerils.add(perilKey);
      }
      renderPerilComponents();
      renderEvaluateMetrics();
    });
  });
}

function renderEvaluateTab(): void {
  renderPerilComponents();
  renderEvaluateMetrics();
}

function updateGauge(arcId: string, valId: string, score: number, color: string): void {
  const circumference = 251;
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
  const scores = RiskState.getScores();
  if (!scores) return;
  const perils = Array.from(selectedPerils) as ('inondation' | 'rga' | 'tempete' | 'incendie' | 'seisme')[];
  const assessment = RiskState.getAssessment()!;
  const projected = scoreProjected(assessment, perils);

  const currentScore = scores.global;
  const projectedScore = projected.global;
  const diff = projectedScore - currentScore;

  const annualPremium = 1240;
  const savingsPerPeril = Math.round(annualPremium * 0.08);
  const savings = perils.length * savingsPerPeril;
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
            <p><strong>Périls atténués :</strong> ${perils.length} (${perils.map(p => PERIL_META.find(m => m.key === p)?.label || p).join(', ')})</p>
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

  const existing = document.getElementById('riskAvenantModal');
  if (existing) existing.remove();
  document.body.insertAdjacentHTML('beforeend', modalHtml);

  document.getElementById('riskAvenantClose')?.addEventListener('click', () => {
    document.getElementById('riskAvenantModal')?.remove();
  });
  document.getElementById('riskAvenantCancel')?.addEventListener('click', () => {
    document.getElementById('riskAvenantModal')?.remove();
  });
  document.getElementById('riskAvenantConfirm')?.addEventListener('click', () => {
    document.getElementById('riskAvenantModal')?.remove();
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
