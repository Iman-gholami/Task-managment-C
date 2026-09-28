# Cadence

A focused internal workspace for **task management, SOC shift activity, and workforce performance**. Built from the supplied product brief with a restrained dark-first interface, a separate light theme, and persistent SQLite storage.

This is a runnable MVP, not just a set of mockups. It deliberately excludes SIEM, incident management, alert management, and security monitoring. External systems appear only as references.

## Run locally

Requires **Python 3.10+**. The application has no runtime package dependencies and no build step.

```bash
# macOS / Linux — sample workspace
CADENCE_DEMO=1 python server.py
```

```powershell
# Windows PowerShell
$env:CADENCE_DEMO = "1"
python server.py
```

Open **http://127.0.0.1:8000**.

| Account | Role | Password (demo only) |
| --- | --- | --- |
| `iman@cadence.local` | Security Manager | `Cadence-demo-2026!` |
| `sara@cadence.local` | SOC Manager | `Cadence-demo-2026!` |
| `arman@cadence.local` | Analyst · SOC Layer 1 | `Cadence-demo-2026!` |
| `nika@cadence.local` | Analyst · SOC Layer 2 | `Cadence-demo-2026!` |
| `darya@cadence.local` | Analyst · Design & Automation | `Cadence-demo-2026!` |
| `ali@cadence.local` | Analyst · Threat Intelligence | `Cadence-demo-2026!` |

Demo data uses the current Tehran date. Sign in as Sara for the SOC workspace, Iman for the full department, or Arman for an analyst’s workflow.

### Start with an empty workspace

Use a **new database path**. Initialization never overwrites existing accounts or data.

```bash
CADENCE_DB=./data/internal.db \
CADENCE_ADMIN_PASSWORD='choose-a-unique-password-of-at-least-12-characters' \
python server.py
```

The initial account is `iman@cadence.local`. Add employees from **Administration**. Set a unique initial password for each employee and deliver it through your organization’s existing secure channel.

| Variable | Default | Purpose |
| --- | --- | --- |
| `CADENCE_DB` | `./data/cadence.db` | SQLite database, including attachment bytes |
| `CADENCE_DEMO` | `0` | Set to `1` to initialize sample accounts/data on an empty database |
| `CADENCE_ADMIN_PASSWORD` | Required outside demo mode | Initial administrator password, minimum 12 characters |
| `CADENCE_HOST` | `127.0.0.1` | Listening interface |
| `PORT` | `8000` | HTTP port |
| `CADENCE_SECURE_COOKIE` | `0` | Set to `1` when accessed over HTTPS |

Changing `CADENCE_DEMO` or `CADENCE_ADMIN_PASSWORD` does **not** change an existing database’s credentials. Keep databases and backups outside version control.

## Included workflows

- **Role-aware dashboards:** personal work for analysts, SOC scope for SOC managers, department-wide scope for security managers; attention queues, shift coverage, task completion, and routine activity.
- **Tasks:** My/Team/All scopes within server-authorized visibility, search, filters, sorting, column visibility, pagination, inline status and priority, progressive creation, description editing, checklists, actual hours, review/return/approval, quality, comments with `@Name` mentions, edit markers, attachments, external references, and an activity trail.
- **Temporary assistance:** a task’s work team can differ from its assignee’s primary team. Reports retain both; user membership stays unchanged.
- **Shift logs:** exactly the eight requested English activity names; one log per SOC employee/day; quick completion, notes, issue details, issue attachments, file/reference uploads, Word report attachments, IOC counts, Bale sharing, and individually registered tickets.
- **Shift completion:** incomplete shifts are rejected by the server; completed shifts are immutable. Historical shifts can be inspected.
- **Team:** employee directory, primary teams, workload, open tasks, and today’s shift status.
- **Performance:** month/previous month/quarter/custom periods; individual profiles; task work separated from routine activity; quality, complexity distribution, hours, IOC counts, daily reports, and ticket-number drill-downs. Employees are listed alphabetically, without public rankings.
- **Reports:** employee monthly, team monthly, tasks, shift activity, and tickets; date/employee/team/status/complexity/quality filters as relevant. Real `.xlsx` workbooks contain separate task, routine, and ticket worksheets. Ticket search is preserved in ticket exports.
- **Administration:** create employees and update roles/primary teams. Only a Security Manager can use these endpoints.
- **Shared UI:** collapsible navigation, dark/light themes, command search (`⌘K` / `Ctrl+K`), compact contextual notifications, skeleton startup, empty/error states, toasts, semantic controls, visible focus, modal focus trapping, and reduced-motion support.

## Tests

The API and template tests use only Python and Node.js standard libraries:

```bash
python -m unittest discover -s tests -v
node --test tests/render.test.cjs
```

The API suite uses an isolated temporary database and an ephemeral HTTP port. The template suite checks all core views against real role-scoped API data, including empty data and escaped content. It is **not** a browser or visual test.

Optional browser workflow tests:

```bash
npm install
npx playwright install chromium
npm run test:browser
```

They exercise login, navigation, task creation/persistence, comments, shift completion, ticket validation, downloads, and both themes. They capture screenshots in `test-results/`. Browser tests need Chromium to be installed. GitHub Actions runs the same suites and uploads screenshots on failures.

## Structure

```text
server.py                 HTTP API, authorization, SQLite, attachments, OOXML export
static/index.html         Application entry and skeleton
static/app.js             Reusable UI renderers and event-driven interactions
static/styles.css         Semantic tokens, both themes, responsive layouts
tests/test_api.py        HTTP integration tests
tests/render.test.cjs    Template/render contract tests
tests/browser.cjs        Browser workflow tests
docs/design-system.md    Tokens, components, and screen specifications
docs/architecture.md     Data, permissions, reporting semantics, deployment limits
```

See [the design specification](docs/design-system.md) and [architecture / deployment notes](docs/architecture.md).

## Operational boundary

The built-in HTTP server is intended for local use and controlled internal evaluation. Before a production rollout, provide HTTPS and a suitable application gateway, organizational identity/SSO or password lifecycle management, backups, deployment monitoring, and the organization’s security review. The MVP does not claim production-scale concurrency, immutable compliance auditing, MFA, or automated password recovery.

No real external systems are integrated. Files are stored in the local database with a 5 MB per-file limit and served as downloads. No data is sent to third-party analytics or font services.
