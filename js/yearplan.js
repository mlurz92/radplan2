/**
 * yearplan.js — Jahresplaner
 * Jahres-Gitter, Fairness-Kurven & Jahresend-Projektion.
 * Importiert nur aus constants.js, state.js, model.js und autoplan.js — kein Zirkelbezug.
 */

import {
  MONTHS, MONTHS_SHORT, monthKey, isFacharzt,
  getEmpMeta, posColor
} from './constants.js';

import { DATA, state, planMode, planData, TOD_Y, TOD_M } from './state.js';
import { buildProfileStats, buildYearlyStats, getEmployeesForYear } from './model.js';
import { isDutyExempt } from './autoplan.js';

// ─── Modul-State ─────────────────────────────────────────────────────────────

export let ypYear = new Date().getFullYear();
let _tab = 'grid';       // 'grid' | 'fairness' | 'sollist' | 'absence' | 'projection'
let _fairMode = 'bd';    // 'bd' | 'hg'
let _evalSort = 'name';  // shared sort key for the Soll/Ist + Abwesenheiten views
let _evalRole = 'ALL';   // shared role filter for the evaluation views
let _charts = [];

// ─── Farb-Palette ─────────────────────────────────────────────────────────────

const EMP_COLORS = [
  '#0EA5E9', '#22C55E', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#14B8A6', '#F97316',
  '#6366F1', '#84CC16', '#06B6D4',
];

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

function _bdTarget(empName) {
  if (isDutyExempt(empName)) return 0;
  if (empName === 'Dr. Polednia') return 3;
  if (empName === 'Dr. Becker') return 3;
  if (empName === 'Hr. Sebastian') return 3;
  return 4;
}

function _destroyCharts() {
  _charts.forEach(c => { try { c.destroy(); } catch (_) {} });
  _charts = [];
}

// Baut die Jahresdaten für alle MA auf
function _buildYearData(year) {
  const allEmps = getEmployeesForYear(year);

  const perEmp = {};
  allEmps.forEach((emp, idx) => {
    const fa = isFacharzt(emp);
    const capable = !isDutyExempt(emp);

    perEmp[emp] = {
      color: EMP_COLORS[idx % EMP_COLORS.length],
      months: [],
      totalBD: 0,
      totalHG: 0,
      monthsWithData: 0,
      isFa: fa,
      isDutyCapable: capable,
      monthlyTarget: _bdTarget(emp),
    };

    for (let m = 0; m < 12; m++) {
      const k = monthKey(year, m);
      const inData = !!(DATA[k] && Array.isArray(DATA[k].employees) && DATA[k].employees.includes(emp));

      if (!inData) {
        perEmp[emp].months.push({ bd: 0, hg: 0, hasData: false });
        continue;
      }

      const stats = buildProfileStats(year, m, emp);
      const bd = stats.dutyD.length;
      const hg = stats.dutyHG.length;
      perEmp[emp].months.push({ bd, hg, hasData: true });
      perEmp[emp].totalBD += bd;
      perEmp[emp].totalHG += hg;
      perEmp[emp].monthsWithData++;
    }
  });

  // Spaltenmittelwerte (pro Monat, über alle MA mit Daten)
  const meansBD = Array.from({ length: 12 }, (_, m) => {
    const vals = allEmps
      .filter(e => perEmp[e].months[m].hasData && perEmp[e].isDutyCapable)
      .map(e => perEmp[e].months[m].bd);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  });

  const meansHG = Array.from({ length: 12 }, (_, m) => {
    const vals = allEmps
      .filter(e => perEmp[e].months[m].hasData && perEmp[e].isFa && !isDutyExempt(e))
      .map(e => perEmp[e].months[m].hg);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  });

  return { employees: allEmps, perEmp, meansBD, meansHG };
}

// Heatmap-Farbe basierend auf Abweichung vom Mittelwert
function _heat(dev) {
  if (dev >= 2)   return { bg: 'rgba(239,68,68,0.18)',   fg: '#B91C1C' };
  if (dev >= 1)   return { bg: 'rgba(249,115,22,0.15)',  fg: '#C2410C' };
  if (dev > -0.5) return { bg: 'rgba(34,197,94,0.12)',   fg: '#15803D' };
  if (dev >= -1)  return { bg: 'rgba(14,165,233,0.14)',  fg: '#0369A1' };
  return             { bg: 'rgba(14,165,233,0.26)',  fg: '#075985' };
}

