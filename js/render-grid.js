import {
  WORKPLACES,
  STATUSES,
  CODE_MAP,
  MONTHS,
  DOW_ABBR,
  RBN_ROW_KEY,
  RBN_ROW_LABEL,
  getEmpMeta,
  posColor,
  getSaxonyHolidaysCached,
  dateKey,
  daysInMonth,
  weekday,
  isWeekend,
  isFriday,
  isHoliday,
  isTodayCol,
  isoWeekNumber,
  cellColor,
  MOBILE_BREAKPOINT,
  isRbnMonthVisible,
  formatRbnDisplay,
  WISH_MAP
} from './constants.js';

import {
  state,
  planMode,
  IS_MOBILE,
  TOD_Y,
  TOD_M,
  TOD_D,
  setIsMobile
} from './state.js';

import {
  getMonthData,
  getCell,
  getRbnValue,
  dayCodeCount,
  dayPresentCount,
  getComment
} from './model.js';

import {
  openEditor,
  getWish,
  isPinned,
  togglePinned,
  syncPeriodControls,
  quickToggleWorkplace,
  quickToggleDuty,
  quickClearCell,
  quickSetStatus,
  moveDutyBadge
} from './app.js';

import { computeGridConflicts, dutyKey } from './autoplan.js';
import { contextMenu } from './contextmenu.js';
import { hideOverlay, showToast, openProfileModal } from './render-modals.js';
import { renderDeptContent } from './render-dept.js';
import { renderEmployeeDashboard } from './render-employee-dashboard.js';

const dragSelectionState = {
  active: false,
  emp: null,
  mode: "add", // "add" | "remove"
  justDragged: false,
  touched: new Set(),
  startEmp: null,
  startDay: null,
  dismissOnClick: false,
};

function resetDragSelectionState() {
  dragSelectionState.active = false;
  dragSelectionState.emp = null;
  dragSelectionState.mode = "add";
  dragSelectionState.touched = new Set();
  dragSelectionState.startEmp = null;
  dragSelectionState.startDay = null;
  dragSelectionState.dismissOnClick = false;
  document.body.classList.remove("is-drag-selecting");
}

/** Setzt den Auswahlzustand eines Tages; gibt true zurück, wenn sich etwas änderte. */
function setDaySelected(emp, day, selected) {
  if (!emp || !Number.isFinite(day) || emp === RBN_ROW_KEY) return false;
  const me = state.multiEdit;
  if (me.emp !== emp) {
    me.emp = emp;
    me.days = [];
    me.anchor = null;
  }
  const idx = me.days.indexOf(day);
  if (selected && idx < 0) {
    me.days.push(day);
    me.days.sort((a, b) => a - b);
    me.anchor = day;
    return true;
  }
  if (!selected && idx >= 0) {
    me.days.splice(idx, 1);
    if (me.anchor === day) me.anchor = me.days[me.days.length - 1] ?? null;
    return true;
  }
  return false;
}

function applyDragSelection(emp, day) {
  setDaySelected(emp, day, dragSelectionState.mode === "add");
}

/**
 * Synchronisiert nur die `.multi-selected`-Klassen der vorhandenen Zellen,
 * ohne das gesamte Raster neu zu zeichnen. Das hält Ziehgesten flüssig.
 */
function syncSelectionClasses() {
  const tbody = document.getElementById("plan-tbody");
  if (!tbody) return;
  const me = state.multiEdit;
  const emp = me?.emp || null;
  const days = Array.isArray(me?.days) ? me.days : [];
  // Markierung erst ab zwei Zellen sichtbar machen (Einzelzelle → Fokusring genügt).
  const show = days.length > 1;
  tbody.querySelectorAll(".td-cell").forEach((cell) => {
    const sel = show && cell.dataset.emp === emp && days.includes(parseInt(cell.dataset.day, 10));
    cell.classList.toggle("multi-selected", sel);
  });
}

export function getViewportWidth() {
  const vv = window.visualViewport?.width;
  const dw = document.documentElement?.clientWidth;
  const ww = window.innerWidth;
  return Math.min(...[vv, dw, ww].filter((v) => Number.isFinite(v) && v > 0));
}

export function getViewportHeight() {
  const vv = window.visualViewport?.height;
  const dw = document.documentElement?.clientHeight;
  const ww = window.innerHeight;
  // Prioritize stable dimensions on desktop, but allow visualViewport for mobile/keyboard overlays
  const vals = [vv, dw, ww].filter(v => Number.isFinite(v) && v > 0);
  return vals.length ? Math.min(...vals) : 0;
}

function syncViewportCssVars() {
  const root = document.documentElement;
  if (!root) return;

  const viewportW = getViewportWidth();
  const viewportH = getViewportHeight();
  const vv = window.visualViewport;

  const keyboardInset = vv
    ? Math.max(0, Math.round(window.innerHeight - (vv.height + vv.offsetTop)))
    : 0;

  root.style.setProperty("--app-vw", `${Math.max(320, Math.round(viewportW || 0))}px`);
  root.style.setProperty("--app-vh", `${Math.max(320, Math.round(viewportH || 0))}px`);
  root.style.setProperty("--kb-inset", `${keyboardInset}px`);

  const standalone = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator?.standalone === true;
  document.body.classList.toggle("is-standalone", !!standalone);
}

// Ensure the layout syncs on every relevant event
window.addEventListener("resize", syncViewportCssVars);
window.visualViewport?.addEventListener("resize", syncViewportCssVars);
syncViewportCssVars(); // Immediate initial sync


export function updateModalLayout(target) {
  const overlay = typeof target === "string" ? document.getElementById(target) : target;
  if (!overlay || overlay.hasAttribute("hidden")) return;
  
  const modal = overlay.querySelector(".modal");
  if (!modal) return;
  
  const viewportH = getViewportHeight();
  const viewportW = getViewportWidth();
  
  const mobileSheet = document.body.classList.contains("is-mobile") && 
                      overlay.id !== "modal-mobile-menu" && 
                      overlay.id !== "modal-mobile-day";
                      
  const pad = mobileSheet ? 0 : Math.max(10, Math.min(24, viewportW * 0.024));
  const availableH = Math.max(280, Math.floor(viewportH - pad * 2));
  
  modal.style.setProperty("--modal-max-height", `${availableH}px`);
  
  requestAnimationFrame(() => {
    const naturalHeight = modal.scrollHeight;
    const fitsViewport = naturalHeight <= availableH;
    modal.classList.toggle("modal-fit-content", fitsViewport);
    modal.classList.toggle("modal-fit-viewport", !fitsViewport);
  });
}

export function updateOpenModalLayouts() {
  document.querySelectorAll(".overlay:not([hidden])").forEach((overlay) => {
    updateModalLayout(overlay);
  });
}

export function refreshResponsiveLayout(options = {}) {
  const { forceRender = false } = options;
  syncViewportCssVars();
  const width = getViewportWidth();
  const coarsePointer = window.matchMedia ? window.matchMedia("(pointer: coarse)").matches : false;
  const touchLike = coarsePointer || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  const nextMobile = width <= MOBILE_BREAKPOINT;
  
  const changed = nextMobile !== IS_MOBILE;
  setIsMobile(nextMobile);
  document.body.classList.toggle("is-mobile", IS_MOBILE);
  
  if (!changed && !forceRender) {
    updateOpenModalLayouts();
    return false;
  }
  
  if (!IS_MOBILE) {
    hideOverlay("modal-mobile-menu");
    hideOverlay("modal-mobile-day");
  }
  
  render();
  refreshOpenContextPanels();
  updateOpenModalLayouts();
  
  return true;
}

let responsiveRefreshTimer = null;
let responsiveRefreshQueued = false;

export function queueResponsiveRefresh() {
  if (responsiveRefreshTimer) {
    clearTimeout(responsiveRefreshTimer);
  }
  if (responsiveRefreshQueued) {
    return;
  }
  responsiveRefreshQueued = true;
  responsiveRefreshTimer = setTimeout(() => {
    responsiveRefreshTimer = null;
    requestAnimationFrame(() => {
      responsiveRefreshQueued = false;
      refreshResponsiveLayout();
    });
  }, 90);
}

