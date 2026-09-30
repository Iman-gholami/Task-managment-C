# Operational interface refinement

## Architecture audit — 30 September 2026

The existing application is a dependency-free, native JavaScript frontend. `static/app.js` owns HTML render functions, delegated events, hash routing, scoped API state and modal focus. `static/styles.css` owns layout and both CSS-variable themes. `static/index.html` provides the startup skeleton and live region. There is no React, component framework, build step, third-party icon package or client router to migrate.

The backend is Node.js 24 HTTP, SQLite and native crypto. Its session authentication, role/team scopes, validation, reports and exports are the authoritative business logic. This work changes no backend files, endpoints, request bodies, permission rules or database structures.

### Existing workflows and constraints

- Analysts see their own work; SOC managers see SOC teams; security managers also manage accounts. The actual roles are Analyst, SOC Manager and Security Manager.
- Tasks support eight statuses, four priorities and complexity levels, manager review, recorded hours, quality, checklists, comments, attachments and references. Work team can differ from primary team.
- A daily SOC shift has eight named activities, optional notes/issues/references, attachments, MISP IOC count, Bale sharing and individual tickets. Completed shifts are read-only.
- Team, employee performance and five report types derive from recorded work. Tasks and routine activity remain separate. Excel export uses the existing endpoint and filters.
- The model has no staffing schedule, live presence, incident system, multi-workspace switching or independent handover entity. UI must not imply otherwise.

### Findings and shared-component impact

| Area | Finding | Refinement |
| --- | --- | --- |
| Shell | Tiny labels, unusable collapsed sign-out, unconditional notification dot and saved message | Legible rail, accessible account menu, actual notification count and request state |
| Dashboard | Flat attention queue, hidden status below 1200px, oversized analytics | Ranked operational queue, persistent status/deadline, actual shift records, secondary analytics |
| Task views | Route changes clear filters; sort compares numbers as strings | Per-view state, directional semantic sorting, visible filters and bounded pagination |
| Shared tables | Small type, wide mobile tables, blank action headers | Clear title hierarchy, labelled cells and responsive stacked rows |
| Shared overlays | Full dialog obscures context; editing loses task navigation | Task drawer, retained edit context, inert background and focus restoration |
| Shift activity | Checkbox and note controls lack accessible names | Explicit labels, task/issue continuity from existing records |
| Reports | Seven permanent filters | Primary scope/date filters and disclosed task filters |
| Themes | Low-contrast metadata and ad hoc small typography | Semantic tokens, deliberate light/dark palettes and consistent controls |

Shared callsites reviewed: `metrics` (dashboard/performance), `status` (tasks/shifts/reports), `taskTable` (task views), `performanceTable` (performance/reports), `shiftTable` (history/reports/profile), `openOverlay` (create/edit/detail/search/notifications), and `field` (all forms). The UI refinement keeps their data sources and business calculations intact.

## Verification record

Recorded after implementation: API and render contract tests, real Chromium workflows, keyboard/focus behavior, and screenshots of each major screen in both themes at 1440, 1280, 1024, 768 and 390 pixels. Automated checks complement visual review; they are not a claim of a complete WCAG certification.
