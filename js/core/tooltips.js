import { state, planMode } from '../state.js';
import { MONTHS, DOW_LONG, daysInMonth, weekday, isHoliday, isWeekend, isTodayCol, TOD_Y, TOD_M, TOD_D, CODE_MAP, WORKPLACES, STATUSES, getEmpMeta, posColor } from '../constants.js';
import { getMonthData, getCell, getComment } from '../model.js';

const TOOLTIP_STORAGE_KEY = "radplan_v3_tooltips_enabled";
let tooltipsEnabled = true;
let activeTooltip = null;

export function initTooltips() {
  try {
    const stored = localStorage.getItem(TOOLTIP_STORAGE_KEY);
    tooltipsEnabled = stored !== "false";
  } catch (e) {
    tooltipsEnabled = true;
  }
  
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && activeTooltip) {
      hideTooltip();
    }
  });
  
  document.addEventListener("click", (e) => {
    if (activeTooltip && !activeTooltip.contains(e.target)) {
      hideTooltip();
    }
  });
}

export function setTooltipsEnabled(enabled) {
  tooltipsEnabled = enabled;
  try {
    localStorage.setItem(TOOLTIP_STORAGE_KEY, String(enabled));
  } catch (e) {}
  if (!enabled && activeTooltip) {
    hideTooltip();
  }
}

export function isTooltipsEnabled() {
  return tooltipsEnabled;
}

function formatDate(y, m, d) {
  return `${d}. ${MONTHS[m]} ${y}`;
}

function getDutyHistory(y, m, emp, day) {
  const history = [];
  const cell = getCell(y, m, emp, day);
  
  if (cell.assignment) {
    const codes = cell.assignment.split("/").map(x => x.trim());
    codes.forEach(code => {
      const meta = CODE_MAP[code];
      if (meta) {
        history.push({
          type: "assignment",
          code: code,
          label: meta.label,
          color: meta.fg,
          bg: meta.bg
        });
      }
    });
  }
  
  if (cell.duty) {
    const dutyLabel = cell.duty === "D" ? "Bereitschaftsdienst" : "Hintergrunddienst";
    const dutyColor = cell.duty === "D" ? "#EF4444" : "#0EA5E9";
    const dutyBg = cell.duty === "D" ? "#FEE2E2" : "#E0F2FE";
    history.push({
      type: "duty",
      code: cell.duty,
      label: dutyLabel,
      color: "#fff",
      bg: dutyColor
    });
  }
  
  return history;
}

function getConflictInfo(y, m, emp, day) {
  const conflicts = [];
  const cell = getCell(y, m, emp, day);
  
  if (cell.duty === "D") {
    const nextDay = getNextDay(y, m, day);
    const nextCell = getCell(nextDay.y, nextDay.m, emp, nextDay.d);
    if (nextCell.assignment && ["U", "ZU", "SU", "§15c"].includes(nextCell.assignment.split("/")[0])) {
      conflicts.push("Folgetag ist Urlaub — BD am Vortag ungewöhnlich");
    }
  }
  
  const prevDay = getPrevDay(y, m, day);
  const prevCell = getCell(prevDay.y, prevDay.m, emp, prevDay.d);
  if (cell.duty === "D" && prevCell.duty === "D") {
    conflicts.push("Aufeinanderfolgende BD-Tage");
  }
  
  return conflicts;
}

function getNextDay(y, m, d) {
  const dim = daysInMonth(y, m);
  if (d < dim) return { y, m, d: d + 1 };
  if (m < 11) return { y, m: m + 1, d: 1 };
  return { y: y + 1, m: 0, d: 1 };
}

function getPrevDay(y, m, d) {
  if (d > 1) return { y, m, d: d - 1 };
  if (m > 0) return { y, m: m - 1, d: daysInMonth(y, m - 1) };
  return { y: y - 1, m: 11, d: daysInMonth(y - 1, 11) };
}

function getMonthSummary(y, m, emp) {
  const md = getMonthData(y, m);
  const dim = daysInMonth(y, m);
  let workdays = 0;
  let duties = 0;
  let hgDuties = 0;
  let vacDays = 0;
  let sickDays = 0;
  
  for (let d = 1; d <= dim; d++) {
    const cell = md.assignments?.[emp]?.[d] || {};
    const wd = weekday(y, m, d);
    const isWe = wd === 0 || wd === 6;
    const hol = isHoliday(y, m, d, []);
    
    if (!isWe && !hol && !cell.assignment && !cell.duty) continue;
    if (cell.assignment && !["U", "ZU", "SU", "§15c", "K", "KK"].includes(cell.assignment.split("/")[0])) {
      workdays++;
    }
    if (cell.duty === "D") duties++;
    if (cell.duty === "HG") hgDuties++;
    if (["U", "ZU", "SU", "§15c"].includes(cell.assignment)) vacDays++;
    if (cell.assignment === "K" || cell.assignment === "KK") sickDays++;
  }
  
  return { workdays, duties, hgDuties, vacDays, sickDays };
}

