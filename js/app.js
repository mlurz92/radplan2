import {
  WORKPLACES,
  STATUSES,
  CODE_MAP,
  MONTHS,
  MONTHS_SHORT,
  DOW_ABBR,
  DOW_LONG,
  VACATION_CODES,
  WISH_TYPES,
  WISH_MAP,
  RBN_ROW_KEY,
  RBN_ROW_LABEL,
  isFacharzt,
  isAssistenzarzt,
  getEmpMeta,
  posColor,
  getSaxonyHolidaysCached,
  dateKey,
  monthKey,
  daysInMonth,
  weekday,
  isWeekend,
  isFriday,
  isHoliday,
  isTodayCol,
  isoWeekNumber,
  nextCalendarDay,
  cellColor,
  empInitials,
  getRbnOptionsForDate,
  formatRbnDisplay,
  isEmployeeActiveInMonth
} from './constants.js';

import {
  state,
  DATA,
  planMode,
  planData,
  planBaseline,
  planHistory,
  planHistoryIdx,
  planSessions,
  IS_MOBILE,
  TOD_Y,
  TOD_M,
  TOD_D,
  loadFromStorage,
  saveToStorage,
  setPlanMode,
  setPlanData,
  setPlanBaseline,
  setPlanHistory,
  setPlanHistoryIdx,
  setDeptTab,
  syncWithServer,
  forceSyncWithServer,
  serverLastModified,
  serverFetchSuccessful
} from './state.js';

import {
  getMonthData,
  ensurePostBDFreiDays,
  getCell,
  setCell,
  clearCell,
  getRbnValue,
  setRbnValue,
  dutyOwner,
  getEmployeesForYear,
  cloneData,
  persistPlanSessionRefs,
  hasAnyPlanChanges,
  loadPlanSessionForState,
  addEmployee,
  removeEmployee,
  getComment,
  setComment
} from './model.js';

import {
  render,
  refreshOpenContextPanels,
  updateOpenModalLayouts,
  refreshResponsiveLayout,
  queueResponsiveRefresh,
  scrollToToday as doScrollToToday,
  focusCellAfterRender,
  initGridKeyboardHandlers,
  openRadialQuickMenu,
  updateRadialHover,
  releaseRadialMenu
} from './render-grid.js';

import {
  showOverlay,
  hideOverlay,
  showToast,
  openProfileModal,
  openScoreInfoModal
} from './render-modals.js';

import { renderDeptContent } from './render-dept.js';
import { renderEmployeeDashboard, exportEmployeeDashboardCSV } from './render-employee-dashboard.js';

import {
  computeAutoPlan,
  collectHistoricalDutyStatsAsync,
  sleep,
  TARGET_WEEKEND_DUTY,
  RELAXED_WEEKEND_DUTY_LIMIT,
  isDutyExempt,
  DUTY_EXEMPT,
  AUTO_PLAN_WEIGHT_PROFILES
} from './autoplan.js';

import { NeuralGraph } from './neuralgraph.js';
import { openYearPlan, setupYearPlanModal, renderYearPlanContent, setYearPlanYear, cleanupYearPlan } from './yearplan.js';
import { initCommandPalette } from './commandpalette.js';
import { withViewTransition, withThemeViewTransition } from './viewtransition.js';
import { initNewFeatures, generatePDF } from './features/index.js';

let localAutoPlanResult = null;
let localAutoPlanTargets = {};
let localApViewMode = "config";
let localAutoPlanConfigRenderToken = 0;
let localApAnimationId = null;
let neuralGraphInstance = null;
let localWeightProfile = "standard";
let localAutoPlanAlternatives = {};

const THEME_STORAGE_KEY = "radplan_v3_theme";

export function getTheme() {
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

export function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const meta = document.getElementById("meta-theme-color");
  if (meta) meta.setAttribute("content", theme === "light" ? "#F4F1EA" : "#0B1929");
  const moonIcon = document.getElementById("btn-theme-icon-moon");
  const sunIcon = document.getElementById("btn-theme-icon-sun");
  if (moonIcon) moonIcon.style.display = theme === "light" ? "none" : "";
  if (sunIcon) sunIcon.style.display = theme === "light" ? "" : "none";
  const btn = document.getElementById("btn-theme");
  if (btn) btn.title = theme === "light" ? "Dunkelmodus aktivieren" : "Hellmodus aktivieren";
}

export function setTheme(theme, persist = true) {
  applyTheme(theme);
  if (persist) {
    try { localStorage.setItem(THEME_STORAGE_KEY, theme); } catch (e) { /* localStorage unavailable */ }
  }
}

export function toggleTheme(originEvent) {
  withThemeViewTransition(() => {
    setTheme(getTheme() === "light" ? "dark" : "light");
  }, originEvent);
}

export function initTheme() {
  applyTheme(getTheme());
  let explicitPreference = false;
  try { explicitPreference = localStorage.getItem(THEME_STORAGE_KEY) !== null; } catch (e) { /* ignore */ }
  if (!explicitPreference && window.matchMedia) {
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    mq.addEventListener?.("change", (e) => {
      let stillExplicit = false;
      try { stillExplicit = localStorage.getItem(THEME_STORAGE_KEY) !== null; } catch (err) { /* ignore */ }
      if (!stillExplicit) setTheme(e.matches ? "light" : "dark", false);
    });
  }
}

const DENSITY_STORAGE_KEY = "radplan_v3_density";

export function getDensity() {
  return document.body.classList.contains("grid-density-compact") ? "compact" : "cozy";
}

export function applyDensity(density) {
  document.body.classList.toggle("grid-density-compact", density === "compact");
  const compactIcon = document.getElementById("btn-density-icon-compact");
  const cozyIcon = document.getElementById("btn-density-icon-cozy");
  if (compactIcon) compactIcon.style.display = density === "compact" ? "none" : "";
  if (cozyIcon) cozyIcon.style.display = density === "compact" ? "" : "none";
  const btn = document.getElementById("btn-density");
  if (btn) btn.title = density === "compact" ? "Normale Spaltenbreite aktivieren" : "Kompakte Spaltenbreite aktivieren (für kleinere Fenster/Tablets)";
}

export function setDensity(density, persist = true) {
  applyDensity(density);
  if (persist) {
    try { localStorage.setItem(DENSITY_STORAGE_KEY, density); } catch (e) { /* localStorage unavailable */ }
  }
  refreshResponsiveLayout({ forceRender: true });
}

export function toggleDensity() {
  setDensity(getDensity() === "compact" ? "cozy" : "compact");
}

export function initDensity() {
  let saved = null;
  try { saved = localStorage.getItem(DENSITY_STORAGE_KEY); } catch (e) { /* ignore */ }
  applyDensity(saved === "compact" ? "compact" : "cozy");
}

export function isPeriodFlyoutOpen() {
  const el = document.getElementById("period-flyout");
  return !!el && !el.hasAttribute("hidden");
}

export function populatePeriodMonthSelect() {
  const sel = document.getElementById("period-month-select");
  if (!sel || sel.options.length) {
    return;
  }
  
  MONTHS.forEach((label, idx) => {
    const opt = document.createElement("option");
    opt.value = String(idx);
    opt.textContent = label;
    sel.appendChild(opt);
  });
}

export function syncPeriodControls() {
  const monthSelect = document.getElementById("period-month-select");
  const yearInput = document.getElementById("period-year-input");
  const context = document.getElementById("period-context");
  
  if (monthSelect) {
    monthSelect.value = String(state.periodDraft.month);
  }
  
  if (yearInput) {
    yearInput.value = String(state.periodDraft.year);
  }
  
  if (context) {
    if (planMode) {
      context.textContent = `Planungsmodus aktiv · aktive Sicht ${MONTHS[state.month]} ${state.year} · Auswahl ${MONTHS[state.periodDraft.month]} ${state.periodDraft.year}`;
    } else {
      context.textContent = `Aktive Ansicht ${MONTHS[state.month]} ${state.year} · Auswahl ${MONTHS[state.periodDraft.month]} ${state.periodDraft.year}`;
    }
  }
  
  const labelBtn = document.getElementById("month-label-btn");
  if (labelBtn) {
    labelBtn.setAttribute("aria-expanded", isPeriodFlyoutOpen() ? "true" : "false");
  }
}

export function openPeriodFlyout() {
  populatePeriodMonthSelect();
  state.periodDraft = { year: state.year, month: state.month };
  syncPeriodControls();
  
  const el = document.getElementById("period-flyout");
  if (!el) {
    return;
  }
  
  el.removeAttribute("hidden");
  el.setAttribute("aria-hidden", "false");
  document.body.classList.add("period-flyout-open");
  syncPeriodControls();
}

export function closePeriodFlyout() {
  const el = document.getElementById("period-flyout");
  if (!el) {
    return;
  }
  
  el.setAttribute("hidden", "");
  el.setAttribute("aria-hidden", "true");
  document.body.classList.remove("period-flyout-open");
  syncPeriodControls();
}

export function shiftMonth(delta) {
  const total = state.year * 12 + state.month + delta;
  const nextYear = Math.floor(total / 12);
  const nextMonth = ((total % 12) + 12) % 12;
  return { year: nextYear, month: nextMonth };
}

export function switchPeriod(targetYear, targetMonth, options = {}) {
  const { closeFlyout = true, direction = null } = options;

  if (closeFlyout) {
    closePeriodFlyout();
  }

  if (planMode) {
    persistPlanSessionRefs();
  }

  state.year = targetYear;
  state.month = targetMonth;
  state.periodDraft = { year: targetYear, month: targetMonth };

  if (planMode) {
    loadPlanSessionForState(targetYear, targetMonth);
  }

  syncPeriodControls();
  refreshOpenContextPanels();
  withViewTransition(() => render(), direction);
}

export function changeMonth(delta) {
  const next = shiftMonth(delta);
  switchPeriod(next.year, next.month, { direction: delta > 0 ? "forward" : "backward" });
}

export function changeYear(delta) {
  switchPeriod(state.year + delta, state.month, { direction: delta > 0 ? "forward" : "backward" });
}

export function applyPeriodDraft() {
  const year = Math.max(2000, Math.min(2100, parseInt(state.periodDraft.year, 10) || state.year));
  const month = Math.max(0, Math.min(11, parseInt(state.periodDraft.month, 10) || 0));
  switchPeriod(year, month);
}

export function handleTodayClick() {
  if (state.year !== TOD_Y || state.month !== TOD_M) {
    switchPeriod(TOD_Y, TOD_M, { closeFlyout: true });
    setTimeout(doScrollToToday, 100);
  } else {
    doScrollToToday();
  }
}

export function isEditorOpen() {
  const el = document.getElementById("modal-editor");
  return el && !el.hasAttribute("hidden");
}

export function recordPlanHistory() {
  if (!planMode || !planData) {
    return;
  }
  
  const newHistory = planHistory.slice(0, planHistoryIdx + 1);
  newHistory.push({
    assignments: cloneData(planData.assignments),
    rbn: cloneData(planData.rbn || {}),
  });
  
  setPlanHistory(newHistory);
  setPlanHistoryIdx(newHistory.length - 1);
  persistPlanSessionRefs();
  updatePlanBarUI();
}

export function updatePlanBarUI() {
  const undoBtn = document.getElementById("btn-plan-undo");
  const redoBtn = document.getElementById("btn-plan-redo");
  
  if (!undoBtn || !redoBtn) {
    return;
  }
  
  const canUndo = planHistoryIdx > 0;
  const canRedo = planHistoryIdx < planHistory.length - 1;
  
  undoBtn.disabled = !canUndo;
  redoBtn.disabled = !canRedo;
  undoBtn.title = canUndo ? `Rückgängig (Strg+Z)` : "";
  redoBtn.title = canRedo ? `Vorwärts (Strg+Y)` : "";
}

export function enterPlanMode() {
  const { year: y, month: m } = state;
  setPlanMode(true);
  loadPlanSessionForState(y, m);
  localAutoPlanTargets = {};
  render();
  showToast("Planungsmodus aktiv");
}

export function exitPlanMode() {
  persistPlanSessionRefs();
  setPlanMode(false);
  setPlanData(null);
  setPlanBaseline(null);
  setPlanHistory([]);
  setPlanHistoryIdx(-1);
  render();
}

export function getWish(emp, day) {
  if (!planMode || !planData?.wishes) {
    return null;
  }
  return planData.wishes[emp]?.[day] || null;
}

export function setWish(emp, day, wishCode) {
  if (!planMode || !planData) {
    return;
  }
  if (!planData.wishes[emp]) {
    planData.wishes[emp] = {};
  }
  if (wishCode) {
    planData.wishes[emp][day] = wishCode;
  } else {
    delete planData.wishes[emp][day];
  }
}

export function toggleWish(emp, day, wishCode) {
  const current = getWish(emp, day);
  if (current === wishCode) {
    setWish(emp, day, null);
  } else {
    setWish(emp, day, wishCode);
  }
}

export function isPinned(emp, day) {
  if (!planMode || !planData?.pins) {
    return false;
  }
  return !!planData.pins[emp]?.[day];
}

export function setPinned(emp, day, val) {
  if (!planMode || !planData) {
    return;
  }
  if (!planData.pins) {
    planData.pins = {};
  }
  if (val) {
    if (!planData.pins[emp]) {
      planData.pins[emp] = {};
    }
    planData.pins[emp][day] = true;
  } else if (planData.pins[emp]) {
    delete planData.pins[emp][day];
  }
}

