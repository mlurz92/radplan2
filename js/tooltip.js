/**
 * RadPlan — Globaler, schwebender Hilfe-Tooltip (data-tooltip).
 *
 * Liest das Attribut `data-tooltip` eines beliebigen Elements und zeigt beim
 * Überfahren (Maus) bzw. Fokussieren (Tastatur) eine erklärende Sprechblase.
 * Im Gegensatz zur rein CSS-basierten Variante (::after) wird die Blase an
 * <body> gehängt und intelligent positioniert — dadurch wird sie in
 * scrollbaren Containern (Auswertungs-Hub, Mitarbeitendenbereich) niemals
 * abgeschnitten und liegt zuverlässig über allen Modalebenen.
 *
 * Konventionen:
 *   - `data-tooltip="…"`            : Inhalt der Sprechblase (Klartext).
 *   - `data-tooltip-pos="bottom"`   : bevorzugte Platzierung unterhalb des
 *                                     Ankers (sonst automatisch oben/unten).
 *
 * Touch-Geräte: Tooltips sind reine Maus-/Tastatur-Hilfe und werden bei
 * grobem Zeiger (pointer: coarse) unterdrückt, um Tap-Interaktionen nicht zu
 * stören.
 */

let tipEl = null;
let currentAnchor = null;
let showTimer = null;
let hideTimer = null;

const SHOW_DELAY = 340;
const HIDE_DELAY = 80;
const MARGIN = 10;

function ensureTip() {
  if (tipEl) return tipEl;
  tipEl = document.createElement('div');
  tipEl.className = 'rp-tip';
  tipEl.setAttribute('role', 'tooltip');
  tipEl.setAttribute('aria-hidden', 'true');
  tipEl.hidden = true;
  document.body.appendChild(tipEl);
  return tipEl;
}

function isCoarsePointer() {
  return window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
}

function place(anchor, preferBottom) {
  const tip = tipEl;
  if (!tip) return;
  const r = anchor.getBoundingClientRect();
  tip.style.visibility = 'hidden';
  tip.hidden = false;
  const tw = tip.offsetWidth;
  const th = tip.offsetHeight;

  // Horizontal zentriert über dem Anker, aber innerhalb des Viewports gehalten.
  let left = r.left + r.width / 2 - tw / 2;
  left = Math.max(MARGIN, Math.min(left, window.innerWidth - tw - MARGIN));

  const spaceAbove = r.top;
  const spaceBelow = window.innerHeight - r.bottom;
  let below = preferBottom;
  // Automatik: dorthin, wo Platz ist; bevorzugte Seite nur, wenn sie passt.
  if (preferBottom && spaceBelow < th + MARGIN && spaceAbove > spaceBelow) below = false;
  if (!preferBottom && spaceAbove < th + MARGIN && spaceBelow > spaceAbove) below = true;

  let top = below ? r.bottom + 8 : r.top - th - 8;
  top = Math.max(MARGIN, Math.min(top, window.innerHeight - th - MARGIN));

  // Pfeil horizontal auf die Ankermitte ausrichten (relativ zur Blase).
  const arrowX = Math.max(12, Math.min(tw - 12, r.left + r.width / 2 - left));
  tip.style.setProperty('--rp-tip-arrow', `${arrowX}px`);
  tip.classList.toggle('rp-tip-below', below);

  tip.style.left = `${Math.round(left)}px`;
  tip.style.top = `${Math.round(top)}px`;
  tip.style.visibility = '';
}

function formatTooltipHtml(text) {
  if (!text) return '';
  return text.split(/\r?\n/).map(line => line.trim()).join('<br>');
}

