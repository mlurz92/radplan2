# RadPlan — Anwendungsdokumentation

## 1. Kurzbeschreibung & Zweck

RadPlan ist eine browserbasierte Single-Page-Anwendung zur Personal- und Dienstplanung in einer Klinik für Radiologie & Nuklearmedizin. Die Anwendung bildet einen monatlichen Dienstplan als interaktive Tabelle ab, in der für jede:n Mitarbeitende:n pro Kalendertag ein Arbeitsplatz, ein Abwesenheitsstatus und/oder ein Bereitschafts- bzw. Hintergrunddienst eingetragen werden kann.

Die Anwendung deckt folgende fachliche Bereiche ab:

- Tägliche Personaleinsatzplanung über eine rasterbasierte Monatsansicht (Mitarbeitende × Kalendertage).
- Verwaltung von Abwesenheiten (Urlaub, Krankheit, Fortbildung u. a.) und Arbeitsplätzen (MRT, CT, Sonographie usw.).
- Verwaltung von Bereitschafts- und Hintergrunddiensten inklusive Wochenend- und Feiertagslogik für Sachsen.
- Ein regelbasierter Planungsassistent („Auto-Plan“), der einen vollständigen Monat unter Berücksichtigung harter und weicher Regeln automatisch befüllt.
- Eine separate, isolierte Planungs-Sandbox („Planungsmodus“), in der Entwürfe unabhängig vom produktiven Monatsplan erstellt, automatisch optimiert und erst bei Bedarf übernommen werden.
- Ein Jahresplaner mit Jahresraster, Fairness-Analyse und Jahresprojektion.
- Ein Mitarbeitenden-Bereich mit Profilseiten, Kennzahlen, Diagrammen und einer Team-Analytics-Übersicht.
- Eine Abteilungsansicht mit Tages- und Jahresabdeckung pro Arbeitsplatz.
- Eine Befehlspalette für die tastaturgestützte Navigation zu Monaten, Mitarbeitenden und Funktionen.
- Drag-&-Drop-Import sowie JSON-Export und Druckausgabe (PDF via Browser-Druckdialog).
- Eine Cloud-Synchronisation der Daten über eine Cloudflare-Pages-Function mit Cloudflare-KV-Speicher.
- Ein eigenständiges, dediziertes mobiles Bedienkonzept mit Listenansicht, Bottom-Sheet-Dialogen und radialem Schnellaktionsmenü.
- Ein Glasmorphismus-Oberflächendesign mit hellem und dunklem Farbthema, das nahtlos zwischen beiden Modi überblendet.

Die Anwendung ist als reines Frontend-Projekt ohne Build-Pipeline realisiert: Es kommt ausschließlich Vanilla JavaScript in Form von ES6-Modulen zum Einsatz, ohne Framework, ohne Bundler und ohne Transpiler. Der Quellcode wird direkt vom Browser als ES-Module geladen und ausgeführt. Persistiert wird primär im `localStorage` des Browsers; optional ergänzt durch eine serverseitige Synchronisation über eine Cloudflare Pages Function mit angebundenem KV-Namensraum.

## 2. Architekturüberblick

### 2.1 Grundprinzip

RadPlan besteht aus einer HTML-Hülle (`index.html`), die alle Dialoge, Container und das semantische Grundgerüst der Oberfläche als statisches Markup enthält, sowie aus einer Reihe von ES6-Modulen unter `js/`, die zur Laufzeit DOM-Inhalte erzeugen, Ereignisse verarbeiten und den Anwendungszustand verwalten. Die visuelle Gestaltung ist vollständig in CSS-Dateien unter `css/` ausgelagert, die über klassische `<link>`-Elemente im `<head>` von `index.html` eingebunden werden. Es existiert kein Build-Schritt: Alle Dateien werden im Originalzustand ausgeliefert und im Browser interpretiert.

Externe Abhängigkeiten werden ausschließlich über CDN-Skripte eingebunden:

- **Chart.js** (`chart.umd.min.js`, Version 4.4.4) — für Donut-Diagramme, Balkendiagramme und Trendkurven in Profil-, Dashboard- und Jahresplaner-Ansichten.
- **GSAP** (`gsap.min.js`, Version 3.12.2) — für ergänzende Animationseffekte.

Beide werden als reguläre `<script>`-Tags vor dem Anwendungsmodul `js/app.js` geladen; die Anwendung prüft an den jeweiligen Einsatzstellen, ob die globalen Objekte (`Chart`, `gsap`) tatsächlich verfügbar sind, und verzichtet andernfalls auf die betroffene Visualisierung, ohne dass die Kernfunktion der Seite beeinträchtigt wird.

### 2.2 JavaScript-Module (`js/`)

| Datei | Aufgabe |
|---|---|
| `constants.js` | Zentrale Konstanten und reine Hilfsfunktionen ohne Zustand: Arbeitsplatz-, Status- und Wunschtyp-Definitionen, Mitarbeitendenstammdaten (`EMP_META`), Feiertagsberechnung für Sachsen, Datums- und Kalenderhilfsfunktionen, Monatsschlüssel-Erzeugung, RBN-Zeilenkonfiguration und die Logik zur Mitarbeitenden-Abgangsbereinigung. |
| `state.js` | Hält den globalen Laufzeitzustand (`DATA`, `state`, Planungsmodus-Zustand) und kapselt die gesamte Persistenzlogik: Laden/Speichern in `localStorage`, das Debounce-gesteuerte Nachsenden an den Server, den feldweisen Drei-Wege-Merge bei Synchronisationskonflikten sowie das Verwalten unabhängiger Planungsentwürfe je Monat. |
| `model.js` | Reine Datenzugriffs- und Ableitungsschicht oberhalb von `DATA`/`planData`: Lesen und Schreiben einzelner Zellen, Ermitteln von Dienstinhaber:innen, Zusammenstellen der für ein Jahr aktiven Mitarbeitendenliste, Statistik- und Kennzahlenberechnung für Profile und Dashboards. |
| `app.js` | Einstiegspunkt und Orchestrierung: Initialisierung der Anwendung, globale Tastaturkürzel, Header-Aktionen (Theme, Dichte, Export, Import, Druck, Server-Sync), Periodensteuerung (Monats-/Jahreswechsel inklusive View-Transition-Choreographie), Verwaltung des Planungsmodus (Start, Speichern, Abbrechen, Übernehmen, Undo/Redo), responsives Layout-Umschalten zwischen Desktop- und Mobilansicht. |
| `render-grid.js` | Aufbau und Interaktion der zentralen Monatsraster-Tabelle (`#plan-table`): Kopf- und Fußzeilenaufbau, Zellrendering inklusive Wochenend-/Feiertags-/Heute-Markierung, Tastaturnavigation innerhalb des Rasters, Drag-&-Drop von Diensten zwischen Zellen, Desktop-Schnellaktions-Popover, mobiles radiales Schnellaktionsmenü, Konfliktmarkierungen, RBN-Sonderzeile. |
| `render-modals.js` | Aufbau aller Dialoge mit Ausnahme des Zellen-Editor-Layouts in `index.html`: Editor-Logik (Arbeitsplatz-/Status-/Dienst-/Wunsch-/Fixierungsauswahl, Kommentarfeld), Mitarbeitendenverwaltungs-Dialog (Profil, Anlegen/Entfernen), Auto-Plan-Konfigurationsoberfläche, Auto-Plan-Engine-Ansicht mit Terminal-Log und Neural-Graph-Einbettung, Abschlussbericht, Bewertungsdetail-Dialog (NFI-Score-Dashboard), Import-Dialog. |
| `render-dept.js` | Abteilungsübersicht: Tagesabdeckung je Arbeitsplatz für den aktuellen Monat sowie Jahresübersicht mit Abdeckungsbalken pro Arbeitsplatz und Monat. |
| `render-employee-dashboard.js` | Mitarbeitenden-Bereich: Zusammenfassende Kennzahlen-Kacheln, Team-Analytics-Panel mit wählbaren Zeiträumen, durchsuchbares und nach Rolle filterbares Mitarbeitenden-Karten-Raster, Detailansicht je Person mit den Reitern Monatsverlauf, Jahreskalender, Verwaltung und Analyse. |
| `autoplan.js` | Der Planungsassistent „Auto-Plan“: sämtliche Phasen der automatischen Diensteinteilung, Regelprüfungen (harte und weiche Kriterien), Fairness-Berechnungen, Konfliktprüfung (`computeGridConflicts`), Optimierungsschleifen und die abschließende Berechnung des Qualitätsscores. Siehe Abschnitt 6 für die vollständige Beschreibung. |
| `yearplan.js` | Logik und Rendering des Jahresplaner-Dialogs: Jahresraster mit allen Mitarbeitenden und Monaten, Fairness-Analyse-Reiter mit umschaltbaren Diagrammmodi, Projektions-Reiter mit Jahresendhochrechnung je Person. |
| `neuralgraph.js` | Eigenständige Canvas-basierte Visualisierungskomponente (`NeuralGraph`-Klasse), die während des Auto-Plan-Laufs eine graphartige Darstellung des Lösungsprozesses animiert. |
| `commandpalette.js` | Die Befehlspalette: Zusammenstellung aller statischen Befehle, dynamische Monats- und Mitarbeitenden-Einträge, Filterung per Texteingabe, Tastaturnavigation und Ausführung. Siehe Abschnitt 5.7 für die vollständige Befehlsliste. |
| `contextmenu.js` | Generische, wiederverwendbare Kontextmenü-Komponente (Singleton), die an verschiedenen Stellen der Oberfläche für Rechtsklick-Menüs eingesetzt wird. |
| `viewtransition.js` | Steuerung der nativen View-Transition-API für gerichtete Monats-/Jahresübergänge (Vor-/Zurück-Animation) und für den kreisförmigen Enthüllungseffekt beim Wechsel zwischen Hell- und Dunkelmodus, inklusive Fallback für Browser ohne Unterstützung und Berücksichtigung reduzierter Bewegungspräferenzen. |

