// ===========================================================================
//  RadPlan · Auswertungs-Engine (Analytics Hub)
// ---------------------------------------------------------------------------
//  Gemeinsame Berechnungs- und Zeitraum-Schicht für den frage-/domänen-
//  orientierten Auswertungsbereich. Stellt einen einheitlichen Zeitraum-
//  Selektor (Monat · Quartal · Jahr · rollierend · frei) sowie wieder-
//  verwendbare Kennzahl-Berechnungen bereit (Abdeckung, Kapazität,
//  Regelkonformität, Prognose). Fairness wird aus model.js wiederverwendet.
//
//  Alle Module importieren ausschließlich aus dieser Datei, model.js und
//  constants.js – nie aus den anderen Modulen. Dadurch bleibt der Hub
//  erweiterbar und kollisionsfrei parallel entwickelbar.
// ===========================================================================

import {
  MONTHS, MONTHS_SHORT, CODE_MAP, WORKPLACES, STATUSES,
  VACATION_CODES, ABSENCE_CODES, VACATION_LIKE_CODES,
  daysInMonth, weekday, isHoliday, isWeekend, isWorkday,
  getSaxonyHolidaysCached, getEmpMeta, isFacharzt, isAssistenzarzt,
  SPECIAL_RULES, dateKey, monthKey, DOW_ABBR, DOW_LONG,
} from '../constants.js';

import {
  getMonthData, getCell, buildProfileStats, buildYearlyStats,
  getEmployeesForYear, computeDutyFairness, getEmployeeFairness, isDutyExempt,
} from '../model.js';

import { state, TOD_Y, TOD_M } from '../state.js';
import { posColor } from '../constants.js';

// Re-Exports, damit Module nur ./engine.js importieren müssen.
export {
  MONTHS, MONTHS_SHORT, MONTHS as MONTH_NAMES, CODE_MAP, WORKPLACES, STATUSES,
  VACATION_CODES, ABSENCE_CODES, VACATION_LIKE_CODES,
  daysInMonth, weekday, isHoliday, isWeekend, isWorkday,
  getSaxonyHolidaysCached, getEmpMeta, isFacharzt, isAssistenzarzt,
  SPECIAL_RULES, dateKey, monthKey, DOW_ABBR, DOW_LONG,
  getMonthData, getCell, buildProfileStats, buildYearlyStats,
  getEmployeesForYear, computeDutyFairness, getEmployeeFairness, isDutyExempt,
  posColor, TOD_Y, TOD_M,
};

// Farbpalette für Jahres-Visualisierungen (Heatmap-/Kurvenmodule).
export const EMP_COLORS = [
  '#0EA5E9', '#22C55E', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#14B8A6', '#F97316',
  '#6366F1', '#84CC16', '#06B6D4',
];

// Heatmap-Farbe nach Abweichung vom Monats-Mittelwert (aus dem Jahresplaner
// übernommen, damit das gewohnte Farbschema erhalten bleibt).
export function heatColor(dev) {
  if (dev >= 2)   return { bg: 'rgba(239,68,68,0.18)',  fg: '#B91C1C' };
  if (dev >= 1)   return { bg: 'rgba(249,115,22,0.15)', fg: '#C2410C' };
  if (dev > -0.5) return { bg: 'rgba(34,197,94,0.12)',  fg: '#15803D' };
  if (dev >= -1)  return { bg: 'rgba(14,165,233,0.14)', fg: '#0369A1' };
  return            { bg: 'rgba(14,165,233,0.26)', fg: '#075985' };
}