export function togglePinned(emp, day) {
  setPinned(emp, day, !isPinned(emp, day));
  render();
  showToast(isPinned(emp, day) ? `Zelle fixiert: ${emp}, Tag ${day}` : `Fixierung aufgehoben: ${emp}, Tag ${day}`);
}

export function closePlanMode() {
  persistPlanSessionRefs();
  if (hasAnyPlanChanges()) {
    if (!confirm("Planungsmodus schließen?\nEs gibt ungespeicherte Änderungen in mindestens einem Monatsentwurf.")) {
      return;
    }
  }
  exitPlanMode();
}

export function abortPlanChanges() {
  if (!planMode || !planBaseline) {
    return;
  }
  
  const draftState = JSON.stringify({
    assignments: planData.assignments,
    rbn: planData.rbn || {},
  });
  
  if (draftState === JSON.stringify(planBaseline)) {
    showToast("Keine Änderungen");
    return;
  }
  
  planData.assignments = cloneData(planBaseline.assignments || {});
  planData.rbn = cloneData(planBaseline.rbn || {});
  
  setPlanHistory([{ 
    assignments: cloneData(planData.assignments), 
    rbn: cloneData(planData.rbn || {}) 
  }]);
  
  setPlanHistoryIdx(0);
  persistPlanSessionRefs();
  render();
  showToast("Zurückgesetzt");
}

export function savePlanDraft() {
  if (!planMode || !planData) {
    return;
  }
  
  const key = `radplan_v3_plan_${monthKey(state.year, state.month)}`;
  
  try {
    persistPlanSessionRefs();
    localStorage.setItem(
      key,
      JSON.stringify({
        employees: planData.employees,
        assignments: planData.assignments,
        rbn: planData.rbn || {},
        wishes: planData.wishes || {},
        pins: planData.pins || {},
      })
    );
    
    setPlanBaseline({
      assignments: cloneData(planData.assignments),
      rbn: cloneData(planData.rbn || {}),
    });
    
    persistPlanSessionRefs();
    updatePlanBarUI();
    saveToStorage();
    showToast("Entwurf gespeichert");
  } catch (e) {
    showToast("Fehler beim Speichern");
  }
}

export function applyPlanToMain() {
  if (!planMode || !planData) {
    return;
  }
  
  const k = monthKey(state.year, state.month);
  
  if (!DATA[k]) {
    DATA[k] = { employees: [...planData.employees], assignments: {}, rbn: {} };
  }
  
  DATA[k].employees = [...planData.employees];
  DATA[k].assignments = cloneData(planData.assignments);
  DATA[k].rbn = cloneData(planData.rbn || {});
  
  saveToStorage();
  exitPlanMode();
  showToast("Planung übernommen");
}

export function undoPlan() {
  if (!planMode || planHistoryIdx <= 0) {
    return;
  }
  
  setPlanHistoryIdx(planHistoryIdx - 1);
  const snap = planHistory[planHistoryIdx] || { assignments: {}, rbn: {} };
  
  planData.assignments = cloneData(snap.assignments || {});
  planData.rbn = cloneData(snap.rbn || {});
  
  persistPlanSessionRefs();
  updatePlanBarUI();
  render();
}

export function redoPlan() {
  if (!planMode || planHistoryIdx >= planHistory.length - 1) {
    return;
  }
  
  setPlanHistoryIdx(planHistoryIdx + 1);
  const snap = planHistory[planHistoryIdx] || { assignments: {}, rbn: {} };
  
  planData.assignments = cloneData(snap.assignments || {});
  planData.rbn = cloneData(snap.rbn || {});
  
  persistPlanSessionRefs();
  updatePlanBarUI();
  render();
}

export function openEditor(emp, day, options = {}) {
  const { year: y, month: m } = state;
  const { ctrlKey = false } = options;
  const isRbnRow = emp === RBN_ROW_KEY;
  
  if (ctrlKey && !isRbnRow) {
    if (state.multiEdit.emp !== emp) {
      state.multiEdit.emp = emp;
      state.multiEdit.days = [];
    }
    const idx = state.multiEdit.days.indexOf(day);
    if (idx >= 0) {
      state.multiEdit.days.splice(idx, 1);
    } else {
      state.multiEdit.days.push(day);
      state.multiEdit.days.sort((a, b) => a - b);
    }
    render();
    showToast(state.multiEdit.days.length ? `${state.multiEdit.days.length} Tage für ${emp} markiert` : "Mehrfachauswahl aufgehoben");
    return;
  }

  const selectedDays = state.multiEdit.emp === emp && state.multiEdit.days.length
    ? [...state.multiEdit.days]
    : [day];
  if (!selectedDays.includes(day)) {
    selectedDays.push(day);
    selectedDays.sort((a, b) => a - b);
  }

  const cell = isRbnRow ? { assignment: getRbnValue(y, m, day) || null, duty: null } : getCell(y, m, emp, day);
  const hols = getSaxonyHolidaysCached(y);
  
  state.edit = { emp, day, isRbnRow, days: selectedDays };
  let wp = [];
  let st = null;
  
  if (isRbnRow && cell.assignment) {
    wp = [cell.assignment];
  } else if (cell.assignment) {
    cell.assignment.split("/").map((x) => x.trim()).forEach((p) => {
      if (WORKPLACES.find((w) => w.code === p)) {
        wp.push(p);
      } else if (STATUSES.find((s) => s.code === p)) {
        st = p;
      }
    });
  }
  
  state.ed = { wp: [...wp], st, duty: cell.duty || null };
  
  const wd = weekday(y, m, day);
  const hol = isHoliday(y, m, day, hols);
  const we = isWeekend(y, m, day);
  const holNm = hols[dateKey(y, m, day)] || "";
  
  const edTitle = document.getElementById("ed-title");
  if (edTitle) {
    edTitle.textContent = isRbnRow ? RBN_ROW_LABEL : emp;
  }
  
  const edSub = document.getElementById("ed-sub");
  if (edSub) {
    const selectionText = selectedDays.length > 1 ? ` · ${selectedDays.length} Tage ausgewählt` : "";
    edSub.textContent = `${DOW_LONG[wd]}, ${day}. ${MONTHS[m]} ${y}${holNm ? " · " + holNm : ""}${selectionText}`;
  }
  
  const dtlEl = document.getElementById("ed-day-label");
  if (dtlEl) {
    if (hol) {
      dtlEl.innerHTML = `<span class="day-type-label dtl-hol">Feiertag${holNm ? ": " + holNm : ""}</span>`;
    } else if (we) {
      dtlEl.innerHTML = `<span class="day-type-label dtl-we">Wochenende</span>`;
    } else {
      dtlEl.innerHTML = "";
    }
  }
  
  const modalHd = document.getElementById("ed-modal-hd");
  const planBadge = document.getElementById("ed-plan-badge");
  const modalEl = document.getElementById("modal-editor");
  
  if (planMode) {
    if (modalHd) modalHd.classList.add("plan-mode-hd");
    if (modalEl) modalEl.classList.add("plan-mode-editor");
    if (planBadge) planBadge.style.display = "inline-flex";
  } else {
    if (modalHd) modalHd.classList.remove("plan-mode-hd");
    if (modalEl) modalEl.classList.remove("plan-mode-editor");
    if (planBadge) planBadge.style.display = "none";
  }
  
  // Kommentar laden
  const commentTa = document.getElementById("ed-comment-ta");
  const commentCount = document.getElementById("ed-comment-count");
  const commentSection = document.getElementById("ed-comment-section");
  if (commentSection) commentSection.style.display = isRbnRow ? "none" : "";
  if (commentSection?.parentElement?.classList.contains("ed-step")) {
    commentSection.parentElement.style.display = isRbnRow ? "none" : "";
  }
  if (commentTa) {
    commentTa.value = isRbnRow ? "" : (getComment(y, m, emp, day) || "");
    if (commentCount) commentCount.textContent = `${commentTa.value.length}/200`;
    commentTa.removeEventListener("input", commentTa._ypCountHandler);
    commentTa._ypCountHandler = () => {
      if (commentCount) commentCount.textContent = `${commentTa.value.length}/200`;
    };
    commentTa.addEventListener("input", commentTa._ypCountHandler);
  }

  refreshEditorChips();
  showOverlay("modal-editor");
}

