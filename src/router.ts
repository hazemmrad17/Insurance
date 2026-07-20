/**
 * Router — handles view switching, URL routing, header tab management, modals,
 * sidebar navigation, header actions, and cross-view navigation.
 */

import { initClimateMap, destroyClimateMap } from './views/climate-map/climate-map.js';
import { initHouse, destroyHouse } from './house3d.js';

// ── View Config ────────────────────────────────────────────────
export const VIEW_TABS: Record<string, string[]> = {
  overview: ['Summary', 'Progress', 'Timeline', 'Work Areas'],
  map: ['Overview', 'Comparison'],
  property: ['Data', 'Risks', 'ROI', 'Recommendations', 'Documents'],
  portfolio: ['Summary', 'Map', 'Trends'],
  assessments: ['All', 'Pending', 'Completed'],
  clients: ['Info', 'Contracts', 'Documents'],
  settings: ['Account', 'Security', 'Billing & Plans', 'Notifications', 'Connections'],
};

// Map view name → base path
const ROUTES: Record<string, string> = {
  overview: '/overview',
  map: '/map',
  property: '/property',
  portfolio: '/portfolio',
  assessments: '/assessments',
  clients: '/clients',
  settings: '/settings',
};

// Sub-tab keys per view that support deep-linking
const SUB_TAB_KEYS: Record<string, string[]> = {
  portfolio: ['summary', 'map', 'trends'],
  assessments: ['all', 'pending', 'completed'],
  clients: ['info', 'contracts', 'documents'],
  settings: ['account', 'security', 'billing', 'notifications', 'connections'],
};

// Maps view+tab-key → content-key for showViewSubTab
const SUB_TAB_CONTENT: Record<string, Record<string, string>> = {
  portfolio: { summary: 'summary', map: 'map', trends: 'trends' },
  assessments: { all: 'all', pending: 'pending', completed: 'completed' },
  clients: { info: 'info', contracts: 'contracts', documents: 'documents' },
  settings: { account: 'account', security: 'security', billing: 'billing', notifications: 'notifications', connections: 'connections' },
};

// ── Sub-tab helper: activate sub-tab for a view by tab-key ──
function activateSubTab(viewName: string, tabKey: string): void {
  if (viewName === 'property') {
    showPropertySubTab(tabKey);
    return;
  }
  if (SUB_TAB_CONTENT[viewName]?.[tabKey]) {
    showViewSubTab(viewName, tabKey);
  }
}

/* ── Parse URL path into { view, subTab? } ───────────────── */
function parseUrl(path: string): { view: string; subTab?: string } {
  // Remove trailing slash
  const clean = path.replace(/\/$/, '');
  const parts = clean.split('/').filter(Boolean); // ['', 'clients', 'contracts'] → ['clients', 'contracts']

  if (parts.length === 0) return { view: 'overview' };

  const viewName = parts[0];
  const subTab = parts.length > 1 ? parts[1] : undefined;

  // Validate view name
  if (!ROUTES[viewName]) return { view: 'overview' };

  // Validate sub-tab for this view
  if (subTab && SUB_TAB_KEYS[viewName]?.includes(subTab)) {
    return { view: viewName, subTab };
  }

  return { view: viewName };
}

/* ── Build URL path from view name and optional sub-tab ──── */
function buildPath(viewName: string, subTab?: string): string {
  const base = ROUTES[viewName] || `/${viewName}`;
  if (subTab && SUB_TAB_KEYS[viewName]?.includes(subTab)) {
    return `${base}/${subTab}`;
  }
  return base;
}

/* ── Navigate to a view/sub-tab (updates URL + switches view) ─ */
export function navigateTo(viewName: string, subTab?: string): void {
  const path = buildPath(viewName, subTab);
  window.history.pushState({ view: viewName, subTab: subTab || null }, '', path);
  switchView(viewName, subTab);
}

/* ── Handle browser back/forward ───────────────────────────── */
function setupPopstate(): void {
  window.addEventListener('popstate', (e) => {
    const state = e.state as { view?: string; subTab?: string | null } | null;
    if (state?.view) {
      switchView(state.view, state.subTab || undefined);
    } else {
      const { view, subTab } = parseUrl(window.location.pathname);
      switchView(view, subTab);
    }
  });
}

/* ── Get initial view/sub-tab from URL ────────────────────── */
function getInitialRoute(): { view: string; subTab?: string } {
  return parseUrl(window.location.pathname);
}

/* ── Activate nav item for the given view ──────────────────── */
function activateNavItem(viewName: string): void {
  const navItems = document.querySelectorAll('.sidebar-nav .nav-item');
  navItems.forEach(nav => {
    const v = nav.getAttribute('data-view');
    nav.classList.toggle('active', v === viewName);
  });
}