### 2.3 Backend (`functions/`)

| Datei | Aufgabe |
|---|---|
| `functions/api.js` | Cloudflare-Pages-Function, die unter `/api` erreichbar ist. Stellt die Endpunkte für das Lesen und Schreiben des gesamten Anwendungsdatensatzes über einen an die Function gebundenen Cloudflare-KV-Namensraum (`RADPLAN_KV`) bereit. Siehe Abschnitt 7 für die vollständige Beschreibung. |

### 2.4 CSS-Dateien (`css/`)

| Datei | Aufgabe |
|---|---|
| `core.css` | Definiert sämtliche CSS-Custom-Properties (Farbskalen, Glasmorphismus-Token, Schattenskalen, abgeleitete RGB-Tripel für Theme-Wechsel, Safe-Area-Variablen, Raster-Maßvariablen), die `[data-theme="light"]`-Überschreibung dieser Variablen, globale Resets, grundlegendes Body-Styling sowie die Keyframe-Animationen für gerichtete View-Transitions und den Theme-Wechsel-Enthüllungseffekt. |
| `layout.css` | Strukturelles Layout der Hauptansicht: Kopfzeile, Monatsnavigation, Statistikleiste, Planungsmodus-Leiste, Rasterbereich samt Zellzuständen (Wochenende, Feiertag, Heute, Mehrfachauswahl, Konflikt, Fixierung), Dienst-/Wunsch-/Kommentar-Badges, RBN-Sonderzeile, mobile Navigationsleiste, manueller Dichte-Umschalter sowie sämtliche Breakpoint-Anpassungen dieser Bereiche. |
| `components.css` | Wiederverwendbare UI-Bausteine: Schaltflächen-Varianten, Auswahl-Chips (Arbeitsplatz, Status, Dienst, Wunsch), Texteingabefelder, Drag-&-Drop-Dropzone, Toast-Benachrichtigung, Tooltipps, Desktop-Schnellaktions-Popover, mobiles radiales Schnellaktionsmenü, Befehlspalette. |
| `modals.css` | Sämtliche Dialogfenster: generische Dialog-Hülle mit Glanzeffekt, Zellen-Editor, Mitarbeitendenverwaltung, Import-Dialog, Abteilungsdialog, die umfangreiche Auto-Plan-Konfigurations- und Engine-Oberfläche (inklusive Terminal-Log-Darstellung und Neural-Graph-Einbettung), Abschlussbericht, NFI-Bewertungsdetail-Dashboard, Jahresplaner-Dialog (Jahresraster, Fairness-Analyse, Projektion) sowie die mobilen Bottom-Sheet-Anpassungen aller Dialoge. |
| `views.css` | Inhaltliche Gestaltung einzelner Ansichten: Mitarbeitendenprofil (Kennzahlen, Verteilungsdiagramme, Monatskalender, Jahresauswertung, Wochentags-Diagramm), Abteilungsansicht, Zeitraum-Flyout, Mitarbeitenden-Bereich (Zusammenfassung, Team-Analytics, Kartenraster, Detailansicht mit Analyse-Reiter), mobile Monatszusammenfassung und Tageslisten-Karten, mobiler Tages-Bottom-Sheet. |
| `mobile-optimization.css` | Enthält Anpassungen für ein spezifisches mobiles Zielgerät (iPhone 14 Pro Max: Viewport 430×932 CSS-Pixel, definierte Safe-Area-Insets), darunter angepasste Maßvariablen für Kopfzeile, Namensspalte, Zellbreite, Zeilenhöhe und Overlay-Innenabstand für Hoch- und Querformat, eine Mindestgröße von 44×44 Pixel für Bedienelemente bei grobzeigerbasierter Eingabe sowie iOS-spezifische Bottom-Sheet-Animationen für einzelne Dialoge. Diese Datei ist im Quellbaum vorhanden, wird jedoch von `index.html` über kein `<link>`-Element referenziert; ihre Regeln wirken sich auf die laufende Anwendung daher nicht aus. |
| `print.css` | Ausschließlich über `media="print"` eingebunden. Blendet sämtliche Bedienelemente, Leisten, Dialoge und die mobile Navigation aus und stellt stattdessen einen eigenen Druckkopf (`#print-header`) und Druckfuß (`#print-footer`) sowie eine vereinfachte, kontrastreiche Darstellung der Rastertabelle dar. Definiert zusätzlich das Seitenformat (A4 quer, 10 mm Rand). |
| `contextmenu.css` | Gestaltung des generischen Kontextmenüs: schwebendes Glaspanel mit Skalierungs-/Transparenz-Übergang, Menüpunkte mit Hover-/Aktiv-Zuständen, eine optische Sonderkennzeichnung für destruktive Aktionen, Trennlinien sowie rechtsbündige Tastaturkürzel-Hinweise. |

### 2.5 Persistenz und Datenfluss

Der gesamte Anwendungsdatensatz wird unter dem `localStorage`-Schlüssel `radplan_v3` (Konstante `STORAGE_KEY`) als JSON-Objekt gespeichert. Jede Änderung an einer Zelle löst `saveToStorage()` aus, welches sofort synchron in den `localStorage` schreibt und anschließend, mit einer kurzen Verzögerung (Debounce von 120 ms), einen Schreibvorgang an die Server-Schnittstelle anstößt. Unabhängig davon legt der Planungsmodus seine Entwürfe unter eigenen Schlüsseln der Form `radplan_v3_plan_<monthKey>` ab, sodass produktive Daten und Planungsentwürfe strikt voneinander getrennt bleiben.