export function getKpiInterpretation(label, valueText) {
  if (!label || !valueText) return '';

  const cleanedValText = valueText.trim().replace('%', '').replace('×', '').trim();
  const valNum = parseFloat(cleanedValText);

  let statusClass = 'rp-tip-status-info';
  let statusText = 'Info';
  let desc = '';

  const labelLower = label.toLowerCase();

  if (labelLower.includes('befunde') || labelLower.includes('regelverstöße')) {
    if (valNum === 0) {
      statusClass = 'rp-tip-status-optimal';
      statusText = 'Optimal';
      desc = 'Keine Regelverstöße im Dienstplan. Exzellente Dienstqualität.';
    } else if (valNum <= 3) {
      statusClass = 'rp-tip-status-moderate';
      statusText = 'Moderat';
      desc = 'Geringfügige Regelverstöße vorhanden. Bitte überprüfen Sie den Dienstplan.';
    } else {
      statusClass = 'rp-tip-status-critical';
      statusText = 'Kritisch';
      desc = 'Erhöhte Anzahl von Regelverstößen. Dringender Handlungsbedarf zur Sicherstellung von Compliance und Arbeitsschutz.';
    }
  } else if (labelLower.includes('kritisch')) {
    if (valNum === 0) {
      statusClass = 'rp-tip-status-optimal';
      statusText = 'Optimal';
      desc = 'Keine schweren Verstöße gegen gesetzliche oder tarifliche Vorgaben.';
    } else {
      statusClass = 'rp-tip-status-critical';
      statusText = 'Kritisch';
      desc = 'Schwere Regelverstöße gefährden den Dienstplan. Dringende Anpassung erforderlich.';
    }
  } else if (labelLower.includes('mittel')) {
    if (valNum === 0) {
      statusClass = 'rp-tip-status-optimal';
      statusText = 'Optimal';
      desc = 'Keine mittelschweren Regelverstöße vorhanden.';
    } else if (valNum <= 2) {
      statusClass = 'rp-tip-status-moderate';
      statusText = 'Moderat';
      desc = 'Vereinzelte mittelschwere Abweichungen von den Planungsrichtlinien.';
    } else {
      statusClass = 'rp-tip-status-critical';
      statusText = 'Kritisch';
      desc = 'Mehrere mittlere Regelverstöße gefährden die Dienstplanqualität.';
    }
  } else if (labelLower.includes('niedrig')) {
    if (valNum === 0) {
      statusClass = 'rp-tip-status-optimal';
      statusText = 'Optimal';
      desc = 'Keine geringfügigen Abweichungen.';
    } else {
      statusClass = 'rp-tip-status-info';
      statusText = 'Info';
      desc = 'Geringfügige Abweichungen ohne unmittelbare rechtliche Relevanz.';
    }
  } else if (labelLower.includes('compliance-score') || labelLower.includes('regelkonformität')) {
    if (valNum === 100) {
      statusClass = 'rp-tip-status-optimal';
      statusText = 'Optimal';
      desc = '100% Konformität. Perfekte Einhaltung aller Arbeitszeitregeln.';
    } else if (valNum >= 90) {
      statusClass = 'rp-tip-status-optimal';
      statusText = 'Gut';
      desc = 'Sehr gute Richtlinieneinhaltung, minimale Abweichungen.';
    } else if (valNum >= 75) {
      statusClass = 'rp-tip-status-moderate';
      statusText = 'Moderat';
      desc = 'Einige Regelabweichungen vorhanden. Dienstplanoptimierung empfohlen.';
    } else {
      statusClass = 'rp-tip-status-critical';
      statusText = 'Kritisch';
      desc = 'Ungenügende Regelkonformität. Erhöhte Compliance-Gefahr für die Klinik.';
    }
  } else if (labelLower.includes('equity-index gesamt') || labelLower.includes('fairness (equity)')) {
    if (valNum >= 90) {
      statusClass = 'rp-tip-status-optimal';
      statusText = 'Optimal';
      desc = 'Hervorragende Dienstfairness. Alle Mitarbeitenden sind gleichmäßig belastet.';
    } else if (valNum >= 75) {
      statusClass = 'rp-tip-status-moderate';
      statusText = 'Moderat';
      desc = 'Gute Verteilung mit kleineren Abweichungen im Team.';
    } else {
      statusClass = 'rp-tip-status-critical';
      statusText = 'Kritisch';
      desc = 'Ungleichmäßige Belastung. Mögliche Unzufriedenheit und Fairness-Ungleichgewicht im Team.';
    }
  } else if (labelLower.includes('wochenend-equity')) {
    if (valNum >= 90) {
      statusClass = 'rp-tip-status-optimal';
      statusText = 'Optimal';
      desc = 'Exzellente Gleichverteilung der besonders belastenden Wochenend- und Feiertagsdienste.';
    } else if (valNum >= 75) {
      statusClass = 'rp-tip-status-moderate';
      statusText = 'Moderat';
      desc = 'Akzeptable Verteilung der Wochenenddienste im Team.';
    } else {
      statusClass = 'rp-tip-status-critical';
      statusText = 'Kritisch';
      desc = 'Wochenenddienste sind ungleich verteilt. Einzelne Personen werden überlastet.';
    }
  } else if (labelLower.includes('abwesenheitsquote') || labelLower.includes('abwesenheiten')) {
    if (valNum < 10) {
      statusClass = 'rp-tip-status-optimal';
      statusText = 'Optimal';
      desc = 'Niedrige Ausfallquote. Ausreichende Personalverfügbarkeit.';
    } else if (valNum < 20) {
      statusClass = 'rp-tip-status-moderate';
      statusText = 'Moderat';
      desc = 'Erhöhte Ausfallquote. Besetzung wird dünner, aber noch tragbar.';
    } else {
      statusClass = 'rp-tip-status-critical';
      statusText = 'Kritisch';
      desc = 'Sehr hohe Ausfallquote. Akute Gefahr von Unterbesetzung und Überlastung.';
    }
  } else if (labelLower.includes('abdeckung') || labelLower.includes('d-abdeckung') || labelLower.includes('hg-abdeckung')) {
    if (valNum >= 98) {
      statusClass = 'rp-tip-status-optimal';
      statusText = 'Optimal';
      desc = 'Exzellente Dienstbesetzung. Fast alle Posten planmäßig besetzt.';
    } else if (valNum >= 90) {
      statusClass = 'rp-tip-status-moderate';
      statusText = 'Moderat';
      desc = 'Einige offene Positionen vorhanden. Schichten sollten besetzt werden.';
    } else {
      statusClass = 'rp-tip-status-critical';
      statusText = 'Kritisch';
      desc = 'Erhebliche Lücken im Dienstplan. Akute Gefährdung der Patientenversorgung.';
    }
  } else if (labelLower.includes('risiko-index')) {
    if (valNum < 10) {
      statusClass = 'rp-tip-status-optimal';
      statusText = 'Optimal';
      desc = 'Sehr geringes Risiko für Dienstausfälle oder ungeplante Vakanzen.';
    } else if (valNum < 30) {
      statusClass = 'rp-tip-status-moderate';
      statusText = 'Moderat';
      desc = 'Geringes bis mittleres Risiko. Dienststabilität ist meist gewährleistet.';
    } else {
      statusClass = 'rp-tip-status-critical';
      statusText = 'Kritisch';
      desc = 'Hohes Ausfallrisiko. Plan ist instabil oder extrem dünn besetzt.';
    }
  } else if (labelLower.includes('wunscherfüllung')) {
    if (valNum >= 85) {
      statusClass = 'rp-tip-status-optimal';
      statusText = 'Optimal';
      desc = 'Hervorragende Wunscherfüllung. Ein Großteil der persönlichen Wünsche wurde berücksichtigt.';
    } else if (valNum >= 70) {
      statusClass = 'rp-tip-status-moderate';
      statusText = 'Moderat';
      desc = 'Solide Wunscherfüllung. Kompromisse bei der Planung waren nötig.';
    } else {
      statusClass = 'rp-tip-status-critical';
      statusText = 'Kritisch';
      desc = 'Viele unerfüllte Wünsche. Kann zu sinkender Teammoral führen.';
    }
  } else if (labelLower.includes('verletzte wünsche')) {
    if (valNum === 0) {
      statusClass = 'rp-tip-status-optimal';
      statusText = 'Optimal';
      desc = 'Keine harten Sperrwünsche verletzt.';
    } else {
      statusClass = 'rp-tip-status-critical';
      statusText = 'Kritisch';
      desc = 'Mindestens ein harter Sperrwunsch konnte nicht eingehalten werden. Konfliktgefahr.';
    }
  } else if (labelLower.includes('variationskoeffizient')) {
    if (valNum < 15) {
      statusClass = 'rp-tip-status-optimal';
      statusText = 'Optimal';
      desc = 'Sehr geringe Streuung. Die Dienste sind sehr gleichmäßig im Kollegium verteilt.';
    } else if (valNum < 30) {
      statusClass = 'rp-tip-status-moderate';
      statusText = 'Moderat';
      desc = 'Moderate Streuung. Die Dienstbelastung variiert leicht zwischen den Kollegen.';
    } else {
      statusClass = 'rp-tip-status-critical';
      statusText = 'Kritisch';
      desc = 'Hohe Streuung. Deutliche Unterschiede bei der Dienstbelastung im Kollegium.';
    }
  } else {
    return '';
  }

  return `<span class="rp-tip-interpret-label">Interpretation:</span> <span class="${statusClass}">${statusText}</span><br>${desc}`;
}