export function showCellTooltip(emp, day, x, y, rect) {
  if (!tooltipsEnabled) return;
  hideTooltip();
  
  const { year: y2, month: m2 } = state;
  const meta = getEmpMeta(emp);
  const cell = getCell(y2, m2, emp, day);
  const comment = getComment(y2, m2, emp, day);
  const hols = [];
  const wd = weekday(y2, m2, day);
  const isHol = isHoliday(y2, m2, day, hols);
  const isWe = isWeekend(y2, m2, day);
  const isToday = isTodayCol(y2, m2, day, TOD_Y, TOD_M, TOD_D);
  
  const dutyHistory = getDutyHistory(y2, m2, emp, day);
  const conflicts = getConflictInfo(y2, m2, emp, day);
  const monthSummary = getMonthSummary(y2, m2, emp);
  
  let html = `
    <div class="tooltip-header">
      <span class="tooltip-emp">${emp}</span>
      <span class="tooltip-date">${DOW_LONG[wd]}, ${formatDate(y2, m2, day)}</span>
    </div>
  `;
  
  if (isToday) {
    html += `<div class="tooltip-badge tooltip-badge-today">Heute</div>`;
  } else if (isHol) {
    html += `<div class="tooltip-badge tooltip-badge-hol">Feiertag</div>`;
  } else if (isWe) {
    html += `<div class="tooltip-badge tooltip-badge-we">Wochenende</div>`;
  }
  
  if (dutyHistory.length > 0) {
    html += `<div class="tooltip-section">
      <div class="tooltip-section-title">Aktuelle Zuweisung</div>
      <div class="tooltip-badges">
        ${dutyHistory.map(h => `
          <span class="tooltip-badge" style="background:${h.bg};color:${h.color}">${h.code} · ${h.label}</span>
        `).join("")}
      </div>
    </div>`;
  }
  
  if (comment) {
    html += `<div class="tooltip-section">
      <div class="tooltip-section-title">Notiz</div>
      <div class="tooltip-comment">${escapeHtml(comment)}</div>
    </div>`;
  }
  
  if (conflicts.length > 0) {
    html += `<div class="tooltip-section tooltip-section-warn">
      <div class="tooltip-section-title">⚠ Hinweise</div>
      <ul class="tooltip-conflicts">
        ${conflicts.map(c => `<li>${escapeHtml(c)}</li>`).join("")}
      </ul>
    </div>`;
  }
  
  html += `
    <div class="tooltip-section">
      <div class="tooltip-section-title">Monatsübersicht</div>
      <div class="tooltip-stats">
        <div class="tooltip-stat">
          <span class="tooltip-stat-val" style="color:#1D4ED8">${monthSummary.workdays}</span>
          <span class="tooltip-stat-lbl">Arbeitstage</span>
        </div>
        <div class="tooltip-stat">
          <span class="tooltip-stat-val" style="color:#EF4444">${monthSummary.duties}</span>
          <span class="tooltip-stat-lbl">BD</span>
        </div>
        <div class="tooltip-stat">
          <span class="tooltip-stat-val" style="color:#0EA5E9">${monthSummary.hgDuties}</span>
          <span class="tooltip-stat-lbl">HG</span>
        </div>
        <div class="tooltip-stat">
          <span class="tooltip-stat-val" style="color:#7C3AED">${monthSummary.vacDays}</span>
          <span class="tooltip-stat-lbl">Urlaub</span>
        </div>
      </div>
    </div>
  `;
  
  if (meta.position && meta.position !== "—") {
    const pc = posColor(meta.position);
    html += `
      <div class="tooltip-footer">
        <span class="tooltip-pos" style="background:${pc.bg};color:${pc.fg}">${meta.position} · ${meta.posLabel}</span>
        ${meta.phone ? `<span class="tooltip-phone">📞 ${meta.phone}</span>` : ""}
      </div>
    `;
  }
  
  const tooltip = document.createElement("div");
  tooltip.className = "radplan-tooltip";
  tooltip.innerHTML = html;
  tooltip.style.position = "fixed";
  tooltip.style.zIndex = "9999";
  tooltip.style.pointerEvents = "none";
  
  document.body.appendChild(tooltip);
  
  const tooltipRect = tooltip.getBoundingClientRect();
  const margin = 12;
  
  let left = x - tooltipRect.width / 2;
  let top = y - tooltipRect.height - margin;
  
  if (top < margin) {
    top = y + (rect ? rect.height : 20) + margin;
    tooltip.classList.add("tooltip-below");
  }
  
  if (left < margin) left = margin;
  if (left + tooltipRect.width > window.innerWidth - margin) {
    left = window.innerWidth - tooltipRect.width - margin;
  }
  
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
  
  activeTooltip = tooltip;
  
  requestAnimationFrame(() => {
    tooltip.classList.add("tooltip-visible");
  });
}

export function hideTooltip() {
  if (activeTooltip) {
    activeTooltip.classList.remove("tooltip-visible");
    setTimeout(() => {
      if (activeTooltip) {
        activeTooltip.remove();
        activeTooltip = null;
      }
    }, 200);
  }
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
