# Architecture and behavior

## Runtime

Cadence serves a same-origin JavaScript application and a JSON API using Python’s standard HTTP server. SQLite persists data. The frontend loads an authorized workspace snapshot after login and after mutations. Navigation and filters operate on that snapshot; mutations are validated again by the server. This avoids a build chain for a small internal MVP. Workspaces with large datasets should move filtering/pagination to API queries before scaling.

The app is English and desktop-first. Calendar defaults follow Asia/Tehran (+03:30); timestamps are UTC and displayed using the browser’s locale. Explicit date controls use ISO calendar dates. No timezone-sensitive calculations rely on parsing a bare date as midnight UTC.

## Data

- `users`: one role and one primary team per person; email is unique; passwords use a random salt and PBKDF2-HMAC-SHA256.
- `sessions`: hashed opaque session token, user, 12-hour expiry; raw tokens exist only in HttpOnly cookies. Role changes invalidate other active sessions for the affected user.
- `tasks`: assignee, work team, status, priority, complexity, start/deadline, actual hours, quality, review flag, checklist, reference, completion date, creator, update timestamp.
- `comments`: author, task, body, created/edited timestamps. Mentions are lightweight `@FirstName` text matches used in notifications, not an external messaging service.
- `events`: recorded task-property and checklist changes. This is an operational activity feed, not a tamper-proof compliance audit.
- `shifts`: unique `(user, day)`; eight structured activities; optional issue/reference/note per activity; IOC count; Bale sharing flag; individual ticket records; immutable after completion.
- `attachments`: bytes and metadata associated with a task or a shift activity. Issue attachments use separate activity slots.
- `login_attempts`: per-client attempt window. Ten failures within 15 minutes temporarily block login. Deploy behind a gateway that enforces its own limits; the server intentionally does not trust arbitrary forwarded client-IP headers.

Tasks can use a work team different from the assignee’s primary team for temporary assistance. Assignment permissions remain based on the employee’s primary team. Team report filters group employees by primary team; Excel includes the task’s work team separately.

## Authorization

| Actor | Read/change tasks | Read shifts | Change shifts | User administration |
| --- | --- | --- | --- | --- |
| Analyst | Own assignments; create own tasks | Own | Own active shift, if SOC | None |
| SOC Manager | Work assigned to SOC employees | SOC employees | Own active shift | None |
| Security Manager | All department work | All | Own active shift, if SOC | Create users; edit role/team |

Names and team identities are available for attributing comments and work; assignable users, work, shifts, and exports remain scoped. Every object mutation, attachment download, and export is checked server-side. UI visibility is not the authorization boundary. An analyst cannot complete a task marked review-required or assign a quality rating. A manager can approve or return work. SOC employees can create a shift for today only. A completed shift cannot be edited through the API.

## Reporting semantics

- The selected task period uses its completion date when present, otherwise its start date. The UI and export use the same rule.
- Completed-task metrics count only `Done` tasks in that period.
- Task hours sum recorded actual hours for tasks in scope, including unfinished work. They are not automatically tracked time or prorated time entries.
- Routine activity uses shift day. IOC and ticket totals include recorded values in active and completed shifts; completed-shift counts include only completed logs.
- Routine completion is checked activities divided by eight times the number of recorded shifts. Missing shift days are not silently treated as completed or scheduled days.
- Daily traffic report count means the report activity was marked done. Attachments are optional and can be inspected in the shift.
- Ticket count is the length of the ticket records, never an editable aggregate. Ticket numbers must be nonempty and unique within a shift (case-insensitive).
- XLSX files are OOXML ZIP packages, not renamed CSV. All user-authored values are inline string cells, so leading `=`, `+`, `-`, or `@` cannot become spreadsheet formulas. Tasks and routine work are separate sheets and counts.
- The completion chart displays counts in four week buckets for the current month; days after the 21st use the final bucket.

## Request and file handling

Mutations require a custom same-origin request header and reject mismatching Origin headers. Cookies are HttpOnly and SameSite=Strict; enable Secure cookies when served over HTTPS. HTML output escapes user content, external references accept only HTTP(S), and a content security policy forbids inline scripts and framing.

Attachments are limited to 5 MB and stored as bytes, never executed. Downloads use attachment disposition and `nosniff`. Attachment authorization follows the parent record. Malware scanning, storage quotas, object storage, and retention policies are deployment integrations, not implemented services.

## Deployment and remaining production work

The default listener is loopback. A production installation needs a service supervisor, an HTTPS gateway on the same origin, database backups, storage monitoring, identity integration or password reset/change flows, and review of concurrency and auditing requirements. The embedded server does not provide TLS termination. No deployment or external integration is created automatically by this repository.

There is no background polling: reload to pick up another browser’s changes. SQLite serializes writes, and client shift saves are queued. There is no optimistic-version conflict detection across multiple devices; the last accepted save wins. Add version checks for a production multi-device workflow.

Schema initialization is idempotent. The work-team column migration preserves earlier development databases. Do not set demo mode on a production dataset or publish the database.
