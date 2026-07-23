/**
 * Settings view module — all settings tabs interactions.
 * Includes Account, Security, Billing & Plans, Notifications, and Connections.
 */

export function initSettings(): void {
  setupDarkModeToggle();
  setupAvatarUpload();
  setupAccountActions();
  setupApiKeyActions();
  setupSourceTestButtons();
  setupPlanButtons();
}

// ── Dark Mode ──────────────────────────────────────────
function setupDarkModeToggle(): void {
  const darkModeToggle = document.getElementById('settingsDarkMode') as HTMLInputElement | null;
  if (!darkModeToggle) return;

  const saved = localStorage.getItem('previa-dark-mode');
  if (saved === 'true') {
    darkModeToggle.checked = true;
    document.documentElement.classList.add('dark-mode');
  }

  darkModeToggle.addEventListener('change', () => {
    document.documentElement.classList.toggle('dark-mode', darkModeToggle.checked);
    localStorage.setItem('previa-dark-mode', String(darkModeToggle.checked));
  });
}

// ── Avatar Upload ──────────────────────────────────────
function setupAvatarUpload(): void {
  const avatarInput = document.getElementById('settingsAvatarInput') as HTMLInputElement | null;
  if (avatarInput) {
    avatarInput.addEventListener('change', () => {
      const label = avatarInput.closest('label');
      if (label) {
        const orig = label.innerHTML;
        label.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px!important;">check_circle</span> Photo téléchargée';
        setTimeout(() => { label.innerHTML = orig; }, 1500);
      }
    });
  }

  const avatarReset = document.getElementById('settingsAvatarReset');
  if (avatarReset) {
    avatarReset.addEventListener('click', () => {
      const img = document.getElementById('settingsAvatar') as HTMLImageElement;
      if (img) img.src = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80';
    });
  }
}

// ── Account Actions ────────────────────────────────────
function setupAccountActions(): void {
  // Delete account
  const deleteConfirm = document.getElementById('settingsDeleteConfirm') as HTMLInputElement | null;
  const deleteBtn = document.getElementById('settingsDeleteAccount') as HTMLButtonElement | null;
  if (deleteConfirm && deleteBtn) {
    deleteConfirm.addEventListener('change', () => {
      deleteBtn.disabled = !deleteConfirm.checked;
    });
    deleteBtn.addEventListener('click', () => {
      const orig = deleteBtn.innerHTML;
      deleteBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px!important;">check</span> Compte désactivé';
      deleteBtn.style.background = '#10b981';
      setTimeout(() => { deleteBtn.innerHTML = orig; deleteBtn.style.background = ''; }, 2000);
    });
  }

  // Account save
  const accountSave = document.getElementById('settingsAccountSave');
  if (accountSave) {
    accountSave.addEventListener('click', (e) => {
      e.preventDefault();
      const orig = accountSave.innerHTML;
      accountSave.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px!important;">check_circle</span> Modifications enregistrées';
      setTimeout(() => { accountSave.innerHTML = orig; }, 1500);
    });
  }

  // Account cancel
  const accountCancel = document.getElementById('settingsAccountCancel');
  if (accountCancel) {
    accountCancel.addEventListener('click', () => {
      (document.getElementById('settingsAccountForm') as HTMLFormElement)?.reset();
    });
  }

  // Preferences save
  const prefsSave = document.getElementById('settingsPrefsSave');
  if (prefsSave) {
    prefsSave.addEventListener('click', () => {
      const orig = prefsSave.innerHTML;
      prefsSave.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px!important;">check_circle</span> Préférences enregistrées';
      setTimeout(() => { prefsSave.innerHTML = orig; }, 1500);
    });
  }
}

// ── API Key Actions ────────────────────────────────────
function setupApiKeyActions(): void {
  document.querySelectorAll('.settings-api-btn[data-action="show"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.settings-api-key-card');
      const code = card?.querySelector('.settings-api-key-code');
      if (!code) return;
      const isHidden = code.textContent?.includes('••••');
      const icon = btn.querySelector('.material-symbols-outlined');
      if (isHidden) {
        const keyId = code.id === 'apiKeyDisplay' ? 'production' : 'sandbox';
        code.textContent = keyId === 'production'
          ? 'pv_sk_live_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a3f8c2'
          : 'pv_sk_test_m1n2o3p4q5r6s7t8u9v0w1x2y3z4a5b6c7d8e9f0g1h2i3j4k5l6m7b7e3d1';
        if (icon) icon.textContent = 'visibility_off';
      } else {
        const prefix = code.id === 'apiKeyDisplay' ? 'pv_sk_••••••••••••••••a3f8c2' : 'pv_sk_••••••••••••••••b7e3d1';
        code.textContent = prefix;
        if (icon) icon.textContent = 'visibility';
      }
    });
  });

  document.querySelectorAll('.settings-api-btn[data-action="copy"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const card = btn.closest('.settings-api-key-card');
      const code = card?.querySelector('.settings-api-key-code');
      if (!code?.textContent) return;
      try {
        await navigator.clipboard.writeText(code.textContent);
        const icon = btn.querySelector('.material-symbols-outlined');
        if (icon) {
          icon.textContent = 'check';
          setTimeout(() => { icon.textContent = 'content_copy'; }, 1000);
        }
      } catch { /* clipboard not available */ }
    });
  });
}

// ── Source Test Buttons ────────────────────────────────
function setupSourceTestButtons(): void {
  document.querySelectorAll('.settings-source-test').forEach(btn => {
    btn.addEventListener('click', () => {
      const orig = btn.textContent;
      (btn as HTMLButtonElement).textContent = '…';
      setTimeout(() => {
        (btn as HTMLButtonElement).textContent = '✓ OK';
        setTimeout(() => { (btn as HTMLButtonElement).textContent = orig || 'Test'; }, 1000);
      }, 600);
    });
  });
}

// ── Plan Buttons ───────────────────────────────────────
function setupPlanButtons(): void {
  document.querySelectorAll('.settings-plan-select-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const orig = (btn as HTMLElement).innerHTML;
      (btn as HTMLElement).innerHTML = '<span class="material-symbols-outlined" style="font-size:16px!important;">check</span> Plan actuel';
      const cards = document.querySelectorAll('.settings-plan-card');
      cards.forEach(c => c.classList.remove('recommended'));
      btn.closest('.settings-plan-card')?.classList.add('recommended');
      setTimeout(() => { (btn as HTMLElement).innerHTML = orig; }, 2000);
    });
  });
}
