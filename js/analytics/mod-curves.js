// ===========================================================================
//  Auswertungs-Hub · Modul „Fairness-Verlauf" (kumulierte Abweichungskurven)
// ---------------------------------------------------------------------------
//  Native Portierung der Fairness-Kurven aus dem früheren Jahresplaner:
//  zeichnet für jede Person die kumulierte Abweichung vom monatlichen
//  Kollegiums-Durchschnitt (umschaltbar BD/HG). Flache Linie bei 0 = perfekte
//  Gleichverteilung. Ergänzt um eine Heatmap-Tabelle der Monatswerte.
// ===========================================================================

import { computeYearGrid, heatColor, posColor, isDutyExempt, MONTHS, MONTHS_SHORT, TT } from './engine.js';

const ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M19 9l-5 5-4-4-4 4"/></svg>';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

let _chart = null;
let _mode = 'bd';

export default {
  id: 'curves',
  label: 'Fairness-Verlauf',
  usesRange: false,
  icon: ICON,

  render(root, ctx) {
    const year = ctx.year;
    const { employees, perEmp, meansBD, meansHG } = computeYearGrid(year);

    if (!employees.length) {
      root.innerHTML = `<div class="ah-empty">Keine Mitarbeitendendaten für ${year} vorhanden.</div>`;
      return;
    }

    const isHG = _mode === 'hg';
    const means = isHG ? meansHG : meansBD;
    const relEmps = isHG
      ? employees.filter((e) => perEmp[e].isFa && !isDutyExempt(e))
      : employees.filter((e) => perEmp[e].isDutyCapable);

    const cumDevs = {};
    relEmps.forEach((emp) => {
      let running = 0;
      cumDevs[emp] = perEmp[emp].months.map((mon, m) => {
        if (!mon.hasData) return null;
        running += (isHG ? mon.hg : mon.bd) - means[m];
        return parseFloat(running.toFixed(2));
      });
    });

    const modeLabel = isHG ? 'Hintergrunddienst (HG)' : 'Bereitschaftsdienst (D)';

    root.innerHTML = `
      <div class="ah-section-title" data-tooltip="${esc(TT.curve)}">Fairness-Verlauf <span class="ah-sub">— kumulierte Abweichung vom Kollegiums-Ø · Bezug: ${year}</span></div>
      <div class="crv-controls">
        <div class="crv-toggle" role="group" aria-label="Dienstart umschalten">
          <button type="button" class="crv-mode${!isHG ? ' active' : ''}" data-mode="bd" data-tooltip="${esc(TT.bd)}">BD · Bereitschaft</button>
          <button type="button" class="crv-mode${isHG ? ' active' : ''}" data-mode="hg" data-tooltip="${esc(TT.hg)}">HG · Hintergrund</button>
        </div>
        <p class="crv-hint">Kumulierte Abweichung je Person vom monatlichen Ø (<em>${modeLabel}</em>). Über 0 = überdurchschnittlich, unter 0 = unterdurchschnittlich; flache Linie bei 0 = perfekte Gleichverteilung.</p>
      </div>
      <div class="ah-card crv-chart-card">
        <div class="crv-legend" id="crv-legend" data-tooltip="Farbzuordnung der Linien zu den Personen. Jede Linie zeigt die kumulierte Abweichung dieser Person vom monatlichen Kollegiums-Durchschnitt."></div>
        <div class="crv-canvas-wrap"><canvas id="crv-canvas" data-tooltip="Liniendiagramm der kumulierten Abweichung je Person vom monatlichen Dienst-Durchschnitt des Kollegiums. Steigt eine Linie, leistet die Person zunehmend mehr als der Schnitt; faellt sie, weniger. Die gestrichelte Linie bei 0 markiert die perfekte Gleichverteilung."></canvas></div>
      </div>
      <div class="ah-section-title" data-tooltip="Monatliche Dienstanzahl je Person, eingefaerbt nach Abweichung vom Monats-Kollegiums-Durchschnitt (${esc(TT.yeargridMean)}).">Monatswerte (${modeLabel})</div>
      <div class="ah-table-wrap">
        <table class="ah-table crv-table">
          <thead><tr><th data-tooltip="${esc(TT.empActive)}">Mitarbeitende</th>${MONTHS_SHORT.map((s) => `<th data-tooltip="Dienste in diesem Monat. Faerbung nach Abweichung vom Monats-Kollegiums-Durchschnitt.">${s}</th>`).join('')}<th data-tooltip="Summe aller Dienste der Person im Jahr (${modeLabel}).">Σ</th><th data-tooltip="Abweichung der Jahressumme vom aufsummierten Soll (Summe der Monats-Durchschnitte ueber die Datenmonate der Person). Positiv = mehr als der faire Anteil, negativ = weniger.">Abw.</th></tr></thead>
          <tbody>
            ${relEmps.map((emp) => {
              const d = perEmp[emp];
              const vals = d.months.map((mon) => (!mon.hasData ? null : (isHG ? mon.hg : mon.bd)));
              const total = isHG ? d.totalHG : d.totalBD;
              const totalMean = means.reduce((sum, mv, mi) => sum + (d.months[mi].hasData ? mv : 0), 0);
              const devNum = parseFloat((total - totalMean).toFixed(1));
              const devCol = devNum > 0.5 ? '#C2410C' : devNum < -0.5 ? '#0369A1' : '#15803D';
              const pc = posColor(d.meta.position);
              const cells = vals.map((v, m) => {
                if (v === null) return '<td class="ah-td-num crv-nd">—</td>';
                const h = heatColor(v - means[m]);
                return `<td class="ah-td-num" style="background:${h.bg};color:${h.fg}" data-tooltip="Durchschnitt: Ø ${means[m].toFixed(1)}">${v}</td>`;
              }).join('');
              return `<tr class="clickable" data-emp="${esc(emp)}">
                <td style="border-left:3px solid ${pc.border}">${esc(emp)}</td>
                ${cells}
                <td class="ah-td-num"><strong>${total}</strong></td>
                <td class="ah-td-num" style="color:${devCol};font-weight:700">${devNum > 0 ? '+' : ''}${String(devNum).replace('.', ',')}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;

    root.querySelectorAll('.crv-mode').forEach((btn) => {
      btn.addEventListener('click', () => { _mode = btn.dataset.mode; this.render(root, ctx); });
    });
    root.querySelectorAll('tr.clickable[data-emp]').forEach((tr) => {
      tr.addEventListener('click', () => ctx.openProfile(tr.dataset.emp));
    });

    // Chart.js Liniendiagramm (optional, mit Guard).
    const canvas = root.querySelector('#crv-canvas');
    if (!canvas || typeof Chart === 'undefined') return;
    const datasets = relEmps.map((emp) => ({
      label: emp, data: cumDevs[emp],
      borderColor: perEmp[emp].color, backgroundColor: perEmp[emp].color + '18',
      borderWidth: 2, pointRadius: 3, pointHoverRadius: 6, tension: 0.35, spanGaps: false,
    }));
    datasets.push({ label: 'Ideal (Ø)', data: Array(12).fill(0), borderColor: 'rgba(100,116,139,0.35)', borderDash: [6, 4], pointRadius: 0, borderWidth: 1.5, tension: 0, fill: false });

    if (_chart) { try { _chart.destroy(); } catch (_) {} }
    _chart = new Chart(canvas, {
      type: 'line',
      data: { labels: MONTHS_SHORT, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: {
            label: (c) => { if (c.dataset.label === 'Ideal (Ø)') return null; const v = c.raw; if (v == null) return null; return ` ${c.dataset.label}: ${v >= 0 ? '+' : ''}${v.toFixed(2)}`; },
            title: (items) => `${MONTHS[items[0]?.dataIndex ?? 0]} ${year}`,
          } },
        },
        scales: {
          x: { grid: { color: 'rgba(128,128,128,0.08)' }, ticks: { font: { size: 10 } } },
          y: { grid: { color: 'rgba(128,128,128,0.08)' }, ticks: { font: { size: 10 }, callback: (v) => (v >= 0 ? '+' : '') + v }, title: { display: true, text: 'Kum. Abw. vom Ø', font: { size: 9 }, color: '#94A3B8' } },
        },
        animation: { duration: 350 },
      },
    });

    const legendEl = root.querySelector('#crv-legend');
    if (legendEl) {
      legendEl.innerHTML = relEmps.map((emp) => `<span class="crv-legitem"><span class="crv-legline" style="background:${perEmp[emp].color}"></span>${esc(emp)}</span>`).join('');
    }
  },

  dispose() { if (_chart) { try { _chart.destroy(); } catch (_) {} _chart = null; } },
};
