// ===========================================================================
//  RadPlan · Auswertungs-Hub · Modul „Abdeckung & Risiko"
// ---------------------------------------------------------------------------
//  Tagesgenaue Besetzungs-/Lückenanalyse für Bereitschafts- (D) und
//  Hintergrunddienst (HG): KPI-Übersicht, Risiko-Kalender und Lückenliste.
//  Importiert ausschließlich aus ./engine.js.
// ===========================================================================

import {
  computeCoverage, eachDay, fmt, scoreColor, MONTHS, MONTHS_SHORT, DOW_ABBR, TT,
} from './engine.js';

// HTML-Escape für tooltips / Texte.
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// Was fehlt an einem Tag?
function missingLabel(day) {
  if (!day.hasD && !day.hasHG) return 'D + HG';
  if (!day.hasD) return 'D';
  if (!day.hasHG) return 'HG';
  return '';
}

// Tooltip-Text für eine Tageszelle.
function dayTitle(day) {
  const date = `${String(day.day).padStart(2, '0')}.${String(day.month + 1).padStart(2, '0')}.${day.year}`;
  const dow = DOW_ABBR[day.wd];
  const parts = [`${dow}, ${date}`];
  if (day.holiday && day.holName) parts.push(`Feiertag: ${day.holName}`);
  else if (day.weekendOrHoliday) parts.push('Wochenende');
  if (day.status === 'full') {
    parts.push('Vollständig besetzt');
    if (day.dOwner) parts.push(`D: ${day.dOwner}`);
    if (day.hgOwner) parts.push(`HG: ${day.hgOwner}`);
  } else {
    parts.push(`Fehlt: ${missingLabel(day)}`);
    parts.push(`D: ${day.dOwner || '—'}`);
    parts.push(`HG: ${day.hgOwner || '—'}`);
  }
  return parts.join(' · ');
}

let _root = null;