## 3. Datenmodell

### 3.1 Grundstruktur von `DATA`

Der zentrale Laufzeitzustand `DATA` (definiert in `state.js`) ist ein Objekt, dessen Schlüssel Monatskennungen im Format `"<Jahr>-<Monatsindex>"` sind (Monatsindex nullbasiert, also Januar = 0). Die Erzeugung dieses Schlüssels erfolgt ausschließlich über die Funktion `monthKey(y, m)` aus `constants.js`. Jeder Eintrag enthält die Daten exakt eines Kalendermonats in folgender Form:

```
DATA[monthKey(y, m)] = {
  employees:   string[],                 // aktive Mitarbeitende dieses Monats
  assignments: { [empName]: { [tag]: Assignment } },
  rbn:         { [tag]: string },         // RBN-Sonderzeile, siehe 3.4
  comments:    { [empName]: { [tag]: string } }
}
```

Die Funktion `normalizeMonthDataShape(md)` stellt sicher, dass beim Laden eines Monats fehlende Teilstrukturen (`employees`, `assignments`, `rbn`, `comments`) als leere Strukturen ergänzt werden, sodass nachfolgender Code stets von ihrem Vorhandensein ausgehen kann.

### 3.2 Assignment (Tageszelle)

Eine `Assignment` ist eine einzelne Zeichenkette, die den Zustand einer Mitarbeiter:in an einem bestimmten Tag kodiert. Sie kann folgende Bestandteile kombinieren:

- Einen oder mehrere Arbeitsplatz-Codes (siehe Abschnitt 4.1), durch `/` getrennt, wenn an einem Tag mehrere Arbeitsplätze zugewiesen sind (z. B. `"MR/CT"`).
- Einen Status-Code (siehe Abschnitt 4.2), der exklusiv ist: Ist ein Status gesetzt, schließt dies eine gleichzeitige Arbeitsplatzzuweisung an diesem Tag aus.
- Einen optionalen Dienst-Zusatz für Bereitschafts- (`D`) oder Hintergrunddienst (`HG`), der unabhängig von Arbeitsplatz oder Status zusätzlich angehängt werden kann.

Zusätzlich zur reinen Zuweisung können im Planungsmodus pro Zelle ein Dienstwunsch (`NO_DUTY`, `BD_WISH`, `HG_WISH`, siehe Abschnitt 4.3) sowie eine Fixierung (Pin) hinterlegt werden, die diese Zelle für die automatische Planung sperrt.

### 3.3 Kommentare

Zu jeder Mitarbeiter:in-Tag-Kombination kann unabhängig von der Zuweisung eine Freitext-Notiz (maximal 200 Zeichen) hinterlegt werden, die im Raster als Kommentar-Indikator angezeigt wird und beim Überfahren bzw. Öffnen des Editors sichtbar ist.

### 3.4 RBN-Sonderzeile

Zusätzlich zur regulären Mitarbeitenden-Matrix existiert eine von den normalen Mitarbeitenden- und Zuweisungsdaten vollständig entkoppelte Sonderzeile für den neuroradiologischen Rufbereitschaftsdienst („RD Neurorad“). Ihre Konfiguration:

- `RBN_ROW_KEY = "__RBN_NEURORAD__"` — interner Schlüssel innerhalb von `md.rbn`.
- `RBN_ROW_LABEL = "RD Neurorad"` — Anzeigename der Zeile.
- `RBN_ROW_START = { year: 2025, month: 5 }` — gibt vor, ab welchem Monat die Zeile überhaupt im Raster sichtbar ist; geprüft über `isRbnMonthVisible(y, m)`. Für Monate vor Juni 2025 wird die Zeile nicht angezeigt.
- `RBN_OPTIONS` — eine feste Liste von acht möglichen Namens-Einträgen für diese Zeile (Prof. Schob, Dr. Maybaum, Dr. Bailis, Dr. Schüngel, Fr. Dalitz, Fr. Thaler, Dr. Martin, Hr. El Houba), unabhängig vom regulären Mitarbeitendenstamm.
- `RBN_THALER_LAST_MONTH = { year: 2026, month: 2 }` — letzter Monat (März 2026), in dem „Fr. Thaler (RAD)“ als wählbare Option erscheint. Die Funktion `getRbnOptionsForDate(y, m)` filtert diese Option für alle späteren Monate automatisch aus der Auswahlliste heraus.

Die RBN-Zeile wird unabhängig von `employees` und `assignments` im Feld `rbn` des jeweiligen Monatsobjekts als einfache Tag-zu-Name-Zuordnung gespeichert.

### 3.5 Mitarbeitendenstammdaten und Lebenszyklus

Stammdaten zu jeder Mitarbeiter:in werden zentral in `EMP_META` (in `constants.js`) gepflegt: vollständiger Name, Positionscode (z. B. CA, LOA, OA, OÄ, FA, FÄ, AA, AÄ), Positionsbezeichnung, Facharzt-Typ, fachlicher Schwerpunktbereich, Vertretung, Beschäftigungsbeginn, Beschäftigungsgrad (FTE), interne Telefondurchwahl sowie thematische Tags.

Mitarbeitende können über `EMPLOYEE_DEPARTURES` mit einem Austrittsmonat und einem Austrittsgrund versehen werden. Die Funktion `isEmployeeActiveInMonth(name, y, m)` prüft, ob eine Person in einem gegebenen Monat noch aktiv ist; `reconcileEmployeesForMonth(md, y, m)` entfernt beim Laden eines Monats automatisch alle Personen, deren Austrittsmonat erreicht oder überschritten ist, aus den Feldern `employees`, `assignments` und `comments` dieses Monats, sodass ausgeschiedene Mitarbeitende in zukünftigen Monaten nicht mehr erscheinen, in vergangenen Monaten aber unverändert sichtbar bleiben.

### 3.6 Weitere zentrale Konstanten

- `MOBILE_BREAKPOINT = 600` — die JavaScript-seitige Pixel-Schwelle, unterhalb derer die Anwendung in den mobilen Listenmodus wechselt.
- `ABSENCE_CODES` — die Menge aller Status-Codes, die als Abwesenheit gelten (`U`, `ZU`, `SU`, `FZA`, `K`, `KK`, `§15c`, `WB`).
- `VACATION_CODES` — die Teilmenge der Abwesenheitscodes, die als Urlaub im engeren Sinn gelten (`U`, `ZU`, `SU`, `§15c`).

## 4. Arbeitsplatz-, Status- und Wunschtyp-Codes

### 4.1 Arbeitsplätze (`WORKPLACES`)

| Code | Bezeichnung | Hintergrundfarbe | Textfarbe |
|---|---|---|---|
| `MR` | MRT | `#DBEAFE` | `#1D4ED8` |
| `CT` | CT | `#FFEDD5` | `#C2410C` |
| `US` | Sonographie | `#CCFBF1` | `#0F766E` |
| `AN` | Angiographie | `#F3E8FF` | `#7E22CE` |
| `MA` | Mammographie | `#FCE7F3` | `#BE185D` |
| `KUS` | Kinder-US | `#DCFCE7` | `#15803D` |
| `W` | Wermsdorf | `#FEF9C3` | `#854D0E` |
| `T` | Teleradiologie | `#E0E7FF` | `#3730A3` |

Mehrere Arbeitsplatz-Codes können an einem Tag gleichzeitig zugewiesen werden (Mehrfachauswahl im Editor, z. B. `MR/CT`).

### 4.2 Status (`STATUSES`)

