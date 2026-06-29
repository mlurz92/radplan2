// ===========================================================================
//  RadPlan · Auswertungs-Hub · Modul „Regelkonformität"
// ---------------------------------------------------------------------------
//  Audit-orientierte Prüfung von Ruhezeiten, Dienst-Häufungen, Sonderregeln
//  und Qualifikations-Vorgaben. Liefert einen Compliance-Score, Kennzahlen,
//  eine Typ-Aufschlüsselung sowie eine filterbare, nach Schweregrad
//  gruppierte Befundliste.
// ===========================================================================

import { computeCompliance, fmt, scoreColor, MONTHS_SHORT, TT } from './engine.js';

const TYPE_LABELS = {
  rest: 'Ruhezeit-Verstöße',
  cluster: 'Dienst-Häufungen',
  rule: 'Sonderregel-Verstöße',
  qual: 'Qualifikations-Verstöße',
};

const SEV_LABELS = { high: 'Kritisch', mid: 'Mittel', low: 'Niedrig' };
const SEV_ORDER = ['high', 'mid', 'low'];

// Erklär-Texte je Befundtyp (Glossar) und je Schweregrad für Mouse-Over.
const TYPE_TT = {
  rest: TT.findingRest,
  cluster: TT.findingCluster,
  rule: TT.findingRule,
  qual: TT.findingQual,
};
const SEV_TT = {
  high: TT.sevHigh,
  mid: TT.sevMid,
  low: 'Geringer Befund – nachrangiger Hinweis ohne harte Regelverletzung.',
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const fmtDate = (f) => `${f.day}. ${MONTHS_SHORT[f.month]} ${f.year}`;

export default {
  id: 'compliance',
  label: 'Regelkonformität',
  usesRange: true,
  icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>',

  render(root, ctx) {
    this._root = root;
    this._ctx = ctx;
    this._filter = 'all';

    let data;
    try {
      data = computeCompliance(ctx.range);
    } catch (e) {
      root.innerHTML = `<div class="ah-empty ah-error">Regelkonformität konnte nicht berechnet werden: ${esc(e?.message || e)}</div>`;
      return;
    }
    this._data = data;

    const { findings, bySeverity, byType, score } = data;
    const col = scoreColor(score);

    const kpis = `
      <div class="ah-kpi-grid">
        <div class="ah-kpi">
          <div class="ah-kpi-label" data-tooltip="Gesamtzahl aller im Zeitraum gefundenen Regelverstöße über alle Typen und Schweregrade.">Befunde gesamt</div>
          <div class="ah-kpi-value">${fmt.int(findings.length)}</div>
        </div>
        <div class="ah-kpi">
          <div class="ah-kpi-label" data-tooltip="${esc(TT.sevHigh)}">Kritisch</div>
          <div class="ah-kpi-value" style="color:#EF4444">${fmt.int(bySeverity.high)}</div>
        </div>
        <div class="ah-kpi">
          <div class="ah-kpi-label" data-tooltip="${esc(TT.sevMid)}">Mittel</div>
          <div class="ah-kpi-value" style="color:#F59E0B">${fmt.int(bySeverity.mid)}</div>
        </div>
        <div class="ah-kpi">
          <div class="ah-kpi-label" data-tooltip="${esc(SEV_TT.low)}">Niedrig</div>
          <div class="ah-kpi-value" style="color:#64748B">${fmt.int(bySeverity.low)}</div>
        </div>
      </div>`;

    const header = `
      <div class="comp-header">
        <div class="comp-score" style="--comp-score-col:${col}" data-tooltip="${esc(TT.complianceScore)}" data-tooltip-pos="bottom">
          <div class="comp-score-value">${fmt.int(score)}</div>
          <div class="comp-score-label">Compliance-Score</div>
        </div>
        <div class="comp-header-kpis">${kpis}</div>
      </div>`;

    // Typ-Aufschlüsselung
    const typeChips = Object.keys(TYPE_LABELS).map((t) => {
      const n = byType[t] || 0;
      return `<div class="comp-type-chip${n ? '' : ' comp-type-chip--zero'}" data-type="${t}" data-tooltip="${esc(TYPE_TT[t] || '')}">
        <div class="comp-type-count">${fmt.int(n)}</div>
        <div class="comp-type-label">${TYPE_LABELS[t]}</div>
      </div>`;
    }).join('');

    const typeSection = `
      <div class="ah-section-title" data-tooltip="${esc(TT.compliance)}">Typ-Aufschlüsselung</div>
      <div class="comp-type-grid">${typeChips}</div>`;

    let body;
    if (!findings.length) {
      body = `<div class="ah-ok-banner">Keine Regelverstöße im Zeitraum — alle Vorgaben eingehalten.</div>`;
    } else {
      const filters = [
        ['all', `Alle (${findings.length})`],
        ['high', `Kritisch (${bySeverity.high})`],
        ['mid', `Mittel (${bySeverity.mid})`],
        ['low', `Niedrig (${bySeverity.low})`],
      ].map(([k, lbl]) =>
        `<button type="button" class="comp-filter${k === 'all' ? ' is-active' : ''}" data-filter="${k}">${esc(lbl)}</button>`
      ).join('');

      body = `
        <div class="ah-section-title" data-tooltip="Chronologisch nach Schweregrad gruppierte Liste aller Regelverstöße. Klick auf einen Befund öffnet das Profil der betroffenen Person.">Befundliste</div>
        <div class="comp-filters" role="tablist">${filters}</div>
        <div class="comp-list">${this._renderList('all')}</div>`;
    }

    root.innerHTML = `<div class="comp-mod">${header}${typeSection}${body}</div>`;

    // Filter-Pillen
    root.querySelectorAll('.comp-filter').forEach((btn) => {
      btn.addEventListener('click', () => {
        this._filter = btn.dataset.filter;
        root.querySelectorAll('.comp-filter').forEach((b) =>
          b.classList.toggle('is-active', b === btn));
        const list = root.querySelector('.comp-list');
        if (list) list.innerHTML = this._renderList(this._filter);
        this._bindRows();
      });
    });
    this._bindRows();
  },

  _renderList(filter) {
    const findings = this._data?.findings || [];
    const groups = SEV_ORDER
      .filter((sev) => filter === 'all' || filter === sev)
      .map((sev) => {
        const rows = findings.filter((f) => f.severity === sev);
        if (!rows.length) return '';
        const items = rows.map((f) => {
          const idx = findings.indexOf(f);
          return `<div class="comp-finding" data-idx="${idx}" tabindex="0" role="button">
            <span class="comp-dot comp-dot--${sev}" data-tooltip="${esc(SEV_TT[sev] || '')}"></span>
            <span class="comp-badge comp-badge--${f.type}" data-tooltip="${esc(TYPE_TT[f.type] || '')}">${esc(TYPE_LABELS[f.type] || f.type)}</span>
            <span class="comp-text">${esc(f.text)}</span>
            <span class="comp-date">${esc(fmtDate(f))}</span>
          </div>`;
        }).join('');
        return `<div class="comp-group comp-group--${sev}">
          <div class="comp-group-head" data-tooltip="${esc(SEV_TT[sev] || '')}"><span class="comp-dot comp-dot--${sev}"></span>${SEV_LABELS[sev]} · ${rows.length}</div>
          ${items}
        </div>`;
      }).join('');

    return groups || `<div class="ah-empty">Keine Befunde in dieser Auswahl.</div>`;
  },

  _bindRows() {
    const root = this._root;
    if (!root) return;
    const open = (idx) => {
      const f = this._data?.findings?.[idx];
      if (f && f.emp) this._ctx?.openProfile?.(f.emp);
    };
    root.querySelectorAll('.comp-finding').forEach((row) => {
      const idx = Number(row.dataset.idx);
      row.addEventListener('click', () => open(idx));
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(idx); }
      });
    });
  },

  dispose() {
    this._root = null;
    this._ctx = null;
    this._data = null;
  },
};
