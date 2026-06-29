/**
 * RadPlan — Undo/Redo für den Normalmodus.
 *
 * Im Planungsmodus existiert bereits eine eigene Snapshot-Historie (siehe
 * recordPlanHistory/undoPlan/redoPlan in app.js). Dieses Modul ergänzt eine
 * generische, entkoppelte Historie für den Normalmodus, die JEDE Mutation der
 * Hauptdaten erfasst: Zellenänderungen, RBN-Zeile, Notizen, Import, Löschungen
 * und das Entfernen von Mitarbeitenden.
 *
 * Funktionsweise: Jede datenverändernde Aktion ruft am Ende saveToStorage()
 * auf, das synchron das Event `radplan-save-queued` feuert. Wir hängen uns
 * dort ein und vergleichen einen JSON-Snapshot der DATA gegen den letzten
 * bekannten Stand. Unterscheiden sich beide, wird der alte Stand auf den
 * Undo-Stack gelegt. Dadurch ist keine Instrumentierung der zahlreichen
 * einzelnen Mutationsstellen nötig.
 */

import { DATA, saveToStorage, planMode } from './state.js';
import { monthKey } from './constants.js';
import { render } from './render-grid.js';
import { showToast } from './render-modals.js';

const MAX_HISTORY = 80;

let baseline = null;        // JSON-String des letzten festgeschriebenen Standes
let undoStack = [];         // ältere JSON-Snapshots (jeweils Stand VOR einer Änderung)
let redoStack = [];
let suppress = false;       // verhindert Re-Capture während Undo/Redo/Reset
let captureTimer = null;

// Änderungsprotokoll für Tooltips: key `${mk}|${emp}|${day}` -> { ts, from, to }
const changeLog = new Map();

function cloneDATAString() {
  return JSON.stringify(DATA);
}

function replaceData(obj) {
  Object.keys(DATA).forEach((k) => delete DATA[k]);
  Object.assign(DATA, obj);
}

function cellSummary(cell) {
  if (!cell || typeof cell !== 'object') return '';
  const a = cell.assignment || '';
  const d = cell.duty ? ` [${cell.duty}]` : '';
  return `${a}${d}`.trim();
}

// Diff zweier DATA-Stände und Eintrag der geänderten Zellen ins Änderungsprotokoll.
function recordCellDiffs(oldData, newData) {
  const ts = Date.now();
  const keys = new Set([...Object.keys(oldData || {}), ...Object.keys(newData || {})]);
  keys.forEach((mk) => {
    const oa = oldData?.[mk]?.assignments || {};
    const na = newData?.[mk]?.assignments || {};
    const emps = new Set([...Object.keys(oa), ...Object.keys(na)]);
    emps.forEach((emp) => {
      const od = oa[emp] || {};
      const nd = na[emp] || {};
      const days = new Set([...Object.keys(od), ...Object.keys(nd)]);
      days.forEach((day) => {
        const before = cellSummary(od[day]);
        const after = cellSummary(nd[day]);
        if (before !== after) {
          changeLog.set(`${mk}|${emp}|${day}`, { ts, from: before, to: after });
        }
      });
    });
  });
}

function scheduleCapture() {
  if (suppress || planMode) return;
  if (captureTimer) clearTimeout(captureTimer);
  // Mehrere schnell aufeinanderfolgende Mutationen (z. B. Multi-Edit, Import,
  // automatisch gesetzte F-Tage) werden zu EINEM Undo-Schritt zusammengefasst.
  captureTimer = setTimeout(capture, 260);
}

function capture() {
  captureTimer = null;
  if (suppress || planMode) return;
  const cur = cloneDATAString();
  if (cur === baseline) return;

  if (baseline) {
    try {
      recordCellDiffs(JSON.parse(baseline), JSON.parse(cur));
    } catch (e) { /* defensiv: Diff darf die Historie nie blockieren */ }
    undoStack.push(baseline);
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
  }
  redoStack = [];
  baseline = cur;
  updateNormalHistoryUI();
}

function applySnapshot(json) {
  let obj;
  try {
    obj = JSON.parse(json);
  } catch (e) {
    return false;
  }
  suppress = true;
  replaceData(obj);
  saveToStorage();   // feuert synchron save-queued -> wird durch suppress ignoriert
  baseline = json;
  render();          // ggf. ausgelöste Reconcile-Speicherungen sollen nicht erfasst werden
  suppress = false;
  return true;
}

export function normalUndo() {
  if (planMode) return false;
  if (captureTimer) { clearTimeout(captureTimer); capture(); }
  if (!undoStack.length) {
    showToast('Nichts zum Rückgängigmachen');
    return false;
  }
  redoStack.push(baseline);
  const prev = undoStack.pop();
  applySnapshot(prev);
  updateNormalHistoryUI();
  showToast('Rückgängig gemacht');
  return true;
}

export function normalRedo() {
  if (planMode) return false;
  if (!redoStack.length) {
    showToast('Nichts zum Wiederherstellen');
    return false;
  }
  undoStack.push(baseline);
  const next = redoStack.pop();
  applySnapshot(next);
  updateNormalHistoryUI();
  showToast('Wiederhergestellt');
  return true;
}

export function canNormalUndo() {
  return !planMode && (undoStack.length > 0 || captureTimer !== null);
}

export function canNormalRedo() {
  return !planMode && redoStack.length > 0;
}

export function updateNormalHistoryUI() {
  const undoBtn = document.getElementById('btn-undo');
  const redoBtn = document.getElementById('btn-redo');
  const mUndo = document.getElementById('mbtn-undo');
  const mRedo = document.getElementById('mbtn-redo');

  // Im Planungsmodus übernimmt die Planungsleiste die Undo/Redo-Funktion;
  // die globalen Buttons werden ausgeblendet, um Verwechslungen zu vermeiden.
  const hide = planMode;
  [undoBtn, redoBtn].forEach((b) => {
    if (b) b.style.display = hide ? 'none' : '';
  });

  const cu = undoStack.length > 0;
  const cr = redoStack.length > 0;
  if (undoBtn) undoBtn.disabled = !cu;
  if (redoBtn) redoBtn.disabled = !cr;
  if (mUndo) mUndo.disabled = !cu;
  if (mRedo) mRedo.disabled = !cr;
}

// Liefert die letzte protokollierte Änderung einer Zelle (für Tooltips).
export function getLastChange(year, month, emp, day) {
  return changeLog.get(`${monthKey(year, month)}|${emp}|${day}`) || null;
}

// Setzt die Historie auf den aktuellen DATA-Stand zurück (z. B. nach einem
// Server-Sync, der die Daten komplett ersetzt hat).
export function resetNormalHistory() {
  if (captureTimer) { clearTimeout(captureTimer); captureTimer = null; }
  undoStack = [];
  redoStack = [];
  baseline = cloneDATAString();
  updateNormalHistoryUI();
}

export function initNormalHistory() {
  baseline = cloneDATAString();
  window.addEventListener('radplan-save-queued', scheduleCapture);
  // Externe Datenersetzungen invalidieren die lokale Historie.
  window.addEventListener('radplan-sync-update', resetNormalHistory);
  updateNormalHistoryUI();
}
