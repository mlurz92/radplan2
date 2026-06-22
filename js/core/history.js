import { DATA, state, planMode, planData, saveToStorage } from '../state.js';
import { getMonthData, cloneData } from '../model.js';
import { render } from '../render-grid.js';
import { showToast } from '../render-modals.js';

const HISTORY_STORAGE_KEY = "radplan_v3_history";
const MAX_HISTORY_ENTRIES = 100;

let globalHistory = [];
let globalHistoryIdx = -1;
let historyEnabled = true;

export function initHistory() {
  try {
    const stored = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed.entries) && typeof parsed.idx === "number") {
        globalHistory = parsed.entries;
        globalHistoryIdx = parsed.idx;
      }
    }
  } catch (e) {
    globalHistory = [];
    globalHistoryIdx = -1;
  }
}

function persistHistory() {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify({
      entries: globalHistory,
      idx: globalHistoryIdx
    }));
  } catch (e) {
    // localStorage full or unavailable
  }
}

export function recordHistory(action = {}) {
  if (!historyEnabled) return;
  
  const snapshot = createSnapshot();
  const entry = {
    timestamp: Date.now(),
    action: action.type || "unknown",
    description: action.description || "",
    snapshot: snapshot,
    planMode: planMode,
    year: state.year,
    month: state.month
  };
  
  globalHistory = globalHistory.slice(0, globalHistoryIdx + 1);
  globalHistory.push(entry);
  
  if (globalHistory.length > MAX_HISTORY_ENTRIES) {
    globalHistory = globalHistory.slice(globalHistory.length - MAX_HISTORY_ENTRIES);
  }
  
  globalHistoryIdx = globalHistory.length - 1;
  persistHistory();
  
  window.dispatchEvent(new CustomEvent("radplan-history-change", {
    detail: { canUndo: canUndo(), canRedo: canRedo() }
  }));
}

function createSnapshot() {
  if (planMode && planData) {
    return {
      type: "plan",
      data: cloneData(planData)
    };
  }
  return {
    type: "main",
    data: cloneData(DATA)
  };
}

function restoreSnapshot(snapshot) {
  if (!snapshot || !snapshot.data) return;
  
  if (snapshot.type === "plan" && planMode && planData) {
    planData.assignments = cloneData(snapshot.data.assignments || {});
    planData.rbn = cloneData(snapshot.data.rbn || {});
    planData.wishes = cloneData(snapshot.data.wishes || {});
    planData.pins = cloneData(snapshot.data.pins || {});
  } else if (snapshot.type === "main") {
    Object.keys(DATA).forEach(k => delete DATA[k]);
    Object.assign(DATA, cloneData(snapshot.data));
    saveToStorage();
  }
}

export function undo() {
  if (!canUndo()) {
    showToast("Keine Aktion zum Rückgängig machen verfügbar");
    return false;
  }
  
  if (globalHistoryIdx > 0) {
    globalHistoryIdx--;
    const entry = globalHistory[globalHistoryIdx];
    restoreSnapshot(entry.snapshot);
    persistHistory();
    render();
    
    window.dispatchEvent(new CustomEvent("radplan-history-change", {
      detail: { canUndo: canUndo(), canRedo: canRedo() }
    }));
    
    showToast(entry.description || "Rückgängig gemacht");
    return true;
  }
  return false;
}

export function redo() {
  if (!canRedo()) {
    showToast("Keine Aktion zum Wiederherstellen verfügbar");
    return false;
  }
  
  if (globalHistoryIdx < globalHistory.length - 1) {
    globalHistoryIdx++;
    const entry = globalHistory[globalHistoryIdx];
    restoreSnapshot(entry.snapshot);
    persistHistory();
    render();
    
    window.dispatchEvent(new CustomEvent("radplan-history-change", {
      detail: { canUndo: canUndo(), canRedo: canRedo() }
    }));
    
    showToast(entry.description || "Wiederhergestellt");
    return true;
  }
  return false;
}

export function canUndo() {
  return globalHistoryIdx > 0 && globalHistory.length > 0;
}

export function canRedo() {
  return globalHistoryIdx < globalHistory.length - 1;
}

export function getHistoryEntries() {
  return globalHistory.map((entry, idx) => ({
    index: idx,
    timestamp: entry.timestamp,
    action: entry.action,
    description: entry.description,
    isActive: idx === globalHistoryIdx,
    isUndone: idx > globalHistoryIdx
  }));
}

export function clearHistory() {
  globalHistory = [];
  globalHistoryIdx = -1;
  persistHistory();
  window.dispatchEvent(new CustomEvent("radplan-history-change", {
    detail: { canUndo: false, canRedo: false }
  }));
}

export function setHistoryEnabled(enabled) {
  historyEnabled = enabled;
}

export function isHistoryEnabled() {
  return historyEnabled;
}