export function getCellInterpretation(table, th, td, colIdx, colName, rowName, val) {
  if (!table || !td) return '';

  const cleanedRowName = rowName ? rowName.trim() : '';
  const cleanedColName = colName ? colName.trim() : '';
  const cleanedVal = val ? val.trim() : '';

  const classList = table.className || '';
  const isAbsenceTable = classList.includes('abs-table') || table.closest('.abs-table-wrap');
  const isFairnessTable = classList.includes('fair-table') || table.closest('.fair-table') || classList.includes('fair-table');
  const isCurvesTable = classList.includes('crv-table');
  const isYeargridTable = classList.includes('yg-table');

  let statusClass = 'rp-tip-status-info';
  let statusText = 'Info';
  let desc = '';

  if (isAbsenceTable) {
    if (cleanedColName === 'Mitarbeitende') {
      return `<span class="rp-tip-interpret-label">Mitarbeiter:</span> ${cleanedRowName}<br>Detaillierte Abwesenheitsstatistik für diesen Zeitraum.`;
    }

    const valNum = parseInt(cleanedVal, 10) || 0;
    const colLower = cleanedColName.toLowerCase();
    
    if (colLower.includes('krank')) {
      if (valNum === 0) {
        statusClass = 'rp-tip-status-optimal';
        statusText = 'Optimal';
        desc = `${cleanedRowName} hat 0 Krankheitstage in diesem Zeitraum.`;
      } else if (valNum <= 5) {
        statusClass = 'rp-tip-status-info';
        statusText = 'Info';
        desc = `${cleanedRowName} hat ${valNum} Krankheitstage. Normaler Bereich.`;
      } else {
        statusClass = 'rp-tip-status-critical';
        statusText = 'Erhöht';
        desc = `${cleanedRowName} hat ${valNum} Krankheitstage. Auf Ausfälle achten.`;
      }
    } else if (colLower.includes('urlaub')) {
      statusClass = 'rp-tip-status-info';
      statusText = 'Info';
      desc = `${cleanedRowName} hat ${valNum} Urlaubstage im Zeitraum genommen.`;
    } else if (colLower.includes('fza')) {
      statusClass = 'rp-tip-status-info';
      statusText = 'Info';
      desc = `${cleanedRowName} hat ${valNum} Tage Freizeitausgleich (FZA).`;
    } else if (colLower.includes('wb')) {
      statusClass = 'rp-tip-status-info';
      statusText = 'Info';
      desc = `${cleanedRowName} hat ${valNum} Tage Weiterbildung (WB).`;
    } else if (colLower.includes('gesamt')) {
      if (valNum <= 10) {
        statusClass = 'rp-tip-status-info';
        statusText = 'Normal';
        desc = `Gesamte Ausfallzeit von ${cleanedRowName}: ${valNum} Tage.`;
      } else if (valNum <= 20) {
        statusClass = 'rp-tip-status-moderate';
        statusText = 'Moderat';
        desc = `Gesamte Ausfallzeit von ${cleanedRowName}: ${valNum} Tage. Planer muss Abwesenheiten kompensieren.`;
      } else {
        statusClass = 'rp-tip-status-critical';
        statusText = 'Kritisch';
        desc = `Sehr hohe Gesamtausfallzeit für ${cleanedRowName}: ${valNum} Tage. Kapazitätsengpässe drohen.`;
      }
    }
  } else if (isFairnessTable) {
    if (cleanedColName === 'Mitarbeitende') {
      return `<span class="rp-tip-interpret-label">Mitarbeiter:</span> ${cleanedRowName}<br>Klicken Sie, um das vollständige Profil anzuzeigen.`;
    }

    const colLower = cleanedColName.toLowerCase();
    
    if (colLower.includes('fair-δ') || colLower.includes('fair-d') || colLower.includes('fair-delta')) {
      const valNum = parseFloat(cleanedVal.replace(',', '.')) || 0;
      if (valNum > 2) {
        statusClass = 'rp-tip-status-critical';
        statusText = 'Überlastet';
        desc = `${cleanedRowName} leistet ${cleanedVal} Dienste über dem fairen Anteil. Ausgleich anstreben.`;
      } else if (valNum < -2) {
        statusClass = 'rp-tip-status-info';
        statusText = 'Entlastet';
        desc = `${cleanedRowName} leistet ${cleanedVal} Dienste weniger als der faire Anteil.`;
      } else {
        statusClass = 'rp-tip-status-optimal';
        statusText = 'Ausgewogen';
        desc = `Dienstbelastung von ${cleanedRowName} entspricht präzise dem fairen Anteil (Abweichung ${cleanedVal}).`;
      }
    } else if (colLower.includes('status')) {
      const statusLbl = cleanedVal.toLowerCase();
      if (statusLbl.includes('über') || statusLbl.includes('over')) {
        statusClass = 'rp-tip-status-critical';
        statusText = 'Überlastet';
        desc = `Dienstlast von ${cleanedRowName} liegt über dem Toleranzbereich des fairen Anteils.`;
      } else if (statusLbl.includes('unter') || statusLbl.includes('under')) {
        statusClass = 'rp-tip-status-info';
        statusText = 'Entlastet';
        desc = `Dienstlast von ${cleanedRowName} liegt unter dem Toleranzbereich des fairen Anteils.`;
      } else {
        statusClass = 'rp-tip-status-optimal';
        statusText = 'Fair';
        desc = `Die Dienstverteilung für ${cleanedRowName} ist perfekt ausgewogen.`;
      }
    } else if (colLower.includes('bd') || colLower.includes('hg') || colLower.includes('gesamt') || colLower.includes('we/ft')) {
      statusClass = 'rp-tip-status-info';
      statusText = 'Dienste';
      desc = `${cleanedRowName} leistet ${cleanedVal} Dienste in dieser Kategorie.`;
    } else if (colLower.includes('soll')) {
      statusClass = 'rp-tip-status-info';
      statusText = 'Sollwert';
      desc = `Das persönliche Soll für ${cleanedRowName} beträgt ${cleanedVal} Bereitschaftsdienste.`;
    }
  } else if (isCurvesTable) {
    if (cleanedColName === 'Mitarbeitende') {
      return `<span class="rp-tip-interpret-label">Mitarbeiter:</span> ${cleanedRowName}<br>Kumulierter Dienstverlauf im Vergleich zum Kollegium.`;
    }

    const colLower = cleanedColName.toLowerCase();
    
    if (colLower.includes('abw.')) {
      const valNum = parseFloat(cleanedVal.replace('+', '').replace(',', '.')) || 0;
      if (valNum > 2) {
        statusClass = 'rp-tip-status-critical';
        statusText = 'Über Schnitt';
        desc = `${cleanedRowName} liegt mit ${cleanedVal} Diensten deutlich über dem Durchschnitt des Teams.`;
      } else if (valNum < -2) {
        statusClass = 'rp-tip-status-info';
        statusText = 'Unter Schnitt';
        desc = `${cleanedRowName} liegt mit ${cleanedVal} Diensten unter dem Durchschnitt des Teams.`;
      } else {
        statusClass = 'rp-tip-status-optimal';
        statusText = 'Ausgeglichen';
        desc = `${cleanedRowName} liegt optimal im Durchschnitt des Teams.`;
      }
    } else if (cleanedColName === 'Σ' || cleanedColName === 'Summe') {
      statusClass = 'rp-tip-status-info';
      statusText = 'Jahressumme';
      desc = `Bisherige Jahressumme geleisteter Dienste von ${cleanedRowName}: ${cleanedVal}.`;
    } else {
      statusClass = 'rp-tip-status-info';
      statusText = cleanedColName;
      desc = `${cleanedRowName} leistet ${cleanedVal} Dienste im Monat ${cleanedColName}.`;
    }
  } else if (isForecastTable) {
    if (cleanedColName === 'Mitarbeitende') {
      return `<span class="rp-tip-interpret-label">Mitarbeiter:</span> ${cleanedRowName}<br>Linearer Prognoseverlauf zum Jahresende.`;
    }

    const colLower = cleanedColName.toLowerCase();
    
    if (colLower.includes('prognose bd') || colLower.includes('prognose gesamt')) {
      statusClass = 'rp-tip-status-info';
      statusText = 'Prognose';
      desc = `Hochgerechnete Dienste für ${cleanedRowName} bis Jahresende: ${cleanedVal}.`;
    } else if (colLower.includes('jahresziel')) {
      statusClass = 'rp-tip-status-info';
      statusText = 'Zielwert';
      desc = `Das vereinbarte Jahresziel von ${cleanedRowName} beträgt ${cleanedVal} Dienste.`;
    } else if (colLower.includes('prognose') || colLower.includes('δ') || colLower.includes('delta')) {
      const valNum = parseInt(cleanedVal.replace('+', ''), 10) || 0;
      if (valNum > 2) {
        statusClass = 'rp-tip-status-critical';
        statusText = 'Zielüberschreitung';
        desc = `Prognostizierte Abweichung für ${cleanedRowName}: ${cleanedVal} Dienste über Ziel. Planminderung empfohlen.`;
      } else if (valNum < -2) {
        statusClass = 'rp-tip-status-info';
        statusText = 'Zielunterschreitung';
        desc = `Prognostizierte Abweichung für ${cleanedRowName}: ${cleanedVal} Dienste unter Ziel. Mehrbelastung einplanen.`;
      } else {
        statusClass = 'rp-tip-status-optimal';
        statusText = 'Punktlandung';
        desc = `Dienstprognose von ${cleanedRowName} entspricht exakt dem Jahresziel (Abweichung ${cleanedVal}).`;
      }
    } else if (colLower.includes('ist')) {
      statusClass = 'rp-tip-status-info';
      statusText = 'Ist-Zustand';
      desc = `Aktuell erfasste Dienste für ${cleanedRowName}: ${cleanedVal}.`;
    }
  } else if (isYeargridTable) {
    if (cleanedColName === 'Mitarbeitende') {
      return `<span class="rp-tip-interpret-label">Mitarbeiter:</span> ${cleanedRowName}<br>Monatliche Dienstverteilung (Bereitschaft/Hintergrund).`;
    }

    if (cleanedColName.toLowerCase().includes('jahr') || cleanedColName === 'Σ') {
      statusClass = 'rp-tip-status-info';
      statusText = 'Jahressumme';
      desc = `Geleistete Dienste im Gesamtjahr: ${cleanedVal}.`;
    } else {
      statusClass = 'rp-tip-status-info';
      statusText = cleanedColName;
      desc = `${cleanedRowName} leistet im ${cleanedColName}: ${cleanedVal}.`;
    }
  } else {
    statusClass = 'rp-tip-status-info';
    statusText = cleanedColName || 'Zelle';
    desc = `Wert für ${cleanedRowName}: ${cleanedVal}`;
  }

  return `<span class="rp-tip-interpret-label">Interpretation:</span> <span class="${statusClass}">${statusText}</span><br>${desc}`;
}