export function scrollToToday() {
  if (state.year !== TOD_Y || state.month !== TOD_M) {
    showToast(`Heute liegt in ${MONTHS[TOD_M]} ${TOD_Y}`);
    return;
  }

  const mobileTodayCard = document.querySelector(".mobile-day-card.mdc-today");
  if (mobileTodayCard) {
    mobileTodayCard.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    return;
  }

  const todayCol = document.querySelector("#plan-thead th.today");
  const todayCell = document.querySelector("#plan-tbody td.today-col");
  const gridWrapper = document.getElementById("grid-wrapper");

  if (todayCell) {
    todayCell.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  }

  if (gridWrapper && todayCol) {
    const targetX = todayCol.offsetLeft - Math.max(0, (gridWrapper.clientWidth - todayCol.offsetWidth) / 2);
    gridWrapper.scrollTo({ left: Math.max(0, targetX), behavior: "smooth" });
  }
}

export function refreshOpenContextPanels() {
  const deptModal = document.getElementById("modal-dept");
  if (deptModal && !deptModal.hasAttribute("hidden")) {
    renderDeptContent();
  }
  
  const empModal = document.getElementById("modal-emps");
  if (empModal && !empModal.hasAttribute("hidden")) {
    // Person-Screen offen → Personendetails neu rendern, sonst Teamübersicht.
    if (state.empScreen === "person" && state.profileEmp) {
      openProfileModal(state.profileEmp);
    } else {
      renderEmployeeDashboard();
    }
  }
}

export function focusCellAfterRender(emp, day) {
  requestAnimationFrame(() => {
    const tbody = document.getElementById('plan-tbody');
    if (!tbody) return;
    const cells = tbody.querySelectorAll('.td-cell');
    for (const cell of cells) {
      if (cell.dataset.emp === emp && parseInt(cell.dataset.day, 10) === day) {
        cell.focus({ preventScroll: true });
        break;
      }
    }
  });
}

function focusAdjacentCell(currentCell, rowDelta, colDelta) {
  if (colDelta !== 0) {
    const targetDay = parseInt(currentCell.dataset.day, 10) + colDelta;
    const row = currentCell.closest('tr');
    if (!row) return;
    const allCells = row.querySelectorAll('.td-cell');
    for (const c of allCells) {
      if (parseInt(c.dataset.day, 10) === targetDay) {
        c.focus({ preventScroll: false });
        return;
      }
    }
  }
  if (rowDelta !== 0) {
    const day = parseInt(currentCell.dataset.day, 10);
    const currentRow = currentCell.closest('tr');
    if (!currentRow) return;
    let targetRow = rowDelta > 0
      ? currentRow.nextElementSibling
      : currentRow.previousElementSibling;
    while (targetRow && targetRow.classList.contains('tr-rbn')) {
      targetRow = rowDelta > 0
        ? targetRow.nextElementSibling
        : targetRow.previousElementSibling;
    }
    if (!targetRow) return;
    const allCells = targetRow.querySelectorAll('.td-cell');
    for (const c of allCells) {
      if (parseInt(c.dataset.day, 10) === day) {
        c.focus({ preventScroll: false });
        return;
      }
    }
  }
}

function handleGridKeydown(e) {
  if (IS_MOBILE) return;
  const cell = e.target.closest?.('#plan-tbody .td-cell');
  if (!cell) return;
  const emp = cell.dataset.emp;
  const day = parseInt(cell.dataset.day || '', 10);
  if (!emp || !Number.isFinite(day)) return;
  if (emp === RBN_ROW_KEY) return;

  const noMod = !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey;

  if (noMod && e.key === 'ArrowRight') { e.preventDefault(); focusAdjacentCell(cell, 0, 1); return; }
  if (noMod && e.key === 'ArrowLeft')  { e.preventDefault(); focusAdjacentCell(cell, 0, -1); return; }
  if (noMod && e.key === 'ArrowDown')  { e.preventDefault(); focusAdjacentCell(cell, 1, 0); return; }
  if (noMod && e.key === 'ArrowUp')    { e.preventDefault(); focusAdjacentCell(cell, -1, 0); return; }

  if (noMod && e.key >= '1' && e.key <= '8') {
    e.preventDefault();
    const idx = parseInt(e.key, 10) - 1;
    const wp = WORKPLACES[idx];
    if (wp) quickToggleWorkplace(emp, day, wp.code);
    return;
  }

  if (noMod && (e.key === 'd' || e.key === 'D')) { e.preventDefault(); quickToggleDuty(emp, day, 'D'); return; }
  if (noMod && (e.key === 'h' || e.key === 'H')) { e.preventDefault(); quickToggleDuty(emp, day, 'HG'); return; }

  if (noMod && (e.key === 'Delete' || e.key === 'Backspace')) {
    e.preventDefault();
    quickClearCell(emp, day);
    return;
  }

  if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    openEditor(emp, day);
    return;
  }
}

// --- Desktop: floating quick-action popover anchored to the focused cell ---

let quickPopover = { el: null, emp: null, day: null, anchorEl: null, outsideHandler: null, keyHandler: null, reposHandler: null };

export function closeCellQuickPopover() {
  if (!quickPopover.el) return;
  const el = quickPopover.el;
  quickPopover.anchorEl?.classList.remove('cqp-anchor-cell');
  if (quickPopover.outsideHandler) document.removeEventListener('pointerdown', quickPopover.outsideHandler, true);
  if (quickPopover.keyHandler) document.removeEventListener('keydown', quickPopover.keyHandler, true);
  if (quickPopover.reposHandler) {
    window.removeEventListener('scroll', quickPopover.reposHandler, true);
    window.removeEventListener('resize', quickPopover.reposHandler);
  }
  quickPopover = { el: null, emp: null, day: null, anchorEl: null, outsideHandler: null, keyHandler: null, reposHandler: null };
  document.body.classList.remove('cell-popover-open');
  // Sanftes Ausblenden: Klasse entfernen lässt die Basistransition zurücklaufen,
  // der Knoten wird erst nach Ablauf der Animation entfernt.
  el.classList.remove('cqp-visible');
  el.classList.add('cqp-leaving');
  setTimeout(() => el.remove(), 170);
}

/**
 * Vollständiges „Schließen" des Schnellmenüs: blendet das Menü aus, hebt die
 * (Mehrfach-)Auswahl auf und entfernt deren Hervorhebung. Einheitlicher
 * Endpunkt für alle Dismiss-Kanäle (×-Button, Esc, Klick außerhalb,
 * erneuter Klick auf die offene Zelle, Klick außerhalb der Mehrfachauswahl).
 */
function dismissQuickMenu({ refocus = false } = {}) {
  const anchor = quickPopover.anchorEl;
  state.multiEdit = { emp: null, days: [], anchor: null };
  closeCellQuickPopover();
  syncSelectionClasses();
  if (refocus && anchor && document.contains(anchor)) {
    anchor.focus({ preventScroll: true });
  }
}

// Kuratiertes Status-Schnellset für das Popover (häufigste Codes zuerst).
const QUICK_STATUS_CODES = ["F", "U", "K", "FZA", "ZU", "WB"];

function buildQuickPopoverHtml(emp, day) {
  const { year: y, month: m } = state;
  const cell = getCell(y, m, emp, day);
  const parts = (cell.assignment || "").split("/").map(x => x.trim()).filter(Boolean);

  const me = state.multiEdit;
  const selCount = (me?.emp === emp && Array.isArray(me.days) && me.days.includes(day))
    ? me.days.length : 1;
  const multi = selCount > 1;

  const headerHtml = `
    <div class="cqp-header">
      <span class="cqp-header-emp">${emp}</span>
      <span class="cqp-header-right">
        <span class="cqp-header-meta">${multi ? `${selCount} Tage` : `${day}. ${MONTHS[m]}`}</span>
        <button type="button" class="cqp-close" data-action="close" title="Schließen (Esc)" aria-label="Schnellmenü schließen">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </span>
    </div>
  `;

  const wpHtml = WORKPLACES.map(wp => {
    const active = parts.includes(wp.code);
    return `<button type="button" class="cqp-wp${active ? " active" : ""}" data-wp="${wp.code}" style="${active ? `background:${wp.bg};color:${wp.fg};border-color:${wp.bg};` : ""}" title="${wp.label}">${wp.code}</button>`;
  }).join("");

  const stHtml = QUICK_STATUS_CODES.map(code => {
    const st = STATUSES.find(s => s.code === code);
    if (!st) return "";
    const active = parts.includes(code);
    return `<button type="button" class="cqp-status${active ? " active" : ""}" data-status="${code}" style="${active ? `background:${st.bg};color:${st.fg};border-color:${st.bg};` : `--st-bg:${st.bg};--st-fg:${st.fg};`}" title="${st.label}">${code}</button>`;
  }).join("");

  return `
    <div class="cell-quick-popover-inner${multi ? " cqp-multi" : ""}">
      ${headerHtml}
      <div class="cqp-section-label">Arbeitsplatz</div>
      <div class="cqp-row cqp-wps">${wpHtml}</div>
      <div class="cqp-section-label">Status</div>
      <div class="cqp-row cqp-statuses">${stHtml}</div>
      <div class="cqp-row cqp-duties">
        <button type="button" class="cqp-duty badge-D${cell.duty === "D" ? " active" : ""}" data-duty="D" title="Bereitschaftsdienst">D</button>
        <button type="button" class="cqp-duty badge-HG${cell.duty === "HG" ? " active" : ""}" data-duty="HG" title="Hintergrunddienst">HG</button>
        <button type="button" class="cqp-clear" data-action="clear" title="${multi ? "Auswahl leeren" : "Zelle löschen"}">
          <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
        </button>
      </div>
      <button type="button" class="cqp-more" data-action="more">${multi ? "Auswahl bearbeiten…" : "Vollständig bearbeiten…"}</button>
    </div>
  `;
}

