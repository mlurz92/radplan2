import {
  CODE_MAP,
  MONTHS,
  MONTHS_SHORT,
  DOW_ABBR,
  DOW_LONG,
  VACATION_CODES,
  getEmpMeta,
  posColor,
  getSaxonyHolidaysCached,
  dateKey,
  daysInMonth,
  weekday,
  isHoliday,
  isTodayCol,
  cellColor,
  empInitials
} from './constants.js';

import { state, TOD_Y, TOD_M, TOD_D } from './state.js';
import { getCell, buildProfileStats, buildYearlyStats } from './model.js';
import { openEditor } from './app.js';
import { autoPlanResult } from './autoplan.js';
import { closeCellQuickPopover, updateModalLayout } from './render-grid.js';

function _destroyChart(id) {
  if (_pmCharts[id]) {
    _pmCharts[id].destroy();
    delete _pmCharts[id];
  }
}

export function openProfileModal(empName) {
  const { year: y, month: m } = state;
  const meta = getEmpMeta(empName);
  const pc = posColor(meta.position);
  const ini = empInitials(empName);
  const hols = getSaxonyHolidaysCached(y);

  const s = buildProfileStats(y, m, empName);
  const ys = buildYearlyStats(empName, y);

  // --- Previous month for trend comparison ---
  const prevM = m === 0 ? 11 : m - 1;
  const prevY = m === 0 ? y - 1 : y;
  const sPrev = buildProfileStats(prevY, prevM, empName);

  _destroyChart("donut");
  _destroyChart("trend");

  state.profileEmp = empName;

  // === HEADER ===
  const avatarEl = document.getElementById("pm-avatar");
  if (avatarEl) {
    avatarEl.textContent = ini;
    avatarEl.style.background = `linear-gradient(135deg,${pc.border},${pc.fg})`;
  }

  const nameEl = document.getElementById("pm-name");
  if (nameEl) nameEl.textContent = meta.fullName !== empName ? meta.fullName : empName;

  const subEl = document.getElementById("pm-sub");
  if (subEl) {
    const yearsStr = meta.since ? ` · seit ${meta.since} (${y - meta.since} J.)` : "";
    const fteStr = meta.fte && meta.fte !== 100 ? ` · ${meta.fte}%` : "";
    subEl.textContent = `${MONTHS[m]} ${y} · ${s.totalWorkdays} Werktage${fteStr}${yearsStr}`;
  }

  const metaRow = document.getElementById("pm-meta-row");
  if (metaRow) {
    let metaHtml = "";
    if (meta.position !== "—") {
      metaHtml += `<span class="pm-pos-pill" style="background:${pc.bg};color:${pc.fg}">${meta.position} · ${meta.posLabel}</span>`;
    }
    if (meta.type && meta.type !== "—") {
      meta.type.split("·").forEach(t => {
        const trimmed = t.trim();
        if (trimmed) metaHtml += `<span class="pm-meta-chip pm-chip-type">${trimmed}</span>`;
      });
    }
    if (meta.area) metaHtml += `<span class="pm-meta-chip pm-chip-area">${meta.area}</span>`;
    if (meta.phone) metaHtml += `<span class="pm-meta-chip pm-chip-phone">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink:0" aria-hidden="true"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.86 10.8 19.79 19.79 0 01.79 2.18 2 2 0 012.76.01h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.91a16 16 0 006.06 6.06l1.07-1.07a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
      ${meta.phone}
    </span>`;
    if (meta.deputy) metaHtml += `<span class="pm-meta-chip pm-chip-deputy">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink:0" aria-hidden="true"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
      V: ${meta.deputy}
    </span>`;
    if (meta.tags && meta.tags.length) {
      meta.tags.slice(0, 3).forEach(tag => {
        metaHtml += `<span class="pm-meta-chip pm-chip-tag">${tag}</span>`;
      });
    }
    metaRow.innerHTML = metaHtml;
  }

  // === TODAY'S STATUS ===
  const todayStatusEl = document.getElementById("pm-today-status");
  if (todayStatusEl) {
    if (y === TOD_Y && m === TOD_M) {
      const todayCell = getCell(y, m, empName, TOD_D);
      const todayAssign = todayCell.assignment || "";
      const todayDuty = todayCell.duty || "";
      const todayHol = isHoliday(y, m, TOD_D, hols);
      const todayWd = weekday(y, m, TOD_D);
      const isWe = todayWd === 0 || todayWd === 6;

      let statusHtml = "";
      let statusText = "";
      let statusColor = "#64748B";
      let statusBg = "#F1F5F9";
      let statusIcon = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;

      if (todayHol) {
        statusText = "Heute: Gesetzlicher Feiertag";
        statusColor = "#854D0E"; statusBg = "#FEF9C3";
      } else if (isWe) {
        statusText = "Heute: Wochenende";
        statusColor = "#475569"; statusBg = "#F1F5F9";
      } else if (todayAssign) {
        const cm = CODE_MAP[todayAssign.split("/")[0].trim()];
        statusColor = cm?.fg || "#1D4ED8";
        statusBg = cm?.bg || "#DBEAFE";
        const label = cm?.label || todayAssign;
        statusText = `Heute: ${label}`;
        if (todayDuty) statusText += ` · ${todayDuty === "D" ? "Bereitschaftsdienst" : "Hintergrunddienst"}`;
        statusIcon = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>`;
      } else if (todayDuty) {
        statusColor = todayDuty === "D" ? "#B91C1C" : "#0369A1";
        statusBg = todayDuty === "D" ? "#FEE2E2" : "#E0F2FE";
        statusText = `Heute: ${todayDuty === "D" ? "Bereitschaftsdienst" : "Hintergrunddienst"}`;
      } else {
        statusText = "Heute: Kein Eintrag";
        statusColor = "#94A3B8"; statusBg = "#F8FAFC";
      }

      todayStatusEl.style.display = "";
      todayStatusEl.innerHTML = `
        <span class="pm-today-icon" style="color:${statusColor}">${statusIcon}</span>
        <span class="pm-today-text" style="color:${statusColor};background:${statusBg}">${statusText}</span>
      `;
    } else {
      todayStatusEl.style.display = "none";
    }
  }

  // === KPI CARDS ===
  const kpiEl = document.getElementById("pm-kpi");
  if (kpiEl) {
    const vac = VACATION_CODES.reduce((sum, c) => sum + (s.stCounts[c] || 0), 0);
    const sick = (s.stCounts["K"] || 0) + (s.stCounts["KK"] || 0);
    const fza = s.stCounts["FZA"] || 0;
    const wb = s.stCounts["WB"] || 0;

    const vacPrev = VACATION_CODES.reduce((sum, c) => sum + (sPrev.stCounts[c] || 0), 0);
    const sickPrev = (sPrev.stCounts["K"] || 0) + (sPrev.stCounts["KK"] || 0);

    const requiredWorkdays = Math.max(0, s.totalWorkdays - s.totalAbs - s.frei);
    const covPct = requiredWorkdays > 0 ? Math.min(100, Math.round((s.totalActive / requiredWorkdays) * 100)) : 0;

    const trend = (cur, prev) => {
      if (prev === 0 && cur === 0) return "";
      const diff = cur - prev;
      if (diff > 0) return `<span class="kpi-trend up">▲ ${diff > 99 ? ">99" : diff}</span>`;
      if (diff < 0) return `<span class="kpi-trend dn">▼ ${Math.abs(diff) > 99 ? ">99" : Math.abs(diff)}</span>`;
      return `<span class="kpi-trend eq">= ±0</span>`;
    };

    const kpis = [
      { label: "Werktage", val: s.totalWorkdays, sub: `${s.totalActive} aktiv · ${covPct}%`, color: "#1D4ED8", pct: covPct, trendHtml: trend(s.totalActive, sPrev.totalActive), ytd: ys.totals.totalActive },
      { label: "Nicht geplant", val: s.uncovered, sub: s.uncovered > 0 ? "Arbeitstage offen" : "Vollständig geplant", color: s.uncovered > 0 ? "#F97316" : "#15803D", pct: 0, trendHtml: "", ytd: null },
      { label: "D-Dienste", val: s.dutyD.length, sub: s.dutyD.length ? s.dutyD.map(d => `${d}.`).join(" ") : "Keine", color: "#EF4444", pct: 0, trendHtml: trend(s.dutyD.length, sPrev.dutyD.length), ytd: ys.totals.dutyD },
      { label: "HG-Dienste", val: s.dutyHG.length, sub: s.dutyHG.length ? s.dutyHG.map(d => `${d}.`).join(" ") : "Keine", color: "#0EA5E9", pct: 0, trendHtml: trend(s.dutyHG.length, sPrev.dutyHG.length), ytd: ys.totals.dutyHG },
      { label: "Urlaub", val: vac, sub: "U · ZU · SU · §15c", color: "#7C3AED", pct: 0, trendHtml: trend(vac, vacPrev), ytd: ys.totals.vacationDays },
      { label: "Krank", val: sick, sub: sick > 0 ? "K · KK" : "Kein Krankentag", color: sick > 0 ? "#DC2626" : "#15803D", pct: 0, trendHtml: trend(sick, sickPrev), ytd: ys.totals.sickDays },
      { label: "FZA", val: fza, sub: "Freizeitausgleich", color: "#3730A3", pct: 0, trendHtml: "", ytd: ys.totals.fzaDays },
      { label: "Weiterbildung", val: wb, sub: "WB-Tage", color: "#78350F", pct: 0, trendHtml: "", ytd: ys.totals.wbDays },
    ];

    kpiEl.innerHTML = kpis.map(k => `
      <div class="kpi-card" style="border-top-color:${k.color}">
        <div class="kpi-head">
          <span class="kpi-label">${k.label}</span>
          ${k.trendHtml ? k.trendHtml : ""}
        </div>
        <div class="kpi-value" style="color:${k.color}">${k.val}</div>
        <div class="kpi-sub">${k.sub}</div>
        ${k.ytd !== null ? `<div class="kpi-ytd">Gesamt ${y}: <strong>${k.ytd}</strong></div>` : ""}
        ${k.pct > 0 ? `<div class="kpi-bar-wrap"><div class="kpi-bar-fill" style="width:${k.pct}%;background:${k.color}"></div></div>` : ""}
      </div>
    `).join("");
  }

  // === WORKPLACE DISTRIBUTION + DONUT ===
  const wpChartEl = document.getElementById("pm-wp-chart");
  const wpHdEl = document.getElementById("pm-wp-hd");
  const distLayoutEl = document.getElementById("pm-dist-layout");
  const donutWrapEl = document.getElementById("pm-donut-wrap");

  if (wpChartEl) {
    const wpEntries = Object.entries(s.wpCounts).sort((a, b) => b[1] - a[1]);
    if (wpEntries.length) {
      if (wpHdEl) wpHdEl.style.display = "";
      if (distLayoutEl) distLayoutEl.classList.add("has-donut");
      const maxV = wpEntries[0][1];
      const totalWP = wpEntries.reduce((s2, [, v]) => s2 + v, 0);
      wpChartEl.innerHTML = wpEntries.map(([code, cnt]) => {
        const meta2 = CODE_MAP[code];
        const pct = totalWP > 0 ? Math.round((cnt / totalWP) * 100) : 0;
        const barPct = maxV > 0 ? Math.round((cnt / maxV) * 100) : 0;
        return `
          <div class="dist-row">
            <span class="dist-code" style="background:${meta2?.bg||"#f1f5f9"};color:${meta2?.fg||"#475569"}">${code}</span>
            <div class="dist-bar-bg">
              <div class="dist-bar-fill" style="width:${barPct}%;background:${meta2?.fg||"#94a3b8"}"></div>
            </div>
            <span class="dist-count">${cnt}</span>
            <span class="dist-pct">${pct}%</span>
          </div>
        `;
      }).join("");

      // Donut chart
      if (donutWrapEl && typeof Chart !== "undefined") {
        donutWrapEl.style.display = "";
        const canvas = document.getElementById("pm-donut-canvas");
        if (canvas) {
          _destroyChart("donut");
          _pmCharts["donut"] = new Chart(canvas, {
            type: "doughnut",
            data: {
              labels: wpEntries.map(([code]) => CODE_MAP[code]?.label || code),
              datasets: [{
                data: wpEntries.map(([, v]) => v),
                backgroundColor: wpEntries.map(([code]) => CODE_MAP[code]?.fg || "#94A3B8"),
                borderWidth: 2,
                borderColor: "#fff",
                hoverOffset: 4,
              }],
            },
            options: {
              responsive: false,
              cutout: "66%",
              plugins: { legend: { display: false }, tooltip: { callbacks: {
                label: (ctx) => ` ${ctx.label}: ${ctx.raw} (${Math.round((ctx.raw / totalWP) * 100)}%)`
              }}},
              animation: { duration: 500, easing: "easeOutQuart" },
            },
          });
        }
      } else if (donutWrapEl) {
        donutWrapEl.style.display = "none";
      }
    } else {
      if (wpHdEl) wpHdEl.style.display = "none";
      if (distLayoutEl) distLayoutEl.classList.remove("has-donut");
      if (donutWrapEl) donutWrapEl.style.display = "none";
      wpChartEl.innerHTML = `<div class="pm-empty-hint">Kein Arbeitsplatzeinsatz in diesem Monat erfasst.</div>`;
    }
  }

  // === STATUS DISTRIBUTION ===
  const stChartEl = document.getElementById("pm-st-chart");
  const stHdEl = document.getElementById("pm-st-hd");
  if (stChartEl) {
    const stEntries = Object.entries(s.stCounts).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    if (stEntries.length) {
      if (stHdEl) stHdEl.style.display = "";
      const maxSt = stEntries[0][1];
      const totalSt = stEntries.reduce((acc, [, v]) => acc + v, 0);
      stChartEl.innerHTML = stEntries.map(([code, cnt]) => {
        const meta2 = CODE_MAP[code];
        const pct = totalSt > 0 ? Math.round((cnt / totalSt) * 100) : 0;
        return `
          <div class="dist-row">
            <span class="dist-code" style="background:${meta2?.bg||"#f1f5f9"};color:${meta2?.fg||"#475569"}">${code}</span>
            <div class="dist-bar-bg">
              <div class="dist-bar-fill" style="width:${Math.round((cnt/maxSt)*100)}%;background:${meta2?.fg||"#94a3b8"}"></div>
            </div>
            <span class="dist-count">${cnt}</span>
            <span class="dist-pct">${pct > 0 ? pct + "%" : ""}</span>
          </div>
        `;
      }).join("");
    } else {
      if (stHdEl) stHdEl.style.display = "none";
      stChartEl.innerHTML = `<div class="pm-empty-hint">Keine Abwesenheiten oder Sonderstatus in diesem Monat.</div>`;
    }
  }

  // === DUTY DETAILS ===
  const dutyDetailEl = document.getElementById("pm-duty-detail");
  const dutyHdEl = document.getElementById("pm-duty-hd");
  if (dutyDetailEl) {
    if (s.dutyD.length || s.dutyHG.length) {
      if (dutyHdEl) dutyHdEl.style.display = "";
      let dHtml = "";

      if (s.dutyD.length) {
        const dayBadges = s.dutyD.map(d => {
          const wd = weekday(y, m, d);
          const hol = isHoliday(y, m, d, hols);
          const isWeOrHol = wd === 5 || wd === 6 || wd === 0 || hol;
          const sty = isWeOrHol ? ` style="background:#FEF3C7;color:#78350F;border-color:#FDE68A"` : "";
          return `<span class="duty-day-badge"${sty} title="${DOW_LONG[wd]}, ${d}. ${MONTHS[m]}">${DOW_ABBR[wd]} ${d}.</span>`;
        }).join("");
        dHtml += `
          <div class="duty-detail-group">
            <span class="duty-group-lbl badge-D">D</span>
            <div>
              <div class="duty-group-label">Bereitschaftsdienst <span class="duty-group-count">(${s.dutyD.length}×)</span></div>
              <div class="duty-group-days">${dayBadges}</div>
            </div>
          </div>
        `;
      }

      if (s.dutyHG.length) {
        const dayBadges = s.dutyHG.map(d => {
          const wd = weekday(y, m, d);
          const hol = isHoliday(y, m, d, hols);
          const isWeOrHol = wd === 5 || wd === 6 || wd === 0 || hol;
          const sty = isWeOrHol ? ` style="background:#E0F2FE;color:#0369A1;border-color:#7DD3FC"` : "";
          return `<span class="duty-day-badge"${sty} title="${DOW_LONG[wd]}, ${d}. ${MONTHS[m]}">${DOW_ABBR[wd]} ${d}.</span>`;
        }).join("");
        dHtml += `
          <div class="duty-detail-group">
            <span class="duty-group-lbl badge-HG">HG</span>
            <div>
              <div class="duty-group-label">Hintergrunddienst <span class="duty-group-count">(${s.dutyHG.length}×)</span></div>
              <div class="duty-group-days">${dayBadges}</div>
            </div>
          </div>
        `;
      }
      dutyDetailEl.innerHTML = dHtml;
    } else {
      if (dutyHdEl) dutyHdEl.style.display = "none";
      dutyDetailEl.innerHTML = `<div class="pm-empty-hint">Keine Dienste in diesem Monat eingetragen.</div>`;
    }
  }

  // === ANNUAL TREND CHART ===
  const trendCanvas = document.getElementById("pm-trend-canvas");
  if (trendCanvas && typeof Chart !== "undefined") {
    _destroyChart("trend");
    const labels = ys.months.map(mon => MONTHS_SHORT[mon.m]);
    const activeData = ys.months.map(mon => mon.hasData ? mon.totalActive : null);
    const dutyDData = ys.months.map(mon => mon.hasData ? mon.dutyD : null);
    const dutyHGData = ys.months.map(mon => mon.hasData ? mon.dutyHG : null);
    const vacData = ys.months.map(mon => {
      if (!mon.hasData) return null;
      return VACATION_CODES.reduce((sum, c) => sum + (mon.stCounts[c] || 0), 0);
    });

    _pmCharts["trend"] = new Chart(trendCanvas, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Aktive Tage",
            data: activeData,
            backgroundColor: ys.months.map((mon) => mon.m === m ? "rgba(14,165,233,0.85)" : "rgba(14,165,233,0.35)"),
            borderColor: ys.months.map((mon) => mon.m === m ? "#0EA5E9" : "rgba(14,165,233,0.5)"),
            borderWidth: 1,
            borderRadius: 4,
            order: 3,
          },
          {
            label: "D-Dienste",
            data: dutyDData,
            type: "line",
            borderColor: "#EF4444",
            backgroundColor: "rgba(239,68,68,0.1)",
            pointBackgroundColor: "#EF4444",
            pointRadius: 3,
            pointHoverRadius: 5,
            borderWidth: 2,
            tension: 0.3,
            fill: false,
            order: 1,
          },
          {
            label: "HG-Dienste",
            data: dutyHGData,
            type: "line",
            borderColor: "#0EA5E9",
            backgroundColor: "rgba(14,165,233,0.0)",
            pointBackgroundColor: "#0EA5E9",
            pointRadius: 3,
            pointHoverRadius: 5,
            borderWidth: 2,
            tension: 0.3,
            fill: false,
            order: 2,
          },
          {
            label: "Urlaub",
            data: vacData,
            type: "line",
            borderColor: "#7C3AED",
            backgroundColor: "rgba(124,58,237,0.0)",
            pointBackgroundColor: "#7C3AED",
            pointRadius: 3,
            pointHoverRadius: 5,
            borderWidth: 1.5,
            borderDash: [4, 3],
            tension: 0.3,
            fill: false,
            order: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: {
            position: "top",
            align: "end",
            labels: { font: { size: 10, family: "IBM Plex Sans" }, boxWidth: 10, padding: 10, usePointStyle: true },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => ctx.raw !== null ? ` ${ctx.dataset.label}: ${ctx.raw}` : null,
            },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 } } },
          y: { beginAtZero: true, grid: { color: "rgba(0,0,0,0.05)" }, ticks: { font: { size: 10 }, stepSize: 2 } },
        },
        animation: { duration: 400 },
      },
    });
  }

  // === DUTY DAY-OF-WEEK ANALYSIS ===
  const dowEl = document.getElementById("pm-duty-dow");
  if (dowEl) {
    const dowD = [0, 0, 0, 0, 0, 0, 0];
    const dowHG = [0, 0, 0, 0, 0, 0, 0];
    const dowWork = [0, 0, 0, 0, 0, 0, 0];

    for (let mon = 0; mon < 12; mon++) {
      const monthData = ys.months[mon];
      if (!monthData.hasData) continue;
      const dim = daysInMonth(y, mon);
      for (let d = 1; d <= dim; d++) {
        const cell = getCell(y, mon, empName, d);
        const wd = weekday(y, mon, d);
        if (cell.duty === "D") dowD[wd]++;
        if (cell.duty === "HG") dowHG[wd]++;
        if (cell.assignment && WORKPLACES.find(w => w.code === cell.assignment.split("/")[0].trim())) {
          dowWork[wd]++;
        }
      }
    }

    const maxDow = Math.max(...dowD, ...dowHG, ...dowWork, 1);
    const dowLabels = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
    dowEl.innerHTML = dowLabels.map((lbl, i) => {
      const isWe = i === 0 || i === 6;
      const dPct = Math.round((dowD[i] / maxDow) * 100);
      const hgPct = Math.round((dowHG[i] / maxDow) * 100);
      const wPct = Math.round((dowWork[i] / maxDow) * 100);
      return `
        <div class="pm-dow-col${isWe ? " pm-dow-we" : ""}">
          <div class="pm-dow-bars">
            <div class="pm-dow-bar" title="${dowWork[i]} Arbeitstage" style="height:${wPct}%;background:#93C5FD"></div>
            <div class="pm-dow-bar" title="${dowHG[i]}× HG" style="height:${hgPct}%;background:#0EA5E9"></div>
            <div class="pm-dow-bar" title="${dowD[i]}× D" style="height:${dPct}%;background:#EF4444"></div>
          </div>
          <div class="pm-dow-lbl">${lbl}</div>
          <div class="pm-dow-val">
            ${dowD[i] ? `<span class="pm-dow-chip d">${dowD[i]}D</span>` : ""}
            ${dowHG[i] ? `<span class="pm-dow-chip hg">${dowHG[i]}H</span>` : ""}
          </div>
        </div>
      `;
    }).join("");

    dowEl.insertAdjacentHTML("beforeend", `
      <div class="pm-dow-legend">
        <span class="pm-dow-leg-item"><span style="background:#93C5FD"></span>Arbeitstage</span>
        <span class="pm-dow-leg-item"><span style="background:#0EA5E9"></span>HG-Dienste</span>
        <span class="pm-dow-leg-item"><span style="background:#EF4444"></span>D-Dienste</span>
      </div>
    `);
  }

  // === MONTHLY CALENDAR ===
  const calEl = document.getElementById("pm-cal");
  if (calEl) {
    const dim = daysInMonth(y, m);
    const firstWd = weekday(y, m, 1);

    let calHtml = `<div class="mcd-grid">`;
    DOW_ABBR.forEach((d, i) => {
      calHtml += `<div class="mcd-dow${(i === 0 || i === 6) ? " is-we" : ""}">${d}</div>`;
    });
    for (let i = 0; i < firstWd; i++) calHtml += `<div class="mcd-ph"></div>`;

    for (let d = 1; d <= dim; d++) {
      const wd = weekday(y, m, d);
      const hol = isHoliday(y, m, d, hols);
      const holName = hols[dateKey(y, m, d)];
      const cell = getCell(y, m, empName, d);
      const isToday = isTodayCol(y, m, d, TOD_Y, TOD_M, TOD_D);

      let cls = "mcd";
      if (hol) cls += " mcd-hol";
      else if (wd === 0 || wd === 6) cls += " mcd-we";
      else if (!cell.assignment && !cell.duty) cls += " mcd-empty";
      if (isToday) cls += " mcd-today";

      const assign = cell.assignment || "";
      const duty = cell.duty || "";
      const { bg: cbg, fg: cfg } = cellColor(assign);
      const bgStyle = assign ? `background:${cbg}` : "";
      const interactive = (!hol && wd !== 0 && wd !== 6) ? ` role="button" tabindex="0"` : "";
      const titleAttr = ` title="${DOW_LONG[wd]}, ${d}. ${MONTHS[m]}${hol ? " – " + holName : ""}${assign ? " · " + assign : ""}${duty ? " · " + duty : ""}"`;

      calHtml += `
        <div class="${cls}" style="${bgStyle}"${interactive} data-day="${d}"${titleAttr}>
          <span class="mcd-num">${d}</span>
          <span class="mcd-assign" style="color:${cfg}">${assign}</span>
          ${duty ? `<span class="mcd-duty badge-${duty}">${duty}</span>` : ""}
        </div>
      `;
    }
    calHtml += `</div>`;
    calEl.innerHTML = calHtml;

    calEl.querySelectorAll(".mcd[data-day]").forEach(el => {
      const dayNum = parseInt(el.dataset.day);
      const wd = weekday(y, m, dayNum);
      const hol = isHoliday(y, m, dayNum, hols);
      if (!hol && wd !== 0 && wd !== 6) {
        el.addEventListener("click", () => {
          hideOverlay("modal-profile");
          setTimeout(() => openEditor(empName, dayNum), 180);
        });
      }
    });
  }

  // === YEARLY SUMMARY ===
  const yrEl = document.getElementById("pm-yearly");
  if (yrEl) {
    const kpiVals = [
      { lbl: "Aktive Tage", val: ys.totals.totalActive, color: "#1D4ED8" },
      { lbl: "Urlaub", val: ys.totals.vacationDays, color: "#7C3AED" },
      { lbl: "Krank", val: ys.totals.sickDays, color: "#DC2626" },
      { lbl: "FZA", val: ys.totals.fzaDays, color: "#3730A3" },
      { lbl: "WB", val: ys.totals.wbDays, color: "#78350F" },
      { lbl: "D-Dienste", val: ys.totals.dutyD, color: "#EF4444" },
      { lbl: "HG-Dienste", val: ys.totals.dutyHG, color: "#0EA5E9" },
    ];

    let yrHtml = `<div class="yr-kpi-strip">`;
    kpiVals.forEach((k, i) => {
      if (i > 0) yrHtml += `<div class="yr-kpi-div"></div>`;
      yrHtml += `
        <div class="yr-kpi-item">
          <div class="yr-kpi-val" style="color:${k.color}">${k.val}</div>
          <div class="yr-kpi-lbl">${k.lbl}</div>
        </div>
      `;
    });
    yrHtml += `</div>`;

    yrHtml += `
      <div class="yr-table-wrap">
        <table class="yr-table">
          <thead>
            <tr>
              <th class="yr-th yr-th-month">Monat</th>
              <th class="yr-th">Aktiv</th>
              <th class="yr-th yr-th-vac">Urlaub</th>
              <th class="yr-th yr-th-sick">Krank</th>
              <th class="yr-th">FZA</th>
              <th class="yr-th">WB</th>
              <th class="yr-th yr-th-d">D</th>
              <th class="yr-th yr-th-hg">HG</th>
              <th class="yr-th">Abdeckung</th>
            </tr>
          </thead>
          <tbody>
    `;

    ys.months.forEach(mon => {
      const isCur = mon.m === m;
      const vac2 = VACATION_CODES.reduce((s2, c) => s2 + (mon.stCounts[c] || 0), 0);
      const sick2 = (mon.stCounts["K"] || 0) + (mon.stCounts["KK"] || 0);
      const fza2 = mon.stCounts["FZA"] || 0;
      const wb2 = mon.stCounts["WB"] || 0;
      const frei2 = mon.stCounts["F"] || 0;
      const rc = mon.hasData ? "" : " yr-row-empty";
      const reqWd = Math.max(0, mon.totalWorkdays - vac2 - sick2 - fza2 - wb2 - frei2);
      const cov2 = reqWd > 0 ? Math.min(100, Math.round((mon.totalActive / reqWd) * 100)) : 0;
      const covCls = cov2 >= 80 ? "cov-good" : cov2 >= 60 ? "cov-mid" : "cov-low";

      yrHtml += `
        <tr class="yr-row${isCur ? " yr-row-current" : ""}${rc}">
          <td class="yr-td-month">${MONTHS_SHORT[mon.m]}</td>
          <td class="yr-td yr-td-num">${mon.hasData && mon.totalWorkdays > 0 ? (mon.totalActive || "—") : "—"}</td>
          <td class="yr-td yr-td-num yr-vac">${mon.hasData && vac2 ? vac2 : "—"}</td>
          <td class="yr-td yr-td-num yr-sick">${mon.hasData && sick2 ? sick2 : "—"}</td>
          <td class="yr-td yr-td-num">${mon.hasData && fza2 ? fza2 : "—"}</td>
          <td class="yr-td yr-td-num">${mon.hasData && wb2 ? wb2 : "—"}</td>
          <td class="yr-td yr-td-num yr-duty-d">${mon.hasData && mon.dutyD ? mon.dutyD : "—"}</td>
          <td class="yr-td yr-td-num yr-duty-hg">${mon.hasData && mon.dutyHG ? mon.dutyHG : "—"}</td>
          <td class="yr-td yr-td-num">
            ${mon.hasData && mon.totalWorkdays > 0 ? `<span class="yr-cov-badge ${covCls}">${cov2}%</span>` : "—"}
          </td>
        </tr>
      `;
    });

    const totalReqWd = Math.max(0, ys.totals.totalWorkdays - ys.totals.vacationDays - ys.totals.sickDays - ys.totals.fzaDays - ys.totals.wbDays - ys.totals.freiDays);
    const totalCov = totalReqWd > 0 ? Math.min(100, Math.round((ys.totals.totalActive / totalReqWd) * 100)) : 0;
    const totalCovCls = totalCov >= 80 ? "cov-good" : totalCov >= 60 ? "cov-mid" : "cov-low";

    yrHtml += `
          <tr class="yr-total-row">
            <td class="yr-total-lbl">Gesamt</td>
            <td class="yr-td yr-td-num yr-total">${ys.totals.totalActive || "—"}</td>
            <td class="yr-td yr-td-num yr-vac yr-total">${ys.totals.vacationDays || "—"}</td>
            <td class="yr-td yr-td-num yr-sick yr-total">${ys.totals.sickDays || "—"}</td>
            <td class="yr-td yr-td-num yr-total">${ys.totals.fzaDays || "—"}</td>
            <td class="yr-td yr-td-num yr-total">${ys.totals.wbDays || "—"}</td>
            <td class="yr-td yr-td-num yr-duty-d yr-total">${ys.totals.dutyD || "—"}</td>
            <td class="yr-td yr-td-num yr-duty-hg yr-total">${ys.totals.dutyHG || "—"}</td>
            <td class="yr-td yr-td-num yr-total">
              ${totalReqWd > 0 ? `<span class="yr-cov-badge ${totalCovCls}">${totalCov}%</span>` : "—"}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    `;

    yrEl.innerHTML = yrHtml;
  }

  showOverlay("modal-profile");
}

export function showOverlay(id) {
  const el = document.getElementById(id);
  if (!el) return;

  closeCellQuickPopover();
  el.removeAttribute("hidden");
  el.style.display = "flex";
  
  const mEl = el.querySelector(".modal");
  if (mEl) {
    mEl.classList.remove("modal-closing");
  }
  
  document.body.classList.add("modal-open");
  updateModalLayout(el);
  setTimeout(() => updateModalLayout(el), 60);
  
  const first = el.querySelector('[autofocus],[tabindex="0"],button:not([disabled]),input,textarea');
  if (first) {
    setTimeout(() => first.focus(), 60);
  }
}

export function hideOverlay(id) {
  const el = document.getElementById(id);
  if (!el) return;
  
  const mEl = el.querySelector(".modal");
  if (mEl) {
    mEl.classList.add("modal-closing");
    setTimeout(() => {
      el.setAttribute("hidden", "");
      el.style.display = "none";
      mEl.classList.remove("modal-closing");
      if (!document.querySelector(".overlay:not([hidden])")) {
        document.body.classList.remove("modal-open");
      }
    }, 160);
  } else {
    el.setAttribute("hidden", "");
    el.style.display = "none";
    if (!document.querySelector(".overlay:not([hidden])")) {
      document.body.classList.remove("modal-open");
    }
  }
}

export function openScoreInfoModal(resultData = autoPlanResult) {
  const body = document.getElementById("score-info-body");
  if (!body) return;

  const q = {
    score: Number(resultData?.summary?.quality?.score ?? resultData?.quality?.score) || 0,
    dutyGaps: Number(resultData?.summary?.quality?.dutyCoverageMisses ?? resultData?.quality?.dutyCoverageMisses) || 0,
    hgGaps: Number(resultData?.summary?.quality?.hgCoverageMisses ?? resultData?.quality?.hgCoverageMisses) || 0,
    bdSpread: Number(resultData?.summary?.quality?.bdSpread ?? resultData?.quality?.bdSpread) || 0,
    hgSpread: Number(resultData?.summary?.quality?.hgSpread ?? resultData?.quality?.hgSpread) || 0,
    weSpread: Number(resultData?.summary?.quality?.weekendSpread ?? resultData?.quality?.weekendSpread) || 0,
    wishes: Number(resultData?.summary?.quality?.wishFulfillmentRate ?? resultData?.quality?.wishFulfillmentRate) || 0,
    deepMoves: Number(resultData?.summary?.quality?.deepMoves ?? resultData?.quality?.deepMoves) || 0
  };

  const getRating = (s) => s >= 90 ? "Exzellent" : s >= 80 ? "Sehr Gut" : s >= 70 ? "Gut" : s >= 50 ? "Befriedigend" : "Optimierung empfohlen";
  const getTone = (s) => s >= 80 ? "#22C55E" : s >= 60 ? "#F59E0B" : "#EF4444";
  
  const metrics = [
    { label: "D-Abdeckung", val: q.dutyGaps === 0 ? "100%" : `${q.dutyGaps} Lücken`, weight: "D-Prio", hint: "Jede Lücke im Bereitschaftsdienst führt zu massiven Penalty-Abzügen (-15 Punkte pro fehlendem Dienst).", pct: Math.max(0, 100 - q.dutyGaps * 20), color: q.dutyGaps === 0 ? "#22C55E" : "#EF4444" },
    { label: "HG-Abdeckung", val: q.hgGaps === 0 ? "100%" : `${q.hgGaps} Lücken`, weight: "HG-Prio", hint: "Jede Lücke im Hintergrunddienst bestraft den Score (-10 Punkte pro fehlendem Dienst).", pct: Math.max(0, 100 - q.hgGaps * 20), color: q.hgGaps === 0 ? "#22C55E" : "#EF4444" },
    { label: "BD-Gerechtigkeit", val: `Δ ${q.bdSpread}`, weight: "Spread", hint: "Unterschied zwischen der Person mit den meisten und wenigsten Bereitschaftsdiensten. Exponentieller Abzug ab Δ > 1.", pct: Math.max(0, 100 - q.bdSpread * 15), color: q.bdSpread <= 1 ? "#22C55E" : "#F59E0B" },
    { label: "HG-Balance", val: `Δ ${q.hgSpread}`, weight: "Spread", hint: "Gleichmäßige Verteilung im Hintergrunddienst. Strafen skalieren mit zunehmender Ungerechtigkeit.", pct: Math.max(0, 100 - q.hgSpread * 20), color: q.hgSpread <= 1 ? "#22C55E" : "#F59E0B" },
    { label: "WE-Streuung", val: `Δ ${q.weSpread}`, weight: "Spread", hint: "Fairness der Wochenend- und Feiertagsdienste. Diese Dienste sind hoch gewichtet und müssen fair rotieren.", pct: Math.max(0, 100 - q.weSpread * 25), color: q.weSpread <= 1 ? "#22C55E" : "#F59E0B" },
    { label: "Wunscherfüllung", val: `${Math.round(q.wishes * 100)}%`, weight: "Bonus", hint: "Erfolgsrate der eingetragenen BD/HG-Wünsche. Erfüllte Wünsche generieren Bonuspunkte (bis zu +5.0 auf den Score).", pct: Math.round(q.wishes * 100), color: q.wishes >= 0.8 ? "#22C55E" : "#93C5FD" }
  ];

  let reasoningHtml = "";
  
  if (q.dutyGaps === 0) {
    reasoningHtml += `<div class="score-reasoning-item pos"><svg class="score-r-icon" width="16" height="16" fill="none" stroke="#22C55E" stroke-width="2" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg><div class="score-r-text">Vollständige Bereitschaftsdienst-Abdeckung ohne Lücken.</div><span class="score-r-pts pos">±0.0</span></div>`;
  } else {
    reasoningHtml += `<div class="score-reasoning-item neg"><svg class="score-r-icon" width="16" height="16" fill="none" stroke="#EF4444" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><div class="score-r-text"><strong>Kritisch:</strong> ${q.dutyGaps} unbesetzte D-Schichten. Der Algorithmus konnte keine passenden Kandidaten ohne Verletzung harter Constraints finden.</div><span class="score-r-pts neg">-${(q.dutyGaps * 15.0).toFixed(1)}</span></div>`;
  }
  
  if (q.hgGaps === 0) {
    reasoningHtml += `<div class="score-reasoning-item pos"><svg class="score-r-icon" width="16" height="16" fill="none" stroke="#22C55E" stroke-width="2" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg><div class="score-r-text">Vollständige Hintergrunddienst-Abdeckung ohne Lücken.</div><span class="score-r-pts pos">±0.0</span></div>`;
  } else {
    reasoningHtml += `<div class="score-reasoning-item neg"><svg class="score-r-icon" width="16" height="16" fill="none" stroke="#EF4444" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><div class="score-r-text"><strong>Kritisch:</strong> ${q.hgGaps} unbesetzte HG-Schichten. Möglicher Mangel an verfügbaren Fachärzten.</div><span class="score-r-pts neg">-${(q.hgGaps * 10.0).toFixed(1)}</span></div>`;
  }

  if (q.bdSpread <= 1) {
    reasoningHtml += `<div class="score-reasoning-item pos"><svg class="score-r-icon" width="16" height="16" fill="none" stroke="#22C55E" stroke-width="2" viewBox="0 0 24 24"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg><div class="score-r-text">Optimale Gleichverteilung der D-Dienste (Spread &le; 1). Höchstmögliche Fairness erreicht.</div><span class="score-r-pts pos">-${(q.bdSpread * 2.5).toFixed(1)}</span></div>`;
  } else {
    reasoningHtml += `<div class="score-reasoning-item neg"><svg class="score-r-icon" width="16" height="16" fill="none" stroke="#F59E0B" stroke-width="2" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg><div class="score-r-text">Ungleiche Verteilung der D-Dienste detektiert. Die Varianz (Spread ${q.bdSpread}) führt zu exponentiellen Penalty-Abzügen.</div><span class="score-r-pts neg">-${(q.bdSpread * 2.5).toFixed(1)}</span></div>`;
  }
  
  if (q.hgSpread > 1) {
    reasoningHtml += `<div class="score-reasoning-item neg"><svg class="score-r-icon" width="16" height="16" fill="none" stroke="#F59E0B" stroke-width="2" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg><div class="score-r-text">Suboptimale Hintergrund-Balance (Spread ${q.hgSpread}) unter den Fachärzten festgestellt.</div><span class="score-r-pts neg">-${(q.hgSpread * 1.5).toFixed(1)}</span></div>`;
  }
  
  if (q.wishes > 0) {
    reasoningHtml += `<div class="score-reasoning-item pos"><svg class="score-r-icon" width="16" height="16" fill="none" stroke="#22C55E" stroke-width="2" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg><div class="score-r-text">Bonus für erfüllte Dienstwünsche (${Math.round(q.wishes * 100)}%). Dienstplanung berücksichtigt Präferenzen.</div><span class="score-r-pts pos">+${(q.wishes * 5.0).toFixed(1)}</span></div>`;
  }
  
  reasoningHtml += `<div class="score-reasoning-item neu"><svg class="score-r-icon" width="16" height="16" fill="none" stroke="#38BDF8" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><div class="score-r-text">Rechenkosten-Penalty für komplexe Umverteilungen. Der Algorithmus benötigte ${q.deepMoves} Deep-Moves zur Konvergenz.</div><span class="score-r-pts neg">-${(q.deepMoves * 0.005).toFixed(1)}</span></div>`;

  body.innerHTML = `
    <div class="score-dashboard">
      <header class="score-dash-head">
        <div class="score-main-circle" style="--score-color: ${getTone(q.score)}">
          <svg viewBox="0 0 36 36" class="score-ring">
            <path class="score-ring-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
            <path class="score-ring-fill" stroke-dasharray="${q.score}, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
          </svg>
          <div class="score-val-box">
            <span class="score-num">${q.score.toFixed(1)}</span>
            <span class="score-pct-sign">NFI</span>
          </div>
        </div>
        <div class="score-dash-info">
          <h3 class="score-dash-rating" style="color: ${getTone(q.score)}">${getRating(q.score)}</h3>
          <p class="score-dash-desc">Der RadPlan Neural Scheduler hat <strong>${q.deepMoves}</strong> Optimierungs-Schritte durchgeführt, um die harte und weiche Constraint-Matrix in dieses lokale Minimum zu transformieren.</p>
        </div>
      </header>

      <div class="score-grid-enhanced">
        ${metrics.map(m => `
          <div class="score-card-enhanced" data-tooltip="${m.hint}" data-tooltip-pos="bottom">
            <div class="score-card-top">
              <span class="score-card-lbl">
                ${m.label}
                <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="opacity:0.5"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              </span>
              <span class="score-card-weight">${m.weight}</span>
            </div>
            <div class="score-card-mid">
              <span class="score-card-val" style="color: ${m.color}">${m.val}</span>
              <div class="score-card-bar"><div class="score-card-fill" style="width: ${m.pct}%; background: ${m.color}"></div></div>
            </div>
          </div>
        `).join("")}
      </div>

      <div class="score-math-box-enhanced">
        <div class="score-math-title">Punkte-Analyse &amp; Penalty-Metriken</div>
        <p class="score-math-text" style="margin-bottom:12px;">Der Algorithmus startet mit einem Basis-Score von 100.0 Punkten. Harte Regelverletzungen sind blockiert (Penalty = &infin;). Weiche Regelverletzungen werden mit spezifischen Gewichten abgezogen.</p>
        <div class="score-reasoning-list">
          ${reasoningHtml}
        </div>
      </div>
      
      <div class="score-formula-display">
        <span class="formula-lbl">Berechnungs-Basis (NFI):</span>
        <code>Fitness = 100 - (Lücken × G) - (Spread × G) + (Wünsche × G) - (Rechenkosten)</code>
      </div>
    </div>
  `;

  showOverlay("modal-score-info");
}

let toastTimer = null;

export function showToast(msg, type) {
  const el = document.getElementById("toast");
  if (!el) return;

  // Auto-classify by message wording when no explicit type is given, so
  // failure messages get a warning treatment without touching call sites.
  if (!type) {
    type = /fehler|fehlgeschlagen|konnte nicht|ungültig|nicht möglich/i.test(msg) ? "error" : "success";
  }
  el.dataset.type = type;

  el.textContent = msg;
  el.classList.remove("visible");
  
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      el.classList.add("visible");
    });
  });
  
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove("visible");
  }, 3400);
}