// Per-Monat/Person-Dienstmatrix eines Jahres + Spaltenmittelwerte – Basis für
// das Jahresgitter (Heatmap) und die Fairness-Verlaufskurven.
export function computeYearGrid(year) {
  const allEmps = getEmployeesForYear(year);
  const perEmp = {};
  allEmps.forEach((emp, idx) => {
    const fa = isFacharzt(emp);
    perEmp[emp] = {
      color: EMP_COLORS[idx % EMP_COLORS.length],
      months: [], totalBD: 0, totalHG: 0, monthsWithData: 0,
      isFa: fa, isDutyCapable: !isDutyExempt(emp),
      meta: getEmpMeta(emp),
    };
    for (let m = 0; m < 12; m++) {
      const md = getMonthData(year, m);
      const inData = !!(md && md.employees && md.employees.includes(emp));
      if (!inData) { perEmp[emp].months.push({ bd: 0, hg: 0, hasData: false }); continue; }
      const s = buildProfileStats(year, m, emp);
      const bd = s.dutyD.length, hg = s.dutyHG.length;
      perEmp[emp].months.push({ bd, hg, hasData: true });
      perEmp[emp].totalBD += bd;
      perEmp[emp].totalHG += hg;
      perEmp[emp].monthsWithData++;
    }
  });

  const meansBD = Array.from({ length: 12 }, (_, m) => {
    const vals = allEmps.filter((e) => perEmp[e].months[m].hasData && perEmp[e].isDutyCapable).map((e) => perEmp[e].months[m].bd);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  });
  const meansHG = Array.from({ length: 12 }, (_, m) => {
    const vals = allEmps.filter((e) => perEmp[e].months[m].hasData && perEmp[e].isFa && !isDutyExempt(e)).map((e) => perEmp[e].months[m].hg);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  });

  // Fachärzte zuerst, dann Assistenz – innerhalb alphabetisch (allEmps ist sortiert).
  const ordered = [...allEmps.filter((e) => perEmp[e].isFa), ...allEmps.filter((e) => !perEmp[e].isFa)];

  return { year, employees: ordered, perEmp, meansBD, meansHG, now: { year: TOD_Y, month: TOD_M } };
}

// ---------------------------------------------------------------------------
//  Zeitraum-Definitionen
// ---------------------------------------------------------------------------
export const RANGE_DEFS = [
  { key: 'month', label: 'Monat' },
  { key: 'quarter', label: 'Quartal' },
  { key: 'ytd', label: 'Jahr bis heute' },
  { key: 'year', label: 'Gesamtjahr' },
  { key: 'rolling12', label: 'Rollierend 12M' },
  { key: 'custom', label: 'Frei' },
];

// Liefert ein normalisiertes Zeitraum-Objekt:
//   { key, label, months:[{year,month}], year, month, single, isYear }
export function getRange(rangeKey, year, month, custom) {
  const y = year ?? state.year;
  const m = month ?? state.month;
  let months = [];
  let label = '';

  switch (rangeKey) {
    case 'quarter': {
      const start = Math.floor(m / 3) * 3;
      months = Array.from({ length: 3 }, (_, i) => ({ year: y, month: start + i }));
      label = `Q${Math.floor(m / 3) + 1} ${y}`;
      break;
    }
    case 'ytd': {
      months = Array.from({ length: m + 1 }, (_, i) => ({ year: y, month: i }));
      label = `Jan–${MONTHS_SHORT[m]} ${y}`;
      break;
    }
    case 'year': {
      months = Array.from({ length: 12 }, (_, i) => ({ year: y, month: i }));
      label = `${y}`;
      break;
    }
    case 'rolling12': {
      months = Array.from({ length: 12 }, (_, idx) => {
        const total = y * 12 + m - (11 - idx);
        return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
      });
      label = `${MONTHS_SHORT[months[0].month]} ${months[0].year} – ${MONTHS_SHORT[m]} ${y}`;
      break;
    }
    case 'custom': {
      const cs = custom?.start || { year: y, month: Math.max(0, m - 2) };
      const ce = custom?.end || { year: y, month: m };
      let from = cs.year * 12 + cs.month;
      let to = ce.year * 12 + ce.month;
      if (from > to) [from, to] = [to, from];
      for (let t = from; t <= to; t++) {
        months.push({ year: Math.floor(t / 12), month: ((t % 12) + 12) % 12 });
      }
      label = `${MONTHS_SHORT[months[0].month]} ${months[0].year} – ${MONTHS_SHORT[months.at(-1).month]} ${months.at(-1).year}`;
      break;
    }
    case 'month':
    default:
      months = [{ year: y, month: m }];
      label = `${MONTHS[m]} ${y}`;
      break;
  }

  return {
    key: rangeKey || 'month',
    label,
    months,
    year: y,
    month: m,
    single: months.length === 1,
    isYear: rangeKey === 'year' || rangeKey === 'ytd',
  };
}

