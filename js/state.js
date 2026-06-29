import { STORAGE_KEY, normalizeMonthDataShape, reconcileEmployeesForMonth, monthKey } from './constants.js';

export let DATA = {};

export let state = {
  year: new Date().getFullYear(),
  month: new Date().getMonth(),
  edit: null,
  ed: { 
    wp: [], 
    st: null, 
    duty: null 
  },
  employeeDashboard: {
    filter: "",
    role: "ALL",
    selectedEmp: null,
    detailView: "months",
    sort: "name",
    activeOnly: false,
    analyticsRange: "month",
    customStart: null,
    customEnd: null,
  },
  periodDraft: {
    year: new Date().getFullYear(),
    month: new Date().getMonth()
  },
  profileEmp: null,
  profileCalView: "month",
  empScreen: "team",
  profileTab: "overview",
  multiEdit: {
    emp: null,
    days: [],
    anchor: null,
  },
};

export let deptTab = "month";
export let planMode = false;
export let planData = null;
export let planBaseline = null;
export let planHistory = [];
export let planHistoryIdx = -1;
export let planSessions = {};
export let IS_MOBILE = false;
export let responsiveLayoutRaf = 0;
export let serverLastModified = 0;
export let serverFetchSuccessful = false;

export const today = new Date();
export const TOD_Y = today.getFullYear();
export const TOD_M = today.getMonth();
export const TOD_D = today.getDate();

let saveTimeout = null;
let saveInFlight = false;
let saveQueuedWhileInFlight = false;
let saveRequestToken = 0;
let lastSyncedSnapshot = null;

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Field-level 3-way merge (base = last known server state, local = our unsaved
// edits, server = the state we just lost the 409 race against). Recurses into
// plain-object trees (month -> employee -> day -> cell) so only the individual
// fields that genuinely changed on both sides since `base` are treated as
// conflicts; everything else is merged automatically without data loss.
function mergeThreeWay(base, local, server, stats) {
  if (deepEqual(local, server)) return local;
  if (deepEqual(local, base)) {
    stats.serverWins++;
    return server;
  }
  if (deepEqual(server, base)) {
    stats.localWins++;
    return local;
  }

  if (isPlainObject(base) && isPlainObject(local) && isPlainObject(server)) {
    const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(server)]);
    const out = {};
    keys.forEach((k) => {
      out[k] = mergeThreeWay(base[k], local[k], server[k], stats);
    });
    return out;
  }

  stats.conflicts++;
  return local;
}

function mergePlanDrafts(localPlans, serverPlans, activeKey) {
  const merged = { ...(serverPlans || {}) };
  if (activeKey && localPlans[activeKey]) {
    merged[activeKey] = localPlans[activeKey];
  }
  return merged;
}

function collectLocalPlans() {
  const plans = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith("radplan_v3_plan_")) {
      try {
        plans[k.replace("radplan_v3_plan_", "")] = JSON.parse(localStorage.getItem(k));
      } catch (err) {
        console.error("Fehler beim Parsen eines lokalen Plans:", err);
      }
    }
  }
  return plans;
}

function replaceLocalPlans(plans) {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key && key.startsWith("radplan_v3_plan_")) {
      localStorage.removeItem(key);
    }
  }
  if (plans && typeof plans === "object") {
    for (const [pk, pv] of Object.entries(plans)) {
      localStorage.setItem(`radplan_v3_plan_${pk}`, JSON.stringify(pv));
    }
  }
}

function applyServerSnapshot(serverData) {
  serverLastModified = parseInt(serverData.lastModified, 10) || 0;
  const newMain = serverData.main ? serverData.main : serverData;

  Object.keys(DATA).forEach((k) => delete DATA[k]);
  Object.assign(DATA, newMain);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(DATA));

  let snapshotChanged = false;
  Object.entries(DATA).forEach(([key, md]) => {
    normalizeMonthDataShape(md);
    const [yearPart, monthPart] = key.split("-");
    snapshotChanged = reconcileEmployeesForMonth(md, parseInt(yearPart, 10), parseInt(monthPart, 10)) || snapshotChanged;
  });
  if (snapshotChanged) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DATA));
  }

  replaceLocalPlans(serverData.plans || {});
  lastSyncedSnapshot = JSON.parse(JSON.stringify(DATA));
}

async function flushSaveToServer() {
  if (saveInFlight) {
    saveQueuedWhileInFlight = true;
    return;
  }

  if (!serverFetchSuccessful) {
    const synced = await forceSyncWithServer();
    if (!synced) {
      window.dispatchEvent(new CustomEvent("radplan-save-error"));
      return;
    }
  }

  saveInFlight = true;
  window.dispatchEvent(new CustomEvent("radplan-save-start"));

  const requestToken = ++saveRequestToken;

  try {
    const payload = {
      main: DATA,
      plans: collectLocalPlans(),
      lastModified: serverLastModified
    };

    const res = await fetch(`/api?t=${Date.now()}`, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (res.status === 409) {
      const conflictData = await res.json();
      if (conflictData.latestData) {
        const serverMain = conflictData.latestData.main || conflictData.latestData;
        const base = lastSyncedSnapshot || {};
        const stats = { conflicts: 0, localWins: 0, serverWins: 0 };
        const mergedMain = mergeThreeWay(base, DATA, serverMain, stats);

        Object.keys(DATA).forEach((k) => delete DATA[k]);
        Object.assign(DATA, mergedMain);
        Object.values(DATA).forEach((md) => normalizeMonthDataShape(md));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(DATA));

        const activeKey = planMode ? monthKey(state.year, state.month) : null;
        const mergedPlans = mergePlanDrafts(collectLocalPlans(), conflictData.latestData.plans || {}, activeKey);
        replaceLocalPlans(mergedPlans);

        serverLastModified = parseInt(conflictData.latestData.lastModified, 10) || 0;
        serverFetchSuccessful = true;
        lastSyncedSnapshot = JSON.parse(JSON.stringify(DATA));

        window.dispatchEvent(new CustomEvent("radplan-sync-conflict", { detail: stats }));

        if (stats.localWins > 0 || stats.conflicts > 0) {
          flushSaveToServer();
        }
      }
      return;
    }

    if (!res.ok) {
      console.error("saveToStorage HTTP Error:", res.status);
      window.dispatchEvent(new CustomEvent("radplan-save-error"));
      return;
    }

    const resData = await res.json();
    if (resData.lastModified) {
      serverLastModified = parseInt(resData.lastModified, 10) || 0;
      serverFetchSuccessful = true;
    }
    lastSyncedSnapshot = JSON.parse(JSON.stringify(DATA));

    if (requestToken === saveRequestToken) {
      window.dispatchEvent(new CustomEvent("radplan-save-success"));
    }
  } catch (e) {
    console.error("saveToStorage Network/Parse Error:", e);
    window.dispatchEvent(new CustomEvent("radplan-save-error"));
  } finally {
    saveInFlight = false;
    if (saveQueuedWhileInFlight) {
      saveQueuedWhileInFlight = false;
      flushSaveToServer();
    }
  }
}