export default {
  id: 'coverage',
  label: 'Abdeckung & Risiko',
  usesRange: true,
  icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>',

  render(root, ctx) {
    _root = root;
    const range = ctx?.range;
    if (!range || !range.months || !range.months.length) {
      root.innerHTML = '<div class="ah-empty">Kein Zeitraum gewählt.</div>';
      return;
    }

    let cov;
    try {
      cov = computeCoverage(range);
    } catch (e) {
      root.innerHTML = '<div class="ah-empty">Abdeckung konnte nicht berechnet werden.</div>';
      return;
    }

    if (!cov || !cov.totalDays) {
      root.innerHTML = `<div class="ah-empty">Für ${esc(range.label)} liegen keine Plandaten vor.</div>`;
      return;
    }

    // -- KPI-Reihe --------------------------------------------------------
    const weHolGaps = cov.weHolDGaps + cov.weHolHgGaps;
    const kpis = [
      { label: 'D-Abdeckung', tip: TT.dPct, value: fmt.pct(cov.dPct), color: scoreColor(cov.dPct),
        sub: `${fmt.int(cov.dCovered)} / ${fmt.int(cov.totalDays)} Tage` },
      { label: 'HG-Abdeckung', tip: TT.hgPct, value: fmt.pct(cov.hgPct), color: scoreColor(cov.hgPct),
        sub: `${fmt.int(cov.hgCovered)} / ${fmt.int(cov.totalDays)} Tage` },
      { label: 'Risiko-Index', tip: TT.riskScore, value: fmt.int(cov.riskScore), color: scoreColor(cov.riskScore),
        sub: `${fmt.int(cov.fullDays)} voll · ${fmt.int(cov.partialDays)} teilw.` },
      { label: 'Offene Tage', tip: TT.openDays, value: fmt.int(cov.openDays), color: cov.openDays > 0 ? '#EF4444' : '#22C55E',
        sub: 'D und HG fehlen' },
      { label: 'WE/Feiertagslücken', tip: TT.weHolGaps, value: fmt.int(weHolGaps), color: weHolGaps > 0 ? '#EF4444' : '#22C55E',
        sub: `D: ${fmt.int(cov.weHolDGaps)} · HG: ${fmt.int(cov.weHolHgGaps)}` },
    ];

    const kpiHtml = `
      <div class="ah-section-title" data-tooltip="${esc(TT.range)}">Kennzahlen · ${esc(range.label)}</div>
      <div class="ah-kpi-grid">
        ${kpis.map((k) => `
          <div class="ah-kpi">
            <div class="ah-kpi-label" data-tooltip="${esc(k.tip)}">${esc(k.label)}</div>
            <div class="ah-kpi-value" style="color:${k.color}">${esc(k.value)}</div>
            <div class="ah-kpi-sub">${esc(k.sub)}</div>
          </div>`).join('')}
      </div>`;

    // -- Risiko-Kalender ---------------------------------------------------
    // Tage nach Monat gruppieren, in Monatsreihenfolge des Zeitraums.
    const dayMap = new Map(); // "y-m" -> [days]
    cov.days.forEach((d) => {
      const key = `${d.year}-${d.month}`;
      if (!dayMap.has(key)) dayMap.set(key, []);
      dayMap.get(key).push(d);
    });

    const calBlocks = range.months.map(({ year, month }) => {
      const key = `${year}-${month}`;
      const mdays = dayMap.get(key);
      if (!mdays || !mdays.length) return '';
      const byDay = new Map(mdays.map((d) => [d.day, d]));
      const firstWd = mdays[0].wd; // 0=So..6=Sa
      const lead = (firstWd + 6) % 7; // Leerzellen bis Montag-Start
      const last = mdays[mdays.length - 1].day;

      const dowHeader = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
        .map((d) => `<div class="cov-cal-dow">${d}</div>`).join('');

      let cells = '';
      for (let i = 0; i < lead; i++) cells += '<div class="cov-cell cov-cell-empty"></div>';
      for (let d = 1; d <= last; d++) {
        const day = byDay.get(d);
        if (!day) { cells += '<div class="cov-cell cov-cell-empty"></div>'; continue; }
        const cls = [`cov-cell`, `cov-${day.status}`];
        if (day.weekendOrHoliday) cls.push('cov-wehol');
        cells += `
          <div class="${cls.join(' ')}" data-tooltip="${esc(dayTitle(day))}">
            <span class="cov-daynum">${day.day}</span>
            <span class="cov-ind">
              <i class="cov-dot ${day.hasD ? 'cov-on' : 'cov-off'}" data-l="D"></i>
              <i class="cov-dot ${day.hasHG ? 'cov-on' : 'cov-off'}" data-l="H"></i>
            </span>
          </div>`;
      }

      return `
        <div class="cov-cal-block">
          <div class="cov-cal-head">${MONTHS[month]} ${year}</div>
          <div class="cov-cal-grid">
            ${dowHeader}
            ${cells}
          </div>
        </div>`;
    }).join('');

    const legendHtml = `
      <div class="cov-legend">
        <span class="cov-leg" data-tooltip="${esc(TT.fullDays)}"><i class="cov-swatch cov-full"></i> Vollständig</span>
        <span class="cov-leg" data-tooltip="${esc(TT.partialDays)}"><i class="cov-swatch cov-partial"></i> Teilbesetzt (D od. HG)</span>
        <span class="cov-leg" data-tooltip="${esc(TT.openDays)}"><i class="cov-swatch cov-none"></i> Offen</span>
        <span class="cov-leg" data-tooltip="Wochenende oder gesetzlicher Feiertag (Sachsen) – Lücken zählen hier doppelt im Risiko-Index."><i class="cov-swatch cov-wehol-swatch"></i> WE/Feiertag</span>
      </div>`;

    const calHtml = `
      <div class="ah-section-title" data-tooltip="Kalender je Tag: D- und HG-Besetzung farbkodiert; Wochenenden/Feiertage hervorgehoben.">Risiko-Kalender</div>
      ${legendHtml}
      <div class="cov-cal-wrap">${calBlocks}</div>`;

    // -- Lückenliste -------------------------------------------------------
    const gaps = cov.days.filter((d) => d.status !== 'full');
    let gapHtml;
    if (!gaps.length) {
      gapHtml = `
        <div class="ah-section-title">Lückenliste</div>
        <div class="ah-ok-banner">Alle Dienste im Zeitraum vollständig besetzt.</div>`;
    } else {
      const rows = gaps.map((d) => {
        const date = `${String(d.day).padStart(2, '0')}.${String(d.month + 1).padStart(2, '0')}.${d.year}`;
        const dow = DOW_ABBR[d.wd];
        const tag = d.holiday && d.holName
          ? ` · <span class="cov-holname">${esc(d.holName)}</span>`
          : (d.weekendOrHoliday ? ' · WE' : '');
        const miss = missingLabel(d);
        const pillCls = d.status === 'none' ? 'ah-pill-bad' : 'ah-pill-warn';
        const trCls = d.weekendOrHoliday ? 'cov-row-wehol' : '';
        const have = `D: ${esc(d.dOwner || '—')} · HG: ${esc(d.hgOwner || '—')}`;
        return `
          <tr class="${trCls}">
            <td><span class="cov-dow">${dow}</span> ${date}${tag}</td>
            <td style="text-align:left"><span class="ah-pill ${pillCls}">${miss === 'D + HG' ? 'beide' : esc(miss)}</span></td>
            <td style="text-align:left" class="cov-have">${have}</td>
          </tr>`;
      }).join('');
      gapHtml = `
        <div class="ah-section-title">Lückenliste · ${fmt.int(gaps.length)} Tag(e)</div>
        <div class="ah-table-wrap">
          <table class="ah-table">
            <thead>
              <tr><th data-tooltip="Kalendertag mit unvollständiger Besetzung; WE/FT-Tage sind markiert.">Datum</th><th style="text-align:left" data-tooltip="Welcher Dienst an diesem Tag fehlt: D, HG oder beide.">Fehlt</th><th style="text-align:left" data-tooltip="Tatsächlich zugeteilte Personen für D und HG an diesem Tag.">Besetzung</th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    }

    root.innerHTML = `<div class="cov-module">${kpiHtml}${calHtml}${gapHtml}</div>`;
  },

  dispose() {
    // Keine Chart.js-Instanzen in diesem Modul.
    if (_root) { _root.innerHTML = ''; _root = null; }
  },
};
