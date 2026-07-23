/**
 * Property view module — 3D house interaction, PDF viewer, report, recommendations.
 */
import { onHousePartSelect, selectHousePart, housePartData, type HousePartData } from '../../house3d.js';
import { openModal, closeModal } from '../../router.js';

let propertyInitialized = false;

export function initProperty(): void {
  setupHouseInteraction();

  // One-time init for PDF viewer and modals
  if (!propertyInitialized) {
    propertyInitialized = true;
    setupPdfViewer();
    setupPropertyModals();
  }
}

// ── 3D House Interaction ────────────────────────────────
function setupHouseInteraction(): void {
  onHousePartSelect((data: HousePartData) => {
    const labelEl = document.getElementById('partLabel');
    const badgeEl = document.getElementById('partBadge');
    const scoreEl = document.getElementById('partScore');
    const descEl = document.getElementById('partDescription');
    const actionsEl = document.getElementById('partActions');
    const costEl = document.getElementById('partCost');
    const savingsEl = document.getElementById('partSavings');

    if (labelEl) labelEl.textContent = data.label;
    if (scoreEl) scoreEl.textContent = String(data.score);
    if (descEl) descEl.textContent = data.description;
    if (costEl) costEl.textContent = data.cost;
    if (savingsEl) savingsEl.textContent = data.annualSavings;

    if (badgeEl) {
      badgeEl.style.display = 'inline-block';
      badgeEl.textContent = data.risk === 'high' ? 'High Risk' : data.risk === 'medium' ? 'Medium Risk' : 'Low Risk';
      badgeEl.className = `risk-badge ${data.risk}`;
    }

    if (actionsEl) actionsEl.style.display = 'flex';

    document.querySelectorAll('.part-card').forEach(c => c.classList.remove('selected'));
    const card = document.querySelector(`.part-card[data-part="${data.id}"]`);
    if (card) card.classList.add('selected');
  });

  document.querySelectorAll('.part-card').forEach(card => {
    card.addEventListener('click', () => {
      const partId = card.getAttribute('data-part');
      if (!partId || !housePartData[partId]) return;
      selectHousePart(partId);
    });
  });

  document.querySelectorAll('.reco-checkbox').forEach(cb => {
    cb.addEventListener('change', updateRecoSelection);
  });
  updateRecoSelection();

  const exportBtn = document.getElementById('exportRecommendations');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const checked = document.querySelectorAll('.reco-checkbox:checked');
      if (checked.length === 0) {
        exportBtn.style.animation = 'shake 0.3s ease';
        setTimeout(() => exportBtn.style.animation = '', 400);
        return;
      }
      generateReport();
    });
  }

  // Navigate to recommendations tab
  const recoNavBtn = document.querySelector('#partActions button');
  if (recoNavBtn) {
    recoNavBtn.addEventListener('click', () => {
      const headerTabs = document.getElementById('headerTabs');
      if (!headerTabs) return;
      const btn = headerTabs.querySelector('.tab-btn[data-tab="recommendations"]');
      if (btn) (btn as HTMLButtonElement).click();
    });
  }
}

// ── PDF Viewer ──────────────────────────────────────────
function setupPdfViewer(): void {
  document.querySelectorAll('.doc-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.doc-dl-btn')) return;

      const name = card.querySelector('.doc-name')?.textContent || 'Document';
      const meta = card.querySelector('.doc-meta')?.textContent || '';
      const size = card.querySelector('.doc-size')?.textContent || '';
      const iconEl = card.querySelector('.doc-type-icon .material-symbols-outlined');
      const icon = iconEl?.textContent || 'description';
      const iconColor = (iconEl?.parentElement as HTMLElement)?.style?.color || 'var(--color-primary)';

      const viewerTitle = document.getElementById('pdfViewerTitle');
      const viewerMeta = document.getElementById('pdfViewerMeta');
      const viewerSize = document.getElementById('pdfPreviewSize');
      const viewerIcon = document.getElementById('pdfViewerIcon');
      const previewTitle = document.getElementById('pdfPreviewTitle');
      const viewerDate = document.getElementById('pdfViewerDate');

      if (viewerTitle) viewerTitle.textContent = name;
      if (previewTitle) previewTitle.textContent = 'Aperçu : ' + name;
      if (viewerMeta) viewerMeta.textContent = meta;
      if (viewerSize) viewerSize.textContent = size;
      if (viewerDate) viewerDate.textContent = new Date().toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });
      if (viewerIcon) {
        viewerIcon.textContent = icon;
        (viewerIcon as HTMLElement).style.color = iconColor;
      }

      openModal('pdfViewer');
    });
  });

  const dlBtn = document.getElementById('pdfViewerDownload');
  if (dlBtn) {
    dlBtn.addEventListener('click', () => {
      dlBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px!important;">check</span> Téléchargement simulé';
      setTimeout(() => {
        dlBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px!important;">download</span> Télécharger';
      }, 1200);
    });
  }
}