export function refreshEditorChips() {
  const { year: y, month: m } = state;
  const { wp, st, duty } = state.ed;
  const { emp, day, isRbnRow } = state.edit;
  
  const wpLabel = document.getElementById("ed-wp-label");
  const wpHint = document.getElementById("ed-wp-hint");
  const stSection = document.getElementById("ed-st-section");
  const dutySection = document.getElementById("ed-duty-section");
  const dutyWarn = document.getElementById("ed-duty-warn");
  
  if (isRbnRow) {
    if (wpLabel) wpLabel.textContent = "RD Neurorad";
    if (wpHint) wpHint.textContent = "— manuelle Namensauswahl, wird nie durch Auto-Planung verändert";
    if (stSection) stSection.style.display = "none";
    if (dutySection) dutySection.style.display = "none";
    if (dutyWarn) dutyWarn.style.display = "none";
  } else {
    if (wpLabel) wpLabel.textContent = "Arbeitsplatz";
    if (wpHint) wpHint.textContent = "— Mehrfachauswahl möglich, z. B. MR/CT";
    if (stSection) stSection.style.display = "";
    if (dutySection) dutySection.style.display = "";
    if (dutySection?.parentElement?.classList.contains("ed-step")) {
      dutySection.parentElement.style.display = "";
    }
  }
  
  const wpC = document.getElementById("ed-wp");
  if (wpC) {
    wpC.innerHTML = "";
    
    const rbnOptions = getRbnOptionsForDate(y, m);
    if (isRbnRow && state.ed.wp[0] && !rbnOptions.includes(state.ed.wp[0])) {
      rbnOptions.unshift(state.ed.wp[0]);
    }
    
    const wpOptions = isRbnRow ? rbnOptions.map((label) => ({ code: label, label, bg: "#E0F2FE", fg: "#0C4A6E" })) : WORKPLACES;
    
    wpOptions.forEach((w, idx) => {
      const on = wp.includes(w.code);
      const dimC = isRbnRow ? false : !!st;
      
      const chip = document.createElement("div");
      chip.className = `chip-wp${on ? " on" : ""}${dimC ? " dim" : ""}`;
      chip.style.cssText = `background:${on ? w.fg : w.bg};color:${on ? "#fff" : w.fg};position:relative`;
      
      if (isRbnRow) {
        chip.style.minWidth = "190px";
        chip.style.alignItems = "flex-start";
        chip.style.textAlign = "left";
        chip.style.lineHeight = "1.35";
        chip.style.fontFamily = "var(--font-sans)";
        chip.style.fontSize = "12px";
        chip.style.fontWeight = "700";
      }
      
      const kbdBadge = `<span style="position:absolute;top:2px;right:2px;font-family:var(--font-mono);font-size:7px;font-weight:700;line-height:1;opacity:${dimC ? 0.3 : 0.55};background:rgba(0,0,0,0.12);color:inherit;padding:1px 3px;border-radius:2px;pointer-events:none">${idx + 1}</span>`;
      
      if (isRbnRow) {
        chip.innerHTML = `${w.label}`;
      } else {
        chip.innerHTML = `${kbdBadge}${w.code}<span class="chip-sub">${w.label}</span>`;
      }
      
      if (!dimC) {
        chip.addEventListener("click", () => {
          const i = state.ed.wp.indexOf(w.code);
          if (i >= 0) {
            state.ed.wp.splice(i, 1);
          } else if (isRbnRow) {
            state.ed.wp = [w.code];
          } else {
            state.ed.wp.push(w.code);
          }
          refreshEditorChips();
        });
      }
      wpC.appendChild(chip);
    });
    
    let kbdHint = document.getElementById("ed-wp-kbd-hint");
    if (!kbdHint) {
      kbdHint = document.createElement("div");
      kbdHint.id = "ed-wp-kbd-hint";
      kbdHint.style.cssText = "margin-top:6px;display:flex;align-items:center;gap:5px;font-size:9.5px;color:var(--gray-400);";
      kbdHint.innerHTML = `
        <svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="flex-shrink:0;opacity:.6">
          <rect x="2" y="4" width="20" height="16" transform="translate(2 4)"/>
          <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M6 16h12"/>
        </svg>
        <span>Ziffern 1–8 für Arbeitsplatz · D für Bereitschaft · H für Hintergrund · S oder ↵ zum Speichern</span>
      `;
      wpC.parentNode.insertBefore(kbdHint, wpC.nextSibling);
    }
    kbdHint.style.display = !isRbnRow && !IS_MOBILE ? "flex" : "none";
  }
  
  if (isRbnRow) {
    const stC = document.getElementById("ed-st");
    if (stC) stC.innerHTML = "";
    
    const dtC = document.getElementById("ed-duty");
    if (dtC) dtC.innerHTML = "";
    
    const edPreviewVal = document.getElementById("ed-preview-val");
    if (edPreviewVal) edPreviewVal.textContent = state.ed.wp[0] || "—";
    
    const edPreviewDuties = document.getElementById("ed-preview-duties");
    if (edPreviewDuties) edPreviewDuties.innerHTML = "";
    
    const wishC = document.getElementById("ed-wish");
    const wishHd = document.getElementById("ed-wish-hd");
    if (wishC) wishC.style.display = "none";
    if (wishHd) wishHd.style.display = "none";

    const planStep = document.getElementById("ed-plan-step");
    if (planStep) planStep.style.display = "none";
    if (dutySection?.parentElement?.classList.contains("ed-step")) {
      dutySection.parentElement.style.display = "none";
    }
    return;
  }
  
  const stC = document.getElementById("ed-st");
  if (stC) {
    stC.innerHTML = "";
    
    STATUSES.forEach((s) => {
      const on = st === s.code;
      const dimC = wp.length > 0 && !on;
      
      const chip = document.createElement("div");
      chip.className = `chip-st${on ? " on" : ""}${dimC ? " dim" : ""}`;
      chip.style.cssText = `background:${on ? s.fg : s.bg};color:${on ? "#fff" : s.fg}`;
      chip.innerHTML = `${s.code}<span class="chip-sub">${s.label}</span>`;
      
      if (!dimC || on) {
        chip.addEventListener("click", () => {
          state.ed.st = state.ed.st === s.code ? null : s.code;
          if (state.ed.st) {
            state.ed.wp = [];
          }
          refreshEditorChips();
        });
      }
      stC.appendChild(chip);
    });
  }
  
  const dtC = document.getElementById("ed-duty");
  if (dtC) {
    dtC.innerHTML = "";
    const warnParts = [];
    
    ["D", "HG"].forEach((dc) => {
      const on = duty === dc;
      const owner = dutyOwner(y, m, day, dc);
      const taken = owner && owner !== emp;
      
      const chip = document.createElement("div");
      chip.className = `chip-duty ${on ? "duty-" + dc + "-on" : "duty-" + dc + "-off"}${taken ? " blocked" : ""}`;
      chip.innerHTML = `${dc}<span class="duty-sub">${dc === "D" ? "Bereitschaftsdienst" : "Hintergrunddienst"}</span>`;
      
      if (!taken) {
        chip.addEventListener("click", () => {
          state.ed.duty = state.ed.duty === dc ? null : dc;
          refreshEditorChips();
        });
      } else {
        warnParts.push(`${dc} bereits vergeben: ${owner}`);
      }
      dtC.appendChild(chip);
    });
    
    const warnEl = document.getElementById("ed-duty-warn");
    const nextDay = nextCalendarDay(y, m, day);
    
    if (nextDay.y !== undefined) {
      const nextCell = getCell(nextDay.y, nextDay.m, emp, nextDay.d);
      if (nextCell.assignment) {
        const codes = nextCell.assignment.split("/").map((x) => x.trim());
        if (codes.some((c) => VACATION_CODES.includes(c))) {
          warnParts.push(`⚠ Folgetag (${nextDay.d}.) ist Urlaub`);
        }
      }
    }
    
    if (warnEl) {
      if (warnParts.length) {
        warnEl.style.display = "block";
        warnEl.textContent = warnParts.join(" · ");
      } else {
        warnEl.style.display = "none";
      }
    }
  }
  
  const planStep = document.getElementById("ed-plan-step");
  if (planStep) planStep.style.display = planMode ? "" : "none";

  const wishC = document.getElementById("ed-wish");
  if (wishC) {
    if (planMode) {
      wishC.style.display = "flex";
      const wishHd = document.getElementById("ed-wish-hd");
      if (wishHd) wishHd.style.display = "";

      wishC.innerHTML = "";
      const currentWish = getWish(emp, day);
      
      WISH_TYPES.forEach((wt) => {
        const on = currentWish === wt.code;
        const chip = document.createElement("div");
        chip.className = `chip-wish${on ? " wish-on" : ""}`;
        chip.style.cssText = on ? `background:${wt.fg};color:#fff;border-color:${wt.fg}` : `background:${wt.bg};color:${wt.fg};border-color:${wt.border}`;
        chip.innerHTML = `<span class="wish-icon">${wt.icon}</span>${wt.label}`;
        chip.addEventListener("click", () => {
          toggleWish(emp, day, wt.code);
          refreshEditorChips();
        });
        wishC.appendChild(chip);
      });
    } else {
      wishC.style.display = "none";
      const wishHd = document.getElementById("ed-wish-hd");
      if (wishHd) wishHd.style.display = "none";
    }
  }

  const pinC = document.getElementById("ed-pin");
  const pinHd = document.getElementById("ed-pin-hd");
  if (pinC) {
    if (planMode) {
      pinC.style.display = "flex";
      if (pinHd) pinHd.style.display = "";

      pinC.innerHTML = "";
      const on = isPinned(emp, day);
      const chip = document.createElement("div");
      chip.className = `chip-wish${on ? " wish-on" : ""}`;
      chip.style.cssText = on ? `background:#D97706;color:#fff;border-color:#D97706` : `background:#FEF3C7;color:#92400E;border-color:#FDE68A`;
      chip.innerHTML = `<span class="wish-icon">📌</span>${on ? "Fixiert — Solver ändert diese Zelle nicht" : "Für Auto-Plan fixieren"}`;
      chip.addEventListener("click", () => {
        setPinned(emp, day, !isPinned(emp, day));
        refreshEditorChips();
        render();
      });
      pinC.appendChild(chip);
    } else {
      pinC.style.display = "none";
      if (pinHd) pinHd.style.display = "none";
    }
  }

  const pv = state.ed.st || (state.ed.wp.length ? state.ed.wp.join("/") : "");
  const edPreviewVal = document.getElementById("ed-preview-val");
  if (edPreviewVal) {
    edPreviewVal.textContent = pv || "—";
  }
  
  const bdg = document.getElementById("ed-preview-duties");
  if (bdg) {
    if (state.ed.duty) {
      bdg.innerHTML = `<span class="preview-duty-badge badge-${state.ed.duty}" style="background:${state.ed.duty === "D" ? "#EF4444" : "#0EA5E9"};color:#fff">${state.ed.duty}</span>`;
    } else {
      bdg.innerHTML = "";
    }
  }
}

export function saveEditor() {
  const { year: y, month: m } = state;
  const { emp, day, isRbnRow } = state.edit;
  const days = Array.isArray(state.edit.days) && state.edit.days.length ? state.edit.days : [day];
  
  if (isRbnRow) {
    if (planMode) recordPlanHistory();
    setRbnValue(y, m, day, state.ed.wp[0] || "");
    if (planMode) recordPlanHistory();
    hideOverlay("modal-editor");
    render();
    return;
  }
  
  const { wp, st, duty } = state.ed;
  const assignment = st ? st : wp.length ? wp.join("/") : null;
  
  if (planMode) recordPlanHistory();

  // Record global history for undo/redo in normal mode
  if (!planMode) {
    recordHistory({
      type: "cell-edit",
      description: `${emp}, Tag ${day}: ${assignment || duty || "gelöscht"}`
    });
  }

  let autoFCount = 0;
  days.forEach((targetDay) => {
    setCell(y, m, emp, targetDay, {
      assignment: assignment || null,
      duty: duty || null,
    });
    
    if (duty === "D") {
      const next = nextCalendarDay(y, m, targetDay);
      const ex = getCell(next.y, next.m, emp, next.d);
      if (!ex.assignment) {
        setCell(next.y, next.m, emp, next.d, {
          assignment: "F",
          duty: ex.duty || null,
        });
        autoFCount++;
      }
    }
  });
  
  if (planMode) recordPlanHistory();

  // Kommentar speichern (nur für den primären Tag, nicht für alle Multi-Edit-Tage)
  if (!isRbnRow) {
    const commentTa = document.getElementById("ed-comment-ta");
    if (commentTa) {
      setComment(y, m, emp, day, commentTa.value);
    }
  }

  hideOverlay("modal-editor");
  state.multiEdit = { emp: null, days: [] };
  if (days.length > 1) {
    const fSuffix = autoFCount > 0 ? ` (inkl. ${autoFCount}x F automatisch)` : "";
    showToast(`${days.length} Tage gespeichert${fSuffix}`);
  } else if (autoFCount > 0) {
    showToast("F automatisch gesetzt");
  }
  render();
}

export function confirmRemoveEmployee(name, refreshList = false) {
  const { year: y, month: m } = state;
  if (confirm(`„${name}" aus ${MONTHS[m]} ${y} entfernen?`)) {
    removeEmployee(y, m, name);
    render();
    if (refreshList) {
      renderEmployeeDashboard();
    } else {
      renderEmployeeDashboard();
    }
  }
}

export function confirmRemoveEmployeeFuture(name) {
  const { year: y, month: m } = state;
  if (confirm(`„${name}" ab ${MONTHS[m]} ${y} dauerhaft (auch aus allen Folgemonaten) entfernen?\n\nACHTUNG: Dies löscht den Mitarbeiter und alle seine Dienste unwiderruflich aus der Datenbank für die Zukunft.`)) {
    // 1. Current month removal
    removeEmployee(y, m, name);

    // 2. Clear from DATA for all future months
    const currentKey = monthKey(y, m);
    const [cY, cM] = currentKey.split('-').map(Number);
    Object.keys(DATA).forEach(key => {
      const parts = key.split('-');
      const tyNum = parseInt(parts[0], 10);
      const tmNum = parseInt(parts[1], 10);
      if (tyNum > cY || (tyNum === cY && tmNum > cM)) {
        removeEmployee(tyNum, tmNum, name);
      }
    });

    // 3. Clear from active Plan-Sessions if applicable
    if (planMode && planSessions) {
      Object.keys(planSessions).forEach(key => {
        if (key >= currentKey && planSessions[key]) {
          const session = planSessions[key];
          if (session.employees) {
            session.employees = session.employees.filter(e => e !== name);
          }
          if (session.assignments && session.assignments[name]) {
            delete session.assignments[name];
          }
          if (session.wishes && session.wishes[name]) {
            delete session.wishes[name];
          }
          if (session.pins && session.pins[name]) {
            delete session.pins[name];
          }
        }
      });
    }

    render();
    showToast(`„${name}" kaskadierend entfernt`);
  }
}

function bindMobileDaySwipe(day, dim) {
  const sheet = document.querySelector("#modal-mobile-day .modal");
  if (!sheet) return;
  sheet.dataset.mdaySwipeDay = String(day);
  sheet.dataset.mdaySwipeDim = String(dim);
  if (sheet.dataset.mdaySwipeBound) return;
  sheet.dataset.mdaySwipeBound = "1";

  let startX = 0;
  let startY = 0;
  let pointerId = null;
  let swiping = false;

  sheet.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse") return;
    if (e.target.closest(".mday-editable")) return;
    startX = e.clientX;
    startY = e.clientY;
    pointerId = e.pointerId;
    swiping = false;
  });

  sheet.addEventListener("pointermove", (e) => {
    if (pointerId === null || e.pointerId !== pointerId) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!swiping && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      swiping = true;
    }
    if (swiping) {
      sheet.style.transition = "none";
      sheet.style.transform = `translateX(${dx * 0.3}px)`;
    }
  });

  const finishSwipe = (e) => {
    if (pointerId === null || e.pointerId !== pointerId) return;
    pointerId = null;
    sheet.style.transition = "transform .25s cubic-bezier(.34,1.2,.64,1)";
    sheet.style.transform = "";
    setTimeout(() => { sheet.style.transition = ""; }, 260);
    if (!swiping) return;
    swiping = false;
    const dx = e.clientX - startX;
    if (Math.abs(dx) < 60) return;
    const curDay = parseInt(sheet.dataset.mdaySwipeDay || "0", 10);
    const curDim = parseInt(sheet.dataset.mdaySwipeDim || "0", 10);
    const nextDay = dx < 0 ? curDay + 1 : curDay - 1;
    if (nextDay < 1 || nextDay > curDim) return;
    openMobileDay(nextDay);
  };

  sheet.addEventListener("pointerup", finishSwipe);
  sheet.addEventListener("pointercancel", () => {
    pointerId = null;
    swiping = false;
    sheet.style.transition = "transform .25s cubic-bezier(.34,1.2,.64,1)";
    sheet.style.transform = "";
    setTimeout(() => { sheet.style.transition = ""; }, 260);
  });
}