| Code | Bezeichnung | Hintergrundfarbe | Textfarbe |
|---|---|---|---|
| `F` | Frei | `#F1F5F9` | `#475569` |
| `U` | Urlaub | `#EDE9FE` | `#5B21B6` |
| `ZU` | Zusatzurlaub | `#DDD6FE` | `#4C1D95` |
| `SU` | Sonderurlaub | `#C4B5FD` | `#2E1065` |
| `FZA` | FZA | `#E0E7FF` | `#3730A3` |
| `K` | Krank | `#FEE2E2` | `#991B1B` |
| `KK` | Kind Krank | `#FECACA` | `#7F1D1D` |
| `§15c` | §15c | `#CFFAFE` | `#155E75` |
| `WB` | Weiterbildung | `#FEF3C7` | `#78350F` |

Ein Status ist exklusiv: Ist für einen Tag ein Status gesetzt, ist an diesem Tag keine Arbeitsplatzzuweisung möglich.

### 4.3 Dienstwunsch-Typen (`WISH_TYPES`)

Dienstwünsche können ausschließlich im Planungsmodus pro Zelle hinterlegt werden und fließen als weiche Präferenz in die automatische Planung ein.

| Code | Bezeichnung | Symbol | Hintergrundfarbe | Textfarbe | Rahmenfarbe |
|---|---|---|---|---|---|
| `NO_DUTY` | Kein Dienst | `✗` | `#FEE2E2` | `#991B1B` | `#FCA5A5` |
| `BD_WISH` | BD Wunsch | `D` | `#FEE2E2` | `#B91C1C` | `#F87171` |
| `HG_WISH` | HG Wunsch | `H` | `#E0F2FE` | `#0369A1` | `#7DD3FC` |

### 4.4 Dienst-Zusätze

Unabhängig von Arbeitsplatz und Status kann jeder Tageszelle einer diensthabenden Person einer von zwei Dienst-Zusätzen angehängt werden:

- `D` — Bereitschaftsdienst.
- `HG` — Hintergrunddienst.

## 5. UI/UX im Detail

### 5.1 Hauptraster (Monatsansicht)

Das Hauptraster (`#plan-table`) zeigt alle aktiven Mitarbeitenden des gewählten Monats als Zeilen und alle Kalendertage des Monats als Spalten. Jede Zelle zeigt die kombinierte Zuweisung (Arbeitsplatz und/oder Status, Dienst-Zusatz, Wunsch-Symbol im Planungsmodus, Fixierungs-Symbol, Kommentar-Indikator) in farbcodierter Form gemäß Abschnitt 4. Wochenend- und Feiertagsspalten sind optisch hervorgehoben, ebenso die Spalte des aktuellen Tages. Mehrfachselektion über Maus-Drag oder Tastatur erlaubt das gleichzeitige Bearbeiten mehrerer Zellen. Konflikte, die der Planungsassistent oder die Live-Prüfung erkennt (siehe Abschnitt 6.3), werden direkt am betroffenen Zellpaar markiert.

Eine schwebende, manuell umschaltbare Rasterdichte (`#btn-density`) verkleinert Namensspalte, Zellbreite und Zeilenhöhe unabhängig von den responsiven Breakpoints, um auf kleineren Fenstern oder Tablets mehr Spalten gleichzeitig sichtbar zu machen.

### 5.2 Zellen-Editor

Der Zellen-Editor (`#modal-editor`) öffnet sich beim Aktivieren einer Zelle und gliedert die Bearbeitung in nummerierte Schritte:

1. **Einsatz** — Mehrfachauswahl der Arbeitsplatz-Chips bzw. exklusive Auswahl eines Status-Chips.
2. **Dienst** — Auswahl des Dienst-Zusatzes (Bereitschaft/Hintergrund) inklusive Warnhinweis bei Regelkonflikten.
3. **Planung** (nur im Planungsmodus sichtbar) — Auswahl eines Dienstwunsches und Festlegen einer Fixierung für die automatische Planung.
4. **Notiz** — Freitextfeld für eine Tageskommentar (maximal 200 Zeichen, mit Zeichenzähler).

Eine Vorschau-Box zeigt die resultierende Kombination, bevor sie gespeichert wird. Der Editor unterstützt vollständige Tastaturbedienung (siehe Abschnitt 8).

### 5.3 Mitarbeitenden-Profil

Das Profilmodal (`#modal-profile`) zu einer einzelnen Person zeigt: eine Statusleiste zum aktuellen Tag, Kennzahlen-Kacheln des aktuellen Monats, eine Arbeitsplatz-Verteilung als Balken- und Donut-Diagramm, eine Status-/Abwesenheits-Verteilung, eine detaillierte Dienst-/Hintergrunddienst-Aufstellung, einen Jahresverlaufstrend als Liniendiagramm, eine Dienstverteilung nach Wochentag als Balkendiagramm, einen anklickbaren Monatskalender (öffnet bei Klick auf einen Werktag direkt den Zellen-Editor) sowie eine Jahresauswertung.

### 5.4 Mitarbeitenden-Bereich (Dashboard)

Der Mitarbeitenden-Bereich (`#modal-emps`) bietet:

- Eine zusammenfassende Kennzahlen-Übersicht über alle Mitarbeitenden.
- Ein Team-Analytics-Panel mit wählbaren Zeiträumen für Abteilungs- und Mitarbeitendenstatistiken.
- Ein durchsuchbares (`#emp-search`) und nach Rolle filterbares Kartenraster aller Mitarbeitenden mit Jahresübersicht.
- Eine Detailansicht je ausgewählter Person mit vier umschaltbaren Reitern: Monatsverlauf (tabellarisch je Monat inklusive Abdeckungsbalken), Jahreskalender (Mini-Monatskarten), Verwaltung (Administrationslayout) und Analyse (Kennzahlen-Kacheln, Kreis- und Verhältnisdiagramme, Abwesenheits-Aufschlüsselung).

### 5.5 Jahresplaner

Der Jahresplaner (`#modal-yearplan`) gliedert sich in drei Reiter:

- **Jahres-Gitter** — tabellarische Übersicht aller Mitarbeitenden über alle zwölf Monate eines Jahres mit Bereitschafts- und Hintergrunddienst-Summen je Zelle, Gesamtspalte je Person und einer Durchschnittszeile.
- **Fairness-Analyse** — umschaltbarer Diagrammmodus mit horizontalem Balkendiagramm sowie einer tabellarischen Aufstellung der Abweichung jeder Person vom Mittelwert.
- **Jahresprojektion** — Hochrechnung der bis Jahresende zu erwartenden Dienstzahlen je Person inklusive Fortschrittsbalken und Abweichungsanzeige.

Eine Jahresnavigation erlaubt das Wechseln zwischen Kalenderjahren unabhängig vom aktuell angezeigten Monat in der Hauptansicht.

### 5.6 Abteilungsansicht

Die Abteilungsansicht (`#modal-dept`) zeigt in zwei Reitern die Tagesabdeckung des aktuellen Monats je Arbeitsplatz (mit Abdeckungsbalken) sowie eine Jahresübersicht der Abdeckung je Arbeitsplatz und Monat.

### 5.7 Befehlspalette

Die Befehlspalette (`#modal-command-palette`) wird über `Strg+K` bzw. `Cmd+K` geöffnet oder erneut geschlossen, alternativ über die Lupen-Schaltfläche `#btn-cmdk` in der Kopfzeile. Sie bietet eine textbasierte Filterung über drei Gruppen von Einträgen:

**Statische Befehle (Gruppe „Funktionen“, vollständig):**

