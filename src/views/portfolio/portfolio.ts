/**
 * Portfolio view module.
 * The Portfolio sub-tabs (Summary, Map, Trends) are rendered via static HTML.
 * Interactions are handled by cross-navigation in router.ts.
 */
import { initPortfolioMap, destroyPortfolioMap } from './portfolio-map.js';

export function initPortfolio(): void {
  // Initialize map if the Map sub-tab is active
  const mapTab = document.querySelector('.portfolio-tab-content[data-content="map"]');
  if (mapTab?.classList.contains('active')) {
    requestAnimationFrame(() => initPortfolioMap());
  }
}

export function onPortfolioTabChange(tabKey: string): void {
  if (tabKey === 'map') {
    requestAnimationFrame(() => initPortfolioMap());
  } else {
    destroyPortfolioMap();
  }
}

export function destroyPortfolio(): void {
  destroyPortfolioMap();
}