export function openMobileDay(day) {
  const { year: y, month: m } = state;
  const hols = getSaxonyHolidaysCached(y);
  const md = getMonthData(y, m);
  const dim = daysInMonth(y, m);
  const wd = weekday(y, m, day);
  const hol = isHoliday(y, m, day, hols);
  const holName = hols[dateKey(y, m, day)] || "";
  const isToday = isTodayCol(y, m, day, TOD_Y, TOD_M, TOD_D);
  
  const titleEl = document.getElementById("mday-title");
  if (titleEl) {
    titleEl.textContent = `${DOW_LONG[wd]}, ${day}. ${MONTHS[m]} ${y}${holName ? " · " + holName : ""}`;
    if (isToday) {
      titleEl.style.color = "#67D4FF";
    } else if (hol) {
      titleEl.style.color = "#FCD34D";
    } else {
      titleEl.style.color = "";
    }
  }
  
  const dutyBadgesEl = document.getElementById("mday-duty-badges");
  if (dutyBadgesEl) {
    let html = "";
    const bdH = md.employees.find(e => md.assignments?.[e]?.[day]?.duty === "D");
    const hgH = md.employees.find(e => md.assignments?.[e]?.[day]?.duty === "HG");
    
    if (bdH) {
      html += `<span class="mday-duty-pill d"><span class="mday-duty-pill-letter">D</span>${bdH}</span>`;
    }
    if (hgH) {
      html += `<span class="mday-duty-pill hg"><span class="mday-duty-pill-letter">H</span>${hgH}</span>`;
    }
    dutyBadgesEl.innerHTML = html;
  }
  
  const bodyEl = document.getElementById("mday-body");
  if (!bodyEl) { 
    showOverlay("modal-mobile-day"); 
    return; 
  }
  
  const faList = md.employees.filter(e => isFacharzt(e));
  const aaList = md.employees.filter(e => isAssistenzarzt(e));
  
  const sections = [
    { label: "Fachärzte", emps: faList },
    { label: "Assistenzärzte", emps: aaList },
  ].filter(s => s.emps.length > 0);
  
  let bodyHtml = "";
  
  sections.forEach(sec => {
    bodyHtml += `<div class="mday-section-hd">${sec.label}</div>`;
    sec.emps.forEach(emp => {
      const cell = md.assignments?.[emp]?.[day] || {};
      const meta = getEmpMeta(emp);
      const pc = posColor(meta.position);
      const isEditable = planMode || !hol;
      
      let badgesHtml = "";
      if (cell.assignment) {
        cell.assignment.split("/").map(x => x.trim()).filter(Boolean).forEach(code => {
          const cm = CODE_MAP[code];
          if (cm) {
            badgesHtml += `<span class="mday-assign-badge" style="background:${cm.bg};color:${cm.fg}">${code}</span>`;
          }
        });
      }
      
      if (cell.duty) {
        badgesHtml += `<span class="mday-duty-tag ${cell.duty.toLowerCase()}">${cell.duty}</span>`;
      }
      
      if (planMode && getWish(emp, day)) {
        const w = getWish(emp, day);
        const wMap = { BD_WISH: "bd", HG_WISH: "hg", NO_DUTY: "no" };
        const wLabel = { BD_WISH: "D-Wunsch", HG_WISH: "HG-Wunsch", NO_DUTY: "Kein D" };
        badgesHtml += `<span class="mday-wish-tag ${wMap[w] || ""}">${wLabel[w] || w}</span>`;
      }
      
      if (!cell.assignment && !cell.duty) {
        badgesHtml = `<span class="mday-empty-assign">—</span>`;
      }
      
      bodyHtml += `
        <div class="mday-emp-row${isEditable ? " mday-editable" : ""}" data-emp="${emp}">
          <span class="mday-pos-dot" style="background:${pc.border}"></span>
          <div class="mday-emp-info">
            <span class="mday-emp-name">${emp}</span>
            <span class="mday-emp-sub">${meta.posLabel !== "—" ? meta.posLabel : meta.position}</span>
          </div>
          <div class="mday-badges">${badgesHtml}</div>
          ${isEditable ? `
            <span class="mday-edit-icon">
              <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </span>
          ` : ""}
        </div>
      `;
    });
  });
  
  bodyEl.innerHTML = bodyHtml;

  bindMobileDaySwipe(day, dim);

  bodyEl.querySelectorAll(".mday-editable[data-emp]").forEach(row => {
    let startX = 0;
    let startY = 0;
    let pointerId = null;
    let menuOpened = false;

    row.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      startX = e.clientX;
      startY = e.clientY;
      pointerId = e.pointerId;
      menuOpened = false;
      row.setPointerCapture?.(e.pointerId);
    });

    row.addEventListener("pointermove", (e) => {
      if (pointerId === null || e.pointerId !== pointerId) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!menuOpened && Math.hypot(dx, dy) > 10) {
        menuOpened = true;
        openRadialQuickMenu(row.dataset.emp, day, startX, startY);
      }
      if (menuOpened) {
        updateRadialHover(e.clientX, e.clientY);
      }
    });

    row.addEventListener("pointerup", (e) => {
      if (pointerId === null || e.pointerId !== pointerId) return;
      if (menuOpened) {
        releaseRadialMenu(e.clientX, e.clientY);
      } else {
        openRadialQuickMenu(row.dataset.emp, day, e.clientX, e.clientY);
      }
      pointerId = null;
    });

    row.addEventListener("pointercancel", () => {
      pointerId = null;
    });
  });
  
  showOverlay("modal-mobile-day");
}

export function printPlan() {
  const { year, month } = state;
  const titleEl = document.getElementById("print-header-period");
  if (titleEl) titleEl.textContent = `${MONTHS[month]} ${year}`;
  const metaEl = document.getElementById("print-header-meta");
  if (metaEl) {
    metaEl.textContent = `Gedruckt am ${new Date().toLocaleDateString("de-DE")}${planMode ? " · Planungsentwurf" : ""}`;
  }
  document.title = `RadPlan — ${MONTHS[month]} ${year}`;

  // Guarantee the whole grid fits ONE landscape-A4 page vertically too.
  // The print stylesheet already fits the width (table-layout:fixed), but a
  // large department can still overflow downward. Estimate the printed height
  // from the row count and derive a uniform scale that the print stylesheet
  // applies via transform — with an inverse width so the page stays full-bleed.
  const table = document.getElementById("plan-table");
  const rows = table ? table.querySelectorAll("tr").length : 0;
  // A4 landscape @96dpi, 8mm margins, minus print header/footer ≈ usable px.
  const USABLE_H = 680;
  const PRINT_ROW_H = 15; // matches the compact print row metrics
  const estHeight = rows * PRINT_ROW_H + 24;
  const scale = Math.min(1, USABLE_H / Math.max(estHeight, 1));
  document.documentElement.style.setProperty("--print-scale", scale.toFixed(4));

  window.print();
}

export function doExport() {
  const plans = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith("radplan_v3_plan_")) {
      try {
        plans[k.replace("radplan_v3_plan_", "")] = JSON.parse(localStorage.getItem(k));
      } catch (e) {
      }
    }
  }
  
  const exportObj = { main: DATA, plans };
  const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), {
    href: url,
    download: `radplan_${new Date().toISOString().slice(0, 10)}.json`,
  });
  
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast("Daten exportiert");
}

export function openImportModal() {
  const ta = document.getElementById("import-ta");
  if (ta) ta.value = "";
  
  const err = document.getElementById("import-err");
  if (err) err.style.display = "none";
  
  const dz = document.getElementById("import-dropzone");
  const fn = document.getElementById("dz-filename");
  const fi = document.getElementById("import-file-input");
  
  if (dz) dz.classList.remove("has-file", "drag-over");
  if (fn) fn.textContent = "";
  if (fi) fi.value = "";
  
  showOverlay("modal-import");
}

export function doImport() {
  const ta = document.getElementById("import-ta");
  if (!ta) return;
  
  const raw = ta.value.trim();
  const errEl = document.getElementById("import-err");
  if (errEl) errEl.style.display = "none";
  
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Ungültiges Format");
    }
    
    if (parsed.main && typeof parsed.main === "object") {
      Object.assign(DATA, parsed.main);
      if (parsed.plans && typeof parsed.plans === "object") {
        for (const [pk, pv] of Object.entries(parsed.plans)) {
          if (pv && typeof pv === "object" && !pv.rbn) {
            pv.rbn = {};
          }
          localStorage.setItem(`radplan_v3_plan_${pk}`, JSON.stringify(pv));
        }
      }
    } else {
      Object.assign(DATA, parsed);
    }
    
    saveToStorage();
    const repaired = ensurePostBDFreiDays();
    hideOverlay("modal-import");
    render();
    showToast("Daten erfolgreich importiert" + (repaired > 0 ? ` · ${repaired} Ruhetage ergänzt` : ""));
  } catch (e) {
    if (errEl) {
      errEl.style.display = "block";
      errEl.textContent = "Fehler: " + e.message;
    }
  }
}

export function initDragDrop() {
  const dz = document.getElementById("import-dropzone");
  const fi = document.getElementById("import-file-input");
  
  if (!dz || !fi) return;
  
  dz.addEventListener("click", (e) => {
    if (e.target !== fi) {
      fi.click();
    }
  });
  
  fi.addEventListener("change", (e) => {
    const f = e.target.files[0];
    if (f) {
      handleDroppedFile(f);
    }
    e.target.value = "";
  });
  
  dz.addEventListener("dragenter", (e) => {
    e.preventDefault();
    dz.classList.add("drag-over");
  });
  
  dz.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.stopPropagation();
    dz.classList.add("drag-over");
  });
  
  dz.addEventListener("dragleave", (e) => {
    if (!dz.contains(e.relatedTarget)) {
      dz.classList.remove("drag-over");
    }
  });
  
  dz.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    dz.classList.remove("drag-over");
    const f = e.dataTransfer.files[0];
    if (f) {
      handleDroppedFile(f);
    }
  });
}

export function handleDroppedFile(file) {
  const errEl = document.getElementById("import-err");
  const dz = document.getElementById("import-dropzone");
  const fnEl = document.getElementById("dz-filename");
  
  if (errEl) errEl.style.display = "none";
  if (dz) dz.classList.remove("has-file");
  
  if (!file.name.toLowerCase().endsWith(".json") && file.type !== "application/json") {
    if (errEl) {
      errEl.style.display = "block";
      errEl.textContent = "Fehler: Nur .json-Dateien";
    }
    return;
  }
  
  const reader = new FileReader();
  reader.onload = (ev) => {
    const ta = document.getElementById("import-ta");
    if (ta) ta.value = ev.target.result;
    if (fnEl) {
      fnEl.textContent = file.name;
    }
    if (dz) dz.classList.add("has-file");
  };
  
  reader.onerror = () => {
    if (errEl) {
      errEl.style.display = "block";
      errEl.textContent = "Fehler beim Lesen der Datei";
    }
  };
  
  reader.readAsText(file, "UTF-8");
}

export function defaultBDTarget(empName) {
  if (isDutyExempt(empName)) return 0;
  if (empName === "Dr. Polednia") return 3;
  if (empName === "Dr. Becker") return 3;
  if (empName === "Hr. Sebastian") return 3;
  return 4;
}

export function openAutoPlanModal() {
  if (!planMode) return;
  const emps = [...planData.employees];
  
  if (!Object.keys(localAutoPlanTargets).length) {
    emps.forEach((e) => {
      localAutoPlanTargets[e] = defaultBDTarget(e);
    });
  }

  localAutoPlanAlternatives = {};
  localApViewMode = "config";
  showOverlay("modal-autoplan");
  
  const body = document.getElementById("ap-body");
  if (body) {
    body.innerHTML = `
      <div class="ap-config-intro">
        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="flex-shrink:0;color:#0EA5E9">
          <path d="M12 2L2 7l10 5 10-5-10-5z"/>
          <path d="M2 17l10 5 10-5"/>
          <path d="M2 12l10 5 10-5"/>
        </svg>
        <span>Auto-Plan-Konfiguration wird vorbereitet…</span>
      </div>
    `;
  }
  
  localAutoPlanConfigRenderToken += 1;
  const renderToken = localAutoPlanConfigRenderToken;
  
  requestAnimationFrame(() => {
    setTimeout(() => {
      renderAutoPlanModal(renderToken).catch(() => {
        showToast("Auto-Plan-Konfiguration konnte nicht geladen werden");
      });
    }, 0);
  });
}