function wirePopoverButtons(el, emp, day) {
  el.querySelectorAll('.cqp-wp').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); quickToggleWorkplace(emp, day, btn.dataset.wp); });
  });
  el.querySelectorAll('.cqp-status').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); quickSetStatus(emp, day, btn.dataset.status); });
  });
  el.querySelectorAll('.cqp-duty').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); quickToggleDuty(emp, day, btn.dataset.duty); });
  });
  el.querySelector('.cqp-clear')?.addEventListener('click', (e) => { e.stopPropagation(); quickClearCell(emp, day); });
  el.querySelector('.cqp-close')?.addEventListener('click', (e) => { e.stopPropagation(); dismissQuickMenu({ refocus: true }); });
  el.querySelector('.cqp-more')?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeCellQuickPopover();
    openEditor(emp, day);
  });
}

function renderPopoverInto(el, emp, day) {
  el.innerHTML = buildQuickPopoverHtml(emp, day);
  const caret = document.createElement('span');
  caret.className = 'cqp-caret';
  caret.setAttribute('aria-hidden', 'true');
  el.appendChild(caret);
  wirePopoverButtons(el, emp, day);
}

function positionQuickPopover() {
  if (!quickPopover.el || !quickPopover.anchorEl) return;
  if (!document.contains(quickPopover.anchorEl)) return; // veralteter Anker nach Neuaufbau
  const rect = quickPopover.anchorEl.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return;
  const el = quickPopover.el;
  const margin = 10;
  const gap = 9;
  const prevVis = el.style.visibility;
  el.style.visibility = 'hidden';
  el.style.left = '0px';
  el.style.top = '0px';
  const pw = el.offsetWidth;
  const ph = el.offsetHeight;
  const anchorCx = rect.left + rect.width / 2;

  let left = anchorCx - pw / 2;
  left = Math.max(margin, Math.min(left, window.innerWidth - pw - margin));

  let top = rect.bottom + gap;
  let above = false;
  if (top + ph > window.innerHeight - margin) {
    const aboveTop = rect.top - ph - gap;
    if (aboveTop >= margin) {
      top = aboveTop;
      above = true;
    } else {
      // Weder oben noch unten genug Platz → unten einpassen.
      top = Math.max(margin, Math.min(rect.bottom + gap, window.innerHeight - ph - margin));
    }
  }

  el.classList.toggle('cqp-above', above);
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;

  const caret = el.querySelector('.cqp-caret');
  if (caret) {
    const caretX = Math.max(15, Math.min(anchorCx - left, pw - 15));
    caret.style.left = `${caretX}px`;
  }
  el.style.visibility = prevVis || '';
}

export function showCellQuickPopover(emp, day, anchorEl) {
  if (IS_MOBILE || !anchorEl || emp === RBN_ROW_KEY) return;

  // Gleiche Zelle (z. B. nach einer Schnellaktion oder Tastatur-Follow) → Inhalt
  // an Ort und Stelle aktualisieren, ohne das Popover neu zu erzeugen. Das
  // verhindert jegliches Flackern und hält das Menü beim Stapeln ruhig.
  if (quickPopover.el && quickPopover.emp === emp && quickPopover.day === day) {
    if (quickPopover.anchorEl !== anchorEl) {
      quickPopover.anchorEl?.classList.remove('cqp-anchor-cell');
      quickPopover.anchorEl = anchorEl;
    }
    anchorEl.classList.add('cqp-anchor-cell');
    renderPopoverInto(quickPopover.el, emp, day);
    positionQuickPopover();
    return;
  }

  closeCellQuickPopover();

  const el = document.createElement('div');
  el.className = 'cell-quick-popover';
  document.body.appendChild(el);
  renderPopoverInto(el, emp, day);

  quickPopover.el = el;
  quickPopover.emp = emp;
  quickPopover.day = day;
  quickPopover.anchorEl = anchorEl;
  anchorEl.classList.add('cqp-anchor-cell');

  positionQuickPopover();
  requestAnimationFrame(() => el.classList.add('cqp-visible'));

  quickPopover.outsideHandler = (e) => {
    if (!quickPopover.el) return;
    if (quickPopover.el.contains(e.target)) return;
    // Klicks auf belegbare Rasterzellen werden von der mouseup-Gestenlogik
    // verarbeitet (Menü versetzen / Auswahl / Schließen). Jeder Klick wirklich
    // außerhalb des Rasters schließt vollständig (Light-Dismiss).
    if (e.target.closest?.('#plan-tbody .td-cell:not(.td-cell-rbn)')) return;
    dismissQuickMenu();
  };
  quickPopover.keyHandler = (e) => {
    if (e.key === 'Escape') {
      // Escape schließt das Menü und beendet die Auswahl in einem Schritt.
      e.stopPropagation();
      dismissQuickMenu({ refocus: true });
    }
  };
  quickPopover.reposHandler = () => {
    const a = quickPopover.anchorEl;
    if (!a || !document.contains(a)) { closeCellQuickPopover(); return; }
    const r = a.getBoundingClientRect();
    const wrap = document.getElementById('grid-wrapper');
    if (wrap) {
      const wr = wrap.getBoundingClientRect();
      // Ankerzelle aus dem sichtbaren Rasterbereich gescrollt → schließen.
      if (r.right < wr.left + 4 || r.left > wr.right - 4 || r.bottom < wr.top + 4 || r.top > wr.bottom - 4) {
        closeCellQuickPopover();
        return;
      }
    }
    positionQuickPopover();
  };

  document.addEventListener('pointerdown', quickPopover.outsideHandler, true);
  document.addEventListener('keydown', quickPopover.keyHandler, true);
  window.addEventListener('scroll', quickPopover.reposHandler, true);
  window.addEventListener('resize', quickPopover.reposHandler);

  document.body.classList.add('cell-popover-open');
}

/** Öffnet das Schnellmenü für (emp, day) nach dem nächsten Render-Frame. */
export function openCellQuickPopoverFor(emp, day) {
  if (IS_MOBILE || emp === RBN_ROW_KEY || !Number.isFinite(day)) return;
  requestAnimationFrame(() => {
    const tbody = document.getElementById("plan-tbody");
    const cell = tbody?.querySelector(`.td-cell[data-emp="${CSS.escape(emp)}"][data-day="${day}"]`);
    if (cell) {
      cell.focus({ preventScroll: true });
      showCellQuickPopover(emp, day, cell);
    }
  });
}

// --- Mobile: radial quick-action menu with tap-to-open / swipe-to-select ---

const RADIAL_QUICK_ACTIONS = [
  { id: 'CT', kind: 'wp', code: 'CT', label: 'CT' },
  { id: 'MR', kind: 'wp', code: 'MR', label: 'MR' },
  { id: 'D', kind: 'duty', code: 'D', label: 'D' },
  { id: 'HG', kind: 'duty', code: 'HG', label: 'HG' },
  { id: 'F', kind: 'status', code: 'F', label: 'Frei' },
  { id: 'clear', kind: 'clear', label: 'Löschen' },
  { id: 'more', kind: 'more', label: 'Mehr…' },
];

let radialMenuState = { el: null, emp: null, day: null, sectors: [], activeIndex: -1 };