function showFor(anchor) {
  const text = anchor.getAttribute('data-tooltip');
  if (!text) return;
  currentAnchor = anchor;
  const tip = ensureTip();

  let interpretation = '';

  // 1. KPI cards check (parent matches `.ah-kpi`)
  const kpiEl = anchor.closest('.ah-kpi');
  const compScoreEl = anchor.closest('.comp-score');

  if (kpiEl) {
    const valueEl = kpiEl.querySelector('.ah-kpi-value');
    const labelEl = kpiEl.querySelector('.ah-kpi-label');
    const valText = valueEl ? valueEl.textContent.trim() : '';
    const labelText = labelEl ? labelEl.textContent.trim() : '';
    interpretation = getKpiInterpretation(labelText, valText);
  } else if (compScoreEl) {
    const valueEl = compScoreEl.querySelector('.comp-score-value');
    const labelEl = compScoreEl.querySelector('.comp-score-label');
    const valText = valueEl ? valueEl.textContent.trim() : '';
    const labelText = labelEl ? labelEl.textContent.trim() : '';
    interpretation = getKpiInterpretation(labelText, valText);
  }

  // 2. Table cells check (parent matches `tr` inside `.ah-table`, `.yg-table`, `.crv-table` or `.sortable`)
  const tdEl = anchor.closest('td');
  if (tdEl) {
    const trEl = tdEl.closest('tr');
    if (trEl) {
      const tableEl = trEl.closest('.ah-table, .yg-table, .crv-table, .sortable');
      if (tableEl) {
        const colIdx = Array.from(trEl.children).indexOf(tdEl);
        
        // Find header row containing <th>
        const headerRows = tableEl.querySelectorAll('thead tr, tr');
        let headerRow = null;
        for (const r of headerRows) {
          if (r.querySelector('th')) {
            headerRow = r;
            break;
          }
        }
        
        const thEl = headerRow ? headerRow.children[colIdx] : null;
        const colName = thEl ? thEl.textContent.trim() : '';
        const firstCell = trEl.firstElementChild;
        const rowName = firstCell ? firstCell.textContent.trim() : '';
        const val = tdEl.textContent.trim();

        interpretation = getCellInterpretation(tableEl, thEl, tdEl, colIdx, colName, rowName, val);
      }
    }
  }

  let content = formatTooltipHtml(text);
  if (interpretation) {
    content += `<div class="rp-tip-divider"></div><div class="rp-tip-interpret">${interpretation}</div>`;
  }

  tip.innerHTML = content;
  tip.setAttribute('aria-hidden', 'false');
  place(anchor, anchor.getAttribute('data-tooltip-pos') === 'bottom');
  requestAnimationFrame(() => tip.classList.add('rp-tip-visible'));
}