export async function renderAutoPlanModal(renderToken = null) {
  const { year: y, month: m } = state;
  const emps = [...planData.employees];
  const dutyEmps = emps.filter((e) => !isDutyExempt(e));
  
  const apSub = document.getElementById("ap-sub");
  if (apSub) {
    apSub.textContent = `${MONTHS[m]} ${y}`;
  }
  
  const body = document.getElementById("ap-body");
  const applyBtn = document.getElementById("ap-apply");
  const reportBtn = document.getElementById("ap-report-btn");
  
  if (!body || !applyBtn) return;
  
  if (reportBtn) {
    reportBtn.style.display = "none";
  }

  if (localApViewMode === "config") {
    body.style.display = "flex";
    body.style.flexDirection = "column";
    body.style.height = "100%";
    body.style.maxHeight = "100%";
    body.style.padding = "0";
    body.style.overflow = "hidden";
    applyBtn.style.display = "none";
    
    const hist = await collectHistoricalDutyStatsAsync(y, m);
    
    if (renderToken !== null && renderToken !== localAutoPlanConfigRenderToken) {
      return;
    }
    
    const totalTarget = dutyEmps.reduce((s, e) => s + (localAutoPlanTargets[e] ?? defaultBDTarget(e)), 0);
    const dayCount = daysInMonth(y, m);
    
    let html = `
      <div class="ap-config-container">
        <div class="ap-config-header">
          <div class="ap-hud-block">
            <span class="ap-hud-kicker" style="color:var(--gray-500)">Parameter-Konfiguration</span>
            <div class="ap-hud-title" style="color:var(--gray-800); font-size:16px;">BD-Ziele & Lastverteilung</div>
          </div>
          
          <div class="ap-config-summary">
            <div class="ap-summary-item">
              <span class="ap-summary-label">Tage im Monat</span>
              <span class="ap-summary-value" style="color:var(--gray-700)">${dayCount}</span>
            </div>
            <div class="ap-ls-sep" style="height:24px; margin:0 4px;"></div>
            <div class="ap-summary-item">
              <span class="ap-summary-label">Σ Ziel-Stimmen</span>
              <span class="ap-summary-value" id="ap-total-target">${totalTarget}</span>
            </div>
          </div>
        </div>

        <div class="ap-weight-row" id="ap-weight-row">
          <span class="ap-weight-row-lbl">Gewichtung</span>
          <div class="ap-weight-chips">
            ${Object.values(AUTO_PLAN_WEIGHT_PROFILES).map((p) => `
              <button type="button" class="ap-weight-chip${p.key === localWeightProfile ? " is-active" : ""}" data-profile="${p.key}" title="${p.hint}">${p.label}</button>
            `).join("")}
          </div>
        </div>

        <div class="ap-config-list">
    `;

    dutyEmps.forEach((e) => {
      const meta = getEmpMeta(e);
      const pc = posColor(meta.position);
      const h = hist[e] || { bd: 0, weDuty: 0, satBd: 0 };
      const target = localAutoPlanTargets[e] ?? defaultBDTarget(e);
      
      html += `
        <div class="ap-emp-card">
          <div class="ap-card-top">
            <div class="ap-card-name-group">
              <span class="ap-card-name">${e}</span>
              <span class="ap-card-pos" style="color:${pc.border}">${meta.posLabel}</span>
            </div>
            <div class="ap-input-stepper">
              <button type="button" class="ap-step-btn minus" data-emp="${e}">−</button>
              <input type="number" class="ap-card-input" data-emp="${e}" value="${target}" min="0" max="10" step="1" readonly>
              <button type="button" class="ap-step-btn plus" data-emp="${e}">+</button>
            </div>
          </div>
          
          <div class="ap-card-stats">
            <div class="ap-card-stat" title="Historische BD im aktuellen Jahr">
              <span class="ap-stat-label">Hist. BD</span>
              <span class="ap-stat-val">${h.bd}</span>
            </div>
            <div class="ap-card-stat" title="Historische Samstags-BD">
              <span class="ap-stat-label">Sa-BD</span>
              <span class="ap-stat-val">${h.satBd}</span>
            </div>
          </div>
        </div>
      `;
    });
    
    html += `
        </div>

        <div class="ap-config-footer">
          <div style="flex:1; display:flex; gap:8px;">
            <button type="button" class="mbtn mbtn-ghost" id="ap-reset-defaults" style="font-size:11px; padding:6px 12px;">Standardwerte</button>
          </div>
          <button type="button" class="ap-compute-btn" id="ap-compute">
            <svg class="ap-compute-icon" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
              <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 0l2.83-2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48 0l2.83 2.83"/>
            </svg>
            Berechnen
          </button>
        </div>
      </div>
    `;
    
    body.innerHTML = html;
    
    const updateTotal = () => {
      const tot = dutyEmps.reduce((s, e) => s + (localAutoPlanTargets[e] ?? 0), 0);
      const totEl = document.getElementById("ap-total-target");
      if (totEl) totEl.textContent = tot;
    };

    body.querySelectorAll(".ap-step-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const emp = btn.dataset.emp;
        const isPlus = btn.classList.contains("plus");
        const current = localAutoPlanTargets[emp] ?? defaultBDTarget(emp);
        const next = isPlus ? Math.min(10, current + 1) : Math.max(0, current - 1);
        
        localAutoPlanTargets[emp] = next;
        const input = body.querySelector(`.ap-card-input[data-emp="${emp}"]`);
        if (input) input.value = next;
        updateTotal();
      });
    });
    
    body.querySelectorAll(".ap-weight-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        localWeightProfile = chip.dataset.profile;
        body.querySelectorAll(".ap-weight-chip").forEach((c) => {
          c.classList.toggle("is-active", c.dataset.profile === localWeightProfile);
        });
      });
    });

    document.getElementById("ap-reset-defaults")?.addEventListener("click", () => {
      dutyEmps.forEach((e) => { 
        localAutoPlanTargets[e] = defaultBDTarget(e); 
      });
      body.querySelectorAll(".ap-card-input").forEach((inp) => { 
        inp.value = localAutoPlanTargets[inp.dataset.emp]; 
      });
      updateTotal();
    });
      
    const computeBtn = document.getElementById("ap-compute");
    if (computeBtn) {
      computeBtn.addEventListener("click", () => {
        localApViewMode = "progress";
        renderProgressShell();
        
        requestAnimationFrame(() => {
          setTimeout(async () => {
            const result = await computeAutoPlan(localAutoPlanTargets, localWeightProfile);
            if (!result) {
              showToast("Fehler bei der Berechnung");
              localApViewMode = "config";
              renderAutoPlanModal();
              return;
            }
            localAutoPlanResult = result;
            localAutoPlanAlternatives = { [localWeightProfile]: result };
            Object.keys(AUTO_PLAN_WEIGHT_PROFILES).forEach((key) => {
              if (key === localWeightProfile) return;
              const altResult = computeAutoPlan(localAutoPlanTargets, key);
              if (altResult && typeof altResult.then === "function") {
                altResult.then((r) => { if (r) localAutoPlanAlternatives[key] = r; });
              }
            });
            await streamProgressLogs(result);
          }, 60);
        });
      });
    }
  } else if (localApViewMode === "result") {
    renderResultView();
  }
}

export function renderProgressShell() {
  const body = document.getElementById("ap-body");
  const applyBtn = document.getElementById("ap-apply");
  if (!body) return;
  
  if (applyBtn) applyBtn.style.display = "none";
  
  body.style.height = "";
  body.style.maxHeight = "";
  body.style.overflow = "hidden";
  body.style.padding = "10px";
  body.style.display = "flex";
  body.style.flexDirection = "column";
  
  body.innerHTML = `
    <div class="ap-engine ap-engine-immersive ap-engine-compact" style="flex:1; min-height:0; display:flex; flex-direction:column;">
      <div class="ap-hero-shell ap-hero-shell-compact" style="flex-shrink:0;">
        <div class="ap-hero-hud">
          <div class="ap-hud-block">
            <span class="ap-hud-kicker">RadPlan Neural Scheduler</span>
            <div class="ap-hud-title" id="ap-prog-title">Constraint Analyse</div>
          </div>
          <div class="ap-hud-spectacle" aria-hidden="true" id="ap-hud-spectacle-container">
          </div>
        </div>
        
        <div class="ap-live-stats" aria-label="Live-Statistik">
          <div class="ap-ls-item"><strong class="ap-ls-val" id="ap-ls-bd">0</strong><span class="ap-ls-lbl">D-Dienste</span></div>
          <span class="ap-ls-sep" aria-hidden="true"></span>
          <div class="ap-ls-item"><strong class="ap-ls-val" id="ap-ls-hg">0</strong><span class="ap-ls-lbl">HG-Dienste</span></div>
          <span class="ap-ls-sep" aria-hidden="true"></span>
          <div class="ap-ls-item"><strong class="ap-ls-val" id="ap-ls-rules">0</strong><span class="ap-ls-lbl">Regeln</span></div>
          <span class="ap-ls-sep" aria-hidden="true"></span>
          <div class="ap-ls-item"><strong class="ap-ls-val" id="ap-ls-swaps">0</strong><span class="ap-ls-lbl">Optimierung</span></div>
        </div>

        <div class="ap-bar-wrap" id="ap-bar-wrap">
          <div class="ap-bar-track">
            <div class="ap-bar-fill" id="ap-prog-bar"></div>
            <div class="ap-bar-glow" id="ap-prog-glow"></div>
          </div>
          <div class="ap-bar-info">
            <span class="ap-bar-phase" id="ap-phase-name">Analysiere Constraints...</span>
            <span class="ap-bar-pct" id="ap-prog-pct">0%</span>
          </div>
        </div>
      </div>

      <div class="ap-engine-main" style="flex:1; min-height:0; display:flex; gap:16px;">
        <div class="ap-neural-view">
          <div id="ap-neural-container" style="position:absolute; top:0; left:0; width:100%; height:100%;"></div>
          <div class="ap-neural-vignette" style="pointer-events:none;"></div>
        </div>

        <div class="ap-terminal ap-terminal-deep">
          <div class="ap-term-header">
            <span class="ap-term-title">Trace Console</span>
          </div>
          <div class="ap-term-body" id="ap-term-body"></div>
        </div>
      </div>
    </div>
  `;

  requestAnimationFrame(() => {
    const container = document.getElementById("ap-neural-container");
    if (!container) return;

    if (neuralGraphInstance) {
      neuralGraphInstance.dispose();
    }
    neuralGraphInstance = new NeuralGraph(container);
    const daysCount = daysInMonth(state.year, state.month);
    neuralGraphInstance.initData(daysCount, planData.employees);

    const spectacleContainer = document.getElementById("ap-hud-spectacle-container");
    if (spectacleContainer) {
      neuralGraphInstance.attachMiniMap(spectacleContainer);
    }
  });
}

export async function streamProgressLogs(result) {
  const logContainer = document.getElementById("ap-term-body");
  const barEl = document.getElementById("ap-prog-bar");
  const pctEl = document.getElementById("ap-prog-pct");
  const phaseEl = document.getElementById("ap-phase-name");
  const progTitle = document.getElementById("ap-prog-title");
  
  const log = result.log;
  const telemetry = result.ruleTelemetry?.events || [];

  let bdCount = 0;
  let hgCount = 0;
  let swapCount = 0;
  const logStarted = performance.now();

  const totalTargetDurationMs = 22000;
  const delayPerEntry = Math.max(50, totalTargetDurationMs / log.length);

  for (let i = 0; i < log.length; i++) {
    const entry = log[i];
    await sleep(delayPerEntry);

    let dutyType = "D";
    if (entry.msg && entry.msg.includes("HG")) {
      dutyType = "HG";
    }

    if (entry.icon === "→" || entry.icon === "🟣") {
      if (dutyType === "HG") {
        hgCount++; 
      } else {
        bdCount++;
      }
    }
    
    if (entry.icon === "🔀" || entry.icon === "🔁" || entry.icon === "🧠") {
      swapCount++;
    }
    
    const bdEl = document.getElementById("ap-ls-bd");
    if (bdEl) bdEl.textContent = bdCount;
    
    const hgEl = document.getElementById("ap-ls-hg");
    if (hgEl) hgEl.textContent = hgCount;
    
    const swapEl = document.getElementById("ap-ls-swaps");
    if (swapEl) swapEl.textContent = swapCount;
    
    const rulesEl = document.getElementById("ap-ls-rules");
    if (rulesEl) rulesEl.textContent = telemetry.length;

    if (logContainer) {
      const div = document.createElement("div");
      div.className = "ap-log-entry";
      const t = ((performance.now() - logStarted) / 1000).toFixed(2);
      div.innerHTML = `<span class="ap-log-icon">${entry.icon}</span><span class="ap-log-msg">[${t}s] ${entry.msg}</span>`;
      logContainer.appendChild(div);
      logContainer.scrollTop = logContainer.scrollHeight;
    }

    if (neuralGraphInstance) {
      if (entry.icon === "🔀" || entry.icon === "🔁" || entry.icon === "🧠") {
        if (entry.dayIdx !== undefined && entry.oldEmpId && entry.newEmpId) {
          neuralGraphInstance.triggerSwap(entry.dayIdx, entry.oldEmpId, entry.newEmpId, dutyType);
        }
      } else if (entry.icon === "→" || entry.icon === "🟣") {
        if (entry.dayIdx !== undefined) {
          if (entry.oldEmpId && entry.newEmpId) {
            neuralGraphInstance.triggerSwap(entry.dayIdx, entry.oldEmpId, entry.newEmpId, dutyType);
          } else if (entry.newEmpId || entry.empId) {
            neuralGraphInstance.triggerAssignment(entry.dayIdx, entry.newEmpId || entry.empId, dutyType);
          }
        }
      }
      if (entry.msg.includes("KRITISCH") || entry.msg.includes("Penalty") || entry.icon === "⚠" || entry.icon === "🚨") {
        if (entry.dayIdx !== undefined) {
          neuralGraphInstance.triggerError(entry.dayIdx, entry.newEmpId || entry.empId, dutyType);
        }
      }
      
      if (entry.phase === "deep") {
        if (i % 10 === 0) neuralGraphInstance.setPhase("deep");
        if (progTitle && progTitle.textContent !== "Deep-Search Optimierung") {
          progTitle.textContent = "Deep-Search Optimierung";
        }
      } else if (entry.phase === "hg") {
        if (i % 5 === 0) neuralGraphInstance.setPhase("hg");
        if (progTitle && progTitle.textContent !== "Hintergrund-Allokation") {
          progTitle.textContent = "Hintergrund-Allokation";
        }
      } else if (entry.phase === "greedy" || entry.phase === "bd_weekend" || entry.phase === "bd_workday") {
        if (i % 5 === 0) neuralGraphInstance.setPhase("greedy");
        if (progTitle && progTitle.textContent !== "Greedy-Heuristik Pass") {
          progTitle.textContent = "Greedy-Heuristik Pass";
        }
      } else if (entry.phase === "init" || !entry.phase) {
        if (i % 5 === 0) neuralGraphInstance.setPhase("init");
        if (progTitle && progTitle.textContent !== "Constraint Analyse") {
          progTitle.textContent = "Constraint Analyse";
        }
      }
    }

    if (barEl) barEl.style.width = entry.pct + "%";
    if (pctEl) pctEl.textContent = entry.pct + "%";
    if (phaseEl) phaseEl.textContent = entry.msg;
  }

  if (localApAnimationId) {
    cancelAnimationFrame(localApAnimationId);
  }

  if (neuralGraphInstance) {
     neuralGraphInstance.triggerSuccess(result.assignments);
     if (progTitle) {
       progTitle.textContent = "Berechnung abgeschlossen";
     }
  }

  await new Promise(resolve => {
    const wrap = document.getElementById("ap-bar-wrap");
    if (wrap) {
      wrap.innerHTML = `
        <button type="button" class="mbtn" id="ap-show-result-btn" style="width:100%; justify-content:center; background:linear-gradient(135deg, #22c55e, #16a34a); color:#fff; font-weight:700; box-shadow: 0 4px 14px rgba(34, 197, 94, 0.3); border:none; margin-top:8px;">
          Ergebnis anzeigen
        </button>
      `;
      const btn = document.getElementById("ap-show-result-btn");
      if (btn) {
        btn.addEventListener("click", resolve);
      } else {
        setTimeout(resolve, 1500);
      }
    } else {
      setTimeout(resolve, 1500);
    }
  });

  localApViewMode = "result";
  renderResultView();
}

