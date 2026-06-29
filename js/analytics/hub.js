// ===========================================================================
//  RadPlan · Auswertungs-Hub (Analytics Hub) – Shell & Routing
// ---------------------------------------------------------------------------
//  Zentraler, frage-/domänen-orientierter Auswertungsbereich. Ein Modal mit
//  linker Navigation (Domänen), globalem Zeitraum-Selektor und einem Inhalts-
//  bereich, der das jeweils aktive Modul rendert. Module sind autark
//  (eigene Datei, eigenes CSS) und implementieren einen schlanken Vertrag:
//
//    export default {
//      id, label, icon (SVG-String), usesRange (bool),
//      render(rootEl, ctx),   // ctx = { range, year, month, hub, openProfile }
//      dispose()              // optional: Charts etc. abräumen
//    }
// ===========================================================================

import { showOverlay, hideOverlay, openProfileModal } from '../render-modals.js';
import { state } from '../state.js';
import { getRange, RANGE_DEFS, MONTHS_SHORT, TT } from './engine.js';

// Erklärende Mouse-Over-Texte je Zeitraum-Pille (Schlüssel = RANGE_DEFS.key).
const RANGE_TIPS = {
  month: TT.rangeMonth, quarter: TT.rangeQuarter, ytd: TT.rangeYtd,
  year: TT.rangeYear, rolling12: TT.rangeRolling12, custom: TT.rangeCustom,
};

import dashboard from './dashboard.js';
import coverage from './mod-coverage.js';
import fairness from './mod-fairness.js';
import yeargrid from './mod-yeargrid.js';
import curves from './mod-curves.js';
import absence from './mod-absence.js';
import compliance from './mod-compliance.js';
import forecast from './mod-forecast.js';
import reports from './mod-reports.js';

// Reihenfolge in der Navigation (Frage-/Domänen-Logik + Dashboard + Berichte).
const MODULES = [dashboard, coverage, fairness, yeargrid, curves, absence, compliance, forecast, reports];
const MODULE_MAP = new Map(MODULES.map((m) => [m.id, m]));

const hubState = {
  activeId: 'overview',
  rangeKey: 'month',
  custom: null,        // { start:{year,month}, end:{year,month} }
  mounted: false,
};

let activeModule = null;

const hub = {
  goto(id) {
    if (!MODULE_MAP.has(id)) return;
    hubState.activeId = id;
    renderActive();
    renderNav();
  },
  setRange(key) {
    hubState.rangeKey = key;
    renderRangeBar();
    renderActive();
  },
  currentRange() {
    return getRange(hubState.rangeKey, state.year, state.month, hubState.custom);
  },
  openProfile(emp) {
    openProfileModal(emp);
  },
};

function disposeActive() {
  if (activeModule && typeof activeModule.dispose === 'function') {
    try { activeModule.dispose(); } catch (_) { /* tolerant */ }
  }
}

function renderNav() {
  const nav = document.getElementById('ah-nav');
  if (!nav) return;
  nav.innerHTML = MODULES.map((m) => `
    <button type="button" class="ah-nav-item${m.id === hubState.activeId ? ' active' : ''}" data-mod="${m.id}" role="tab" aria-selected="${m.id === hubState.activeId}">
      <span class="ah-nav-ico" aria-hidden="true">${m.icon || ''}</span>
      <span class="ah-nav-lbl">${m.label}</span>
    </button>`).join('');
  nav.querySelectorAll('[data-mod]').forEach((btn) => {
    btn.addEventListener('click', () => hub.goto(btn.dataset.mod));
  });
}