function hide() {
  if (showTimer) { clearTimeout(showTimer); showTimer = null; }
  currentAnchor = null;
  if (tipEl) {
    tipEl.classList.remove('rp-tip-visible');
    tipEl.setAttribute('aria-hidden', 'true');
    tipEl.hidden = true;
  }
}

function scheduleHide() {
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(hide, HIDE_DELAY);
}

function cancelHide() {
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
}

export function initTooltips() {
  if (document.body.dataset.rpTooltips === '1') return;
  document.body.dataset.rpTooltips = '1';

  document.addEventListener('mouseover', (e) => {
    if (isCoarsePointer()) return;
    const anchor = e.target.closest?.('[data-tooltip]');
    if (!anchor || anchor === currentAnchor) return;
    if (!anchor.getAttribute('data-tooltip')) return;
    cancelHide();
    if (showTimer) clearTimeout(showTimer);
    showTimer = setTimeout(() => showFor(anchor), SHOW_DELAY);
  });

  document.addEventListener('mouseout', (e) => {
    const anchor = e.target.closest?.('[data-tooltip]');
    if (!anchor) return;
    const to = e.relatedTarget;
    if (to && to.closest?.('[data-tooltip]') === anchor) return;
    if (showTimer) { clearTimeout(showTimer); showTimer = null; }
    if (anchor === currentAnchor) scheduleHide();
  });

  // Tastatur-Zugänglichkeit: Tooltip auch bei Fokus zeigen.
  document.addEventListener('focusin', (e) => {
    const anchor = e.target.closest?.('[data-tooltip]');
    if (!anchor || !anchor.getAttribute('data-tooltip')) return;
    cancelHide();
    showFor(anchor);
  });
  document.addEventListener('focusout', (e) => {
    const anchor = e.target.closest?.('[data-tooltip]');
    if (anchor && anchor === currentAnchor) scheduleHide();
  });

  // Bei Scrollen/Resize/Escape ausblenden, damit die Blase nie „kleben" bleibt.
  window.addEventListener('scroll', hide, { passive: true, capture: true });
  window.addEventListener('resize', hide, { passive: true });
  window.addEventListener('blur', hide);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
}

export function hideTooltip() { hide(); }
