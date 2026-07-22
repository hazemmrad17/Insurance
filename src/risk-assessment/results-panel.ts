/**
 * Risk Assessment Results Panel — UI Renderer
 * =============================================
 *
 * Renders the full RiskAssessmentInput into a structured side panel
 * with collapsible sections for each provider group.
 */

import type { RiskAssessmentInput } from './schema.js';
import { escapeHtml } from '../views/climate-map/climate-map.js';

/* ═══════════════════════════════════════════════════════════════
   Section Config
   ═══════════════════════════════════════════════════════════════ */

interface Section {
  key: string;
  icon: string;
  label: string;
  color: string;
}

const SECTIONS: Section[] = [
  { key: 'property',    icon: 'apartment',      label: 'Bâtiment',        color: '#c56a3d' },
  { key: 'valuation',   icon: 'payments',       label: 'Valorisation',    color: '#10b981' },
  { key: 'geography',   icon: 'map',            label: 'Géographie',      color: '#3b82f6' },
  { key: 'risks',       icon: 'warning',        label: 'Risques',         color: '#ef4444' },
  { key: 'climate',     icon: 'thermostat',     label: 'Climat',          color: '#f59e0b' },
  { key: 'metadata',    icon: 'info',           label: 'Métadonnées',     color: '#8b5cf6' },
];

/* ═══════════════════════════════════════════════════════════════
   Risk level helpers
   ═══════════════════════════════════════════════════════════════ */

const RISK_LABELS: Record<string, string> = {
  inondation: 'Inondation',
  remonteeNappe: 'Remontée de nappe',
  risqueCotier: 'Risque côtier',
  seisme: 'Séisme',
  mouvementTerrain: 'Mouvement de terrain',
  retraitGonflementArgile: 'Retrait gonflement argiles',
  reculTraitCote: 'Recul trait de côte',
  avalanche: 'Avalanche',
  feuForet: 'Feu de forêt',
  eruptionVolcanique: 'Volcan',
  cyclone: 'Vent violent',
  radon: 'Radon',
  icpe: 'ICPE',
  nucleaire: 'Nucléaire',
  canalisationsMatieresDangereuses: 'Canalisations',
  pollutionSols: 'Pollution des sols',
  ruptureBarrage: 'Rupture de barrage',
  risqueMinier: 'Risques miniers',
};

const LEVEL_COLORS: Record<string, string> = {
  fort: '#ef4444',
  tres_fort: '#dc2626',
  moyen: '#f59e0b',
  faible: '#10b981',
};

function riskBadge(level: string | null): string {
  if (!level) return '<span class="rp-badge rp-badge-none">—</span>';
  const color = LEVEL_COLORS[level] || '#94a3b8';
  return `<span class="rp-badge" style="background:${color}20;color:${color};">${level}</span>`;
}

/* ═══════════════════════════════════════════════════════════════
   MAIN RENDERER
   ═══════════════════════════════════════════════════════════════ */

let panelContainer: HTMLElement | null = null;

export function setResultsPanelContainer(element: HTMLElement): void {
  panelContainer = element;
}

export function renderLoadingState(progress: { message: string; done: number; total: number }): void {
  if (!panelContainer) return;

  const pct = Math.round((progress.done / progress.total) * 100);

  // Show loading on first call, update on subsequent calls
  if (progress.done === 1) {
    panelContainer.innerHTML = `
      <div class="rp-loading">
        <div class="rp-loading-spinner"></div>
        <div class="rp-loading-progress">
          <div class="rp-loading-bar-track">
            <div class="rp-loading-bar-fill" style="width:${pct}%;"></div>
          </div>
          <div class="rp-loading-progress-row">
            <span class="rp-loading-text">${progress.message}</span>
            <span>${progress.done}/${progress.total}</span>
          </div>
        </div>
      </div>
    `;
  } else {
    // Update existing loading state
    const barFill = panelContainer.querySelector('.rp-loading-bar-fill') as HTMLElement | null;
    const textEl = panelContainer.querySelector('.rp-loading-text');
    const counterEl = panelContainer.querySelector('.rp-loading-progress-row span:last-child');
    if (barFill) barFill.style.width = `${pct}%`;
    if (textEl) textEl.textContent = progress.message;
    if (counterEl) counterEl.textContent = `${progress.done}/${progress.total}`;
  }
}

