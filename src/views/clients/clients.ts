/**
 * Clients view module — table search, client wizard, contract/document UI.
 */

export function initClients(): void {
  setupClientSearch();
  setupClientWizard();
  setupClientActions();
}

// ── Client Search ──────────────────────────────────────
function setupClientSearch(): void {
  const clientsSearch = document.getElementById('clientsSearch') as HTMLInputElement | null;
  if (!clientsSearch) return;

  clientsSearch.addEventListener('input', () => {
    const query = clientsSearch.value.toLowerCase().trim();
    const rows = document.querySelectorAll('#clientsTableBody .clients-table-row');
    rows.forEach(row => {
      const text = row.textContent?.toLowerCase() || '';
      (row as HTMLElement).style.display = !query || text.includes(query) ? '' : 'none';
    });
  });
}

// ── Client Wizard ──────────────────────────────────────
function setupClientWizard(): void {
  const modal = document.getElementById('clientWizardModal');
  const closeBtn = document.getElementById('wizardClose');
  const addBtn = document.getElementById('clientsAddBtn');
  const submitBtn = document.getElementById('wizardSubmit');
  const form = document.getElementById('clientWizardForm') as HTMLFormElement | null;

  if (!modal || !addBtn) return;

  addBtn.addEventListener('click', () => {
    resetWizard();
    modal.classList.add('open');
  });

  const closeWizard = () => {
    modal.classList.remove('open');
    resetWizard();
  };

  if (closeBtn) closeBtn.addEventListener('click', closeWizard);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeWizard(); });

  // Step navigation
  document.querySelectorAll('.wizard-next').forEach(btn => {
    btn.addEventListener('click', () => {
      const next = parseInt((btn as HTMLElement).getAttribute('data-next') || '1', 10);
      goToWizardStep(next);
    });
  });

  document.querySelectorAll('.wizard-prev').forEach(btn => {
    btn.addEventListener('click', () => {
      const prev = parseInt((btn as HTMLElement).getAttribute('data-prev') || '1', 10);
      goToWizardStep(prev);
    });
  });

  // Document upload
  document.querySelectorAll('.wizard-doc-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const el = btn as HTMLElement;
      const container = el.closest('.wizard-doc-upload');
      if (container?.classList.contains('uploaded')) return;
      el.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px!important;">check</span> Déposé';
      el.classList.add('uploaded');
      container?.classList.add('uploaded');
    });
  });

  // Submit
  if (submitBtn && form) {
    submitBtn.addEventListener('click', () => {
      const firstName = (document.getElementById('wiz-firstname') as HTMLInputElement)?.value?.trim();
      const lastName = (document.getElementById('wiz-lastname') as HTMLInputElement)?.value?.trim();

      if (!firstName || !lastName) {
        goToWizardStep(1);
        (document.getElementById('wiz-firstname') as HTMLInputElement)?.focus();
        return;
      }

      const orig = submitBtn.innerHTML;
      submitBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px!important;">check</span> Client créé !';
      submitBtn.style.background = '#10b981';

      setTimeout(() => {
        closeWizard();
        submitBtn.innerHTML = orig;
        submitBtn.style.background = '';
      }, 1000);
    });
  }
}

function goToWizardStep(step: number): void {
  document.querySelectorAll('.wizard-panel').forEach(p => p.classList.remove('active'));
  const panel = document.querySelector(`.wizard-panel[data-panel="${step}"]`);
  if (panel) panel.classList.add('active');

  document.querySelectorAll('.wizard-step').forEach(s => {
    const sStep = parseInt((s as HTMLElement).getAttribute('data-step') || '0', 10);
    s.classList.remove('active', 'completed');
    if (sStep === step) s.classList.add('active');
    else if (sStep < step) s.classList.add('completed');
  });
}

function resetWizard(): void {
  goToWizardStep(1);
  const form = document.getElementById('clientWizardForm') as HTMLFormElement | null;
  if (form) form.reset();
  document.querySelectorAll('.wizard-doc-upload').forEach(el => el.classList.remove('uploaded'));
  document.querySelectorAll('.wizard-doc-btn').forEach(el => {
    el.classList.remove('uploaded');
    el.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px!important;">upload</span> Déposer';
  });
}

// ── Client Table Actions ──────────────────────────────
function setupClientActions(): void {
  // View action
  document.querySelectorAll('.clients-action-btn[data-action="view"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const row = (btn as HTMLElement).closest('.clients-table-row');
      const name = row?.querySelector('.clients-table-name')?.textContent || 'Client';
      alert(`Fiche détaillée de ${name} — module à implémenter.`);
    });
  });

  // Edit action
  document.querySelectorAll('.clients-action-btn[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const row = (btn as HTMLElement).closest('.clients-table-row');
      const name = row?.querySelector('.clients-table-name')?.textContent || 'Client';
      alert(`Modification de ${name} — module à implémenter.`);
    });
  });

  // More action
  document.querySelectorAll('.clients-action-btn[data-action="more"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const row = (btn as HTMLElement).closest('.clients-table-row');
      const name = row?.querySelector('.clients-table-name')?.textContent || 'Client';
      alert(`Options pour ${name} — module à implémenter.`);
    });
  });

  // Upload buttons
  document.querySelectorAll('.clients-upload-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const orig = (btn as HTMLElement).innerHTML;
      (btn as HTMLElement).innerHTML = '<span class="material-symbols-outlined" style="font-size:16px!important;">check_circle</span> Déposé';
      setTimeout(() => { (btn as HTMLElement).innerHTML = orig; }, 1200);
    });
  });

  // Contract view buttons
  document.querySelectorAll('.clients-contract-view').forEach(btn => {
    btn.addEventListener('click', () => {
      alert('Ouverture du contrat... (module à implémenter)');
    });
  });
}