// ── Sidebar Toggle ─────────────────────────────────────────────
export function setupSidebarToggle(): void {
  const sidebar = document.getElementById('sidebar');
  const toggleBtn = document.getElementById('sidebarToggle');
  const toggleIcon = toggleBtn?.querySelector('.toggle-icon');

  if (sidebar && toggleBtn && toggleIcon) {
    const isExpanded = sidebar.classList.contains('expanded');
    toggleBtn.setAttribute('aria-expanded', String(isExpanded));
    toggleIcon.textContent = isExpanded ? 'menu_open' : 'menu';

    toggleBtn.addEventListener('click', () => {
      const nowExpanded = sidebar.classList.toggle('expanded');
      toggleBtn.setAttribute('aria-expanded', String(nowExpanded));
      toggleIcon.textContent = nowExpanded ? 'menu_open' : 'menu';
      window.dispatchEvent(new Event('resize'));
    });
  }
}

// ── Sidebar Navigation ─────────────────────────────────────────
export function setupSidebarNavigation(): void {
  const navItems = document.querySelectorAll('.sidebar-nav .nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const viewName = item.getAttribute('data-view');
      if (!viewName || viewName === 'logout') return;
      activateNavItem(viewName);
      // Sidebar clicks go to the first sub-tab (no sub-tab = show first tab)
      navigateTo(viewName);
    });
  });

  // Activate initial view from URL
  const { view, subTab } = getInitialRoute();
  activateNavItem(view);
  switchView(view, subTab);
}

// ── View Switching ─────────────────────────────────────────────
export function switchView(viewName: string, subTab?: string): void {
  document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
  const targetView = document.getElementById(`view-${viewName}`);
  if (targetView) targetView.classList.add('active');
  updateHeaderTabs(viewName, subTab);

  // Lifecycle for view-specific modules
  if (viewName === 'map') {
    requestAnimationFrame(() => initClimateMap());
  } else {
    destroyClimateMap();
  }

  if (viewName === 'property') {
    requestAnimationFrame(() => initHouse('houseContainer'));
  } else {
    destroyHouse();
  }
}

// ── Header Tabs ────────────────────────────────────────────────
export function updateHeaderTabs(viewName: string, activeTabKey?: string): void {
  const headerTabs = document.getElementById('headerTabs');
  if (!headerTabs) return;

  const tabNames = VIEW_TABS[viewName] || VIEW_TABS.property;
  const subTabKeys = SUB_TAB_KEYS[viewName] || [];
  const settingsIcons: Record<string, string> = {
    account: 'person', security: 'lock', 'billing & plans': 'credit_card',
    notifications: 'notifications', connections: 'link',
  };

  // Active key: use provided, or default to first sub-tab key
  const activeKey = activeTabKey || subTabKeys[0] || '';

  headerTabs.innerHTML = tabNames.map((name, i) => {
    const rawKey = name.toLowerCase();
    // Use canonical key from SUB_TAB_KEYS when available (handles 'billing & plans' → 'billing')
    const tabKey = subTabKeys[i] || rawKey;
    const icon = viewName === 'settings' && settingsIcons[rawKey]
      ? `<span class="material-symbols-outlined tab-icon">${settingsIcons[rawKey]}</span>`
      : '';
    const isActive = tabKey === activeKey;
    return `<button class="tab-btn ${isActive ? 'active' : ''}" data-tab="${tabKey}">${icon}${name}</button>`;
  }).join('');

  setupHeaderTabs();

  // If we have an active tab key, activate its content
  if (activeTabKey) {
    activateSubTab(viewName, activeTabKey);
  }
}

export function setupHeaderTabs(): void {
  const tabs = document.querySelectorAll('.header-tabs .tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const tabKey = tab.getAttribute('data-tab');
      if (!tabKey) return;

      const activeView = document.querySelector('.sidebar-nav .nav-item.active');
      const viewName = activeView?.getAttribute('data-view') || '';

      // Update URL with sub-tab
      navigateTo(viewName, tabKey);
    });
  });
}

// ── Sub-Tab Content Switching ──────────────────────────────────
export function showPropertySubTab(tabName: string): void {
  const panels = document.querySelectorAll('.prop-tab-content');
  if (!panels.length) return;
  const map: Record<string, string> = {
    data: 'data', risks: 'risks', roi: 'roi',
    recommendations: 'recommendations', documents: 'documents',
  };
  const contentKey = map[tabName];
  if (!contentKey) return;
  panels.forEach(el => el.classList.remove('active'));
  const target = document.querySelector(`.prop-tab-content[data-content="${contentKey}"]`);
  if (target) target.classList.add('active');
}