function renderRangeBar() {
  const bar = document.getElementById('ah-range-bar');
  if (!bar) return;
  const mod = MODULE_MAP.get(hubState.activeId);
  const usesRange = mod ? mod.usesRange !== false : true;

  if (!usesRange) {
    bar.innerHTML = `<span class="ah-range-static" data-tooltip="${TT.rangeYear}">Bezug: Gesamtjahr ${state.year}</span>`;
    return;
  }

  const pills = RANGE_DEFS.map((r) => `
    <button type="button" class="ah-range-pill${r.key === hubState.rangeKey ? ' active' : ''}" data-range="${r.key}" data-tooltip="${RANGE_TIPS[r.key] || TT.range}" data-tooltip-pos="bottom">${r.label}</button>`).join('');

  const cs = hubState.custom?.start || { year: state.year, month: Math.max(0, state.month - 2) };
  const ce = hubState.custom?.end || { year: state.year, month: state.month };
  const customUi = hubState.rangeKey === 'custom' ? `
    <span class="ah-range-custom">
      <input type="month" id="ah-range-start" value="${cs.year}-${String(cs.month + 1).padStart(2, '0')}">
      <span>–</span>
      <input type="month" id="ah-range-end" value="${ce.year}-${String(ce.month + 1).padStart(2, '0')}">
    </span>` : '';

  bar.innerHTML = `<div class="ah-range-pills">${pills}</div>${customUi}`;

  bar.querySelectorAll('[data-range]').forEach((btn) => {
    btn.addEventListener('click', () => hub.setRange(btn.dataset.range));
  });
  bar.querySelector('#ah-range-start')?.addEventListener('change', (e) => {
    const [y, m] = e.target.value.split('-').map(Number);
    if (Number.isFinite(y) && Number.isFinite(m)) {
      hubState.custom = { start: { year: y, month: m - 1 }, end: ce };
      renderActive();
    }
  });
  bar.querySelector('#ah-range-end')?.addEventListener('change', (e) => {
    const [y, m] = e.target.value.split('-').map(Number);
    if (Number.isFinite(y) && Number.isFinite(m)) {
      hubState.custom = { start: cs, end: { year: y, month: m - 1 } };
      renderActive();
    }
  });
}

function renderActive() {
  const content = document.getElementById('ah-content');
  if (!content) return;
  disposeActive();
  const mod = MODULE_MAP.get(hubState.activeId) || dashboard;
  activeModule = mod;
  renderRangeBar();

  const usesRange = mod.usesRange !== false;
  const range = usesRange
    ? getRange(hubState.rangeKey, state.year, state.month, hubState.custom)
    : getRange('year', state.year, state.month);

  content.innerHTML = '';
  content.scrollTop = 0;
  content.className = `ah-content ah-mod-${mod.id}`;

  try {
    mod.render(content, { range, year: state.year, month: state.month, hub, openProfile: hub.openProfile });
  } catch (err) {
    console.error(`[AnalyticsHub] Modul „${mod.id}" Renderfehler:`, err);
    content.innerHTML = `<div class="ah-empty ah-error">Dieses Modul konnte nicht geladen werden.<br><small>${(err && err.message) || ''}</small></div>`;
  }

  // sanftes Einblenden
  content.classList.remove('ah-fade');
  void content.offsetWidth;
  content.classList.add('ah-fade');
}

function mountChrome() {
  if (hubState.mounted) return;
  const closeBtn = document.getElementById('ah-close');
  if (closeBtn) closeBtn.addEventListener('click', () => hideOverlay('modal-analytics'));
  const overlay = document.getElementById('modal-analytics');
  if (overlay) {
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) hideOverlay('modal-analytics');
    });
  }
  hubState.mounted = true;
}

// Öffentlicher Einstieg: Hub öffnen und optional direkt auf ein Modul springen.
export function openAnalyticsHub(moduleId) {
  mountChrome();
  if (moduleId && MODULE_MAP.has(moduleId)) hubState.activeId = moduleId;
  showOverlay('modal-analytics');
  renderNav();
  renderRangeBar();
  renderActive();
}

// Für die Befehlspalette / externe Sprungziele.
export function analyticsModuleList() {
  return MODULES.map((m) => ({ id: m.id, label: m.label }));
}