// Iteriert über alle realen Tage eines Zeitraums (nur Monate mit Daten optional).
export function eachDay(range, cb, { onlyWithData = false } = {}) {
  range.months.forEach(({ year, month }) => {
    const md = getMonthData(year, month);
    if (onlyWithData && (!md || !md.employees || !md.employees.length)) return;
    const hols = getSaxonyHolidaysCached(year);
    const dim = daysInMonth(year, month);
    for (let d = 1; d <= dim; d++) {
      cb({
        year, month, day: d,
        wd: weekday(year, month, d),
        holiday: isHoliday(year, month, d, hols),
        holName: hols[dateKey(year, month, d)] || '',
        workday: isWorkday(year, month, d, hols),
        weekendOrHoliday: weekday(year, month, d) === 0 || weekday(year, month, d) === 6 || isHoliday(year, month, d, hols),
        md,
      });
    }
  });
}

// Vereinigte, deduplizierte Mitarbeitendenliste über alle Monate des Zeitraums.
export function employeesInRange(range) {
  const set = new Set();
  range.months.forEach(({ year, month }) => {
    const md = getMonthData(year, month);
    (md?.employees || []).forEach((e) => set.add(e));
  });
  return [...set].sort((a, b) => a.localeCompare(b, 'de'));
}

// ---------------------------------------------------------------------------
//  Abdeckung & Risiko
// ---------------------------------------------------------------------------
// Liefert tagesgenaue Besetzung von Bereitschafts- (D) und Hintergrunddienst
// (HG) inkl. Lücken, Wochenend-/Feiertagslücken und einem Risiko-Score.
export function computeCoverage(range) {
  const days = [];
  let workdays = 0, weekendHolidayDays = 0;
  let dCovered = 0, hgCovered = 0, dGaps = 0, hgGaps = 0;
  let weHolDGaps = 0, weHolHgGaps = 0;

  eachDay(range, (ctx) => {
    const { year, month, day, md } = ctx;
    let hasD = false, hasHG = false, dOwner = null, hgOwner = null;
    (md?.employees || []).forEach((emp) => {
      const cell = md.assignments?.[emp]?.[day];
      if (!cell) return;
      if (cell.duty === 'D') { hasD = true; dOwner = emp; }
      if (cell.duty === 'HG') { hasHG = true; hgOwner = emp; }
    });
    const required = true; // D & HG sind an JEDEM Kalendertag zu besetzen
    if (ctx.workday) workdays++;
    if (ctx.weekendOrHoliday) weekendHolidayDays++;
    if (hasD) dCovered++; else { dGaps++; if (ctx.weekendOrHoliday) weHolDGaps++; }
    if (hasHG) hgCovered++; else { hgGaps++; if (ctx.weekendOrHoliday) weHolHgGaps++; }

    let status = 'full';
    if (!hasD && !hasHG) status = 'none';
    else if (!hasD || !hasHG) status = 'partial';

    days.push({
      year, month, day, wd: ctx.wd, holiday: ctx.holiday, holName: ctx.holName,
      weekendOrHoliday: ctx.weekendOrHoliday, hasD, hasHG, dOwner, hgOwner, status, required,
    });
  });

  const totalDays = days.length;
  const dPct = totalDays ? Math.round((dCovered / totalDays) * 100) : 0;
  const hgPct = totalDays ? Math.round((hgCovered / totalDays) * 100) : 0;
  // Risiko: Wochenend-/Feiertagslücken wiegen doppelt (kritischer).
  const riskRaw = dGaps + hgGaps + weHolDGaps + weHolHgGaps;
  const riskScore = totalDays ? Math.max(0, Math.round(100 - (riskRaw / (totalDays * 2)) * 100)) : 100;

  return {
    days, totalDays, workdays, weekendHolidayDays,
    dCovered, hgCovered, dGaps, hgGaps, weHolDGaps, weHolHgGaps,
    dPct, hgPct, riskScore,
    fullDays: days.filter((d) => d.status === 'full').length,
    partialDays: days.filter((d) => d.status === 'partial').length,
    openDays: days.filter((d) => d.status === 'none').length,
  };
}