// ─── Tab 1: Jahres-Gitter ─────────────────────────────────────────────────────

function _renderGrid(year, container) {
  const { employees, perEmp, meansBD } = _buildYearData(year);

  if (!employees.length) {
    container.innerHTML = '<div class="yp-empty">Keine Mitarbeitendedaten für dieses Jahr vorhanden.</div>';
    return;
  }

  const faEmps = employees.filter(e => isFacharzt(e));
  const aaEmps = employees.filter(e => !isFacharzt(e));
  const ordered = [...faEmps, ...aaEmps];

  const monthHeaders = MONTHS_SHORT.map((mo, m) => {
    const isNow = year === TOD_Y && m === TOD_M;
    const isPast = year < TOD_Y || (year === TOD_Y && m < TOD_M);
    const isFuture = !isNow && !isPast;
    return `<th class="yp-th-month${isNow ? ' yp-th-now' : ''}${isFuture ? ' yp-th-future' : ''}" data-month="${m}">${mo}</th>`;
  }).join('');

  const meanRow = MONTHS_SHORT.map((_, m) => {
    const v = meansBD[m];
    return `<td class="yp-td-mean">${v > 0 ? v.toFixed(1) : '<span class="yp-dash">—</span>'}</td>`;
  }).join('');

  let bodyRows = '';
  let lastGroup = null;

  ordered.forEach(emp => {
    const d = perEmp[emp];
    const meta = getEmpMeta(emp);
    const pc = posColor(meta.position);
    const group = d.isFa ? 'fa' : 'aa';

    if (group !== lastGroup) {
      lastGroup = group;
      const label = d.isFa ? 'Fachärzte / Oberärzte' : 'Assistenzärzte';
      bodyRows += `<tr class="yp-group-row"><td colspan="14" class="yp-group-label">${label}</td></tr>`;
    }

    const cells = d.months.map((mon, m) => {
      const isNow = year === TOD_Y && m === TOD_M;
      const isFuture = year > TOD_Y || (year === TOD_Y && m > TOD_M);

      if (!mon.hasData) {
        return `<td class="yp-td-cell yp-td-nodata">${isFuture ? '<span class="yp-future-marker"></span>' : '<span class="yp-dash">—</span>'}</td>`;
      }

      const heat = d.isDutyCapable ? _heat(mon.bd - meansBD[m]) : { bg: 'transparent', fg: '#94A3B8' };
      const hgPart = d.isFa && mon.hg > 0
        ? `<span class="yp-cell-hg">${mon.hg}<span class="yp-cell-hg-lbl">H</span></span>`
        : '';
      const bdPart = d.isDutyCapable
        ? `<span class="yp-cell-bd" style="color:${heat.fg}">${mon.bd}<span class="yp-cell-bd-lbl">D</span></span>`
        : `<span class="yp-dash">—</span>`;

      const title = `${emp} · ${MONTHS[m]} ${year}: ${mon.bd}× D${d.isFa ? ', ' + mon.hg + '× HG' : ''}`.replace(/"/g, '&quot;');

      return `<td class="yp-td-cell${isNow ? ' yp-td-now' : ''}"
                  style="background:${heat.bg}"
                  data-emp="${emp.replace(/"/g, '&quot;')}"
                  data-month="${m}"
                  title="${title}"
              ><div class="yp-cell-inner">${bdPart}${hgPart}</div></td>`;
    }).join('');

    const totalBd = d.isDutyCapable ? `<span class="yp-total-bd">${d.totalBD}<span class="yp-total-lbl">D</span></span>` : '<span class="yp-dash">—</span>';
    const totalHg = d.isFa && d.totalHG > 0 ? `<span class="yp-total-hg">${d.totalHG}<span class="yp-total-lbl">H</span></span>` : '';

    bodyRows += `
      <tr class="yp-emp-row" data-emp="${emp.replace(/"/g, '&quot;')}">
        <td class="yp-td-name" style="border-left:3px solid ${pc.border}">
          <span class="yp-emp-name">${emp}</span>
          <span class="yp-emp-pos" style="color:${pc.fg};background:${pc.bg}">${meta.position}</span>
        </td>
        ${cells}
        <td class="yp-td-total"><div class="yp-total-inner">${totalBd}${totalHg}</div></td>
      </tr>
    `;
  });

  container.innerHTML = `
    <div class="yp-legend">
      <div class="yp-legend-item"><span class="yp-leg-swatch" style="background:rgba(14,165,233,0.26)"></span>Deutlich unter Ø</div>
      <div class="yp-legend-item"><span class="yp-leg-swatch" style="background:rgba(14,165,233,0.14)"></span>Unter Ø</div>
      <div class="yp-legend-item"><span class="yp-leg-swatch" style="background:rgba(34,197,94,0.12)"></span>Im Ø-Bereich</div>
      <div class="yp-legend-item"><span class="yp-leg-swatch" style="background:rgba(249,115,22,0.15)"></span>Über Ø</div>
      <div class="yp-legend-item"><span class="yp-leg-swatch" style="background:rgba(239,68,68,0.18)"></span>Deutlich über Ø</div>
      <span class="yp-leg-sep">·</span>
      <span class="yp-legend-hint">Farbskala bezieht sich auf BD-Abweichung vom Kollegiums-Ø je Monat. Klick auf Zelle navigiert zu diesem Monat.</span>
    </div>

    <div class="yp-grid-scroll">
      <table class="yp-grid-table">
        <thead>
          <tr>
            <th class="yp-th-name">Mitarbeitende</th>
            ${monthHeaders}
            <th class="yp-th-total">Σ Jahr</th>
          </tr>
          <tr class="yp-mean-hdr">
            <td class="yp-td-name yp-mean-name">
              <span class="yp-mean-icon" title="Monatlicher Kollegiums-Durchschnitt (BD)">Ø BD</span>
            </td>
            ${meanRow}
            <td class="yp-td-mean">—</td>
          </tr>
        </thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>
  `;

  // Klick auf Zelle → Monat öffnen
  container.querySelectorAll('.yp-td-cell[data-month]').forEach(cell => {
    cell.addEventListener('click', () => {
      const m = parseInt(cell.dataset.month, 10);
      if (Number.isFinite(m)) {
        window.dispatchEvent(new CustomEvent('radplan-navigate', { detail: { year: ypYear, month: m } }));
      }
    });
  });
}

// ─── Tab 2: Fairness-Analyse ───────────────────────────────────────────────────

function _renderFairness(year, container) {
  const { employees, perEmp, meansBD, meansHG } = _buildYearData(year);
  _destroyCharts();

  const isHG = _fairMode === 'hg';
  const means = isHG ? meansHG : meansBD;

  const relEmps = isHG
    ? employees.filter(e => perEmp[e].isFa && !isDutyExempt(e))
    : employees.filter(e => perEmp[e].isDutyCapable);

  // Kumulierte Abweichung vom monatlichen Ø (= Fairness-Kurve)
  const cumDevs = {};
  relEmps.forEach(emp => {
    let running = 0;
    cumDevs[emp] = perEmp[emp].months.map((mon, m) => {
      if (!mon.hasData) return null;
      running += (isHG ? mon.hg : mon.bd) - means[m];
      return parseFloat(running.toFixed(2));
    });
  });

  const modeLabel = isHG ? 'Hintergrunddienst (HG)' : 'Bereitschaftsdienst (D)';

  container.innerHTML = `
    <div class="yp-fair-controls">
      <div class="yp-mode-toggle" role="group" aria-label="Ansicht umschalten">
        <button type="button" class="yp-mode-btn${!isHG ? ' active' : ''}" data-mode="bd">BD · Bereitschaft</button>
        <button type="button" class="yp-mode-btn${isHG ? ' active' : ''}" data-mode="hg">HG · Hintergrund</button>
      </div>
      <p class="yp-fair-hint">
        Kumulierte Abweichung jedes Mitarbeitenden vom monatlichen Kollegiums-Ø (<em>${modeLabel}</em>).
        Werte <strong>über 0</strong> = überdurchschnittlich viele Dienste; <strong>unter 0</strong> = unterdurchschnittlich.
        Eine idealerweise flache Linie bei 0 bedeutet perfekte Gleichverteilung.
      </p>
    </div>

    <div class="yp-chart-card">
      <div class="yp-chart-legend" id="yp-fair-legend"></div>
      <div class="yp-chart-canvas-wrap">
        <canvas id="yp-fair-canvas"></canvas>
      </div>
    </div>

    <div class="yp-fair-table-wrap">
      <table class="yp-fair-table">
        <thead>
          <tr>
            <th class="yp-fth-name">Mitarbeitende</th>
            ${MONTHS_SHORT.map(s => `<th class="yp-fth-m">${s}</th>`).join('')}
            <th class="yp-fth-sum">Σ</th>
            <th class="yp-fth-dev">Abw.</th>
          </tr>
        </thead>
        <tbody>
          ${relEmps.map(emp => {
            const d = perEmp[emp];
            const vals = d.months.map(mon => !mon.hasData ? null : (isHG ? mon.hg : mon.bd));
            const total = isHG ? d.totalHG : d.totalBD;
            const totalMean = means.reduce((sum, mVal, mIdx) => sum + (d.months[mIdx].hasData ? mVal : 0), 0);
            const devNum = parseFloat((total - totalMean).toFixed(1));
            const devCol = devNum > 0.5 ? '#C2410C' : devNum < -0.5 ? '#0369A1' : '#15803D';
            const meta = getEmpMeta(emp);
            const pc = posColor(meta.position);
            const cells = vals.map((v, m) => {
              if (v === null) return '<td class="yp-ftd yp-ftd-nd">—</td>';
              const heatInfo = _heat(v - means[m]);
              return `<td class="yp-ftd" style="background:${heatInfo.bg};color:${heatInfo.fg}" title="Ø ${means[m].toFixed(1)}">${v}</td>`;
            }).join('');
            return `<tr>
              <td class="yp-ftd-name" style="border-left:3px solid ${pc.border}">${emp}</td>
              ${cells}
              <td class="yp-ftd-sum">${total}</td>
              <td class="yp-ftd-dev" style="color:${devCol}">${devNum > 0 ? '+' : ''}${devNum}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;

  // Modus-Toggle verdrahten
  container.querySelectorAll('.yp-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _fairMode = btn.dataset.mode;
      _destroyCharts();
      _renderFairness(year, container);
    });
  });

  // Chart.js Liniendiagramm
  const canvas = document.getElementById('yp-fair-canvas');
  if (!canvas || typeof Chart === 'undefined') return;

  const datasets = relEmps.map(emp => ({
    label: emp,
    data: cumDevs[emp],
    borderColor: perEmp[emp].color,
    backgroundColor: perEmp[emp].color + '18',
    borderWidth: 2,
    pointRadius: 3.5,
    pointHoverRadius: 6,
    tension: 0.35,
    spanGaps: false,
  }));

  // Null-Linie (= perfekte Fairness)
  datasets.push({
    label: 'Ideal (Ø)',
    data: Array(12).fill(0),
    borderColor: 'rgba(100,116,139,0.35)',
    borderDash: [6, 4],
    pointRadius: 0,
    borderWidth: 1.5,
    tension: 0,
    fill: false,
  });

  const chart = new Chart(canvas, {
    type: 'line',
    data: { labels: MONTHS_SHORT, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              if (ctx.dataset.label === 'Ideal (Ø)') return null;
              const v = ctx.raw;
              if (v === null || v === undefined) return null;
              const sign = v >= 0 ? '+' : '';
              return ` ${ctx.dataset.label}: ${sign}${v.toFixed(2)}`;
            },
            title: items => `${MONTHS[items[0]?.dataIndex ?? 0]} ${year}`,
          },
        },
      },
      scales: {
        x: {
          grid: { color: 'rgba(0,0,0,0.04)' },
          ticks: { font: { size: 10, family: "'IBM Plex Sans', system-ui, sans-serif" } },
        },
        y: {
          grid: { color: 'rgba(0,0,0,0.04)' },
          ticks: {
            font: { size: 10 },
            callback: v => (v >= 0 ? '+' : '') + v,
          },
          title: {
            display: true,
            text: 'Kum. Abw. vom Kollegiums-Ø',
            font: { size: 9 },
            color: '#94A3B8',
          },
        },
      },
      animation: { duration: 400 },
    },
  });
  _charts.push(chart);

  // Eigene Legende
  const legendEl = document.getElementById('yp-fair-legend');
  if (legendEl) {
    legendEl.innerHTML = relEmps.map(emp => `
      <div class="yp-legitem">
        <span class="yp-legline" style="background:${perEmp[emp].color}"></span>
        <span class="yp-leglabel">${emp}</span>
      </div>
    `).join('');
  }
}

