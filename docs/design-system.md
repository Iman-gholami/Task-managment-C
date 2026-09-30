# Cadence — UI specification

## Identity

Cadence is a quiet workspace for the human work behind security operations. Typography, continuous table surfaces, and controlled indigo accents establish hierarchy. The brand uses a compact ascending-line mark and a wordmark; no security shield, neon visualization, or incident-monitoring imagery is used.

Required QA widths are 1440, 1280, 1024, 768 and 390 px. The navigation is 224 px (204 px on laptops), with a 72 px compact rail and a 56 px mobile rail. The header is 64 px, or 56 px on mobile. Main content uses 32/24/12 px horizontal spacing with a 1760 px maximum width. Tablet tables can scroll inside their containers; mobile tables become continuous, labelled two-column records. Status, priority and due dates remain visible.

## Semantic tokens

| Token | Dark | Light |
| --- | --- | --- |
| App background | `#10141B` | `#F2F4F7` |
| Surface | `#171C25` | `#FFFFFF` |
| Secondary surface | `#1E2530` | `#EEF2F6` |
| Elevated surface | `#232C39` | `#FFFFFF` |
| Hover | `#293341` | `#E3E9F2` |
| Active | `#27334C` | `#E8EDFF` |
| Primary text | `#EDF1F7` | `#202B3C` |
| Secondary text | `#BEC8D7` | `#49576B` |
| Muted text | `#A1AEC1` | `#59677B` |
| Accent text | `#A9B8FF` | `#4052B5` |
| Primary button | `#5262D6` | `#5262D6` |
| Focus | `#B2C1FF` | `#4356C0` |
| Success | `#7AD9AE` | `#166843` |
| Warning | `#EFC179` | `#805013` |
| Danger | `#FF9C9E` | `#AD303F` |
| Info | `#8DC8FF` | `#245F9B` |
| Border | `#303C4E` | `#D7DEE8` |
| Control border | `#526078` | `#8491A4` |

The system uses locally available Inter with platform sans-serif fallback; there is no font dependency or remote request. Type tokens are 12 px metadata, 13 px labels, 14 px body, 16 px section titles and 26 px page titles (23 px on mobile). Table titles use 14 px and secondary context uses 12 px. Tabular numbers are global; monospace is reserved for IDs and technical values. Text and semantic-status tokens are checked at 4.5:1 against the three primary surfaces in both themes.

Spacing tokens follow 4/8/12/16/20/24/32 px. Radius tokens are 6 px controls, 10 px panels and 12 px dialogs. Controls are 36 px, increasing to 40 px on mobile; compact actions remain at least 32 px (36 px on mobile). Floating overlays alone receive the shared shadow. Motion is 160 ms and respects reduced-motion settings. Header, overlay and toast layers use centralized z-index tokens.

## Components and interactions

The implementation contains reusable renderers for buttons, fields, selects, date controls, checkbox/checklist rows, avatars, status/priority/complexity indicators, tables, pagination, filter bars, metric strips, charts, tickets, attachments, comments, empty states, modals, and the shell. Native controls retain browser keyboard behavior. Table header buttons sort. Inline transparent native selects give status and priority a compact visual treatment. Status always combines text with a dot; priority uses a small magnitude indicator; complexity uses four thin bars plus a label.

The command dialog searches actual scoped tasks (including IDs), people, dated shift logs, pages and report types. Its grouped results support Arrow Up/Down and Enter through a labelled combobox/listbox; Ctrl/Command K opens it. N creates a task when focus is outside a text control. The account menu includes shortcut help and sign-out at every viewport. Native disclosure sections implement progressive forms. Overlays make the background inert, trap keyboard focus, close with Escape, and restore their triggering control even after a background render. A task opens in a right-side drawer. Cancelling a nested task edit returns to that task. Inline saves retain the focused property and drawer scroll; comment drafts survive property edits. Sidebar buttons have titles when collapsed. The document has a skip link, named controls, live feedback, and a startup skeleton. Error messages are specific and actionable; failed edits do not report success. A server error can be retried from startup, and form errors preserve typed values.

