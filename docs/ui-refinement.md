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

Verified implementation: `39058f03cfbd3a631c1f7407dc098fd28709dc5b`.

- All 20 Node API/render tests passed, including numeric and priority sorting with missing values.
- The existing Chromium workflow suite passed: task/checklist/comment persistence, shift completion, ticket records and Excel download.
- The UI suite passed across 130 screen/theme/viewport combinations: 13 screens, two themes and five widths (1440, 1280, 1024, 768, 390). It reported no runtime errors, horizontal page overflow, unnamed visible controls, hidden attention-row status/deadline labels or sampled UI text below 12 px.
- Text and semantic-color tokens passed 4.5:1 contrast checks on the three main surfaces in both themes. Keyboard search, scoped view retention, nested drawer cancellation, property focus, comment draft preservation, mobile sorting and shift-section navigation passed.
- Analyst issue/note recording and task review submission, followed by SOC manager approval and reload persistence, passed against the real server.
- Contact sheets for all widths/themes and individual desktop/mobile details were visually reviewed. Review corrections included tighter dashboard rows, immediate dialog focus, readable mobile filters, a default task table that fits tablet width, and direct access to shift context.
- `server.js` and all files in `lib/` are byte-for-byte unchanged from the pre-refinement baseline. No runtime dependency was added.

[Successful CI run and screenshot artifacts](https://github.com/Iman-gholami/Task-managment-C/actions/runs/36698784309).

Automated checks complement visual review; they are not a claim of a complete WCAG certification. Shift staffing schedules, live presence and independent handover/issue-resolution records remain outside the actual model; the interface labels the available recorded context accordingly.
