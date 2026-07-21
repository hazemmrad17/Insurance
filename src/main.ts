/**
 * Main entry — imports all view modules and initializes the app.
 */
import './base.css';
import './style.css';

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

// View modules (initialization is done lazily by the router's switchView)
import { initClients } from './views/clients/clients.js';
import { initSettings } from './views/settings/settings.js';
import { initOverview } from './views/overview/overview.js';
import { initAuth } from './views/auth/auth.js';

document.addEventListener('DOMContentLoaded', () => {
  // Core app infrastructure
  setupSidebarToggle();
  setupSidebarNavigation();
  setupHeaderActions();
  setupCrossNavigation();
  setupModals();
  initRouter();

  // View-specific interactions (lightweight event bindings)
  initClients();
  initSettings();
  initOverview();
  initAuth();
  // Risk Hub (property-risk), Portfolio, and Map are initialized lazily by the router
});