1. Jahresplan öffnen
2. Mitarbeitende verwalten
3. Daten exportieren (JSON)
4. Daten importieren (JSON)
5. Monatsplan drucken / als PDF speichern
6. Planungsmodus starten
7. Auto-Plan ausführen (nur im Planungsmodus verfügbar)
8. Zum heutigen Monat springen
9. Hell-/Dunkelmodus umschalten
10. Spaltendichte umschalten (kompakt/normal)

**Dynamische Befehle:**

- Gruppe „Monat“ — ein Eintrag pro Kalendermonat für das Vorjahr, das aktuelle Jahr und das Folgejahr (36 Einträge), die direkt zum gewählten Monat springen.
- Gruppe „Mitarbeitende“ — ein Eintrag pro im aktuellen Jahr aktiver Mitarbeiter:in, der das jeweilige Profil öffnet.

Die Navigation innerhalb der Ergebnisliste erfolgt über die Pfeiltasten, die Ausführung über die Eingabetaste, das Schließen über Escape.

### 5.8 Kontextmenü

An mehreren Stellen der Oberfläche steht ein Rechtsklick-Kontextmenü zur Verfügung, das über die generische `ContextMenu`-Komponente (`contextmenu.js`) realisiert ist: ein schwebendes Glaspanel mit Menüpunkten, optionalen Tastaturkürzel-Hinweisen, einer optischen Hervorhebung für destruktive Aktionen und Trennlinien zwischen logischen Gruppen.

### 5.9 Mobile Tagesansicht

Unterhalb des in Abschnitt 9 beschriebenen Breakpoints wechselt die Hauptansicht von der Rastertabelle zu einer vertikalen Tagesliste (`#mobile-day-list`): eine nach Kalenderwochen getrennte Liste von Tageskarten, jede mit Wochentags-, Datums- und Wochenend-/Feiertags-/Heute-Kennzeichnung sowie den zugehörigen Dienst-, Zuweisungs- und Wunsch-Badges. Ein Tippen auf eine Karte öffnet einen Bottom-Sheet-Dialog (`#modal-mobile-day`) mit Dienst-Badges in der Kopfzeile und einer editierbaren Mitarbeitendenliste für den jeweiligen Tag. Eine Zusammenfassungsleiste (`#mobile-month-summary`) oberhalb der Liste zeigt aggregierte Monatskennzahlen. Eine eigene untere Navigationsleiste (`#mobile-nav`) ersetzt in diesem Modus die Kopfzeilen-Aktionen durch drei Schaltflächen: Mitarbeitende, Planung, Menü (öffnet ein Bottom-Sheet mit den übrigen Aktionen: Heute, Mitarbeitende verwalten, Export, Import, Server-Synchronisation erzwingen).

### 5.10 Drag-&-Drop-Import

Der Import-Dialog (`#modal-import`) bietet eine Dropzone für JSON-Dateien (Ziehen-und-Ablegen oder Klick zum Durchsuchen) sowie alternativ ein Textfeld zum direkten Einfügen von JSON-Text. Fehlerhafte Eingaben werden mit einer Inline-Fehlermeldung zurückgewiesen.

### 5.11 Export und Druck

Der Export (`#btn-export`, Tastenkürzel `Strg/Cmd+S` außerhalb des Planungsmodus) erzeugt eine herunterladbare JSON-Datei des gesamten Datenbestands. Der Druck (`#btn-print`, über die native Browserfunktion `Strg/Cmd+P`) nutzt die in `print.css` definierte Druckdarstellung: Eine vereinfachte, kontrastreiche Version der aktuellen Monatstabelle wird zusammen mit einem eigenen Druckkopf und Druckfuß im Format A4 quer ausgegeben. Es kommt keine eigenständige PDF-Bibliothek zum Einsatz; die PDF-Erzeugung erfolgt über die native „Als PDF speichern“-Funktion des Browser-Druckdialogs.

### 5.12 Theme-Umschaltung

Die Schaltfläche `#btn-theme` wechselt zwischen Hell- und Dunkelmodus. Der gewählte Modus wird in `localStorage` unter dem Schlüssel `radplan_v3_theme` gespeichert und beim nächsten Laden der Seite bereits vor dem ersten Rendering über ein Inline-Skript im `<head>` von `index.html` angewendet, um ein Aufblitzen des falschen Themas zu vermeiden. Ohne gespeicherte Präferenz wird die Systemeinstellung (`prefers-color-scheme`) herangezogen. Der Wechsel selbst wird, sofern der Browser die View-Transitions-API unterstützt und keine reduzierte Bewegungspräferenz vorliegt, als kreisförmiger Enthüllungseffekt animiert, der vom Klickpunkt der Schaltfläche ausgehend über die gesamte Seite expandiert.

### 5.13 Periodensteuerung (Zeitraum-Flyout)

Über die Monatsbezeichnung in der Kopfzeile öffnet sich ein Flyout (`#period-flyout`) zur unabhängigen Auswahl von Monat und Jahr (Dropdown für den Monat, nummerisches Eingabefeld mit Schrittschaltflächen für das Jahr), ergänzt um Schnellsprung-Schaltflächen für den vorigen/nächsten Monat sowie eine „Heute“-Schaltfläche. Die Anwendung der Auswahl löst eine gerichtete View-Transition-Animation aus, deren Richtung (vorwärts/rückwärts) sich aus dem Vergleich von Ziel- und Ausgangsmonat ergibt.

### 5.14 Planungsmodus

Der Planungsmodus (`#btn-plan`) öffnet eine vom Hauptdatenbestand vollständig isolierte Sandbox (`planData`) für den aktuell gewählten Monat, in der Änderungen unabhängig von den produktiven Daten vorgenommen werden können. Eine eigene Leiste (`#plan-bar`) zeigt den aktiven Zustand, den bearbeiteten Monat sowie Schaltflächen für Rückgängig/Vorwärts (mit eigener Historie, `Strg/Cmd+Z` bzw. `Strg/Cmd+Shift+Z`/`Strg/Cmd+Y`), Auto-Plan-Start, Verwerfen, Speichern als Entwurf, Schließen und Übernahme in den Hauptplan. Entwürfe werden separat unter `radplan_v3_plan_<monthKey>` im `localStorage` abgelegt.

## 6. Der Planungsassistent „Auto-Plan“

### 6.1 Überblick

Der Auto-Plan-Algorithmus (`autoplan.js`) befüllt einen Monat im Planungsmodus automatisch mit Bereitschafts- und Hintergrunddienstzuweisungen. Er kombiniert einen mehrphasigen, regelbasierten Greedy-Ansatz mit anschließenden lokalen Suchverfahren (Tausch-Optimierung), um eine möglichst faire und regelkonforme Verteilung zu erreichen. Konfigurierbar sind unter anderem individuelle Zieldienstzahlen je Mitarbeiter:in sowie eines von drei Gewichtungsprofilen:

| Profil | Bezeichnung | Beschreibung |
|---|---|---|
| `standard` | Ausgewogen | Solver-Standardgewichtung aus harter Regelkonformität, Fairness und Wunscherfüllung. |
| `fairness` | Fairness-optimiert | Gewichtet die gleichmäßige Verteilung von Wochenend-/Samstags-/Hintergrunddiensten stärker; Wünsche treten zurück. |
| `wish` | Wunscherfüllung-optimiert | Gewichtet erfüllte Dienstwünsche deutlich stärker; der Fairness-Ausgleich tritt zurück. |

Von der Bereitschaftsdienst-Planung grundsätzlich ausgenommen ist die in `DUTY_EXEMPT` gelistete Person (Prof. Schäfer).

### 6.2 Phasenmodell

Der Algorithmus arbeitet die folgenden Phasen sequenziell ab:

