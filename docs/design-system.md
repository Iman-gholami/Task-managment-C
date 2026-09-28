# Cadence — UI specification

## Identity

Cadence is a quiet workspace for the human work behind security operations. Typography, continuous table surfaces, and controlled indigo accents establish hierarchy. The brand uses a compact ascending-line mark and a wordmark; no security shield, neon visualization, or incident-monitoring imagery is used.

Desktop targets: 1440, 1600, and 1920 px. The navigation is 234 px and collapses to 76 px. The header is 66 px. Main content uses 32 px horizontal spacing and a maximum 1740 px width; tables scroll inside their own containers. At narrower widths the sidebar becomes compact, detail layouts stack, and tables preserve their useful columns.

## Semantic tokens

| Token | Dark | Light |
| --- | --- | --- |
| Background | `#0B0D12` | `#F6F7F9` |
| Surface | `#11141B` | `#FFFFFF` |
| Secondary surface | `#171B24` | `#F0F2F5` |
| Elevated surface | `#1C212C` | `#FFFFFF` |
| Hover | `#222936` | `#ECEFF3` |
| Primary text | `#F4F6F8` | `#171A1F` |
| Secondary text | `#A7AFBC` | `#59616D` |
| Muted text | `#838C9C` | `#687381` |
| Accent text | `#7D8BFF` | `#5666E8` |
| Primary button | `#6575ED` | `#5666E8` |
| Success | `#3CCB8E` | `#238A62` |
| Warning | `#E6A94A` | `#966119` |
| Danger | `#F26666` | `#C63E3E` |
| Border | `#252B36` | `#E2E5E9` |

The font stack prefers locally installed Inter and Geist with platform sans-serif fallback. No external font request is required. Page headings are 24–28 px, section titles 14–16 px, and compact operational text 11–13 px. Tabular numbers are global; monospace is reserved for task IDs and ticket numbers. Spacing follows 4/8/12/16/20/24/32/40/48 px. Buttons and inputs use 6–8 px radii, panels 10 px, dialogs 13 px. Transitions are approximately 150 ms and honor reduced-motion preferences.

## Components and interactions

The implementation contains reusable renderers for buttons, fields, selects, date controls, checkbox/checklist rows, avatars, status/priority/complexity indicators, tables, pagination, filter bars, metric strips, charts, tickets, attachments, comments, empty states, modals, and the shell. Native controls retain browser keyboard behavior. Table header buttons sort. Inline transparent native selects give status and priority a compact visual treatment. Status always combines text with a dot; priority uses a small magnitude indicator; complexity uses four thin bars plus a label.

The command dialog is a searchable action list. Native disclosure sections implement progressive forms. The modal traps keyboard focus, closes with Escape, and restores focus where possible. Sidebar buttons have titles when collapsed. The document has a skip link, named controls, live feedback, and a startup skeleton. Error messages are specific and actionable; failed edits do not report success. A server error can be retried from startup, and form errors preserve typed values.

Multi-select, radio groups, standalone Kanban, and drag-and-drop checklists are intentionally not introduced into workflows that do not require them. The current filters use single-value selectors. The table is the primary work view.

## Screen specification

All views are implemented in the application, not separate static mockups. Global loading uses a shell-shaped skeleton before the authorized snapshot is ready; subsequent navigation uses the loaded data. Submissions disable their primary button while pending. Shared error behavior is an inline form message for validation, a toast for a rejected quick update, and an actionable startup retry for connection failure.