export function renderResultView() {
  const { year: y, month: m } = state;
  const hols = getSaxonyHolidaysCached(y);
  const emps = [...planData.employees];
  const dutyEmps = emps.filter((e) => !isDutyExempt(e));
  
  const { summary } = localAutoPlanResult;
  const qualityRaw = summary.quality || {};
  const quality = {
    score: String(qualityRaw.score || "0.0"),
    bdSpread: Number(qualityRaw.bdSpread) || 0,
    hgSpread: Number(qualityRaw.hgSpread) || 0,
    weekendSpread: Number(qualityRaw.weekendSpread) || 0,
    wishFulfillmentRate: Number(qualityRaw.wishFulfillmentRate) || 0,
    dutyCoverageMisses: Number(qualityRaw.dutyCoverageMisses) || 0,
    hgCoverageMisses: Number(qualityRaw.hgCoverageMisses) || 0,
    deepMoves: Number(qualityRaw.deepMoves) || 0
  };
  const qualityTooltips = {
    score: "Neural Fitness Index (NFI). Der komprimierte Wert für Abdeckung, Fairness und Regelkonformität.",
    bdSpread: "Differenz zwischen der höchsten und niedrigsten Anzahl an Bereitschaftsdiensten je Person.",
    hgSpread: "Differenz zwischen der höchsten und niedrigsten Anzahl an Hintergrunddiensten je Person.",
    weekendSpread: "Differenz der Dienstverteilung an Wochenenden/Feiertagen zwischen den Mitarbeitenden.",
    wishes: "Prozentanteil erfüllter Dienstwünsche im gewählten Monat.",
    gaps: "Summe der Tage ohne BD- oder HG-Besetzung.",
    deepMoves: "Anzahl zusätzlicher Optimierungsschritte in der finalen Suchphase."
  };
  const body = document.getElementById("ap-body");
  
  body.style.height = "auto";
  body.style.maxHeight = "72vh";
  body.style.overflowY = "auto";
  body.style.padding = "24px";
  body.style.display = "block";
  
  const applyBtn = document.getElementById("ap-apply");
  const reportBtn = document.getElementById("ap-report-btn");
  
  if (applyBtn) applyBtn.style.display = "";
  if (reportBtn) {
    reportBtn.style.display = "inline-flex";
  }

  const dayTag = (d) => {
    const wd = weekday(y, m, d);
    const hol = isHoliday(y, m, d, hols);
    const isWE = wd === 5 || wd === 6 || wd === 0;
    const cls = hol ? " ap-day-hol" : isWE ? " ap-day-we" : "";
    return `<span class="ap-day-tag${cls}">${DOW_ABBR[wd]}\u2009${d}.</span>`;
  };

  let html = `
    <div class="ap-result-hero">
      <div class="ap-result-score is-clickable" id="ap-score-trigger" data-tooltip="${qualityTooltips.score}">
        <span class="ap-result-score-kicker" title="${qualityTooltips.score}">Neural Fitness Index (NFI)</span>
        <strong>${quality.score}</strong>
        <span class="ap-result-score-sub">Maximalwert: 100.0</span>
      </div>
      <div class="ap-result-metrics">
        <div class="ap-result-metric" data-tooltip="${qualityTooltips.bdSpread}"><span>BD-Streuung</span><strong>${quality.bdSpread}</strong></div>
        <div class="ap-result-metric" data-tooltip="${qualityTooltips.hgSpread}"><span>HG-Streuung</span><strong>${quality.hgSpread}</strong></div>
        <div class="ap-result-metric" data-tooltip="${qualityTooltips.weekendSpread}"><span>WE-Dienste</span><strong>${quality.weekendSpread}</strong></div>
        <div class="ap-result-metric" data-tooltip="${qualityTooltips.wishes}"><span>Wünsche</span><strong>${Math.round(quality.wishFulfillmentRate * 100)}%</strong></div>
        <div class="ap-result-metric" data-tooltip="${qualityTooltips.gaps}"><span>Lücken</span><strong>${quality.dutyCoverageMisses + quality.hgCoverageMisses}</strong></div>
        <div class="ap-result-metric" data-tooltip="${qualityTooltips.deepMoves}"><span>Deep-Moves</span><strong>${quality.deepMoves}</strong></div>
      </div>
    </div>
  `;

  const altKeys = Object.keys(AUTO_PLAN_WEIGHT_PROFILES);
  if (altKeys.length > 1 && altKeys.some((k) => localAutoPlanAlternatives[k])) {
    html += `
      <div class="ap-alt-compare">
        <div class="ap-alt-compare-hd">Alternative Gewichtungen</div>
        <div class="ap-alt-cards">
          ${altKeys.map((key) => {
            const profile = AUTO_PLAN_WEIGHT_PROFILES[key];
            const altResult = localAutoPlanAlternatives[key];
            const isActive = key === localWeightProfile;
            if (!altResult) {
              return `
                <div class="ap-alt-card is-loading">
                  <div class="ap-alt-card-name">${profile.label}</div>
                  <div class="ap-alt-card-loading">Wird berechnet…</div>
                </div>
              `;
            }
            const aq = altResult.summary?.quality || {};
            return `
              <div class="ap-alt-card${isActive ? " is-active" : ""}" data-profile="${key}">
                <div class="ap-alt-card-name">${profile.label}${isActive ? ' <span class="ap-alt-card-tag">Aktiv</span>' : ""}</div>
                <div class="ap-alt-card-hint">${profile.hint}</div>
                <div class="ap-alt-card-stats">
                  <span title="${qualityTooltips.score}">NFI <strong>${aq.score || "0.0"}</strong></span>
                  <span title="${qualityTooltips.wishes}">Wünsche <strong>${Math.round((aq.wishFulfillmentRate || 0) * 100)}%</strong></span>
                  <span title="${qualityTooltips.bdSpread}">BD-Streuung <strong>${aq.bdSpread ?? 0}</strong></span>
                  <span title="${qualityTooltips.hgSpread}">HG-Streuung <strong>${aq.hgSpread ?? 0}</strong></span>
                </div>
                ${isActive ? "" : `<button type="button" class="mbtn mbtn-ghost ap-alt-use-btn" data-profile="${key}" style="width:100%; margin-top:8px; font-size:11px; padding:6px 10px; justify-content:center;">Diesen Plan verwenden</button>`}
              </div>
            `;
          }).join("")}
        </div>
      </div>
    `;
  }

  let bdHtml = `
    <div class="ap-table-wrap">
      <table class="ap-table">
        <thead>
          <tr>
            <th class="ap-th-name">Mitarbeitende</th>
            <th class="ap-th">Ziel</th>
            <th class="ap-th">Ist</th>
            <th class="ap-th-days">D-Tage</th>
            <th class="ap-th">WE-Soll</th>
          </tr>
        </thead>
        <tbody>
  `;
  
  dutyEmps.forEach((e) => {
    const bd = summary.bd[e];
    const meta = getEmpMeta(e);
    const pc = posColor(meta.position);
    bdHtml += `
      <tr>
        <td class="ap-td-name" style="border-left:3px solid ${pc.border}">
          <span>${e}</span>
        </td>
        <td class="ap-td ap-td-num">${bd.target}</td>
        <td class="ap-td ap-td-num" style="font-weight:700;color:${bd.count >= bd.target ? '#15803D' : '#B91C1C'}">${bd.count}</td>
        <td class="ap-td ap-td-days">${bd.days.map(d => dayTag(d)).join("")}</td>
        <td class="ap-td ap-td-num">${bd.weDuty}</td>
      </tr>
    `;
  });
  
  bdHtml += `</tbody></table></div>`;
  
  html += `
    <div class="ap-collapse-wrap">
      <div class="ap-collapse-head" onclick="this.parentElement.classList.toggle('is-collapsed')">
        <div class="ap-collapse-title">
          <span class="ap-sect-badge" style="background:#EF4444;color:#fff">D</span>
          Bereitschaftsdienst-Verteilung
        </div>
        <svg class="ap-collapse-icon" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>
      <div class="ap-collapse-content">
        <div class="ap-collapse-content-inner">
          <div class="ap-collapse-content-pad">${bdHtml}</div>
        </div>
      </div>
    </div>
  `;

  let hgHtml = `
    <div class="ap-table-wrap">
      <table class="ap-table">
        <thead>
          <tr>
            <th class="ap-th-name">Mitarbeitende</th>
            <th class="ap-th">HG-Anzahl</th>
            <th class="ap-th-days">HG-Tage</th>
          </tr>
        </thead>
        <tbody>
  `;
  
  emps.filter(e => isFacharzt(e) && !isDutyExempt(e)).forEach((e) => {
    const hg = summary.hg[e];
    const meta = getEmpMeta(e);
    const pc = posColor(meta.position);
    hgHtml += `
      <tr>
        <td class="ap-td-name" style="border-left:3px solid ${pc.border}">
          <span>${e}</span>
        </td>
        <td class="ap-td ap-td-num" style="font-weight:700">${hg.count}</td>
        <td class="ap-td ap-td-days">${hg.days.map(d => dayTag(d)).join("")}</td>
      </tr>
    `;
  });
  
  hgHtml += `</tbody></table></div>`;

  html += `
    <div class="ap-collapse-wrap is-collapsed">
      <div class="ap-collapse-head" onclick="this.parentElement.classList.toggle('is-collapsed')">
        <div class="ap-collapse-title">
          <span class="ap-sect-badge" style="background:#0EA5E9;color:#fff">HG</span>
          Hintergrunddienst-Verteilung
        </div>
        <svg class="ap-collapse-icon" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>
      <div class="ap-collapse-content">
        <div class="ap-collapse-content-inner">
          <div class="ap-collapse-content-pad">${hgHtml}</div>
        </div>
      </div>
    </div>
  `;

  if (summary.infos.length) {
    html += `
      <div class="ap-collapse-wrap is-collapsed">
        <div class="ap-collapse-head" onclick="this.parentElement.classList.toggle('is-collapsed')">
          <div class="ap-collapse-title">
            <span class="ap-sect-badge" style="background:#0EA5E9;color:#fff">i</span>
            Verteilungs-Details
          </div>
          <svg class="ap-collapse-icon" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
        <div class="ap-collapse-content">
          <div class="ap-collapse-content-inner">
            <div class="ap-collapse-content-pad">
              <div class="ap-infos">
                ${summary.infos.map(i => `<div class="ap-info-item">${i}</div>`).join("")}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  if (summary.warnings.length) {
    html += `
      <div class="ap-collapse-wrap">
        <div class="ap-collapse-head" onclick="this.parentElement.classList.toggle('is-collapsed')">
          <div class="ap-collapse-title">
            <span class="ap-sect-badge" style="background:#F97316;color:#fff">!</span>
            Hinweise &amp; Warnungen
          </div>
          <svg class="ap-collapse-icon" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
        <div class="ap-collapse-content">
          <div class="ap-collapse-content-inner">
            <div class="ap-collapse-content-pad">
              <div class="ap-warnings">
                ${summary.warnings.map(w => `<div class="ap-warn-item${w.startsWith('KRITISCH') ? ' ap-warn-item-critical' : ''}">${w}</div>`).join("")}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  html += `
    <div class="ap-config-actions" style="margin-top:20px">
      <button class="mbtn mbtn-ghost" id="ap-back-config">Konfiguration ändern &amp; neu berechnen</button>
    </div>
  `;
  
  body.innerHTML = html;
  
  document.getElementById("ap-back-config")?.addEventListener("click", () => {
    localApViewMode = "config";
    renderAutoPlanModal();
  });
  
  document.getElementById("ap-score-trigger")?.addEventListener("click", () => {
    openScoreInfoModal(localAutoPlanResult);
  });

  body.querySelectorAll(".ap-alt-use-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.profile;
      const altResult = localAutoPlanAlternatives[key];
      if (!altResult) return;
      localWeightProfile = key;
      localAutoPlanResult = altResult;
      renderResultView();
    });
  });
}

export function renderReportModal() {
  if (!localAutoPlanResult || !localAutoPlanResult.report) return;
  
  const { year: y, month: m } = state;
  const hols = getSaxonyHolidaysCached(y);
  const body = document.getElementById("ap-report-body");
  if (!body) return;
  
  body.innerHTML = "";
  
  const list = document.createElement("div");
  list.className = "ap-report-list";

  localAutoPlanResult.report.forEach((item) => {
    const wd = weekday(y, m, item.day);
    const dName = DOW_LONG[wd];
    const holNm = hols[dateKey(y, m, item.day)] || "";
    
    const hasAlternatives = Array.isArray(item.alternatives) && item.alternatives.length > 0;

    const itemEl = document.createElement("div");
    itemEl.className = "ap-report-item";
    itemEl.innerHTML = `
      <div class="ap-report-header">
        <span class="ap-report-date">${dName}, ${item.day}. ${MONTHS_SHORT[m]} ${holNm ? "(" + holNm + ")" : ""}</span>
        <span class="ap-report-duty ${item.duty}">${item.duty}</span>
        <span class="ap-report-emp">${item.emp}</span>
        ${hasAlternatives ? `<button type="button" class="ap-report-why-btn">Warum ${item.emp}?</button>` : ""}
      </div>
      <div class="ap-report-body">${item.reason}</div>
      <div class="ap-report-tags">
        ${item.tags.map(t => `<span class="ap-report-tag">${t}</span>`).join("")}
      </div>
      ${hasAlternatives ? `
        <div class="ap-report-alts" hidden>
          <div class="ap-report-alts-lbl">Nächstbeste Alternativen (verworfen):</div>
          ${item.alternatives.map((a) => `
            <div class="ap-report-alt-row">
              <span class="ap-report-alt-emp">${a.emp}</span>
              <span class="ap-report-alt-score">Score ${a.score}</span>
              <span class="ap-report-alt-tags">${a.tags.join(" · ") || "—"}</span>
            </div>
          `).join("")}
        </div>
      ` : ""}
    `;

    itemEl.querySelector(".ap-report-why-btn")?.addEventListener("click", () => {
      const alts = itemEl.querySelector(".ap-report-alts");
      if (alts) alts.hidden = !alts.hidden;
    });

    list.appendChild(itemEl);
  });

  body.appendChild(list);
  showOverlay("modal-ap-report");
}

