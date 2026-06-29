// ===========================================================================
//  Auswertungs-Hub · Modul „Übersicht" (Dashboard-Einstieg)
// ---------------------------------------------------------------------------
//  Verdichtet alle Domänen zu Kennzahl-Kacheln mit Ampel-Logik und führt per
//  Klick (Drill-down) in das jeweilige Fachmodul. Bewusst leichtgewichtig:
//  aggregiert nur, rechnet nicht doppelt.
// ===========================================================================

import {
  getRange, computeCoverage, computeAbsence, computeCompliance, computeForecast,
  computeDutyFairness, computeWishFulfillment, employeesInRange,
  fmt, scoreColor, MONTHS, TT,
} from './engine.js';

const ICON = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>';

export default {
  id: 'overview',
  label: 'Übersicht',
  usesRange: true,
  icon: ICON,

  render(root, ctx) {
    const range = ctx.range;
    const cov = computeCoverage(range);
    const fair = computeDutyFairness(range.year);
    const abs = computeAbsence(range);
    const comp = computeCompliance(range);
    const wish = computeWishFulfillment(range);
    const emps = employeesInRange(range);

    const tiles = [
      {
        dom: 'coverage', label: 'Abdeckung', value: `${cov.dPct}/${cov.hgPct}`, unit: '%',
        sub: `D / HG besetzt · ${cov.openDays} Tage offen`,
        score: Math.round((cov.dPct + cov.hgPct) / 2), tip: TT.coverage,
      },
      {
        dom: 'coverage', label: 'Risiko-Index', value: cov.riskScore, unit: '',
        sub: `${cov.weHolDGaps + cov.weHolHgGaps} WE/Feiertagslücken`,
        score: cov.riskScore, tip: TT.riskScore,
      },
      {
        dom: 'fairness', label: 'Fairness (Equity)', value: fair.team.equityTotal, unit: '',
        sub: `Spannweite ${fair.team.minTotal}–${fair.team.maxTotal} Dienste`,
        score: fair.team.equityTotal, tip: TT.equityTotal,
      },
      {
        dom: 'compliance', label: 'Regelkonformität', value: comp.score, unit: '',
        sub: `${comp.findings.length} Befund(e) · ${comp.bySeverity.high} kritisch`,
        score: comp.score, tip: TT.complianceScore,
      },
      {
        dom: 'absence', label: 'Abwesenheiten', value: fmt.int(abs.totalAbsenceDays), unit: ' T',
        sub: abs.peak ? `Spitze: ${abs.peak.absent} gleichzeitig` : 'keine Daten',
        score: null, tone: '#7C3AED', tip: TT.absence,
      },
      {
        dom: 'forecast', label: 'Wunscherfüllung', value: wish.rate === null ? '—' : wish.rate, unit: wish.rate === null ? '' : '%',
        sub: `${wish.fulfilled}/${wish.wishes} erfüllt`,
        score: wish.rate, tip: TT.wishRate,
      },
    ];

    const tileHtml = tiles.map((t) => {
      const tone = t.tone || (t.score === null ? '#0EA5E9' : scoreColor(t.score));
      return `
        <button type="button" class="ah-tile" data-goto="${t.dom}" data-tooltip="${t.tip}" data-tooltip-pos="bottom">
          <div class="ah-tile-label">${t.label}</div>
          <div class="ah-tile-value" style="color:${tone}">${t.value}<span class="ah-tile-unit">${t.unit}</span></div>
          <div class="ah-tile-sub">${t.sub}</div>
          ${t.score !== null ? `<div class="ah-tile-bar"><div style="width:${Math.min(100, Math.max(0, t.score))}%;background:${tone}"></div></div>` : ''}
        </button>`;
    }).join('');

    // Kontext-Leiste: Team-Eckdaten.
    const fa = fair.rows.filter((r) => r.canFacharzt).length;
    const head = `
      <div class="ah-dash-head">
        <div class="ah-dash-title">Lagebild · ${range.label}</div>
        <div class="ah-dash-meta"><span data-tooltip="${TT.empActive}">${emps.length} Mitarbeitende</span> · <span data-tooltip="${TT.duty}">${fair.team.totalDuties} Dienste (D+HG)</span> · <span data-tooltip="${TT.weekendDuties}">${fair.team.totalWeekend} an WE/Feiertagen</span></div>
      </div>`;

    // Mini-Handlungsbedarf-Liste (Top-Befunde).
    const alerts = [];
    if (cov.openDays > 0) alerts.push({ dom: 'coverage', t: `${cov.openDays} Tag(e) ganz ohne Dienstbesetzung`, sev: 'high' });
    if (cov.weHolDGaps + cov.weHolHgGaps > 0) alerts.push({ dom: 'coverage', t: `${cov.weHolDGaps + cov.weHolHgGaps} unbesetzte Dienste an Wochenenden/Feiertagen`, sev: 'high' });
    if (comp.bySeverity.high > 0) alerts.push({ dom: 'compliance', t: `${comp.bySeverity.high} kritische Regelverstöße`, sev: 'high' });
    if (fair.team.equityTotal < 70) alerts.push({ dom: 'fairness', t: `Ungleiche Dienstverteilung (Equity ${fair.team.equityTotal}/100)`, sev: 'mid' });
    if (wish.violated > 0) alerts.push({ dom: 'forecast', t: `${wish.violated} verletzte „Kein Dienst"-Wünsche`, sev: 'mid' });

    const alertHtml = alerts.length ? `
      <div class="ah-dash-section">
        <div class="ah-section-title">Handlungsbedarf</div>
        <div class="ah-alert-list">
          ${alerts.map((a) => `
            <button type="button" class="ah-alert ah-alert-${a.sev}" data-goto="${a.dom}">
              <span class="ah-alert-dot"></span><span class="ah-alert-text">${a.t}</span>
              <span class="ah-alert-go">›</span>
            </button>`).join('')}
        </div>
      </div>` : `
      <div class="ah-dash-section">
        <div class="ah-section-title">Handlungsbedarf</div>
        <div class="ah-ok-banner">Keine kritischen Befunde im Zeitraum ${range.label}.</div>
      </div>`;

    root.innerHTML = `${head}<div class="ah-tile-grid">${tileHtml}</div>${alertHtml}`;

    root.querySelectorAll('[data-goto]').forEach((el) => {
      el.addEventListener('click', () => ctx.hub.goto(el.dataset.goto));
    });
  },

  dispose() {},
};