// ---------------------------------------------------------------------------
//  Abwesenheiten & Kapazität
// ---------------------------------------------------------------------------
export function computeAbsence(range) {
  const emps = employeesInRange(range);
  const perEmp = new Map(emps.map((e) => [e, {
    emp: e, meta: getEmpMeta(e), vac: 0, sick: 0, fza: 0, wb: 0, su: 0, total: 0, byCode: {},
  }]));

  let totalAbsenceDays = 0;
  const daySeries = []; // pro Werktag: gleichzeitige Abwesenheiten

  range.months.forEach(({ year, month }) => {
    for (const emp of emps) {
      const md = getMonthData(year, month);
      if (!md?.employees?.includes(emp)) continue;
      const s = buildProfileStats(year, month, emp);
      const row = perEmp.get(emp);
      ABSENCE_CODES.forEach((c) => {
        const v = s.stCounts[c] || 0;
        if (!v) return;
        row.byCode[c] = (row.byCode[c] || 0) + v;
      });
      const vac = VACATION_CODES.reduce((a, c) => a + (s.stCounts[c] || 0), 0);
      const sick = (s.stCounts['K'] || 0) + (s.stCounts['KK'] || 0);
      row.vac += vac;
      row.sick += sick;
      row.fza += s.stCounts['FZA'] || 0;
      row.wb += s.stCounts['WB'] || 0;
      row.total += vac + sick + (s.stCounts['FZA'] || 0) + (s.stCounts['WB'] || 0);
      totalAbsenceDays += vac + sick + (s.stCounts['FZA'] || 0) + (s.stCounts['WB'] || 0);
    }
  });

  // Gleichzeitige Abwesenheiten je Werktag (Kapazitäts-/Engpasssicht).
  eachDay(range, (ctx) => {
    if (!ctx.workday) return;
    const { year, month, day, md } = ctx;
    let present = 0, absent = 0;
    (md?.employees || []).forEach((emp) => {
      const cell = md.assignments?.[emp]?.[day] || {};
      const base = (cell.assignment || '').split('/')[0].trim();
      // Echte Abwesenheit = ABSENCE_CODES. Dienstfrei (F) ist KEINE Abwesenheit
      // (z. B. dienstfreier Folgetag nach Dienst) und wird konsistent zur
      // Tabelle/totalAbsenceDays nicht mitgezählt.
      const isAbs = !!base && ABSENCE_CODES.includes(base);
      if (isAbs) absent++; else present++;
    });
    const head = (md?.employees || []).length;
    daySeries.push({ year, month, day, wd: ctx.wd, present, absent, head, rate: head ? Math.round((absent / head) * 100) : 0 });
  });

  const rows = [...perEmp.values()].filter((r) => r.total > 0).sort((a, b) => b.total - a.total);
  const peak = daySeries.slice().sort((a, b) => b.absent - a.absent)[0] || null;

  return { rows, daySeries, totalAbsenceDays, peak, employees: emps };
}

