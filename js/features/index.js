import { initHistory, recordHistory, undo as globalUndo, redo as globalRedo, canUndo as globalCanUndo, canRedo as globalCanRedo, getHistoryEntries, clearHistory } from '../core/history.js';
import { initTooltips, showCellTooltip, hideTooltip, setTooltipsEnabled, isTooltipsEnabled } from '../core/tooltips.js';
import { initSelection, toggleCellSelection, clearSelection, getSelectedCells, getSelectedCount, selectAllVisible, selectRow, selectColumn, setSelectionMode, getSelectionMode } from '../core/selection.js';
import { printPreviewModal } from './print-preview.js';
import { pdfGenerator } from './pdf-generator.js';
import { MONTHS } from '../constants.js';
import { state } from '../state.js';
import { showToast } from '../render-modals.js';

export function initNewFeatures() {
  initHistory();
  initTooltips();
  initSelection();
  printPreviewModal.init();
  bindNewFeatureEvents();
  updateHistoryUI();
}

function bindNewFeatureEvents() {
  const undoBtn = document.getElementById("btn-global-undo");
  const redoBtn = document.getElementById("btn-global-redo");
  const historyBtn = document.getElementById("btn-history");
  const shortcutBtn = document.getElementById("btn-shortcuts");
  const selClearBtn = document.getElementById("sel-clear");
  const selEditBtn = document.getElementById("sel-edit");
  const selDeleteBtn = document.getElementById("sel-delete");
  const printPreviewBtn = document.getElementById("btn-print-preview");
  const settingsBtn = document.getElementById("btn-settings");

  if (undoBtn) undoBtn.addEventListener("click", () => {
    globalUndo();
    updateHistoryUI();
  });

  if (redoBtn) redoBtn.addEventListener("click", () => {
    globalRedo();
    updateHistoryUI();
  });

  if (historyBtn) historyBtn.addEventListener("click", showHistoryPanel);

  if (shortcutBtn) shortcutBtn.addEventListener("click", showShortcutOverlay);

  if (selClearBtn) selClearBtn.addEventListener("click", () => {
    clearSelection();
  });

  if (selEditBtn) selEditBtn.addEventListener("click", () => {
    const cells = getSelectedCells();
    if (cells.length > 0) {
      const { emp, day } = cells[0];
      window.dispatchEvent(new CustomEvent("radplan-edit-selected", { detail: { emp, day } }));
    }
  });

  if (selDeleteBtn) selDeleteBtn.addEventListener("click", () => {
    const cells = getSelectedCells();
    if (cells.length > 0 && confirm(`${cells.length} Zellen löschen?`)) {
      window.dispatchEvent(new CustomEvent("radplan-delete-selected", { detail: { cells } }));
    }
  });

  if (printPreviewBtn) printPreviewBtn.addEventListener("click", () => {
    printPreviewModal.open();
  });

  if (settingsBtn) settingsBtn.addEventListener("click", showSettingsPanel);

  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
      if (!isEditorOpen() && !isModalOpen()) {
        e.preventDefault();
        globalUndo();
        updateHistoryUI();
      }
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
      if (!isEditorOpen() && !isModalOpen()) {
        e.preventDefault();
        globalRedo();
        updateHistoryUI();
      }
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "?") {
      e.preventDefault();
      showShortcutOverlay();
    }
    if (e.key === "Escape") {
      hideTooltip();
    }
  });

  window.addEventListener("radplan-history-change", () => {
    updateHistoryUI();
  });

  window.addEventListener("radplan-cell-action", (e) => {
    const { action, emp, day } = e.detail;
    recordHistory({
      type: action,
      description: `${action}: ${emp}, Tag ${day}`
    });
  });

  window.addEventListener("radplan-print-preview-generate", (e) => {
    const { includeRbn, includeStats, includeComments, targetElement } = e.detail;
    generatePrintPreview(targetElement, { includeRbn, includeStats, includeComments });
  });
}

function isEditorOpen() {
  const editor = document.getElementById("modal-editor");
  return editor && !editor.hasAttribute("hidden");
}

function isModalOpen() {
  return document.querySelectorAll(".overlay:not([hidden])").length > 0;
}

