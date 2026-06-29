// ===========================================================================
//  RadPlan · Auswertungs-Hub · Modul „Prognose & Planung"
// ---------------------------------------------------------------------------
//  Lineare Jahresend-Hochrechnung der Dienste je Mitarbeitende sowie die
//  Wunscherfüllungsrate des Gesamtjahres. Visualisiert, wo jede Person zum
//  Jahresende voraussichtlich landet (Ist vs. Prognose vs. Jahresziel).
//  Importiert ausschließlich aus ./engine.js. Bezug: Gesamtjahr (ctx.year).
// ===========================================================================

import {
  computeForecast, computeWishFulfillment, getRange, fmt, scoreColor, TT,
} from './engine.js';

// HTML-Escape für Texte/Attribute.
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

let _root = null;
let _chart = null;

export default {
  id: 'forecast',
  label: 'Prognose & Planung',
  usesRange: false,
  icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>',

  render(root, ctx) {
    _root = root;
    if (_chart) { try { _chart.destroy(); } catch (e) { /* noop */ } _chart = null; }

    const year = ctx?.year ?? new Date().getFullYear();
    const fc = computeForecast(year);
    const wf = computeWishFulfillment(getRange('year', year, ctx?.month));

    const rateTxt = wf.rate == null ? '—' : fmt.pct(wf.rate);

    const parts = [];

    // Bezugshinweis.
    parts.push(`<div class="fc-scope" data-tooltip="${esc(TT.forecast)}">Bezug: Gesamtjahr ${esc(year)}</div>`);

    // ---- KPIs ------------------------------------------------------------
    parts.push('<div class="ah-kpi-grid">');
    parts.push(kpi('Datenmonate', `${fc.monthsWithData}/12`, 'Monate mit Plandaten',
      'Anzahl der Monate, in denen bereits Dienste vergeben sind. Basis der linearen Hochrechnung.'));
    parts.push(kpi('Hochrechnungsfaktor', `× ${fmt.dec1(fc.factor)}`, 'lineare Skalierung',
      'Skalierungsfaktor 12 geteilt durch die Anzahl der Datenmonate. Rechnet die bisherigen Dienste linear auf das Gesamtjahr hoch.'));
    parts.push(kpi(
      'Wunscherfüllung',
      `<span style="color:${wf.rate == null ? 'var(--text-faint)' : scoreColor(wf.rate)}">${rateTxt}</span>`,
      `${fmt.int(wf.fulfilled)} von ${fmt.int(wf.wishes)} Wünschen`,
      TT.wishRate,
    ));
    parts.push(kpi(
      'Verletzte Wünsche',
      `<span style="color:${wf.violated > 0 ? '#EF4444' : '#22C55E'}">${fmt.int(wf.violated)}</span>`,
      'nicht erfüllbare Sperrwünsche',
      TT.wishViolated,
    ));
    parts.push('</div>');

    // ---- Leerer Zustand --------------------------------------------------
    if (!fc.rows.length) {
      parts.push('<div class="ah-empty">Keine Plandaten für dieses Jahr vorhanden – keine Prognose möglich.</div>');
      root.innerHTML = parts.join('');
      return;
    }

    // ---- Tabelle: Jahresend-Prognose je Mitarbeitende -------------------
    parts.push(`<div class="ah-section-title" data-tooltip="${esc(TT.forecast)}">Jahresend-Prognose je Mitarbeitende</div>`);

    // Maximalwert für die Balken-Skalierung (Ist/Prognose/Ziel berücksichtigt).
    const max = Math.max(1, ...fc.rows.map((r) => Math.max(r.bd, r.projBd, r.yearTarget)));

    parts.push('<div class="ah-table-wrap"><table class="ah-table"><thead><tr>');
    [
      ['Mitarbeitende', 'Name der dienstfähigen Person (Fachärztinnen/Fachärzte und Assistenz). Klick auf die Zeile öffnet das Profil.'],
      ['Ist BD', TT.bd],
      ['Ist HG', TT.hg],
      ['Ist gesamt', TT.duty],
      ['Prognose BD', 'Auf das Jahresende hochgerechnete Bereitschaftsdienste (D) bei gleichbleibendem Tempo.'],
      ['Prognose gesamt', TT.projTotal],
      ['Jahresziel BD', TT.yearTarget],
      ['Δ Prognose', TT.projDelta],
      ['Landung (BD)', 'Balkenvergleich Ist gegen Prognose der Bereitschaftsdienste mit Markierung des Jahresziels.'],
    ].forEach(([h, tip]) => parts.push(`<th data-tooltip="${esc(tip)}">${esc(h)}</th>`));
    parts.push('</tr></thead><tbody>');

    fc.rows.forEach((r) => {
      const dColor = r.projDelta > 0 ? '#EF4444' : r.projDelta < 0 ? '#3B82F6' : 'var(--text-2)';
      parts.push(`<tr class="clickable" data-emp="${esc(r.emp)}">`);
      parts.push(`<td>${esc(r.emp)}</td>`);
      parts.push(`<td>${fmt.int(r.bd)}</td>`);
      parts.push(`<td>${fmt.int(r.hg)}</td>`);
      parts.push(`<td>${fmt.int(r.total)}</td>`);
      parts.push(`<td>${fmt.int(r.projBd)}</td>`);
      parts.push(`<td>${fmt.int(r.projTotal)}</td>`);
      parts.push(`<td>${fmt.int(r.yearTarget)}</td>`);
      parts.push(`<td style="color:${dColor};font-weight:700">${fmt.signedInt(r.projDelta)}</td>`);
      parts.push(`<td>${dualBar(r, max)}</td>`);
      parts.push('</tr>');
    });
    parts.push('</tbody></table></div>');

    // Legende der Balken.
    parts.push('<div class="fc-legend">'
      + `<span class="fc-legend-item" data-tooltip="${esc(TT.bd)}"><span class="fc-swatch fc-swatch-ist"></span>Ist BD</span>`
      + '<span class="fc-legend-item" data-tooltip="Auf das Jahresende hochgerechnete Bereitschaftsdienste (D) bei gleichbleibendem Tempo."><span class="fc-swatch fc-swatch-proj"></span>Prognose BD</span>'
      + `<span class="fc-legend-item" data-tooltip="${esc(TT.yearTarget)}"><span class="fc-swatch fc-swatch-target"></span>Jahresziel BD</span>`
      + '</div>');

    // ---- Optionales Chart.js-Diagramm -----------------------------------
    if (typeof Chart !== 'undefined') {
      parts.push(`<div class="ah-section-title" data-tooltip="Balkendiagramm je Person: tatsächliche Bereitschaftsdienste, Jahres-Hochrechnung und FTE-gewichtetes Jahresziel im Vergleich.">Ist · Prognose · Ziel je Mitarbeitende</div>`);
      parts.push('<div class="ah-card"><div class="fc-chart-wrap"><canvas id="fc-chart"></canvas></div></div>');
    }

    // ---- Erläuternder Hinweis -------------------------------------------
    parts.push(`<div class="fc-note">Lineare Hochrechnung auf Basis von ${fc.monthsWithData} Datenmonaten.</div>`);

    root.innerHTML = parts.join('');

    // Zeilen-Klick → Profil öffnen.
    root.querySelectorAll('tr.clickable[data-emp]').forEach((tr) => {
      tr.addEventListener('click', () => {
        const emp = tr.getAttribute('data-emp');
        if (emp && typeof ctx?.openProfile === 'function') ctx.openProfile(emp);
      });
    });

    // Chart aufbauen.
    if (typeof Chart !== 'undefined') {
      const canvas = root.querySelector('#fc-chart');
      if (canvas) {
        const labels = fc.rows.map((r) => r.emp);
        const css = getComputedStyle(document.documentElement);
        const grid = (css.getPropertyValue('--gray-200') || 'rgba(148,163,184,.3)').trim();
        const text = (css.getPropertyValue('--text-2') || '#64748b').trim();
        _chart = new Chart(canvas.getContext('2d'), {
          type: 'bar',
          data: {
            labels,
            datasets: [
              { label: 'Ist BD', data: fc.rows.map((r) => r.bd), backgroundColor: '#3B82F6' },
              { label: 'Prognose BD', data: fc.rows.map((r) => r.projBd), backgroundColor: 'rgba(59,130,246,.45)' },
              { label: 'Jahresziel BD', data: fc.rows.map((r) => r.yearTarget), backgroundColor: '#94A3B8' },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { labels: { color: text, font: { size: 11 } } } },
            scales: {
              x: { ticks: { color: text, font: { size: 10 } }, grid: { color: grid } },
              y: { beginAtZero: true, ticks: { color: text }, grid: { color: grid } },
            },
          },
        });
      }
    }
  },

  dispose() {
    if (_chart) { try { _chart.destroy(); } catch (e) { /* noop */ } _chart = null; }
    _root = null;
  },
};