export function renderResults(data: RiskAssessmentInput): void {
  if (!panelContainer) return;

  panelContainer.innerHTML = `
    <div class="rp-header">
      <div class="rp-header-info">
        <span class="material-symbols-outlined" style="color:var(--color-primary);font-size:20px!important;">gps_fixed</span>
        <div>
          <div class="rp-address">${escapeHtml(data.metadata.addressLabel)}</div>
          <div class="rp-coords">${data.metadata.latitude.toFixed(5)}, ${data.metadata.longitude.toFixed(5)}</div>
        </div>
      </div>
      <button class="rp-export-btn" id="rpExportBtn" title="Exporter en JSON">
        <span class="material-symbols-outlined" style="font-size:16px!important;">download</span>
      </button>
    </div>
    <div class="rp-body">
      ${SECTIONS.map(s => renderSection(s, data)).join('')}
    </div>
    <div class="rp-footer">
      Évaluation du ${data.metadata.assessmentDate} · ${data.metadata.communeName} (${data.metadata.communeCode})
    </div>
  `;

  // Wire export button
  const exportBtn = document.getElementById('rpExportBtn');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `risk-assessment-${data.metadata.communeCode}-${data.metadata.assessmentDate}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }
}

function renderSection(section: Section, data: RiskAssessmentInput): string {
  const content = renderSectionContent(section.key, data);
  const hasData = !!content.trim();
  if (!hasData) return '';

  return `
    <details class="rp-section" ${section.key === 'risks' || section.key === 'property' ? 'open' : ''}>
      <summary class="rp-section-header" style="--rp-accent:${section.color};">
        <span class="material-symbols-outlined rp-section-icon">${section.icon}</span>
        <span class="rp-section-label">${section.label}</span>
        <span class="material-symbols-outlined rp-section-chevron">expand_more</span>
      </summary>
      <div class="rp-section-body">${content}</div>
    </details>
  `;
}

function renderSectionContent(key: string, data: RiskAssessmentInput): string {
  switch (key) {
    case 'property': return renderProperty(data.property);
    case 'valuation': return renderValuation(data.valuation);
    case 'geography': return renderGeography(data.geography);
    case 'risks': return renderRisks(data.risks);
    case 'climate': return renderClimate(data.climate);
    case 'metadata': return renderMetadata(data.metadata);
    default: return '';
  }
}

/* ── Property (BDNB) ── */

function renderProperty(p: RiskAssessmentInput['property']): string {
  const rows: RowDef[] = [];

  if (p.builtYear) rows.push({ label: 'Construction', value: `${p.builtYear}` });
  if (p.constructionPeriod) rows.push({ label: 'Période', value: p.constructionPeriod });
  if (p.levels) rows.push({ label: 'Niveaux', value: `${p.levels}` });
  if (p.height) rows.push({ label: 'Hauteur', value: `${p.height.toFixed(1)} m` });
  if (p.surfaceUtile) rows.push({ label: 'Surface utile', value: `${p.surfaceUtile.toFixed(0)} m²` });
  if (p.surfaceEmprise) rows.push({ label: 'Emprise sol', value: `${p.surfaceEmprise.toFixed(0)} m²` });
  if (p.nbLogements) rows.push({ label: 'Logements', value: `${p.nbLogements}` });
  if (p.dpeClass) rows.push({ label: 'DPE', value: p.dpeClass, badge: true });
  if (p.energyConsumption) rows.push({ label: 'Conso énergie', value: `${p.energyConsumption} kWh/m²/an` });
  if (p.emissionGes) rows.push({ label: 'Émissions GES', value: `${p.emissionGes} kgCO₂/m²/an` });
  if (p.wallMaterial) rows.push({ label: 'Matériau mur', value: p.wallMaterial });
  if (p.roofMaterial) rows.push({ label: 'Matériau toit', value: p.roofMaterial });
  if (p.heatingType) rows.push({ label: 'Chauffage', value: p.heatingType });
  if (p.usageType) rows.push({ label: 'Usage', value: p.usageType });
  if (p.departmentCode) rows.push({ label: 'Département', value: p.departmentCode });

  if (rows.length === 0) return '<div class="rp-empty">Aucune donnée bâtiment (BDNB indisponible)</div>';
  return renderRows(rows);
}

/* ── Valuation (DVF) ── */

function renderValuation(v?: RiskAssessmentInput['valuation']): string {
  if (!v) return '<div class="rp-empty">Aucune donnée de valorisation</div>';

  const rows: RowDef[] = [];
  if (v.reconstructionValuePerSqm) rows.push({ label: 'Reconstruction', value: `${v.reconstructionValuePerSqm.toLocaleString('fr-FR')} €/m²` });
  if (v.lastTransactionPricePerSqm) rows.push({ label: 'Prix marché', value: `${v.lastTransactionPricePerSqm.toLocaleString('fr-FR')} €/m²` });
  if (v.lastTransactionDate) rows.push({ label: 'Dernière transaction', value: v.lastTransactionDate });
  if (v.lastTransactionType) rows.push({ label: 'Type', value: v.lastTransactionType });

  if (rows.length === 0) return '<div class="rp-empty">Données de valorisation incomplètes</div>';
  return renderRows(rows);
}

/* ── Geography (IGN) ── */

function renderGeography(g?: RiskAssessmentInput['geography']): string {
  if (!g) return '<div class="rp-empty">Aucune donnée géographique</div>';

  const rows: RowDef[] = [];
  if (g.altitude !== null) rows.push({ label: 'Altitude', value: `${g.altitude.toFixed(0)} m` });
  if (g.slope) rows.push({ label: 'Pente', value: g.slope === 'flat' ? 'Plat' : g.slope === 'moderate' ? 'Modéré' : 'Fort' });
  if (g.distanceToWaterway) rows.push({ label: 'Distance cours d\'eau', value: `${g.distanceToWaterway} m` });
  if (g.distanceFireStation) rows.push({ label: 'Distance pompiers', value: `${g.distanceFireStation} m` });
  if (g.landUse) rows.push({ label: 'Occupation sol', value: g.landUse });
  if (g.parcelId) rows.push({ label: 'Parcelle', value: g.parcelId, mono: true });

  if (rows.length === 0) return '<div class="rp-empty">Aucune donnée géographique</div>';
  return renderRows(rows);
}

/* ── Risks (Géorisques v1 + v2) ── */

function renderRisks(r: RiskAssessmentInput['risks']): string {
  let html = '';

  // CATNAT
  if (r.catnatLast10Years !== null) {
    const catnatColor = r.catnatLast10Years >= 5 ? '#ef4444' : r.catnatLast10Years >= 2 ? '#f59e0b' : '#10b981';
    html += `<div class="rp-kpi-row">
      <div class="rp-kpi-item">
        <span class="rp-kpi-val" style="color:${catnatColor};">${r.catnatLast10Years}</span>
        <span class="rp-kpi-label">CATNAT (10 ans)</span>
      </div>
      <div class="rp-kpi-item">
        <span class="rp-kpi-val" style="color:${r.pprApproved ? '#10b981' : '#ef4444'};">${r.pprApproved ? 'Oui' : 'Non'}</span>
        <span class="rp-kpi-label">PPR approuvé</span>
      </div>
    </div>`;
  }

  // Natural risks
  const naturalEntries = Object.entries(r.naturels).filter(([_, v]) => v.present);
  if (naturalEntries.length > 0) {
    html += `<div class="rp-subsection">
      <div class="rp-subsection-title">Risques naturels (${naturalEntries.length})</div>
      ${naturalEntries.map(([key, risk]) => `
        <div class="rp-risk-row">
          <span class="rp-risk-label">${RISK_LABELS[key] || key}</span>
          ${riskBadge(risk.level)}
        </div>
      `).join('')}
    </div>`;
  }

  // Techno risks
  const technoEntries = Object.entries(r.technologiques).filter(([_, v]) => v.present);
  if (technoEntries.length > 0) {
    html += `<div class="rp-subsection">
      <div class="rp-subsection-title">Risques technologiques (${technoEntries.length})</div>
      ${technoEntries.map(([key, risk]) => `
        <div class="rp-risk-row">
          <span class="rp-risk-label">${RISK_LABELS[key] || key}</span>
          ${riskBadge(risk.level)}
        </div>
      `).join('')}
    </div>`;
  }

  // v2 enrichment
  if (r.enrichment) {
    const enrichments: string[] = [];
    if (r.enrichment.argileExposition) {
      enrichments.push(`Argile: ${r.enrichment.argileExposition.map(e => `${e.label} (${e.code})`).join(', ')}`);
    }
    if (r.enrichment.cavitiesNearby !== null) {
      enrichments.push(`Cavités: ${r.enrichment.cavitiesNearby} à proximité`);
    }
    if (r.enrichment.pollutedSitesNearby !== null) {
      enrichments.push(`Sites pollués: ${r.enrichment.pollutedSitesNearby} à proximité`);
    }
    if (enrichments.length > 0) {
      html += `<div class="rp-subsection">
        <div class="rp-subsection-title">Enrichissement v2</div>
        ${enrichments.map(e => `<div class="rp-risk-row"><span class="rp-risk-label">${e}</span></div>`).join('')}
      </div>`;
    }
  }

  if (!html) html = '<div class="rp-empty">Aucun risque détecté</div>';
  return html;
}

/* ── Climate (Open-Meteo Climate API — CMIP6) ── */

function renderClimate(c?: RiskAssessmentInput['climate']): string {
  if (!c) return '<div class="rp-empty">Aucune donnée climatique</div>';

  const rows: RowDef[] = [];

  // Historical norms
  if (c.freezeDaysPerYear !== null) rows.push({ label: '❄️ Jours de gel/an', value: `${c.freezeDaysPerYear} (2000–2014)` });
  if (c.heatwaveDaysPerYear !== null) rows.push({ label: '🔥 Jours canicule/an', value: `${c.heatwaveDaysPerYear} (2000–2014)` });
  if (c.annualPrecipitation !== null) rows.push({ label: '🌧️ Précipitations/an', value: `${c.annualPrecipitation} mm (2000–2014)` });
  if (c.stormFrequency !== null) rows.push({ label: '🌬️ Fréquence tempêtes', value: `${c.stormFrequency}/5 (2000–2014)` });
  if (c.hailRisk !== null) rows.push({ label: '🧊 Risque grêle', value: `${c.hailRisk}/5` });
  if (c.windZone !== null) rows.push({ label: 'Zone vent', value: `${c.windZone}` });
  if (c.snowZone) rows.push({ label: 'Zone neige', value: c.snowZone });

  // Future projections
  // Future projections (CMIP6 — Open-Meteo)
  const hasProjections = c.projectedFreezeDays !== null || c.projectedHeatwaveDays !== null;
  if (hasProjections) {
    rows.push({ label: '', value: '' });
    if (c.projectedFreezeDays !== null) rows.push({ label: '❄️ Jours de gel (2050)', value: `${c.projectedFreezeDays} (projeté)` });
    if (c.projectedHeatwaveDays !== null) rows.push({ label: '🔥 Jours canicule (2050)', value: `${c.projectedHeatwaveDays} (projeté)` });
    if (c.projectedPrecipitation !== null) rows.push({ label: '🌧️ Précipitations (2050)', value: `${c.projectedPrecipitation} mm (projeté)` });
    if (c.projectedStormFrequency !== null) rows.push({ label: '🌬️ Tempêtes (2050)', value: `${c.projectedStormFrequency}/5 (projeté)` });
    if (c.projectionModel) rows.push({ label: 'Modèle', value: c.projectionModel, mono: true });
    if (c.projectionScenario) rows.push({ label: 'Scénario', value: c.projectionScenario, mono: true });
  }

  // DRIAS ADAMONT bias-corrected indicators
  if (c.drias) {
    rows.push({ label: '', value: '' });
    rows.push({ label: '📐 Correction DRIAS ADAMONT', value: '', mono: true });
    if (c.drias.heatwaveDays !== null) rows.push({ label: '🔥 Jours canicule (corrigé)', value: `${c.drias.heatwaveDays}/an` });
    if (c.drias.tropicalNights !== null) rows.push({ label: '🌙 Nuits tropicales (corrigé)', value: `${c.drias.tropicalNights}/an` });
    if (c.drias.summerDays !== null) rows.push({ label: '☀️ Jours d\'été (corrigé)', value: `${c.drias.summerDays}/an` });
    if (c.drias.frostDays !== null) rows.push({ label: '❄️ Jours de gel (corrigé)', value: `${c.drias.frostDays}/an` });
    if (c.drias.heavyPrecipDays !== null) rows.push({ label: '🌧️ Fortes précip. (corrigé)', value: `${c.drias.heavyPrecipDays}/an` });
    if (c.drias.max5dayPrecip !== null) rows.push({ label: '💧 Max 5j précip. (corrigé)', value: `${c.drias.max5dayPrecip} mm` });
    if (c.drias.consecutiveDryDays !== null) rows.push({ label: '🏜️ Jours secs conséc. max', value: `${c.drias.consecutiveDryDays} j` });
    if (c.drias.fireWeatherIndex !== null) rows.push({ label: '🔥 Indice feux forêt', value: `${c.drias.fireWeatherIndex}` });
    if (c.drias.dataSource) rows.push({ label: 'Source DRIAS', value: c.drias.dataSource, mono: true });
    if (c.drias.warmingLevel) rows.push({ label: 'Niveau réchauff.', value: c.drias.warmingLevel, mono: true });
  }

  if (rows.length === 0) return '<div class="rp-empty">Données climatiques incomplètes</div>';
  return renderRows(rows);
}

/* ── Metadata ── */

function renderMetadata(m: RiskAssessmentInput['metadata']): string {
  const rows: RowDef[] = [];
  rows.push({ label: 'Adresse', value: m.addressLabel, mono: true });
  rows.push({ label: 'Coordonnées', value: `${m.latitude.toFixed(5)}, ${m.longitude.toFixed(5)}`, mono: true });
  rows.push({ label: 'Commune', value: `${m.communeName} (${m.communeCode})` });
  rows.push({ label: 'Date', value: m.assessmentDate });

  // Data freshness
  for (const [provider, date] of Object.entries(m.dataFreshness)) {
    if (date) {
      const labels: Record<string, string> = { bdnb: 'BDNB', georisques: 'Géorisques', dvf: 'DVF', ign: 'IGN', openmeteo_climate: 'Open-Meteo Climat', drias: 'DRIAS' };
      rows.push({ label: labels[provider] || provider, value: date });
    }
  }

  return renderRows(rows);
}

/* ── Shared row renderer ── */

interface RowDef {
  label: string;
  value: string;
  badge?: boolean;
  mono?: boolean;
}

function renderRows(rows: RowDef[]): string {
  return rows.map(r => `
    <div class="rp-row">
      <span class="rp-row-label">${r.label}</span>
      <span class="rp-row-value ${r.badge ? 'rp-row-value-badge' : ''} ${r.mono ? 'rp-row-value-mono' : ''}">${r.value}</span>
    </div>
  `).join('');
}
