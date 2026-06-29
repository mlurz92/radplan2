import {
  VACATION_CODES,
  VACATION_LIKE_CODES,
  ABSENCE_CODES,
  isFacharzt,
  isAssistenzarzt,
  hasKnownRole,
  SPECIAL_RULES,
  getReducedBdTarget,
  isNoBdWeekday,
  isNoHgFromAaWeekday,
  isSaturdayUltimaRatio,
  getSurplusBdPreferenceRank,
  needsSaturdayFza,
  getCtLeadershipPartner,
  getHgConflictBd,
  getSaxonyHolidaysCached,
  monthKey, 
  dateKey,
  daysInMonth, 
  weekday, 
  isWeekend,
  isWorkday, 
  isHoliday, 
  nextCalendarDay, 
  prevCalendarDay, 
  isoWeekNumber,
  easterDate, 
  addDays,
  DOW_ABBR,
  DOW_LONG,
  MONTHS,
  MONTHS_SHORT,
  getEmpMeta,
  posColor
} from './constants.js';

import { 
  state, 
  planMode, 
  planData, 
  DATA 
} from './state.js';

import { 
  getMonthData, 
  getCell, 
  dutyOwner 
} from './model.js';

export let autoPlanResult = null;
export let autoPlanTargets = {};
export let apViewMode = "config";
export let autoPlanConfigRenderToken = 0;

export const DUTY_EXEMPT = SPECIAL_RULES.dutyExempt;
export const TARGET_WEEKEND_DUTY = 1;
export const RELAXED_WEEKEND_DUTY_LIMIT = 1.5;

export const AUTO_PLAN_WEIGHT_PROFILES = {
  standard: { key: "standard", label: "Ausgewogen", hint: "Solver-Standardgewichtung aus harter Regelkonformität, Fairness und Wunscherfüllung.", wish: 1, fairness: 1 },
  fairness: { key: "fairness", label: "Fairness-optimiert", hint: "Gewichtet die gleichmäßige Verteilung von WE-/Samstags-/HG-Diensten stärker, Wünsche treten zurück.", wish: 0.5, fairness: 1.6 },
  wish: { key: "wish", label: "Wunscherfüllung-optimiert", hint: "Gewichtet erfüllte Dienstwünsche deutlich stärker, Fairness-Ausgleich tritt zurück.", wish: 2.4, fairness: 0.65 }
};