Multi-select, radio groups, standalone Kanban, and drag-and-drop checklists are intentionally not introduced into workflows that do not require them. The current filters use single-value selectors. The table is the primary work view.

## Screen specification

All views are implemented in the application, not separate static mockups. Global loading uses a shell-shaped skeleton before the authorized snapshot is ready; subsequent navigation uses the loaded data. Submissions disable their primary button while pending. Shared error behavior is an inline form message for validation, a toast for a rejected quick update, and an actionable startup retry for connection failure.

| Screen / primary user | Purpose and information hierarchy | Layout / reusable components | Primary / secondary actions | Empty, loading, error behavior |
| --- | --- | --- | --- | --- |
| Login / all | Identity, email, password | Split brand/story and compact form | Sign in / demo account details | Credentials retained on failure; disabled submit while pending; inline sign-in error |
| Analyst dashboard / analyst | Own active, review and overdue work; shift; completed output | Metric strip, work queue, shift coverage, small trend, routine summary | Start/continue shift / create task | Clear queue empty state; shell skeleton; recoverable load error |
| SOC Manager dashboard / SOC Manager | SOC attention queue, review and overdue work, shift coverage, output | Same shell with SOC-scoped data | Create task / view shift logs | Zero values are explicit; absent shifts say Not started; shared load/error behavior |
| Security Manager dashboard / Security Manager | Department work and contributions across teams | Department-scoped metric strip, queues, trends, routine summary | Create task / performance | No ranking; empty queue and data states; shared load/error behavior |
| My Tasks / all | Own assignments, title then status and deadline | Search/filter toolbar, sticky table, checklist progress, pagination | Create task / inline updates | Filtered emptiness offers Clear filters; unfiltered emptiness offers Create task; failed edits show server message |
| Team Tasks / all | Primary-team tasks within authorized visibility | Same table, team scope selected | Create task / search, sort, columns | Shared table states |
| All Tasks / all | All authorized tasks, not unrestricted organizational access | Same table with all scope | Create task / filter and pagination | Shared table states |
| Create Task / all | Title/context, assignee, work properties, dates; advanced checklist/reference/work team | Compact modal, two-column form, disclosure | Create task / cancel | Pending submit disabled; required values and date range validated; no lost input on failure |
| Task Details / owner and managers | Title/context, checklist, attachments, comments, history, properties | Right-side drawer with context panel; mobile properties move above detailed activity | Update status / comment, attach, record hours, review | Missing sections use brief text; mutations preserve contextual view; server validation toast |
| Active Shift / SOC employee | Analyst/date, eight activity items, tickets, completion recap | Continuous checklist plus summary, continuity context and ticket side column | Complete shift / mark activity, add note, report issue, add ticket | Eight unchecked activities at start; incomplete closure explains remaining work |
| Completed Shift / authorized viewer | Completed activities and traceable output | Same layout, read-only controls | Inspect history / download attachments | No editing; errors cannot silently reopen the shift |
| Shift History / authorized viewer | Date, employee, completion, IOCs, tickets | Date range and dense table | Open shift / today’s shift | No selected-period activity state; shared shell loading |
| Team Overview / all | Primary-team membership and workload | Compact team counts plus employee directory | View performance / inspect employee | Explicit zero member counts; authorized subset only |
| Employee Directory / all | Name, role, team, workload, open tasks, shift | Directory with task counts, overdue/review context and recorded shift status | Open employee / explore performance | Zero workload says No open tasks; non-SOC cells say Outside SOC; no presence or capacity inference |
| Employee Profile / employee or manager | Name, role, primary team, selected period, concrete contributions | Employee performance route and selector | Export / change employee or period | No-activity state, no ranking, same error behavior |
| Employee Performance / employee or manager | Completed tasks and hours separated from routine outputs | Metrics, complexity bars, routine metrics, task table, daily shift drilldown | Export / ticket-number drilldown, open task | Zero-safe ratios and empty tables; date controls retained |
| Performance Overview / all within scope | Team task work, routine work, employee contribution | Metrics, two analytic panels, task table, alphabetical contribution list | Export / inspect employee | No score or leaderboard; zero-safe chart calculations |
| Reports / all within scope | Report type, period, dimensions, detailed rows | Compact report-type selector, filters, continuous table | Export to Excel / reset | No-activity state; scope and dates stay visible, extra task filters use disclosure |
| Employee Monthly Report / employee or manager | Task work details followed by routine evidence | Task table and separate shift table; 3-sheet workbook | Export / employee/date filters | Empty sections stay distinct rather than synthesizing totals |
| Team Monthly Report / manager | Same evidence for employees of a primary team | Team filter plus monthly layout | Export / inspect tasks and shifts | Same report states |
| Task Report / all within scope | Title, description, quality, start/end, hours, executor, complexity | Task table; workbook includes executor and team fields | Export / status, complexity, quality | Empty result message and filter reset |
| SOC Shift Activity Report / authorized viewer | Shift day, analyst, completion, IOCs, tickets | Shift table with drilldown | Export / analyst/date filters | No recorded activity message |
| Ticket Report / authorized viewer | Analyst/date, number, reference and description | Searchable dense table and external links | Export / search and filters | No ticket records message; search preserved in workbook |
| Administration / Security Manager | Permission model before account records | Three compact role explanations, user table | Add employee / manage user | Unauthorized access gets explanatory state; duplicate email/weak initial password validated |
| User / Role Management / Security Manager | User identity, role and primary team | Focused modal | Save changes / cancel | Pending submit; clear validation; cannot remove own administrator role |