export async function loadFromStorage() {
  let loadedData = null;
  let loadedFromServer = false;
  serverFetchSuccessful = false;
  
  try {
    const res = await fetch(`/api?t=${Date.now()}`, {
      method: "GET",
      cache: "no-store"
    });
    
    if (res.ok) {
      const serverData = await res.json();
      serverFetchSuccessful = true;
      applyServerSnapshot(serverData.main ? serverData : { main: serverData, plans: {}, lastModified: serverData.lastModified });
      loadedFromServer = true;
    } else {
      console.error("loadFromStorage HTTP Error:", res.status);
      const r = localStorage.getItem(STORAGE_KEY);
      if (r) {
        loadedData = JSON.parse(r);
      }
    }
  } catch (e) {
    console.error("loadFromStorage Network/Parse Error:", e);
    const r = localStorage.getItem(STORAGE_KEY);
    if (r) {
      loadedData = JSON.parse(r);
    }
  }
  
  if (loadedData && !loadedFromServer) {
    Object.keys(DATA).forEach((k) => delete DATA[k]);
    Object.assign(DATA, loadedData);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DATA));
  }
  
  if (loadedFromServer) {
    return;
  }

  let loadedDataChanged = false;
  Object.entries(DATA).forEach(([key, md]) => {
    const parts = key.split("-");
    if (parts.length === 2) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      if (!isNaN(y) && !isNaN(m)) {
        normalizeMonthDataShape(md);
        loadedDataChanged = reconcileEmployeesForMonth(md, y, m) || loadedDataChanged;
      }
    }
  });
  if (loadedDataChanged) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DATA));
  }
}

export function saveToStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(DATA));
  
  window.dispatchEvent(new CustomEvent("radplan-save-queued"));
  
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }
  
  saveTimeout = setTimeout(() => {
    flushSaveToServer();
  }, 120);
}

export async function syncWithServer() {
  try {
    const res = await fetch(`/api?t=${Date.now()}`, {
      method: "GET",
      cache: "no-store"
    });
    
    if (!res.ok) {
      console.error("syncWithServer HTTP Error:", res.status);
      return false;
    }
    
    const serverData = await res.json();
    serverFetchSuccessful = true;
    const incomingMod = parseInt(serverData.lastModified, 10) || 0;
    
    if (incomingMod > 0 && incomingMod > serverLastModified) {
      applyServerSnapshot(serverData.main ? serverData : { main: serverData, plans: {}, lastModified: incomingMod });
      window.dispatchEvent(new CustomEvent("radplan-sync-update"));
      return true;
    }
    
    return false;
  } catch (e) {
    console.error("syncWithServer Network/Parse Error:", e);
    return false;
  }
}

export async function forceSyncWithServer() {
  try {
    const res = await fetch(`/api?t=${Date.now()}`, {
      method: "GET",
      cache: "no-store"
    });
    
    if (!res.ok) {
      console.error("forceSyncWithServer HTTP Error:", res.status);
      return false;
    }
    
    const text = await res.text();
    if (!text) {
      console.error("forceSyncWithServer Error: Empty response body");
      return false;
    }
    
    const serverData = JSON.parse(text);
    serverFetchSuccessful = true;
    applyServerSnapshot(serverData.main ? serverData : { main: serverData, plans: {}, lastModified: serverData.lastModified });
    
    window.dispatchEvent(new CustomEvent("radplan-sync-update"));
    return true;
  } catch (e) {
    console.error("forceSyncWithServer Network/Parse Error:", e);
    return false;
  }
}

export function setDeptTab(val) { 
  deptTab = val; 
}

export function setPlanMode(val) { 
  planMode = val; 
}

export function setPlanData(val) { 
  planData = val; 
}

export function setPlanBaseline(val) { 
  planBaseline = val; 
}

export function setPlanHistory(val) { 
  planHistory = val; 
}

export function setPlanHistoryIdx(val) { 
  planHistoryIdx = val; 
}

export function setPlanSessions(val) { 
  planSessions = val; 
}

export function setIsMobile(val) { 
  IS_MOBILE = val; 
}

export function setResponsiveLayoutRaf(val) { 
  responsiveLayoutRaf = val; 
}

export const store = {
  get DATA() { return DATA; },
  set DATA(val) { DATA = val; },
  get serverFetchSuccessful() { return serverFetchSuccessful; },
  set serverFetchSuccessful(val) { serverFetchSuccessful = val; }
};

