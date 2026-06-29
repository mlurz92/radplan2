// ===========================================================================
//  Auswertungs-Hub · Modul „Jahresgitter" (Heatmap Monat × Mitarbeitende)
// ---------------------------------------------------------------------------
//  Native Portierung der Jahres-Heatmap aus dem früheren Jahresplaner: zeigt
//  je Monat die geleisteten Bereitschaftsdienste (BD) farbkodiert nach
//  Abweichung vom monatlichen Kollegiums-Durchschnitt; HG als Zusatz bei
//  Fachärzten. Klick auf eine Zelle springt in den jeweiligen Monat.
// ===========================================================================

import { computeYearGrid, heatColor, posColor, MONTHS, MONTHS_SHORT, TT } from './engine.js';

const ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/></svg>';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export default {
  id: 'yeargrid',
  label: 'Jahresgitter',
  usesRange: false,
  icon: ICON,

  render(root, ctx) {
    const year = ctx.year;
    const { employees, perEmp, meansBD, now } = computeYearGrid(year);

    if (!employees.length) {
      root.innerHTML = `<div class="ah-empty">Keine Mitarbeitendendaten für ${year} vorhanden.</div>`;
      return;
    }

    const monthHeaders = MONTHS_SHORT.map((mo, m) => {
      const isNow = year === now.year && m === now.month;
      const isFuture = year > now.year || (year === now.year && m > now.month);
      const moTip = `${MONTHS[m]} ${year} – Bereitschaftsdienste (D) je Person; Farbe zeigt die Abweichung vom Monats-Kollegiums-Durchschnitt.${isNow ? ' Aktueller Monat.' : (isFuture ? ' Liegt in der Zukunft.' : '')}`;
      return `<th class="yg-th-month${isNow ? ' yg-th-now' : ''}${isFuture ? ' yg-th-future' : ''}" data-tooltip="${esc(moTip)}">${mo}</th>`;
    }).join('');

    const meanRow = meansBD.map((v) => `<td class="yg-td-mean">${v > 0 ? v.toFixed(1) : '<span class="yg-dash">—</span>'}</td>`).join('');

    let bodyRows = '';
    let lastGroup = null;
    employees.forEach((emp) => {
      const d = perEmp[emp];
      const meta = d.meta;
      const pc = posColor(meta.position);
      const group = d.isFa ? 'fa' : 'aa';
      if (group !== lastGroup) {
        lastGroup = group;
        bodyRows += `<tr class="yg-group-row"><td colspan="14" class="yg-group-label">${d.isFa ? 'Fachärzte / Oberärzte' : 'Assistenzärzte'}</td></tr>`;
      }

      const cells = d.months.map((mon, m) => {
        const isNow = year === now.year && m === now.month;
        const isFuture = year > now.year || (year === now.year && m > now.month);
        if (!mon.hasData) {
          return `<td class="yg-td-cell yg-td-nodata">${isFuture ? '<span class="yg-future"></span>' : '<span class="yg-dash">—</span>'}</td>`;
        }
        const heat = d.isDutyCapable ? heatColor(mon.bd - meansBD[m]) : { bg: 'transparent', fg: '#94A3B8' };
        const hgPart = d.isFa && mon.hg > 0 ? `<span class="yg-hg">${mon.hg}<span class="yg-hg-lbl">H</span></span>` : '';
        const bdPart = d.isDutyCapable
          ? `<span class="yg-bd" style="color:${heat.fg}">${mon.bd}<span class="yg-bd-lbl">D</span></span>`
          : '<span class="yg-dash">—</span>';
        const title = `${esc(emp)} · ${MONTHS[m]} ${year}: ${mon.bd}× D${d.isFa ? ', ' + mon.hg + '× HG' : ''}`;
        return `<td class="yg-td-cell${isNow ? ' yg-td-now' : ''}" style="background:${heat.bg}" data-month="${m}" data-tooltip="${title}"><div class="yg-cell-inner">${bdPart}${hgPart}</div></td>`;
      }).join('');

      const totalBd = d.isDutyCapable ? `<span class="yg-total-bd">${d.totalBD}<span class="yg-total-lbl">D</span></span>` : '<span class="yg-dash">—</span>';
      const totalHg = d.isFa && d.totalHG > 0 ? `<span class="yg-total-hg">${d.totalHG}<span class="yg-total-lbl">H</span></span>` : '';

      bodyRows += `
        <tr class="yg-emp-row" data-emp="${esc(emp)}">
          <td class="yg-td-name" style="border-left:3px solid ${pc.border}">
            <span class="yg-emp-name">${esc(emp)}</span>
            <span class="yg-emp-pos" style="color:${pc.fg};background:${pc.bg}">${meta.position}</span>
          </td>
          ${cells}
          <td class="yg-td-total"><div class="yg-total-inner">${totalBd}${totalHg}</div></td>
        </tr>`;
    });

    root.innerHTML = `
      <div class="ah-section-title" data-tooltip="${esc(TT.yeargrid)}">Jahresgitter <span class="ah-sub">— BD-Belastung je Monat (Heatmap) · Bezug: ${year}</span></div>
      <div class="yg-legend">
        <span class="yg-leg-item" data-tooltip="Deutlich weniger Bereitschaftsdienste als der Monats-Kollegiums-Durchschnitt."><span class="yg-swatch" style="background:rgba(14,165,233,0.26)"></span>Deutlich unter Ø</span>
        <span class="yg-leg-item" data-tooltip="Weniger Bereitschaftsdienste als der Monats-Kollegiums-Durchschnitt."><span class="yg-swatch" style="background:rgba(14,165,233,0.14)"></span>Unter Ø</span>
        <span class="yg-leg-item" data-tooltip="Bereitschaftsdienste etwa im Monats-Kollegiums-Durchschnitt."><span class="yg-swatch" style="background:rgba(34,197,94,0.12)"></span>Im Ø-Bereich</span>
        <span class="yg-leg-item" data-tooltip="Mehr Bereitschaftsdienste als der Monats-Kollegiums-Durchschnitt."><span class="yg-swatch" style="background:rgba(249,115,22,0.15)"></span>Über Ø</span>
        <span class="yg-leg-item" data-tooltip="Deutlich mehr Bereitschaftsdienste als der Monats-Kollegiums-Durchschnitt."><span class="yg-swatch" style="background:rgba(239,68,68,0.18)"></span>Deutlich über Ø</span>
        <span class="yg-leg-hint">Farbe = BD-Abweichung vom Kollegiums-Ø je Monat · Klick auf Zelle öffnet den Monat.</span>
      </div>
      <div class="yg-scroll">
        <table class="yg-table">
          <thead>
            <tr><th class="yg-th-name" data-tooltip="Mitarbeitende, gruppiert nach Fachärzten/Oberärzten und Assistenzärzten. Klick auf den Namen öffnet das Profil.">Mitarbeitende</th>${monthHeaders}<th class="yg-th-total" data-tooltip="Summe aller Bereitschaftsdienste (D) im Jahr; bei Fachärzten zusätzlich die HG-Summe.">Σ Jahr</th></tr>
            <tr class="yg-mean-hdr"><td class="yg-td-name yg-mean-name" data-tooltip="${esc(TT.yeargridMean)}"><span class="yg-mean-icon">Ø BD</span></td>${meanRow}<td class="yg-td-mean">—</td></tr>
          </thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </div>`;

    root.querySelectorAll('.yg-td-cell[data-month]').forEach((cell) => {
      cell.addEventListener('click', () => {
        const m = parseInt(cell.dataset.month, 10);
        if (Number.isFinite(m)) window.dispatchEvent(new CustomEvent('radplan-navigate', { detail: { year, month: m } }));
      });
    });
    root.querySelectorAll('.yg-emp-row[data-emp]').forEach((row) => {
      row.querySelector('.yg-emp-name')?.addEventListener('click', (e) => { e.stopPropagation(); ctx.openProfile(row.dataset.emp); });
    });
  },

  dispose() {},
};