export function isDutyExempt(empName) { 
  return DUTY_EXEMPT.includes(empName); 
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function collectHistoricalDutyStats(upToYear, upToMonth) {
  const stats = {};
  const md = getMonthData(upToYear, upToMonth);
  
  md.employees.forEach((e) => {
    stats[e] = { 
      bd: 0, 
      hg: 0, 
      weDuty: 0, 
      holDuty: 0, 
      thuBd: 0, 
      hgForAA: 0, 
      hgForFA: 0, 
      satBd: 0 
    };
  });
  
  for (const [k, mData] of Object.entries(DATA)) {
    if (!mData || typeof mData !== "object" || !Array.isArray(mData.employees) || !mData.assignments) {
      continue;
    }
    
    const parts = k.split("-");
    const ky = parseInt(parts[0], 10);
    const km = parseInt(parts[1], 10);
    
    if (!Number.isFinite(ky) || !Number.isFinite(km) || km < 0 || km > 11) {
      continue;
    }
    
    // Historische Kennzahlen werden nur seit dem 01.01. des Zieljahres erhoben:
    // Vorjahre und der laufende sowie zukünftige Monate bleiben außen vor.
    if (ky !== upToYear || km >= upToMonth) {
      continue;
    }
    
    const hols = getSaxonyHolidaysCached(ky);
    const dim = daysInMonth(ky, km);
    const weMapPerEmp = {};
    const bdOwnerByDay = {};
    const dayMeta = new Array(dim + 1);
    
    for (let d = 1; d <= dim; d++) {
      const wd = weekday(ky, km, d);
      dayMeta[d] = { 
        wd: wd, 
        hol: isHoliday(ky, km, d, hols), 
        isWEDay: wd === 5 || wd === 6 || wd === 0, 
        kw: isoWeekNumber(ky, km, d) 
      };
    }
    
    mData.employees.forEach(emp => {
      if (!stats[emp]) {
        stats[emp] = { bd: 0, hg: 0, weDuty: 0, holDuty: 0, thuBd: 0, hgForAA: 0, hgForFA: 0, satBd: 0 };
      }
      weMapPerEmp[emp] = {};
    });
    
    for (let d = 1; d <= dim; d++) {
      mData.employees.forEach(emp => { 
        if (mData.assignments?.[emp]?.[d]?.duty === "D") {
          bdOwnerByDay[d] = emp;
        }
      });
    }
    
    for (let d = 1; d <= dim; d++) {
      const meta = dayMeta[d];
      mData.employees.forEach(emp => {
        const cell = mData.assignments?.[emp]?.[d];
        if (!cell?.duty) {
          return;
        }
        
        if (cell.duty === "D") {
          stats[emp].bd++;
          if (meta.hol) stats[emp].holDuty++;
          if (meta.wd === 4) stats[emp].thuBd++;
          if (meta.wd === 6) stats[emp].satBd++;
          if (meta.isWEDay) {
            if (!weMapPerEmp[emp][meta.kw]) {
              weMapPerEmp[emp][meta.kw] = { hasD: false, hasHG: false };
            }
            weMapPerEmp[emp][meta.kw].hasD = true;
          }
        } else if (cell.duty === "HG") {
          stats[emp].hg++;
          if (meta.hol) stats[emp].holDuty++;
          if (meta.isWEDay) {
            if (!weMapPerEmp[emp][meta.kw]) {
              weMapPerEmp[emp][meta.kw] = { hasD: false, hasHG: false };
            }
            if (!weMapPerEmp[emp][meta.kw].hasD) {
              weMapPerEmp[emp][meta.kw].hasHG = true;
            }
          }
          const bdHolder = bdOwnerByDay[d];
          if (bdHolder && isAssistenzarzt(bdHolder)) {
            stats[emp].hgForAA++;
          } else {
            stats[emp].hgForFA++;
          }
        }
      });
    }
    
    mData.employees.forEach(emp => {
      Object.values(weMapPerEmp[emp] || {}).forEach(({hasD, hasHG}) => {
        if (hasD) {
          stats[emp].weDuty += 1; 
        } else if (hasHG) {
          stats[emp].weDuty += 0.5;
        }
      });
    });
  }
  return stats;
}

export async function collectHistoricalDutyStatsAsync(upToYear, upToMonth) {
  await sleep(0);
  return collectHistoricalDutyStats(upToYear, upToMonth);
}

export function hasVacationInWeek(y, m, emp, targetKW) {
  const dim = daysInMonth(y, m);
  for (let d = 1; d <= dim; d++) {
    if (isoWeekNumber(y, m, d) !== targetKW) continue;
    const cell = getCell(y, m, emp, d);
    if (cell.assignment && cell.assignment.split("/").map((x) => x.trim()).some((c) => VACATION_CODES.includes(c))) {
      return true;
    }
  }
  
  const nextM = m === 11 ? 0 : m + 1;
  const nextY = m === 11 ? y + 1 : y;
  const nk = monthKey(nextY, nextM);
  
  if (DATA[nk]) {
    const ndim = daysInMonth(nextY, nextM);
    for (let d = 1; d <= ndim; d++) {
      if (isoWeekNumber(nextY, nextM, d) !== targetKW) continue;
      const cell = DATA[nk].assignments?.[emp]?.[d];
      if (cell?.assignment && cell.assignment.split("/").map((x) => x.trim()).some((c) => VACATION_CODES.includes(c))) {
        return true;
      }
    }
  }
  return false;
}

export function isAbsentOnDay(y, m, emp, day, assignments) {
  const cell = assignments[emp]?.[day];
  if (!cell?.assignment) return false;
  return cell.assignment.split("/").map((x) => x.trim()).some((c) => ABSENCE_CODES.includes(c));
}

export function isVacationOnDay(y, m, emp, day, assignments) {
  const cell = assignments[emp]?.[day];
  if (!cell?.assignment) return false;
  return cell.assignment.split("/").map((x) => x.trim()).some((c) => VACATION_CODES.includes(c));
}

export function isNextDayVacation(y, m, emp, d, assignments) {
  const next = nextCalendarDay(y, m, d);
  if (next.y === y && next.m === m) {
    return isVacationOnDay(y, m, emp, next.d, assignments);
  }
  const nk = monthKey(next.y, next.m);
  if (DATA[nk]?.assignments?.[emp]?.[next.d]) {
    const cell = DATA[nk].assignments[emp][next.d];
    if (cell.assignment && cell.assignment.split("/").map((x) => x.trim()).some((c) => VACATION_CODES.includes(c))) {
      return true;
    }
  }
  return false;
}

function cellHasVacationLikeCode(cell) {
  if (!cell?.assignment) return false;
  return cell.assignment.split("/").map((x) => x.trim()).some((c) => VACATION_LIKE_CODES.includes(c));
}

// Wie isNextDayVacation, aber mit erweiterter "urlaubsähnlicher" Definition
// (zusätzlich FZA und WB). Wird als harte Sperre "kein Dienst am Tag vor
// Urlaub" für D und HG genutzt.
export function isNextDayVacationLike(y, m, emp, d, assignments) {
  const next = nextCalendarDay(y, m, d);
  if (next.y === y && next.m === m) {
    return cellHasVacationLikeCode(assignments[emp]?.[next.d]);
  }
  const nk = monthKey(next.y, next.m);
  return cellHasVacationLikeCode(DATA[nk]?.assignments?.[emp]?.[next.d]);
}

export function hasCTLeadershipConflict(y, m, emp, day, assignments) {
  const partner = getCtLeadershipPartner(emp);
  if (!partner) {
    return false;
  }

  const next = nextCalendarDay(y, m, day);
  const hols = getSaxonyHolidaysCached(next.y);

  if (!isWorkday(next.y, next.m, next.d, hols)) {
    return false;
  }

  let partnerCell;
  if (next.y === y && next.m === m) {
    partnerCell = assignments[partner]?.[next.d] || {};
  } else {
    const nk = monthKey(next.y, next.m);
    partnerCell = DATA[nk]?.assignments?.[partner]?.[next.d] || {};
  }

  if (partnerCell.assignment) {
    const codes = partnerCell.assignment.split("/").map((x) => x.trim());
    // Konflikt, wenn der Partner am Folge-Werktag abwesend ist ODER ebenfalls
    // ein "F" (Freizeitausgleich/Frei) hat – dann wäre niemand der CT-Leitung
    // anwesend.
    if (codes.some((c) => c === "F" || VACATION_CODES.includes(c) || ABSENCE_CODES.includes(c))) {
      return true;
    }
  }
  return false;
}

/**
 * Prüft die generelle CT-Leitungs-Invariante: an Werktagen muss immer
 * mindestens eine Person jedes Vertretungspaares anwesend sein. Liefert eine
 * Liste der Konflikttage (beide gleichzeitig Urlaub/abwesend/F), unabhängig
 * davon, ob der Konflikt aus einem automatischen F nach D stammt oder aus
 * manuell/importiert gesetzten Abwesenheiten.
 */
export function findCTLeadershipPresenceGaps(y, m, assignments) {
  const gaps = [];
  const dim = daysInMonth(y, m);
  const hols = getSaxonyHolidaysCached(y);

  const isOffOnDay = (emp, day) => {
    const cell = assignments[emp]?.[day];
    if (!cell?.assignment) return false;
    return cell.assignment
      .split("/")
      .map((x) => x.trim())
      .some((c) => c === "F" || ABSENCE_CODES.includes(c));
  };

  for (const pair of SPECIAL_RULES.ctLeadershipPairs) {
    const [a, b] = pair;
    for (let d = 1; d <= dim; d++) {
      if (!isWorkday(y, m, d, hols)) continue;
      if (isOffOnDay(a, d) && isOffOnDay(b, d)) {
        gaps.push({ day: d, a, b });
      }
    }
  }
  return gaps;
}

export function countWeekendDuties(y, m, emp, assignments) {
  const weMap = {};
  const dim = daysInMonth(y, m);
  
  for (let d = 1; d <= dim; d++) {
    const wd = weekday(y, m, d);
    if (wd !== 5 && wd !== 6 && wd !== 0) continue;
    
    const cell = assignments[emp]?.[d];
    if (!cell?.duty) continue;
    
    const kw = isoWeekNumber(y, m, d);
    if (!weMap[kw]) {
      weMap[kw] = { hasD: false, hasHG: false };
    }
    
    if (cell.duty === "D") {
      weMap[kw].hasD = true;
    } else if (cell.duty === "HG") {
      weMap[kw].hasHG = true;
    }
  }
  
  let count = 0;
  for (const { hasD, hasHG } of Object.values(weMap)) {
    if (hasD) {
      count += 1;
    } else if (hasHG) {
      count += 0.5;
    }
  }
  return count;
}

export function getWeekendDutyKWs(y, m, emp, assignments) {
  const dim = daysInMonth(y, m);
  const kws = new Set();
  
  for (let d = 1; d <= dim; d++) {
    const wd = weekday(y, m, d);
    const cell = assignments[emp]?.[d];
    if (!cell?.duty) continue;
    
    if (wd === 5 || wd === 6 || wd === 0) {
      kws.add(isoWeekNumber(y, m, d));
    }
  }

  // Previous month boundary scan
  const prev = prevCalendarDay(y, m, 1);
  const prevKey = monthKey(prev.y, prev.m);
  const prevData = DATA[prevKey];
  if (prevData?.assignments) {
    const prevDim = daysInMonth(prev.y, prev.m);
    for (let d = 1; d <= prevDim; d++) {
      const wd = weekday(prev.y, prev.m, d);
      const cell = prevData.assignments[emp]?.[d];
      if (cell?.duty && (wd === 5 || wd === 6 || wd === 0)) {
        kws.add(isoWeekNumber(prev.y, prev.m, d));
      }
    }
  }

  // Next month boundary scan
  const next = nextCalendarDay(y, m, dim);
  const nextKey = monthKey(next.y, next.m);
  const nextData = DATA[nextKey];
  if (nextData?.assignments) {
    const nextDim = daysInMonth(next.y, next.m);
    for (let d = 1; d <= nextDim; d++) {
      const wd = weekday(next.y, next.m, d);
      const cell = nextData.assignments[emp]?.[d];
      if (cell?.duty && (wd === 5 || wd === 6 || wd === 0)) {
        kws.add(isoWeekNumber(next.y, next.m, d));
      }
    }
  }

  return kws;
}

export function wouldCreateDFDF(emp, d, assignments) {
  const isD = (x) => assignments[emp]?.[x]?.duty === "D";
  const isF = (x) => assignments[emp]?.[x]?.assignment === "F";
  // Ein D auf Tag d bildet zusammen mit einem D zwei Tage entfernt das
  // fragmentierte Muster D-F-D-F, weil jeder D am Folgetag zwingend ein F
  // erzeugt. Symmetrisch in beide Richtungen geprüft:
  // Rückwärts: D(d-2) F(d-1) D(d) [F(d+1)]
  if (isD(d - 2) && isF(d - 1)) {
    return true;
  }
  // Vorwärts: D(d) [F(d+1)] D(d+2) F(d+3). Bei der Kandidatenbewertung ist der
  // eigene F(d+1) noch nicht gesetzt (!isD(d)); im Objective bereits.
  if (isD(d + 2) && (isF(d + 1) || !isD(d))) {
    return true;
  }
  return false;
}

export function getWeekendStateForKW(y, m, emp, assignments, kw) {
  const dim = daysInMonth(y, m);
  let hasD = false;
  let hasHG = false;
  
  for (let d = 1; d <= dim; d++) {
    const wd = weekday(y, m, d);
    if (wd !== 5 && wd !== 6 && wd !== 0) continue;
    if (isoWeekNumber(y, m, d) !== kw) continue;
    
    const duty = assignments[emp]?.[d]?.duty;
    if (duty === "D") {
      hasD = true;
    } else if (duty === "HG") {
      hasHG = true;
    }
  }
  return { hasD, hasHG };
}

export function projectedWeekendDutyCount(y, m, emp, assignments, dutyCode, d) {
  const current = countWeekendDuties(y, m, emp, assignments);
  const wd = weekday(y, m, d);
  
  if (wd !== 5 && wd !== 6 && wd !== 0) {
    return current;
  }
  
  const kw = isoWeekNumber(y, m, d);
  const { hasD, hasHG } = getWeekendStateForKW(y, m, emp, assignments, kw);
  
  if (dutyCode === "D") {
    if (hasD) return current;
    return current + (hasHG ? 0.5 : 1);
  }
  
  if (dutyCode === "HG") {
    if (hasD || hasHG) return current;
    return current + 0.5;
  }
  
  return current;
}

export function wouldCreateConsecutiveWeekendDuty(y, m, emp, assignments, d) {
  const wd = weekday(y, m, d);
  if (wd !== 5 && wd !== 6 && wd !== 0) {
    return false;
  }
  
  const candidateKw = isoWeekNumber(y, m, d);
  const kws = getWeekendDutyKWs(y, m, emp, assignments);
  
  if (!kws.has(candidateKw)) {
    kws.add(candidateKw);
  }
  
  const ordered = [...kws].sort((a, b) => a - b);
  for (let i = 1; i < ordered.length; i++) {
    const diff = Math.abs(ordered[i] - ordered[i - 1]);
    if (diff === 1 || diff === 51 || diff === 52) {
      return true;
    }
  }
  return false;
}

export function dutyKey(emp, day) {
  return `${emp}@@${day}`;
}

/**
 * Scans every cell of the given month for hard-rule violations that the
 * solver would normally prevent, but that manual editing can still produce
 * (direct cell edits, imports, or stale data after roster changes). Used to
 * drive inline warning highlights in the grid, independent of any Auto-Plan run.
 */
export function computeGridConflicts(y, m) {
  const md = getMonthData(y, m);
  const assignments = md.assignments || {};
  const emps = md.employees || [];
  const dim = daysInMonth(y, m);
  const conflicts = new Map();

  const flag = (emp, day, reason) => {
    const key = dutyKey(emp, day);
    if (!conflicts.has(key)) conflicts.set(key, []);
    conflicts.get(key).push(reason);
  };

  for (let d = 1; d <= dim; d++) {
    const dutyHolders = { D: [], HG: [] };

    for (const emp of emps) {
      const cell = assignments[emp]?.[d];
      if (!cell) continue;

      if (cell.duty === "D" || cell.duty === "HG") {
        dutyHolders[cell.duty].push(emp);
      }

      if (cell.duty && cell.assignment) {
        const codes = cell.assignment.split("/").map((x) => x.trim());
        if (codes.some((c) => VACATION_CODES.includes(c) || ABSENCE_CODES.includes(c))) {
          flag(emp, d, `${cell.duty}-Dienst kollidiert mit Abwesenheit (${cell.assignment}) am selben Tag`);
        }
      }

      if (cell.duty === "D") {
        const next = nextCalendarDay(y, m, d);
        let nextCell;
        if (next.y === y && next.m === m) {
          nextCell = assignments[emp]?.[next.d];
        } else {
          nextCell = DATA[monthKey(next.y, next.m)]?.assignments?.[emp]?.[next.d];
        }
        const nextOk = nextCell?.assignment === "F"
          || (nextCell?.assignment && nextCell.assignment.split("/").map((x) => x.trim()).some((c) => VACATION_CODES.includes(c) || ABSENCE_CODES.includes(c)));
        if (!nextOk) {
          flag(emp, d, "Bereitschaftsdienst (D) ohne Freistellung am Folgetag");
        }
      }

      if (cell.duty === "D" && hasCTLeadershipConflict(y, m, emp, d, assignments)) {
        flag(emp, d, "CT-Leitungskonflikt: Vertretung am Folgetag abwesend");
      }
    }

    for (const code of ["D", "HG"]) {
      if (dutyHolders[code].length > 1) {
        dutyHolders[code].forEach((emp) => {
          flag(emp, d, `Mehrfachbesetzung: ${dutyHolders[code].length}× ${code}-Dienst am selben Tag`);
        });
      }
    }
  }

  return conflicts;
}

export function buildRuleTelemetryBucket() { 
  return { counts: {}, events: [] }; 
}

export function trackRuleTelemetry(bucket, phase, label, detail, severity = "info") {
  if (!bucket || !label) return;
  bucket.counts[label] = (bucket.counts[label] || 0) + 1;
  bucket.events.push({ phase, label, detail, severity, count: bucket.counts[label] });
}

export function computeFairnessSpread(values) {
  if (!values.length) return 0;
  const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
  const sqDiffs = values.map(v => (v - avg) ** 2);
  const avgSqDiff = sqDiffs.reduce((sum, v) => sum + v, 0) / sqDiffs.length;
  return Math.sqrt(avgSqDiff);
}

export function averageFromArray(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

export function listDutyAssignments(emps, dim, assignments, dutyCode) {
  const items = [];
  for (let d = 1; d <= dim; d++) {
    for (const emp of emps) {
      if (assignments[emp]?.[d]?.duty === dutyCode) {
        items.push({ day: d, emp });
        break;
      }
    }
  }
  return items;
}

export function cleanupAssignmentCell(assignments, emp, day) {
  if (!assignments[emp]?.[day]) return;
  Object.keys(assignments[emp][day]).forEach((key) => {
    if (!assignments[emp][day][key]) {
      delete assignments[emp][day][key];
    }
  });
  if (!Object.keys(assignments[emp][day]).length) {
    delete assignments[emp][day];
  }
}

export async function computeAutoPlan(customTargets, weightProfileKey) {
  const { year: y, month: m } = state;
  if (!planMode || !planData) return null;

  const W = AUTO_PLAN_WEIGHT_PROFILES[weightProfileKey] || AUTO_PLAN_WEIGHT_PROFILES.standard;

  const hols = getSaxonyHolidaysCached(y);
  const dim = daysInMonth(y, m);
  const emps = [...planData.employees];
  const wishes = planData.wishes || {};
  const pins = planData.pins || {};
  const result = JSON.parse(JSON.stringify(planData.assignments));
  const externalAssignments = {};
  const log = [];
  const report = [];
  const fluxTraces = [];
  const fixedDutyKeys = new Set();
  const autoRestDays = new Set();
  const ruleTelemetry = buildRuleTelemetryBucket();
  const beckerSaturdayFzaWarnings = [];
  const weCountsCache = {};
  const bdEmpScoresCache = {};
  const hgEmpScoresCache = {};
  const staticFeasibleBD = {};
  const staticFeasibleHG = {};

  function trace(phase, msg) { 
    fluxTraces.push({ phase, msg }); 
  }
  
  function recordRule(phase, label, detail, severity = "info") { 
    trackRuleTelemetry(ruleTelemetry, phase, label, detail, severity); 
  }
  
  function isDayDTasked(d, assignments) { 
    const a = assignments || result;
    return emps.some(e => a[e]?.[d]?.duty === "D"); 
  }
  
  function isDayHGTasked(d, assignments) { 
    const a = assignments || result;
    return emps.some(e => a[e]?.[d]?.duty === "HG"); 
  }

  const pinnedEmptyKeys = new Set();

  function isPinned(emp, d) {
    return !!pins[emp]?.[d];
  }

  function isPinnedEmpty(emp, d) {
    return pinnedEmptyKeys.has(dutyKey(emp, d));
  }

  emps.forEach((emp) => {
    for (let d = 1; d <= dim; d++) {
      const duty = planData.assignments?.[emp]?.[d]?.duty;
      if (duty) {
        fixedDutyKeys.add(`${duty}:${dutyKey(emp, d)}`);
      } else if (isPinned(emp, d)) {
        pinnedEmptyKeys.add(dutyKey(emp, d));
      }
    }
  });

  log.push({ phase: "init", icon: "📊", msg: "Lade historische Daten und initialisiere Constraints...", pct: 5 });
  await sleep(10);
  
  const hist = collectHistoricalDutyStats(y, m);
  const dutyEmps = emps.filter((e) => !isDutyExempt(e));
  const hgFAs = dutyEmps.filter((e) => isFacharzt(e));

  const bdTarget = {};
  emps.forEach((e) => {
    if (customTargets && customTargets[e] !== undefined) {
      bdTarget[e] = customTargets[e];
    } else {
      if (isDutyExempt(e)) bdTarget[e] = 0;
      else {
        const reduced = getReducedBdTarget(e);
        bdTarget[e] = reduced !== undefined ? reduced : 4;
      }
    }
  });

  const easter = easterDate(y);
  const easterDays = new Set();
  const pfingstDays = new Set();
  
  [addDays(easter, -2), easter, addDays(easter, 1)].forEach((dt) => { 
    if (dt.getMonth() === m) easterDays.add(dt.getDate()); 
  });
  [addDays(easter, 49), addDays(easter, 50)].forEach((dt) => { 
    if (dt.getMonth() === m) pfingstDays.add(dt.getDate()); 
  });

  function hasOsterPfingstDutyInOtherMonth(emp, isEaster) {
    const targetDates = isEaster ? [addDays(easter, -2), easter, addDays(easter, 1)] : [addDays(easter, 49), addDays(easter, 50)];
    for (const dt of targetDates) {
      const tm = dt.getMonth(); 
      const td = dt.getDate();
      if (tm === m) continue;
      const mk = monthKey(y, tm);
      if (DATA[mk]?.assignments?.[emp]?.[td]?.duty) return true;
    }
    return false;
  }

  function workedEasterOrPfingsten(emp) {
    let easterWork = false;
    let pfingstWork = false;
    
    for (const d of easterDays) {
      if (result[emp]?.[d]?.duty) easterWork = true;
    }
    for (const d of pfingstDays) {
      if (result[emp]?.[d]?.duty) pfingstWork = true;
    }
    
    if (!easterWork) easterWork = hasOsterPfingstDutyInOtherMonth(emp, true);
    if (!pfingstWork) pfingstWork = hasOsterPfingstDutyInOtherMonth(emp, false);
    
    return { easterWork, pfingstWork };
  }

  function hasHolidayBlockConflict(emp, d) {
    if (easterDays.has(d)) return workedEasterOrPfingsten(emp).pfingstWork;
    if (pfingstDays.has(d)) return workedEasterOrPfingsten(emp).easterWork;
    return false;
  }

  emps.forEach((emp) => {
    staticFeasibleBD[emp] = new Array(dim + 1);
    staticFeasibleHG[emp] = new Array(dim + 1);
    for (let d = 1; d <= dim; d++) {
      const isAbsent = isAbsentOnDay(y, m, emp, d, planData.assignments);
      const isPinnedEmptyCell = isPinnedEmpty(emp, d);
      const wishesNoDuty = wishes[emp]?.[d] === "NO_DUTY";
      const holConflict = hasHolidayBlockConflict(emp, d);

      const bdExempt = isDutyExempt(emp) || bdTarget[emp] === 0;
      const bdRole = (weekday(y, m, d) === 6 && !isFacharzt(emp)) || isNoBdWeekday(emp, weekday(y, m, d));

      staticFeasibleBD[emp][d] = !(bdExempt || isAbsent || isPinnedEmptyCell || wishesNoDuty || bdRole || holConflict);

      const hgExempt = isDutyExempt(emp) || !isFacharzt(emp);

      staticFeasibleHG[emp][d] = !(hgExempt || isAbsent || isPinnedEmptyCell || wishesNoDuty || holConflict);
    }
  });

  // Punkt 19: Personen ohne hinterlegte Rolle (weder EMP_META noch Override)
  // werden vom Planer als AA behandelt. Das wird sichtbar gemacht, damit echte
  // FÄ nicht still aus HG-/Samstags-Vergaben fallen.
  const unknownRoleEmps = emps.filter((e) => !isDutyExempt(e) && !hasKnownRole(e));

  function getScheduledCell(targetY, targetM, emp, day, assignments) { 
    const a = assignments || result;
    if (targetY === y && targetM === m) {
      return a[emp]?.[day] || {};
    }
    const mk = monthKey(targetY, targetM);
    const stored = DATA[mk]?.assignments?.[emp]?.[day] || {};
    const queued = externalAssignments[mk]?.[emp]?.[day] || {};
    return { ...stored, ...queued };
  }

  function getScheduledDuty(targetY, targetM, emp, day, assignments) { 
    return getScheduledCell(targetY, targetM, emp, day, assignments).duty || null; 
  }
  
  function getScheduledAssignmentCodes(targetY, targetM, emp, day, assignments) {
    const assignment = getScheduledCell(targetY, targetM, emp, day, assignments).assignment || "";
    return assignment.split("/").map((code) => code.trim()).filter(Boolean);
  }

  function findNextWorkdayFrom(startY, startM, startD) {
    let cursor = nextCalendarDay(startY, startM, startD);
    let guard = 0;
    while (guard < 14) {
      const holsForCursor = getSaxonyHolidaysCached(cursor.y);
      if (isWorkday(cursor.y, cursor.m, cursor.d, holsForCursor)) {
        return cursor;
      }
      cursor = nextCalendarDay(cursor.y, cursor.m, cursor.d);
      guard++;
    }
    return null;
  }

  function hasOtherFAFreeOrVacationOn(targetY, targetM, day, excludedEmp, assignments) {
    return hgFAs.some((emp) => {
      if (emp === excludedEmp) return false;
      const codes = getScheduledAssignmentCodes(targetY, targetM, emp, day, assignments);
      return codes.some((code) => code === "F" || VACATION_CODES.includes(code));
    });
  }

  function queueExternalAssignment(targetY, targetM, emp, day, patch) {
    const mk = monthKey(targetY, targetM);
    if (!externalAssignments[mk]) {
      externalAssignments[mk] = {};
    }
    if (!externalAssignments[mk][emp]) {
      externalAssignments[mk][emp] = {};
    }
    const existingQueued = externalAssignments[mk][emp][day] || {};
    const existingStored = DATA[mk]?.assignments?.[emp]?.[day] || {};
    const merged = { ...existingQueued };
    
    for (const [key, value] of Object.entries(patch)) {
      if (!value) continue;
      if (!existingQueued[key] && !existingStored[key]) {
        merged[key] = value;
      }
    }
    
    if (Object.keys(merged).length) {
      externalAssignments[mk][emp][day] = merged;
    }
  }

  // Liefert den Dienstinhaber (D/HG) für einen Tag, der auch in einem anderen
  // (gespeicherten oder eingereihten) Monat liegen kann – nötig für die
  // monatsübergreifenden Kopplungsregeln (Punkt 10).
  function dutyHolderOn(targetY, targetM, day, dutyCode) {
    if (targetY === y && targetM === m) {
      return emps.find((e) => result[e]?.[day]?.duty === dutyCode) || null;
    }
    const mk = monthKey(targetY, targetM);
    const src = DATA[mk]?.assignments || {};
    const ext = externalAssignments[mk] || {};
    const names = new Set([...Object.keys(src), ...Object.keys(ext)]);
    for (const e of names) {
      const duty = ext[e]?.[day]?.duty || src[e]?.[day]?.duty;
      if (duty === dutyCode) return e;
    }
    return null;
  }

  // Set der bereits behandelten Becker-Samstags-D-Tage (verhindert doppelte
  // FZA-Einträge/Warnungen, wenn die Kompensation mehrfach geprüft wird).
  const beckerFzaHandledDays = new Set();

  // Punkt 5: Trägt für eine Person mit Ultima-Ratio-Samstags-D zwingend einen
  // FZA-Tag am nächsten regulären Werktag ein – wiederverwendbar für Erst-
  // vergabe UND für nach Optimierungs-Swaps neu entstandene Samstags-D.
  function applyMandatorySaturdayFza(emp, d, phaseKey, pct) {
    if (!needsSaturdayFza(emp)) return "";
    if (weekday(y, m, d) !== 6) return "";
    if (beckerFzaHandledDays.has(d)) return "";
    beckerFzaHandledDays.add(d);

    const nextWorkday = findNextWorkdayFrom(y, m, d);
    if (!nextWorkday) return "";

    const blockedByOtherFA = hasOtherFAFreeOrVacationOn(nextWorkday.y, nextWorkday.m, nextWorkday.d, emp, result);
    const existingCodes = getScheduledAssignmentCodes(nextWorkday.y, nextWorkday.m, emp, nextWorkday.d, result);
    const alreadyHasFza = existingCodes.includes("FZA");
    const alreadyOccupied = existingCodes.length > 0 && !alreadyHasFza;

    if (alreadyHasFza) {
      return ` FZA am ${nextWorkday.d}. ${MONTHS_SHORT[nextWorkday.m]} bereits vorhanden.`;
    }

    if (!blockedByOtherFA && !alreadyOccupied) {
      if (nextWorkday.y === y && nextWorkday.m === m) {
        if (!result[emp]) result[emp] = {};
        if (!result[emp][nextWorkday.d]) result[emp][nextWorkday.d] = {};
        result[emp][nextWorkday.d].assignment = "FZA";
      } else {
        queueExternalAssignment(nextWorkday.y, nextWorkday.m, emp, nextWorkday.d, { assignment: "FZA" });
      }
      log.push({ phase: phaseKey, icon: "🟣", msg: `${emp} erhält FZA am ${nextWorkday.d}. ${MONTHS_SHORT[nextWorkday.m]}.`, dayIdx: nextWorkday.d, newEmpId: emp, pct });
      recordRule(phaseKey, "Becker-FZA-Kompensation", `Ausgleich nach Samstags-BD am ${nextWorkday.d}. ${MONTHS_SHORT[nextWorkday.m]}.`, "accent");
      return ` Samstags-Dienst unvermeidbar -> FZA am nächsten Werktag (${nextWorkday.d}. ${MONTHS_SHORT[nextWorkday.m]}) eingetragen.`;
    }

    const warnMsg = blockedByOtherFA
      ? `KRITISCH: ${emp} hat am ${d}. einen Samstags-BD, aber der nächste Werktag ${nextWorkday.d}. ${MONTHS_SHORT[nextWorkday.m]} ist blockiert, weil dort bereits ein anderer FA Urlaub/F hat. FZA bitte manuell prüfen.`
      : `KRITISCH: ${emp} hat am ${d}. einen Samstags-BD, aber am nächsten Werktag ${nextWorkday.d}. ${MONTHS_SHORT[nextWorkday.m]} besteht bereits eine Belegung (${existingCodes.join("/")}). FZA bitte manuell prüfen.`;
    beckerSaturdayFzaWarnings.push(warnMsg);
    log.push({ phase: phaseKey, icon: "🚨", msg: warnMsg, dayIdx: d, newEmpId: emp, pct });
    recordRule(phaseKey, "Kritische Becker-Prüfung", warnMsg, "critical");
    return " FZA konnte nicht automatisch gesetzt werden; sichtbare Warnung erzeugt.";
  }

  let repairedF = 0;
  for (const emp of emps) {
    if (!result[emp]) continue;
    for (let d = 1; d <= dim; d++) {
      if (result[emp][d]?.duty !== "D") continue;
      const next = nextCalendarDay(y, m, d);
      if (next.y === y && next.m === m) {
        if (!result[emp]) result[emp] = {};
        if (!result[emp][next.d]) result[emp][next.d] = {};
        if (!result[emp][next.d].assignment) {
          result[emp][next.d].assignment = "F";
          autoRestDays.add(dutyKey(emp, next.d));
          repairedF++;
        }
      }
    }
  }
  
  if (repairedF > 0) {
    log.push({ phase: "init", icon: "🔧", msg: `${repairedF} fehlende Ruhetage nach gesetzten BD ergänzt`, pct: 10 });
  }

  const currentBD = {};
  const currentHG = {};
  const currentHGForAA = {};
  const currentHGForFA = {};
  const currentSatBD = {};
  
  emps.forEach((e) => { 
    currentBD[e] = 0; 
    currentHG[e] = 0; 
    currentHGForAA[e] = 0; 
    currentHGForFA[e] = 0; 
    currentSatBD[e] = 0; 
  });
  
  for (let d = 1; d <= dim; d++) {
    for (const e of emps) {
      if (!result[e]?.[d]) continue;
      const wd = weekday(y, m, d);
      
      if (result[e][d].duty === "D") { 
        currentBD[e]++; 
        if (wd === 6) currentSatBD[e]++; 
      }
      
      if (result[e][d].duty === "HG") {
        currentHG[e]++;
        const bdHolder = emps.find((e2) => e2 !== e && result[e2]?.[d]?.duty === "D");
        if (bdHolder && isAssistenzarzt(bdHolder)) {
          currentHGForAA[e]++;
        } else {
          currentHGForFA[e]++;
        }
      }
    }
  }

  const bdNeeded = [];
  const hgNeeded = [];
  for (let d = 1; d <= dim; d++) {
    if (!emps.some((e) => result[e]?.[d]?.duty === "D")) bdNeeded.push(d);
    if (!emps.some((e) => result[e]?.[d]?.duty === "HG")) hgNeeded.push(d);
  }



  function hasAdjacentHG(emp, d, assignments) {
    const a = assignments || result;
    const prev = prevCalendarDay(y, m, d);
    const next = nextCalendarDay(y, m, d);
    return (getScheduledDuty(prev.y, prev.m, emp, prev.d, a) === "HG" || getScheduledDuty(next.y, next.m, emp, next.d, a) === "HG");
  }

  function updateAutoF(emp, day) {
    const next = nextCalendarDay(y, m, day);
    if (next.y === y && next.m === m) {
      if (!result[emp]) result[emp] = {};
      if (!result[emp][next.d]) result[emp][next.d] = {};
      if (!result[emp][next.d].assignment) { 
        result[emp][next.d].assignment = "F"; 
        autoRestDays.add(dutyKey(emp, next.d)); 
      }
      return;
    }
    queueExternalAssignment(next.y, next.m, emp, next.d, { assignment: "F" });
  }

  function clearAutoF(emp, day) {
    const next = nextCalendarDay(y, m, day);
    if (next.y !== y || next.m !== m) return;
    
    const key = dutyKey(emp, next.d);
    if (!autoRestDays.has(key)) return;
    
    if (result[emp]?.[next.d]?.assignment === "F") {
      delete result[emp][next.d].assignment;
    }
    cleanupAssignmentCell(result, emp, next.d);
    autoRestDays.delete(key);
  }

  function minDistanceForDuty(emp, d, dutyCode, assignments) {
    const a = assignments || result;
    let minDist = Infinity;
    for (let i = 1; i <= dim; i++) {
      if (i === d) continue;
      if (a[emp]?.[i]?.duty === dutyCode) {
        minDist = Math.min(minDist, Math.abs(i - d));
      }
    }
    return minDist;
  }

  function canDoBD(emp, d, relaxed, assignments, options) {
    if (staticFeasibleBD[emp] && !staticFeasibleBD[emp][d]) return false;
    relaxed = relaxed || false;
    assignments = assignments || result;
    options = options || {};
    const { ignoreExistingDuty = false, coverageEscalation = false } = options;

    if (isDutyExempt(emp) || bdTarget[emp] === 0) return false;
    if (isAbsentOnDay(y, m, emp, d, assignments)) return false;
    if (isPinnedEmpty(emp, d)) return false;

    const existingDuty = assignments[emp]?.[d]?.duty;
    if (existingDuty && !(ignoreExistingDuty && existingDuty === "D")) return false;

    if (wishes[emp]?.[d] === "NO_DUTY") return false;

    const wd = weekday(y, m, d);
    if (wd === 6 && !isFacharzt(emp)) return false;
    if (isNoBdWeekday(emp, wd)) return false;
    if (hasCTLeadershipConflict(y, m, emp, d, assignments)) return false;
    if (assignments[emp]?.[d]?.assignment === "F") return false;
    if (isNextDayVacationLike(y, m, emp, d, assignments, externalAssignments)) return false;

    const prev = prevCalendarDay(y, m, d);
    const next = nextCalendarDay(y, m, d);

    if (getScheduledDuty(prev.y, prev.m, emp, prev.d, assignments) === "D") return false;
    if (getScheduledDuty(next.y, next.m, emp, next.d, assignments) === "D") return false;
    if (getScheduledDuty(prev.y, prev.m, emp, prev.d, assignments) === "HG" && weekday(prev.y, prev.m, prev.d) !== 5) return false;
    if (hasHolidayBlockConflict(emp, d)) return false;

    // Aufeinanderfolgende Wochenenden mit Dienst sind hart verboten – auch in
    // den Optimierungs-Swaps (relaxed). Nur die echte Coverage-Eskalation darf
    // diese Regel als letzte Lösung lockern.
    if (!coverageEscalation && wouldCreateConsecutiveWeekendDuty(y, m, emp, assignments, d)) return false;

    if (!relaxed) {
      if (currentBD[emp] >= bdTarget[emp]) return false;
      const projectedWe = projectedWeekendDutyCount(y, m, emp, assignments, "D", d);
      if (projectedWe > RELAXED_WEEKEND_DUTY_LIMIT) return false;
      if (isSaturdayUltimaRatio(emp) && wd === 6) return false;
      const minDistD = minDistanceForDuty(emp, d, "D", assignments);
      if (minDistD < 3) return false;
    }
    return true;
  }
  function hasVacationInFollowingWeek(emp, d) {
    const start = addDays(new Date(y, m, d), 4); // Next Monday
    for (let i = 0; i < 7; i++) {
      const dt = addDays(start, i);
      const cell = getCell(dt.getFullYear(), dt.getMonth(), emp, dt.getDate());
      if (cell.assignment && cell.assignment.split("/").map((x) => x.trim()).some((c) => VACATION_CODES.includes(c))) {
        return true;
      }
    }
    return false;
  }

  function scoreBDCandidate(emp, d, relaxed, phaseKey) {
    relaxed = relaxed || false;
    if (!canDoBD(emp, d, relaxed, result, { coverageEscalation: relaxed })) {
      return { score: -Infinity, histScore: 0, tags: [] };
    }

    let score = 100;
    // Historien-Beitrag wird getrennt geführt und nur als Tie-Breaker bei
    // gleichwertigen Kandidaten des aktuellen Monats verwendet (Punkt 16).
    let histScore = 0;
    const wd = weekday(y, m, d);
    const isWE = wd === 5 || wd === 6 || wd === 0;
    const tags = [];
    const projectedWe = projectedWeekendDutyCount(y, m, emp, result, "D", d);
    const minDistD = minDistanceForDuty(emp, d, "D", result);

    if (currentBD[emp] >= bdTarget[emp]) {
      score -= 50000 * (currentBD[emp] - bdTarget[emp] + 1);
      tags.push("Soll überschritten");

      // Überhang-Präferenz: Ist eine faire Verteilung erreicht (alle am Ziel)
      // und MUSS dennoch jemand einen Dienst über dem Ziel übernehmen, so
      // erhält Dr. Lurz den ERSTEN solchen Dienst (den fünften), sofern keine
      // BD-Wünsche anderer Personen für genau diesen Tag etwas anderes
      // festlegen. Der Bonus greift nur exakt beim Schritt Ziel -> Ziel+1
      // (diff === 0), nicht für weitere Überhang-Dienste, und ist klein genug,
      // um unter-Ziel-Kandidaten niemals zu verdrängen.
      const surplusRank = getSurplusBdPreferenceRank(emp);
      const diffOverTarget = currentBD[emp] - bdTarget[emp];
      if (surplusRank >= 0 && diffOverTarget === 0) {
        const someoneElseWishesBD = dutyEmps.some(
          (e2) => e2 !== emp && wishes[e2]?.[d] === "BD_WISH"
        );
        if (!someoneElseWishesBD) {
          score += 8000 - surplusRank * 500;
          tags.push("Überhang-Präferenz (5. Dienst)");
        }
      }
    } else {
      score += (bdTarget[emp] - currentBD[emp]) * 5000;
      tags.push("Zielerfüllung");
    }

    if (wishes[emp]?.[d] === "BD_WISH") {
      score += 220 * W.wish;
      tags.push("Wunsch");
    }

    if (wd === 4) {
      const nextKW = isoWeekNumber(y, m, d) + 1;
      if (hasVacationInWeek(y, m, emp, nextKW)) {
        score += 4000;
        tags.push("Vor Urlaub");
      }
    }

    if (isWE) {
      score -= Math.abs(projectedWe - TARGET_WEEKEND_DUTY) * 220 * W.fairness;
      if (projectedWe > RELAXED_WEEKEND_DUTY_LIMIT) {
        score -= (projectedWe - RELAXED_WEEKEND_DUTY_LIMIT) * 1000 * W.fairness;
      }
      if (wouldCreateConsecutiveWeekendDuty(y, m, emp, result, d)) {
        score -= 1500;
        tags.push("WE-Puffer");
      }
      if (getWeekendDutyKWs(y, m, emp, result).has(isoWeekNumber(y, m, d) - 1)) {
        score -= 100;
        tags.push("WE-Abstand");
      }
      const histWeDuty = hist[emp]?.weDuty || 0;
      const avgHistWe = averageFromArray(dutyEmps.map(e => hist[e]?.weDuty || 0));
      histScore -= (histWeDuty - avgHistWe) * 5;
    }

    if (wd === 6 && isFacharzt(emp)) {
      const projectedSat = currentSatBD[emp] + 1;
      if (projectedSat > 1) {
        score -= 25000 * projectedSat;
        tags.push("Doppel-Samstag");
      } else if (currentSatBD[emp] === 0) {
        score += 5000;
        tags.push("Samstags-Priorität");
      }
      const avgProjectedSat = (hgFAs.reduce((s, e) => s + currentSatBD[e], 0) + 1) / Math.max(1, hgFAs.length);
      score -= Math.abs(projectedSat - avgProjectedSat) * 1500 * W.fairness;
      const histSatBD = hist[emp]?.satBd || 0;
      const avgHistSat = averageFromArray(hgFAs.map(e => hist[e]?.satBd || 0));
      histScore -= (histSatBD - avgHistSat) * 5;
    }

    if (isSaturdayUltimaRatio(emp) && wd === 6 && relaxed) {
      score -= 5000;
      tags.push("Notlösung");
    }

    if (minDistD < 4) {
      score -= (4 - minDistD) * 250;
    }

    if (wouldCreateDFDF(emp, d, result)) {
      score -= 500;
      tags.push("D-F-D-F weich vermieden");
    }

    if (isHoliday(y, m, d, hols)) {
      const holAvg = dutyEmps.reduce((s, e) => s + (hist[e]?.holDuty || 0), 0) / Math.max(1, dutyEmps.length);
      histScore += (holAvg - (hist[emp]?.holDuty || 0)) * 6;
      tags.push("Feiertag");
    }

    score += ((emp.charCodeAt(0) * 31 + d * 7) % 10) * 0.1;
    trace(phaseKey || "bd_eval", `EVAL [${emp}|D${d}] Base:100 Final:${Math.round(score)} Hist:${Math.round(histScore)} Tags:[${tags.join(',')}]`);
    return { score, histScore, tags };
  }

  bdNeeded.sort((a, b) => {
    const aWe = isWeekend(y, m, a) || isHoliday(y, m, a, hols) || weekday(y, m, a) === 5;
    const bWe = isWeekend(y, m, b) || isHoliday(y, m, b, hols) || weekday(y, m, b) === 5;
    if (aWe !== bWe) return aWe ? -1 : 1;
    return a - b;
  });

  const weBDs = bdNeeded.filter((d) => { 
    const wd = weekday(y, m, d); 
    return wd === 5 || wd === 6 || wd === 0 || isHoliday(y, m, d, hols); 
  });
  const nonWeBDs = bdNeeded.filter((d) => !weBDs.includes(d));

  log.push({ phase: "bd_weekend", icon: "🌙", msg: `Verteile ${weBDs.length} WE/FT-BD...`, pct: 22 });
  
  let bdRelaxedCount = 0;
  let hgRelaxedCount = 0;

  for (let i = 0; i < weBDs.length; i++) {
    const d = weBDs[i];
    if (isDayDTasked(d)) continue;
    
    let candidates = dutyEmps.map((e) => ({ emp: e, ...scoreBDCandidate(e, d, false, "bd_weekend") })).filter((c) => c.score > -Infinity).sort((a, b) => b.score - a.score || b.histScore - a.histScore);
    let relaxed = false;
    
    if (candidates.length === 0) {
      candidates = dutyEmps.map((e) => ({ emp: e, ...scoreBDCandidate(e, d, true, "bd_weekend") })).filter((c) => c.score > -Infinity).sort((a, b) => b.score - a.score || b.histScore - a.histScore);
      if (candidates.length > 0) { 
        bdRelaxedCount++; 
        relaxed = true; 
        candidates[0].tags.push("Regeln gelockert"); 
        recordRule("bd_weekend", "BD-Constraint gelockert", `Tag ${d}: Keine harte BD-Lösung.`, "warn"); 
        log.push({ phase: "bd_weekend", icon: "⚠", msg: `BD-Regeln gelockert für Tag ${d}`, dayIdx: d, newEmpId: candidates[0].emp, pct: 22 });
      }
    }
    
    if (candidates.length > 0) {
      const chosen = candidates[0];
      if (!result[chosen.emp]) result[chosen.emp] = {};
      if (!result[chosen.emp][d]) result[chosen.emp][d] = {};
      
      result[chosen.emp][d].duty = "D";
      currentBD[chosen.emp]++;
      
      if (weekday(y, m, d) === 6) {
        currentSatBD[chosen.emp]++;
      }
      
      updateAutoF(chosen.emp, d);
      
      let reason = `Bester Score (${Math.round(chosen.score)}).`;
      if (chosen.tags.includes("Wunsch")) reason = "Wunschdienst berücksichtigt.";
      if (chosen.tags.includes("Vor Urlaub")) reason = "Donnerstags-Dienst vor Urlaub priorisiert.";
      if (chosen.tags.includes("Samstags-Priorität")) reason += " Person hatte noch keinen Samstag im Monat.";
      if (chosen.tags.includes("D-F-D-F weich vermieden")) reason += " D-F-D-F wurde nur weich bestraft.";
      if (relaxed) reason += " Auswahl im gelockerten Modus.";
      
      reason += applyMandatorySaturdayFza(chosen.emp, d, "bd_weekend", Math.min(40, 22 + 2));

      report.push({ day: d, emp: chosen.emp, duty: "D", reason: reason, tags: chosen.tags, alternatives: candidates.slice(1, 4).map((c) => ({ emp: c.emp, score: Math.round(c.score), tags: c.tags })) });
      log.push({ phase: "bd_weekend", icon: "→", msg: `Tag ${d}. → ${chosen.emp}`, dayIdx: d, newEmpId: chosen.emp, pct: 22 + Math.round((i / Math.max(1, weBDs.length)) * 18) });
    }
  }

  log.push({ phase: "bd_workday", icon: "☀️", msg: `Verteile ${nonWeBDs.length} Werktags-BD...`, pct: 42 });
  
  for (let i = 0; i < nonWeBDs.length; i++) {
    const d = nonWeBDs[i];
    if (isDayDTasked(d)) continue;
    
    let candidates = dutyEmps.map((e) => ({ emp: e, ...scoreBDCandidate(e, d, false, "bd_workday") })).filter((c) => c.score > -Infinity).sort((a, b) => b.score - a.score || b.histScore - a.histScore);
    let relaxed = false;
    
    if (candidates.length === 0) {
      candidates = dutyEmps.map((e) => ({ emp: e, ...scoreBDCandidate(e, d, true, "bd_workday") })).filter((c) => c.score > -Infinity).sort((a, b) => b.score - a.score || b.histScore - a.histScore);
      if (candidates.length > 0) { 
        bdRelaxedCount++; 
        relaxed = true; 
        candidates[0].tags.push("Regeln gelockert");
        log.push({ phase: "bd_workday", icon: "⚠", msg: `BD-Regeln gelockert für Tag ${d}`, dayIdx: d, newEmpId: candidates[0].emp, pct: 42 });
      }
    }
    
    if (candidates.length > 0) {
      const chosen = candidates[0];
      if (!result[chosen.emp]) result[chosen.emp] = {};
      if (!result[chosen.emp][d]) result[chosen.emp][d] = {};
      
      result[chosen.emp][d].duty = "D";
      currentBD[chosen.emp]++;
      updateAutoF(chosen.emp, d);
      
      report.push({ day: d, emp: chosen.emp, duty: "D", reason: `Bester Score (${Math.round(chosen.score)}).`, tags: chosen.tags, alternatives: candidates.slice(1, 4).map((c) => ({ emp: c.emp, score: Math.round(c.score), tags: c.tags })) });
      log.push({ phase: "bd_workday", icon: "→", msg: `Tag ${d}. → ${chosen.emp}`, dayIdx: d, newEmpId: chosen.emp, pct: 42 + Math.round((i / Math.max(1, nonWeBDs.length)) * 18) });
    }
  }

  function rebuildCurrentCounters() {
    emps.forEach((e) => { 
      currentBD[e] = 0; 
      currentHG[e] = 0; 
      currentHGForAA[e] = 0; 
      currentHGForFA[e] = 0; 
      currentSatBD[e] = 0; 
    });
    
    for (let day = 1; day <= dim; day++) {
      const bdHolder = emps.find((e) => result[e]?.[day]?.duty === "D") || null;
      for (const e of emps) {
        const duty = result[e]?.[day]?.duty;
        if (duty === "D") { 
          currentBD[e]++; 
          if (weekday(y, m, day) === 6) {
            currentSatBD[e]++; 
          }
        }
        else if (duty === "HG") {
          currentHG[e]++;
          if (bdHolder && isAssistenzarzt(bdHolder)) {
            currentHGForAA[e]++;
          } else {
            currentHGForFA[e]++;
          }
        }
      }
    }
  }

  function updateHgCountersForDay(day, oldBdHolder, newBdHolder) {
    const hgHolder = emps.find(e => result[e]?.[day]?.duty === "HG");
    if (!hgHolder) return;
    
    // Remove effect of oldBdHolder
    if (oldBdHolder) {
      if (isAssistenzarzt(oldBdHolder)) {
        currentHGForAA[hgHolder]--;
      } else {
        currentHGForFA[hgHolder]--;
      }
    }
    // Add effect of newBdHolder
    if (newBdHolder) {
      if (isAssistenzarzt(newBdHolder)) {
        currentHGForAA[hgHolder]++;
      } else {
        currentHGForFA[hgHolder]++;
      }
    }
  }

  function computeBDEmpScore(emp) {
    let score = 0;
    const diff = currentBD[emp] - bdTarget[emp];
    score += (diff * diff * 25000 + Math.abs(diff) * 10000) * W.fairness;

    const surplusRank = getSurplusBdPreferenceRank(emp);
    if (surplusRank >= 0 && diff === 1) {
      score -= 8000 - surplusRank * 500;
    }

    const weCountEmp = weCountsCache[emp] || 0;
    const weDiff = weCountEmp - TARGET_WEEKEND_DUTY;
    score += weDiff * weDiff * 10000 * W.fairness;

    const weekendKws = [...getWeekendDutyKWs(y, m, emp, result)].sort((a, b) => a - b);
    for (let i = 1; i < weekendKws.length; i++) {
      const diffVal = Math.abs(weekendKws[i] - weekendKws[i - 1]);
      if (diffVal === 1 || diffVal === 51 || diffVal === 52) {
        score += 15000;
      }
    }

    if (isFacharzt(emp)) {
      if (currentSatBD[emp] > 1) {
        score += 80000 * currentSatBD[emp];
      }
    }

    for (let day = 1; day <= dim; day++) {
      if (result[emp]?.[day]?.duty !== "D") continue;

      if (wishes[emp]?.[day] === "BD_WISH") {
        score -= 600 * W.wish;
      }

      const nxt = nextCalendarDay(y, m, day);
      if (getScheduledDuty(nxt.y, nxt.m, emp, nxt.d, result) === "D") {
        score += 100000;
      }

      const minDistD = minDistanceForDuty(emp, day, "D", result);
      if (minDistD < 3) {
        score += (3 - minDistD) * 15000;
      }
      if (minDistD < 5) {
        score += (5 - minDistD) * 800;
      }

      if (wouldCreateDFDF(emp, day, result)) {
        score += 1200;
      }

      const wdObj = weekday(y, m, day);
      if (wdObj === 6 && isSaturdayUltimaRatio(emp)) {
        score += 40000;
      }

      if (wdObj === 4 && hasVacationInFollowingWeek(emp, day)) {
        score -= 3000;
      }
    }
    return score;
  }

  function computeHGEmpScore(emp) {
    if (!isFacharzt(emp)) return 0;
    let score = 0;
    for (let day = 1; day <= dim; day++) {
      if (result[emp]?.[day]?.duty !== "HG") continue;

      if (wishes[emp]?.[day] === "HG_WISH") {
        score -= 900 * W.wish;
      }

      const wd = weekday(y, m, day);
      const conflictBd = getHgConflictBd(emp, wd);
      if (conflictBd) {
        const bdHolder = emps.find(e => result[e]?.[day]?.duty === "D");
        if (bdHolder && conflictBd.includes(bdHolder)) {
          score += 100000;
        }
      }

      const isBundled = bundledHGKeys.has(dutyKey(emp, day));
      if (hasAdjacentHG(emp, day, result)) {
        score += isBundled ? 5000 : 45000;
      }

      const minDistHG = minDistanceForDuty(emp, day, "HG", result);
      if (minDistHG < 3 && !isBundled) {
        score += (3 - minDistHG) * 18000;
      }
      if (minDistHG < 5 && !isBundled) {
        score += (5 - minDistHG) * 2500;
      }

      if (!isBundled) {
        let density = 0;
        for (let j = Math.max(1, day - 3); j <= Math.min(dim, day + 3); j++) {
          if (j !== day && result[emp]?.[j]?.duty === "HG") density++;
        }
        if (density >= 1) score += density * 12000;
      }

      const nxtObj = nextCalendarDay(y, m, day);
      if (getScheduledDuty(nxtObj.y, nxtObj.m, emp, nxtObj.d, result) === "D" && wd !== 5) {
        score += 60000;
      }
    }
    return score;
  }

  function updateHgScoreForDay(day) {
    const hgHolder = hgFAs.find(e => result[e]?.[day]?.duty === "HG");
    if (hgHolder && hgEmpScoresCache[hgHolder] !== undefined) {
      hgEmpScoresCache[hgHolder] = computeHGEmpScore(hgHolder);
    }
  }

  function initWeCountsCache() {
    dutyEmps.forEach(e => {
      weCountsCache[e] = countWeekendDuties(y, m, e, result);
    });
  }

  function initBDEmpScoresCache() {
    dutyEmps.forEach(e => {
      bdEmpScoresCache[e] = computeBDEmpScore(e);
    });
  }

  function initHgEmpScoresCache() {
    hgFAs.forEach(e => {
      hgEmpScoresCache[e] = computeHGEmpScore(e);
    });
  }

  function setDutyAssignment(emp, day, dutyCode) {
    if (!result[emp]) result[emp] = {};
    if (!result[emp][day]) result[emp][day] = {};
    result[emp][day].duty = dutyCode;
    
    // Incremental counter updates
    if (dutyCode === "D") {
      const oldBdHolder = null;
      currentBD[emp]++;
      if (weekday(y, m, day) === 6) {
        currentSatBD[emp]++;
      }
      updateHgCountersForDay(day, oldBdHolder, emp);
      updateAutoF(emp, day);
    } else if (dutyCode === "HG") {
      currentHG[emp]++;
      const bdHolder = emps.find((e2) => result[e2]?.[day]?.duty === "D");
      if (bdHolder && isAssistenzarzt(bdHolder)) {
        currentHGForAA[emp]++;
      } else {
        currentHGForFA[emp]++;
      }
    }

    // Update caches if they are initialized
    if (weCountsCache[emp] !== undefined) {
      if (dutyEmps.includes(emp)) {
        weCountsCache[emp] = countWeekendDuties(y, m, emp, result);
        bdEmpScoresCache[emp] = computeBDEmpScore(emp);
      }
      if (isFacharzt(emp)) {
        hgEmpScoresCache[emp] = computeHGEmpScore(emp);
      }
      if (dutyCode === "D") {
        updateHgScoreForDay(day);
      }
    }
  }

  function clearDutyAssignment(emp, day, dutyCode) {
    if (dutyCode === "D") {
      clearAutoF(emp, day);
      currentBD[emp]--;
      if (weekday(y, m, day) === 6) {
        currentSatBD[emp]--;
      }
      updateHgCountersForDay(day, emp, null);
    } else if (dutyCode === "HG") {
      currentHG[emp]--;
      const bdHolder = emps.find((e2) => result[e2]?.[day]?.duty === "D");
      if (bdHolder && isAssistenzarzt(bdHolder)) {
        currentHGForAA[emp]--;
      } else {
        currentHGForFA[emp]--;
      }
    }
    if (result[emp]?.[day]?.duty === dutyCode) {
      delete result[emp][day].duty;
    }
    cleanupAssignmentCell(result, emp, day);

    // Update caches if they are initialized
    if (weCountsCache[emp] !== undefined) {
      if (dutyEmps.includes(emp)) {
        weCountsCache[emp] = countWeekendDuties(y, m, emp, result);
        bdEmpScoresCache[emp] = computeBDEmpScore(emp);
      }
      if (isFacharzt(emp)) {
        hgEmpScoresCache[emp] = computeHGEmpScore(emp);
      }
      if (dutyCode === "D") {
        updateHgScoreForDay(day);
      }
    }
  }

  function computeBDObjective() {
    let score = 0;
    for (let day = 1; day <= dim; day++) {
      let dCount = 0; 
      emps.forEach(e => { 
        if(result[e]?.[day]?.duty === "D") dCount++; 
      });
      if (dCount === 0) score += 20000; 
      if (dCount > 1) score += 50000 * dCount;
    }
    
    // Sum of cached individual employee scores
    dutyEmps.forEach(e => {
      score += bdEmpScoresCache[e] || 0;
    });

    const satAvg = hgFAs.length > 0 ? hgFAs.reduce((sum, e) => sum + currentSatBD[e], 0) / hgFAs.length : 0;
    let weSum = 0;
    dutyEmps.forEach((e) => {
      weSum += weCountsCache[e] || 0;
    });
    const weAvg = dutyEmps.length > 0 ? weSum / dutyEmps.length : 0;
    let deficitSum = 0;
    let surplusSum = 0;

    dutyEmps.forEach((emp) => {
      const diff = currentBD[emp] - bdTarget[emp];
      if (diff < 0) deficitSum += -diff;
      if (diff > 0) surplusSum += diff;

      const weCountEmp = weCountsCache[emp] || 0;
      const weSpreadDiff = weCountEmp - weAvg;
      score += weSpreadDiff * weSpreadDiff * 9000 * W.fairness;

      if (weCountEmp > RELAXED_WEEKEND_DUTY_LIMIT) {
        score += (weCountEmp - RELAXED_WEEKEND_DUTY_LIMIT) * 30000 * W.fairness;
      }

      if (isFacharzt(emp)) {
        score += (currentSatBD[emp] - satAvg) * (currentSatBD[emp] - satAvg) * 12000 * W.fairness;
      }
    });
    
    score += deficitSum * 15000 + surplusSum * 12000 + Math.abs(deficitSum - surplusSum) * 10000;
    return score;
  }

  let bundledHGDays = new Set();
  let bundledHGKeys = new Set();
  let swaps = 0;
  let hgMoves = 0;
  let deepMoves = 0;

  const MAX_OPTIMIZATION_CYCLES = 8;
  const BD_MAX_PASSES = 20;
  const HG_MAX_PASSES = 30;
  const DEEP_MAX_PASSES = 40;

  function assignBundledHG(emp, d, bindReason, options) {
    options = options || {};
    if (isDayHGTasked(d) || !isFacharzt(emp) || isDutyExempt(emp) || wishes[emp]?.[d] === "NO_DUTY" || isAbsentOnDay(y, m, emp, d, result) || result[emp]?.[d]?.duty || hasHolidayBlockConflict(emp, d) || isPinnedEmpty(emp, d)) {
      return false;
    }
    const wd = weekday(y, m, d);
    if (result[emp]?.[d]?.assignment === "F" && !(wd === 6 || wd === 0)) {
      return false;
    }
    const nxtBundled = nextCalendarDay(y, m, d);
    if (getScheduledDuty(nxtBundled.y, nxtBundled.m, emp, nxtBundled.d, result) === "D" && wd !== 5) {
      return false;
    }
    if (!options.allowAdjacentHG && hasAdjacentHG(emp, d, result)) {
      return false;
    }

    setDutyAssignment(emp, d, "HG");
    bundledHGDays.add(d);
    bundledHGKeys.add(dutyKey(emp, d));
    report.push({ day: d, emp, duty: "HG", reason: bindReason, tags: ["Gekoppelt"] });
    return true;
  }

  function canDoHG(emp, d, relaxed, assignments, options) {
    if (staticFeasibleHG[emp] && !staticFeasibleHG[emp][d]) return false;
    relaxed = relaxed || false;
    assignments = assignments || result;
    options = options || {};
    const { ignoreExistingDuty = false, coverageEscalation = false } = options;

    if (isDutyExempt(emp) || !isFacharzt(emp)) return false;
    if (isAbsentOnDay(y, m, emp, d, assignments)) return false;
    if (isPinnedEmpty(emp, d)) return false;

    const existingDuty = assignments[emp]?.[d]?.duty;
    if (existingDuty && !(ignoreExistingDuty && existingDuty === "HG")) return false;

    if (wishes[emp]?.[d] === "NO_DUTY") return false;

    const wd = weekday(y, m, d);
    const isWE = wd === 6 || wd === 0;

    if (assignments[emp]?.[d]?.assignment === "F" && !isWE) return false;

    // Kein Dienst am Tag vor (urlaubsähnlichem) Urlaub – gilt auch für HG.
    if (isNextDayVacationLike(y, m, emp, d, assignments, externalAssignments)) return false;

    const bdOnDay = dutyEmps.find((e) => assignments[e]?.[d]?.duty === "D");
    const isBdAA = bdOnDay && isAssistenzarzt(bdOnDay);

    const nxtHG = nextCalendarDay(y, m, d);
    const nxtDuty = getScheduledDuty(nxtHG.y, nxtHG.m, emp, nxtHG.d, assignments);
    if (nxtDuty === "D") {
      if (isBdAA) return false;
      if (wd !== 5) return false;
    }

    if (hasHolidayBlockConflict(emp, d)) return false;

    // Polednia: kein HG von AA an So/Di/Do (KUS-Kollision) – harte Sperre.
    if (isNoHgFromAaWeekday(emp, wd) && isBdAA) return false;

    // HG-Konfliktpaare (z. B. Fr. Dalitz vs. Hr. Torki/Hr. Sebastian): harte
    // Sperre, wenn am selben Tag eine der Konflikt-BD-Personen den BD leistet.
    const conflictBd = getHgConflictBd(emp, wd);
    if (conflictBd && bdOnDay && conflictBd.includes(bdOnDay)) return false;

    // Aufeinanderfolgende Wochenenden mit Dienst sind hart verboten – auch in
    // Optimierungs-Swaps. Nur die echte Coverage-Eskalation lockert dies.
    if (!coverageEscalation && wouldCreateConsecutiveWeekendDuty(y, m, emp, assignments, d)) return false;

    if (!relaxed) {
      const projectedWe = projectedWeekendDutyCount(y, m, emp, assignments, "HG", d);
      if (projectedWe > RELAXED_WEEKEND_DUTY_LIMIT) return false;
      if (hasAdjacentHG(emp, d, assignments)) return false;
    }
    
    return true;
  }

  function scoreHGCandidate(emp, d, relaxed, phaseKey) {
    relaxed = relaxed || false;
    if (!canDoHG(emp, d, relaxed, result, { coverageEscalation: relaxed })) return { score: -Infinity, histScore: 0, tags: [] };

    let score = 100;
    // Historie nur als Tie-Breaker (Punkt 16).
    let histScore = 0;
    const tags = [];
    const projectedHG = currentHG[emp] + 1;
    const avgProjectedHG = (hgFAs.reduce((s, e) => s + currentHG[e], 0) + 1) / Math.max(1, hgFAs.length);
    const avgBDforFAsNow = averageFromArray(hgFAs.map(e => currentBD[e]));

    const idealHG = avgProjectedHG + (avgBDforFAsNow - currentBD[emp]) * 1.0;

    score -= Math.abs(projectedHG - idealHG) * 10000 * W.fairness;
    tags.push("HG-Monatsausgleich");

    const histHG = hist[emp]?.hg || 0;
    const avgHistHG = averageFromArray(hgFAs.map(e => hist[e]?.hg || 0));
    histScore -= (histHG - avgHistHG) * 5;

    if (wishes[emp]?.[d] === "HG_WISH") {
      score += 500 * W.wish;
      tags.push("Wunsch");
    }

    if (isNextDayVacation(y, m, emp, d, result)) {
      score -= 100;
    }

    const wd = weekday(y, m, d);
    if (wd === 6 || wd === 0) {
      const projectedWe = projectedWeekendDutyCount(y, m, emp, result, "HG", d);
      score -= Math.abs(projectedWe - TARGET_WEEKEND_DUTY) * 1500 * W.fairness;
      if (projectedWe > RELAXED_WEEKEND_DUTY_LIMIT) {
        score -= (projectedWe - RELAXED_WEEKEND_DUTY_LIMIT) * 5000 * W.fairness;
      }
      if (wouldCreateConsecutiveWeekendDuty(y, m, emp, result, d)) {
        score -= 2500;
        tags.push("WE-Puffer");
      }
    }

    const minDistHG = minDistanceForDuty(emp, d, "HG", result);
    if (minDistHG < 3) {
      score -= (3 - minDistHG) * 8000;
      tags.push("HG-Abstand");
    }

    if (hasAdjacentHG(emp, d, result)) {
      score -= 25000;
      tags.push("kein Direkt-HG");
    }

    // Anti-Clustering bereits in der Erstvergabe (Punkt 12): rollierendes
    // 7-Tage-Fenster (±3 Tage). Bereits ein weiterer HG im Fenster wird
    // abgewertet, damit nicht mehr als 1 HG/Woche je Person entsteht.
    let density7 = 0;
    for (let j = Math.max(1, d - 3); j <= Math.min(dim, d + 3); j++) {
      if (j !== d && result[emp]?.[j]?.duty === "HG") density7++;
    }
    if (density7 >= 1) {
      score -= density7 * 6000;
      tags.push("HG-Dichte");
    }

    score += ((emp.charCodeAt(1 % emp.length) * 17 + d * 13) % 10) * 0.1;
    return { score, histScore, tags };
  }

  function computeHGObjective() {
    let score = 0;
    for (let day = 1; day <= dim; day++) {
      let hgCount = 0;
      emps.forEach(e => { 
        if(result[e]?.[day]?.duty === "HG") hgCount++; 
      });
      if (hgCount === 0) score += 15000;
      if (hgCount > 1) score += 40000 * hgCount;
    }
    
    // Sum of cached individual employee scores
    hgFAs.forEach(e => {
      score += hgEmpScoresCache[e] || 0;
    });

    const avgHG = averageFromArray(hgFAs.map((emp) => currentHG[emp]));
    const avgBDforFAs = averageFromArray(hgFAs.map((emp) => currentBD[emp]));
    const avgHGForAA = averageFromArray(hgFAs.map((emp) => currentHGForAA[emp]));
    const avgHGForFA = averageFromArray(hgFAs.map((emp) => currentHGForFA[emp]));
    
    let weSumFA = 0;
    hgFAs.forEach((emp) => {
      weSumFA += weCountsCache[emp] || 0;
    });
    const weAvgFA = hgFAs.length > 0 ? weSumFA / hgFAs.length : 0;

    hgFAs.forEach((emp) => {
      const idealHG = avgHG + (avgBDforFAs - currentBD[emp]) * 1.0;
      score += Math.pow(currentHG[emp] - idealHG, 2) * 25000 * W.fairness;
      score += Math.pow(currentHGForAA[emp] - avgHGForAA, 2) * 15000 * W.fairness;
      score += Math.pow(currentHGForFA[emp] - avgHGForFA, 2) * 8000 * W.fairness;

      const weCount = weCountsCache[emp] || 0;
      score += Math.pow(weCount - TARGET_WEEKEND_DUTY, 2) * 5000 * W.fairness;
      // Personenübergreifende WE-Fairness unter den Fachärzten (Streuung um den
      // FA-Gruppendurchschnitt), analog zum BD-Objective.
      const diffVal = weCount - weAvgFA;
      score += diffVal * diffVal * 4500 * W.fairness;

      if (weCount > RELAXED_WEEKEND_DUTY_LIMIT) {
        score += (weCount - RELAXED_WEEKEND_DUTY_LIMIT) * 20000 * W.fairness;
      }
    });
    return score;
  }

  function computeGlobalObjective() {
    const bdObjective = computeBDObjective();
    const hgObjective = hgFAs.length > 0 ? computeHGObjective() : 0;
    let coveragePenalty = 0;
    
    for (let day = 1; day <= dim; day++) {
      let dCount = 0, hgCount = 0;
      emps.forEach(e => {
        if(result[e]?.[day]?.duty === "D") dCount++;
        if(result[e]?.[day]?.duty === "HG") hgCount++;
      });
      if (dCount === 0) coveragePenalty += 25000;
      if (hgCount === 0) coveragePenalty += 18000;
      if (dCount > 1 || hgCount > 1) coveragePenalty += 100000;
    }
    
    return bdObjective + hgObjective + coveragePenalty;
  }

  function runPhase4_BDOptimize(cyclePct) {
    const mutableBDDays = listDutyAssignments(dutyEmps, dim, result, "D")
      .filter(({ emp, day }) => !fixedDutyKeys.has(`D:${dutyKey(emp, day)}`))
      .map(({ day }) => day);

    rebuildCurrentCounters();
    let bestBD = computeBDObjective();

    for (let pass = 0; pass < BD_MAX_PASSES; pass++) {
      let improved = false;
      for (const day of mutableBDDays) {
        const currentEmp = dutyEmps.find((e) => result[e]?.[day]?.duty === "D");
        if (!currentEmp) continue;
        
        const candidates = [...dutyEmps].sort((a, b) => {
          const aScore = Math.abs((currentBD[a] + 1) - bdTarget[a]) * 100 + projectedWeekendDutyCount(y, m, a, result, "D", day) * 50 + (weekday(y, m, day) === 6 ? currentSatBD[a] * 200 : 0);
          const bScore = Math.abs((currentBD[b] + 1) - bdTarget[b]) * 100 + projectedWeekendDutyCount(y, m, b, result, "D", day) * 50 + (weekday(y, m, day) === 6 ? currentSatBD[b] * 200 : 0);
          return aScore - bScore;
        });
        
        for (const candidate of candidates) {
          if (candidate === currentEmp) continue;
          
          clearDutyAssignment(currentEmp, day, "D");
          
          if (!canDoBD(candidate, day, true, result)) { 
            setDutyAssignment(currentEmp, day, "D"); 
            continue; 
          }
          
          setDutyAssignment(candidate, day, "D");
          
          const newBD = computeBDObjective();
          if (newBD + 0.01 < bestBD) { 
            bestBD = newBD; 
            improved = true; 
            swaps++; 
            log.push({ phase: "greedy", icon: "🔀", msg: `BD Swap Tag ${day}: ${currentEmp} ➔ ${candidate}`, dayIdx: day, oldEmpId: currentEmp, newEmpId: candidate, pct: cyclePct });
            break; 
          }
          
          clearDutyAssignment(candidate, day, "D");
          setDutyAssignment(currentEmp, day, "D");
        }
      }
      if (!improved) break;
    }
  }

  function runPhase5_HGBundle(cyclePct) {
    const prevBundledKeys = new Set(bundledHGKeys);
    for (const key of prevBundledKeys) {
      const atIdx = key.indexOf("@@");
      const emp = key.substring(0, atIdx);
      const day = parseInt(key.substring(atIdx + 2), 10);
      if (!fixedDutyKeys.has(`HG:${key}`) && result[emp]?.[day]?.duty === "HG") {
        clearDutyAssignment(emp, day, "HG");
      }
    }
    
    bundledHGDays = new Set();
    bundledHGKeys = new Set();

    for (let d = 1; d <= dim; d++) {
      const wd = weekday(y, m, d);
      const bdHolder = dutyEmps.find(e => result[e]?.[d]?.duty === "D");
      if (!bdHolder) continue;
      
      // AA-Freitags-Regel: AA am Freitag D -> der FA mit Samstags-D übernimmt
      // den Freitags-HG. Der Samstag kann im Folgemonat liegen (Punkt 10).
      if (wd === 5 && isAssistenzarzt(bdHolder)) {
        const sat = nextCalendarDay(y, m, d);
        const satBDHolder = dutyHolderOn(sat.y, sat.m, sat.d, "D");
        if (satBDHolder && isFacharzt(satBDHolder) && satBDHolder !== bdHolder && emps.includes(satBDHolder)) {
          let currentHGHolder = hgFAs.find(e => result[e]?.[d]?.duty === "HG");
          if (currentHGHolder && currentHGHolder !== satBDHolder && !fixedDutyKeys.has(`HG:${dutyKey(currentHGHolder, d)}`)) {
            clearDutyAssignment(currentHGHolder, d, "HG");
          } else {
            currentHGHolder = null;
          }
          if (assignBundledHG(satBDHolder, d, "Freitags-HG gekoppelt an FA des Samstags-BD.", { allowAdjacentHG: true })) {
             log.push({ phase: "hg", icon: "→", msg: `HG Tag ${d}. → ${satBDHolder}`, dayIdx: d, oldEmpId: currentHGHolder, newEmpId: satBDHolder, pct: cyclePct });
          }
        }
      }

      // FA-Samstags-Regel: FA mit Samstags-D übernimmt den Sonntags-HG. Der
      // Sonntag kann im Folgemonat liegen (Punkt 10) -> externer HG-Eintrag.
      if (wd === 6 && isFacharzt(bdHolder)) {
        const sun = nextCalendarDay(y, m, d);
        if (sun.y === y && sun.m === m) {
          let currentHGHolder = hgFAs.find(e => result[e]?.[sun.d]?.duty === "HG");
          if (currentHGHolder && currentHGHolder !== bdHolder && !fixedDutyKeys.has(`HG:${dutyKey(currentHGHolder, sun.d)}`)) {
            clearDutyAssignment(currentHGHolder, sun.d, "HG");
          } else {
            currentHGHolder = null;
          }
          if (assignBundledHG(bdHolder, sun.d, "Sonntags-HG gekoppelt an eigenen Samstags-BD.", { allowAdjacentHG: true })) {
             log.push({ phase: "hg", icon: "→", msg: `HG Tag ${sun.d}. → ${bdHolder}`, dayIdx: sun.d, oldEmpId: currentHGHolder, newEmpId: bdHolder, pct: cyclePct });
          }
        } else if (!dutyHolderOn(sun.y, sun.m, sun.d, "HG")) {
          queueExternalAssignment(sun.y, sun.m, bdHolder, sun.d, { duty: "HG" });
          log.push({ phase: "hg", icon: "→", msg: `HG ${sun.d}. ${MONTHS_SHORT[sun.m]} (Folgemonat) → ${bdHolder} (Sonntags-Kopplung)`, dayIdx: sun.d, newEmpId: bdHolder, pct: cyclePct });
        }
      }

      // Feiertags-Vortags-Regel: AA am Tag vor einem Feiertag D -> der FA des
      // Feiertags-D übernimmt den Vortags-HG. Der Feiertag kann der 1. des
      // Folgemonats sein (Punkt 10).
      const nxtHolObj = nextCalendarDay(y, m, d);
      const isNxtHol = isHoliday(nxtHolObj.y, nxtHolObj.m, nxtHolObj.d, getSaxonyHolidaysCached(nxtHolObj.y));
      if (isNxtHol && isAssistenzarzt(bdHolder)) {
        const holBDHolder = dutyHolderOn(nxtHolObj.y, nxtHolObj.m, nxtHolObj.d, "D");
        if (holBDHolder && isFacharzt(holBDHolder) && holBDHolder !== bdHolder && emps.includes(holBDHolder)) {
          let currentHGHolder = hgFAs.find(e => result[e]?.[d]?.duty === "HG");
          if (currentHGHolder && currentHGHolder !== holBDHolder && !fixedDutyKeys.has(`HG:${dutyKey(currentHGHolder, d)}`)) {
            clearDutyAssignment(currentHGHolder, d, "HG");
          } else {
            currentHGHolder = null;
          }
          if (assignBundledHG(holBDHolder, d, "Vortag-Feiertag-HG (AA im D) gekoppelt an FA des Feiertags-BD.", { allowAdjacentHG: true })) {
             log.push({ phase: "hg", icon: "→", msg: `HG Tag ${d}. → ${holBDHolder}`, dayIdx: d, oldEmpId: currentHGHolder, newEmpId: holBDHolder, pct: cyclePct });
          }
        }
      }
    }

    rebuildCurrentCounters();
  }

  function runPhase6_HGAssign(cyclePct) {
    for (let d = 1; d <= dim; d++) {
      if (bundledHGDays.has(d) || isDayHGTasked(d)) continue;
      
      let candidates = hgFAs.map((e) => ({ emp: e, ...scoreHGCandidate(e, d, false, "hg_assign") })).filter((c) => c.score > -Infinity).sort((a, b) => b.score - a.score || b.histScore - a.histScore);
      
      if (candidates.length === 0) {
        candidates = hgFAs.map((e) => ({ emp: e, ...scoreHGCandidate(e, d, true, "hg_assign") })).filter((c) => c.score > -Infinity).sort((a, b) => b.score - a.score || b.histScore - a.histScore);
        if (candidates.length > 0) {
          hgRelaxedCount++;
          candidates[0].tags.push("Regeln gelockert");
          log.push({ phase: "hg", icon: "⚠", msg: `HG-Regeln gelockert für Tag ${d}`, dayIdx: d, newEmpId: candidates[0].emp, pct: cyclePct });
        }
      }
      
      if (candidates.length > 0) {
        const chosen = candidates[0];
        setDutyAssignment(chosen.emp, d, "HG");
        rebuildCurrentCounters();
        report.push({ day: d, emp: chosen.emp, duty: "HG", reason: "Gleichmäßige Verteilung.", tags: chosen.tags, alternatives: candidates.slice(1, 4).map((c) => ({ emp: c.emp, score: Math.round(c.score), tags: c.tags })) });
        log.push({ phase: "hg", icon: "→", msg: `HG Tag ${d}. → ${chosen.emp}`, dayIdx: d, newEmpId: chosen.emp, pct: cyclePct });
      }
    }
  }

  function runPhase7_HGOptimize(cyclePct) {
    const mutableHGDays = listDutyAssignments(hgFAs, dim, result, "HG")
      .filter(({ emp, day }) => !fixedDutyKeys.has(`HG:${dutyKey(emp, day)}`) && !bundledHGKeys.has(dutyKey(emp, day)))
      .map(({ day }) => day);

    rebuildCurrentCounters();
    let bestHG = computeHGObjective();
    
    for (let pass = 0; pass < HG_MAX_PASSES; pass++) {
      let improved = false;
      for (const day of mutableHGDays) {
        const currentEmp = hgFAs.find((e) => result[e]?.[day]?.duty === "HG");
        if (!currentEmp) continue;
        
        const avgBDforFAs = averageFromArray(hgFAs.map(e => currentBD[e]));
        const avgHG = averageFromArray(hgFAs.map(e => currentHG[e]));
        
        const candidates = [...hgFAs].sort((a, b) => {
          const aIdeal = avgHG + (avgBDforFAs - currentBD[a]) * 1.0;
          const bIdeal = avgHG + (avgBDforFAs - currentBD[b]) * 1.0;
          const aBias = currentHG[a] - aIdeal;
          const bBias = currentHG[b] - bIdeal;
          return aBias - bBias;
        });
        
        for (const candidate of candidates) {
          if (candidate === currentEmp) continue;
          
          clearDutyAssignment(currentEmp, day, "HG");
          
          if (!canDoHG(candidate, day, true, result)) {
            setDutyAssignment(currentEmp, day, "HG");
            continue;
          }
          
          setDutyAssignment(candidate, day, "HG");
          
          const newHG = computeHGObjective();
          if (newHG + 0.01 < bestHG) {
            bestHG = newHG;
            improved = true;
            hgMoves++;
            log.push({ phase: "hg", icon: "🔁", msg: `HG Swap Tag ${day}: ${currentEmp} ➔ ${candidate}`, dayIdx: day, oldEmpId: currentEmp, newEmpId: candidate, pct: cyclePct });
            break;
          }
          
          clearDutyAssignment(candidate, day, "HG");
          setDutyAssignment(currentEmp, day, "HG");
        }
      }
      if (!improved) break;
    }
  }

  function runPhase8_DeepOptimize(cyclePct) {
    const deepMutableBDDays = listDutyAssignments(dutyEmps, dim, result, "D")
      .filter(({ emp, day }) => !fixedDutyKeys.has(`D:${dutyKey(emp, day)}`))
      .map(({ day }) => day);
      
    const deepMutableHGDays = listDutyAssignments(hgFAs, dim, result, "HG")
      .filter(({ emp, day }) => !fixedDutyKeys.has(`HG:${dutyKey(emp, day)}`) && !bundledHGKeys.has(dutyKey(emp, day)))
      .map(({ day }) => day);

    rebuildCurrentCounters();
    let bestGlobal = computeGlobalObjective();

    function tryImproveDay(day, dutyCode) {
      const pool = dutyCode === "D" ? dutyEmps : hgFAs;
      const currentEmp = pool.find((e) => result[e]?.[day]?.duty === dutyCode);
      if (!currentEmp) return false;
      
      const canDo = dutyCode === "D" ? canDoBD : canDoHG;
      const orderedPool = [...pool].sort((a, b) => {
        const aDelta = dutyCode === "D" ? currentBD[a] - bdTarget[a] : currentHG[a] - averageFromArray(hgFAs.map((e) => currentHG[e]));
        const bDelta = dutyCode === "D" ? currentBD[b] - bdTarget[b] : currentHG[b] - averageFromArray(hgFAs.map((e) => currentHG[e]));
        return aDelta - bDelta;
      });
      
      for (const candidate of orderedPool) {
        if (candidate === currentEmp) continue;
        
        clearDutyAssignment(currentEmp, day, dutyCode);
        
        if (!canDo(candidate, day, true, result)) {
          setDutyAssignment(currentEmp, day, dutyCode);
          continue;
        }
        
        setDutyAssignment(candidate, day, dutyCode);
        
        const newGlobal = computeGlobalObjective();
        if (newGlobal + 0.01 < bestGlobal) {
          bestGlobal = newGlobal;
          deepMoves++;
          log.push({ phase: "deep", icon: "🧠", msg: `Deep Move Tag ${day} (${dutyCode}): ${currentEmp} ➔ ${candidate}`, dayIdx: day, oldEmpId: currentEmp, newEmpId: candidate, pct: cyclePct });
          return true;
        }
        
        clearDutyAssignment(candidate, day, dutyCode);
        setDutyAssignment(currentEmp, day, dutyCode);
      }
      return false;
    }

    for (let pass = 0; pass < DEEP_MAX_PASSES; pass++) {
      let improved = false;
      for (const day of deepMutableBDDays) {
        improved = tryImproveDay(day, "D") || improved;
      }
      for (const day of deepMutableHGDays) {
        improved = tryImproveDay(day, "HG") || improved;
      }
      if (!improved) break;
    }
  }

  function runCoverageRepair(cyclePct) {
    for (let d = 1; d <= dim; d++) {
      if (!emps.some(e => result[e]?.[d]?.duty === "D")) {
        const wd = weekday(y, m, d);
        const bdCandidates = dutyEmps
          .filter(e => {
            if (isDutyExempt(e) || bdTarget[e] === 0) return false;
            if (isAbsentOnDay(y, m, e, d, result)) return false;
            if (result[e]?.[d]?.duty) return false;
            if (isPinnedEmpty(e, d)) return false;
            if (wishes[e]?.[d] === "NO_DUTY") return false;
            if (wd === 6 && !isFacharzt(e)) return false;
            if (isNoBdWeekday(e, wd)) return false;
            const pv = prevCalendarDay(y, m, d);
            const nx = nextCalendarDay(y, m, d);
            if (getScheduledDuty(pv.y, pv.m, e, pv.d, result) === "D") return false;
            if (getScheduledDuty(nx.y, nx.m, e, nx.d, result) === "D") return false;
            return true;
          })
          .sort((a, b) => currentBD[a] - currentBD[b]);

        if (bdCandidates.length > 0) {
          const chosen = bdCandidates[0];
          setDutyAssignment(chosen, d, "D");
          if (wd === 6) currentSatBD[chosen]++;
          bdRelaxedCount++;
          // Auch in der Zwangsbelegung gilt die FZA-Pflicht nach Ultima-Ratio-
          // Samstags-D (Punkt 5).
          const fzaNote = applyMandatorySaturdayFza(chosen, d, "coverage_repair", cyclePct);
          rebuildCurrentCounters();
          report.push({ day: d, emp: chosen, duty: "D", reason: `Zwangsbelegung (Coverage Repair).${fzaNote}`, tags: ["Coverage Repair"] });
          recordRule("coverage_repair", "BD-Lücke gefüllt", `Tag ${d}: ${chosen}`, "warn");
          log.push({ phase: "repair", icon: "🩹", msg: `BD-Lücke Tag ${d} gefüllt mit ${chosen}`, dayIdx: d, newEmpId: chosen, pct: cyclePct });
        }
      }

      if (!emps.some(e => result[e]?.[d]?.duty === "HG")) {
        const wd = weekday(y, m, d);
        const hgCandidates = hgFAs
          .filter(e => {
            if (isDutyExempt(e)) return false;
            if (isAbsentOnDay(y, m, e, d, result)) return false;
            if (result[e]?.[d]?.duty) return false;
            if (isPinnedEmpty(e, d)) return false;
            if (wishes[e]?.[d] === "NO_DUTY") return false;
            // Harte Sonderregeln auch in der Zwangsbelegung respektieren
            // (Punkte 1 & 2): Polednia-HG-von-AA und HG-Konfliktpaare.
            const bdHolder = dutyEmps.find((x) => result[x]?.[d]?.duty === "D");
            const isBdAA = bdHolder && isAssistenzarzt(bdHolder);
            if (isNoHgFromAaWeekday(e, wd) && isBdAA) return false;
            const conflictBd = getHgConflictBd(e, wd);
            if (conflictBd && bdHolder && conflictBd.includes(bdHolder)) return false;
            return true;
          })
          .sort((a, b) => currentHG[a] - currentHG[b]);
        
        if (hgCandidates.length > 0) {
          const chosen = hgCandidates[0];
          setDutyAssignment(chosen, d, "HG");
          hgRelaxedCount++;
          rebuildCurrentCounters();
          report.push({ day: d, emp: chosen, duty: "HG", reason: "Zwangsbelegung (Coverage Repair).", tags: ["Coverage Repair"] });
          recordRule("coverage_repair", "HG-Lücke gefüllt", `Tag ${d}: ${chosen}`, "warn");
          log.push({ phase: "repair", icon: "🩹", msg: `HG-Lücke Tag ${d} gefüllt mit ${chosen}`, dayIdx: d, newEmpId: chosen, pct: cyclePct });
        }
      }
    }
  }

  log.push({ phase: "hg_bundle", icon: "🔗", msg: "Initiale Wochenend-Kopplung für HG...", pct: 62 });
  runPhase5_HGBundle(62);

  log.push({ phase: "hg_assign", icon: "📞", msg: "Initiale HG-Verteilung...", pct: 65 });
  runPhase6_HGAssign(65);
  rebuildCurrentCounters();

  initWeCountsCache();
  initBDEmpScoresCache();
  initHgEmpScoresCache();

  log.push({ phase: "optimize", icon: "⚙️", msg: `Starte Multi-Zyklus-Optimierung (${MAX_OPTIMIZATION_CYCLES} Zyklen, BD:${BD_MAX_PASSES}/HG:${HG_MAX_PASSES}/Deep:${DEEP_MAX_PASSES} Passes)...`, pct: 68 });

  let bestGlobalForCycles = computeGlobalObjective();
  
  for (let cycle = 0; cycle < MAX_OPTIMIZATION_CYCLES; cycle++) {
    const prevGlobalForCycle = computeGlobalObjective();
    const cyclePct = 68 + Math.round((cycle / MAX_OPTIMIZATION_CYCLES) * 22);
    
    log.push({ phase: "optimize", icon: "🔄", msg: `Zyklus ${cycle + 1}/${MAX_OPTIMIZATION_CYCLES}: BD-Optimierung läuft...`, pct: cyclePct });
    runPhase4_BDOptimize(cyclePct);
    rebuildCurrentCounters();
    
    log.push({ phase: "optimize", icon: "🔗", msg: `Zyklus ${cycle + 1}: HG-Wochenend-Kopplung aktualisieren...`, pct: cyclePct + 1 });
    runPhase5_HGBundle(cyclePct + 1);
    rebuildCurrentCounters();
    
    log.push({ phase: "optimize", icon: "📞", msg: `Zyklus ${cycle + 1}: HG-Lücken auffüllen...`, pct: cyclePct + 2 });
    runPhase6_HGAssign(cyclePct + 2);
    rebuildCurrentCounters();
    
    log.push({ phase: "optimize", icon: "🧠", msg: `Zyklus ${cycle + 1}: HG-Optimierung läuft...`, pct: cyclePct + 2 });
    runPhase7_HGOptimize(cyclePct + 2);
    rebuildCurrentCounters();
    
    log.push({ phase: "optimize", icon: "🧬", msg: `Zyklus ${cycle + 1}: Globale Metaheuristik läuft...`, pct: cyclePct + 3 });
    runPhase8_DeepOptimize(cyclePct + 3);
    rebuildCurrentCounters();
    
    log.push({ phase: "optimize", icon: "🛠️", msg: `Zyklus ${cycle + 1}: Coverage Repair...`, pct: cyclePct + 3 });
    runCoverageRepair(cyclePct + 3);
    rebuildCurrentCounters();
    
    const newGlobalForCycle = computeGlobalObjective();
    const delta = Math.round(prevGlobalForCycle - newGlobalForCycle);
    const deltaSign = delta >= 0 ? "-" : "+";
    log.push({ phase: "optimize", icon: "📊", msg: `Zyklus ${cycle + 1} abgeschlossen. Δ${deltaSign}${Math.abs(delta)} | BD-Swaps: ${swaps} | HG-Moves: ${hgMoves} | Deep: ${deepMoves}`, pct: cyclePct + 4 });
    
    if (newGlobalForCycle >= prevGlobalForCycle - 0.01) {
      log.push({ phase: "optimize", icon: "✓", msg: `Konvergenz nach Zyklus ${cycle + 1} erreicht. Optimierung abgeschlossen.`, pct: 90 });
      break;
    }
    
    bestGlobalForCycles = newGlobalForCycle;
  }

  // Punkt 13: Nach der letzten Deep-Optimierung die Wochenend-/Feiertags-
  // Kopplungen final mit dem endgültigen D-Layout abgleichen, damit ein in der
  // letzten Phase geänderter Samstags-D nicht mit veralteter Kopplung zurück-
  // bleibt.
  log.push({ phase: "validate", icon: "🔗", msg: "Finale Kopplungs-Rekonzilierung...", pct: 92 });
  runPhase5_HGBundle(92);
  runPhase6_HGAssign(92);
  runCoverageRepair(92);
  rebuildCurrentCounters();

  // Punkt 5: Finaler Durchlauf – jeder Ultima-Ratio-Samstags-D (auch ein per
  // Swap entstandener) erhält zwingend den FZA-Tag.
  for (let d = 1; d <= dim; d++) {
    if (weekday(y, m, d) !== 6) continue;
    const satHolder = emps.find((e) => result[e]?.[d]?.duty === "D");
    if (satHolder && needsSaturdayFza(satHolder)) {
      applyMandatorySaturdayFza(satHolder, d, "validate", 93);
    }
  }
  rebuildCurrentCounters();

  log.push({ phase: "validate", icon: "🛡️", msg: "Abschlussprüfung der Dienst-Exklusivität...", pct: 93 });

  // Punkt 9: Bei Mehrfachbelegung den fixierten/gepinnten Dienst priorisiert
  // behalten und nur die übrigen (automatischen) entfernen.
  for (let d = 1; d <= dim; d++) {
    let dList = emps.filter(e => result[e]?.[d]?.duty === "D");
    if (dList.length > 1) {
      const ordered = [...dList].sort((a, b) =>
        (fixedDutyKeys.has(`D:${dutyKey(b, d)}`) ? 1 : 0) - (fixedDutyKeys.has(`D:${dutyKey(a, d)}`) ? 1 : 0));
      for (let i = 1; i < ordered.length; i++) {
        clearDutyAssignment(ordered[i], d, "D");
      }
    }
    let hgList = emps.filter(e => result[e]?.[d]?.duty === "HG");
    if (hgList.length > 1) {
      const ordered = [...hgList].sort((a, b) =>
        (fixedDutyKeys.has(`HG:${dutyKey(b, d)}`) ? 1 : 0) - (fixedDutyKeys.has(`HG:${dutyKey(a, d)}`) ? 1 : 0));
      for (let i = 1; i < ordered.length; i++) {
        clearDutyAssignment(ordered[i], d, "HG");
      }
    }
  }

  log.push({ phase: "done", icon: "✅", msg: "Planung abgeschlossen!", pct: 100 });

  const summary = { bd: {}, hg: {}, warnings: [], infos: [], bdTarget };
  
  emps.forEach((e) => {
    let bd = 0;
    let hg = 0;
    let holDuty = 0;
    const bdDays = [];
    const hgDays = [];
    const weMapSummary = {};
    
    for (let d = 1; d <= dim; d++) {
      const cell = result[e]?.[d];
      const wd = weekday(y, m, d);
      const hol = isHoliday(y, m, d, hols);
      const isWEDay = wd === 5 || wd === 6 || wd === 0;
      
      if (cell?.duty === "D") {
        bd++;
        bdDays.push(d);
        if (hol) holDuty++;
        if (isWEDay) {
          const kw = isoWeekNumber(y, m, d);
          if (!weMapSummary[kw]) weMapSummary[kw] = { hasD: false, hasHG: false };
          weMapSummary[kw].hasD = true;
        }
      }
      
      if (cell?.duty === "HG") {
        hg++;
        hgDays.push(d);
        if (hol) holDuty++;
        if (isWEDay) {
          const kw = isoWeekNumber(y, m, d);
          if (!weMapSummary[kw]) weMapSummary[kw] = { hasD: false, hasHG: false };
          if (!weMapSummary[kw].hasD) weMapSummary[kw].hasHG = true;
        }
      }
    }
    
    let weDuty = 0;
    for (const { hasD, hasHG } of Object.values(weMapSummary)) {
      if (hasD) weDuty += 1;
      else if (hasHG) weDuty += 0.5;
    }
    
    summary.bd[e] = { count: bd, target: bdTarget[e], days: bdDays, weDuty, holDuty };
    summary.hg[e] = { count: hg, days: hgDays };
  });

  dutyEmps.forEach((e) => {
    const bd = summary.bd[e];
    if (bd.target > 0 && bd.count < bd.target) {
      summary.warnings.push(`${e}: nur ${bd.count}/${bd.target} BD`);
    }
    if (bd.weDuty > RELAXED_WEEKEND_DUTY_LIMIT) {
      summary.warnings.push(`${e}: ${bd.weDuty} WE-Dienste (Ziel ${TARGET_WEEKEND_DUTY})`);
    }
  });
  
  beckerSaturdayFzaWarnings.forEach((warning) => summary.warnings.push(warning));

  // Punkt 4: Generelle CT-Leitungs-Invariante prüfen (auch gegen manuell/
  // importiert gesetzte Abwesenheiten): an Werktagen muss immer mindestens
  // eine Person jedes Vertretungspaares anwesend sein.
  findCTLeadershipPresenceGaps(y, m, result).forEach(({ day, a, b }) => {
    summary.warnings.push(`Tag ${day}: CT-Leitung – ${a} und ${b} gleichzeitig abwesend/F. Vertretung manuell sicherstellen.`);
  });

  // Punkt 19: Personen ohne hinterlegte Rolle wurden als AA behandelt.
  if (unknownRoleEmps.length > 0) {
    summary.warnings.push(`Ohne hinterlegte Rolle (als AA behandelt, ggf. keine HG/Samstags-D möglich): ${unknownRoleEmps.join(", ")}. Bitte Stammdaten/Rollen-Override ergänzen.`);
  }

  for (let d = 1; d <= dim; d++) {
    if (!emps.some((e) => result[e]?.[d]?.duty === "D")) {
      summary.warnings.push(`Tag ${d}: kein BD besetzt.`);
    }
    if (!emps.some((e) => result[e]?.[d]?.duty === "HG")) {
      summary.warnings.push(`Tag ${d}: kein HG besetzt.`);
    }
  }

  summary.infos.push(`Multi-Zyklus-Optimierung: ${MAX_OPTIMIZATION_CYCLES} Zyklen × (BD:${BD_MAX_PASSES} + HG:${HG_MAX_PASSES} + Deep:${DEEP_MAX_PASSES} Passes). BD-Swaps: ${swaps}, HG-Moves: ${hgMoves}, Deep-Moves: ${deepMoves}.`);
  // Punkt 18: ehrliche Formulierung – die Vollbesetzung wird angestrebt, nicht
  // garantiert; nicht besetzbare Tage werden als Warnung ausgewiesen.
  summary.infos.push(`Der Algorithmus strebt exakt einen D und einen HG pro Kalendertag an; nicht besetzbare Tage werden oben als Warnung ausgewiesen.`);
  summary.infos.push(`Die Samstags-Dienste wurden bevorzugt auf Fachärzte verteilt (Dr. Becker nur im Notfall).`);
  summary.infos.push(`Wochenend-Kopplung: Falls ein AA am Freitag D hatte, übernimmt der FA vom Samstag den HG am Freitag.`);
  
  if (bdRelaxedCount > 0 || hgRelaxedCount > 0) {
    summary.infos.push(`Harte Abstandsregeln wurden bei ${bdRelaxedCount} BD / ${hgRelaxedCount} HG weich gelockert, um die Vollbesetzung zu sichern.`);
  }

  const pinnedCellCount = emps.reduce((sum, e) => sum + (pins[e] ? Object.keys(pins[e]).filter((d) => pins[e][d]).length : 0), 0);
  if (pinnedCellCount > 0) {
    summary.infos.push(`${pinnedCellCount} Zelle(n) waren vom Nutzer fixiert (📌) und wurden vom Solver garantiert nicht verändert.`);
  }


  const dutyCoverageMisses = Array.from({ length: dim }, (_, idx) => idx + 1).filter((day) => !emps.some((emp) => result[emp]?.[day]?.duty === "D")).length;
  const hgCoverageMisses = Array.from({ length: dim }, (_, idx) => idx + 1).filter((day) => !emps.some((emp) => result[emp]?.[day]?.duty === "HG")).length;
  
  rebuildCurrentCounters();
  const bdSpread = computeFairnessSpread(dutyEmps.map((emp) => summary.bd[emp]?.count || 0));
  const hgSpread = computeFairnessSpread(hgFAs.map((emp) => summary.hg[emp]?.count || 0));
  const weekendSpread = computeFairnessSpread(dutyEmps.map((emp) => summary.bd[emp]?.weDuty || 0));
  
  const reportedWishDays = new Set();
  let wishCount = 0;
  for (let d = 1; d <= dim; d++) {
    dutyEmps.forEach(e => {
      const w = wishes[e]?.[d];
      if (w === "BD_WISH" || w === "HG_WISH") {
        wishCount++;
      }
    });
  }

  // Re-map the report at the end to match the actual result assignments
  const finalReport = [];
  for (let d = 1; d <= dim; d++) {
    // Check D duty
    const dEmp = emps.find(e => result[e]?.[d]?.duty === "D");
    if (dEmp) {
      const existing = report.find(r => r.day === d && r.duty === "D");
      const isPinnedCell = pins[dEmp]?.[d];
      const evalResult = scoreBDCandidate(dEmp, d, true, "validate_report");
      const tags = [...evalResult.tags];
      if (isPinnedCell) tags.push("Fixiert");
      
      let reason = existing ? existing.reason : "Bester Score.";
      if (!existing || existing.emp !== dEmp) {
        if (isPinnedCell) {
          reason = "Vom Benutzer fixiert.";
        } else if (wishes[dEmp]?.[d] === "BD_WISH") {
          reason = "Wunschdienst berücksichtigt.";
        } else {
          reason = "Durch Optimierung zugewiesen (Bester Score).";
        }
      }
      
      let fzaNote = "";
      if (weekday(y, m, d) === 6 && needsSaturdayFza(dEmp)) {
        const nextWorkday = findNextWorkdayFrom(y, m, d);
        if (nextWorkday) {
          fzaNote = ` Samstags-Dienst unvermeidbar -> FZA am nächsten Werktag (${nextWorkday.d}. ${MONTHS_SHORT[nextWorkday.m]}) eingetragen.`;
        }
      }
      if (fzaNote && !reason.includes("FZA")) {
        reason += fzaNote;
      }

      finalReport.push({
        day: d,
        emp: dEmp,
        duty: "D",
        reason: reason,
        tags: tags,
        alternatives: existing ? existing.alternatives : []
      });
    }

    // Check HG duty
    const hgEmp = emps.find(e => result[e]?.[d]?.duty === "HG");
    if (hgEmp) {
      const existing = report.find(r => r.day === d && r.duty === "HG");
      const isPinnedCell = pins[hgEmp]?.[d];
      const isBundled = bundledHGKeys.has(dutyKey(hgEmp, d));
      const evalResult = scoreHGCandidate(hgEmp, d, true, "validate_report");
      const tags = [...evalResult.tags];
      if (isPinnedCell) tags.push("Fixiert");
      if (isBundled) tags.push("Gekoppelt");

      let reason = existing ? existing.reason : "Gleichmäßige Verteilung.";
      if (!existing || existing.emp !== hgEmp) {
        if (isPinnedCell) {
          reason = "Vom Benutzer fixiert.";
        } else if (isBundled) {
          reason = "Gekoppelt an Wochenend-/Feiertagsdienst.";
        } else if (wishes[hgEmp]?.[d] === "HG_WISH") {
          reason = "Wunschdienst berücksichtigt.";
        } else {
          reason = "Durch Optimierung zugewiesen (Gleichmäßige Verteilung).";
        }
      }

      finalReport.push({
        day: d,
        emp: hgEmp,
        duty: "HG",
        reason: reason,
        tags: tags,
        alternatives: existing ? existing.alternatives : []
      });
    }
  }

  const wishFulfillmentRate = wishCount > 0 ? (finalReport.filter(r => r.tags && r.tags.includes("Wunsch")).length / wishCount) : 1;
  
  const rawScore = 100.0 
    - (dutyCoverageMisses * 15.0) 
    - (hgCoverageMisses * 10.0) 
    - (bdSpread * 2.5) 
    - (hgSpread * 1.5) 
    - (weekendSpread * 2.0) 
    + (wishFulfillmentRate * 5.0) 
    - (deepMoves * 0.005);
    
  const qualityScore = Math.max(0, Math.min(100, rawScore)).toFixed(1);
  
  summary.quality = { score: qualityScore, dutyCoverageMisses, hgCoverageMisses, bdSpread, hgSpread, weekendSpread, wishFulfillmentRate, deepMoves, swaps, hgMoves };

  finalReport.sort((a, b) => a.day - b.day || (a.duty === "D" ? -1 : 1));
  
  rebuildCurrentCounters();
  return { assignments: result, summary, log, report: finalReport, externalAssignments, ruleTelemetry, fluxTraces };
}