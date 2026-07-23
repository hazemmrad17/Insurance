/**
 * Landing — Marketing landing page and portal gateway controller.
 */

import { navigateTo, setRole } from '../../router.js';

export function showLandingPage(): void {
  // Hide all auth views & view panels inside dashboard container
  document.querySelectorAll('.auth-view').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.view-panel').forEach(el => el.classList.remove('active'));

  // Show the landing page
  const landing = document.getElementById('view-landing');
  if (landing) landing.classList.add('active');

  // Hide dashboard container shell
  const dashboard = document.querySelector('.dashboard-container') as HTMLElement | null;
  if (dashboard) dashboard.style.display = 'none';
}

export function hideLandingPage(): void {
  const landing = document.getElementById('view-landing');
  if (landing) landing.classList.remove('active');

  const dashboard = document.querySelector('.dashboard-container') as HTMLElement | null;
  if (dashboard) dashboard.style.display = '';
}

export function initLanding(): void {
  wireLandingCtas();
}

function wireLandingCtas(): void {
  // Insurer / Advisor CTA
  document.querySelectorAll('.landing-cta-assureur').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      hideLandingPage();
      setRole('assureur');
      navigateTo('overview');
    });
  });

  // Policyholder / Assuré CTA
  document.querySelectorAll('.landing-cta-assure').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      hideLandingPage();
      setRole('assure');
      navigateTo('assure-bien');
    });
  });
}