function radialOutsideHandler(e) {
  if (radialMenuState.el && !radialMenuState.el.contains(e.target)) {
    closeRadialQuickMenu();
  }
}

export function closeRadialQuickMenu() {
  if (!radialMenuState.el) return;
  radialMenuState.el.remove();
  document.removeEventListener('pointerdown', radialOutsideHandler, true);
  radialMenuState = { el: null, emp: null, day: null, sectors: [], activeIndex: -1 };
  document.body.classList.remove('radial-menu-open');
}

function runRadialAction(emp, day, action) {
  switch (action.kind) {
    case 'wp': quickToggleWorkplace(emp, day, action.code); break;
    case 'duty': quickToggleDuty(emp, day, action.code); break;
    case 'status': quickSetStatus(emp, day, action.code); break;
    case 'clear': quickClearCell(emp, day); break;
    case 'more': openEditor(emp, day); return;
  }

  const mdayOverlay = document.getElementById('modal-mobile-day');
  if (mdayOverlay && !mdayOverlay.hasAttribute('hidden')) {
    import('./app.js').then((mod) => mod.openMobileDay(day));
  }
}

export function openRadialQuickMenu(emp, day, x, y) {
  closeRadialQuickMenu();

  const n = RADIAL_QUICK_ACTIONS.length;
  const radius = 92;
  const sectors = RADIAL_QUICK_ACTIONS.map((action, i) => {
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
    return { ...action, angle, x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  });

  const margin = 110;
  const cx = Math.max(margin, Math.min(x, window.innerWidth - margin));
  const cy = Math.max(margin, Math.min(y, window.innerHeight - margin));

  const el = document.createElement('div');
  el.className = 'radial-quick-menu';
  el.style.left = `${cx}px`;
  el.style.top = `${cy}px`;

  const itemsHtml = sectors.map((s, i) => `
    <button type="button" class="radial-item" data-idx="${i}" style="transform: translate(${s.x}px, ${s.y}px);">
      <span class="radial-item-label">${s.label}</span>
    </button>
  `).join('');

  el.innerHTML = `
    <div class="radial-center"><span class="radial-center-emp">${emp}</span></div>
    ${itemsHtml}
  `;

  document.body.appendChild(el);
  document.body.classList.add('radial-menu-open');
  requestAnimationFrame(() => el.classList.add('radial-visible'));

  radialMenuState = { el, emp, day, sectors, activeIndex: -1 };

  el.querySelectorAll('.radial-item').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx, 10);
      const action = RADIAL_QUICK_ACTIONS[idx];
      closeRadialQuickMenu();
      runRadialAction(emp, day, action);
    });
  });

  setTimeout(() => document.addEventListener('pointerdown', radialOutsideHandler, true), 0);
}

export function updateRadialHover(clientX, clientY) {
  if (!radialMenuState.el) return;
  const rect = radialMenuState.el.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = clientX - cx;
  const dy = clientY - cy;
  const dist = Math.hypot(dx, dy);
  let idx = -1;
  if (dist > 28) {
    let angle = Math.atan2(dy, dx) + Math.PI / 2;
    if (angle < 0) angle += 2 * Math.PI;
    const n = radialMenuState.sectors.length;
    idx = Math.round(angle / (2 * Math.PI / n)) % n;
  }
  radialMenuState.activeIndex = idx;
  radialMenuState.el.querySelectorAll('.radial-item').forEach((btn, i) => {
    btn.classList.toggle('radial-hover', i === idx);
  });
}

export function releaseRadialMenu(clientX, clientY) {
  updateRadialHover(clientX, clientY);
  const idx = radialMenuState.activeIndex;
  const emp = radialMenuState.emp;
  const day = radialMenuState.day;
  if (idx >= 0) {
    const action = RADIAL_QUICK_ACTIONS[idx];
    closeRadialQuickMenu();
    runRadialAction(emp, day, action);
  }
}

export function initGridKeyboardHandlers() {
  const table = document.getElementById('plan-table');
  if (!table) return;

  table.addEventListener('keydown', handleGridKeydown);

  table.addEventListener('focusin', (e) => {
    if (e.target.closest?.('#plan-tbody .td-cell')) {
      document.body.classList.add('grid-cell-focused');
    }
  });

  table.addEventListener('focusout', () => {
    setTimeout(() => {
      if (!document.activeElement?.closest?.('#plan-tbody .td-cell')) {
        document.body.classList.remove('grid-cell-focused');
      }
    }, 50);
  });

  initGridCrossHighlight(table);
}

/* ── Kreuz-Hervorhebung (Task 7) ─────────────────────────────────────────────
   Beim Überfahren einer Rasterzelle werden ihre komplette Spalte (inkl.
   Tageskopf) und Zeile (inkl. Namensspalte) dezent hervorgehoben. Das
   erleichtert in der dichten Monatsmatrix das Ablesen „welcher Tag / welche
   Person". Reine Klassen-Umschaltung mit Spalten-Caching, damit pro
   Mausbewegung nur bei echtem Zeilen-/Spaltenwechsel neu gezeichnet wird.
   Auf Touch-Geräten (pointer: coarse) bleibt die Funktion inaktiv. */
let xhCurrentDay = null;
let xhCurrentRow = null;

function clearCrossHighlight(table) {
  if (xhCurrentRow) { xhCurrentRow.classList.remove('row-hl'); xhCurrentRow = null; }
  if (xhCurrentDay != null) {
    table.querySelectorAll('.col-hl').forEach((el) => el.classList.remove('col-hl'));
    xhCurrentDay = null;
  }
}

function initGridCrossHighlight(table) {
  if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return;

  table.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    const cell = e.target.closest?.('.td-cell, .td-name');
    if (!cell) { clearCrossHighlight(table); return; }

    const row = cell.parentElement;
    const day = cell.dataset.day ? cell.dataset.day : null;

    if (row !== xhCurrentRow) {
      xhCurrentRow?.classList.remove('row-hl');
      row?.classList.add('row-hl');
      xhCurrentRow = row;
    }

    if (day !== xhCurrentDay) {
      table.querySelectorAll('.col-hl').forEach((el) => el.classList.remove('col-hl'));
      if (day != null) {
        table.querySelectorAll(`[data-day="${day}"]`).forEach((el) => el.classList.add('col-hl'));
      }
      xhCurrentDay = day;
    }
  });

  table.addEventListener('pointerleave', () => clearCrossHighlight(table));
}

export function render() {
  const { year: y, month: m } = state;
  const hols = getSaxonyHolidaysCached(y);
  const md = getMonthData(y, m);
  const dim = daysInMonth(y, m);
  
  const monthLabel = document.getElementById("month-label");
  if (monthLabel) {
    monthLabel.textContent = `${MONTHS[m]} ${y}`;
  }
  
  syncPeriodControls();
  
  const todayBtn = document.getElementById("btn-today");
  if (todayBtn) {
    todayBtn.classList.toggle("today-btn-active", y === TOD_Y && m === TOD_M);
  }
  
  const planBar = document.getElementById("plan-bar");
  if (planBar) {
    if (planMode) {
      planBar.removeAttribute("hidden");
      planBar.style.display = "flex";
      document.body.classList.add("plan-mode-active");
      const lbl = document.getElementById("plan-bar-month");
      if (lbl) {
        lbl.textContent = `${MONTHS[m]} ${y}`;
      }
    } else {
      planBar.setAttribute("hidden", "");
      planBar.style.display = "none";
      document.body.classList.remove("plan-mode-active");
    }
  }
  
  if (IS_MOBILE) {
    renderMobileView();
    updateOpenModalLayouts();
    return;
  }
  
  renderStatsBar(y, m, dim, md);
  renderThead(y, m, dim, hols, md);
  renderTbody(y, m, dim, hols, md);
  renderTfoot(y, m, dim, md);
  updateOpenModalLayouts();
}

