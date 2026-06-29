# Swarm Project Matrix: RadPlan Tooltip Optimization

> **Commander's Note:** This file is the Single Source of Truth (SSOT). Always run `python C:\Users\marku\.gemini\config\skills\swarm-commander\scripts\swarm_cli.py sync` after making any edits to propagate changes to the database.

## 1. Project Goal & Architecture
**Objective:** Optimize tooltips in RadPlan to dynamically explain and interpret hovered values, results, and cells. Convert browser tooltips (title) to custom ones (data-tooltip).
**MECE Guarantee:** Task 1 affects only the global tooltip engine (js/tooltip.js), Task 2 affects only grid cell tooltips (js/celltooltip.js), and Task 3 affects only the analytics views (js/analytics/mod-*.js).

## 2. Agent Roster (Live Tracking)
*Update this table, then run `swarm_cli.py sync` to propagate changes to the JSON state.*

| Agent UUID | Persona | Status | Workspace | Allowed Context (Paths) | Memory Refresh Strategy |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `8a67e0b1-9e9b-49c3-b3e0-0a96d339ddeb` | `Tooltip_Engine_Developer` | COMPLETED | `inherit` | `js/tooltip.js` | None required |
| `efe3da06-52f8-40fd-9adf-9edfcefc3475` | `Grid_Tooltip_Developer` | COMPLETED | `inherit` | `js/celltooltip.js` | None required |
| `27a025b5-77f3-4768-8496-bcf8637fef4a` | `Analytics_Template_Migrator` | COMPLETED | `inherit` | `js/analytics/` | None required |

## 3. MECE Execution Graph
*Strict dependency tracking and complexity scoring.*

| Task ID | Description (MECE) | Assigned Persona | Depends On | Complexity (1-10) | Target Paths | Fallback / Escalation | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| TSK-01 | Enhance global tooltip engine with HTML and dynamic interpretations | Tooltip_Engine_Developer | None | 7 | `js/tooltip.js` | Escalate to Swarm Commander | COMPLETED |
| TSK-02 | Add dynamic monthly stats to calendar cell detail tooltips | Grid_Tooltip_Developer | None | 6 | `js/celltooltip.js` | Escalate to Swarm Commander | COMPLETED |
| TSK-03 | Replace browser tooltips with custom ones in analytics templates | Analytics_Template_Migrator | None | 5 | `js/analytics/` | Escalate to Swarm Commander | COMPLETED |

## 4. Final Quality Audit Protocol
| Auditor Persona | Verification Criteria | Status |
| :--- | :--- | :--- |
| `QA_Security_Auditor` | Valid JS code, no syntax errors, functional tooltips | PENDING |

