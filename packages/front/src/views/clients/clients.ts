/**
 * Clients view module — table search, client wizard, contract/document UI.
 */

let initialized = false;

export function initClients(): void {
  if (initialized) return;
  initialized = true;
  setupClientSearch();
  setupClientWizard();
  setupClientActions();
}

export function destroyClients(): void {
  initialized = false;
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

/* ═══════════════════════════════════════════════════
   Mock Client Data
   ═══════════════════════════════════════════════════ */
interface ClientPayment {
  date: string;
  type: string;
  contract: string;
  amount: string;
  status: 'paid' | 'pending' | 'late' | 'upcoming';
}

interface ClientContract {
  name: string;
  type: string;
  ref: string;
  status: string;
  premium: string;
  icon: string;
  color: string;
}

interface ClientDetail {
  id: string;
  initials: string;
  civility: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  cp: string;
  city: string;
  nationality: string;
  profession: string;
  dob: string;
  status: string;
  ref: string;
  statContracts: number;
  statActive: number;
  statPending: number;
  statPremium: string;
  payments: ClientPayment[];
  contracts: ClientContract[];
}

const MOCK_CLIENTS: Record<string, ClientDetail> = {
  '1': {
    id: '1', initials: 'JD', civility: 'M.', firstName: 'Jean', lastName: 'Dupont',
    email: 'jean.dupont@email.fr', phone: '+33 6 12 34 56 78',
    address: '12 Rue de la Paix', cp: '75002', city: 'Paris',
    nationality: 'Française', profession: 'Avocat', dob: '1978-03-15',
    status: 'active', ref: 'CLT-2026-001',
    statContracts: 3, statActive: 2, statPending: 0, statPremium: '3 720 €',
    payments: [
      { date: '15/03/2026', type: 'Prime annuelle', contract: 'Multirisque habitation', amount: '1 240 €', status: 'paid' },
      { date: '01/02/2026', type: 'Prime', contract: 'Automobile', amount: '680 €', status: 'paid' },
      { date: '15/03/2025', type: 'Prime annuelle', contract: 'Multirisque habitation', amount: '1 240 €', status: 'paid' },
      { date: '01/05/2026', type: 'Avenant', contract: 'Multirisque habitation', amount: '350 €', status: 'paid' },
      { date: '15/09/2026', type: 'Rappel', contract: 'Multirisque habitation', amount: '1 240 €', status: 'upcoming' },
    ],
    contracts: [
      { name: 'Multirisque habitation', type: 'Habitation', ref: 'MRH-2026-001', status: 'Actif', premium: '1 240 €/an', icon: 'home', color: '#c56a3d' },
      { name: 'Assurance automobile', type: 'Auto', ref: 'AUTO-2026-012', status: 'Actif', premium: '680 €/an', icon: 'directions_car', color: '#3b82f6' },
      { name: 'Prévoyance décès', type: 'Vie', ref: 'PREV-2025-008', status: 'Résilié', premium: '1 800 €/an', icon: 'favorite', color: '#64748b' },
    ],
  },
  '2': {
    id: '2', initials: 'MB', civility: 'Mme', firstName: 'Marie', lastName: 'Bernard',
    email: 'marie.bernard@email.fr', phone: '+33 6 98 76 54 32',
    address: '15 Rue de la République', cp: '69003', city: 'Lyon',
    nationality: 'Française', profession: 'Infirmière', dob: '1985-07-22',
    status: 'active', ref: 'CLT-2026-002',
    statContracts: 2, statActive: 2, statPending: 0, statPremium: '1 560 €',
    payments: [
      { date: '10/01/2026', type: 'Prime annuelle', contract: 'Automobile', amount: '680 €', status: 'paid' },
      { date: '15/05/2026', type: 'Prime', contract: 'Santé', amount: '880 €', status: 'paid' },
      { date: '10/01/2025', type: 'Prime annuelle', contract: 'Automobile', amount: '650 €', status: 'paid' },
      { date: '20/11/2025', type: 'Sinistre', contract: 'Automobile', amount: '2 300 €', status: 'paid' },
    ],
    contracts: [
      { name: 'Assurance automobile', type: 'Auto', ref: 'AUTO-2026-015', status: 'Actif', premium: '680 €/an', icon: 'directions_car', color: '#3b82f6' },
      { name: 'Mutuelle santé', type: 'Santé', ref: 'SANTE-2026-003', status: 'Actif', premium: '880 €/an', icon: 'local_hospital', color: '#10b981' },
    ],
  },
  '3': {
    id: '3', initials: 'PL', civility: 'M.', firstName: 'Pierre', lastName: 'Lefèvre',
    email: 'pierre.lefevre@email.fr', phone: '+33 6 45 67 89 01',
    address: '8 Rue de Rome', cp: '13006', city: 'Marseille',
    nationality: 'Française', profession: 'Artisan', dob: '1972-11-03',
    status: 'pending', ref: 'CLT-2026-003',
    statContracts: 2, statActive: 1, statPending: 1, statPremium: '3 450 €',
    payments: [
      { date: '20/02/2026', type: 'Prime trimestrielle', contract: 'Professionnelle', amount: '612 €', status: 'paid' },
      { date: '20/05/2026', type: 'Prime trimestrielle', contract: 'Professionnelle', amount: '612 €', status: 'pending' },
      { date: '01/03/2026', type: 'Prime annuelle', contract: 'Habitation', amount: '1 200 €', status: 'paid' },
    ],
    contracts: [
      { name: 'Assurance professionnelle', type: 'Pro', ref: 'PRO-2026-002', status: 'Actif', premium: '2 450 €/an', icon: 'business', color: '#f59e0b' },
      { name: 'Assurance habitation', type: 'Habitation', ref: 'MRH-2026-007', status: 'En attente', premium: '1 200 €/an', icon: 'home', color: '#94a3b8' },
    ],
  },
};

// Fill with data for remaining 3 clients using template
const TEMPLATE_CLIENTS: Array<{ id: string; initials: string; fn: string; ln: string; email: string; phone: string; addr: string; cp: string; city: string; status: string; ref: string; profession: string; dob: string; premium: string }> = [
  { id: '4', initials: 'SN', fn: 'Sophie', ln: 'Nguyen', email: 'sophie.nguyen@email.fr', phone: '+33 6 23 45 67 89', addr: '5 Rue des Remparts', cp: '33000', city: 'Bordeaux', status: 'active', ref: 'CLT-2026-004', profession: 'Architecte', dob: '1990-04-18', premium: '1 890 €' },
  { id: '5', initials: 'LR', fn: 'Lucas', ln: 'Richard', email: 'lucas.richard@email.fr', phone: '+33 6 34 56 78 90', addr: '22 Rue Matabiau', cp: '31000', city: 'Toulouse', status: 'suspended', ref: 'CLT-2026-005', profession: 'Commercial', dob: '1988-09-25', premium: '950 €' },
  { id: '6', initials: 'CP', fn: 'Claire', ln: 'Petit', email: 'claire.petit@email.fr', phone: '+33 6 56 78 90 12', addr: '18 Rue de la Gare', cp: '59000', city: 'Lille', status: 'pending', ref: 'CLT-2026-006', profession: 'Enseignante', dob: '1982-12-10', premium: '3 200 €' },
];

for (const t of TEMPLATE_CLIENTS) {
  MOCK_CLIENTS[t.id] = {
    id: t.id, initials: t.initials, civility: 'M.', firstName: t.fn, lastName: t.ln,
    email: t.email, phone: t.phone, address: t.addr, cp: t.cp, city: t.city,
    nationality: 'Française', profession: t.profession, dob: t.dob,
    status: t.status, ref: t.ref,
    statContracts: 1, statActive: t.status === 'active' ? 1 : 0, statPending: t.status === 'pending' ? 1 : 0,
    statPremium: t.premium,
    payments: [
      { date: '15/01/2026', type: 'Prime annuelle', contract: t.ref, amount: t.premium, status: t.status === 'pending' ? 'pending' : 'paid' },
      { date: '15/01/2025', type: 'Prime annuelle', contract: t.ref, amount: t.premium, status: 'paid' },
    ],
    contracts: [
      { name: `Contrat ${t.ref}`, type: 'Multirisque', ref: t.ref, status: t.status === 'active' ? 'Actif' : t.status === 'pending' ? 'En attente' : 'Suspendu', premium: `${t.premium}/an`, icon: t.id === '4' ? 'home' : t.id === '5' ? 'directions_car' : 'favorite', color: t.status === 'active' ? '#10b981' : t.status === 'pending' ? '#f59e0b' : '#ef4444' },
    ],
  };
}

// ── Client Detail Panel ──────────────────────────────
let currentClientId: string | null = null;
let isEditing = false;

function openClientDetail(clientId: string): void {
  const data = MOCK_CLIENTS[clientId];
  if (!data) return;

  currentClientId = clientId;
  isEditing = false;

  // Hide tab-content panels, show detail panel
  document.querySelectorAll('.clients-tab-content').forEach(el => el.classList.remove('active'));
  const panel = document.getElementById('clientsDetailPanel');
  if (panel) panel.classList.add('active');

  // Populate profile header
  document.getElementById('cdpAvatar')!.textContent = data.initials;
  document.getElementById('cdpName')!.textContent = `${data.firstName} ${data.lastName}`;
  (document.getElementById('cdpRef') as HTMLElement)!.textContent = data.ref;

  const statusEl = document.getElementById('cdpStatus') as HTMLElement;
  statusEl.textContent = data.status === 'active' ? 'Actif' : data.status === 'pending' ? 'En attente' : 'Suspendu';
  statusEl.className = 'cdp-status ' + data.status;

  // Populate stats
  document.getElementById('cdpStatContracts')!.textContent = String(data.statContracts);
  document.getElementById('cdpStatActive')!.textContent = String(data.statActive);
  document.getElementById('cdpStatPending')!.textContent = String(data.statPending);
  document.getElementById('cdpStatPremium')!.textContent = data.statPremium;

  // Populate form fields
  (document.getElementById('cdpFieldCivility') as HTMLSelectElement)!.value = data.civility;
  (document.getElementById('cdpFieldFirstname') as HTMLInputElement)!.value = data.firstName;
  (document.getElementById('cdpFieldLastname') as HTMLInputElement)!.value = data.lastName;
  (document.getElementById('cdpFieldEmail') as HTMLInputElement)!.value = data.email;
  (document.getElementById('cdpFieldPhone') as HTMLInputElement)!.value = data.phone;
  (document.getElementById('cdpFieldAddress') as HTMLInputElement)!.value = data.address;
  (document.getElementById('cdpFieldCp') as HTMLInputElement)!.value = data.cp;
  (document.getElementById('cdpFieldCity') as HTMLInputElement)!.value = data.city;
  (document.getElementById('cdpFieldDob') as HTMLInputElement)!.value = data.dob;
  (document.getElementById('cdpFieldNationality') as HTMLSelectElement)!.value = data.nationality;
  (document.getElementById('cdpFieldProfession') as HTMLInputElement)!.value = data.profession;

  // Disable form fields (view mode)
  setFormFieldsDisabled(true);
  document.getElementById('cdpFormActions')!.style.display = 'none';

  // Populate payment history
  const historyBody = document.getElementById('cdpHistoryBody')!;
  historyBody.innerHTML = data.payments.map(p => {
    const statusLabel: Record<string, string> = { paid: 'Payé', pending: 'En attente', late: 'En retard', upcoming: 'À venir' };
    return `<tr>
      <td>${p.date}</td>
      <td>${p.type}</td>
      <td>${p.contract}</td>
      <td style="font-weight:600;color:var(--text-primary);">${p.amount}</td>
      <td><span class="cdp-badge ${p.status}">${statusLabel[p.status] || p.status}</span></td>
    </tr>`;
  }).join('');

  // Populate contracts
  const contractsList = document.getElementById('cdpContractsList')!;
  contractsList.innerHTML = data.contracts.map(c => {
    return `<div class="cdp-contract-card">
      <span class="material-symbols-outlined cdp-contract-icon" style="background:${c.color}1a;color:${c.color};">${c.icon}</span>
      <div class="cdp-contract-body">
        <span class="cdp-contract-name">${c.name}</span>
        <span class="cdp-contract-meta">
          <span>${c.ref}</span>
          <span>${c.type}</span>
          <span style="color:${c.status === 'Actif' ? '#059669' : c.status === 'En attente' ? '#d97706' : '#94a3b8'};">${c.status}</span>
        </span>
      </div>
      <span class="cdp-contract-premium">${c.premium}</span>
    </div>`;
  }).join('');

  // Populate overview
  populateOverview(data);

  // Reset to overview tab
  document.querySelectorAll('.cdp-tab-content').forEach(el => el.classList.remove('active'));
  document.querySelector('.cdp-tab-content[data-cdp-content="overview"]')?.classList.add('active');
  document.querySelectorAll('.cdp-tab').forEach(t => t.classList.remove('active'));
  document.querySelector('.cdp-tab[data-cdp-tab="overview"]')?.classList.add('active');
}

function populateOverview(data: ClientDetail): void {
  // Identity
  document.getElementById('cdpOvCivility')!.textContent = data.civility;
  document.getElementById('cdpOvName')!.textContent = `${data.firstName} ${data.lastName}`;
  document.getElementById('cdpOvEmail')!.textContent = data.email;
  document.getElementById('cdpOvPhone')!.textContent = data.phone;
  document.getElementById('cdpOvAddress')!.textContent = `${data.address}, ${data.cp} ${data.city}`;
  const statusLabels: Record<string, string> = { active: 'Actif', pending: 'En attente', suspended: 'Suspendu' };
  const statusEl = document.getElementById('cdpOvStatus')!;
  statusEl.textContent = statusLabels[data.status] || data.status;
  statusEl.style.color = data.status === 'active' ? '#059669' : data.status === 'pending' ? '#d97706' : '#dc2626';
  statusEl.style.fontWeight = '600';

  // Contracts summary
  document.getElementById('cdpOvTotalContracts')!.textContent = String(data.statContracts);
  document.getElementById('cdpOvActiveContracts')!.textContent = String(data.statActive);
  document.getElementById('cdpOvPendingContracts')!.textContent = String(data.statPending);
  document.getElementById('cdpOvAnnualPremium')!.textContent = data.statPremium;

  // Contracts list (mini)
  const contractsList = document.getElementById('cdpOvContractsList')!;
  contractsList.innerHTML = data.contracts.map(c => {
    const statusColor = c.status === 'Actif' ? '#059669' : c.status === 'En attente' ? '#d97706' : '#94a3b8';
    return `<div class="cdp-ov-contract-row">
      <span class="material-symbols-outlined cdp-ov-contract-icon" style="color:${c.color};">${c.icon}</span>
      <div class="cdp-ov-contract-info">
        <span class="cdp-ov-contract-name">${c.name}</span>
        <span class="cdp-ov-contract-ref">${c.ref} · ${c.type}</span>
      </div>
      <span class="cdp-ov-contract-status" style="color:${statusColor};">${c.status}</span>
      <span class="cdp-ov-contract-premium">${c.premium}</span>
    </div>`;
  }).join('');

  // Recent payments (last 3)
  const paymentsList = document.getElementById('cdpOvPaymentsList')!;
  const recentPayments = data.payments.slice(0, 3);
  paymentsList.innerHTML = recentPayments.map(p => {
    const statusLabel: Record<string, string> = { paid: 'Payé', pending: 'En attente', late: 'En retard', upcoming: 'À venir' };
    return `<div class="cdp-ov-payment-row">
      <span class="cdp-ov-payment-date">${p.date}</span>
      <span class="cdp-ov-payment-type">${p.type}</span>
      <span class="cdp-ov-payment-amount">${p.amount}</span>
      <span class="cdp-ov-payment-status ${p.status}">${statusLabel[p.status] || p.status}</span>
    </div>`;
  }).join('');
}

function closeClientDetail(): void {
  currentClientId = null;
  isEditing = false;
  const panel = document.getElementById('clientsDetailPanel');
  if (panel) panel.classList.remove('active');
  document.querySelector('.clients-tab-content[data-content="info"]')?.classList.add('active');
  setFormFieldsDisabled(true);
  document.getElementById('cdpFormActions')!.style.display = 'none';
}

function setFormFieldsDisabled(disabled: boolean): void {
  document.querySelectorAll('.cdp-field input, .cdp-field select').forEach(el => {
    if (disabled) el.setAttribute('disabled', 'disabled');
    else el.removeAttribute('disabled');
  });
}

function toggleEditMode(): void {
  isEditing = !isEditing;
  setFormFieldsDisabled(!isEditing);
  document.getElementById('cdpFormActions')!.style.display = isEditing ? 'flex' : 'none';
  const editBtn = document.getElementById('cdpEditToggle')!;
  if (isEditing) {
    editBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px!important;">close</span> Annuler';
  } else {
    editBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px!important;">edit</span> Modifier';
  }
}

function saveClientInfo(): void {
  if (!currentClientId) return;
  const data = MOCK_CLIENTS[currentClientId];
  if (!data) return;

  data.civility = (document.getElementById('cdpFieldCivility') as HTMLSelectElement)!.value;
  data.firstName = (document.getElementById('cdpFieldFirstname') as HTMLInputElement)!.value.trim() || data.firstName;
  data.lastName = (document.getElementById('cdpFieldLastname') as HTMLInputElement)!.value.trim() || data.lastName;
  data.email = (document.getElementById('cdpFieldEmail') as HTMLInputElement)!.value.trim() || data.email;
  data.phone = (document.getElementById('cdpFieldPhone') as HTMLInputElement)!.value.trim() || data.phone;
  data.address = (document.getElementById('cdpFieldAddress') as HTMLInputElement)!.value.trim() || data.address;
  data.cp = (document.getElementById('cdpFieldCp') as HTMLInputElement)!.value.trim() || data.cp;
  data.city = (document.getElementById('cdpFieldCity') as HTMLInputElement)!.value.trim() || data.city;
  data.nationality = (document.getElementById('cdpFieldNationality') as HTMLSelectElement)!.value;
  data.profession = (document.getElementById('cdpFieldProfession') as HTMLInputElement)!.value.trim() || data.profession;

  // Update header
  document.getElementById('cdpName')!.textContent = `${data.firstName} ${data.lastName}`;

  // Update table row (if exists)
  const row = document.querySelector(`.clients-table-row[data-client="${currentClientId}"]`);
  if (row) {
    row.querySelector('.clients-table-name')!.textContent = `${data.firstName} ${data.lastName}`;
    row.querySelector('.clients-table-email')!.textContent = data.email;
  }

  isEditing = false;
  setFormFieldsDisabled(true);
  document.getElementById('cdpFormActions')!.style.display = 'none';
  const editBtn = document.getElementById('cdpEditToggle')!;
  editBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px!important;">edit</span> Modifier';

  // Flash feedback
  const saveBtn = document.getElementById('cdpSaveBtn')!;
  const orig = saveBtn.innerHTML;
  saveBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px!important;">check</span> Enregistré !';
  saveBtn.style.background = '#10b981';
  setTimeout(() => {
    saveBtn.innerHTML = orig;
    saveBtn.style.background = '';
  }, 1200);
}

// ── Status Toggle Dropdown ────────────────────────────
function setupStatusToggle(): void {
  const toggle = document.getElementById('cdpStatusToggle');
  const dropdown = document.getElementById('cdpStatusDropdown');
  const menu = document.getElementById('cdpStatusMenu');
  if (!toggle || !dropdown || !menu) return;

  // Toggle dropdown
  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('open');
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target as Node)) {
      dropdown.classList.remove('open');
    }
  });

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') dropdown.classList.remove('open');
  });

  // Status option click
  menu.querySelectorAll('.cdp-status-option').forEach(opt => {
    opt.addEventListener('click', () => {
      const newStatus = (opt as HTMLElement).getAttribute('data-status');
      if (!newStatus || !currentClientId) return;

      const data = MOCK_CLIENTS[currentClientId];
      if (!data || data.status === newStatus) {
        dropdown.classList.remove('open');
        return;
      }

      changeClientStatus(currentClientId, newStatus);
      dropdown.classList.remove('open');
    });
  });
}