export function renderStatsBar(y, m, dim, md) {
  const bar = document.getElementById("stats-bar");
  bar.innerHTML = "";
  
  const empCount = document.createElement("div");
  empCount.className = "stat-item stat-item-emp";
  empCount.innerHTML = `
    <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
    <span class="stat-count">${md.employees.length}</span>
    <span class="stat-label-sm">MA</span>
  `;
  bar.appendChild(empCount);
  
  const totals = {};
  [...WORKPLACES.map((w) => w.code), ...STATUSES.map((s) => s.code), "D", "HG"].forEach((c) => {
    totals[c] = 0;
  });
  
  for (let d = 1; d <= dim; d++) {
    md.employees.forEach((emp) => {
      const cell = md.assignments?.[emp]?.[d] || {};
      if (cell.assignment) {
        cell.assignment.split("/").map((x) => x.trim()).forEach((c) => { 
          if (c in totals) totals[c]++; 
        });
      }
      if (cell.duty && cell.duty in totals) {
        totals[cell.duty]++;
      }
    });
  }
  
  const order = [
    ...WORKPLACES.map((w) => w.code),
    "D", "HG", "U", "K", "F", "WB", "FZA", "ZU", "SU", "KK", "§15c"
  ];
  
  let any = false;
  
  order.forEach((code) => {
    const v = totals[code];
    if (!v) return;
    any = true;
    
    const meta = CODE_MAP[code];
    const isD = code === "D";
    const isHG = code === "HG";
    
    const bg = isD ? "#EF4444" : isHG ? "#0EA5E9" : meta?.bg || "#E2E8F0";
    const fg = isD || isHG ? "#fff" : meta?.fg || "#374151";
    
    const div = document.createElement("div");
    div.className = "stat-item";
    div.innerHTML = `
      <span class="stat-code" style="background:${bg};color:${fg}">${code}</span>
      <span class="stat-count">${v}</span>
    `;
    bar.appendChild(div);
  });
  
  if (!any && !md.employees.length) {
    bar.innerHTML = `<span id="stats-empty">Keine Daten</span>`;
  }
}

export function renderThead(y, m, dim, hols, md) {
  const thead = document.getElementById("plan-thead");
  thead.innerHTML = "";
  
  const tr = document.createElement("tr");
  const thC = document.createElement("th");
  thC.className = "th-corner";
  thC.setAttribute("scope", "col");
  thC.innerHTML = '<div class="th-corner-inner">Mitarbeitende</div>';
  tr.appendChild(thC);
  
  let prevKW = -1;
  
  for (let d = 1; d <= dim; d++) {
    const wd = weekday(y, m, d);
    const hol = isHoliday(y, m, d, hols);
    const we = isWeekend(y, m, d);
    const isT = isTodayCol(y, m, d, TOD_Y, TOD_M, TOD_D);
    const fri = isFriday(y, m, d);
    const kw = isoWeekNumber(y, m, d);
    const showKW = (wd === 1 || (d === 1 && wd !== 1)) && kw !== prevKW;
    
    if (showKW) {
      prevKW = kw;
    }
    
    const hn = hols[dateKey(y, m, d)] || "";
    const th = document.createElement("th");
    th.setAttribute("scope", "col");

    let cls = "th-day ";
    cls += hol ? "hol" : we ? "we" : "wd";
    if (isT) cls += " today";
    if (fri) cls += " is-fri";

    th.className = cls;
    th.dataset.day = String(d);

    const hasEmps = md.employees.length > 0;
    const dCount  = hasEmps ? dayCodeCount(y, m, d, "D")  : 0;
    const hgCount = hasEmps ? dayCodeCount(y, m, d, "HG") : 0;

    let stripeColor = "transparent";
    if (hasEmps) {
      const bothCovered = dCount > 0 && hgCount > 0;
      const oneCovered  = (dCount > 0) !== (hgCount > 0);
      if (bothCovered) {
        stripeColor = "#22C55E";
      } else if (oneCovered) {
        stripeColor = "#F59E0B";
      } else {
        stripeColor = (we || hol) ? "rgba(249,115,22,0.55)" : "#EF4444";
      }
    }

    if (hasEmps) {
      const dLabel  = dCount  > 0 ? `${dCount}× besetzt` : "fehlt";
      const hgLabel = hgCount > 0 ? `${hgCount}× besetzt` : "fehlt";
      th.title = `${d}. ${MONTHS[m]} · D: ${dLabel} · HG: ${hgLabel}`;
      th.setAttribute("aria-label", `${d}. ${MONTHS[m]} ${DOW_ABBR[wd]} · Bereitschaftsdienst: ${dLabel} · Hintergrunddienst: ${hgLabel}`);
    } else {
      th.setAttribute("aria-label", `${d}. ${MONTHS[m]} ${DOW_ABBR[wd]}`);
    }

    th.innerHTML = `
      <div class="th-day-inner">
        <span class="d-kw">${showKW ? "KW" + kw : ""}</span>
        <span class="d-num">${d}</span>
        <span class="d-dow">${DOW_ABBR[wd]}</span>
        ${hn ? `<span class="d-hol">${hn}</span>` : ""}
      </div>
      <div class="day-status-stripe" style="background:${stripeColor}" aria-hidden="true"></div>
    `;
    tr.appendChild(th);
  }
  thead.appendChild(tr);
}

function bindCellListeners(tdEl, emp, d) {
  if (emp === RBN_ROW_KEY) {
    tdEl.addEventListener("click", (e) => openEditor(RBN_ROW_KEY, d, { ctrlKey: e.ctrlKey || e.metaKey }));
    tdEl.addEventListener("keydown", (e) => { 
      if (e.key === "Enter" || e.key === " ") { 
        e.preventDefault(); 
        openEditor(RBN_ROW_KEY, d); 
      } 
    });
    return;
  }

  if (!IS_MOBILE) {
    const dutyBadge = tdEl.querySelector(".cell-duty");
    if (dutyBadge) {
      dutyBadge.draggable = true;
      dutyBadge.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", JSON.stringify({ emp, day: d }));
        e.dataTransfer.effectAllowed = "move";
      });
    }

    tdEl.addEventListener("dragover", (e) => {
      e.preventDefault();
      tdEl.classList.add("drag-over");
    });
    tdEl.addEventListener("dragleave", () => {
      tdEl.classList.remove("drag-over");
    });
    tdEl.addEventListener("drop", (e) => {
      e.preventDefault();
      tdEl.classList.remove("drag-over");
      let payload;
      try {
        payload = JSON.parse(e.dataTransfer.getData("text/plain"));
      } catch {
        return;
      }
      if (!payload || !payload.emp || !Number.isFinite(payload.day)) return;
      moveDutyBadge(payload.emp, payload.day, emp, d);
    });
  }

  tdEl.addEventListener("click", (e) => {
    if (dragSelectionState.justDragged) {
      dragSelectionState.justDragged = false;
      return;
    }
    if (e.shiftKey) {
      closeCellQuickPopover();
      openEditor(emp, d, { shiftKey: true });
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      closeCellQuickPopover();
      openEditor(emp, d, { ctrlKey: true });
    }
  });
  tdEl.addEventListener("dblclick", () => {
    closeCellQuickPopover();
    openEditor(emp, d);
  });
  tdEl.addEventListener("focus", () => {
    if (!IS_MOBILE && quickPopover.el && !dragSelectionState.active) {
      showCellQuickPopover(emp, d, tdEl);
    }
  });
  tdEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openEditor(emp, d);
    }
  });
  if (planMode) {
    tdEl.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const pinnedNow = isPinned(emp, d);
      contextMenu.show(e.clientX, e.clientY, [
        {
          label: pinnedNow ? "Fixierung aufheben" : "Für Auto-Plan fixieren",
          sub: pinnedNow ? "Solver darf diese Zelle wieder ändern" : "Solver lässt diese Zelle unverändert",
          icon: '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 17v5M9 10.76a2 2 0 0 1 1.11-1.79l1.78-.9a2 2 0 0 1 1.78 0l1.78.9A2 2 0 0 1 17.56 11l.3 4.94a1 1 0 0 1-1 1.06H7.14a1 1 0 0 1-1-1.06L9 10.76Z"/></svg>',
          action: () => togglePinned(emp, d)
        }
      ], tdEl);
    });
  }
}