| Screen / primary user | Purpose and information hierarchy | Layout / reusable components | Primary / secondary actions | Empty, loading, error behavior |
| --- | --- | --- | --- | --- |
| Login / all | Identity, email, password | Split brand/story and compact form | Sign in / demo account details | Credentials retained on failure; disabled submit while pending; inline sign-in error |
| Analyst dashboard / analyst | Own active, review and overdue work; shift; completed output | Metric strip, work queue, shift coverage, small trend, routine summary | Start/continue shift / create task | Clear queue empty state; shell skeleton; recoverable load error |
| SOC Manager dashboard / SOC Manager | SOC attention queue, review and overdue work, shift coverage, output | Same shell with SOC-scoped data | Create task / view shift logs | Zero values are explicit; absent shifts say Not started; shared load/error behavior |
| Security Manager dashboard / Security Manager | Department work and contributions across teams | Department-scoped metric strip, queues, trends, routine summary | Create task / performance | No ranking; empty queue and data states; shared load/error behavior |
| My Tasks / all | Own assignments, title then status and deadline | Search/filter toolbar, sticky table, checklist progress, pagination | Create task / inline updates | No matches yields “You’re all caught up”; failed edits show server message |
| Team Tasks / all | Primary-team tasks within authorized visibility | Same table, team scope selected | Create task / search, sort, columns | Shared table states |
| All Tasks / all | All authorized tasks, not unrestricted organizational access | Same table with all scope | Create task / filter and pagination | Shared table states |
| Create Task / all | Title/context, assignee, work properties, dates; advanced checklist/reference/work team | Compact modal, two-column form, disclosure | Create task / cancel | Pending submit disabled; required values and date range validated; no lost input on failure |
| Task Details / owner and managers | Title/context, checklist, attachments, comments, history, properties | 2-column modal with fixed-width context panel | Update status / comment, attach, record hours, review | Missing sections use brief text; mutations preserve contextual view; server validation toast |
| Active Shift / SOC employee | Analyst/date, eight activity items, tickets, completion recap | Continuous checklist with ticket/summary side column | Complete shift / mark activity, add note, report issue, add ticket | Eight unchecked activities at start; incomplete closure explains remaining work |
| Completed Shift / authorized viewer | Completed activities and traceable output | Same layout, read-only controls | Inspect history / download attachments | No editing; errors cannot silently reopen the shift |
| Shift History / authorized viewer | Date, employee, completion, IOCs, tickets | Date range and dense table | Open shift / today’s shift | No selected-period activity state; shared shell loading |
| Team Overview / all | Primary-team membership and workload | Compact team counts plus employee directory | View performance / inspect employee | Explicit zero member counts; authorized subset only |
| Employee Directory / all | Name, role, team, workload, open tasks, shift | Alphabetical table with avatars and restrained bars | Open employee / explore performance | Empty workloads labeled Available, non-SOC shift cells use dash |
| Employee Profile / employee or manager | Name, role, primary team, selected period, concrete contributions | Employee performance route and selector | Export / change employee or period | No-activity state, no ranking, same error behavior |
| Employee Performance / employee or manager | Completed tasks and hours separated from routine outputs | Metrics, complexity bars, routine metrics, task table, daily shift drilldown | Export / ticket-number drilldown, open task | Zero-safe ratios and empty tables; date controls retained |
| Performance Overview / all within scope | Team task work, routine work, employee contribution | Metrics, two analytic panels, task table, alphabetical contribution list | Export / inspect employee | No score or leaderboard; zero-safe chart calculations |
| Reports / all within scope | Report type, period, dimensions, detailed rows | Compact report-type selector, filters, continuous table | Export to Excel / reset | No-activity state; filters remain visible |
| Employee Monthly Report / employee or manager | Task work details followed by routine evidence | Task table and separate shift table; 3-sheet workbook | Export / employee/date filters | Empty sections stay distinct rather than synthesizing totals |
| Team Monthly Report / manager | Same evidence for employees of a primary team | Team filter plus monthly layout | Export / inspect tasks and shifts | Same report states |
| Task Report / all within scope | Title, description, quality, start/end, hours, executor, complexity | Task table; workbook includes executor and team fields | Export / status, complexity, quality | Empty result message and filter reset |
| SOC Shift Activity Report / authorized viewer | Shift day, analyst, completion, IOCs, tickets | Shift table with drilldown | Export / analyst/date filters | No recorded activity message |
| Ticket Report / authorized viewer | Analyst/date, number, reference and description | Searchable dense table and external links | Export / search and filters | No ticket records message; search preserved in workbook |
| Administration / Security Manager | Permission model before account records | Three compact role explanations, user table | Add employee / manage user | Unauthorized access gets explanatory state; duplicate email/weak initial password validated |
| User / Role Management / Security Manager | User identity, role and primary team | Focused modal | Save changes / cancel | Pending submit; clear validation; cannot remove own administrator role |

## Operational details

The exact eight activity titles in the brief are stored server-side and reused by the UI. Uploading malicious IP/domain files has no IP/domain count controls. MISP numeric entry is independent of file upload. A ticket modal requires its number. Reported issues expose fields only when requested; issue attachments remain associated with the activity. Completed shifts lock on the server as well as in the interface.

The task detail view remains a single information-rich split layout. It does not turn each property into a separate card. The dashboard uses four metrics and four meaningful panels; the primary operational screen is a table. Light mode uses independent surface and text values rather than inverting dark-mode colors.

## Validation status

The JavaScript backend passed 14 HTTP, persistence, migration and workbook integration tests, plus four template-render suites against real role-scoped data. The Chromium workflow suite passed on Node.js 24 in GitHub Actions, covering login, persisted tasks/comments, shifts, individual ticket records, Excel downloads, both themes, and 1440/1920/390 px viewports.

Dark and light dashboards, task details and shift screenshots were inspected. Browser screenshots are captured at the top of the document with finite animations completed; modal captures use the viewport. Shift saves preserve keyboard focus when rebuilding the surrounding view. Screenshot artifacts are available with the CI run.
