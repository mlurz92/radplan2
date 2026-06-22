import {
  CODE_MAP,
  MONTHS,
  MONTHS_SHORT,
  VACATION_CODES,
  getEmpMeta,
  posColor,
  getSaxonyHolidaysCached,
  daysInMonth,
  weekday,
  isHoliday,
  empInitials
} from './constants.js';

import { state, TOD_Y, TOD_M, TOD_D } from './state.js';

import {
  getMonthData,
  getCell,
  buildProfileStats,
  buildYearlyStats,
  getEmployeesForYear,
  getRoleFilterBuckets,
  getEmployeeYearCardMetrics,
  matchRoleFilter,
  addEmployee,
  removeEmployee
} from './model.js';

import { openProfileModal } from './render-modals.js';

export function renderEmployeeDashboard() {
  const { year: y, month: m } = state;
  const dash = state.employeeDashboard;
  const employees = getEmployeesForYear(y);
  
  const summaryEl = document.getElementById("emp-summary-grid");
  const gridEl = document.getElementById("emp-year-grid");
  const detailEl = document.getElementById("emp-detail-panel");
  const detailSub = document.getElementById("emp-detail-sub");
  const countEl = document.getElementById("emp-visible-count");
  const contextEl = document.getElementById("emp-context-line");
  const teamPanelEl = document.getElementById("emp-team-panel");
  const teamControlsEl = document.getElementById("emp-team-controls");
  
  if (!summaryEl || !gridEl || !detailEl) return;
  
  const currentMonthData = getMonthData(y, m);
  
  if (contextEl) {
    contextEl.textContent = `${MONTHS[m]} ${y} · ${currentMonthData.employees.length} Mitarbeitende im aktuellen Monat · ${employees.length} eindeutige Mitarbeitende im Jahr`;
  }
  
  if (!employees.length) {
    summaryEl.innerHTML = `<div class="empdash-empty">Keine Mitarbeitendendaten für ${y} vorhanden.</div>`;
    gridEl.innerHTML = "";
    detailEl.innerHTML = `<div class="empdash-empty">Bitte zuerst Mitarbeitende anlegen.</div>`;
    if (countEl) countEl.textContent = "0 sichtbar";
    renderRoleFilters(employees);
    return;
  }
  
  const metrics = employees.map((emp) => getEmployeeYearCardMetrics(emp, y));
  const activeCount = metrics.filter((item) => item.activeMonths > 0).length;
  const dutyCount = metrics.reduce((sum, item) => sum + item.ys.totals.dutyD + item.ys.totals.dutyHG, 0);
  
  const roles = metrics.reduce((acc, item) => {
    const pos = item.meta.position;
    if (["CA", "LOA", "OA", "OÄ"].includes(pos)) acc.lead++;
    else if (["FA", "FÄ"].includes(pos)) acc.fa++;
    else if (["AA", "AÄ"].includes(pos)) acc.aa++;
    else acc.other++;
    return acc;
  }, { lead: 0, fa: 0, aa: 0, other: 0 });
  
  const kpiItems = [
    { label: "Mitarbeitende im Jahr", value: employees.length, sub: `${activeCount} mit Aktivität`, tone: "#0EA5E9" },
    { label: "Aktueller Monatsbestand", value: currentMonthData.employees.length, sub: `${MONTHS[m]} ${y}`, tone: "#22C55E" },
    { label: "Dienste im Jahr", value: dutyCount, sub: "D + HG kumuliert", tone: "#F97316" },
    { label: "Rollenmix", value: `${roles.lead}/${roles.fa}/${roles.aa}`, sub: "Leitung · FA · AA", tone: "#A855F7" },
  ];
  
  summaryEl.innerHTML = kpiItems.map((item) => `
    <article class="empdash-kpi">
      <div class="empdash-kpi-label">${item.label}</div>
      <div class="empdash-kpi-value" style="color:${item.tone}">${item.value}</div>
      <div class="empdash-kpi-sub">${item.sub}</div>
    </article>
  `).join("");

  renderEmployeeTeamAnalytics(teamPanelEl, teamControlsEl);
  
  renderRoleFilters(employees);
  
  const query = dash.filter.trim().toLowerCase();
  const filtered = metrics.filter((item) => {
    if (!matchRoleFilter(item.emp, dash.role)) return false;
    if (dash.activeOnly && item.activeMonths <= 0) return false;
    if (!query) return true;
    const hay = [item.emp, item.meta.fullName, item.meta.posLabel, item.meta.position, item.meta.area].join(" ").toLowerCase();
    return hay.includes(query);
  });
  
  const posRank = (p) => {
    const order = ["CA", "LOA", "OA", "OÄ", "FA", "FÄ", "AA", "AÄ"];
    const i = order.indexOf(p);
    return i === -1 ? order.length : i;
  };
  const sortKey = dash.sort || "name";
  filtered.sort((a, b) => {
    switch (sortKey) {
      case "position": {
        const d = posRank(a.meta.position) - posRank(b.meta.position);
        return d !== 0 ? d : a.emp.localeCompare(b.emp, "de");
      }
      case "duty":
        return (b.ys.totals.dutyD + b.ys.totals.dutyHG) - (a.ys.totals.dutyD + a.ys.totals.dutyHG);
      case "vacation":
        return (b.ys.totals.vacationDays || 0) - (a.ys.totals.vacationDays || 0);
      case "sick":
        return (b.ys.totals.sickDays || 0) - (a.ys.totals.sickDays || 0);
      case "active":
        return b.activeMonths - a.activeMonths;
      default:
        return a.emp.localeCompare(b.emp, "de");
    }
  });

  if (!dash.selectedEmp || !employees.includes(dash.selectedEmp)) {
    dash.selectedEmp = filtered[0]?.emp || null;
  }
  
  if (countEl) {
    countEl.textContent = `${filtered.length} von ${employees.length} sichtbar`;
  }
  
  if (filtered.length === 0) {
    gridEl.innerHTML = `<div class="empdash-empty">Keine Mitarbeitenden entsprechen dem Filter.</div>`;
  } else {
    const currentMd = getMonthData(y, m);
    const todayHols = getSaxonyHolidaysCached(TOD_Y);

    gridEl.innerHTML = filtered.map((item) => {
      const pc = posColor(item.meta.position);
      const vac = item.ys.totals.vacationDays || 0;
      const sick = item.ys.totals.sickDays || 0;
      const fza = item.ys.totals.fzaDays || 0;
      const selectedCls = dash.selectedEmp === item.emp ? " active" : "";

      // Top workplaces
      const topWP = Object.entries(item.ys.totals.wpCounts || {})
        .sort((a, b) => b[1] - a[1]).slice(0, 2)
        .map(([code]) => {
          const wm = CODE_MAP[code];
          return `<span class="empdash-wp-chip" style="background:${wm?.bg||"#f1f5f9"};color:${wm?.fg||"#475569"}">${code}</span>`;
        }).join("");

      // Coverage bar
      const covColor = item.coverage >= 80 ? "#22C55E" : item.coverage >= 60 ? "#F59E0B" : "#EF4444";

      // Today's status badge (only if viewing current year/month)
      let todayBadge = "";
      if (y === TOD_Y && m === TOD_M) {
        const cell = getCell(y, m, item.emp, TOD_D);
        const isTodayWe = weekday(TOD_Y, TOD_M, TOD_D);
        const isTodayHol = isHoliday(TOD_Y, TOD_M, TOD_D, todayHols);
        if (!isTodayHol && isTodayWe !== 0 && isTodayWe !== 6) {
          if (cell.assignment) {
            const cm = CODE_MAP[cell.assignment.split("/")[0].trim()];
            todayBadge = `<span class="empdash-today-badge" style="background:${cm?.bg||"#DBEAFE"};color:${cm?.fg||"#1D4ED8"}">${cell.assignment}</span>`;
          } else if (cell.duty) {
            todayBadge = `<span class="empdash-today-badge" style="background:${cell.duty==="D"?"#FEE2E2":"#E0F2FE"};color:${cell.duty==="D"?"#B91C1C":"#0369A1"}">${cell.duty}</span>`;
          } else if (currentMd.employees.includes(item.emp)) {
            todayBadge = `<span class="empdash-today-badge" style="background:#F1F5F9;color:#94A3B8">—</span>`;
          }
        }
      }

      // Open profile button (name is clickable for opening full profile)
      return `
        <div class="empdash-card${selectedCls}" data-emp="${item.emp}" role="listitem" tabindex="0">
          <div class="empdash-card-top">
            <span class="empdash-avatar" style="background:linear-gradient(135deg,${pc.border},${pc.fg})">${empInitials(item.emp)}</span>
            <div class="empdash-card-meta">
              <span class="empdash-card-name" data-open-profile="${item.emp}">${item.emp}</span>
              <span class="empdash-card-sub">${item.meta.posLabel !== "—" ? item.meta.posLabel : "ohne Stammdaten"}</span>
              ${item.meta.area ? `<span class="empdash-card-area">${item.meta.area}</span>` : ""}
            </div>
            <div class="empdash-card-right">
              <span class="empdash-pos" style="background:${pc.bg};color:${pc.fg}">${item.meta.position}</span>
              ${todayBadge}
            </div>
          </div>
          <div class="empdash-card-stats">
            <span><strong>${item.ys.totals.totalActive || 0}</strong><small>Aktiv</small></span>
            <span><strong style="color:#EF4444">${item.ys.totals.dutyD || 0}</strong><small>D</small></span>
            <span><strong style="color:#0EA5E9">${item.ys.totals.dutyHG || 0}</strong><small>HG</small></span>
            <span><strong style="color:#7C3AED">${vac}</strong><small>Urlaub</small></span>
            <span><strong style="color:${sick>0?"#DC2626":"#64748B"}">${sick}</strong><small>Krank</small></span>
            <span><strong style="color:#3730A3">${fza}</strong><small>FZA</small></span>
          </div>
          <div class="empdash-card-cov-wrap">
            <div class="empdash-card-cov-bar" title="${item.coverage}% Abdeckung">
              <div class="empdash-card-cov-fill" style="width:${item.coverage}%;background:${covColor}"></div>
            </div>
            <span class="empdash-card-cov-pct" style="color:${covColor}">${item.coverage}%</span>
          </div>
          <div class="empdash-card-foot">
            <span>${item.activeMonths}/12 Monate aktiv</span>
            <span class="empdash-card-wps">${topWP || '<span style="color:#CBD5E1">—</span>'}</span>
          </div>
        </div>
      `;
    }).join("");
    
    gridEl.querySelectorAll("[data-emp]").forEach((card) => {
      card.addEventListener("click", (e) => {
        // If clicking the name link → open profile
        if (e.target.closest("[data-open-profile]")) {
          const name = e.target.closest("[data-open-profile]").dataset.openProfile;
          openProfileModal(name);
          return;
        }
        dash.selectedEmp = card.dataset.emp;
        renderEmployeeDashboard();
      });
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          dash.selectedEmp = card.dataset.emp;
          renderEmployeeDashboard();
        }
      });
    });
  }
  
  if (!dash.selectedEmp) {
    detailEl.innerHTML = `<div class="empdash-empty">Bitte eine Person auswählen.</div>`;
    if (detailSub) {
      detailSub.textContent = "Bitte eine Person auswählen.";
    }
    return;
  }
  
  renderEmployeeDetailDashboard(dash.selectedEmp, y);
  
  if (detailSub) {
    const viewName = dash.detailView === "months" ? "Monatsverlauf" : dash.detailView === "calendar" ? "Jahreskalender" : "Verwaltung";
    detailSub.textContent = `${dash.selectedEmp} · Kalenderjahr ${y} · Detailansicht ${viewName}`;
  }
}