function updateHistoryUI() {
  const undoBtn = document.getElementById("btn-global-undo");
  const redoBtn = document.getElementById("btn-global-redo");

  if (undoBtn) {
    undoBtn.disabled = !globalCanUndo();
    undoBtn.style.opacity = globalCanUndo() ? "1" : "0.4";
  }
  if (redoBtn) {
    redoBtn.disabled = !globalCanRedo();
    redoBtn.style.opacity = globalCanRedo() ? "1" : "0.4";
  }
}

function showHistoryPanel() {
  const entries = getHistoryEntries();
  const panel = document.createElement("div");
  panel.className = "shortcut-overlay visible";
  panel.innerHTML = `
    <div class="shortcut-panel">
      <h3>Verlauf</h3>
      <div class="shortcut-group">
        ${entries.length === 0 ? '<div style="color:rgba(15,23,42,0.5);font-size:13px;padding:8px 0;">Keine Einträge vorhanden</div>' : ''}
        ${entries.slice(-20).reverse().map(entry => `
          <div class="shortcut-item" style="opacity:${entry.isUndone ? '0.4' : '1'}">
            <span class="shortcut-desc">${entry.description || entry.action}</span>
            <span style="font-size:10px;color:rgba(15,23,42,0.4)">${new Date(entry.timestamp).toLocaleTimeString("de-DE")}</span>
          </div>
        `).join("")}
      </div>
      <div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end;">
        <button type="button" class="mbtn mbtn-ghost" id="history-clear">Verlauf löschen</button>
        <button type="button" class="mbtn mbtn-primary" id="history-close">Schließen</button>
      </div>
    </div>
  `;

  document.body.appendChild(panel);

  panel.querySelector("#history-close").addEventListener("click", () => panel.remove());
  panel.querySelector("#history-clear").addEventListener("click", () => {
    clearHistory();
    panel.remove();
    showToast("Verlauf gelöscht");
  });
  panel.addEventListener("click", (e) => {
    if (e.target === panel) panel.remove();
  });
}