## Operational details

The exact eight activity titles in the brief are stored server-side and reused by the UI. Uploading malicious IP/domain files has no IP/domain count controls. MISP numeric entry is independent of file upload. A ticket modal requires its number. Reported issues expose fields only when requested; issue attachments remain associated with the activity. Completed shifts lock on the server as well as in the interface.

The task detail drawer retains one continuous split layout. The dashboard has five cohesive actionable metrics, a ranked attention queue with overdue/review/blocked groups, current work and today’s recorded shifts. Monthly chart and routine totals are secondary disclosure content. Attention ranking uses overdue status, priority and due date; no new task state is introduced.

Shift counts describe logs from SOC members in the current access scope. They are not staffing expectations or live presence. Continuity surfaces existing issue summaries, open assigned tasks, and notes/issues from the same analyst’s previous log. It does not invent an independent handover or issue-resolution workflow.

Each task scope remembers its search, filters, sorting, pagination and scroll position during the session. Status/priority filtering is visible and clearable; numeric values and enums sort semantically in both directions with `aria-sort`. Empty values sort last. A blank footer no longer claims every change is saved: it shows the last refresh, pending request or failure.

Light mode uses independent surface and text values. The existing icon paths, native form controls, API requests and server-side business rules are preserved.

## Validation

`npm test` covers the existing API/persistence/export contracts and real role-scoped render fixtures. `npm run test:browser` exercises the application’s task/comment/checklist, daily shift, ticket, completion, persistence and XLSX flows. `npm run test:ui` covers retained filters, semantic sorting, nested drawer navigation, focus, keyboard search, analyst issue/note persistence, review submission and manager approval.

The UI suite captures 13 major screens (including sign-in and search) in dark/light at 1440/1280/1024/768/390 px, audits control naming, visible operational statuses, text sizes, root overflow and token contrast, and generates contact sheets for human review. These targeted checks support WCAG AA-oriented implementation; they do not constitute a complete accessibility certification. Screenshots and audit JSON are retained in the GitHub Actions artifact.
