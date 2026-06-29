import { MONTHS } from './constants.js';
import { state } from './state.js';
import { getEmployeesForYear } from './model.js';
import { showOverlay, hideOverlay, openProfileModal } from './render-modals.js';
import { switchPeriod, toggleTheme, toggleDensity } from './app.js';

const OVERLAY_ID = "modal-command-palette";

let activeIndex = 0;
let currentItems = [];

function staticCommands() {
  return [
    {
      group: "Funktionen",
      label: "Auswertungen öffnen",
      hint: "Abdeckung, Fairness, Jahresgitter, Kurven, Prognose, Berichte",
      run: () => document.getElementById("btn-analytics")?.click()
    },
    {
      group: "Funktionen",
      label: "Mitarbeitende verwalten",
      run: () => document.getElementById("btn-employees")?.click()
    },
    {
      group: "Funktionen",
      label: "Daten exportieren (JSON)",
      run: () => document.getElementById("btn-export")?.click()
    },
    {
      group: "Funktionen",
      label: "Daten importieren (JSON)",
      run: () => document.getElementById("btn-import")?.click()
    },
    {
      group: "Funktionen",
      label: "Monatsplan drucken / als PDF speichern",
      run: () => document.getElementById("btn-print")?.click()
    },
    {
      group: "Funktionen",
      label: "Planungsmodus starten",
      run: () => document.getElementById("btn-plan")?.click()
    },
    {
      group: "Funktionen",
      label: "Auto-Plan ausführen",
      hint: "nur im Planungsmodus verfügbar",
      run: () => document.getElementById("btn-plan-auto")?.click()
    },
    {
      group: "Funktionen",
      label: "Zum heutigen Monat springen",
      run: () => document.getElementById("btn-today")?.click()
    },
    {
      group: "Funktionen",
      label: "Hell-/Dunkelmodus umschalten",
      run: () => toggleTheme()
    },
    {
      group: "Funktionen",
      label: "Spaltendichte umschalten",
      hint: "kompakt / normal",
      run: () => toggleDensity()
    }
  ];
}

function monthCommands() {
  const items = [];
  const years = [state.year - 1, state.year, state.year + 1];
  years.forEach((y) => {
    MONTHS.forEach((label, idx) => {
      items.push({
        group: "Monat",
        label: `${label} ${y}`,
        run: () => switchPeriod(y, idx)
      });
    });
  });
  return items;
}

function employeeCommands() {
  const employees = getEmployeesForYear(state.year) || [];
  return employees.map((emp) => ({
    group: "Mitarbeitende",
    label: emp,
    hint: "Profil öffnen",
    run: () => openProfileModal(emp)
  }));
}

function allCommands() {
  return [...staticCommands(), ...employeeCommands(), ...monthCommands()];
}

function normalize(str) {
  return str.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function filterCommands(query) {
  const all = allCommands();
  if (!query.trim()) {
    return all.filter((c) => c.group !== "Monat").slice(0, 30);
  }
  const q = normalize(query);
  return all
    .map((c) => {
      const haystack = normalize(`${c.label} ${c.group}`);
      const idx = haystack.indexOf(q);
      return { c, idx };
    })
    .filter((entry) => entry.idx >= 0)
    .sort((a, b) => a.idx - b.idx)
    .slice(0, 30)
    .map((entry) => entry.c);
}

function renderResults(items) {
  const list = document.getElementById("cmdk-results");
  if (!list) return;
  currentItems = items;
  activeIndex = items.length ? 0 : -1;

  if (!items.length) {
    list.innerHTML = `<div class="cmdk-empty">Keine Treffer</div>`;
    return;
  }

  let lastGroup = null;
  let html = "";
  items.forEach((item, i) => {
    if (item.group !== lastGroup) {
      html += `<div class="cmdk-group-label">${item.group}</div>`;
      lastGroup = item.group;
    }
    html += `
      <button type="button" class="cmdk-item${i === 0 ? " cmdk-active" : ""}" data-idx="${i}" role="option" aria-selected="${i === 0}">
        <span class="cmdk-item-label">${item.label}</span>
        ${item.hint ? `<span class="cmdk-item-hint">${item.hint}</span>` : ""}
      </button>
    `;
  });
  list.innerHTML = html;

  list.querySelectorAll(".cmdk-item").forEach((btn) => {
    btn.addEventListener("click", () => runItem(parseInt(btn.dataset.idx, 10)));
  });
}

function setActive(idx) {
  const list = document.getElementById("cmdk-results");
  if (!list) return;
  const items = list.querySelectorAll(".cmdk-item");
  if (!items.length) return;
  activeIndex = Math.max(0, Math.min(idx, items.length - 1));
  items.forEach((el, i) => {
    el.classList.toggle("cmdk-active", i === activeIndex);
    el.setAttribute("aria-selected", String(i === activeIndex));
  });
  items[activeIndex]?.scrollIntoView({ block: "nearest" });
}

function runItem(idx) {
  const item = currentItems[idx];
  if (!item) return;
  closeCommandPalette();
  setTimeout(() => item.run(), 30);
}

export function openCommandPalette() {
  showOverlay(OVERLAY_ID);
  const input = document.getElementById("cmdk-input");
  if (input) {
    input.value = "";
    renderResults(filterCommands(""));
    setTimeout(() => input.focus(), 60);
  }
}

export function closeCommandPalette() {
  hideOverlay(OVERLAY_ID);
}

export function isCommandPaletteOpen() {
  const el = document.getElementById(OVERLAY_ID);
  return !!el && !el.hasAttribute("hidden");
}

export function initCommandPalette() {
  const input = document.getElementById("cmdk-input");
  const overlay = document.getElementById(OVERLAY_ID);

  input?.addEventListener("input", () => {
    renderResults(filterCommands(input.value));
  });

  input?.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(activeIndex + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(activeIndex - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      runItem(activeIndex);
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeCommandPalette();
    }
  });

  overlay?.addEventListener("mousedown", (e) => {
    if (e.target === overlay) closeCommandPalette();
  });

  document.addEventListener("keydown", (e) => {
    const isPaletteShortcut = (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "k";
    if (isPaletteShortcut) {
      e.preventDefault();
      if (isCommandPaletteOpen()) {
        closeCommandPalette();
      } else {
        openCommandPalette();
      }
    }
  });

  document.getElementById("btn-cmdk")?.addEventListener("click", () => openCommandPalette());
}
