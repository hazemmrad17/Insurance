/**
 * Auth — Cover-style authentication pages (Sign In, Sign Up, Forgot,
 * Reset Password, Two-Step Verification).
 *
 * These are full-viewport pages outside the dashboard shell.
 */

/* ═══════════════════════════════════════════════════════════════
   Navigation
   ═══════════════════════════════════════════════════════════════ */

export function navigateToAuth(page: string): void {
  window.history.pushState({ view: 'auth', authPage: page }, '', '/auth/' + page);
  showAuthPage(page);
}

export function showAuthPage(page: string): void {
  // Hide all auth views
  document.querySelectorAll('.auth-view').forEach(el => el.classList.remove('active'));

  // Show the target auth view
  const target = document.getElementById('auth-' + page);
  if (target) {
    target.classList.add('active');
  }

  // Hide the dashboard shell
  const dashboard = document.querySelector('.dashboard-container') as HTMLElement | null;
  if (dashboard) dashboard.style.display = 'none';
}

/* ═══════════════════════════════════════════════════════════════
   Auth lifecycle
   ═══════════════════════════════════════════════════════════════ */

export function initAuth(): void {
  // Check if we should show an auth page (from URL)
  const path = window.location.pathname;
  const match = path.match(/^\/auth\/(\w+)/);
  if (match) {
    showAuthPage(match[1]);
  }

  wirePasswordToggles();
  wireTwoStepInputs();
  wireAuthLinks();
  wireSubmitButtons();
}

export function destroyAuth(): void {
  // Show the dashboard shell again
  const dashboard = document.querySelector('.dashboard-container') as HTMLElement | null;
  if (dashboard) dashboard.style.display = '';

  // Hide all auth views
  document.querySelectorAll('.auth-view').forEach(el => el.classList.remove('active'));
}

/* ═══════════════════════════════════════════════════════════════
   Password visibility toggle
   ═══════════════════════════════════════════════════════════════ */

function wirePasswordToggles(): void {
  document.querySelectorAll('.auth-input-group').forEach(group => {
    const toggle = group.querySelector('.input-toggle');
    const input = group.querySelector('input[type="password"], input[type="text"]') as HTMLInputElement | null;
    if (!toggle || !input) return;

    // Skip if already wired
    if ((toggle as HTMLElement).getAttribute('data-wired')) return;
    (toggle as HTMLElement).setAttribute('data-wired', 'true');

    toggle.addEventListener('click', () => {
      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      const icon = toggle.querySelector('.material-symbols-outlined');
      if (icon) icon.textContent = isPassword ? 'visibility' : 'visibility_off';
    });
  });
}

/* ═══════════════════════════════════════════════════════════════
   Two-step verification — auto-advance code inputs
   ═══════════════════════════════════════════════════════════════ */

function wireTwoStepInputs(): void {
  const container = document.getElementById('auth-two-step');
  if (!container) return;

  const inputs = container.querySelectorAll('.auth-code-input') as NodeListOf<HTMLInputElement>;
  if (!inputs.length) return;
  if (inputs[0].getAttribute('data-wired')) return;

  inputs.forEach((input, i) => {
    input.setAttribute('data-wired', 'true');

    input.addEventListener('input', () => {
      input.value = input.value.replace(/[^0-9]/g, '').slice(0, 1);
      input.classList.toggle('filled', input.value.length === 1);

      // Auto-advance to next input
      if (input.value.length === 1 && i < inputs.length - 1) {
        inputs[i + 1].focus();
      }
    });

    input.addEventListener('keydown', (e: KeyboardEvent) => {
      // Backspace goes to previous input
      if (e.key === 'Backspace' && !input.value && i > 0) {
        inputs[i - 1].focus();
      }
    });

    // Allow paste into first input
    if (i === 0) {
      input.addEventListener('paste', (e: ClipboardEvent) => {
        e.preventDefault();
        const data = e.clipboardData?.getData('text') || '';
        const digits = data.replace(/[^0-9]/g, '').slice(0, inputs.length);
        digits.split('').forEach((d, j) => {
          if (inputs[j]) {
            inputs[j].value = d;
            inputs[j].classList.toggle('filled', true);
          }
        });
        const nextIndex = Math.min(digits.length, inputs.length - 1);
        inputs[nextIndex].focus();
      });
    }
  });
}

/* ═══════════════════════════════════════════════════════════════
   Auth links — navigate between auth pages
   ═══════════════════════════════════════════════════════════════ */

function wireAuthLinks(): void {
  document.querySelectorAll('.auth-link[data-auth-target]').forEach(link => {
    if ((link as HTMLElement).getAttribute('data-wired')) return;
    (link as HTMLElement).setAttribute('data-wired', 'true');

    link.addEventListener('click', (e) => {
      e.preventDefault();
      const target = (link as HTMLElement).getAttribute('data-auth-target');
      if (target) navigateToAuth(target);
    });
  });
}

/* ═══════════════════════════════════════════════════════════════
   Submit buttons — simulate auth flow then enter dashboard
   ═══════════════════════════════════════════════════════════════ */

function wireSubmitButtons(): void {
  document.querySelectorAll('.auth-submit-btn').forEach(btn => {
    if ((btn as HTMLElement).getAttribute('data-wired')) return;
    (btn as HTMLElement).setAttribute('data-wired', 'true');

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const form = (btn as HTMLElement).closest('.auth-form-card');
      if (!form) return;

      // Simulate submission
      const originalText = btn.innerHTML;
      btn.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px!important;">sync</span> Verification...';
      btn.setAttribute('disabled', 'true');

      setTimeout(() => {
        btn.innerHTML = originalText;
        btn.removeAttribute('disabled');

        // Navigate to dashboard
        import('../../router.js').then(({ navigateTo }) => {
          navigateTo('overview');
        });
      }, 1200);
    });
  });
}
