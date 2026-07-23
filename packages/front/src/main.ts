/**
 * Main entry — imports all view modules and initializes the app.
 */
import './base.css';
import './style.css';
import './views/assure/assure.css';
import './views/landing/landing.css';

// Material Web Components
import '@material/web/iconbutton/icon-button.js';
import '@material/web/icon/icon.js';
import '@material/web/elevation/elevation.js';
import '@material/web/slider/slider.js';
import '@material/web/progress/linear-progress.js';
import '@material/web/ripple/ripple.js';

// Core router
import {
  initRouter,
  setupSidebarToggle,
  setupSidebarNavigation,
  setupHeaderActions,
  setupCrossNavigation,
  setupModals,
} from './router.js';

// View modules
import { initClients } from './views/clients/clients.js';
import { initSettings } from './views/settings/settings.js';
import { initOverview } from './views/overview/overview.js';
import { initAuth } from './views/auth/auth.js';
import { initAssure } from './views/assure/assure.js';
import { initLanding } from './views/landing/landing.js';

document.addEventListener('DOMContentLoaded', async () => {
  // Try session restore first (valid JWT cookie → auto-login)
  const { restoreSession } = await import('./views/auth/auth.js');
  await restoreSession();

  // Core app infrastructure
  setupSidebarToggle();
  setupSidebarNavigation();
  setupHeaderActions();
  setupCrossNavigation();
  setupModals();
  initLanding();
  initRouter();

  // View-specific interactions
  initClients();
  initSettings();
  initOverview();
  initAuth();
  void initAssure;
});