// ─── Tab 3: Jahresprojektion ───────────────────────────────────────────────────

function _renderProjection(year, container) {
  const { employees, perEmp } = _buildYearData(year);
  _destroyCharts();

  const dutyEmps = employees.filter(e => perEmp[e].isDutyCapable);

  if (!dutyEmps.length) {
    container.innerHTML = '<div class="yp-empty">Keine dienstfähigen Mitarbeitenden gefunden.</div>';
    return;
  }

  const projs = dutyEmps.map(emp => {
    const d = perEmp[emp];
    const monthsLeft = 12 - d.monthsWithData;
    const annualTarget = d.monthlyTarget * 12;
    const rate = d.monthsWithData > 0 ? d.totalBD / d.monthsWithData : d.monthlyTarget;
    const projectedTotal = d.totalBD + Math.round(rate * monthsLeft);
    const deviation = projectedTotal - annualTarget;
    const progressPct = annualTarget > 0 ? Math.min(100, Math.round((d.totalBD / annualTarget) * 100)) : 0;

    return {
      emp,
      actual: d.totalBD,
      projected: projectedTotal,
      remaining: Math.max(0, projectedTotal - d.totalBD),
      annualTarget,
      deviation,
      progressPct,
      monthsWithData: d.monthsWithData,
      monthsLeft,
      color: d.color,
    };
  });

  const sorted = [...projs].sort((a, b) => a.deviation - b.deviation);

  const completedMonths = Math.max(...dutyEmps.map(e => perEmp[e].monthsWithData), 0);

  container.innerHTML = `
    <div class="yp-proj-intro">
      <div class="yp-proj-hint">
        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="flex-shrink:0">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        Projektion auf Basis von <strong>${completedMonths} Monat${completedMonths !== 1 ? 'en' : ''}</strong> mit Daten.
        Die restlichen ${Math.max(0, 12 - completedMonths)} Monate werden mit der individuellen Monatsdurchschnittsrate hochgerechnet.
        Das Jahresziel ergibt sich aus dem konfigurierten Monatsziel × 12.
      </div>
    </div>

    <div class="yp-chart-card">
      <div class="yp-chart-canvas-wrap yp-chart-canvas-hbar" style="height:${Math.max(200, dutyEmps.length * 40 + 80)}px">
        <canvas id="yp-proj-canvas"></canvas>
      </div>
    </div>

    <div class="yp-proj-table-wrap">
      <table class="yp-proj-table">
        <thead>
          <tr>
            <th class="yp-pth-name">Mitarbeitende</th>
            <th class="yp-pth">Ist-BD</th>
            <th class="yp-pth">Monate</th>
            <th class="yp-pth">Proj. JE</th>
            <th class="yp-pth">Jahresziel</th>
            <th class="yp-pth">Abweichung</th>
            <th class="yp-pth-prog">Fortschritt</th>
          </tr>
        </thead>
        <tbody>
          ${sorted.map(p => {
            const devCol = p.deviation > 1 ? '#C2410C' : p.deviation < -1 ? '#0369A1' : '#15803D';
            const progCol = p.progressPct >= 85 ? '#22C55E' : p.progressPct >= 55 ? '#F59E0B' : '#EF4444';
            const meta = getEmpMeta(p.emp);
            const pc = posColor(meta.position);
            return `<tr>
              <td class="yp-ptd-name" style="border-left:3px solid ${pc.border}">${p.emp}</td>
              <td class="yp-ptd">${p.actual}</td>
              <td class="yp-ptd yp-ptd-sub">${p.monthsWithData}/12</td>
              <td class="yp-ptd yp-ptd-proj">${p.projected}</td>
              <td class="yp-ptd">${p.annualTarget}</td>
              <td class="yp-ptd yp-ptd-dev" style="color:${devCol}">${p.deviation >= 0 ? '+' : ''}${p.deviation}</td>
              <td class="yp-ptd-prog">
                <div class="yp-prog-wrap">
                  <div class="yp-prog-track">
                    <div class="yp-prog-fill" style="width:${p.progressPct}%;background:${progCol}"></div>
                  </div>
                  <span class="yp-prog-pct" style="color:${progCol}">${p.progressPct}%</span>
                </div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;

  // Horizontales Balkendiagramm
  const canvas = document.getElementById('yp-proj-canvas');
  if (!canvas || typeof Chart === 'undefined') return;

  const chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: sorted.map(p => p.emp),
      datasets: [
        {
          label: 'Tatsächlich (BD)',
          data: sorted.map(p => p.actual),
          backgroundColor: sorted.map(p => p.color),
          borderRadius: 3,
          borderSkipped: false,
        },
        {
          label: 'Projektion (Rest)',
          data: sorted.map(p => p.remaining),
          backgroundColor: sorted.map(p => p.color + '3A'),
          borderRadius: 3,
          borderSkipped: false,
        },
      ],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          align: 'end',
          labels: { font: { size: 10 }, boxWidth: 10, padding: 8, usePointStyle: true },
        },
        tooltip: {
          callbacks: {
            footer: items => {
              const idx = items[0]?.dataIndex;
              if (idx === undefined) return '';
              const p = sorted[idx];
              return `Ziel: ${p.annualTarget} · Abw.: ${p.deviation >= 0 ? '+' : ''}${p.deviation}`;
            },
          },
        },
      },
      scales: {
        x: {
          stacked: true,
          grid: { color: 'rgba(0,0,0,0.04)' },
          ticks: { font: { size: 9 }, stepSize: 1 },
          title: { display: true, text: 'Bereitschaftsdienste', font: { size: 9 }, color: '#94A3B8' },
        },
        y: {
          stacked: true,
          grid: { display: false },
          ticks: { font: { size: 10, family: "'IBM Plex Sans', system-ui, sans-serif" } },
        },
      },
      animation: { duration: 400 },
    },
  });
  _charts.push(chart);
}