// ---------------------------------------------------------------------------
//  Regelkonformität (Ruhezeiten, Folgetag-frei, Häufungen, Sonderregeln)
// ---------------------------------------------------------------------------
export function computeCompliance(range) {
  const findings = [];
  const emps = employeesInRange(range);

  // Pro Mitarbeitende über ALLE Monate des Zeitraums hinweg auswerten, damit
  // Ruhezeit- und Häufungsprüfungen an Monatsgrenzen nicht abreißen.
  emps.forEach((emp) => {
    let lastDuty = null; // { year, month, day, abs } – absoluter Tagesindex

    range.months.forEach(({ year, month }) => {
      const md = getMonthData(year, month);
      if (!md?.employees?.includes(emp)) return;
      const dim = daysInMonth(year, month);

      for (let d = 1; d <= dim; d++) {
        const cell = getCell(year, month, emp, d);
        const isDuty = cell.duty === 'D' || cell.duty === 'HG';

        // Ruhezeit: nach einem Bereitschaftsdienst (D) muss der Folgetag
        // dienstfrei sein (kein Arbeitsplatz/Dienst). Folgetag auch über die
        // Monatsgrenze hinweg prüfen.
        if (cell.duty === 'D') {
          const next = (d < dim)
            ? getCell(year, month, emp, d + 1)
            : getCell(month === 11 ? year + 1 : year, month === 11 ? 0 : month + 1, emp, 1);
          const nextBase = (next.assignment || '').split('/')[0].trim();
          const nextWorks = (nextBase && WORKPLACES.some((w) => w.code === nextBase)) || next.duty;
          if (nextWorks) {
            findings.push({ type: 'rest', severity: 'high', emp, year, month, day: d,
              text: `Ruhezeit verletzt: D am ${d}.${month + 1}. ohne dienstfreien Folgetag.` });
          }
        }

        // Dienst-Häufung: zwei Dienste innerhalb von <3 Tagen (auch über
        // Monatsgrenzen). Exakter Kalendertag-Index (UTC-Epochentage), damit
        // der Abstand auch über kurze Monate (z. B. 28.2.→1.3.) korrekt ist.
        if (isDuty) {
          const absDay = Math.round(Date.UTC(year, month, d) / 864e5);
          if (lastDuty && absDay - lastDuty.abs < 3) {
            findings.push({ type: 'cluster', severity: 'mid', emp, year, month, day: d,
              text: `Dienst-Häufung: ${emp} hat Dienste am ${lastDuty.day}.${lastDuty.month + 1}. und ${d}.${month + 1}. (< 3 Tage Abstand).` });
          }
          lastDuty = { year, month, day: d, abs: absDay };
        }

        // Sonderregel: Wochentags-Sperren für D.
        if (cell.duty === 'D') {
          const wd = weekday(year, month, d);
          if ((SPECIAL_RULES.noBdWeekdays[emp] || []).includes(wd)) {
            findings.push({ type: 'rule', severity: 'high', emp, year, month, day: d,
              text: `Sonderregel verletzt: ${emp} darf am ${DOW_LONG[wd]} keinen Bereitschaftsdienst leisten.` });
          }
        }

        // Qualifikation: HG nur durch Fachärzte; Wochenend-D nur durch Fachärzte.
        if (cell.duty === 'HG' && !isFacharzt(emp)) {
          findings.push({ type: 'qual', severity: 'high', emp, year, month, day: d,
            text: `Qualifikation: ${emp} (kein Facharzt) im Hintergrunddienst am ${d}.${month + 1}.` });
        }
        const wd = weekday(year, month, d);
        if (cell.duty === 'D' && (wd === 6 || wd === 0) && !isFacharzt(emp)) {
          findings.push({ type: 'qual', severity: 'high', emp, year, month, day: d,
            text: `Qualifikation: ${emp} (kein Facharzt) im Wochenend-Bereitschaftsdienst am ${d}.${month + 1}.` });
        }
      }
    });
  });

  const bySeverity = { high: 0, mid: 0, low: 0 };
  findings.forEach((f) => { bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1; });
  const byType = {};
  findings.forEach((f) => { byType[f.type] = (byType[f.type] || 0) + 1; });

  // Compliance-Score: 100 minus gewichtete Verstöße, geclamped.
  const penalty = bySeverity.high * 5 + bySeverity.mid * 2 + bySeverity.low * 1;
  const score = Math.max(0, 100 - penalty);

  return { findings, bySeverity, byType, score, employees: emps };
}