function getRangeMonths(range, year, month, customStart, customEnd) {
  if (range === "month") return [{ year, month }];
  if (range === "quarter") {
    const start = Math.floor(month / 3) * 3;
    return Array.from({ length: 3 }, (_, i) => ({ year, month: start + i }));
  }
  if (range === "year") {
    return Array.from({ length: 12 }, (_, i) => ({ year, month: i }));
  }
  if (range === "rolling12") {
    return Array.from({ length: 12 }, (_, idx) => {
      const total = year * 12 + month - (11 - idx);
      return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
    });
  }
  if (range === "custom" && customStart && customEnd) {
    let from = customStart.year * 12 + customStart.month;
    let to = customEnd.year * 12 + customEnd.month;
    if (from > to) [from, to] = [to, from];
    const months = [];
    for (let t = from; t <= to; t++) {
      months.push({ year: Math.floor(t / 12), month: ((t % 12) + 12) % 12 });
    }
    return months;
  }
  return [{ year, month }];
}

function renderEmployeeTeamAnalytics(teamPanelEl, teamControlsEl) {
  if (!teamPanelEl || !teamControlsEl) return;
  const dash = state.employeeDashboard;
  const { year, month } = state;
  if (!dash.customStart) dash.customStart = { year, month: Math.max(0, month - 2) };
  if (!dash.customEnd) dash.customEnd = { year, month };
  
  const rangeDefs = [
    ["month", "Monat"],
    ["quarter", "Quartal"],
    ["year", "Jahr"],
    ["rolling12", "Rolling 12M"],
    ["custom", "Custom"]
  ];
  
  teamControlsEl.innerHTML = `
    <div class="empdash-team-pills">
      ${rangeDefs.map(([key, label]) => `<button type="button" class="empdash-filter-btn${dash.analyticsRange === key ? " active" : ""}" data-range="${key}">${label}</button>`).join("")}
    </div>
    <div class="empdash-custom-range"${dash.analyticsRange === "custom" ? "" : " style='display:none'"}>
      <label>Von <input type="month" id="emp-custom-start" value="${dash.customStart.year}-${String(dash.customStart.month + 1).padStart(2, "0")}"></label>
      <label>Bis <input type="month" id="emp-custom-end" value="${dash.customEnd.year}-${String(dash.customEnd.month + 1).padStart(2, "0")}"></label>
    </div>
  `;
  
  teamControlsEl.querySelectorAll("[data-range]").forEach((btn) => {
    btn.addEventListener("click", () => {
      dash.analyticsRange = btn.dataset.range;
      renderEmployeeDashboard();
    });
  });
  
  teamControlsEl.querySelector("#emp-custom-start")?.addEventListener("change", (e) => {
    const [y, m] = e.target.value.split("-").map(Number);
    if (Number.isFinite(y) && Number.isFinite(m)) {
      dash.customStart = { year: y, month: m - 1 };
      renderEmployeeDashboard();
    }
  });
  
  teamControlsEl.querySelector("#emp-custom-end")?.addEventListener("change", (e) => {
    const [y, m] = e.target.value.split("-").map(Number);
    if (Number.isFinite(y) && Number.isFinite(m)) {
      dash.customEnd = { year: y, month: m - 1 };
      renderEmployeeDashboard();
    }
  });
  
  const rangeMonths = getRangeMonths(dash.analyticsRange, year, month, dash.customStart, dash.customEnd);
  const allEmployees = getEmployeesForYear(year);
  if (!allEmployees.length || !rangeMonths.length) {
    teamPanelEl.innerHTML = `<div class="empdash-empty">Keine Teamdaten verfügbar.</div>`;
    return;
  }
  
  const agg = {
    active: 0, vac: 0, sick: 0, fza: 0, wb: 0, d: 0, hg: 0, uncovered: 0, required: 0
  };
  const perEmp = new Map();
  
  allEmployees.forEach((emp) => perEmp.set(emp, { emp, active: 0, d: 0, hg: 0, vac: 0, sick: 0, uncovered: 0, required: 0 }));
  
  rangeMonths.forEach(({ year: y, month: m }) => {
    const md = getMonthData(y, m);
    const dim = daysInMonth(y, m);
    const hols = getSaxonyHolidaysCached(y);
    md.employees.forEach((emp) => {
      const s = buildProfileStats(y, m, emp);
      const row = perEmp.get(emp) || { emp, active: 0, d: 0, hg: 0, vac: 0, sick: 0, uncovered: 0, required: 0 };
      const vac = VACATION_CODES.reduce((sum, c) => sum + (s.stCounts[c] || 0), 0);
      const sick = (s.stCounts["K"] || 0) + (s.stCounts["KK"] || 0);
      const requiredDays = (s.totalActive || 0) + (s.uncovered || 0);
      row.active += s.totalActive || 0;
      row.d += s.dutyD.length || 0;
      row.hg += s.dutyHG.length || 0;
      row.vac += vac;
      row.sick += sick;
      row.uncovered += s.uncovered || 0;
      row.required += requiredDays;
      perEmp.set(emp, row);
      
      agg.active += s.totalActive || 0;
      agg.vac += vac;
      agg.sick += sick;
      agg.fza += s.stCounts["FZA"] || 0;
      agg.wb += s.stCounts["WB"] || 0;
      agg.d += s.dutyD.length || 0;
      agg.hg += s.dutyHG.length || 0;
      agg.uncovered += s.uncovered || 0;
      agg.required += requiredDays;
    });
  });
  
  const rows = [...perEmp.values()].filter((x) => x.active || x.d || x.hg || x.vac || x.sick || x.required);
  rows.sort((a, b) => (b.active - a.active) || (b.d + b.hg - (a.d + a.hg)));
  const topRows = rows.slice(0, 8);
  const teamCoverage = agg.required > 0 ? Math.round((agg.active / agg.required) * 100) : 0;
  const busiest = rows[0]?.emp || "—";
  const dutyLeader = rows.slice().sort((a, b) => (b.d + b.hg) - (a.d + a.hg))[0]?.emp || "—";
  
  teamPanelEl.innerHTML = `
    <div class="empdash-team-kpis">
      <article class="empdash-kpi"><div class="empdash-kpi-label">Zeitraum</div><div class="empdash-kpi-value" style="color:#0EA5E9">${rangeMonths.length} M</div><div class="empdash-kpi-sub">${MONTHS[rangeMonths[0].month]} ${rangeMonths[0].year} – ${MONTHS[rangeMonths.at(-1).month]} ${rangeMonths.at(-1).year}</div></article>
      <article class="empdash-kpi"><div class="empdash-kpi-label">Team-Abdeckung</div><div class="empdash-kpi-value" style="color:${teamCoverage >= 80 ? "#22C55E" : teamCoverage >= 60 ? "#F59E0B" : "#EF4444"}">${teamCoverage}%</div><div class="empdash-kpi-sub">${agg.active} aktiv / ${agg.required} erforderlich</div></article>
      <article class="empdash-kpi"><div class="empdash-kpi-label">Dienste D/HG</div><div class="empdash-kpi-value" style="color:#F97316">${agg.d}/${agg.hg}</div><div class="empdash-kpi-sub">Gesamt im Zeitraum</div></article>
      <article class="empdash-kpi"><div class="empdash-kpi-label">Ausfalltage</div><div class="empdash-kpi-value" style="color:#A855F7">${agg.vac + agg.sick + agg.fza + agg.wb}</div><div class="empdash-kpi-sub">U/K/FZA/WB kumuliert</div></article>
    </div>
    <div class="empdash-team-insights">
      <div class="empdash-team-note"><strong>Top Aktivität:</strong> ${busiest}</div>
      <div class="empdash-team-note"><strong>Dienst-Fokus:</strong> ${dutyLeader}</div>
      <div class="empdash-team-note"><strong>Offene Abdeckung:</strong> ${agg.uncovered} Tage</div>
    </div>
    <div class="dept-table-wrap">
      <table class="dept-table">
        <thead>
          <tr>
            <th class="dept-th-name">Mitarbeitende</th>
            <th class="dept-th">Aktiv</th>
            <th class="dept-th dept-th-d">D</th>
            <th class="dept-th dept-th-hg">HG</th>
            <th class="dept-th dept-th-vac">Urlaub</th>
            <th class="dept-th dept-th-sick">Krank</th>
            <th class="dept-th dept-th-offen">Offen</th>
            <th class="dept-th">Abdeckung</th>
          </tr>
        </thead>
        <tbody>
          ${topRows.map((row) => {
            const cov = row.required > 0 ? Math.round((row.active / row.required) * 100) : 0;
            const covCls = cov >= 80 ? "dept-cov-good" : cov >= 60 ? "dept-cov-mid" : "dept-cov-low";
            return `
            <tr class="dept-tr" data-team-emp="${row.emp}">
              <td class="dept-td-name"><span class="dept-emp-name">${row.emp}</span></td>
              <td class="dept-td dept-td-num">${row.active || "—"}</td>
              <td class="dept-td dept-td-num dept-duty-d">${row.d || "—"}</td>
              <td class="dept-td dept-td-num dept-duty-hg">${row.hg || "—"}</td>
              <td class="dept-td dept-td-num dept-vac">${row.vac || "—"}</td>
              <td class="dept-td dept-td-num dept-sick">${row.sick || "—"}</td>
              <td class="dept-td dept-td-num dept-offen">${row.uncovered || "—"}</td>
              <td class="dept-td dept-td-num ${covCls}">${cov}%</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
  
  teamPanelEl.querySelectorAll("[data-team-emp]").forEach((row) => {
    row.addEventListener("click", () => {
      state.employeeDashboard.selectedEmp = row.dataset.teamEmp;
      renderEmployeeDashboard();
      const detailPanel = document.getElementById("emp-detail-panel");
      detailPanel?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

export function renderRoleFilters(employees) {
  const el = document.getElementById("emp-role-filters");
  if (!el) return;
  
  const buckets = getRoleFilterBuckets(state.year, employees);
  const defs = [
    ["ALL", "Alle"], 
    ["CA", "Chefärzte"], 
    ["OA", "Oberärzte"], 
    ["FA", "Fachärzte"], 
    ["AA", "Assistenz"], 
    ["OHNE", "Ohne Profil"]
  ];
  
  el.innerHTML = defs.map(([code, label]) => {
    const isActive = state.employeeDashboard.role === code;
    return `
      <button type="button" class="empdash-filter-btn${isActive ? " active" : ""}" data-role="${code}">
        ${label}<span>${buckets[code] || 0}</span>
      </button>
    `;
  }).join("");
  
  el.querySelectorAll("[data-role]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.employeeDashboard.role = btn.dataset.role;
      renderEmployeeDashboard();
    });
  });
}

const _detailCharts = {};
function _destroyDetailChart(id) {
  if (_detailCharts[id]) { _detailCharts[id].destroy(); delete _detailCharts[id]; }
}

export function renderEmployeeDetailDashboard(emp, year) {
  const detailEl = document.getElementById("emp-detail-panel");
  if (!detailEl) return;

  const meta = getEmpMeta(emp);
  const pc = posColor(meta.position);
  const ys = buildYearlyStats(emp, year);
  const currentMonthData = getMonthData(state.year, state.month);

  document.querySelectorAll('.empdash-view-btn').forEach((btn) => {
    const active = btn.dataset.view === state.employeeDashboard.detailView;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });

  // Profile header shared across tabs
  const profileHead = `
    <div class="empdash-detail-profile">
      <div class="empdash-detail-profile-head">
        <span class="empdash-avatar lg" style="background:linear-gradient(135deg,${pc.border},${pc.fg})">${empInitials(emp)}</span>
        <div style="min-width:0;flex:1">
          <div class="empdash-detail-name">${meta.fullName !== emp ? meta.fullName : emp}</div>
          <div class="empdash-detail-meta">${meta.posLabel}${meta.type && meta.type !== "—" ? " · " + meta.type : ""}${meta.since ? " · seit " + meta.since : ""}</div>
          ${meta.area ? `<div class="empdash-detail-area">${meta.area}</div>` : ""}
        </div>
        <button type="button" class="empdash-open-profile mbtn mbtn-ghost" data-open-profile="${emp}" title="Vollständiges Profil öffnen" aria-label="Profil öffnen">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          Profil
        </button>
      </div>
    </div>
  `;

  // ===== MONTHS TAB =====
  if (state.employeeDashboard.detailView === 'months') {
    let html = profileHead + `
      <div class="empdash-month-table-wrap">
        <table class="empdash-month-table">
          <thead>
            <tr>
              <th>Monat</th>
              <th title="Aktive Arbeitstage">Aktiv</th>
              <th title="Urlaub (U/ZU/SU/§15c)" class="empdash-col-vac">Urlaub</th>
              <th title="Krank (K/KK)" class="empdash-col-sick">Krank</th>
              <th title="Freizeitausgleich">FZA</th>
              <th title="Weiterbildung">WB</th>
              <th title="Frei (F-Tage)">Frei</th>
              <th title="Bereitschaftsdienst" class="empdash-col-d">D</th>
              <th title="Hintergrunddienst" class="empdash-col-hg">HG</th>
              <th title="Abdeckung der erforderlichen Werktage">Abdeckung</th>
            </tr>
          </thead>
          <tbody>
    `;

    ys.months.forEach((mon) => {
      const vac = VACATION_CODES.reduce((sum, c) => sum + (mon.stCounts[c] || 0), 0);
      const sick = (mon.stCounts['K'] || 0) + (mon.stCounts['KK'] || 0);
      const fza = mon.stCounts['FZA'] || 0;
      const wb = mon.stCounts['WB'] || 0;
      const frei = mon.stCounts['F'] || 0;
      const reqWd = Math.max(0, mon.totalWorkdays - vac - sick - fza - wb - frei);
      const cov = reqWd > 0 ? Math.min(100, Math.round((mon.totalActive / reqWd) * 100)) : 0;
      const isCur = mon.m === state.month;
      const covCls = cov >= 80 ? 'good' : cov >= 60 ? 'mid' : 'low';
      const noData = !mon.hasData;

      html += `
        <tr class="${isCur ? 'is-current' : ''}${noData ? ' no-data' : ''}">
          <td class="empdash-month-lbl">
            <span class="${isCur ? 'empdash-cur-dot' : ''}">${MONTHS_SHORT[mon.m]}</span>
          </td>
          <td class="empdash-td-num">${noData ? '—' : (mon.totalActive || '—')}</td>
          <td class="empdash-td-num empdash-col-vac">${noData || !vac ? '—' : vac}</td>
          <td class="empdash-td-num empdash-col-sick">${noData || !sick ? '—' : sick}</td>
          <td class="empdash-td-num">${noData || !fza ? '—' : fza}</td>
          <td class="empdash-td-num">${noData || !wb ? '—' : wb}</td>
          <td class="empdash-td-num">${noData || !frei ? '—' : frei}</td>
          <td class="empdash-td-num empdash-col-d">${noData || !mon.dutyD ? '—' : mon.dutyD}</td>
          <td class="empdash-td-num empdash-col-hg">${noData || !mon.dutyHG ? '—' : mon.dutyHG}</td>
          <td class="empdash-td-cov">
            ${!noData && mon.totalWorkdays > 0
              ? `<div class="empdash-cov-cell">
                   <div class="empdash-cov-bar-bg"><div class="empdash-cov-bar-fill" style="width:${cov}%;background:${cov>=80?"#22C55E":cov>=60?"#F59E0B":"#EF4444"}"></div></div>
                   <span class="empdash-cov ${covCls}">${cov}%</span>
                 </div>`
              : '—'}
          </td>
        </tr>
      `;
    });

    const reqWdTotal = Math.max(0, ys.totals.totalWorkdays - ys.totals.vacationDays - ys.totals.sickDays - ys.totals.fzaDays - ys.totals.wbDays - ys.totals.freiDays);
    const totalCov = reqWdTotal > 0 ? Math.min(100, Math.round((ys.totals.totalActive / reqWdTotal) * 100)) : 0;
    const totalCovCls = totalCov >= 80 ? 'good' : totalCov >= 60 ? 'mid' : 'low';

    html += `
          </tbody>
          <tfoot>
            <tr>
              <td>Gesamt</td>
              <td class="empdash-td-num">${ys.totals.totalActive || '—'}</td>
              <td class="empdash-td-num empdash-col-vac">${ys.totals.vacationDays || '—'}</td>
              <td class="empdash-td-num empdash-col-sick">${ys.totals.sickDays || '—'}</td>
              <td class="empdash-td-num">${ys.totals.fzaDays || '—'}</td>
              <td class="empdash-td-num">${ys.totals.wbDays || '—'}</td>
              <td class="empdash-td-num">${ys.totals.freiDays || '—'}</td>
              <td class="empdash-td-num empdash-col-d">${ys.totals.dutyD || '—'}</td>
              <td class="empdash-td-num empdash-col-hg">${ys.totals.dutyHG || '—'}</td>
              <td class="empdash-td-cov">${reqWdTotal ? `<span class="empdash-cov ${totalCovCls}">${totalCov}%</span>` : '—'}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;
    detailEl.innerHTML = html;
    detailEl.querySelector('[data-open-profile]')?.addEventListener('click', () => openProfileModal(emp));
    return;
  }

  // ===== CALENDAR TAB =====
  if (state.employeeDashboard.detailView === 'calendar') {
    const cards = ys.months.map((mon) => {
      const vac = VACATION_CODES.reduce((sum, c) => sum + (mon.stCounts[c] || 0), 0);
      const sick = (mon.stCounts['K'] || 0) + (mon.stCounts['KK'] || 0);
      const fza = mon.stCounts['FZA'] || 0;
      const wb = mon.stCounts['WB'] || 0;
      const frei = mon.stCounts['F'] || 0;
      const reqWd = Math.max(0, mon.totalWorkdays - vac - sick - fza - wb - frei);
      const cov = reqWd > 0 ? Math.min(100, Math.round((mon.totalActive / reqWd) * 100)) : 0;
      const isActive = mon.m === state.month;
      const covColor = cov >= 80 ? "#22C55E" : cov >= 60 ? "#F59E0B" : "#EF4444";

      const wpItems = Object.entries(mon.wpCounts)
        .filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 3)
        .map(([code, val]) => {
          const wm = CODE_MAP[code];
          return `<span class="empdash-mini-chip" style="background:${wm?.bg||"#F1F5F9"};color:${wm?.fg||"#475569"}">${code} <strong>${val}</strong></span>`;
        });

      const abItems = [];
      if (mon.dutyD) abItems.push(`<span class="empdash-mini-chip duty">D <strong>${mon.dutyD}</strong></span>`);
      if (mon.dutyHG) abItems.push(`<span class="empdash-mini-chip hg">HG <strong>${mon.dutyHG}</strong></span>`);
      if (vac) abItems.push(`<span class="empdash-mini-chip vac">U <strong>${vac}</strong></span>`);
      if (sick) abItems.push(`<span class="empdash-mini-chip sick">K <strong>${sick}</strong></span>`);
      if (fza) abItems.push(`<span class="empdash-mini-chip fza">FZA <strong>${fza}</strong></span>`);
      if (wb) abItems.push(`<span class="empdash-mini-chip wb">WB <strong>${wb}</strong></span>`);

      return `
        <article class="empdash-mini-month${isActive ? ' active' : ''}${!mon.hasData ? ' no-data' : ''}">
          <header>
            <strong>${MONTHS[mon.m]}</strong>
            <span class="empdash-mini-wt">${mon.totalWorkdays > 0 ? mon.totalWorkdays + " WT" : "—"}</span>
          </header>
          ${mon.hasData ? `
            <div class="empdash-mini-body">
              ${wpItems.join('') || ''}
              ${abItems.join('') || ''}
              ${!wpItems.length && !abItems.length ? '<span class="empdash-mini-empty">Keine Einträge</span>' : ''}
            </div>
            <footer>
              <div class="empdash-mini-cov-bar">
                <div style="width:${cov}%;background:${covColor};height:100%;border-radius:3px;transition:width .4s"></div>
              </div>
              <span style="color:${covColor};font-weight:700;font-size:11px">${mon.totalWorkdays > 0 ? cov + "%" : "—"}</span>
            </footer>
          ` : `<div class="empdash-mini-body"><span class="empdash-mini-empty">Kein Eintrag</span></div><footer>—</footer>`}
        </article>
      `;
    }).join('');

    detailEl.innerHTML = profileHead + `<div class="empdash-mini-grid">${cards}</div>`;
    detailEl.querySelector('[data-open-profile]')?.addEventListener('click', () => openProfileModal(emp));
    return;
  }

  // ===== ANALYSE TAB =====
  if (state.employeeDashboard.detailView === 'analyse') {
    _destroyDetailChart('bar'); _destroyDetailChart('pie');

    const totalAbsences = ys.totals.vacationDays + ys.totals.sickDays + ys.totals.fzaDays + ys.totals.wbDays + ys.totals.freiDays;
    const totalDuties = ys.totals.dutyD + ys.totals.dutyHG;
    const reqWdTotal = Math.max(0, ys.totals.totalWorkdays - totalAbsences);
    const totalCov = reqWdTotal > 0 ? Math.min(100, Math.round((ys.totals.totalActive / reqWdTotal) * 100)) : 0;
    const covColor = totalCov >= 80 ? "#22C55E" : totalCov >= 60 ? "#F59E0B" : "#EF4444";

    const topWP = Object.entries(ys.totals.wpCounts || {}).sort((a, b) => b[1] - a[1]);
    const totalWPDays = topWP.reduce((s2, [, v]) => s2 + v, 0);

    detailEl.innerHTML = profileHead + `
      <div class="empdash-analyse-grid">
        <div class="empdash-analyse-kpis">
          <div class="empdash-akpi" style="--c:#1D4ED8">
            <div class="empdash-akpi-val">${ys.totals.totalActive}</div>
            <div class="empdash-akpi-lbl">Aktive Tage</div>
          </div>
          <div class="empdash-akpi" style="--c:${covColor}">
            <div class="empdash-akpi-val">${totalCov}%</div>
            <div class="empdash-akpi-lbl">Abdeckung</div>
          </div>
          <div class="empdash-akpi" style="--c:#EF4444">
            <div class="empdash-akpi-val">${totalDuties}</div>
            <div class="empdash-akpi-lbl">Dienste gesamt</div>
          </div>
          <div class="empdash-akpi" style="--c:#7C3AED">
            <div class="empdash-akpi-val">${totalAbsences}</div>
            <div class="empdash-akpi-lbl">Abwesenheiten</div>
          </div>
        </div>

        <div class="empdash-analyse-charts">
          <div class="empdash-chart-card">
            <div class="empdash-chart-title">Monatsverlauf Aktivität</div>
            <div class="empdash-chart-body" style="position:relative;height:160px">
              <canvas id="empdash-bar-canvas" aria-hidden="true"></canvas>
            </div>
          </div>
          <div class="empdash-chart-card">
            <div class="empdash-chart-title">Arbeitsplatz-Verteilung (Jahr)</div>
            <div class="empdash-chart-body empdash-chart-pie-wrap">
              ${topWP.length ? `<canvas id="empdash-pie-canvas" aria-hidden="true"></canvas>
              <div class="empdash-pie-legend">
                ${topWP.slice(0, 5).map(([code, cnt]) => {
                  const wm = CODE_MAP[code];
                  const pct = totalWPDays > 0 ? Math.round((cnt / totalWPDays) * 100) : 0;
                  return `<div class="empdash-pie-leg-item">
                    <span class="empdash-pie-leg-dot" style="background:${wm?.fg||"#94A3B8"}"></span>
                    <span class="empdash-pie-leg-code" style="background:${wm?.bg||"#F1F5F9"};color:${wm?.fg||"#475569"}">${code}</span>
                    <span class="empdash-pie-leg-num">${cnt}d · ${pct}%</span>
                  </div>`;
                }).join('')}
              </div>` : '<div class="empdash-mini-empty" style="padding:24px">Keine Arbeitsplatzdaten</div>'}
            </div>
          </div>
        </div>

        <div class="empdash-analyse-breakdown">
          <div class="empdash-breakdown-card">
            <div class="empdash-chart-title">Dienst-Verhältnis</div>
            ${totalDuties > 0 ? `
              <div class="empdash-duty-ratio">
                <div class="empdash-duty-bar">
                  <div style="width:${Math.round((ys.totals.dutyD/totalDuties)*100)}%;background:#EF4444" title="D-Dienste"></div>
                  <div style="width:${Math.round((ys.totals.dutyHG/totalDuties)*100)}%;background:#0EA5E9" title="HG-Dienste"></div>
                </div>
                <div class="empdash-duty-ratio-labels">
                  <span style="color:#EF4444">D: ${ys.totals.dutyD} (${Math.round((ys.totals.dutyD/totalDuties)*100)}%)</span>
                  <span style="color:#0EA5E9">HG: ${ys.totals.dutyHG} (${Math.round((ys.totals.dutyHG/totalDuties)*100)}%)</span>
                </div>
              </div>
            ` : '<p class="empdash-mini-empty">Keine Dienste eingetragen</p>'}
          </div>
          <div class="empdash-breakdown-card">
            <div class="empdash-chart-title">Abwesenheits-Aufschlüsselung</div>
            <div class="empdash-abs-list">
              ${[
                { lbl: "Urlaub", val: ys.totals.vacationDays, color: "#7C3AED" },
                { lbl: "Krank (K+KK)", val: ys.totals.sickDays, color: "#DC2626" },
                { lbl: "FZA", val: ys.totals.fzaDays, color: "#3730A3" },
                { lbl: "Weiterbildung", val: ys.totals.wbDays, color: "#78350F" },
                { lbl: "Frei (F)", val: ys.totals.freiDays, color: "#64748B" },
              ].filter(x => x.val > 0).map(x => `
                <div class="empdash-abs-row">
                  <span class="empdash-abs-dot" style="background:${x.color}"></span>
                  <span class="empdash-abs-lbl">${x.lbl}</span>
                  <div class="empdash-abs-bar-bg">
                    <div style="width:${totalAbsences>0?Math.round((x.val/totalAbsences)*100):0}%;background:${x.color};height:100%;border-radius:3px"></div>
                  </div>
                  <span class="empdash-abs-val">${x.val}d</span>
                </div>
              `).join('') || '<p class="empdash-mini-empty">Keine Abwesenheiten</p>'}
            </div>
          </div>
        </div>
      </div>
    `;

    detailEl.querySelector('[data-open-profile]')?.addEventListener('click', () => openProfileModal(emp));

    // Render bar chart
    const barCanvas = document.getElementById('empdash-bar-canvas');
    if (barCanvas && typeof Chart !== 'undefined') {
      _detailCharts['bar'] = new Chart(barCanvas, {
        type: 'bar',
        data: {
          labels: ys.months.map(mon => MONTHS_SHORT[mon.m]),
          datasets: [
            {
              label: 'Aktiv',
              data: ys.months.map(mon => mon.hasData ? mon.totalActive : null),
              backgroundColor: ys.months.map(mon => mon.m === state.month ? 'rgba(14,165,233,0.85)' : 'rgba(14,165,233,0.35)'),
              borderRadius: 3,
              borderSkipped: false,
            },
            {
              label: 'D+HG',
              data: ys.months.map(mon => mon.hasData ? mon.dutyD + mon.dutyHG : null),
              type: 'line',
              borderColor: '#EF4444',
              backgroundColor: 'rgba(239,68,68,0.1)',
              pointRadius: 3,
              tension: 0.3,
              fill: false,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'top', align: 'end', labels: { font: { size: 10 }, boxWidth: 10, padding: 8, usePointStyle: true } },
            tooltip: { callbacks: { label: (ctx) => ctx.raw !== null ? ` ${ctx.dataset.label}: ${ctx.raw}` : null } },
          },
          scales: {
            x: { grid: { display: false }, ticks: { font: { size: 9 } } },
            y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 9 }, stepSize: 2 } },
          },
          animation: { duration: 350 },
        },
      });
    }

    // Render pie chart
    const pieCanvas = document.getElementById('empdash-pie-canvas');
    if (pieCanvas && topWP.length && typeof Chart !== 'undefined') {
      _detailCharts['pie'] = new Chart(pieCanvas, {
        type: 'doughnut',
        data: {
          labels: topWP.map(([c]) => CODE_MAP[c]?.label || c),
          datasets: [{
            data: topWP.map(([, v]) => v),
            backgroundColor: topWP.map(([c]) => CODE_MAP[c]?.fg || '#94A3B8'),
            borderWidth: 2,
            borderColor: '#fff',
            hoverOffset: 4,
          }],
        },
        options: {
          responsive: false,
          cutout: '60%',
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${ctx.raw}d (${totalWPDays>0?Math.round((ctx.raw/totalWPDays)*100):0}%)` } },
          },
          animation: { duration: 400 },
        },
      });
    }
    return;
  }
  
  const currentIncluded = currentMonthData.employees.includes(emp);
  
  const monthList = currentMonthData.employees.map((name) => {
    const metaItem = getEmpMeta(name);
    const pos = posColor(metaItem.position);
    return `
      <div class="emp-row">
        <div class="emp-row-left">
          <span class="emp-avatar" style="background:linear-gradient(135deg,${pos.border},${pos.fg})">${empInitials(name)}</span>
          <div class="emp-row-info">
            <span class="emp-row-name">${name}</span>
            <span class="emp-row-meta">${metaItem.posLabel}</span>
          </div>
        </div>
        <button type="button" class="emp-row-del" data-remove="${name}" aria-label="${name} entfernen">
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M1 1l9 9M10 1L1 10"/>
          </svg>
        </button>
      </div>
    `;
  }).join('') || `<div class="emp-none">Keine Mitarbeitenden im aktuellen Monat</div>`;
  
  detailEl.innerHTML = `
    <div class="empdash-admin-layout">
      <div class="empdash-admin-card">
        <div class="empdash-admin-title">Ausgewählte Person</div>
        <div class="empdash-admin-meta">
          <span class="empdash-pos" style="background:${pc.bg};color:${pc.fg}">${meta.position}</span>
          <span>${meta.posLabel}</span>
          <span>${meta.area || 'kein Bereich hinterlegt'}</span>
        </div>
        <div class="empdash-admin-actions">
          <button type="button" class="mbtn ${currentIncluded ? 'mbtn-ghost' : 'mbtn-primary'}" id="emp-toggle-current">
            ${currentIncluded ? 'Aus aktuellem Monat entfernen' : 'Zum aktuellen Monat hinzufügen'}
          </button>
        </div>
      </div>
      <div class="empdash-admin-card">
        <div class="empdash-admin-title">Monatsliste ${MONTHS[state.month]} ${state.year}</div>
        <div class="emp-list-inner" id="emp-list">${monthList}</div>
        <div class="emp-add-row">
          <input type="text" class="text-input" id="emp-input" placeholder="Name (z.B. Dr. Müller)…" autocomplete="off" spellcheck="false" maxlength="80" aria-label="Name des neuen Mitarbeiters eingeben">
          <button type="button" class="mbtn mbtn-primary" id="emp-add-btn">
            <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Hinzufügen
          </button>
        </div>
      </div>
    </div>
  `;
  
  detailEl.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', () => {
      import('./app.js').then(m => m.confirmRemoveEmployee(btn.dataset.remove, false));
    });
  });
  
  document.getElementById('emp-toggle-current')?.addEventListener('click', () => {
    if (currentIncluded) {
      removeEmployee(state.year, state.month, emp);
    } else {
      addEmployee(state.year, state.month, emp);
    }
    render();
    renderEmployeeDashboard();
  });
  
  document.getElementById('emp-add-btn')?.addEventListener('click', () => {
    const input = document.getElementById('emp-input');
    const name = input.value.trim();
    if (!name) return;
    addEmployee(state.year, state.month, name);
    input.value = '';
    state.employeeDashboard.selectedEmp = name;
    render();
    renderEmployeeDashboard();
    input.focus();
  });
  
  document.getElementById('emp-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      document.getElementById('emp-add-btn')?.click();
    }
  });
}

// Export the currently visible (filtered + sorted) employee year-metrics as a
// semicolon-separated CSV (Excel-/de-locale friendly), so the dashboard doubles
// as a reporting tool for staff- and planning oversight.
export function exportEmployeeDashboardCSV() {
  const { year: y } = state;
  const dash = state.employeeDashboard;
  const employees = getEmployeesForYear(y);
  if (!employees.length) return false;

  const metrics = employees.map((emp) => getEmployeeYearCardMetrics(emp, y));
  const query = dash.filter.trim().toLowerCase();
  let rows = metrics.filter((item) => {
    if (!matchRoleFilter(item.emp, dash.role)) return false;
    if (dash.activeOnly && item.activeMonths <= 0) return false;
    if (!query) return true;
    const hay = [item.emp, item.meta.fullName, item.meta.posLabel, item.meta.position, item.meta.area].join(" ").toLowerCase();
    return hay.includes(query);
  });

  const posRank = (p) => {
    const order = ["CA", "LOA", "OA", "OÄ", "FA", "FÄ", "AA", "AÄ"];
    const i = order.indexOf(p);
    return i === -1 ? order.length : i;
  };
  const sortKey = dash.sort || "name";
  rows.sort((a, b) => {
    switch (sortKey) {
      case "position": { const d = posRank(a.meta.position) - posRank(b.meta.position); return d !== 0 ? d : a.emp.localeCompare(b.emp, "de"); }
      case "duty": return (b.ys.totals.dutyD + b.ys.totals.dutyHG) - (a.ys.totals.dutyD + a.ys.totals.dutyHG);
      case "vacation": return (b.ys.totals.vacationDays || 0) - (a.ys.totals.vacationDays || 0);
      case "sick": return (b.ys.totals.sickDays || 0) - (a.ys.totals.sickDays || 0);
      case "active": return b.activeMonths - a.activeMonths;
      default: return a.emp.localeCompare(b.emp, "de");
    }
  });

  const esc = (v) => {
    const s = String(v ?? "");
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ["Kürzel", "Name", "Position", "Bereich", "Aktive Monate", "Dienste D", "Dienste HG", "Dienste gesamt", "Urlaubstage", "Kranktage", "FZA-Tage"];
  const lines = [header.join(";")];
  rows.forEach((item) => {
    const t = item.ys.totals;
    lines.push([
      item.emp, item.meta.fullName || "", item.meta.position || "", item.meta.area || "",
      item.activeMonths, t.dutyD, t.dutyHG, t.dutyD + t.dutyHG,
      t.vacationDays || 0, t.sickDays || 0, t.fzaDays || 0,
    ].map(esc).join(";"));
  });

  // BOM so Excel detects UTF-8 (umlauts in names render correctly).
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `radplan_mitarbeitende_${y}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return rows.length;
}