// ─── Gemeinsame Helfer für die Auswertungs-Tabs ────────────────────────────────

const _POS_ORDER = ['CA', 'LOA', 'OA', 'OÄ', 'FA', 'FÄ', 'AA', 'AÄ'];
function _posRank(p) { const i = _POS_ORDER.indexOf(p); return i === -1 ? _POS_ORDER.length : i; }

function _roleBucket(pos) {
  if (['CA', 'LOA', 'OA', 'OÄ'].includes(pos)) return 'lead';
  if (['FA', 'FÄ'].includes(pos)) return 'fa';
  if (['AA', 'AÄ'].includes(pos)) return 'aa';
  return 'other';
}

function _matchEvalRole(pos) {
  if (_evalRole === 'ALL') return true;
  return _roleBucket(pos) === _evalRole;
}

// Toolbar im Stil des Mitarbeitenden-Modals: Rollenfilter · Sortierung · CSV.
function _evalToolbar(sortOptions) {
  const rolePills = [
    ['ALL', 'Alle'], ['lead', 'Leitung'], ['fa', 'FÄ'], ['aa', 'AÄ'], ['other', 'Weitere'],
  ].map(([k, lbl]) =>
    `<button type="button" class="yp-eval-pill${_evalRole === k ? ' active' : ''}" data-role="${k}">${lbl}</button>`
  ).join('');
  const opts = sortOptions.map(([v, lbl]) =>
    `<option value="${v}"${_evalSort === v ? ' selected' : ''}>${lbl}</option>`
  ).join('');
  return `
    <div class="yp-eval-toolbar">
      <div class="yp-eval-pills" role="toolbar" aria-label="Rollenfilter">${rolePills}</div>
      <div class="yp-eval-toolbar-right">
        <label class="yp-eval-sort-wrap">
          <span class="yp-eval-sort-lbl">Sortieren</span>
          <select class="yp-eval-sort" aria-label="Sortieren">${opts}</select>
        </label>
        <button type="button" class="yp-eval-export" title="Diese Auswertung als CSV exportieren">
          <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          <span>CSV</span>
        </button>
      </div>
    </div>`;
}