function createGridCellElement(y, m, emp, d, hols, gridConflicts) {
  const we = isWeekend(y, m, d);
  const hol = isHoliday(y, m, d, hols);
  const isT = isTodayCol(y, m, d, TOD_Y, TOD_M, TOD_D);
  const fri = isFriday(y, m, d);
  const tdEl = document.createElement("td");
  tdEl.tabIndex = 0;
  tdEl.setAttribute("role", "gridcell");
  tdEl.dataset.emp = emp;
  tdEl.dataset.day = String(d);

  let cls = "td-cell";
  if (hol) cls += " hol";
  if (we) cls += " we";
  if (isT) cls += " today";
  if (fri) cls += " is-fri";

  if (emp === RBN_ROW_KEY) {
    cls += " td-cell-rbn";
    tdEl.className = cls;
    const rbnValue = getRbnValue(y, m, d);
    tdEl.innerHTML = `
      <div class="cell-inner">
        <span class="cell-assign cell-assign-rbn">${formatRbnDisplay(rbnValue)}</span>
      </div>
    `;
    tdEl.setAttribute("aria-label", `Rufbereitschaft Tag ${d}: ${formatRbnDisplay(rbnValue) || "Kein Dienst"}`);
    
    tdEl.addEventListener("click", (e) => openEditor(RBN_ROW_KEY, d, { ctrlKey: e.ctrlKey || e.metaKey }));
    tdEl.addEventListener("keydown", (e) => { 
      if (e.key === "Enter" || e.key === " ") { 
        e.preventDefault(); 
        openEditor(RBN_ROW_KEY, d); 
      } 
    });
    return tdEl;
  }

  const cell = getCell(y, m, emp, d);
  const emptyWd = !we && !hol && !cell.assignment && !cell.duty;
  const isAutoFRest = cell.assignment === "F" && (we || hol);
  const { bg, fg } = cellColor(cell.assignment);

  if (emptyWd) cls += " empty-wd";
  if (isAutoFRest) cls += " auto-f-rest";
  if (planMode && isPinned(emp, d)) cls += " pinned";

  const cellConflicts = gridConflicts.get(dutyKey(emp, d));
  if (cellConflicts?.length) cls += " cell-conflict";

  tdEl.className = cls;
  if (cell.assignment && !isAutoFRest) {
    tdEl.dataset.code = cell.assignment.split("/")[0].trim();
  }
  
  let ariaLabel = `Tag ${d}: `;
  if (cell.assignment && !isAutoFRest) {
    ariaLabel += `${cell.assignment} `;
  } else {
    ariaLabel += `Frei `;
  }
  if (cell.duty) {
    ariaLabel += `, ${cell.duty === "D" ? "Bereitschaftsdienst" : "Hintergrunddienst"}`;
  }
  const cellComment = getComment(y, m, emp, d);
  if (cellComment) {
    ariaLabel += `, Notiz: ${cellComment}`;
  }
  if (cellConflicts?.length) {
    ariaLabel += `, Konflikt: ${cellConflicts.join(" · ")}`;
  }
  tdEl.setAttribute("aria-label", ariaLabel);

  if (cellConflicts?.length) {
    tdEl.setAttribute("data-conflict", cellConflicts.join(" · "));
  }
  
  if (cell.assignment && !isAutoFRest) {
    tdEl.style.backgroundColor = bg;
  }
  
  let innerHtml = `<div class="cell-inner">`;
  innerHtml += `<span class="cell-assign"${isAutoFRest ? "" : ` style="color:${fg}"`}>${cell.assignment || ""}</span>`;
  if (cell.duty) {
    innerHtml += `<span class="cell-duty badge-${cell.duty}">${cell.duty}</span>`;
  }
  if (planMode && getWish(emp, d)) {
    const wishCode = getWish(emp, d);
    const icon = WISH_MAP[wishCode]?.icon || "";
    innerHtml += `<span class="cell-wish wish-${wishCode}">${icon}</span>`;
  }
  const cellPinned = planMode && isPinned(emp, d);
  if (cellPinned) {
    innerHtml += `<span class="cell-pin" title="Für Auto-Plan fixiert">📌</span>`;
  }
  if (cellComment) {
    const escapedComment = cellComment.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    innerHtml += `<span class="cell-comment-dot" title="${escapedComment}" aria-label="Notiz: ${escapedComment}"></span>`;
  }
  if (cellConflicts?.length) {
    innerHtml += `<span class="cell-conflict-flag" aria-hidden="true">⚠</span>`;
  }
  innerHtml += `</div>`;
  tdEl.innerHTML = innerHtml;
  if (cellConflicts?.length) {
    tdEl.title = `Regelkonflikt: ${cellConflicts.join(" · ")}`;
  }

  bindCellListeners(tdEl, emp, d);

  return tdEl;
}

export function renderTbody(y, m, dim, hols, md) {
  const tbody = document.getElementById("plan-tbody");
  tbody.innerHTML = "";
  
  if (!md.employees.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = dim + 1;
    td.className = "td-empty";
    td.innerHTML = `<div class="empty-inner"><p class="empty-title">Keine Mitarbeitenden</p></div>`;
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  const employeesToRender = md.employees.filter(e => e !== RBN_ROW_LABEL && e !== RBN_ROW_KEY);
  const gridConflicts = computeGridConflicts(y, m);

  const roleBand = (pos) => {
    if (["CA", "LOA", "OA", "OÄ"].includes(pos)) return "lead";
    if (["FA", "FÄ"].includes(pos)) return "fa";
    if (["AA", "AÄ"].includes(pos)) return "aa";
    return "other";
  };
  let prevBand = null;

  employeesToRender.forEach((emp) => {
    const meta = getEmpMeta(emp);
    const pc = posColor(meta.position);
    const band = roleBand(meta.position);

    const tr = document.createElement("tr");
    tr.dataset.band = band;
    if (band !== prevBand) {
      tr.classList.add("tr-band-start");
      prevBand = band;
    }
    const tdN = document.createElement("td");
    tdN.className = "td-name";
    tdN.style.borderLeft = `3px solid ${pc.border}`;
    tdN.style.paddingLeft = "11px";
    tdN.setAttribute("role", "rowheader");
    tdN.setAttribute("aria-label", emp);
    tdN.setAttribute("tabindex", "0");
    
    let tdNHtml = `<span class="emp-label">${emp}</span>`;
    if (meta.position !== "—") {
      tdNHtml += `<span class="emp-pos-tag" style="background:${pc.bg};color:${pc.fg}">${meta.position}</span>`;
    }
    tdNHtml += `
      <span class="emp-profile-icon">
        <svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
      </span>
    `;
    tdN.innerHTML = tdNHtml;
    
    tdN.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      contextMenu.show(e.clientX, e.clientY, [
        { 
          label: "Profil öffnen", 
          icon: '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
          action: () => openProfileModal(emp)
        },
        { type: "divider" },
        { 
          label: "Aus Monat entfernen", 
          sub: `${MONTHS[m]} ${y}`,
          danger: true,
          icon: '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>',
          action: () => import('./app.js').then(module => module.confirmRemoveEmployee(emp))
        },
        { 
          label: "Ab hier dauerhaft entfernen", 
          sub: `Folgende Monate inkl.`,
          danger: true,
          icon: '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/><path d="M21 7l-5-5m0 0l-5 5m5-5v18"/></svg>',
          action: () => import('./app.js').then(module => module.confirmRemoveEmployeeFuture(emp))
        }
      ], tdN);
    });
    
    tdN.addEventListener("click", () => openProfileModal(emp));
    tdN.addEventListener("keydown", (e) => { 
      if (e.key === "Enter" || e.key === " ") { 
        e.preventDefault(); 
        openProfileModal(emp); 
      } 
    });
    
    tr.appendChild(tdN);
    
    for (let d = 1; d <= dim; d++) {
      const tdEl = createGridCellElement(y, m, emp, d, hols, gridConflicts);
      tr.appendChild(tdEl);
    }
    
    tr.addEventListener('mouseenter', () => tr.classList.add('tr-hover'));
    tr.addEventListener('mouseleave', () => tr.classList.remove('tr-hover'));
    
    tbody.appendChild(tr);
  });
  
  if (isRbnMonthVisible(y, m)) {
    const tr = document.createElement("tr");
    tr.className = "tr-rbn";
    
    const tdN = document.createElement("td");
    tdN.className = "td-name td-name-rbn";
    tdN.style.borderLeft = "3px solid #0EA5E9";
    tdN.style.paddingLeft = "11px";
    tdN.innerHTML = `<span class="emp-label">${RBN_ROW_LABEL}</span>`;
    tr.appendChild(tdN);
    
    for (let d = 1; d <= dim; d++) {
      const tdEl = createGridCellElement(y, m, RBN_ROW_KEY, d, hols, gridConflicts);
      tr.appendChild(tdEl);
    }
    
    tr.addEventListener('mouseenter', () => tr.classList.add('tr-hover'));
    tr.addEventListener('mouseleave', () => tr.classList.remove('tr-hover'));
    
    tbody.appendChild(tr);
  }
}

