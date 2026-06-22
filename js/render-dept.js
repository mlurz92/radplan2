import { MONTHS, VACATION_CODES, getEmpMeta, posColor, getSaxonyHolidaysCached, daysInMonth, isWorkday } from './constants.js';
import { state, deptTab } from './state.js';
import { getMonthData, buildProfileStats, buildYearlyStats, getEmployeesForYear } from './model.js';

export function renderDeptContent() {
  const { year: y, month: m } = state;
  if (deptTab === "month") {
    renderDeptMonth(y, m);
  } else {
    renderDeptYear(y);
  }
}

export function renderDeptMonth(y, m) {
  const body = document.getElementById("dept-body");
  if (!body) return;
  
  const hols = getSaxonyHolidaysCached(y);
  const md = getMonthData(y, m);
  const dim = daysInMonth(y, m);
  
  const deptHeadLine = document.getElementById("dept-context-line");
  if (deptHeadLine) {
    deptHeadLine.textContent = `${MONTHS[m]} ${y}`;
  }
  
  if (!md.employees.length) {
    body.innerHTML = `<div class="dept-empty"><p>Keine Daten</p></div>`;
    return;
  }
  
  let workdayCount = 0;
  let mrCov = 0;
  let ctCov = 0;
  let dCov = 0;
  let hgCov = 0;
  
  for (let d = 1; d <= dim; d++) {
    if (!isWorkday(y, m, d, hols)) continue;
    workdayCount++;
    
    let hasMR = false, hasCT = false, hasD = false, hasHG = false;
    
    md.employees.forEach((emp) => {
      const cell = md.assignments?.[emp]?.[d] || {};
      const assign = (cell.assignment || "").split("/").map((x) => x.trim());
      if (assign.includes("MR")) hasMR = true;
      if (assign.includes("CT")) hasCT = true;
      if (cell.duty === "D") hasD = true;
      if (cell.duty === "HG") hasHG = true;
    });
    
    if (hasMR) mrCov++;
    if (hasCT) ctCov++;
    if (hasD) dCov++;
    if (hasHG) hgCov++;
  }
  
  const pct = (v) => workdayCount > 0 ? Math.round((v / workdayCount) * 100) : 0;
  
  const covItems = [
    { label: "MR", val: mrCov, pct: pct(mrCov), color: "#1D4ED8", bg: "#DBEAFE" },
    { label: "CT", val: ctCov, pct: pct(ctCov), color: "#C2410C", bg: "#FFEDD5" },
    { label: "D", val: dCov, pct: pct(dCov), color: "#EF4444", bg: "#FEE2E2" },
    { label: "HG", val: hgCov, pct: pct(hgCov), color: "#0EA5E9", bg: "#E0F2FE" },
  ];
  
  let stripHtml = `
    <div class="dept-cov-strip">
      <div class="dept-cov-meta">
        <span class="dept-cov-meta-val">${workdayCount}</span>
        <span class="dept-cov-meta-lbl">Werktage</span>
      </div>
      <div class="dept-cov-meta">
        <span class="dept-cov-meta-val">${md.employees.length}</span>
        <span class="dept-cov-meta-lbl">Mitarbeitende</span>
      </div>
      <div class="dept-cov-bars">
  `;
  
  covItems.forEach((item) => {
    stripHtml += `
      <div class="dept-cov-bar-item">
        <div class="dept-cov-bar-head">
          <span class="dept-cov-code" style="background:${item.bg};color:${item.color}">${item.label}</span>
          <span class="dept-cov-fraction">${item.val}/${workdayCount}</span>
          <span class="dept-cov-pct" style="color:${item.pct >= 80 ? item.color : "#94A3B8"}">${item.pct}%</span>
        </div>
        <div class="dept-cov-bar-bg">
          <div class="dept-cov-bar-fill" style="width:${item.pct}%;background:${item.color}"></div>
        </div>
      </div>
    `;
  });
  
  stripHtml += `</div></div>`;
  
  const empStats = md.employees.map((emp) => {
    const s = buildProfileStats(y, m, emp);
    const meta = getEmpMeta(emp);
    const pc = posColor(meta.position);
    const vac = VACATION_CODES.reduce((sum, c) => sum + (s.stCounts[c] || 0), 0);
    const sick = (s.stCounts["K"] || 0) + (s.stCounts["KK"] || 0);
    const fza = s.stCounts["FZA"] || 0;
    const frei = s.stCounts["F"] || 0;
    return { emp, s, meta, pc, vac, sick, fza, frei };
  });
  
  const team = empStats.reduce((acc, { s, vac, sick, fza, frei }) => {
    acc.wp += s.totalActive;
    acc.vac += vac;
    acc.sick += sick;
    acc.fza += fza;
    acc.d += s.dutyD.length;
    acc.hg += s.dutyHG.length;
    acc.frei += frei;
    acc.offen += s.uncovered;
    return acc;
  }, { wp: 0, vac: 0, sick: 0, fza: 0, d: 0, hg: 0, frei: 0, offen: 0 });
  
  let rowsHtml = "";
  empStats.forEach(({ emp, s, meta, pc, vac, sick, fza, frei }) => {
    rowsHtml += `
      <tr class="dept-tr">
        <td class="dept-td-name" style="border-left:3px solid ${pc.border}">
          <span class="dept-emp-name">${emp}</span>
          ${meta.position !== "—" ? `<span class="dept-pos-badge" style="background:${pc.bg};color:${pc.fg}">${meta.position}</span>` : ""}
        </td>
        <td class="dept-td dept-td-num">${s.totalActive || "—"}</td>
        <td class="dept-td dept-td-num">${s.wpCounts["MR"] || ""}</td>
        <td class="dept-td dept-td-num">${s.wpCounts["CT"] || ""}</td>
        <td class="dept-td dept-td-num dept-vac">${vac || ""}</td>
        <td class="dept-td dept-td-num dept-sick">${sick || ""}</td>
        <td class="dept-td dept-td-num">${fza || ""}</td>
        <td class="dept-td dept-td-num dept-duty-d">${s.dutyD.length || ""}</td>
        <td class="dept-td dept-td-num dept-duty-hg">${s.dutyHG.length || ""}</td>
        <td class="dept-td dept-td-num dept-frei">${frei || ""}</td>
        <td class="dept-td dept-td-num ${s.uncovered > 0 ? "dept-offen" : ""}">${s.uncovered || ""}</td>
      </tr>
    `;
  });
  
  const tableHtml = `
    <div class="dept-table-wrap">
      <table class="dept-table">
        <thead>
          <tr>
            <th class="dept-th-name">Mitarbeitende</th>
            <th class="dept-th">Aktiv</th>
            <th class="dept-th">MR</th>
            <th class="dept-th">CT</th>
            <th class="dept-th dept-th-vac">Urlaub</th>
            <th class="dept-th dept-th-sick">Krank</th>
            <th class="dept-th">FZA</th>
            <th class="dept-th dept-th-d">D</th>
            <th class="dept-th dept-th-hg">HG</th>
            <th class="dept-th">Frei</th>
            <th class="dept-th dept-th-offen">Offen</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
        <tfoot>
          <tr class="dept-total-row">
            <td class="dept-td-name dept-total-lbl">Gesamt&ensp;(${md.employees.length}&thinsp;MA)</td>
            <td class="dept-td dept-td-num dept-total">${team.wp || "—"}</td>
            <td class="dept-td dept-td-num dept-total" colspan="2"></td>
            <td class="dept-td dept-td-num dept-total dept-vac">${team.vac || "—"}</td>
            <td class="dept-td dept-td-num dept-total dept-sick">${team.sick || "—"}</td>
            <td class="dept-td dept-td-num dept-total">${team.fza || "—"}</td>
            <td class="dept-td dept-td-num dept-total dept-duty-d">${team.d || "—"}</td>
            <td class="dept-td dept-td-num dept-total dept-duty-hg">${team.hg || "—"}</td>
            <td class="dept-td dept-td-num dept-total dept-frei">${team.frei || "—"}</td>
            <td class="dept-td dept-td-num dept-total ${team.offen > 0 ? "dept-offen" : ""}">${team.offen || "—"}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;
  
  body.innerHTML = stripHtml + tableHtml;
}

export function renderDeptYear(year) {
  const body = document.getElementById("dept-body");
  if (!body) return;
  
  const deptHeadLine = document.getElementById("dept-context-line");
  if (deptHeadLine) {
    deptHeadLine.textContent = `Jahresübersicht ${year}`;
  }
  
  const allEmpsList = getEmployeesForYear(year);
  
  if (!allEmpsList.length) {
    body.innerHTML = `<div class="dept-empty"><p>Keine Daten für ${year}</p></div>`;
    return;
  }
  
  const empYS = allEmpsList.map((emp) => {
    return { 
      emp, 
      ys: buildYearlyStats(emp, year), 
      meta: getEmpMeta(emp) 
    };
  }).filter(({ ys }) => {
    return ys.totals.totalWorkdays > 0 || ys.totals.dutyD > 0 || ys.totals.dutyHG > 0;
  });
  
  if (!empYS.length) {
    body.innerHTML = `<div class="dept-empty"><p>Keine Daten</p></div>`;
    return;
  }
  
  const team = empYS.reduce((acc, { ys }) => {
    acc.wd += ys.totals.totalWorkdays;
    acc.cov += ys.totals.coveredWorkdays;
    acc.wp += ys.totals.totalActive;
    acc.vac += ys.totals.vacationDays;
    acc.sick += ys.totals.sickDays;
    acc.fza += ys.totals.fzaDays;
    acc.wb += ys.totals.wbDays;
    acc.d += ys.totals.dutyD;
    acc.hg += ys.totals.dutyHG;
    return acc;
  }, { wd: 0, cov: 0, wp: 0, vac: 0, sick: 0, fza: 0, wb: 0, d: 0, hg: 0 });
  
  const teamCovPct = team.wd > 0 ? Math.round((team.cov / team.wd) * 100) : 0;
  
  const stripHtml = `
    <div class="dept-yr-strip">
      <div class="dept-yr-kpi">
        <span class="dept-yr-kpi-val">${empYS.length}</span>
        <span class="dept-yr-kpi-lbl">Mitarbeitende</span>
      </div>
      <div class="dept-yr-kpi">
        <span class="dept-yr-kpi-val" style="color:#1D4ED8">${team.wp}</span>
        <span class="dept-yr-kpi-lbl">Aktiv-Tage</span>
      </div>
      <div class="dept-yr-kpi">
        <span class="dept-yr-kpi-val" style="color:#5B21B6">${team.vac}</span>
        <span class="dept-yr-kpi-lbl">Urlaub</span>
      </div>
      <div class="dept-yr-kpi">
        <span class="dept-yr-kpi-val" style="color:#991B1B">${team.sick}</span>
        <span class="dept-yr-kpi-lbl">Krank</span>
      </div>
      <div class="dept-yr-kpi">
        <span class="dept-yr-kpi-val">
          <span style="color:#EF4444">${team.d}</span>&thinsp;/&thinsp;<span style="color:#0EA5E9">${team.hg}</span>
        </span>
        <span class="dept-yr-kpi-lbl">D/HG</span>
      </div>
      <div class="dept-yr-kpi">
        <span class="dept-yr-kpi-val" style="color:${teamCovPct >= 80 ? "#15803D" : teamCovPct >= 60 ? "#854D0E" : "#991B1B"}">${teamCovPct}%</span>
        <span class="dept-yr-kpi-lbl">Abdeckung</span>
      </div>
    </div>
  `;
  
  let rowsHtml = "";
  empYS.forEach(({ emp, ys, meta }) => {
    const t = ys.totals;
    const pc = posColor(meta.position);
    
    const requiredWorkdays = Math.max(0, t.totalWorkdays - t.vacationDays - t.sickDays - t.fzaDays - t.wbDays - t.freiDays);
    const cov = requiredWorkdays > 0 ? Math.min(100, Math.round((t.totalActive / requiredWorkdays) * 100)) : 0;
    const covCls = cov >= 80 ? "dept-cov-good" : cov >= 60 ? "dept-cov-mid" : cov > 0 ? "dept-cov-low" : "";
    
    rowsHtml += `
      <tr class="dept-tr">
        <td class="dept-td-name" style="border-left:3px solid ${pc.border}">
          <span class="dept-emp-name">${emp}</span>
          ${meta.position !== "—" ? `<span class="dept-pos-badge" style="background:${pc.bg};color:${pc.fg}">${meta.position}</span>` : ""}
        </td>
        <td class="dept-td dept-td-num">${t.totalActive || "—"}</td>
        <td class="dept-td dept-td-num dept-vac">${t.vacationDays || "—"}</td>
        <td class="dept-td dept-td-num dept-sick">${t.sickDays || "—"}</td>
        <td class="dept-td dept-td-num">${t.fzaDays || "—"}</td>
        <td class="dept-td dept-td-num">${t.wbDays || "—"}</td>
        <td class="dept-td dept-td-num dept-duty-d">${t.dutyD || "—"}</td>
        <td class="dept-td dept-td-num dept-duty-hg">${t.dutyHG || "—"}</td>
        <td class="dept-td dept-td-num ${covCls}">${t.totalWorkdays > 0 ? cov + "%" : "—"}</td>
      </tr>
    `;
  });
  
  const tableHtml = `
    <div class="dept-table-wrap">
      <table class="dept-table">
        <thead>
          <tr>
            <th class="dept-th-name">Mitarbeitende</th>
            <th class="dept-th">Aktiv-Tage</th>
            <th class="dept-th dept-th-vac">Urlaub</th>
            <th class="dept-th dept-th-sick">Krank</th>
            <th class="dept-th">FZA</th>
            <th class="dept-th">WB</th>
            <th class="dept-th dept-th-d">D</th>
            <th class="dept-th dept-th-hg">HG</th>
            <th class="dept-th">Abdeckung</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
        <tfoot>
          <tr class="dept-total-row">
            <td class="dept-td-name dept-total-lbl">Gesamt&ensp;(${empYS.length}&thinsp;MA)</td>
            <td class="dept-td dept-td-num dept-total">${team.wp || "—"}</td>
            <td class="dept-td dept-td-num dept-total dept-vac">${team.vac || "—"}</td>
            <td class="dept-td dept-td-num dept-total dept-sick">${team.sick || "—"}</td>
            <td class="dept-td dept-td-num dept-total">${team.fza || "—"}</td>
            <td class="dept-td dept-td-num dept-total">${team.wb || "—"}</td>
            <td class="dept-td dept-td-num dept-total dept-duty-d">${team.d || "—"}</td>
            <td class="dept-td dept-td-num dept-total dept-duty-hg">${team.hg || "—"}</td>
            <td class="dept-td dept-td-num dept-total ${teamCovPct >= 80 ? "dept-cov-good" : teamCovPct >= 60 ? "dept-cov-mid" : "dept-cov-low"}">${teamCovPct}%</td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;
  
  body.innerHTML = stripHtml + tableHtml;
}