// ── Modals (view-specific: PDF viewer download, report print) ──
function setupPropertyModals(): void {
  const pdfClose = document.getElementById('pdfViewerClose');
  if (pdfClose) pdfClose.addEventListener('click', () => closeModal('pdfViewer'));

  const reportClose = document.getElementById('reportModalClose');
  if (reportClose) reportClose.addEventListener('click', () => closeModal('reportModal'));

  const printBtn = document.getElementById('reportPrintBtn');
  if (printBtn) printBtn.addEventListener('click', () => window.print());
}

// ── Report Generation ──────────────────────────────────
function generateReport(): void {
  const checked = document.querySelectorAll('.reco-checkbox:checked');
  if (checked.length === 0) return;

  const now = new Date();
  const dateStr = now.toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });

  let recosHtml = '';
  checked.forEach(cb => {
    const item = (cb as HTMLInputElement).closest('.reco-item') as HTMLElement;
    if (!item) return;

    const priority = item.querySelector('.reco-priority')?.textContent || '';
    const tag = item.querySelector('.reco-tag')?.textContent || '';
    const title = item.querySelector('.reco-title')?.textContent || '';
    const desc = item.querySelector('.reco-desc')?.textContent || '';
    const cost = item.querySelector('.reco-cost')?.textContent || '';
    const roi = item.querySelector('.reco-roi')?.textContent || '';
    const deadline = item.querySelector('.reco-deadline')?.textContent || '';

    const tagClass = tag.toLowerCase() === 'critique' ? 'critical'
      : tag.toLowerCase() === 'urgent' ? 'high'
      : tag.toLowerCase() === 'recommandé' ? 'medium' : 'low';

    recosHtml += `
      <div class="report-reco">
        <div class="report-reco-head">
          <span class="report-reco-priority ${tagClass}">${priority}</span>
          <span class="report-reco-title">${title}</span>
        </div>
        <div class="report-reco-desc">${desc}</div>
        <div class="report-reco-details">
          <span>${cost}</span>
          <span>${roi}</span>
          <span>${deadline}</span>
        </div>
      </div>`;
  });

  const reportHtml = `
    <div class="report-header">
      <div class="report-logo"><span class="material-symbols-outlined">auto_awesome</span>Prévia</div>
      <h1>Rapport de synthèse — Recommandations</h1>
      <div class="report-sub">Généré par Prévia AI le ${dateStr}</div>
    </div>
    <div class="report-property">
      <div class="report-property-item"><span class="label">Adresse</span><span class="value">8 Rue de la Paix, 75002 Paris</span></div>
      <div class="report-property-item"><span class="label">Année de construction</span><span class="value">1978</span></div>
      <div class="report-property-item"><span class="label">Score de risque global</span><span class="value" style="color:var(--color-danger);">66 / 100</span></div>
      <div class="report-property-item"><span class="label">Impact sur la prime annuelle</span><span class="value" style="color:#10b981;">−100 € / an</span></div>
      <div class="report-property-item"><span class="label">DPE</span><span class="value">D · 178 kWh/m²</span></div>
      <div class="report-property-item"><span class="label">Risques principaux</span><span class="value">Inondation · Retrait argile · Canicule</span></div>
    </div>
    <div class="report-section-title">Recommandations sélectionnées (${checked.length})</div>
    ${recosHtml}
    <div class="report-footer">
      Rapport généré automatiquement par Prévia — ${dateStr}<br>
      Prévia · Generative AI at the service of institutional uses — Finance & Insurance<br>
      Ce document est fourni à titre indicatif et ne constitue pas un engagement contractuel.
    </div>`;

  const reportBody = document.getElementById('reportBody');
  const reportDate = document.getElementById('reportDate');
  if (reportBody) reportBody.innerHTML = reportHtml;
  if (reportDate) reportDate.textContent = dateStr;

  openModal('reportModal');
}

// ── Recommendation Selection ───────────────────────────
function updateRecoSelection(): void {
  const checkboxes = document.querySelectorAll('.reco-checkbox');
  const checked = document.querySelectorAll('.reco-checkbox:checked');
  const exportBtn = document.getElementById('exportRecommendations');

  checkboxes.forEach(cb => {
    const item = cb.closest('.reco-item');
    if (item) item.classList.toggle('dimmed', !(cb as HTMLInputElement).checked);
  });

  if (exportBtn) {
    const total = checkboxes.length;
    const count = checked.length;
    const icon = count === total ? 'download' : count > 0 ? 'description' : 'block';
    const label = count === 0 ? 'Sélectionner des recommandations' : `Exporter le rapport (${count}/${total})`;
    exportBtn.innerHTML = `<span class="material-symbols-outlined" style="font-size:18px!important;">${icon}</span> ${label}`;
  }
}