export function updateGridCell(emp, d) {
  const { year: y, month: m } = state;
  const hols = getSaxonyHolidaysCached(y);
  const gridConflicts = computeGridConflicts(y, m);
  
  const oldCell = document.querySelector(`#plan-tbody td.td-cell[data-emp="${emp}"][data-day="${d}"]`);
  if (oldCell) {
    const wasFocused = document.activeElement === oldCell;
    const newCell = createGridCellElement(y, m, emp, d, hols, gridConflicts);
    oldCell.replaceWith(newCell);
    if (wasFocused) {
      newCell.focus();
    }
  }
}

export function updateAllConflicts() {
  const { year: y, month: m } = state;
  const gridConflicts = computeGridConflicts(y, m);
  
  const cells = document.querySelectorAll("#plan-tbody td.td-cell");
  cells.forEach(cell => {
    const emp = cell.dataset.emp;
    const d = parseInt(cell.dataset.day, 10);
    if (emp === RBN_ROW_KEY) return;
    const key = dutyKey(emp, d);
    const cellConflicts = gridConflicts.get(key);
    
    const hasConflictClass = cell.classList.contains("cell-conflict");
    const needsConflictClass = !!(cellConflicts?.length);
    
    if (hasConflictClass !== needsConflictClass) {
      cell.classList.toggle("cell-conflict", needsConflictClass);
      
      const flag = cell.querySelector(".cell-conflict-flag");
      if (needsConflictClass) {
        if (!flag) {
          const inner = cell.querySelector(".cell-inner");
          if (inner) {
            inner.insertAdjacentHTML("beforeend", `<span class="cell-conflict-flag" aria-hidden="true">⚠</span>`);
          }
        }
        cell.title = `Regelkonflikt: ${cellConflicts.join(" · ")}`;
        cell.setAttribute("data-conflict", cellConflicts.join(" · "));
      } else {
        if (flag) flag.remove();
        cell.title = "";
        cell.removeAttribute("data-conflict");
      }
    }
  });
}

export function updateGridStatsAndHeader() {
  const { year: y, month: m } = state;
  const dim = daysInMonth(y, m);
  const md = getMonthData(y, m);
  const hols = getSaxonyHolidaysCached(y);
  
  renderStatsBar(y, m, dim, md);
  renderTfoot(y, m, dim, md);
  renderThead(y, m, dim, hols, md);
}

export function renderTfoot(y, m, dim, md) {
  const tfoot = document.getElementById("plan-tfoot");
  tfoot.innerHTML = "";
  
  const hols = getSaxonyHolidaysCached(y);
  const rows = [
    { code: "MR", label: "MRT", meta: CODE_MAP["MR"] },
    { code: "CT", label: "CT", meta: CODE_MAP["CT"] },
    { code: "D", label: "Bereitschaftsdienst", meta: null },
    { code: "HG", label: "Hintergrunddienst", meta: null },
    { code: "PRESENT", label: "Mitarbeitende anwesend", meta: null },
  ];

  rows.forEach(({ code, label, meta }, rowIdx) => {
    const isD = code === "D";
    const isHG = code === "HG";
    const isPresent = code === "PRESENT";

    const bg = isD ? "#EF4444" : isHG ? "#0EA5E9" : isPresent ? "#22C55E" : meta.bg;
    const fg = isD || isHG || isPresent ? "#fff" : meta.fg;

    const tr = document.createElement("tr");
    tr.className = "tr-stat" + (rowIdx === 0 ? " tr-stat-first" : "") + (isPresent ? " tr-stat-present" : "");

    const tdL = document.createElement("td");
    tdL.className = "td-stat-lbl";
    tdL.innerHTML = `
      <span class="stat-lbl-badge" style="background:${bg};color:${fg}">${isPresent ? "Σ" : code}</span>
      <span class="stat-lbl-text">${label}</span>
    `;
    tr.appendChild(tdL);

    for (let d = 1; d <= dim; d++) {
      const val = isPresent ? dayPresentCount(y, m, d) : dayCodeCount(y, m, d, code);
      const we = isWeekend(y, m, d);
      const hol = isHoliday(y, m, d, hols);
      const fri = isFriday(y, m, d);
      const isT = isTodayCol(y, m, d, TOD_Y, TOD_M, TOD_D);

      const td = document.createElement("td");
      let cls = "td-stat-val";

      if (isPresent) {
        if (we || hol) cls += " dim";
        else cls += " nz";
      } else if (we || hol) {
        cls += " dim";
      } else if ((isD || isHG) && val > 1) {
        cls += " warn";
      } else if (val > 0) {
        cls += " nz";
      }

      if (isT) cls += " today-col";
      if (fri) cls += " is-fri";

      td.className = cls;
      td.textContent = val > 0 ? val : "";
      tr.appendChild(td);
    }
    tfoot.appendChild(tr);
  });
}

document.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;
  if (e.target.closest?.(".cell-duty")) return;
  // Strg/Cmd/Shift werden vom Klick-Handler (Toggle/Bereich) verarbeitet.
  if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
  const cell = e.target.closest?.("#plan-tbody .td-cell");
  if (!cell) return;
  const emp = cell.dataset.emp;
  const day = parseInt(cell.dataset.day || "", 10);
  if (!emp || !Number.isFinite(day) || emp === RBN_ROW_KEY) return;

  const me = state.multiEdit;
  const isSelected = me.emp === emp && Array.isArray(me.days) && me.days.includes(day);
  const multi = isSelected && me.days.length > 1;

  // Dismiss-Gesten (Menü schließen statt versetzen/öffnen):
  //   1) Erneuter Klick auf die Zelle, deren Menü gerade offen ist  → toggeln zu.
  //   2) Klick auf eine Zelle AUSSERHALB einer Mehrfachauswahl       → schließen.
  // Beides nur „scharf schalten"; ausgeführt wird in mouseup (reiner Klick).
  // Wird stattdessen gezogen, entsteht in mouseover eine frische Auswahl.
  const prevMulti = !!(me.emp && Array.isArray(me.days) && me.days.length > 1);
  const menuOpenHere = !!quickPopover.el && quickPopover.emp === emp && quickPopover.day === day;
  const wantsDismiss = (prevMulti && !isSelected) || (!prevMulti && menuOpenHere);
  if (wantsDismiss) {
    dragSelectionState.active = true;
    dragSelectionState.justDragged = false;
    dragSelectionState.dismissOnClick = true;
    dragSelectionState.mode = "add";
    dragSelectionState.emp = emp;
    dragSelectionState.startEmp = emp;
    dragSelectionState.startDay = day;
    dragSelectionState.touched = new Set([day]);
    document.body.classList.add("is-drag-selecting");
    return;
  }

  // Auf einer bereits markierten Zelle innerhalb einer Mehrfachauswahl startet
  // eine Abwahl-Geste; sonst beginnt eine frische additive Auswahl.
  if (multi) {
    dragSelectionState.mode = "remove";
  } else {
    dragSelectionState.mode = "add";
    if (!isSelected) {
      state.multiEdit.emp = emp;
      state.multiEdit.days = [];
      state.multiEdit.anchor = null;
    }
  }

  dragSelectionState.active = true;
  dragSelectionState.justDragged = false;
  dragSelectionState.emp = emp;
  dragSelectionState.startEmp = emp;
  dragSelectionState.startDay = day;
  dragSelectionState.touched = new Set([day]);
  document.body.classList.add("is-drag-selecting");
  // Im Abwahl-Modus (Start auf markierter Zelle) bleibt die Auswahl bei einem
  // reinen Klick erhalten – erst das Ziehen entfernt Zellen. Im Add-Modus wird
  // die Startzelle sofort aufgenommen.
  if (dragSelectionState.mode === "add") {
    setDaySelected(emp, day, true);
    syncSelectionClasses();
  }
});

document.addEventListener("mouseover", (e) => {
  if (!dragSelectionState.active) return;
  const cell = e.target.closest?.("#plan-tbody .td-cell");
  if (!cell) return;
  const emp = cell.dataset.emp;
  const day = parseInt(cell.dataset.day || "", 10);
  if (emp !== dragSelectionState.emp || !Number.isFinite(day)) return;
  if (dragSelectionState.touched.has(day)) return;

  // Wird nach einem Außen-Klick (Dismiss-Modus) doch gezogen, so entsteht eine
  // frische additive Auswahl ab der Startzelle statt eines bloßen Schließens.
  if (dragSelectionState.dismissOnClick) {
    dragSelectionState.dismissOnClick = false;
    state.multiEdit.emp = dragSelectionState.startEmp;
    state.multiEdit.days = [dragSelectionState.startDay];
    state.multiEdit.anchor = dragSelectionState.startDay;
  }

  dragSelectionState.touched.add(day);
  applyDragSelection(emp, day);
  dragSelectionState.justDragged = true;
  syncSelectionClasses();
});

