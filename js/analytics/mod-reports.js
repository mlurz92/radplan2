// ===========================================================================
//  Auswertungs-Hub · Modul „Berichtszentrum"
// ---------------------------------------------------------------------------
//  Vorkonfigurierte Exporte (CSV · Excel · PDF) für Übergabe und Archiv.
//  Alle Generatoren sind tolerant: fehlt eine CDN-Bibliothek (jsPDF/SheetJS)
//  oder gibt es keine Daten, wird der jeweilige Knopf deaktiviert bzw. eine
//  Hinweiszeile gezeigt – die Anwendung bleibt funktionsfähig.
// ===========================================================================

import {
  computeDutyFairness, computeAbsence, computeCoverage,
  buildYearlyStats, getMonthData, employeesInRange,
  getEmpMeta, daysInMonth, weekday, getSaxonyHolidaysCached, isHoliday,
  MONTHS, MONTHS_SHORT, DOW_ABBR, TT,
} from './engine.js';

// HTML-Attribut-sicheres Escaping für Tooltip-Texte.
const escAttr = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg>';

// --- Hilfen ------------------------------------------------------------------
const hasJsPDF = () => !!(window.jspdf && window.jspdf.jsPDF);

function csvEscape(v) {
  const s = String(v ?? '');
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
// CSV mit deutschem Trennzeichen ";" + UTF-8 BOM (Excel-kompatibel).
function downloadCSV(rows, filename) {
  const text = '﻿' + rows.map((r) => r.map(csvEscape).join(';')).join('\r\n');
  downloadBlob(text, filename, 'text/csv;charset=utf-8');
}
// Komma-Dezimal für CSV-Zahlen.
const num = (n) => String(n ?? 0).replace('.', ',');

function newPdf() {
  const { jsPDF } = window.jspdf;
  return new jsPDF({ unit: 'pt', format: 'a4' });
}
function pdfHeader(doc, title, sub) {
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
  doc.text(title, 40, 46);
  if (sub) { doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(120); doc.text(sub, 40, 62); doc.setTextColor(0); }
}

let statusEl = null;
function setStatus(msg, ok = true) {
  if (!statusEl) return;
  statusEl.textContent = msg;
  statusEl.style.color = ok ? '#15803D' : '#B91C1C';
}

export default {
  id: 'reports',
  label: 'Berichte',
  usesRange: true,
  icon: ICON,

  render(root, ctx) {
    const range = ctx.range;
    const year = ctx.year;
    const emps = employeesInRange(range);
    const pdfOk = hasJsPDF();
    const pdfNote = pdfOk ? '' : ' <span class="rep-missing">(PDF-Bibliothek nicht geladen)</span>';
    const empOptions = emps.map((e) => `<option value="${e}">${e}</option>`).join('');

    root.innerHTML = `
      <div class="ah-section-title" data-tooltip="Vorkonfigurierte Exporte (CSV, Excel, PDF) für Dienstübergabe und Archiv. Der Bezugszeitraum entspricht der oben gewählten Zeitraum-Pille.">Berichtszentrum <span class="ah-sub" data-tooltip="${escAttr(TT.range)}">— Bezug: ${range.label}</span></div>
      <div class="rep-grid">

        <div class="ah-card rep-card">
          <div class="rep-card-title" data-tooltip="PDF-Tabelle mit der tagesgenauen Besetzung von Bereitschafts- (D) und Hintergrunddienst (HG) des Monats; Feiertage markiert.">Monats-Dienstplan (PDF)</div>
          <div class="rep-card-desc">Tagesweise Belegung von <span data-tooltip="${escAttr(TT.bd)}">Bereitschafts- (D)</span> und <span data-tooltip="${escAttr(TT.hg)}">Hintergrunddienst (HG)</span> für ${MONTHS[range.months[0].month]} ${range.months[0].year}.${pdfNote}</div>
          <div class="rep-actions">
            <button type="button" class="mbtn mbtn-primary" data-rep="duty-pdf" ${pdfOk ? '' : 'disabled'}>PDF erzeugen</button>
          </div>
        </div>

        <div class="ah-card rep-card">
          <div class="rep-card-title" data-tooltip="${escAttr(TT.fairness)}">Jahres-Fairness</div>
          <div class="rep-card-desc"><span data-tooltip="${escAttr(TT.fte)}">FTE-gewichtete</span> Dienstverteilung ${year}: BD, HG, WE/Feiertage, <span data-tooltip="${escAttr(TT.soll)} ${escAttr(TT.ist)}">Soll/Ist</span>, <span data-tooltip="${escAttr(TT.delta)}">Fair-Abweichung</span>, Status.</div>
          <div class="rep-actions">
            <button type="button" class="mbtn mbtn-ghost" data-rep="fairness-csv">CSV</button>
            <button type="button" class="mbtn mbtn-ghost" data-rep="fairness-xlsx">Excel</button>
          </div>
        </div>

        <div class="ah-card rep-card">
          <div class="rep-card-title" data-tooltip="${escAttr(TT.absence)}">Abwesenheitsübersicht (CSV)</div>
          <div class="rep-card-desc"><span data-tooltip="${escAttr(TT.vac)}">Urlaub</span>, <span data-tooltip="${escAttr(TT.sick)}">Krank</span>, <span data-tooltip="${escAttr(TT.fza)}">FZA</span>, <span data-tooltip="${escAttr(TT.wb)}">Weiterbildung</span> je Mitarbeitende im Zeitraum.</div>
          <div class="rep-actions">
            <button type="button" class="mbtn mbtn-ghost" data-rep="absence-csv">CSV</button>
          </div>
        </div>

        <div class="ah-card rep-card">
          <div class="rep-card-title" data-tooltip="${escAttr(TT.coverage)}">Abdeckungsbericht (CSV)</div>
          <div class="rep-card-desc">Zusammenfassung der Dienstabdeckung plus Liste aller <span data-tooltip="${escAttr(TT.openDays)}">Tage mit Lücken</span>.</div>
          <div class="rep-actions">
            <button type="button" class="mbtn mbtn-ghost" data-rep="coverage-csv">CSV</button>
          </div>
        </div>

        <div class="ah-card rep-card rep-card-wide">
          <div class="rep-card-title" data-tooltip="Persönliche Jahresübersicht einer Person als PDF: Monatswerte für Aktivtage, Urlaub, Krank sowie Bereitschafts- und Hintergrunddienste mit Jahressummen.">Mitarbeitenden-Eigenbeleg (PDF)</div>
          <div class="rep-card-desc">Persönliche Jahresübersicht ${year}: Monatswerte (Aktiv, Urlaub, Krank, D, HG) mit Summen.${pdfNote}</div>
          <div class="rep-actions">
            <label class="rep-select-label" for="rep-emp-select" data-tooltip="Person, für die der Eigenbeleg erzeugt wird. Auswahl umfasst alle im Zeitraum erfassten Mitarbeitenden.">Person:</label>
            <select class="text-input rep-select" id="rep-emp-select" aria-label="Person für Eigenbeleg">${empOptions || '<option>—</option>'}</select>
            <button type="button" class="mbtn mbtn-primary" data-rep="person-pdf" ${pdfOk && emps.length ? '' : 'disabled'}>PDF erzeugen</button>
          </div>
        </div>

      </div>
      <div class="rep-status" id="rep-status" role="status" aria-live="polite"></div>
    `;

    statusEl = root.querySelector('#rep-status');

    const handlers = {
      'fairness-csv': () => exportFairnessCSV(year),
      'fairness-xlsx': () => exportFairnessXLSX(year),
      'absence-csv': () => exportAbsenceCSV(range),
      'coverage-csv': () => exportCoverageCSV(range),
      'duty-pdf': () => exportDutyPDF(range),
      'person-pdf': () => exportPersonPDF(root.querySelector('#rep-emp-select')?.value, year),
    };

    root.querySelectorAll('[data-rep]').forEach((btn) => {
      btn.addEventListener('click', () => {
        try { handlers[btn.dataset.rep]?.(); }
        catch (err) { console.error(err); setStatus('Fehler beim Erzeugen des Berichts.', false); }
      });
    });
  },

  dispose() { statusEl = null; },
};

// --- CSV-Berichte ------------------------------------------------------------
function exportFairnessCSV(year) {
  const { rows } = computeDutyFairness(year);
  if (!rows.length) return setStatus('Keine Fairness-Daten vorhanden.', false);
  const out = [['Mitarbeitende', 'BD', 'HG', 'Gesamt', 'WE/FT', 'Feiertage', 'Soll BD', 'Delta Soll', 'Fair-Delta', 'Status']];
  rows.forEach((r) => out.push([
    r.emp, r.bd, r.hg, r.total, r.weekendDuties, r.holidayDuties,
    num(r.bdTarget), num(r.bdDelta), num(Math.round(r.totalDev * 10) / 10),
    r.status === 'over' ? 'Über' : r.status === 'under' ? 'Unter' : 'Fair',
  ]));
  downloadCSV(out, `radplan_fairness_${year}.csv`);
  setStatus(`Jahres-Fairness ${year} als CSV exportiert (${rows.length} Mitarbeitende).`);
}

async function exportFairnessXLSX(year) {
  const { rows } = computeDutyFairness(year);
  if (!rows.length) return setStatus('Keine Fairness-Daten vorhanden.', false);
  const aoa = [['Mitarbeitende', 'BD', 'HG', 'Gesamt', 'WE/FT', 'Feiertage', 'Soll BD', 'Δ Soll', 'Fair-Δ', 'Status']];
  rows.forEach((r) => aoa.push([
    r.emp, r.bd, r.hg, r.total, r.weekendDuties, r.holidayDuties,
    r.bdTarget, r.bdDelta, Math.round(r.totalDev * 10) / 10,
    r.status === 'over' ? 'Über' : r.status === 'under' ? 'Unter' : 'Fair',
  ]));
  try {
    setStatus('Excel-Bibliothek wird geladen…');
    const XLSX = await import('https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs');
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Fairness ${year}`);
    XLSX.writeFile(wb, `radplan_fairness_${year}.xlsx`);
    setStatus(`Jahres-Fairness ${year} als Excel exportiert.`);
  } catch (err) {
    console.warn('SheetJS nicht verfügbar, weiche auf CSV aus:', err);
    exportFairnessCSV(year);
    setStatus('Excel nicht verfügbar – stattdessen CSV exportiert.', false);
  }
}

function exportAbsenceCSV(range) {
  const { rows } = computeAbsence(range);
  if (!rows.length) return setStatus('Keine Abwesenheiten im Zeitraum.', false);
  const out = [['Mitarbeitende', 'Urlaub', 'Krank', 'FZA', 'Weiterbildung', 'Gesamt']];
  rows.forEach((r) => out.push([r.emp, r.vac, r.sick, r.fza, r.wb, r.total]));
  downloadCSV(out, `radplan_abwesenheiten_${range.key}_${range.year}.csv`);
  setStatus(`Abwesenheitsübersicht exportiert (${rows.length} Mitarbeitende).`);
}

function exportCoverageCSV(range) {
  const cov = computeCoverage(range);
  const out = [
    ['Abdeckungsbericht', range.label],
    ['D besetzt', `${cov.dCovered}/${cov.totalDays}`, `${cov.dPct}%`],
    ['HG besetzt', `${cov.hgCovered}/${cov.totalDays}`, `${cov.hgPct}%`],
    ['Offene Tage (beide unbesetzt)', cov.openDays],
    ['WE/Feiertagslücken', cov.weHolDGaps + cov.weHolHgGaps],
    ['Risiko-Index', cov.riskScore],
    [],
    ['Datum', 'Wochentag', 'Fehlt'],
  ];
  cov.days.filter((d) => d.status !== 'full').forEach((d) => {
    const fehlt = !d.hasD && !d.hasHG ? 'D + HG' : !d.hasD ? 'D' : 'HG';
    out.push([`${d.day}.${d.month + 1}.${d.year}`, DOW_ABBR[d.wd] + (d.holiday ? ' (Feiertag)' : ''), fehlt]);
  });
  downloadCSV(out, `radplan_abdeckung_${range.key}_${range.year}.csv`);
  setStatus(`Abdeckungsbericht exportiert (${cov.openDays + cov.partialDays} Lückentage).`);
}

// --- PDF-Berichte ------------------------------------------------------------
function exportDutyPDF(range) {
  if (!hasJsPDF()) return setStatus('PDF-Bibliothek nicht verfügbar.', false);
  const { year, month } = range.months[0];
  const md = getMonthData(year, month);
  if (!md?.employees?.length) return setStatus('Keine Daten für diesen Monat.', false);
  const dim = daysInMonth(year, month);
  const hols = getSaxonyHolidaysCached(year);

  const body = [];
  for (let d = 1; d <= dim; d++) {
    let dO = '—', hO = '—';
    md.employees.forEach((emp) => {
      const cell = md.assignments?.[emp]?.[d];
      if (cell?.duty === 'D') dO = emp;
      if (cell?.duty === 'HG') hO = emp;
    });
    const wd = weekday(year, month, d);
    const mark = isHoliday(year, month, d, hols) ? ' *' : '';
    body.push([`${d}. ${DOW_ABBR[wd]}${mark}`, dO, hO]);
  }

  const doc = newPdf();
  pdfHeader(doc, `Dienstplan ${MONTHS[month]} ${year}`, 'Bereitschafts- (D) und Hintergrunddienst (HG) · * = Feiertag');
  doc.autoTable({
    startY: 78,
    head: [['Tag', 'Bereitschaftsdienst (D)', 'Hintergrunddienst (HG)']],
    body,
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [14, 165, 233] },
    alternateRowStyles: { fillColor: [245, 247, 250] },
  });
  doc.save(`radplan_dienstplan_${year}-${String(month + 1).padStart(2, '0')}.pdf`);
  setStatus(`Dienstplan ${MONTHS[month]} ${year} als PDF erzeugt.`);
}

function exportPersonPDF(emp, year) {
  if (!hasJsPDF()) return setStatus('PDF-Bibliothek nicht verfügbar.', false);
  if (!emp) return setStatus('Bitte eine Person auswählen.', false);
  const ys = buildYearlyStats(emp, year);
  const meta = getEmpMeta(emp);

  const VAC = ['U', 'ZU', 'SU', '§15c'];
  const body = ys.months.map((mon) => {
    const vac = VAC.reduce((a, c) => a + (mon.stCounts?.[c] || 0), 0);
    const sick = (mon.stCounts?.['K'] || 0) + (mon.stCounts?.['KK'] || 0);
    return [
      MONTHS_SHORT[mon.m],
      mon.hasData ? (mon.totalActive || 0) : '—',
      vac || '—', sick || '—',
      mon.dutyD || '—', mon.dutyHG || '—',
    ];
  });
  const t = ys.totals;
  const foot = [['Gesamt', t.totalActive || 0, t.vacationDays || 0, t.sickDays || 0, t.dutyD || 0, t.dutyHG || 0]];

  const doc = newPdf();
  pdfHeader(doc, `Eigenbeleg ${year} — ${meta.fullName !== emp ? meta.fullName : emp}`,
    `${meta.posLabel || ''}${meta.area ? ' · ' + meta.area : ''}`);
  doc.autoTable({
    startY: 78,
    head: [['Monat', 'Aktiv', 'Urlaub', 'Krank', 'D', 'HG']],
    body, foot,
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [14, 165, 233] },
    footStyles: { fillColor: [226, 232, 240], textColor: 20, fontStyle: 'bold' },
  });
  doc.save(`radplan_eigenbeleg_${emp.replace(/[^\wäöüÄÖÜ]+/g, '_')}_${year}.pdf`);
  setStatus(`Eigenbeleg für ${emp} (${year}) als PDF erzeugt.`);
}