export function applyAutoPlan() {
  if (!localAutoPlanResult || !planMode) return;
  
  recordPlanHistory();
  planData.assignments = JSON.parse(JSON.stringify(localAutoPlanResult.assignments));
  
  const external = localAutoPlanResult.externalAssignments || {};
  let changed = false;
  
  for (const [mk, empMap] of Object.entries(external)) {
    if (!DATA[mk]) {
      DATA[mk] = { employees: [...planData.employees], assignments: {}, rbn: {} };
    }
    
    for (const [emp, dayMap] of Object.entries(empMap)) {
      if (!DATA[mk].employees.includes(emp)) {
        DATA[mk].employees.push(emp);
      }
      if (!DATA[mk].assignments[emp]) {
        DATA[mk].assignments[emp] = {};
      }
      for (const [day, patch] of Object.entries(dayMap)) {
        DATA[mk].assignments[emp][day] = { ...(DATA[mk].assignments[emp][day] || {}), ...patch };
        changed = true;
      }
    }
  }
  
  if (changed) {
    saveToStorage();
  }
  
  recordPlanHistory();
  hideOverlay("modal-autoplan");
  render();
  showToast("Auto-Plan erfolgreich übernommen");
  localAutoPlanResult = null;
}

export function quickToggleWorkplace(emp, day, wpCode) {
  const { year: y, month: m } = state;
  const cell = getCell(y, m, emp, day);

  const existingParts = (cell.assignment || "").split("/").map(x => x.trim()).filter(Boolean);
  const hasStatus = existingParts.some(p => STATUSES.find(s => s.code === p));
  if (hasStatus) {
    showToast("Status aktiv — Editor öffnen zum Bearbeiten");
    return;
  }

  const existingWPs = existingParts.filter(p => WORKPLACES.find(w => w.code === p));
  const newWPs = existingWPs.includes(wpCode)
    ? existingWPs.filter(w => w !== wpCode)
    : [...existingWPs, wpCode];

  const newAssignment = newWPs.length ? newWPs.join("/") : null;

  if (planMode) recordPlanHistory();
  if (!planMode) {
    recordHistory({
      type: "quick-edit",
      description: `${emp}, Tag ${day}: ${wp?.label || wpCode} ${newWPs.includes(wpCode) ? "gesetzt" : "entfernt"}`
    });
  }
  setCell(y, m, emp, day, { assignment: newAssignment, duty: cell.duty || null });
  if (planMode) recordPlanHistory();

  const wp = WORKPLACES.find(w => w.code === wpCode);
  showToast(newWPs.includes(wpCode)
    ? `${wp?.label || wpCode} gesetzt`
    : `${wp?.label || wpCode} entfernt`);
  render();
  focusCellAfterRender(emp, day);
}

export function quickToggleDuty(emp, day, dutyCode) {
  const { year: y, month: m } = state;
  const cell = getCell(y, m, emp, day);

  const owner = dutyOwner(y, m, day, dutyCode);
  if (owner && owner !== emp) {
    showToast(`${dutyCode} bereits vergeben an: ${owner}`);
    return;
  }

  const newDuty = cell.duty === dutyCode ? null : dutyCode;

  if (planMode) recordPlanHistory();
  if (!planMode) {
    recordHistory({
      type: "quick-duty",
      description: `${emp}, Tag ${day}: ${newDuty ? newDuty + " gesetzt" : dutyCode + " entfernt"}`
    });
  }
  setCell(y, m, emp, day, { assignment: cell.assignment || null, duty: newDuty });

  if (newDuty === "D") {
    const next = nextCalendarDay(y, m, day);
    const ex = getCell(next.y, next.m, emp, next.d);
    if (!ex.assignment) {
      setCell(next.y, next.m, emp, next.d, { assignment: "F", duty: ex.duty || null });
      showToast("Bereitschaftsdienst gesetzt · F automatisch für Folgetag");
    } else {
      showToast("Bereitschaftsdienst gesetzt");
    }
  } else if (newDuty === "HG") {
    showToast("Hintergrunddienst gesetzt");
  } else {
    showToast(`${dutyCode === "HG" ? "HG" : "BD"} entfernt`);
  }

  if (planMode) recordPlanHistory();
  render();
  focusCellAfterRender(emp, day);
}

export function moveDutyBadge(srcEmp, srcDay, dstEmp, dstDay) {
  const { year: y, month: m } = state;
  if (srcEmp === dstEmp && srcDay === dstDay) return;

  const srcCell = getCell(y, m, srcEmp, srcDay);
  const dutyCode = srcCell.duty;
  if (!dutyCode) return;

  const dstCell = getCell(y, m, dstEmp, dstDay);
  if (dstCell.duty && dstCell.duty !== dutyCode) {
    showToast(`Zielzelle hat bereits ${dstCell.duty}-Dienst`);
    return;
  }

  if (dstDay !== srcDay) {
    const owner = dutyOwner(y, m, dstDay, dutyCode);
    if (owner && owner !== dstEmp && owner !== srcEmp) {
      showToast(`${dutyCode} bereits vergeben an: ${owner}`);
      return;
    }
  }

  if (planMode) recordPlanHistory();
  setCell(y, m, srcEmp, srcDay, { assignment: srcCell.assignment || null, duty: dstCell.duty || null });
  setCell(y, m, dstEmp, dstDay, { assignment: dstCell.assignment || null, duty: dutyCode });
  if (planMode) recordPlanHistory();

  showToast(`${dutyCode}-Dienst verschoben: ${srcEmp} (${srcDay}.) → ${dstEmp} (${dstDay}.)`);
  render();
  focusCellAfterRender(dstEmp, dstDay);
}

export function quickClearCell(emp, day) {
  const { year: y, month: m } = state;
  if (planMode) recordPlanHistory();
  if (!planMode) {
    recordHistory({
      type: "quick-clear",
      description: `${emp}, Tag ${day}: gelöscht`
    });
  }
  clearCell(y, m, emp, day);
  if (planMode) recordPlanHistory();
  showToast("Eintrag gelöscht");
  render();
  focusCellAfterRender(emp, day);
}

export function quickSetStatus(emp, day, statusCode) {
  const { year: y, month: m } = state;
  const cell = getCell(y, m, emp, day);
  const isActive = cell.assignment === statusCode;
  const newAssignment = isActive ? null : statusCode;

  if (planMode) recordPlanHistory();
  if (!planMode) {
    recordHistory({
      type: "quick-status",
      description: `${emp}, Tag ${day}: ${isActive ? "Status entfernt" : (st?.label || statusCode) + " gesetzt"}`
    });
  }
  setCell(y, m, emp, day, { assignment: newAssignment, duty: cell.duty || null });
  if (planMode) recordPlanHistory();

  const st = STATUSES.find(s => s.code === statusCode);
  showToast(isActive ? `${st?.label || statusCode} entfernt` : `${st?.label || statusCode} gesetzt`);
  render();
  focusCellAfterRender(emp, day);
}