// ---------------------------------------------------------------------------
//  Prognose (Jahresend-Hochrechnung der Dienste)
// ---------------------------------------------------------------------------
export function computeForecast(year) {
  const fairness = computeDutyFairness(year, { uptoMonth: 11 });
  // Monate mit tatsächlichen DIENST-Daten ermitteln (nicht bloß Personal-
  // präsenz), damit die lineare Hochrechnung nicht zur Ist-Wiedergabe
  // kollabiert, wenn der Dienstplan personell das ganze Jahr abdeckt, künftige
  // Monate aber noch keine vergebenen Dienste enthalten.
  let monthsWithData = 0;
  for (let m = 0; m < 12; m++) {
    const md = getMonthData(year, m);
    if (!md?.employees?.length) continue;
    const dim = daysInMonth(year, m);
    let hasDuty = false;
    for (const emp of md.employees) {
      for (let d = 1; d <= dim && !hasDuty; d++) {
        const cell = md.assignments?.[emp]?.[d];
        if (cell && (cell.duty === 'D' || cell.duty === 'HG')) hasDuty = true;
      }
      if (hasDuty) break;
    }
    if (hasDuty) monthsWithData++;
  }
  const factor = monthsWithData > 0 ? 12 / monthsWithData : 1;

  const rows = fairness.rows.map((r) => {
    const projBd = Math.round(r.bd * factor);
    const projHg = Math.round(r.hg * factor);
    const projTotal = projBd + projHg;
    const yearTarget = Math.round((r.bdTarget / Math.max(1, r.activeMonths)) * 12);
    return {
      emp: r.emp, meta: r.meta, bd: r.bd, hg: r.hg, total: r.total,
      projBd, projHg, projTotal, yearTarget,
      projDelta: projBd - yearTarget,
    };
  });

  return { year, monthsWithData, factor, rows, team: fairness.team };
}

// Wunscherfüllungsrate über einen Zeitraum (erfüllte vs. eingetragene Wünsche).
export function computeWishFulfillment(range) {
  let wishes = 0, fulfilled = 0, violated = 0;
  range.months.forEach(({ year, month }) => {
    const md = getMonthData(year, month);
    if (!md?.employees?.length) return;
    const dim = daysInMonth(year, month);
    md.employees.forEach((emp) => {
      for (let d = 1; d <= dim; d++) {
        const cell = getCell(year, month, emp, d);
        if (!cell.wish) continue;
        wishes++;
        const hasDuty = cell.duty === 'D' || cell.duty === 'HG';
        if (cell.wish === 'NO_DUTY') { if (hasDuty) violated++; else fulfilled++; }
        else if (cell.wish === 'BD_WISH') { if (cell.duty === 'D') fulfilled++; }
        else if (cell.wish === 'HG_WISH') { if (cell.duty === 'HG') fulfilled++; }
      }
    });
  });
  const rate = wishes ? Math.round((fulfilled / wishes) * 100) : null;
  return { wishes, fulfilled, violated, rate };
}

// ---------------------------------------------------------------------------
//  Gemeinsame Formatierungs-Helfer (deutsche Konvention)
// ---------------------------------------------------------------------------
export const fmt = {
  dec1: (n) => (n ?? 0).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
  int: (n) => Math.round(n ?? 0).toLocaleString('de-DE'),
  signed1: (n) => {
    const v = Math.round((n ?? 0) * 10) / 10;
    return (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v).toLocaleString('de-DE', { maximumFractionDigits: 1 });
  },
  signedInt: (n) => {
    const v = Math.round(n ?? 0);
    return (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v);
  },
  pct: (n) => `${Math.round(n ?? 0)}%`,
};

// Ampel-Farbe für Score/Prozent (0–100, höher = besser).
export function scoreColor(v) {
  return v >= 85 ? '#22C55E' : v >= 65 ? '#F59E0B' : '#EF4444';
}