function changeClientStatus(clientId: string, newStatus: string): void {
  const data = MOCK_CLIENTS[clientId];
  if (!data) return;

  // Update mock data
  data.status = newStatus;

  // Update detail panel header
  const statusEl = document.getElementById('cdpStatus');
  if (statusEl) {
    const labels: Record<string, string> = { active: 'Actif', pending: 'En attente', suspended: 'Suspendu' };
    statusEl.textContent = labels[newStatus] || newStatus;
    statusEl.className = 'cdp-status ' + newStatus;
  }

  // Update table row
  const row = document.querySelector(`.clients-table-row[data-client="${clientId}"]`);
  if (row) {
    const statusCell = row.querySelector('.clients-table-status');
    if (statusCell) {
      const labels: Record<string, string> = { active: 'Actif', pending: 'En attente', suspended: 'Suspendu' };
      statusCell.textContent = labels[newStatus] || newStatus;
      statusCell.className = 'clients-table-status ' + newStatus;
    }
  }

  // Flash feedback (reuse statusEl reference)
  if (statusEl) {
    statusEl.style.transition = 'all 0.15s ease';
    statusEl.style.transform = 'scale(1.05)';
    setTimeout(() => { statusEl.style.transform = ''; }, 200);
  }
}

// ── Client Table Actions ──────────────────────────────
function setupClientActions(): void {
  setupStatusToggle();

  // View action — opens client detail panel
  document.querySelectorAll('.clients-action-btn[data-action="view"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const row = (btn as HTMLElement).closest('.clients-table-row');
      const clientId = row?.getAttribute('data-client');
      if (clientId) openClientDetail(clientId);
    });
  });

  // Click on row also opens detail
  document.querySelectorAll('.clients-table-row').forEach(row => {
    row.addEventListener('click', () => {
      const clientId = row.getAttribute('data-client');
      if (clientId) openClientDetail(clientId);
    });
  });

  // Back button
  const backBtn = document.getElementById('cdpBackBtn');
  if (backBtn) backBtn.addEventListener('click', closeClientDetail);

  // Edit toggle
  const editBtn = document.getElementById('cdpEditToggle');
  if (editBtn) editBtn.addEventListener('click', toggleEditMode);

  // Save button
  const saveBtn = document.getElementById('cdpSaveBtn');
  if (saveBtn) saveBtn.addEventListener('click', saveClientInfo);

  // Cancel button
  const cancelBtn = document.getElementById('cdpCancelBtn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      isEditing = false;
      setFormFieldsDisabled(true);
      document.getElementById('cdpFormActions')!.style.display = 'none';
      const editBtn = document.getElementById('cdpEditToggle')!;
      editBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px!important;">edit</span> Modifier';
      // Re-populate to reset fields
      if (currentClientId) openClientDetail(currentClientId);
    });
  }

  // Detail tab switching
  document.querySelectorAll('.cdp-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const target = (tab as HTMLElement).getAttribute('data-cdp-tab');
      if (!target) return;
      document.querySelectorAll('.cdp-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.cdp-tab-content').forEach(el => el.classList.remove('active'));
      document.querySelector(`.cdp-tab-content[data-cdp-content="${target}"]`)?.classList.add('active');
    });
  });

  // Edit action — opens detail panel in edit mode
  document.querySelectorAll('.clients-action-btn[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const row = (btn as HTMLElement).closest('.clients-table-row');
      const clientId = row?.getAttribute('data-client');
      if (!clientId) return;
      openClientDetail(clientId);
      // Switch to edit mode
      setTimeout(() => {
        isEditing = true;
        setFormFieldsDisabled(false);
        document.getElementById('cdpFormActions')!.style.display = 'flex';
        const editBtn = document.getElementById('cdpEditToggle')!;
        editBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px!important;">close</span> Annuler';
      }, 300);
    });
  });

  // Quick status toggle — click opens dropdown in the detail panel for this client
  document.querySelectorAll('.clients-action-btn[data-action="status"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const row = (btn as HTMLElement).closest('.clients-table-row');
      const clientId = row?.getAttribute('data-client');
      if (clientId) {
        openClientDetail(clientId);
        // Open the detail panel's status dropdown
        setTimeout(() => {
          const toggle = document.getElementById('cdpStatusToggle');
          if (toggle) toggle.click();
        }, 400);
      }
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