1. **Bedarfsermittlung und Vorbereitung** — Sammlung historischer Diensthäufigkeiten (`collectHistoricalDutyStats`) zur Berücksichtigung bisheriger Belastung über mehrere Monate hinweg.
2. **Bereitschaftsdienst-Zuweisung** — initiale Verteilung der Bereitschaftsdienste auf alle Tage des Monats unter Beachtung der harten Regeln (siehe 6.3).
3. **`runPhase4_BDOptimize`** — lokale Tausch-Optimierung der Bereitschaftsdienst-Zuweisungen über bis zu `BD_MAX_PASSES = 80` Durchläufe, um die Verteilung zwischen den Mitarbeitenden auszugleichen.
4. **`runPhase5_HGBundle`** — Bündelung zusammenhängender Hintergrunddienst-Zeiträume.
5. **`runPhase6_HGAssign`** — initiale Zuweisung der Hintergrunddienste.
6. **`runPhase7_HGOptimize`** — lokale Tausch-Optimierung der Hintergrunddienst-Zuweisungen über bis zu `HG_MAX_PASSES = 120` Durchläufe.
7. **`runPhase8_DeepOptimize`** — übergreifende, tiefere Tausch-Optimierung über beide Dienstarten gemeinsam, über bis zu `DEEP_MAX_PASSES = 150` Durchläufe je Zyklus.
8. **`runCoverageRepair`** — abschließende Reparaturphase, die verbleibende Abdeckungslücken (Tage ohne gültige Zuweisung) gezielt schließt.

Die Phasen 4, 7 und 8 werden gemeinsam innerhalb einer Multi-Zyklus-Schleife von bis zu `MAX_OPTIMIZATION_CYCLES = 25` Wiederholungen ausgeführt, wobei jeder Zyklus erneut Bereitschaftsdienst-, Hintergrunddienst- und Tiefenoptimierung durchläuft, bis entweder keine weiteren Verbesserungen gefunden werden oder die maximale Zyklenzahl erreicht ist.

### 6.3 Harte Regeln (Constraints)

Folgende harte Regeln werden während der Zuweisung und in der eigenständigen Konfliktprüfung (`computeGridConflicts`) durchgesetzt bzw. geprüft:

- **Abwesenheitsausschluss** — eine Person mit einem Abwesenheitsstatus (`isAbsentOnDay`, basierend auf `ABSENCE_CODES`) kann an diesem Tag keinen Dienst übernehmen.
- **Urlaubsausschluss am Folgetag** (`isNextDayVacation`) — eine Person, die am nächsten Kalendertag in Urlaub geht, wird für bestimmte Dienstkombinationen am Vortag ausgeschlossen.
- **Doppel-Frei-Doppel-Frei-Vermeidung** (`wouldCreateDFDF`) — verhindert die Entstehung ungünstiger Frei-Dienst-Muster über aufeinanderfolgende Tage.
- **Wochenend-Dienst-Begrenzung** — die Zielgröße für Wochenend-Bereitschaftsdienste je Person beträgt `TARGET_WEEKEND_DUTY = 1` pro Bezugszeitraum, mit einer aufgeweichten Obergrenze `RELAXED_WEEKEND_DUTY_LIMIT = 1.5` für Ausnahmefälle.
- **Vermeidung aufeinanderfolgender Wochenend-Dienste** (`wouldCreateConsecutiveWeekendDuty`) — eine Person soll nicht an zwei direkt aufeinanderfolgenden Wochenenden zum Bereitschaftsdienst eingeteilt werden.
- **CT-Leitungskonflikt** — eine speziell auf das CT-Leitungstandem (Dr. Becker und Dr. Martin) bezogene Regel: Hält eine der beiden Personen an einem Tag tatsächlich einen Bereitschaftsdienst (`D`), während die andere Person am nächsten Werktag abwesend ist (z. B. in Urlaub), wird dies als Konflikt markiert. Die Regel greift ausschließlich für dieses Personenpaar, ausschließlich bei einem tatsächlich gehaltenen Bereitschaftsdienst (nicht bei einer bloßen Planung ohne Dienst) und ausschließlich über eine Werktag-zu-Werktag-Grenze hinweg.
- **Fixierungen (Pins)** — im Planungsmodus markierte Zellen werden von jeder automatischen Änderung ausgenommen.

### 6.4 Weiche Regeln (Fairness-Kriterien)

Neben den harten Regeln optimiert der Algorithmus folgende weiche Kriterien, gemessen über Streuungskennzahlen (`computeFairnessSpread`, `averageFromArray`):

- Ausgeglichene Gesamtzahl an Bereitschaftsdiensten je Person (`bdSpread`).
- Ausgeglichene Gesamtzahl an Hintergrunddiensten je Person (`hgSpread`).
- Ausgeglichene Verteilung von Wochenend-Diensten je Person (`weekendSpread`), ermittelt unter anderem über `countWeekendDuties`, `getWeekendDutyKWs`, `getWeekendStateForKW` und `projectedWeekendDutyCount`.
- Erfüllung der im Planungsmodus hinterlegten Dienstwünsche (`wishFulfillmentRate`).
- Berücksichtigung der historischen Vorbelastung aus vorangegangenen Monaten, getrennt nach Fachärzten (`isFacharzt`) und Assistenzärzten (`isAssistenzarzt`), da für beide Gruppen unterschiedliche Erwartungswerte an Hintergrunddiensten gelten.

### 6.5 Qualitätsscore (NFI-Score)

Nach Abschluss aller Phasen berechnet der Algorithmus einen Qualitätsscore nach folgender Formel:

```
rawScore = 100.0
  − (dutyCoverageMisses × 15.0)
  − (hgCoverageMisses  × 10.0)
  − (bdSpread           × 2.5)
  − (hgSpread           × 1.5)
  − (weekendSpread      × 2.0)
  + (wishFulfillmentRate × 5.0)
  − (deepMoves          × 0.005)

qualityScore = clamp(rawScore, 0, 100)
```

Dabei zählt `dutyCoverageMisses` die Anzahl der Tage ohne gültige Bereitschaftsdienst-Abdeckung, `hgCoverageMisses` die entsprechende Zahl für Hintergrunddienste, `deepMoves` die Anzahl der in Phase 8 vorgenommenen Tauschoperationen. Der berechnete Score wird sowohl im Abschlussbericht als auch im eigenständigen Bewertungsdetail-Dialog (`#modal-score-info`) identisch dargestellt, letzterer ergänzt um eine textuelle Begründung der einzelnen Score-Bestandteile.

### 6.6 Abschlussbericht

Nach einem abgeschlossenen Lauf steht ein Abschlussbericht (`#modal-ap-report`) zur Verfügung, der unter anderem auflistet: die Gesamtzahl an Tauschoperationen je Phase, erkannte und nicht behebbare Abdeckungslücken, erfüllte und nicht erfüllte Dienstwünsche samt Begründung („Warum?“-Erklärungen je Zuweisung), sowie bei Bedarf eine vergleichende Darstellung alternativer Zuweisungen, die der Algorithmus während der Optimierung verworfen hat.

### 6.7 Bekannte Grenzen

Die automatische Planung arbeitet ausschließlich innerhalb eines einzelnen Kalendermonats und bezieht historische Daten nur lesend zur Gewichtung der Fairness ein, ohne rückwirkend bereits gespeicherte Monate zu verändern. Die Tausch-Optimierung ist heuristisch (lokale Suche über eine begrenzte Zahl an Durchläufen) und garantiert keine global optimale Lösung; bei sehr restriktiven Ausgangslagen (z. B. einer hohen Zahl gleichzeitig fixierter Zellen oder Abwesenheiten) können Abdeckungslücken bestehen bleiben, die im Abschlussbericht ausgewiesen werden, anstatt automatisch eine regelwidrige Zuweisung zu erzeugen.