// ---------------------------------------------------------------------------
//  Bausteine
// ---------------------------------------------------------------------------
function kpi(label, value, sub, tip) {
  const tipAttr = tip ? ` data-tooltip="${esc(tip)}"` : '';
  return `<div class="ah-kpi"><div class="ah-kpi-label"${tipAttr}>${esc(label)}</div>`
    + `<div class="ah-kpi-value">${value}</div>`
    + `<div class="ah-kpi-sub">${esc(sub)}</div></div>`;
}

// Dualer Balken: Ist (solid) vs. Prognose (heller, gestreift) mit Ziel-Marker.
function dualBar(r, max) {
  const istW = Math.max(0, Math.min(100, (r.bd / max) * 100));
  const projW = Math.max(0, Math.min(100, (r.projBd / max) * 100));
  const tgtL = Math.max(0, Math.min(100, (r.yearTarget / max) * 100));
  const over = r.projDelta > 0;
  return `<div class="fc-bars" data-tooltip="Ist BD ${fmt.int(r.bd)} · Prognose BD ${fmt.int(r.projBd)} · Ziel ${fmt.int(r.yearTarget)}">`
    + `<div class="fc-bar fc-bar-ist" style="width:${istW}%"></div>`
    + `<div class="fc-bar fc-bar-proj${over ? ' fc-bar-over' : ''}" style="width:${projW}%"></div>`
    + `<div class="fc-target" style="left:${tgtL}%"></div>`
    + '</div>';
}