function showShortcutOverlay() {
  const overlay = document.createElement("div");
  overlay.className = "shortcut-overlay visible";
  overlay.innerHTML = `
    <div class="shortcut-panel">
      <h3>Tastaturkürzel</h3>
      <div class="shortcut-group">
        <div class="shortcut-group-title">Allgemein</div>
        <div class="shortcut-item"><span class="shortcut-desc">Befehlspalette</span><span class="shortcut-key">Strg+K</span></div>
        <div class="shortcut-item"><span class="shortcut-desc">Rückgängig</span><span class="shortcut-key">Strg+Z</span></div>
        <div class="shortcut-item"><span class="shortcut-desc">Wiederherstellen</span><span class="shortcut-key">Strg+Y</span></div>
        <div class="shortcut-item"><span class="shortcut-desc">Tastaturkürzel anzeigen</span><span class="shortcut-key">Strg+?</span></div>
        <div class="shortcut-item"><span class="shortcut-desc">Alle auswählen</span><span class="shortcut-key">Strg+A</span></div>
      </div>
      <div class="shortcut-group">
        <div class="shortcut-group-title">Raster-Navigation</div>
        <div class="shortcut-item"><span class="shortcut-desc">Zelle navigieren</span><span class="shortcut-key">Pfeiltasten</span></div>
        <div class="shortcut-item"><span class="shortcut-desc">Arbeitsplatz 1-8</span><span class="shortcut-key">1-8</span></div>
        <div class="shortcut-item"><span class="shortcut-desc">Bereitschaft</span><span class="shortcut-key">D</span></div>
        <div class="shortcut-item"><span class="shortcut-desc">Hintergrund</span><span class="shortcut-key">H</span></div>
        <div class="shortcut-item"><span class="shortcut-desc">Löschen</span><span class="shortcut-key">Entf</span></div>
        <div class="shortcut-item"><span class="shortcut-desc">Editor öffnen</span><span class="shortcut-key">Eingabe</span></div>
        <div class="shortcut-item"><span class="shortcut-desc">Zelle zur Auswahl</span><span class="shortcut-key">Shift+Klick</span></div>
      </div>
      <div class="shortcut-group">
        <div class="shortcut-group-title">Navigation</div>
        <div class="shortcut-item"><span class="shortcut-desc">Vorheriger Monat</span><span class="shortcut-key">Alt+←</span></div>
        <div class="shortcut-item"><span class="shortcut-desc">Nächster Monat</span><span class="shortcut-key">Alt+→</span></div>
      </div>
      <div style="margin-top:16px;text-align:right;">
        <button type="button" class="mbtn mbtn-primary" id="shortcut-close">Schließen</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.querySelector("#shortcut-close").addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

function showSettingsPanel() {
  const overlay = document.createElement("div");
  overlay.className = "shortcut-overlay visible";
  overlay.innerHTML = `
    <div class="shortcut-panel">
      <h3>Einstellungen</h3>
      <div class="shortcut-group">
        <div class="shortcut-group-title">Anzeige</div>
        <div class="shortcut-item">
          <span class="shortcut-desc">Tooltips aktivieren</span>
          <label class="pp-checkbox" style="margin:0;">
            <input type="checkbox" id="setting-tooltips" ${isTooltipsEnabled() ? "checked" : ""}>
          </label>
        </div>
        <div class="shortcut-item">
          <span class="shortcut-desc">Auswahlmodus</span>
          <select id="setting-selection-mode" style="padding:4px 8px;border-radius:4px;border:1px solid rgba(15,23,42,0.12);font-size:11px;">
            <option value="single" ${getSelectionMode() === "single" ? "selected" : ""}>Einzelauswahl</option>
            <option value="multi" ${getSelectionMode() === "multi" ? "selected" : ""}>Mehrfachauswahl</option>
            <option value="range" ${getSelectionMode() === "range" ? "selected" : ""}>Bereich</option>
            <option value="column" ${getSelectionMode() === "column" ? "selected" : ""}>Spalte</option>
          </select>
        </div>
      </div>
      <div class="shortcut-group">
        <div class="shortcut-group-title">Daten</div>
        <div class="shortcut-item">
          <span class="shortcut-desc">Verlauf löschen</span>
          <button class="mbtn mbtn-ghost" id="setting-clear-history" style="padding:4px 12px;font-size:11px;">Löschen</button>
        </div>
      </div>
      <div style="margin-top:16px;text-align:right;">
        <button type="button" class="mbtn mbtn-primary" id="settings-close">Schließen</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.querySelector("#setting-tooltips").addEventListener("change", (e) => {
    setTooltipsEnabled(e.target.checked);
  });

  overlay.querySelector("#setting-selection-mode").addEventListener("change", (e) => {
    setSelectionMode(e.target.value);
  });

  overlay.querySelector("#setting-clear-history").addEventListener("click", () => {
    clearHistory();
    showToast("Verlauf gelöscht");
  });

  overlay.querySelector("#settings-close").addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

function generatePrintPreview(targetElement, options) {
  const { includeRbn, includeStats, includeComments } = options;
  const table = document.getElementById("plan-table");
  if (!table || !targetElement) return;

  const clone = table.cloneNode(true);

  if (!includeRbn) {
    clone.querySelectorAll(".tr-rbn").forEach(el => el.remove());
  }
  if (!includeStats) {
    clone.querySelectorAll(".tr-stat").forEach(el => el.remove());
  }
  if (!includeComments) {
    clone.querySelectorAll(".cell-comment-dot").forEach(el => el.remove());
  }

  targetElement.innerHTML = "";
  targetElement.appendChild(clone);
}

export async function generatePDF() {
  const table = document.getElementById("plan-table");
  if (!table) return;

  try {
    const result = await pdfGenerator.generateFromElement(table, {
      filename: `radplan_${state.year}_${String(state.month + 1).padStart(2, "0")}.pdf`,
      title: `RadPlan Dienstplan ${MONTHS[state.month]} ${state.year}`,
      orientation: "landscape"
    });
    if (result.success) {
      showToast(`PDF gespeichert: ${result.filename}`);
    }
  } catch (e) {
    console.error("PDF generation error:", e);
    showToast("PDF-Erzeugung fehlgeschlagen", "error");
  }
}