## 7. Cloud-Synchronisation & Backend

### 7.1 Architektur

Die serverseitige Komponente besteht aus einer einzigen Cloudflare-Pages-Function (`functions/api.js`), die unter der Route `/api` erreichbar ist und über einen gebundenen Cloudflare-KV-Namensraum (`env.RADPLAN_KV`) den vollständigen Anwendungsdatensatz unter dem Schlüssel `RADPLAN_DATA` als JSON-Zeichenkette persistiert.

### 7.2 Endpunkte

- **`OPTIONS`** — beantwortet CORS-Preflight-Anfragen mit den freigegebenen Methoden `GET`, `POST`, `OPTIONS` und den freigegebenen Headern `Content-Type`, `Pragma`, `Cache-Control`, `Authorization`. Alle Antworten werden mit `Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate` versehen.
- **`GET`** — liefert den unter `RADPLAN_DATA` gespeicherten Datensatz unverändert zurück. Existiert noch kein Datensatz, wird eine leere Grundstruktur (`{ main: {}, plans: {}, lastModified: 0 }`) mit Status 200 zurückgegeben. Bei einem KV-Lesefehler wird Status 500 mit einer Fehlermeldung zurückgegeben.
- **`POST`** — übernimmt einen vom Client übermittelten Datensatz inklusive eines Zeitstempelfeldes `lastModified`. Vor dem Schreiben wird der aktuell gespeicherte Stand gelesen: Weicht dessen `lastModified`-Wert von dem im Request übermittelten ab (und ist größer als 0), wird der Schreibvorgang mit Status 409 und dem Antwortkörper `{ error: "Conflict", latestData }` abgelehnt, wobei `latestData` den aktuellen Serverstand enthält. Stimmen die Zeitstempel überein (oder existiert noch kein Serverstand), wird `lastModified` auf die aktuelle Serverzeit gesetzt, der Datensatz unter `RADPLAN_DATA` gespeichert und mit Status 200 sowie dem neuen Zeitstempel bestätigt. Ungültiges JSON oder ein KV-Schreibfehler führt zu Status 400.
- Alle übrigen HTTP-Methoden werden mit Status 405 zurückgewiesen.

### 7.3 Konfliktauflösung auf Client-Seite

Die eigentliche Konfliktauflösung findet nicht im Backend, sondern im Client statt (`state.js`). Erhält der Client beim Speichern eine 409-Antwort, führt er einen feldweisen Drei-Wege-Merge (`mergeThreeWay`) zwischen dem zuletzt bekannten Serverstand (Basis), den eigenen ungespeicherten lokalen Änderungen und dem soeben empfangenen aktuellen Serverstand durch. Der Merge rekursiert dabei durch die verschachtelte Objektstruktur (Monat → Mitarbeiter:in → Tag → Zelle) und behandelt nur jene einzelnen Felder als echten Konflikt, die seit der Basis auf beiden Seiten unterschiedlich verändert wurden; alle anderen Felder werden automatisch und verlustfrei zusammengeführt. Bei einem echten Feldkonflikt gewinnt der lokale Stand, und die Anwendung zeigt dem Benutzer über das Ereignis `radplan-sync-conflict` eine Benachrichtigung mit der Anzahl der betroffenen Felder.

Planungsentwürfe (`plans`) werden beim Zusammenführen gesondert behandelt (`mergePlanDrafts`): Der lokal aktive Entwurf des aktuell bearbeiteten Monats bleibt erhalten, alle übrigen Entwürfe werden vom Serverstand übernommen.

Neben dem automatischen Sync-Versuch nach jedem 409 steht über die Schaltfläche „Server-Sync“ (`#btn-force-sync`, rot hervorgehoben) eine manuelle Funktion zur Verfügung, die jeglichen lokalen Stand verwirft und den aktuellen Serverstand vollständig und ohne Merge übernimmt (`forceSyncWithServer`).

## 8. Tastaturbedienung & Barrierefreiheit

### 8.1 Globale Tastaturkürzel

| Tastenkombination | Wirkung |
|---|---|
| `Strg/Cmd+K` | Befehlspalette öffnen bzw. schließen |
| `Strg/Cmd+S` | Außerhalb des Planungsmodus: Daten als JSON exportieren. Im Planungsmodus: aktuellen Planungsentwurf speichern |
| `Strg/Cmd+Z` | Im Planungsmodus: letzte Änderung rückgängig machen |
| `Strg/Cmd+Shift+Z` oder `Strg/Cmd+Y` | Im Planungsmodus: rückgängig gemachte Änderung wiederherstellen |
| `Alt+←` | Zum vorherigen Monat wechseln |
| `Alt+→` | Zum nächsten Monat wechseln |

### 8.2 Tastaturkürzel innerhalb des Rasters (fokussierte Zelle)

| Taste | Wirkung |
|---|---|
| `←` `↑` `→` `↓` | Fokus zur jeweils benachbarten Zelle bewegen |
| `1`–`8` | Den der Ziffer entsprechenden Arbeitsplatz-Code direkt zuweisen |
| `D` | Bereitschaftsdienst für die fokussierte Zelle umschalten |
| `H` | Hintergrunddienst für die fokussierte Zelle umschalten |
| `Entf` / `Rücktaste` | Eintrag der fokussierten Zelle löschen |
| `Eingabe` | Zellen-Editor für die fokussierte Zelle öffnen |

### 8.3 Tastaturkürzel innerhalb des Zellen-Editors

| Taste | Wirkung |
|---|---|
| `D` | Bereitschaftsdienst umschalten (sofern kein Konflikt mit einer bereits diensthabenden Person besteht) |
| `H` | Hintergrunddienst umschalten (sofern kein Konflikt mit einer bereits diensthabenden Person besteht) |
| `S` | Editor speichern |
| `Eingabe` | Editor speichern (sofern der Fokus nicht auf einer abbrechenden Schaltfläche liegt) |
| `Esc` | Editor bzw. aktives Dialogfenster schließen |

### 8.4 Tastaturkürzel innerhalb der Befehlspalette

| Taste | Wirkung |
|---|---|
| `↑` / `↓` | Auswahl in der Ergebnisliste bewegen |
| `Eingabe` | Ausgewählten Befehl ausführen |
| `Esc` | Befehlspalette schließen |

### 8.5 Barrierefreiheit

Interaktive Elemente sind durchgehend mit ARIA-Attributen versehen (`role="dialog"`, `aria-modal`, `aria-label`, `aria-live`, `role="tablist"`/`role="tab"`, `role="grid"`, `role="listbox"` u. a.). Dialoge tragen `aria-labelledby`-Referenzen auf ihre jeweilige Titelüberschrift. Statusänderungen wie Periodenwechsel, Synchronisationsmeldungen oder Suchergebniszahlen werden über `aria-live="polite"`-Regionen für Screenreader angekündigt. Ein sichtbarer Fokusring (`:focus-visible`) erscheint ausschließlich bei Tastaturfokus, nicht bei Mausklick. Bewegungsintensive Effekte (View-Transitions, Theme-Wechsel-Animation) werden vollständig deaktiviert, wenn die Betriebssystemeinstellung `prefers-reduced-motion: reduce` aktiv ist.

## 9. Responsives Verhalten

### 9.1 Breakpoints

Die folgenden Breakpoints kommen, teils in mehreren der CSS-Dateien gleichzeitig, zur Anpassung von Layout, Schriftgrößen und Sichtbarkeit einzelner Elemente zum Einsatz:

| Breakpoint | Verwendet in |
|---|---|
| `max-width: 1200px` | `layout.css`, `components.css`, `views.css` |
| `max-width: 980px` / `max-width: 900px` | `views.css`, `modals.css` |
| `max-width: 768px` | `layout.css`, `modals.css`, `views.css`, `mobile-optimization.css` |
| `max-width: 720px` | `views.css` |
| `max-width: 700px` | `modals.css` (mobile Anpassungen des Jahresplaner-Dialogs) |
| `max-width: 640px` | `views.css` (Analyse-Reiter des Mitarbeitenden-Bereichs) |
| `max-width: 600px` | `layout.css` (mobiler Wechsel von Rastertabelle zu Tagesliste) |
| `max-width: 560px` | `views.css` |
| `max-width: 480px` | `modals.css`, `views.css` |
| `max-width: 420px` | `views.css` |

Der mobile Wechsel von der Rastertabelle zur Tagesliste erfolgt sowohl CSS-seitig (`max-width: 600px` in `layout.css`) als auch JavaScript-seitig über die Konstante `MOBILE_BREAKPOINT = 600` in `constants.js`, die zur Laufzeit den Zustand `IS_MOBILE` in `state.js` steuert.

### 9.2 Eingabe- und Bewegungs-bezogene Media Features

- `@media (hover: none) and (pointer: coarse)` (`core.css`) — unterdrückt Hover-Effekte auf Geräten ohne echten Mauszeiger.
- `@media (pointer: coarse)` (`mobile-optimization.css`, nicht in `index.html` eingebunden) — erzwingt eine Mindestgröße von 44×44 Pixel für Bedienelemente.
- `@media (prefers-reduced-motion: no-preference)` (`core.css`) — aktiviert sanftes Scroll-Verhalten nur, wenn keine reduzierte Bewegungspräferenz vorliegt.
- `@media (prefers-reduced-motion: reduce)` (`core.css`, `modals.css`) — deaktiviert View-Transition- und Modal-Animationen vollständig.
- `@media (prefers-contrast: more)` (`core.css`) — verstärkt für Nutzer mit erhöhter Kontrastpräferenz die feinen Rasterlinien (Tages- und Zeilentrenner) der Planungstabelle und verdickt den Tastatur-Fokusring. Da farbcodierte Zellen stets zusätzlich ihr Textkürzel (CT, MR, …) tragen, hängt die Bedeutung nie allein von der Farbe ab.

### 9.3 Mobile Bedienkonzepte

Auf mobilen Bildschirmen werden Dialoge größtenteils als vollflächige Bottom-Sheets mit Slide-up-/Slide-down-Animation dargestellt statt als zentriertes Overlay. Anstelle des Desktop-Schnellaktions-Popovers steht ein radiales Schnellaktionsmenü zur Verfügung. Die Bedienelemente nutzen system-eigene Sicherheitsabstände (`env(safe-area-inset-*)`), die über CSS-Variablen (`--safe-top`, `--safe-left`, `--safe-right`, `--safe-bottom`) durchgängig berücksichtigt werden. Die Variablen `--app-vw`, `--app-vh` und `--kb-inset` werden zur Laufzeit synchronisiert, um Browser-Adressleisten-Einblendungen und die Bildschirmtastatur korrekt im Layout zu berücksichtigen. Touch-Interaktionen sind über `touch-action: manipulation` von doppelten Zoom-Gesten befreit, und `-webkit-tap-highlight-color: transparent` unterdrückt die native Tap-Hervorhebung auf iOS/Android.

## 10. Entwicklung & Tests

### 10.1 Projektstruktur und Ausführung

RadPlan besitzt keine Build-Pipeline. Die Datei `package.json` definiert weder Produktions- noch Entwicklungsabhängigkeiten:

```json
{
  "name": "radplan",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test test/**/*.test.js"
  }
}
```

Für die lokale Entwicklung genügt ein beliebiger statischer HTTP-Server, der das Projektverzeichnis ausliefert (die Anwendung lädt ihre Module über reguläre `<script type="module">`-Importe relativ zu `index.html`). Für den Betrieb der Cloud-Synchronisation wird zusätzlich eine Cloudflare-Pages-Umgebung mit gebundenem KV-Namensraum `RADPLAN_KV` benötigt; ohne diese Bindung liefert `/api` einen Fehler mit Status 500, während die restliche Anwendung auf Basis von `localStorage` uneingeschränkt funktionsfähig bleibt.

### 10.2 Tests

Das Verzeichnis `test/` enthält genau eine Testdatei, `test/autoplan.test.js`, geschrieben gegen den in Node.js integrierten Testrunner (`node:test`) und das integrierte Assertion-Modul (`node:assert/strict`). Die Tests decken ausschließlich reine, zustandsfreie Hilfs- und Regelfunktionen aus `autoplan.js` ab, unter anderem: `isDutyExempt`, `dutyKey`, `computeFairnessSpread`, `averageFromArray`, `listDutyAssignments`, `cleanupAssignmentCell`, `isAbsentOnDay`, `isVacationOnDay`, `isNextDayVacation`, `hasCTLeadershipConflict`, `countWeekendDuties`, `getWeekendDutyKWs`, `wouldCreateDFDF`, `getWeekendStateForKW`, `projectedWeekendDutyCount`, `wouldCreateConsecutiveWeekendDuty` und `computeGridConflicts`. Ergänzend werden Hilfsfunktionen aus `constants.js` (`daysInMonth`, `weekday`, `isoWeekNumber`, `isWorkday`, `getSaxonyHolidaysCached`, `monthKey`) sowie der Datenzustand aus `state.js` (`DATA`) importiert und für Testfixturen verwendet. Als Referenzmonat dient durchgehend Juni 2026, da dieser Monat in Sachsen feiertagsfrei ist und somit eine eindeutige, von Feiertagslogik unbeeinflusste Wochentagsrechnung erlaubt.

Die Tests werden über `npm test` bzw. direkt über `node --test test/**/*.test.js` ausgeführt.

## 11. Bekannte Grenzen und Nicht-Ziele

- Die automatische Planung (Auto-Plan) operiert ausschließlich innerhalb eines einzelnen Kalendermonats; eine monatsübergreifende Optimierung über mehrere Monate hinweg in einem einzigen Lauf ist nicht vorgesehen.
- Die Tausch-Optimierung des Planungsassistenten ist heuristisch und arbeitet mit einer begrenzten Zahl an Durchläufen; sie garantiert keine global optimale, sondern eine innerhalb der gesetzten Iterationsgrenzen bestmögliche Lösung.
- Die Datei `css/mobile-optimization.css` ist im Quellbaum vorhanden, wird jedoch von `index.html` nicht eingebunden; ihre darin definierten Anpassungen für ein spezifisches mobiles Zielgerät wirken sich auf die laufende Anwendung nicht aus.
- Die serverseitige Konfliktbehandlung in `functions/api.js` erkennt Konflikte ausschließlich über einen Vergleich des Zeitstempelfeldes `lastModified`; die inhaltliche, feldweise Zusammenführung konkurrierender Änderungen erfolgt vollständig im Client.
- Die Anwendung verfügt über keine serverseitige Benutzerauthentifizierung oder Mandantentrennung; die Cloudflare-Pages-Function ist auf einen einzigen, gemeinsam genutzten Datensatz unter einem festen KV-Schlüssel ausgelegt.
- Es existiert genau eine automatisierte Testdatei, die sich auf die reinen Hilfs- und Regelfunktionen des Planungsassistenten beschränkt; UI-Rendering, Persistenzlogik und die Cloudflare-Pages-Function selbst sind nicht durch automatisierte Tests abgedeckt.
- Die Feiertagsberechnung ist fest auf die gesetzlichen Feiertage des Bundeslandes Sachsen ausgelegt und nicht für andere Bundesländer oder Länder konfigurierbar.