export function showViewSubTab(viewName: string, tabName: string): void {
  const prefix = viewName === 'map' ? 'map' : viewName === 'portfolio' ? 'portfolio'
    : viewName === 'assessments' ? 'assess' : viewName === 'clients' ? 'clients' : 'settings';
  const selector = `.${prefix}-tab-content`;
  const panels = document.querySelectorAll(selector);
  if (!panels.length) return;

  const contentKey = SUB_TAB_CONTENT[viewName]?.[tabName];
  if (!contentKey) {
    // Fallback: tabName may already be the content key
    const target = document.querySelector(`${selector}[data-content="${tabName}"]`);
    if (target) {
      panels.forEach(el => el.classList.remove('active'));
      target.classList.add('active');
    }
    return;
  }
  panels.forEach(el => el.classList.remove('active'));
  const target = document.querySelector(`${selector}[data-content="${contentKey}"]`);
  if (target) target.classList.add('active');
}

// ── Modals ─────────────────────────────────────────────────────
export function openModal(id: string): void {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('open');
}

export function closeModal(id: string): void {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('open');
}

export function setupModals(): void {
  const pdfClose = document.getElementById('pdfViewerClose');
  if (pdfClose) pdfClose.addEventListener('click', () => closeModal('pdfViewer'));

  const reportClose = document.getElementById('reportModalClose');
  if (reportClose) reportClose.addEventListener('click', () => closeModal('reportModal'));

  const printBtn = document.getElementById('reportPrintBtn');
  if (printBtn) printBtn.addEventListener('click', () => window.print());

  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.remove('open');
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
    }
  });
}

// ── Header Actions ─────────────────────────────────────────────
export function setupHeaderActions(): void {
  const themeBtn = document.getElementById('headerThemeToggle');
  if (themeBtn) {
    const saved = localStorage.getItem('previa-dark-mode');
    if (saved === 'true') document.documentElement.classList.add('dark-mode');

    themeBtn.addEventListener('click', () => {
      const isDark = document.documentElement.classList.toggle('dark-mode');
      localStorage.setItem('previa-dark-mode', String(isDark));
      const settingsToggle = document.getElementById('settingsDarkMode') as HTMLInputElement | null;
      if (settingsToggle) settingsToggle.checked = isDark;
    });
  }

  // Profile dropdown
  const trigger = document.getElementById('profileTrigger');
  const menu = document.getElementById('profileMenu');
  if (trigger && menu) {
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.classList.toggle('open');
    });

    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (!menu.contains(target) && !trigger.contains(target)) menu.classList.remove('open');
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') menu.classList.remove('open');
    });

    menu.querySelectorAll('.profile-menu-item').forEach(item => {
      item.addEventListener('click', () => {
        menu.classList.remove('open');
        const action = (item as HTMLElement).getAttribute('data-action');
        if (!action) return;

        switch (action) {
          case 'settings': {
            navigateTo('settings');
            break;
          }
          case 'profile': {
            navigateTo('settings', 'account');
            break;
          }
          case 'logout':
            if (confirm('Êtes-vous sûr de vouloir vous déconnecter ?')) {
              localStorage.removeItem('previa-dark-mode');
              window.location.reload();
            }
            break;
          default: {
            const labels: Record<string, string> = { billing: 'Plan & Facturation', pricing: 'Tarifs', faq: 'FAQ' };
            alert(`Page « ${labels[action] || action} » — À implémenter.`);
          }
        }
      });
    });
  }
}

// ── Cross-View Navigation ──────────────────────────────────────
export function setupCrossNavigation(): void {
  // Portfolio → Property or Clients
  document.querySelectorAll('.portfolio-prop').forEach(card => {
    card.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('.portfolio-prop-client')) {
        navigateTo('clients');
        return;
      }
      navigateTo('property');
    });
  });

  // Assessments → Property
  document.querySelectorAll('.assess-view[data-addr]').forEach(btn => {
    btn.addEventListener('click', () => {
      navigateTo('property');
    });
  });

  // Assessments → Clients
  document.querySelectorAll('.assess-view-client').forEach(btn => {
    btn.addEventListener('click', () => {
      navigateTo('clients');
    });
  });
}

// ── Initialize Router (called from main.ts) ──────────────────
export function initRouter(): void {
  setupPopstate();

  // Set initial URL state
  const { view, subTab } = getInitialRoute();
  const path = buildPath(view, subTab);
  window.history.replaceState({ view, subTab: subTab || null }, '', path);
}