function _downloadCSV(filename, header, rows) {
  const esc = (v) => { const s = String(v ?? ''); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = [header.join(';'), ...rows.map(r => r.map(esc).join(';'))];
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Verdrahtet die gemeinsamen Toolbar-Controls eines Auswertungs-Tabs.
function _wireEvalToolbar(year, container) {
  container.querySelectorAll('.yp-eval-pill').forEach(btn => {
    btn.addEventListener('click', () => { _evalRole = btn.dataset.role; _renderContent(); });
  });
  const sel = container.querySelector('.yp-eval-sort');
  if (sel) sel.addEventListener('change', (e) => { _evalSort = e.target.value; _renderContent(); });
}

// ─── Tab: Dienst Soll/Ist ──────────────────────────────────────────────────────

function _buildSollIstRows(year) {
  const { employees, perEmp } = _buildYearData(year);
  return employees
    .filter(e => perEmp[e].isDutyCapable)
    .map(emp => {
      const d = perEmp[emp];
      const meta = getEmpMeta(emp);
      const soll = d.monthlyTarget * d.monthsWithData;
      const ist = d.totalBD;
      const diff = ist - soll;
      const quote = soll > 0 ? Math.round((ist / soll) * 100) : (ist > 0 ? 999 : 0);
      return { emp, meta, perMonth: d.monthlyTarget, months: d.monthsWithData, soll, ist, diff, quote };
    })
    .filter(r => _matchEvalRole(r.meta.position));
}

function _sortEvalRows(rows, keyMap) {
  const k = _evalSort;
  rows.sort((a, b) => {
    if (k === 'name') return a.emp.localeCompare(b.emp, 'de');
    if (k === 'position') { const d = _posRank(a.meta.position) - _posRank(b.meta.position); return d !== 0 ? d : a.emp.localeCompare(b.emp, 'de'); }
    const fn = keyMap[k];
    return fn ? fn(b) - fn(a) : 0;
  });
  return rows;
}

function _renderSollIst(year, container) {
  const rows = _sortEvalRows(_buildSollIstRows(year), {
    ist: r => r.ist, soll: r => r.soll, diff: r => r.diff, quote: r => r.quote,
  });

  const body = rows.map(r => {
    const pc = posColor(r.meta.position);
    const diffCol = r.diff > 0.5 ? '#C2410C' : r.diff < -0.5 ? '#0369A1' : '#15803D';
    const qCol = r.quote >= 95 && r.quote <= 110 ? '#15803D' : r.quote > 110 ? '#C2410C' : '#0369A1';
    return `<tr>
      <td class="yp-ev-name" style="border-left:3px solid ${pc.border}">
        <span class="yp-ev-empname">${r.emp}</span>
        <span class="yp-ev-pos" style="color:${pc.fg};background:${pc.bg}">${r.meta.position}</span>
      </td>
      <td class="yp-ev-num">${r.perMonth}</td>
      <td class="yp-ev-num">${r.months}</td>
      <td class="yp-ev-num">${r.soll}</td>
      <td class="yp-ev-num yp-ev-strong">${r.ist}</td>
      <td class="yp-ev-num" style="color:${diffCol};font-weight:700">${r.diff > 0 ? '+' : ''}${r.diff}</td>
      <td class="yp-ev-num" style="color:${qCol};font-weight:700">${r.quote === 999 ? '—' : r.quote + '%'}</td>
    </tr>`;
  }).join('');

  container.innerHTML = `
    ${_evalToolbar([['name', 'Name (A–Z)'], ['position', 'Position'], ['ist', 'Ist (absteigend)'], ['diff', 'Δ (absteigend)'], ['quote', 'Erfüllung %']])}
    <p class="yp-eval-hint">Bereitschaftsdienst-Soll (Monatsziel × aktive Monate) gegen Ist. <strong>Δ &gt; 0</strong> = mehr Dienste als Soll, <strong>Δ &lt; 0</strong> = Rückstand. Nur dienstfähige Mitarbeitende.</p>
    <div class="yp-eval-table-wrap">
      <table class="yp-eval-table">
        <thead><tr>
          <th class="yp-ev-th-name">Mitarbeitende</th>
          <th>Soll/Mon.</th><th>Akt. Mon.</th><th>Soll Σ</th><th>Ist Σ</th><th>Δ</th><th>Erfüllung</th>
        </tr></thead>
        <tbody>${body || '<tr><td colspan="7" class="yp-eval-empty">Keine Daten für diesen Filter.</td></tr>'}</tbody>
      </table>
    </div>`;

  _wireEvalToolbar(year, container);
  container.querySelector('.yp-eval-export')?.addEventListener('click', () => {
    _downloadCSV(`radplan_soll-ist_${year}.csv`,
      ['Kürzel', 'Position', 'Soll/Monat', 'Aktive Monate', 'Soll gesamt', 'Ist gesamt', 'Differenz', 'Erfüllung %'],
      rows.map(r => [r.emp, r.meta.position, r.perMonth, r.months, r.soll, r.ist, r.diff, r.quote === 999 ? '' : r.quote]));
  });
}

// ─── Tab: Abwesenheiten ────────────────────────────────────────────────────────

function _buildAbsenceRows(year) {
  const employees = getEmployeesForYear(year);
  return employees.map(emp => {
    const ys = buildYearlyStats(emp, year);
    const meta = getEmpMeta(emp);
    const t = ys.totals;
    const vac = t.vacationDays || 0, sick = t.sickDays || 0, fza = t.fzaDays || 0;
    const wb = t.wbDays || 0, frei = t.freiDays || 0;
    const sum = vac + sick + fza + wb;
    return { emp, meta, vac, sick, fza, wb, frei, sum };
  }).filter(r => _matchEvalRole(r.meta.position));
}

function _renderAbsence(year, container) {
  const rows = _sortEvalRows(_buildAbsenceRows(year), {
    vacation: r => r.vac, sick: r => r.sick, fza: r => r.fza, sum: r => r.sum,
  });

  const body = rows.map(r => {
    const pc = posColor(r.meta.position);
    const cell = (v, col) => `<td class="yp-ev-num"${v ? ` style="color:${col};font-weight:700"` : ''}>${v || '<span class="yp-dash">—</span>'}</td>`;
    return `<tr>
      <td class="yp-ev-name" style="border-left:3px solid ${pc.border}">
        <span class="yp-ev-empname">${r.emp}</span>
        <span class="yp-ev-pos" style="color:${pc.fg};background:${pc.bg}">${r.meta.position}</span>
      </td>
      ${cell(r.vac, '#7C3AED')}${cell(r.sick, '#B91C1C')}${cell(r.fza, '#0369A1')}${cell(r.wb, '#0F766E')}${cell(r.frei, '#64748B')}
      <td class="yp-ev-num yp-ev-strong">${r.sum}</td>
    </tr>`;
  }).join('');

  container.innerHTML = `
    ${_evalToolbar([['name', 'Name (A–Z)'], ['position', 'Position'], ['vacation', 'Urlaub (absteigend)'], ['sick', 'Krank (absteigend)'], ['sum', 'Σ Abwesenheit']])}
    <p class="yp-eval-hint">Abwesenheitstage im Kalenderjahr: Urlaub (U/RU), Krank (K/KK), FZA, Weiterbildung (WB). „Frei" (F) ist informativ und zählt nicht in die Σ-Abwesenheit.</p>
    <div class="yp-eval-table-wrap">
      <table class="yp-eval-table">
        <thead><tr>
          <th class="yp-ev-th-name">Mitarbeitende</th>
          <th>Urlaub</th><th>Krank</th><th>FZA</th><th>WB</th><th>Frei</th><th>Σ Abw.</th>
        </tr></thead>
        <tbody>${body || '<tr><td colspan="7" class="yp-eval-empty">Keine Daten für diesen Filter.</td></tr>'}</tbody>
      </table>
    </div>`;

  _wireEvalToolbar(year, container);
  container.querySelector('.yp-eval-export')?.addEventListener('click', () => {
    _downloadCSV(`radplan_abwesenheiten_${year}.csv`,
      ['Kürzel', 'Position', 'Urlaub', 'Krank', 'FZA', 'Weiterbildung', 'Frei', 'Summe Abwesenheit'],
      rows.map(r => [r.emp, r.meta.position, r.vac, r.sick, r.fza, r.wb, r.frei, r.sum]));
  });
}

// ─── Öffentliche API ──────────────────────────────────────────────────────────

function _syncTabUI() {
  document.querySelectorAll('.yp-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === _tab);
    btn.setAttribute('aria-selected', btn.dataset.tab === _tab ? 'true' : 'false');
  });
  const lbl = document.getElementById('yp-year-label');
  if (lbl) lbl.textContent = ypYear;
}

function _renderContent() {
  const body = document.getElementById('yp-body');
  if (!body) return;
  _destroyCharts();
  _syncTabUI();

  body.innerHTML = '';
  body.className = `yp-body yp-body--${_tab}`;

  if (_tab === 'grid') {
    _renderGrid(ypYear, body);
  } else if (_tab === 'fairness') {
    _renderFairness(ypYear, body);
  } else if (_tab === 'sollist') {
    _renderSollIst(ypYear, body);
  } else if (_tab === 'absence') {
    _renderAbsence(ypYear, body);
  } else if (_tab === 'projection') {
    _renderProjection(ypYear, body);
  }
}

export function openYearPlan(year) {
  ypYear = year != null ? year : (state.year || TOD_Y);
  _tab = 'grid';
  _fairMode = 'bd';
}

export function setYearPlanYear(year) {
  ypYear = year;
  _renderContent();
}

export function renderYearPlanContent() {
  _renderContent();
}

export function setupYearPlanModal() {
  document.querySelectorAll('.yp-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      _tab = btn.dataset.tab;
      _destroyCharts();
      _renderContent();
    });
  });

  document.getElementById('yp-prev-year')?.addEventListener('click', () => setYearPlanYear(ypYear - 1));
  document.getElementById('yp-next-year')?.addEventListener('click', () => setYearPlanYear(ypYear + 1));
}

export function cleanupYearPlan() {
  _destroyCharts();
}