// ---------------------------------------------------------------------------
//  Zentrales Tooltip-Glossar (Auswertungs-Hub + Mitarbeitendenbereich)
// ---------------------------------------------------------------------------
//  Eine einzige, kuratierte Quelle für die erklärenden Mouse-Over-Texte aller
//  Fachbegriffe, Kennzahlen und Felder. Module verwenden ausschließlich diese
//  Definitionen (Konsistenz + Pflege an einer Stelle). HTML-Einsatz:
//    `<span data-tooltip="${TT.equityTotal}">…</span>`
//  Texte sind bewusst kompakt, aber fachlich präzise und in sich verständlich.
export const TT = {
  // — Zeitraum & Grundbegriffe —
  range: 'Betrachtungszeitraum aller Kennzahlen dieser Ansicht. Über die Pillen oben umschaltbar: Monat, Quartal, Jahr bis heute, Gesamtjahr, rollierende 12 Monate oder frei wählbar.',
  rangeMonth: 'Nur der aktuell im Planer gewählte Kalendermonat.',
  rangeQuarter: 'Das Kalenderquartal (3 Monate), in dem der gewählte Monat liegt.',
  rangeYtd: 'Jahr bis heute: vom Januar bis einschließlich des gewählten Monats.',
  rangeYear: 'Das vollständige Kalenderjahr (Januar–Dezember).',
  rangeRolling12: 'Die letzten 12 Monate rückwärts ab dem gewählten Monat – auch über den Jahreswechsel hinweg.',
  rangeCustom: 'Frei wählbarer Start- und Endmonat.',
  bd: 'Bereitschaftsdienst (D): diensthabende Person vor Ort. An jedem Kalendertag genau einmal zu besetzen.',
  hg: 'Hintergrunddienst (HG): rufbereiter Facharzt-Hintergrund. An jedem Kalendertag genau einmal zu besetzen; nur durch Fachärztinnen/Fachärzte.',
  duty: 'Dienst = Bereitschaftsdienst (D) und Hintergrunddienst (HG) zusammengefasst.',
  facharzt: 'Fachärztin/Facharzt – qualifiziert für Hintergrunddienst (HG) und Wochenend-Bereitschaftsdienst.',
  assistenz: 'Assistenzärztin/Assistenzarzt in Weiterbildung – leistet Bereitschaftsdienst (D), aber keinen Hintergrunddienst.',
  fte: 'Vollzeitäquivalent (Stellenanteil). 1,0 = Vollzeit. Dienstziele werden FTE-gewichtet, damit Teilzeitkräfte anteilig weniger Dienste tragen.',

  // — Abdeckung & Risiko —
  coverage: 'Anteil der Kalendertage im Zeitraum, an denen Bereitschafts- (D) bzw. Hintergrunddienst (HG) besetzt ist.',
  dPct: 'Anteil der Tage mit besetztem Bereitschaftsdienst (D) am Zeitraum.',
  hgPct: 'Anteil der Tage mit besetztem Hintergrunddienst (HG) am Zeitraum.',
  openDays: 'Tage komplett ohne Dienstbesetzung – weder D noch HG vergeben. Höchste Priorität.',
  partialDays: 'Tage, an denen nur einer der beiden Dienste (D oder HG) besetzt ist.',
  fullDays: 'Tage mit vollständiger Besetzung von Bereitschafts- und Hintergrunddienst.',
  weHolGaps: 'Unbesetzte Dienste an Wochenenden und gesetzlichen Feiertagen – besonders kritisch und im Risiko-Index doppelt gewichtet.',
  riskScore: 'Versorgungs-Risiko-Index 0–100 (höher = sicherer). 100 minus gewichtete Dienstlücken; Wochenend-/Feiertagslücken zählen doppelt.',

  // — Fairness —
  fairness: 'Verteilungsgerechtigkeit der Dienstlast über das Team, FTE-gewichtet und gegen das individuelle Soll gemessen.',
  equityTotal: 'Equity-Index 0–100 für die gesamte Dienstlast (D+HG). 100 = perfekt gleichmäßige, FTE-gerechte Verteilung; niedrige Werte = einzelne tragen deutlich mehr/weniger als ihr Soll.',
  equityBd: 'Equity-Index 0–100 nur für Bereitschaftsdienste (D).',
  equityHg: 'Equity-Index 0–100 nur für Hintergrunddienste (HG), bezogen auf die dienstfähigen Fachärzte.',
  soll: 'Soll: FTE-gewichteter Erwartungswert an Diensten für den Zeitraum – der faire Anteil dieser Person an der Gesamtlast.',
  ist: 'Ist: tatsächlich geleistete Dienste im Zeitraum.',
  delta: 'Abweichung Ist − Soll. Positiv = mehr Dienste als der faire Anteil, negativ = weniger.',
  spread: 'Spannweite: Differenz zwischen der höchsten und der niedrigsten Dienstzahl im Team.',
  weekendDuties: 'Dienste an Wochenenden und Feiertagen – die belastendsten Einsätze, separat auf Gerechtigkeit geprüft.',

  // — Abwesenheiten —
  absence: 'Erfasste Abwesenheitstage: Urlaub, Krankheit, Freizeitausgleich (FZA) und Weiterbildung (WB).',
  vac: 'Urlaubstage (inkl. urlaubsähnlicher Codes) im Zeitraum.',
  sick: 'Krankheitstage (K) und Kind-krank (KK) im Zeitraum.',
  fza: 'Freizeitausgleich – Abbau geleisteter Mehrarbeit.',
  wb: 'Weiterbildung / Fortbildung – planmäßige Abwesenheit zur Qualifizierung.',
  absencePeak: 'Spitzentag: höchste Zahl gleichzeitig abwesender Personen – maßgeblich für Engpass-Risiken.',
  absenceRate: 'Anteil gleichzeitig abwesender Personen an der Belegschaft des Tages.',

  // — Regelkonformität —
  compliance: 'Einhaltung der Dienstregeln: Ruhezeiten, Dienstabstände, Qualifikation und personenbezogene Sonderregeln.',
  complianceScore: 'Regelkonformitäts-Score 0–100 (höher = besser). 100 minus gewichtete Verstöße: kritisch −5, mittel −2, gering −1.',
  findingRest: 'Ruhezeit-Verstoß: nach einem Bereitschaftsdienst (D) muss der Folgetag dienst- und arbeitsplatzfrei sein.',
  findingCluster: 'Dienst-Häufung: zwei Dienste mit weniger als 3 Tagen Abstand – auch über Monatsgrenzen geprüft.',
  findingQual: 'Qualifikations-Verstoß: HG bzw. Wochenend-Bereitschaftsdienst nur durch Fachärztinnen/Fachärzte.',
  findingRule: 'Sonderregel-Verstoß: personenbezogene Wochentags-Sperre für den Bereitschaftsdienst missachtet.',
  sevHigh: 'Kritischer Befund – verletzt harte Vorgaben (Ruhezeit, Qualifikation, Sonderregel).',
  sevMid: 'Mittlerer Befund – Belastungs-/Häufungshinweis ohne harte Regelverletzung.',

  // — Prognose & Wünsche —
  forecast: 'Lineare Hochrechnung der Dienste auf das Jahresende anhand der bislang mit Diensten gefüllten Monate.',
  projTotal: 'Erwartete Gesamtdienste zum Jahresende bei gleichbleibendem Tempo.',
  yearTarget: 'Auf das Gesamtjahr hochgerechnetes, FTE-gewichtetes Dienst-Soll.',
  projDelta: 'Erwartete Jahresabweichung: Prognose minus Jahres-Soll.',
  wishRate: 'Wunscherfüllungsrate: Anteil der eingetragenen Dienstwünsche, die der Plan erfüllt.',
  wishViolated: 'Verletzte „Kein Dienst"-Wünsche: an einem Wunschtag wurde dennoch ein Dienst zugeteilt.',

  // — Jahresgitter & Kurven —
  yeargrid: 'Monats-Heatmap: Dienste je Person und Monat über das Jahr. Farbe = Abweichung vom Monats-Kollegiums-Durchschnitt.',
  yeargridMean: 'Monatlicher Kollegiums-Durchschnitt der Dienste – Bezugswert für die Heatmap-Einfärbung.',
  curve: 'Verlaufskurve: Entwicklung der kumulierten Dienste je Person über die Monate.',

  // — Mitarbeitendenbereich —
  empActive: 'Mitarbeitende mit mindestens einem erfassten Aktivitätsmonat im Jahr.',
  empActiveMonths: 'Zahl der Monate im Jahr, in denen für diese Person Plandaten vorliegen.',
  workdays: 'Werktage im Monat: Mo–Fr ohne gesetzliche Feiertage (Sachsen).',
  utilization: 'Auslastung: Anteil der verplanten Tage (Arbeitsplatz, Dienst oder Status) an den möglichen Tagen.',
};
