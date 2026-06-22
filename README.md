# RadPlan — Digitale Dienstplanung für die Klinik für Radiologie & Nuklearmedizin

RadPlan ist eine browserbasierte Single-Page-Anwendung zur Personal- und Dienstplanung in einer Klinik für Radiologie & Nuklearmedizin. Die Anwendung bildet einen monatlichen Dienstplan als interaktive Tabelle ab, in der für jede:n Mitarbeitende:n pro Kalendertag ein Arbeitsplatz, ein Abwesenheitsstatus und/oder ein Bereitschafts- bzw. Hintergrunddienst eingetragen werden kann.

## Inhaltsverzeichnis

- [Features](#features)
- [Technische Architektur](#technische-architektur)
- [Installation & Start](#installation--start)
- [Externe Abhängigkeiten](#externe-abhängigkeiten)
- [Datenmodell](#datenmodell)
- [Tastaturkürzel](#tastaturkürzel)
- [Cloud-Synchronisation](#cloud-synchronisation)
- [Entwicklung](#entwicklung)
- [Lizenz](#lizenz)

## Features

### Planung & Dienste
- **Monatsraster**: Interaktive Tabelle mit Mitarbeitenden × Kalendertagen
- **Arbeitsplätze**: MRT, CT, Sonographie, Angiographie, Mammographie, Kinder-US, Wermsdorf, Teleradiologie
- **Status**: Frei, Urlaub, Zusatzurlaub, Sonderurlaub, FZA, Krank, Kind Krank, §15c, Weiterbildung
- **Dienste**: Bereitschaftsdienst (D) und Hintergrunddienst (HG) mit Wochenend-/Feiertagslogik
- **RBN-Sonderzeile**: Neuroradiologischer Rufbereitschaftsdienst mit eigener Namensauswahl

### Automatische Planung
- **Auto-Plan-Algorithmus**: Regelbasierte, mehrphasige Greedy-Optimierung mit lokaler Suche
- **Harte Constraints**: Abwesenusschlusse, Folgetag-Urlaub, CT-Leitungskonflikt, Wochenend-Begrenzung
- **Weiche Kriterien**: Fairness-Berechnung, Wunscherfüllung, historische Belastung
- **Gewichtungsprofile**: Ausgewogen, Fairness-optimiert, Wunscherfüllung-optimiert
- **Qualitätsscore (NFI)**: Bewertung der Planungsqualität mit detaillierter Analyse

### Planungsmodus
- **Isolierte Sandbox**: Entwürfe unabhängig vom produktiven Plan
- **Undo/Redo**: Vollständige Historie innerhalb der Planungssitzung
- **Fixierung**: Zellen für Auto-Plan sperren
- **Dienstwünsche**: BD-Wunsch, HG-Wunsch, Kein-Dienst

### Neue Features (v2.0)
- **Globaler Verlauf**: Undo/Redo für alle Modi (nicht nur Planungsmodus)
- **Erweiterte Tooltips**: Detailinformationen bei Mouseover über Zellen
- **Mehrfachauswahl**: Verschiedene Auswahlmodus (Einzel, Multi, Bereich, Spalte)
- **Druckvorschau**: Visuelle Vorschau mit Layout-Optionen vor dem Druck
- **PDF-Export**: Native PDF-Generierung mit jsPDF und html2canvas
- **Tastaturkürzel-Overlay**: Strg+? zeigt alle verfügbaren Kürzel
- **Einstellungen**: Panel zur Konfiguration von Tooltips, Auswahlmodus, etc.

### Mitarbeitenden & Teams
- **Profile**: Detaillierte Mitarbeitendenprofilen mit KPI, Diagrammen, Jahresverlauf
- **Team-Analytics**: Abteilungsstatistiken mit wählbaren Zeiträumen
- **Jahresplaner**: Gitter, Fairness-Analyse, Soll/Ist, Abwesenheiten, Projektion
- **Abteilungsansicht**: Tages- und Jahresabdeckung pro Arbeitsplatz

### UI/UX
- **Glasmorphismus-Design**: Modernes, glassmorphism-basiertes Interface
- **Hell-/Dunkelmodus**: Nahtloser Übergang mit View-Transitions
- **Mobile-Optimiert**: Touch-Geste, Bottom-Sheets, radiale Schnellaktionsmenüs
- **Befehlspalette**: Schnellnavigation mit Strg/Cmd+K
- **Drag-&-Drop**: JSON-Import, Dienst-Badges verschieben
- **Responsive**: Anpassung an alle Bildschirmgrößen

## Technische Architektur

### Projektstruktur

```
radplan-main/
├── index.html              # HTML-Hülle mit allen Dialogen und Containern
├── css/
│   ├── core.css           # CSS-Custom-Properties, Themes, Resets, Animationen
│   ├── layout.css         # Hauptlayout, Raster, Zellzustände
│   ├── components.css     # UI-Bausteine (Buttons, Chips, Modals, etc.)
│   ├── modals.css         # Dialogfenster
│   ├── views.css          # Ansichten (Profil, Dashboard, Abteilung)
│   ├── contextmenu.css    # Kontextmenü-Styling
│   ├── features.css       # Neue Features (Tooltips, Selection, Print Preview)
│   ├── mobile-optimization.css  # Mobile-spezifische Anpassungen
│   └── print.css          # Druckdarstellung
├── js/
│   ├── app.js             # Einstiegspunkt, Orchestrierung, globale Events
│   ├── constants.js       # Konstanten, Hilfsfunktionen, Daten
│   ├── state.js           # Globaler Zustand, Persistenz, Cloud-Sync
│   ├── model.js           # Datenzugriff, Ableitungen, Statistiken
│   ├── render-grid.js     # Monatsraster-Rendering, Navigation
│   ├── render-modals.js   # Dialog-Rendering, Profil, Auto-Plan-UI
│   ├── render-dept.js     # Abteilungsansicht
│   ├── render-employee-dashboard.js  # Mitarbeitenden-Bereich
│   ├── autoplan.js        # Auto-Plan-Algorithmus
│   ├── yearplan.js        # Jahresplaner
│   ├── neuralgraph.js     # Canvas-Visualisierung für Auto-Plan
│   ├── commandpalette.js  # Befehlspalette
│   ├── contextmenu.js     # Kontextmenü-Komponente
│   ├── viewtransition.js  # View-Transitions-API
│   ├── core/
│   │   ├── history.js     # Globaler Undo/Redo-Verlauf
│   │   ├── tooltips.js    # Tooltip-System mit Detailinformationen
│   │   └── selection.js   # Mehrfachauswahl-System
│   └── features/
│       ├── index.js       # Feature-Initialisierung
│       ├── print-preview.js   # Druckvorschau-Modal
│       └── pdf-generator.js   # PDF-Generierung mit jsPDF
├── functions/
│   └── api.js             # Cloudflare Pages Function (Backend)
├── img/
│   ├── icon.svg
│   └── icon_animated.svg
├── test/
│   ├── autoplan.test.js   # Unit-Tests für Auto-Plan-Algorithmus
│   └── contrast-audit.mjs # Kontrast-Audit
├── manifest.json          # PWA-Manifest
└── package.json           # NPM-Konfiguration
```

### Modul-System

Die Anwendung verwendet **ES6-Module** und wird direkt vom Browser geladen. Externe Bibliotheken werden über CDN eingebunden.

```javascript
// Import-Beispiel
import { state, DATA } from './state.js';
import { render } from './render-grid.js';
```

### State-Management

Der globale Zustand wird in `state.js` verwaltet und umfasst:
- `DATA`: Monatsbasierte Dienstpläne (`{ [monthKey]: { employees, assignments, rbn } }`)
- `state`: Aktueller Zustand (Jahr, Monat, Edit-Modus, Multi-Edit, etc.)
- `planData`: Isolierter Planungsmodus-Zustand

### Persistenz

- **localStorage**: Primäre Speicherung unter `radplan_v3`
- **Cloudflare KV**: Optionale Cloud-Synchronisation über `/api`
- **Plan-Sessions**: Entwürfe unter `radplan_v3_plan_<monthKey>`
- **History**: Undo/Redo-Verlauf unter `radplan_v3_history`

## Installation & Start

### Voraussetzungen

- Node.js 18+ (für Tests)
- Statischer HTTP-Server (z.B. `npx serve` oder Python `http.server`)
- Cloudflare Account (optional, für Cloud-Synchronisation)

### Lokale Entwicklung

```bash
# Projekt klonen/kopieren
cd radplan-main

# Statischen Server starten
npx serve .
# oder
python -m http.server 8000

# Im Browser öffnen
open http://localhost:8000
```

### Cloud-Synchronisation (optional)

1. Cloudflare Pages Projekt erstellen
2. KV-Namensraum `RADPLAN_KV` erstellen
3. `functions/api.js` in den Pages-Ordner deployen
4. KV-Bindung in den Pages-Einstellungen konfigurieren

## Externe Abhängigkeiten

### Produktion (CDN)

| Bibliothek | Version | Zweck | CDN |
|-----------|---------|-------|-----|
| Chart.js | 4.4.4 | Diagramme (Donut, Bar, Line) | cdn.jsdelivr.net |
| GSAP | 3.12.2 | Animationen | cdnjs.cloudflare.com |
| jsPDF | 2.5.1 | PDF-Generierung | cdnjs.cloudflare.com |
| jsPDF-AutoTable | 3.8.2 | Tabellen in PDF | cdnjs.cloudflare.com |
| html2canvas | 1.4.1 | HTML zu Canvas für PDF | cdnjs.cloudflare.com |

### Schriftarten

- **IBM Plex Sans**: UI-Texte
- **IBM Plex Mono**: Code, Zahlen, Chips

### Entwicklung

| Tool | Zweck |
|------|-------|
| Node.js Test Runner | Unit-Tests |
| ESLint | Code-Qualität (optional) |

## Datenmodell

### Grundstruktur

```javascript
DATA = {
  [monthKey(y, m)]: {
    employees: string[],                           // Aktive Mitarbeitende
    assignments: { [empName]: { [tag]: Assignment } },
    rbn: { [tag]: string },                       // RBN-Sonderzeile
    comments: { [empName]: { [tag]: string } }
  }
}
```

### Assignment (Tageszelle)

Eine kodierte Zeichenkette:
- Arbeitsplatz-Codes: `MR`, `CT`, `US`, `AN`, `MA`, `KUS`, `W`, `T` (kombinierbar mit `/`)
- Status-Codes: `F`, `U`, `ZU`, `SU`, `FZA`, `K`, `KK`, `§15c`, `WB` (exklusiv)
- Dienst-Zusätze: `D` (Bereitschaft), `HG` (Hintergrund)

### Konstanten

```javascript
WORKPLACES = [
  { code: "MR", label: "MRT", bg: "#DBEAFE", fg: "#1D4ED8" },
  { code: "CT", label: "CT", bg: "#FFEDD5", fg: "#C2410C" },
  // ...
]

STATUSES = [
  { code: "F", label: "Frei", bg: "#F1F5F9", fg: "#475569" },
  { code: "U", label: "Urlaub", bg: "#EDE9FE", fg: "#5B21B6" },
  // ...
]
```

## Tastaturkürzel

### Global

| Tastenkombination | Wirkung |
|------------------|---------|
| `Strg/Cmd+K` | Befehlspalette öffnen |
| `Strg/Cmd+Z` | Rückgängig |
| `Strg/Cmd+Y` / `Strg+Shift+Z` | Wiederherstellen |
| `Strg/Cmd+?` | Tastaturkürzel anzeigen |
| `Strg/Cmd+A` | Alle auswählen |
| `Alt+←` | Vorheriger Monat |
| `Alt+→` | Nächster Monat |

### Raster-Navigation

| Taste | Wirkung |
|-------|---------|
| `←` `↑` `→` `↓` | Zelle navigieren |
| `1`-`8` | Arbeitsplatz direkt zuweisen |
| `D` | Bereitschaftsdienst umschalten |
| `H` | Hintergrunddienst umschalten |
| `Entf` / `Rücktaste` | Zelle löschen |
| `Eingabe` | Editor öffnen |
| `Shift+Klick` | Zelle zur Auswahl hinzufügen |

### Editor

| Taste | Wirkung |
|-------|---------|
| `D` | Bereitschaftsdienst umschalten |
| `H` | Hintergrunddienst umschalten |
| `S` / `Eingabe` | Speichern |
| `Esc` | Abbrechen |

## Cloud-Synchronisation

### Architektur

```
Client (Browser) ←→ Cloudflare Pages Function ←→ Cloudflare KV
```

### Endpunkte

| Methode | Route | Beschreibung |
|---------|-------|--------------|
| `GET` | `/api` | Daten laden |
| `POST` | `/api` | Daten speichern |
| `OPTIONS` | `/api` | CORS-Preflight |

### Konfliktbehandlung

- **Client-seitig**: Feldweiser Drei-Wege-Merge bei 409-Konflikten
- **Lokale Priorität**: Lokale Änderungen gewinnen bei Konflikt
- **Benachrichtigung**: Toast mit Konfliktstatistik

## Entwicklung

### Tests

```bash
# Unit-Tests ausführen
npm test
# oder
node --test test/**/*.test.js
```

### Code-Stil

- ES6-Module
- Modulare ES6-Architektur mit klaren Schichten
- CDN-basierte externe Bibliotheken (jsPDF, html2canvas, Chart.js, GSAP)
- CSS-Custom-Properties für Theming und Mobile-Optimierung
- ARIA-Attribute für Barrierefreiheit

### Bekannte Grenzen

- Auto-Plan operiert innerhalb eines einzelnen Monats
- Tausch-Optimierung ist heuristisch (keine Garantie für globale Optimalität)
- Feiertagsberechnung ist auf Sachsen festgelegt
- Keine serverseitige Benutzerauthentifizierung

## Lizenz

Proprietär — Klinik für Radiologie & Nuklearmedizin