export function wireEvents() {
  document.getElementById("btn-prev")?.addEventListener("click", () => changeMonth(-1));
  document.getElementById("btn-next")?.addEventListener("click", () => changeMonth(1));
  document.getElementById("btn-today")?.addEventListener("click", handleTodayClick);
  document.getElementById("btn-theme")?.addEventListener("click", (e) => toggleTheme(e));
  document.getElementById("btn-density")?.addEventListener("click", toggleDensity);
  initCommandPalette();

  document.getElementById("btn-employees")?.addEventListener("click", () => {
    const { year: y } = state;
    const employees = getEmployeesForYear(y);
    if (!state.employeeDashboard.selectedEmp || !employees.includes(state.employeeDashboard.selectedEmp)) {
      state.employeeDashboard.selectedEmp = employees[0] || null;
    }
    const empSub = document.getElementById("emp-sub");
    if (empSub) {
      empSub.textContent = `Kalenderjahr ${y}`;
    }
    renderEmployeeDashboard();
    showOverlay("modal-emps");
    setTimeout(() => document.getElementById("emp-search")?.focus(), 80);
  });
  
  document.getElementById("month-label-btn")?.addEventListener("click", () => { 
    if (isPeriodFlyoutOpen()) {
      closePeriodFlyout(); 
    } else {
      openPeriodFlyout(); 
    }
  });
  
  document.getElementById("emp-open-period")?.addEventListener("click", openPeriodFlyout);
  document.getElementById("period-flyout-close")?.addEventListener("click", closePeriodFlyout);
  
  document.getElementById("period-month-select")?.addEventListener("change", (e) => { 
    state.periodDraft.month = parseInt(e.target.value, 10); 
    syncPeriodControls(); 
  });
  
  document.getElementById("period-year-input")?.addEventListener("input", (e) => { 
    state.periodDraft.year = parseInt(e.target.value, 10) || state.year; 
    syncPeriodControls(); 
  });
  
  document.getElementById("period-apply")?.addEventListener("click", applyPeriodDraft);
  
  document.getElementById("period-today")?.addEventListener("click", () => { 
    state.periodDraft = { year: TOD_Y, month: TOD_M }; 
    applyPeriodDraft(); 
    setTimeout(doScrollToToday, 150); 
  });
  
  document.getElementById("period-prev-month")?.addEventListener("click", () => { 
    const total = state.periodDraft.year * 12 + state.periodDraft.month - 1; 
    state.periodDraft.year = Math.floor(total / 12); 
    state.periodDraft.month = ((total % 12) + 12) % 12; 
    syncPeriodControls(); 
  });
  
  document.getElementById("period-next-month")?.addEventListener("click", () => { 
    const total = state.periodDraft.year * 12 + state.periodDraft.month + 1; 
    state.periodDraft.year = Math.floor(total / 12); 
    state.periodDraft.month = ((total % 12) + 12) % 12; 
    syncPeriodControls(); 
  });
  
  document.getElementById("period-prev-year")?.addEventListener("click", () => { 
    state.periodDraft.year -= 1; 
    syncPeriodControls(); 
  });
  
  document.getElementById("period-next-year")?.addEventListener("click", () => { 
    state.periodDraft.year += 1; 
    syncPeriodControls(); 
  });
  
  document.getElementById("emp-search")?.addEventListener("input", (e) => { 
    state.employeeDashboard.filter = e.target.value; 
    renderEmployeeDashboard(); 
  });
  
  document.querySelectorAll(".empdash-view-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.employeeDashboard.detailView = btn.dataset.view;
      renderEmployeeDashboard();
    });
  });

  const empSortEl = document.getElementById("emp-sort");
  if (empSortEl) {
    empSortEl.value = state.employeeDashboard.sort || "name";
    empSortEl.addEventListener("change", (e) => {
      state.employeeDashboard.sort = e.target.value;
      renderEmployeeDashboard();
    });
  }

  const empActiveEl = document.getElementById("emp-active-only");
  if (empActiveEl) {
    empActiveEl.checked = !!state.employeeDashboard.activeOnly;
    empActiveEl.addEventListener("change", (e) => {
      state.employeeDashboard.activeOnly = e.target.checked;
      renderEmployeeDashboard();
    });
  }

  document.getElementById("emp-export-csv")?.addEventListener("click", () => {
    const n = exportEmployeeDashboardCSV();
    showToast(n ? `${n} Mitarbeitende als CSV exportiert` : "Keine Daten zum Export");
  });
  
  document.addEventListener("click", (e) => {
    const flyout = document.getElementById("period-flyout");
    const trigger = document.getElementById("month-label-btn");
    const inlineBtn = document.getElementById("emp-open-period");
    
    if (!isPeriodFlyoutOpen()) return;
    if (flyout?.contains(e.target) || trigger?.contains(e.target) || inlineBtn?.contains(e.target)) {
      return;
    }
    
    closePeriodFlyout();
  });
  
  document.getElementById("btn-yearplan")?.addEventListener("click", () => {
    openYearPlan(state.year);
    renderYearPlanContent();
    showOverlay("modal-yearplan");
  });

  const commentTa = document.getElementById("ed-comment-ta");
  const commentCount = document.getElementById("ed-comment-count");
  if (commentTa && commentCount) {
    commentTa.addEventListener("input", () => {
      commentCount.textContent = `${commentTa.value.length}/200`;
    });
  }

  document.getElementById("btn-export")?.addEventListener("click", () => {
    doExport();
  });

  document.getElementById("btn-print")?.addEventListener("click", () => {
    printPlan();
  });

  document.getElementById("btn-import")?.addEventListener("click", () => {
    openImportModal();
  });
  
  document.getElementById("btn-force-sync")?.addEventListener("click", async () => {
    if (!confirm("WARNUNG: Alle lokalen Entwürfe und ungespeicherten Änderungen werden gelöscht und durch den aktuellen Server-Stand ersetzt. Wirklich fortfahren?")) return;
    const success = await forceSyncWithServer();
    if (success) {
      ensurePostBDFreiDays();
      render();
      showToast("Lokale Daten verworfen und mit Server synchronisiert");
    } else {
      showToast("Fehler bei der Server-Synchronisation");
    }
  });
  
  document.getElementById("btn-plan")?.addEventListener("click", () => { 
    if (planMode) {
      closePlanMode(); 
    } else {
      enterPlanMode(); 
    }
  });
  
  document.getElementById("mnav-dept")?.addEventListener("click", () => {
    document.getElementById("btn-employees")?.click();
  });
  
  document.getElementById("mnav-plan")?.addEventListener("click", () => { 
    if (planMode) {
      closePlanMode(); 
    } else {
      enterPlanMode(); 
    }
  });
  
  document.getElementById("mnav-menu")?.addEventListener("click", () => showOverlay("modal-mobile-menu"));
  
  document.getElementById("mbtn-employees")?.addEventListener("click", () => { 
    hideOverlay("modal-mobile-menu"); 
    setTimeout(() => document.getElementById("btn-employees")?.click(), 180); 
  });
  
  document.getElementById("mbtn-today")?.addEventListener("click", () => { 
    hideOverlay("modal-mobile-menu"); 
    setTimeout(handleTodayClick, 180); 
  });
  
  document.getElementById("mbtn-export")?.addEventListener("click", () => { 
    hideOverlay("modal-mobile-menu"); 
    setTimeout(() => doExport(), 180); 
  });
  
  document.getElementById("mbtn-import")?.addEventListener("click", () => { 
    hideOverlay("modal-mobile-menu"); 
    setTimeout(() => openImportModal(), 180); 
  });

  document.getElementById("mbtn-force-sync")?.addEventListener("click", () => {
    hideOverlay("modal-mobile-menu");
    setTimeout(async () => {
      if (!confirm("WARNUNG: Alle lokalen Entwürfe und ungespeicherten Änderungen werden gelöscht und durch den aktuellen Server-Stand ersetzt. Wirklich fortfahren?")) return;
      const success = await forceSyncWithServer();
      if (success) {
        ensurePostBDFreiDays();
        render();
        showToast("Lokale Daten verworfen und mit Server synchronisiert");
      } else {
        showToast("Fehler bei der Server-Synchronisation");
      }
    }, 180);
  });
  
  document.getElementById("btn-plan-apply")?.addEventListener("click", () => { 
    if (!confirm("Planungsentwurf in den Hauptplan übernehmen?")) return; 
    applyPlanToMain(); 
  });
  
  document.getElementById("btn-plan-save")?.addEventListener("click", savePlanDraft);
  document.getElementById("btn-plan-abort")?.addEventListener("click", abortPlanChanges);
  document.getElementById("btn-plan-close")?.addEventListener("click", closePlanMode);
  document.getElementById("btn-plan-undo")?.addEventListener("click", undoPlan);
  document.getElementById("btn-plan-redo")?.addEventListener("click", redoPlan);
  document.getElementById("btn-plan-auto")?.addEventListener("click", openAutoPlanModal);
  document.getElementById("ap-apply")?.addEventListener("click", applyAutoPlan);
  
  document.getElementById("ed-save")?.addEventListener("click", () => {
    saveEditor();
  });
  
  document.getElementById("ed-cancel")?.addEventListener("click", () => hideOverlay("modal-editor"));
  
  document.getElementById("ed-clear")?.addEventListener("click", () => {
    const { year: y, month: m } = state;
    const { emp, day, isRbnRow } = state.edit || {};
    const days = Array.isArray(state.edit?.days) && state.edit.days.length
      ? state.edit.days
      : (day ? [day] : []);

    if (planMode) recordPlanHistory();

    if (isRbnRow) {
      setRbnValue(y, m, day, "");
    } else {
      days.forEach(targetDay => clearCell(y, m, emp, targetDay));
    }

    if (planMode) recordPlanHistory();

    state.multiEdit = { emp: null, days: [] };
    hideOverlay("modal-editor");
    render();
  });
  
  document.getElementById("import-confirm")?.addEventListener("click", () => {
    doImport();
  });
  
  document.getElementById("dept-tab-month")?.addEventListener("click", () => {
    setDeptTab("month");
    document.querySelectorAll(".dept-tab").forEach((t) => t.classList.remove("active"));
    document.getElementById("dept-tab-month")?.classList.add("active");
    renderDeptContent();
  });
  
  document.getElementById("dept-tab-year")?.addEventListener("click", () => {
    setDeptTab("year");
    document.querySelectorAll(".dept-tab").forEach((t) => t.classList.remove("active"));
    document.getElementById("dept-tab-year")?.classList.add("active");
    renderDeptContent();
  });
  
  document.querySelectorAll("[data-close]").forEach((btn) => {
    btn.addEventListener("click", () => hideOverlay(btn.dataset.close));
  });
  
  document.querySelectorAll(".overlay").forEach((ov) => {
    ov.addEventListener("click", (e) => { 
      if (e.target === ov) hideOverlay(ov.id); 
    });
  });
  
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      [
        "modal-editor", "modal-emps", "modal-import", "modal-profile", "modal-dept",
        "modal-yearplan", "modal-autoplan", "modal-ap-report", "modal-mobile-menu",
        "modal-mobile-day", "modal-score-info", "modal-command-palette"
      ].forEach((id) => {
        const el = document.getElementById(id);
        if (el && !el.hasAttribute("hidden")) hideOverlay(id);
      });
      if (isPeriodFlyoutOpen()) closePeriodFlyout();
      return;
    }
    
    if (isEditorOpen()) {
      if (state.edit?.isRbnRow) {
        if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && (e.key === "s" || e.key === "S" || e.key === "Enter")) {
          e.preventDefault(); 
          saveEditor(); 
          return;
        }
      }
      
      const noMod = !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey;
      if (state.edit?.isRbnRow) return;
      
      if (noMod && e.key >= "1" && e.key <= "8") {
        const idx = parseInt(e.key, 10) - 1;
        if (!state.ed.st) { 
          e.preventDefault(); 
          const code = WORKPLACES[idx].code; 
          const i = state.ed.wp.indexOf(code); 
          if (i >= 0) {
            state.ed.wp.splice(i, 1); 
          } else {
            state.ed.wp.push(code); 
          }
          refreshEditorChips(); 
        }
        return;
      }
      
      if (noMod && (e.key === "d" || e.key === "D")) { 
        e.preventDefault(); 
        const owner = dutyOwner(state.year, state.month, state.edit.day, "D"); 
        if (!owner || owner === state.edit.emp) { 
          state.ed.duty = state.ed.duty === "D" ? null : "D"; 
          refreshEditorChips(); 
        } 
        return; 
      }
      
      if (noMod && (e.key === "h" || e.key === "H")) { 
        e.preventDefault(); 
        const owner = dutyOwner(state.year, state.month, state.edit.day, "HG"); 
        if (!owner || owner === state.edit.emp) { 
          state.ed.duty = state.ed.duty === "HG" ? null : "HG"; 
          refreshEditorChips(); 
        } 
        return; 
      }
      
      if (noMod && (e.key === "s" || e.key === "S")) { 
        e.preventDefault(); 
        saveEditor(); 
        return; 
      }
      
      if (e.key === "Enter" && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        const tag = (document.activeElement?.tagName || "").toUpperCase();
        const isCancel = ["ed-cancel", "ed-clear"].includes(document.activeElement?.id || "");
        if (tag !== "BUTTON" || (!isCancel && document.activeElement?.id === "ed-save")) { 
          if (tag !== "BUTTON") { 
            e.preventDefault(); 
            saveEditor(); 
          } 
        }
        return;
      }
    }
    
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === "s") { 
      e.preventDefault(); 
      if (planMode) {
        savePlanDraft(); 
      } else {
        doExport(); 
      }
      return; 
    }
    
    if (planMode) {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === "z") { 
        e.preventDefault(); 
        undoPlan(); 
        return; 
      }
      if ((e.ctrlKey || e.metaKey) && ((e.shiftKey && e.key === "z") || e.key === "y")) { 
        e.preventDefault(); 
        redoPlan(); 
        return; 
      }
    }
    
    if (e.altKey && e.key === "ArrowLeft") {
      document.getElementById("btn-prev")?.click();
    }
    if (e.altKey && e.key === "ArrowRight") {
      document.getElementById("btn-next")?.click();
    }
  });
  
  const gridWrapper = document.getElementById("grid-wrapper");
  if (gridWrapper) {
    gridWrapper.addEventListener("wheel", (e) => { 
      // Handle wheel events explicitly for predictable UX
      const isEmployeeCol = e.target.closest('.td-name, .th-corner');
      const scrollingVertical = e.shiftKey || isEmployeeCol;
      
      // Use the maximum delta to support high-res mice and trackpads
      const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      
      if (delta !== 0) {
        e.preventDefault();
        if (scrollingVertical) {
          gridWrapper.scrollTop += delta;
        } else {
          gridWrapper.scrollLeft += delta;
        }
      }
    }, { passive: false });
  }
  
  initDragDrop();
  initGridKeyboardHandlers();

  const apReportBtn = document.getElementById("ap-report-btn");
  if (apReportBtn) {
    apReportBtn.addEventListener("click", renderReportModal);
  }
}

export async function init() {
  initTheme();
  initDensity();
  initNewFeatures();
  await loadFromStorage();
  ensurePostBDFreiDays();
  
  if (!Object.keys(DATA).length && serverFetchSuccessful && serverLastModified === 0) {
    const k = monthKey(state.year, state.month);
    DATA[k] = {
      employees: [
        "Prof. Schäfer", "Dr. Lurz", "Dr. Polednia", "Fr. Dalitz", "Fr. Thaler", 
        "Dr. Becker", "Dr. Martin", "Hr. El Houba", "Fr. Licenji", "Hr. Torki", "Hr. Sebastian"
      ].filter((emp) => isEmployeeActiveInMonth(emp, state.year, state.month)),
      assignments: {}, 
      rbn: {},
    };
    saveToStorage();
  }
  
  populatePeriodMonthSelect();
  syncPeriodControls();
  wireEvents();
  setupYearPlanModal();

  // Jahresplan-Navigation: Klick auf Gitterzelle springt zum Monat
  window.addEventListener('radplan-navigate', (e) => {
    const { year, month } = e.detail || {};
    if (Number.isFinite(year) && Number.isFinite(month)) {
      hideOverlay('modal-yearplan');
      setTimeout(() => switchPeriod(year, month), 180);
    }
  });

  // Jahresplan aufräumen wenn Modal geschlossen wird
  const ypModal = document.getElementById('modal-yearplan');
  if (ypModal) {
    new MutationObserver(mutations => {
      mutations.forEach(mut => {
        if (mut.attributeName === 'hidden' && ypModal.hasAttribute('hidden')) {
          cleanupYearPlan();
        }
      });
    }).observe(ypModal, { attributes: true });
  }
  
  refreshResponsiveLayout({ forceRender: true });

  const apModal = document.getElementById("modal-autoplan");
  if (apModal) {
    new MutationObserver((mutations) => {
      mutations.forEach((m) => {
        if (m.attributeName === "hidden" && apModal.hasAttribute("hidden")) {
          if (neuralGraphInstance) {
            neuralGraphInstance.dispose();
            neuralGraphInstance = null;
          }
        }
      });
    }).observe(apModal, { attributes: true });
  }
  
  window.addEventListener("resize", () => {
    queueResponsiveRefresh();
  }, { passive: true });
  
  window.addEventListener("orientationchange", () => {
    queueResponsiveRefresh();
  }, { passive: true });
  
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", () => {
      queueResponsiveRefresh();
    }, { passive: true });
  }

  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState === "visible") {
       const updated = await syncWithServer();
       if (updated) {
         ensurePostBDFreiDays();
       }
    }
  });

  window.addEventListener("radplan-sync-update", () => {
    render();
    showToast("Daten im Hintergrund aktualisiert");
  });

  window.addEventListener("radplan-sync-conflict", (e) => {
    render();
    const stats = e.detail || {};
    if (stats.conflicts > 0) {
      showToast(`Speicher-Konflikt: ${stats.conflicts} Feld(er) kollidierten, lokaler Stand übernommen`);
    } else if (stats.localWins > 0 || stats.serverWins > 0) {
      showToast(`Speicher-Konflikt automatisch zusammengeführt (${stats.localWins} lokal, ${stats.serverWins} vom Server)`);
    } else {
      showToast("Speicher-Konflikt: Aktuellster Server-Stand geladen");
    }
  });

  window.addEventListener("radplan-save-start", () => {
    showToast("Wird gespeichert...");
  });

  window.addEventListener("radplan-save-success", () => {
    showToast("Erfolgreich gespeichert");
  });

  window.addEventListener("radplan-save-error", () => {
    showToast("Netzwerkfehler beim Speichern");
  });

  setInterval(async () => {
    if (document.visibilityState === "visible") {
      const updated = await syncWithServer();
      if (updated) {
        ensurePostBDFreiDays();
      }
    }
  }, 30000);
}

document.addEventListener("DOMContentLoaded", init);

window.openScoreInfoModal = () => {
  if (localAutoPlanResult) {
    openScoreInfoModal(localAutoPlanResult);
  }
};