document.addEventListener("mouseup", () => {
  const wasActive = dragSelectionState.active;
  const dragged = dragSelectionState.justDragged;
  const dismiss = dragSelectionState.dismissOnClick && !dragged;
  const startEmp = dragSelectionState.startEmp;
  const startDay = dragSelectionState.startDay;
  resetDragSelectionState();
  if (!wasActive) return;

  // Dismiss-Klick (erneut auf die offene Zelle bzw. außerhalb der Mehrfach-
  // auswahl) → Menü schließen und Auswahl beenden; kein neues Menü öffnen.
  if (dismiss) {
    dismissQuickMenu();
    return;
  }

  // Schnellmenü zuverlässig öffnen – sowohl nach einem reinen Klick als auch
  // nach einer Ziehgeste – verankert an der zuletzt berührten Zelle.
  const me = state.multiEdit;
  let anchorEmp = startEmp;
  let anchorDay = startDay;
  if (dragged && me?.emp && Array.isArray(me.days) && me.days.length) {
    anchorEmp = me.emp;
    anchorDay = me.days[me.days.length - 1];
  }
  if (!anchorEmp || !Number.isFinite(anchorDay) || anchorEmp === RBN_ROW_KEY) return;

  const tbody = document.getElementById("plan-tbody");
  const cell = tbody?.querySelector(`.td-cell[data-emp="${CSS.escape(anchorEmp)}"][data-day="${anchorDay}"]`);
  if (cell) {
    cell.focus({ preventScroll: true });
    showCellQuickPopover(anchorEmp, anchorDay, cell);
  }
});

window.addEventListener("blur", () => {
  resetDragSelectionState();
});

export function renderMobileView() {
  const { year: y, month: m } = state;
  document.body.classList.add("is-mobile");
  renderMobileSummary(y, m);
  renderMobileDayList(y, m);
}

export function renderMobileSummary(y, m) {
  const summaryEl = document.getElementById("mobile-month-summary");
  if (!summaryEl) return;
  
  const md = getMonthData(y, m);
  const dim = daysInMonth(y, m);
  const totals = {};
  
  [...WORKPLACES.map(w => w.code), ...STATUSES.map(s => s.code), "D", "HG"].forEach(c => { 
    totals[c] = 0; 
  });
  
  for (let d = 1; d <= dim; d++) {
    md.employees.forEach(emp => {
      const cell = md.assignments?.[emp]?.[d] || {};
      if (cell.assignment) {
        cell.assignment.split("/").map(x => x.trim()).forEach(c => { 
          if (c in totals) totals[c]++; 
        });
      }
      if (cell.duty && cell.duty in totals) {
        totals[cell.duty]++;
      }
    });
  }
  
  const order = ["D", "HG", "U", "K", "F", "MR", "CT", "US", "WB", "FZA", "ZU", "SU", "KK", "§15c", "AN", "MA", "KUS", "W", "T"];
  
  let html = `
    <div class="mms-item mms-item-emp">
      <span class="mms-val">${md.employees.length}</span>
      <span class="mms-code">MA</span>
    </div>
  `;
  
  order.forEach(code => {
    const v = totals[code];
    if (!v) return;
    
    const meta = CODE_MAP[code];
    const isD = code === "D";
    const isHG = code === "HG";
    
    const bg = isD ? "#EF4444" : isHG ? "#0EA5E9" : meta?.bg || "#E2E8F0";
    const fg = isD || isHG ? "#fff" : meta?.fg || "#374151";
    
    html += `
      <div class="mms-item">
        <span class="mms-code" style="background:${bg};color:${fg};padding:1px 5px;border-radius:3px;font-size:8px;font-weight:700;font-family:var(--font-mono)">${code}</span>
        <span class="mms-val">${v}</span>
      </div>
    `;
  });
  
  summaryEl.innerHTML = html;
}

export function renderMobileDayList(y, m) {
  const listEl = document.getElementById("mobile-day-list");
  if (!listEl) return;
  
  const hols = getSaxonyHolidaysCached(y);
  const md = getMonthData(y, m);
  const dim = daysInMonth(y, m);
  
  listEl.innerHTML = "";
  let prevKW = -1;
  
  for (let d = 1; d <= dim; d++) {
    const wd = weekday(y, m, d);
    const hol = isHoliday(y, m, d, hols);
    const holName = hols[dateKey(y, m, d)] || "";
    const isToday = isTodayCol(y, m, d, TOD_Y, TOD_M, TOD_D);
    const kw = isoWeekNumber(y, m, d);
    
    if (wd === 1 && kw !== prevKW) {
      prevKW = kw;
      const sep = document.createElement("div");
      sep.className = "mobile-week-sep";
      sep.textContent = `KW ${kw}`;
      listEl.appendChild(sep);
    }
    
    const bdHolder = md.employees.find(e => md.assignments?.[e]?.[d]?.duty === "D") || null;
    const hgHolder = md.employees.find(e => md.assignments?.[e]?.[d]?.duty === "HG") || null;
    const allAssigns = [];
    
    md.employees.forEach(emp => {
      const cell = md.assignments?.[emp]?.[d] || {};
      if (cell.assignment) {
        cell.assignment.split("/").map(x => x.trim()).filter(Boolean).forEach(code => {
          if (!allAssigns.find(a => a.code === code)) {
            const meta = CODE_MAP[code];
            if (meta) {
              allAssigns.push({ code, bg: meta.bg, fg: meta.fg });
            }
          }
        });
      }
    });
    
    const card = document.createElement("div");
    let cardCls = "mobile-day-card";
    if (hol) cardCls += " mdc-hol";
    else if (wd === 0 || wd === 6) cardCls += " mdc-we";
    if (isToday) cardCls += " mdc-today";
    
    card.className = cardCls;
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    
    let dutyHtml = "";
    if (bdHolder) {
      const shortName = bdHolder.split(" ").pop();
      dutyHtml += `<span class="mdc-duty-badge mdc-d"><span class="mdc-duty-letter">D</span><span class="mdc-duty-name">${shortName}</span></span>`;
    }
    if (hgHolder) {
      const shortName = hgHolder.split(" ").pop();
      dutyHtml += `<span class="mdc-duty-badge mdc-hg"><span class="mdc-duty-letter">H</span><span class="mdc-duty-name">${shortName}</span></span>`;
    }
    if (!bdHolder && !hgHolder) {
      dutyHtml = `<span class="mdc-empty-duty">kein Dienst</span>`;
    }
    
    let assignHtml = "";
    const shown = allAssigns.slice(0, 5);
    shown.forEach(a => {
      assignHtml += `<span class="mdc-assign-chip" style="background:${a.bg};color:${a.fg}">${a.code}</span>`;
    });
    if (allAssigns.length > 5) {
      assignHtml += `<span class="mdc-assign-more">+${allAssigns.length - 5}</span>`;
    }
    
    const planWishIndicator = planMode ? `<span class="mdc-plan-badge"></span>` : "";
    
    card.innerHTML = `
      <div class="mdc-date">
        <span class="mdc-day-num">${d}</span>
        <span class="mdc-day-dow">${DOW_ABBR[wd]}</span>
        ${d === 1 || wd === 1 ? `<span class="mdc-day-kw">KW${kw}</span>` : ""}
      </div>
      <div class="mdc-divider"></div>
      <div class="mdc-content">
        ${hol ? `<div class="mdc-hol-label">${holName}</div>` : ""}
        <div class="mdc-duties">${dutyHtml}</div>
        ${allAssigns.length ? `<div class="mdc-assigns">${assignHtml}</div>` : ""}
      </div>
      <div class="mdc-arrow">
        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </div>
      ${planWishIndicator}
    `;
    
    card.addEventListener("click", () => import('./app.js').then(m => m.openMobileDay(d)));
    card.addEventListener("keydown", e => { 
      if (e.key === "Enter" || e.key === " ") { 
        e.preventDefault(); 
        import('./app.js').then(m => m.openMobileDay(d)); 
      } 
    });
    
    listEl.appendChild(card);
    
    if (isToday) {
      setTimeout(() => card.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
    }
  }
}

