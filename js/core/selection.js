import { state } from '../state.js';
import { daysInMonth } from '../constants.js';
import { getMonthData } from '../model.js';

const SELECTION_STORAGE_KEY = "radplan_v3_selection_mode";
let selectionMode = "single";
let selectedCells = new Set();
let selectionStart = null;
let isSelecting = false;
let selectionAnchor = null;

export function initSelection() {
  try {
    const stored = localStorage.getItem(SELECTION_STORAGE_KEY);
    if (stored === "multi" || stored === "range" || stored === "column") {
      selectionMode = stored;
    }
  } catch (e) {}
  
  document.addEventListener("keydown", handleGlobalKeydown);
}

export function setSelectionMode(mode) {
  selectionMode = mode;
  try {
    localStorage.setItem(SELECTION_STORAGE_KEY, mode);
  } catch (e) {}
  clearSelection();
}

export function getSelectionMode() {
  return selectionMode;
}

export function clearSelection() {
  selectedCells.clear();
  selectionStart = null;
  document.querySelectorAll(".td-cell.selected-cell").forEach(el => {
    el.classList.remove("selected-cell");
  });
  document.querySelectorAll(".td-cell.selection-anchor").forEach(el => {
    el.classList.remove("selection-anchor");
  });
  updateSelectionUI();
}

function getCellKey(emp, day) {
  return `${emp}|${day}`;
}

function parseCellKey(key) {
  const parts = key.split("|");
  return { emp: parts[0], day: parseInt(parts[1], 10) };
}

export function toggleCellSelection(emp, day, mode = null) {
  const key = getCellKey(emp, day);
  const effectiveMode = mode || selectionMode;
  
  if (effectiveMode === "single") {
    if (selectedCells.has(key)) {
      selectedCells.clear();
    } else {
      selectedCells.clear();
      selectedCells.add(key);
      selectionAnchor = key;
    }
  } else if (effectiveMode === "multi") {
    if (selectedCells.has(key)) {
      selectedCells.delete(key);
    } else {
      selectedCells.add(key);
    }
  } else if (effectiveMode === "range") {
    if (!selectionAnchor) {
      selectedCells.clear();
      selectedCells.add(key);
      selectionAnchor = key;
    } else {
      const anchor = parseCellKey(selectionAnchor);
      const anchorDay = anchor.day;
      
      selectedCells.clear();
      selectedCells.add(getCellKey(anchor.emp, anchorDay));
      
      const start = Math.min(anchorDay, day);
      const end = Math.max(anchorDay, day);
      for (let d = start; d <= end; d++) {
        selectedCells.add(getCellKey(emp, d));
      }
    }
  } else if (effectiveMode === "column") {
    const { year: y, month: m } = state;
    const md = getMonthData(y, m);
    
    if (!selectionAnchor) {
      selectedCells.clear();
      md.employees.forEach(e => {
        selectedCells.add(getCellKey(e, day));
      });
      selectionAnchor = key;
    } else {
      const anchor = parseCellKey(selectionAnchor);
      const start = Math.min(anchor.day, day);
      const end = Math.max(anchor.day, day);
      
      selectedCells.clear();
      md.employees.forEach(e => {
        for (let d = start; d <= end; d++) {
          selectedCells.add(getCellKey(e, d));
        }
      });
    }
  }
  
  updateSelectionUI();
}

export function selectAllVisible() {
  const { year: y, month: m } = state;
  const md = getMonthData(y, m);
  const dim = daysInMonth(y, m);
  
  selectedCells.clear();
  md.employees.forEach(emp => {
    for (let d = 1; d <= dim; d++) {
      selectedCells.add(getCellKey(emp, d));
    }
  });
  updateSelectionUI();
}

export function selectRow(emp) {
  const { year: y, month: m } = state;
  const dim = daysInMonth(y, m);
  
  selectedCells.clear();
  for (let d = 1; d <= dim; d++) {
    selectedCells.add(getCellKey(emp, d));
  }
  selectionAnchor = getCellKey(emp, 1);
  updateSelectionUI();
}

export function selectColumn(day) {
  const { year: y, month: m } = state;
  const md = getMonthData(y, m);
  
  selectedCells.clear();
  md.employees.forEach(emp => {
    selectedCells.add(getCellKey(emp, day));
  });
  selectionAnchor = getCellKey(md.employees[0], day);
  updateSelectionUI();
}

export function getSelectedCells() {
  return Array.from(selectedCells).map(key => parseCellKey(key));
}

export function getSelectedCount() {
  return selectedCells.size;
}

export function isCellSelected(emp, day) {
  return selectedCells.has(getCellKey(emp, day));
}

function updateSelectionUI() {
  document.querySelectorAll(".td-cell.selected-cell").forEach(el => {
    el.classList.remove("selected-cell");
  });
  document.querySelectorAll(".td-cell.selection-anchor").forEach(el => {
    el.classList.remove("selection-anchor");
  });
  
  selectedCells.forEach(key => {
    const { emp, day } = parseCellKey(key);
    const cell = document.querySelector(`.td-cell[data-emp="${emp}"][data-day="${day}"]`);
    if (cell) {
      cell.classList.add("selected-cell");
    }
  });
  
  if (selectionAnchor) {
    const { emp, day } = parseCellKey(selectionAnchor);
    const cell = document.querySelector(`.td-cell[data-emp="${emp}"][data-day="${day}"]`);
    if (cell) {
      cell.classList.add("selection-anchor");
    }
  }
  
  const countEl = document.getElementById("selection-count");
  if (countEl) {
    const count = selectedCells.size;
    countEl.textContent = count > 0 ? `${count} ausgewählt` : "";
    countEl.style.display = count > 0 ? "" : "none";
  }
  
  const toolbar = document.getElementById("selection-toolbar");
  if (toolbar) {
    toolbar.style.display = selectedCells.size > 0 ? "flex" : "none";
  }
  
  window.dispatchEvent(new CustomEvent("radplan-selection-change", {
    detail: { count: selectedCells.size, cells: getSelectedCells() }
  }));
}

function handleGlobalKeydown(e) {
  if (e.key === "Escape") {
    clearSelection();
  }
  
  if (e.ctrlKey && e.key === "a") {
    const activeTag = document.activeElement?.tagName?.toLowerCase();
    if (activeTag !== "input" && activeTag !== "textarea" && activeTag !== "select") {
      e.preventDefault();
      selectAllVisible();
    }
  }
}

export function applyBulkAction(action) {
  const cells = getSelectedCells();
  if (cells.length === 0) return { success: false, count: 0 };
  
  return { success: true, count: cells.length, cells };
}

export function getSelectionBounds() {
  if (selectedCells.size === 0) return null;
  
  const cells = getSelectedCells();
  const emps = [...new Set(cells.map(c => c.emp))];
  const days = [...new Set(cells.map(c => c.day))];
  
  return {
    employees: emps,
    minDay: Math.min(...days),
    maxDay: Math.max(...days),
    count: cells.length
  };
}
