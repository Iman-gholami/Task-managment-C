import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash, randomBytes } from 'node:crypto';
import { openDatabase } from './lib/database.js';
import { xlsx } from './lib/xlsx.js';
import { ACTIVITIES, STATUSES, PRIORITIES, COMPLEXITIES, QUALITIES, TEAMS, ROLES, HttpError, need, text, now, today, date, integer, validUrl, publicUser, canUser, canTask, taskData, shiftData, passwordHash, validPassword, blankActivities } from './lib/domain.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const json = (status, data, headers = {}) => ({ status, data, headers, type: 'application/json' });
const digest = value => createHash('sha256').update(value).digest('hex');
const has = (object, key) => Object.hasOwn(object, key);
const checkObject = value => value && typeof value === 'object' && !Array.isArray(value);

function body(req) {
  return new Promise((resolveBody, reject) => {
    const chunks = []; let length = 0, failed = false;
    req.on('data', chunk => {
      length += chunk.length;
      if (length > 8_000_000) {
        if (!failed) reject(new HttpError(413, 'File is too large. Maximum size is 5 MB.'));
        failed = true; chunks.length = 0;
      } else if (!failed) chunks.push(chunk);
    });
    req.on('end', () => {
      if (failed) return;
      try {
        const data = JSON.parse(Buffer.concat(chunks).toString() || '{}');
        need(checkObject(data), 'Invalid request.'); resolveBody(data);
      } catch (error) { reject(error instanceof HttpError ? error : new HttpError(400, 'Invalid request.')); }
    });
    req.on('error', reject);
  });
}

function send(res, output) {
  const { status, type, headers = {} } = output;
  const buffer = type === 'application/json' ? Buffer.from(JSON.stringify(output.data)) : Buffer.from(output.data);
  res.writeHead(status, {
    'Content-Type': type,
    'Content-Length': buffer.length,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'",
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(buffer);
}

export function createApp(options = {}) {
  const config = {
    dbPath: options.dbPath ?? process.env.CADENCE_DB ?? join(ROOT, 'data', 'cadence.db'),
    demo: options.demo ?? process.env.CADENCE_DEMO === '1',
    adminPassword: options.adminPassword ?? process.env.CADENCE_ADMIN_PASSWORD ?? '',
    secureCookie: options.secureCookie ?? process.env.CADENCE_SECURE_COOKIE === '1',
  };
  const db = openDatabase(config);
  const assets = new Map([
    ['/', ['index.html', 'text/html; charset=utf-8']],
    ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
    ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ].map(([url, [file, type]]) => [url, { data: readFileSync(join(ROOT, 'static', file)), type }]));
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost'), path = url.pathname, method = req.method;
      if (!path.startsWith('/api/')) {
        need(method === 'GET', 'Method not allowed.', 405);
        const asset = assets.get(path); need(asset, 'Page not found.', 404);
        return send(res, { status: 200, ...asset, headers: { 'Cache-Control': 'no-cache' } });
      }
      let data = {};
      if (method !== 'GET') {
        let origin;
        try { origin = req.headers.origin ? new URL(req.headers.origin).host : null; }
        catch { throw new HttpError(403, 'Request origin is not allowed.'); }
        need(!origin || origin === req.headers.host, 'Request origin is not allowed.', 403);
        need(req.headers['x-cadence-request'] === '1', 'Missing request header.', 403);
        if (Number(req.headers['content-length'] || 0) > 8_000_000) {
          req.resume(); throw new HttpError(413, 'File is too large. Maximum size is 5 MB.');
        }
        data = await body(req);
      }
      const mutating = method !== 'GET';
      if (mutating) db.exec('BEGIN IMMEDIATE');
      let output;
      try {
        output = route(db, req, path, Object.fromEntries(url.searchParams), data, config);
        if (mutating) db.exec('COMMIT');
      } catch (error) {
        if (mutating) db.exec('ROLLBACK'); throw error;
      }
      send(res, output);
    } catch (error) {
      const constraint = String(error.message).includes('UNIQUE constraint failed');
      const status = error.status || (constraint ? 409 : 500);
      if (status === 500) console.error(error);
      send(res, json(status, { error: error.status ? error.message : constraint ? 'This record already exists. Check the email or date.' : 'We could not save your changes. Please retry.' }));
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  server.on('close', () => db.close());
  return { server, db };
}

function route(db, req, path, q, data, config) {
  const method = req.method;
  const get = (sql, ...args) => db.prepare(sql).get(...args);
  const all = (sql, ...args) => db.prepare(sql).all(...args);
  const run = (sql, ...args) => db.prepare(sql).run(...args);
  if (path === '/api/login' && method === 'POST') {
    const client = req.socket.remoteAddress;
    const attempt = get('SELECT * FROM login_attempts WHERE client=?', client);
    const withinWindow = attempt && Date.parse(attempt.until) > Date.now();
    if (withinWindow && attempt.attempts >= 10) return json(429, { error: 'Too many attempts. Try again in 15 minutes.' });
    const user = get('SELECT * FROM users WHERE email=?', text(data.email).toLowerCase());
    if (!user || !validPassword(text(data.password), user.password)) {
      run('INSERT OR REPLACE INTO login_attempts VALUES(?,?,?)', client, withinWindow ? attempt.attempts + 1 : 1, new Date(Date.now() + 900000).toISOString());
      // Return rather than throw: failed-attempt records must commit.
      return json(401, { error: 'Email or password is incorrect.' });
    }
    run('DELETE FROM login_attempts WHERE client=?', client);
    const token = randomBytes(32).toString('base64url');
    run('INSERT INTO sessions VALUES(?,?,?)', digest(token), user.id, new Date(Date.now() + 43200000).toISOString());
    return json(200, publicUser(user), { 'Set-Cookie': `cadence=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${config.secureCookie ? '; Secure' : ''}` });
  }
  const token = /(?:^|;\s*)cadence=([^;]*)/.exec(req.headers.cookie || '')?.[1] || '';
  const tokenHash = digest(token);
  // julianday accepts both ISO Z timestamps and the previous Python +00:00 format.
  const actor = get('SELECT u.* FROM users u JOIN sessions s ON u.id=s.user_id WHERE s.token=? AND julianday(s.expires)>julianday(?)', tokenHash, now());
  need(actor, 'Please sign in to continue.', 401);
  if (path === '/api/logout' && method === 'POST') {
    run('DELETE FROM sessions WHERE token=?', tokenHash);
    return json(200, {}, { 'Set-Cookie': 'cadence=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
  }
  const users = all('SELECT * FROM users ORDER BY name');
  if (path === '/api/state' && method === 'GET') {
    const tasks = all('SELECT * FROM tasks ORDER BY updated DESC').filter(t => canTask(db, actor, t)).map(t => taskData(db, t));
    const allowed = new Set(users.filter(u => canUser(actor, u)).map(u => u.id));
    const shifts = all('SELECT * FROM shifts ORDER BY day DESC').filter(s => allowed.has(s.user_id)).map(shiftData);
    const tids = new Set(tasks.map(t => t.id)), sids = new Set(shifts.map(s => s.id));
    return json(200, {
      me: publicUser(actor), people: users.map(({ id, name, role, team }) => ({ id, name, role, team })),
      users: users.filter(u => canUser(actor, u)).map(publicUser), tasks, shifts,
      activities: ACTIVITIES, statuses: STATUSES, priorities: PRIORITIES, complexities: COMPLEXITIES, qualities: QUALITIES, teams: TEAMS, roles: ROLES, today: today(), demo: config.demo,
      comments: all('SELECT * FROM comments').filter(c => tids.has(c.task_id)),
      events: all('SELECT * FROM events ORDER BY id DESC').filter(e => tids.has(e.task_id)),
      attachments: all('SELECT id,kind,object_id,slot,name,user_id FROM attachments').filter(a => a.kind === 'task' ? tids.has(a.object_id) : sids.has(a.object_id)),
    });
  }
  if (path === '/api/tasks' && method === 'POST') {
    const uid = integer(data.assignee ?? actor.id, 'Assignee'), target = users.find(u => u.id === uid);
    need(canUser(actor, target), 'You cannot assign work to this employee.', 403);
    const title = text(data.title, 200); need(title, 'Task title is required.');
    const start = date(data.start || today()), deadline = date(data.deadline, true);
    need(!deadline || deadline >= start, 'Deadline must be on or after the start date.');
    const priority = data.priority || 'Normal', complexity = data.complexity || 'Medium';
    need(PRIORITIES.includes(priority) && COMPLEXITIES.includes(complexity), 'Select valid task properties.');
    const reference = text(data.reference); validUrl(reference);
    const workTeam = data.work_team || target.team; need(TEAMS.includes(workTeam), 'Select a valid work team.');
    const checklist = data.checklist || [];
    need(Array.isArray(checklist) && checklist.length <= 100 && checklist.every(x => typeof x === 'string'), 'Provide up to 100 checklist items.');
    const result = run('INSERT INTO tasks(title,description,assignee,status,priority,complexity,start,deadline,hours,quality,review_required,checklist,reference,updated,completed,created_by,work_team) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', title, text(data.description), uid, 'To Do', priority, complexity, start, deadline, 0, '', Number(Boolean(data.review_required)), JSON.stringify(checklist.filter(x => text(x)).map(x => ({ text: text(x, 200), done: false }))), reference, now(), '', actor.id, workTeam);
    return json(201, { id: Number(result.lastInsertRowid) });
  }
  let match = /^\/api\/tasks\/(\d+)$/.exec(path);
  if (match && method === 'PATCH') {
    const id = Number(match[1]), task = get('SELECT * FROM tasks WHERE id=?', id);
    need(task, 'Task not found.', 404); need(canTask(db, actor, task), 'Access denied.', 403);
    const changes = {};
    for (const [key, choices] of [['status', STATUSES], ['priority', PRIORITIES], ['complexity', COMPLEXITIES], ['quality', ['', ...QUALITIES]]]) {
      if (has(data, key)) { need(choices.includes(data[key]), `Select a valid ${key}.`); changes[key] = data[key]; }
    }
    const manager = actor.role !== 'Analyst';
    if (has(changes, 'quality')) need(manager, 'Only a manager can evaluate quality.', 403);
    if (changes.status === 'Done' && task.review_required) need(manager, 'Submit this task for manager review.', 403);
    if (has(data, 'hours')) {
      const value = Number(data.hours); need(Number.isFinite(value) && value >= 0 && value <= 100000, 'Hours must be a positive finite number.'); changes.hours = value;
    }
    for (const key of ['title', 'description', 'reference']) if (has(data, key)) changes[key] = text(data[key], key === 'title' ? 200 : 10000);
    if (has(changes, 'title')) need(changes.title, 'Task title is required.');
    if (has(changes, 'reference')) validUrl(changes.reference);
    if (has(data, 'checklist')) {
      need(Array.isArray(data.checklist) && data.checklist.length <= 100 && data.checklist.every(checkObject), 'Provide up to 100 checklist items.');
      changes.checklist = JSON.stringify(data.checklist.filter(x => text(x.text)).map(x => ({ text: text(x.text, 200), done: Boolean(x.done) })));
    }
    if (has(changes, 'status')) changes.completed = changes.status === 'Done' ? today() : '';
    changes.updated = now();
    run(`UPDATE tasks SET ${Object.keys(changes).map(k => `${k}=?`).join(',')} WHERE id=?`, ...Object.values(changes), id);
    const message = Object.entries(changes).filter(([k]) => !['updated', 'completed', 'checklist'].includes(k)).map(([k, v]) => `${k[0].toUpperCase()}${k.slice(1)}: ${v}`).join(', ');
    run('INSERT INTO events(task_id,user_id,body,created) VALUES(?,?,?,?)', id, actor.id, message || 'Updated checklist', now());
    return json(200, { ok: true });
  }
  if (path === '/api/comments' && method === 'POST') {
    const task = get('SELECT * FROM tasks WHERE id=?', integer(data.task_id, 'Task'));
    need(canTask(db, actor, task), 'Task not found.', 404);
    const comment = text(data.body); need(comment, 'Write a comment first.');
    run('INSERT INTO comments(task_id,user_id,body,created,edited) VALUES(?,?,?,?,?)', task.id, actor.id, comment, now(), '');
    return json(201, { ok: true });
  }
  match = /^\/api\/comments\/(\d+)$/.exec(path);
  if (match && method === 'PATCH') {
    const comment = get('SELECT * FROM comments WHERE id=?', Number(match[1]));
    need(comment && comment.user_id === actor.id, 'You can only edit your own comments.', 403);
    const value = text(data.body); need(value, 'Comment cannot be empty.');
    run('UPDATE comments SET body=?,edited=? WHERE id=?', value, now(), comment.id);
    return json(200, { ok: true });
  }
  if (path === '/api/shifts' && method === 'POST') {
    need(actor.team.startsWith('SOC'), 'Shift logs are available to SOC employees.', 403);
    const day = date(data.day || today()); need(day === today(), 'Only today’s shift can be created.');
    run('INSERT OR IGNORE INTO shifts(user_id,day,status,activities,iocs,shared,reference,tickets,updated) VALUES(?,?,?,?,?,?,?,?,?)', actor.id, day, 'Active', JSON.stringify(blankActivities()), 0, 0, '', '[]', now());
    return json(201, { id: get('SELECT id FROM shifts WHERE user_id=? AND day=?', actor.id, day).id });
  }
  match = /^\/api\/shifts\/(\d+)$/.exec(path);
  if (match && method === 'PATCH') {
    const shift = get('SELECT * FROM shifts WHERE id=?', Number(match[1]));
    need(shift && shift.user_id === actor.id, 'You can only edit your own shift.', 403);
    need(shift.status !== 'Completed', 'This shift is completed and read-only.', 409);
    const activities = data.activities ?? JSON.parse(shift.activities);
    need(Array.isArray(activities) && activities.length === 8 && activities.every(checkObject), 'All eight activities are required.');
    const clean = activities.map(a => {
      let issue = a.issue || null;
      if (issue) {
        need(checkObject(issue) && text(issue.summary), 'Issue summary is required.');
        issue = { summary: text(issue.summary, 200), description: text(issue.description), reference: text(issue.reference) }; validUrl(issue.reference);
      }
      const reference = text(a.reference); validUrl(reference);
      return { done: Boolean(a.done), note: text(a.note), issue, reference };
    });
    const iocs = data.iocs ?? shift.iocs;
    need(Number.isSafeInteger(iocs) && iocs >= 0 && iocs <= 10000000, 'IOC count must be a non-negative whole number.');
    const tickets = data.tickets ?? JSON.parse(shift.tickets);
    need(Array.isArray(tickets) && tickets.length <= 500 && tickets.every(checkObject), 'Provide up to 500 ticket records per shift.');
    const numbers = new Set();
    const cleanTickets = tickets.map(t => {
      const number = text(t.number, 100); need(number, 'Every ticket needs a ticket number.');
      need(!numbers.has(number.toLowerCase()), 'Ticket numbers must be unique in this shift.'); numbers.add(number.toLowerCase());
      const ticket = Object.fromEntries(['number', 'related', 'description', 'link'].map(k => [k, text(t[k], k === 'number' ? 100 : 2000)])); validUrl(ticket.link); return ticket;
    });
    const status = data.status ?? shift.status;
    need(['Active', 'Completed'].includes(status), 'Invalid shift status.');
    need(status !== 'Completed' || clean.every(a => a.done), 'Complete all eight activities before completing your shift.');
    const reference = text(data.reference ?? shift.reference); validUrl(reference);
    run('UPDATE shifts SET status=?,activities=?,iocs=?,shared=?,reference=?,tickets=?,updated=? WHERE id=?', status, JSON.stringify(clean), iocs, Number(Boolean(data.shared ?? shift.shared)), reference, JSON.stringify(cleanTickets), now(), shift.id);
    return json(200, { ok: true });
  }
  if (path === '/api/users' && method === 'POST') {
    need(actor.role === 'Security Manager', 'Only the Security Manager can manage users.', 403);
    const name = text(data.name, 100), email = text(data.email, 200).toLowerCase(), password = text(data.password);
    need(name && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 'Name and valid email are required.');
    need(password.length >= 12, 'Use a password with at least 12 characters.');
    need(ROLES.includes(data.role) && TEAMS.includes(data.team), 'Select a valid role and team.');
    run('INSERT INTO users(name,email,password,role,team) VALUES(?,?,?,?,?)', name, email, passwordHash(password), data.role, data.team);
    return json(201, { ok: true });
  }
  match = /^\/api\/users\/(\d+)$/.exec(path);
  if (match && method === 'PATCH') {
    need(actor.role === 'Security Manager', 'Only the Security Manager can manage users.', 403);
    const target = get('SELECT * FROM users WHERE id=?', Number(match[1])); need(target, 'Employee not found.', 404);
    const role = data.role ?? target.role, team = data.team ?? target.team;
    need(ROLES.includes(role) && TEAMS.includes(team), 'Select a valid role and team.');
    need(target.id !== actor.id || role === 'Security Manager', 'You cannot remove your own administrator role.');
    run('UPDATE users SET role=?,team=? WHERE id=?', role, team, target.id);
    run('DELETE FROM sessions WHERE user_id=? AND token!=?', target.id, tokenHash);
    return json(200, { ok: true });
  }
  if (path === '/api/attachments' && method === 'POST') {
    const kind = data.kind; need(['task', 'shift'].includes(kind), 'Invalid attachment destination.');
    const row = get(`SELECT * FROM ${kind === 'task' ? 'tasks' : 'shifts'} WHERE id=?`, integer(data.object_id, 'Item'));
    need(row, 'Item not found.', 404);
    need(kind === 'task' ? canTask(db, actor, row) : row.user_id === actor.id && row.status === 'Active', 'Access denied.', 403);
    need(typeof data.content === 'string' && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data.content), 'Invalid file content.');
    const bytes = Buffer.from(data.content, 'base64'); need(bytes.length > 0 && bytes.length <= 5 * 1024 * 1024, 'Choose a file up to 5 MB.');
    run('INSERT INTO attachments(kind,object_id,slot,name,content,user_id) VALUES(?,?,?,?,?,?)', kind, row.id, text(data.slot, 30), text(data.name, 200), bytes, actor.id);
    return json(201, { ok: true });
  }
  match = /^\/api\/attachments\/(\d+)$/.exec(path);
  if (match && method === 'GET') {
    const attachment = get('SELECT * FROM attachments WHERE id=?', Number(match[1])); need(attachment, 'Attachment not found.', 404);
    const row = get(`SELECT * FROM ${attachment.kind === 'task' ? 'tasks' : 'shifts'} WHERE id=?`, attachment.object_id);
    need(attachment.kind === 'task' ? canTask(db, actor, row) : row && canUser(actor, users.find(u => u.id === row.user_id)), 'Access denied.', 403);
    const filename = attachment.name.replace(/[^a-zA-Z0-9._ -]/g, '_');
    return { status: 200, data: Buffer.from(attachment.content), type: 'application/octet-stream', headers: { 'Content-Disposition': `attachment; filename="${filename}"` } };
  }
  if (path === '/api/export' && method === 'GET') return report(db, actor, users, q);
  throw new HttpError(404, 'This action is unavailable.');
}

function report(db, actor, users, q) {
  const start = date(q.start || today().slice(0, 8) + '01'), end = date(q.end || today());
  need(start <= end, 'End date must follow start date.');
  const selected = new Map(users.filter(u => canUser(actor, u) && (!q.employee || String(u.id) === q.employee) && (!q.team || u.team === q.team)).map(u => [u.id, u]));
  const tasks = [['Task Title', 'Work Description', 'Quality', 'Start Time', 'End Time', 'Hours', 'Executor', 'Complexity', 'Status', 'Deadline', 'Primary Team', 'Work Team']];
  for (const t of db.prepare('SELECT * FROM tasks ORDER BY id').all()) {
    const day = t.completed || t.start;
    if (!selected.has(t.assignee) || day < start || day > end || ['status', 'complexity', 'quality'].some(k => q[k] && q[k] !== t[k])) continue;
    const user = selected.get(t.assignee);
    tasks.push([t.title, t.description, t.quality, t.start, t.completed, t.hours, user.name, t.complexity, t.status, t.deadline, user.team, t.work_team || user.team]);
  }
  const shifts = [['Analyst', 'Date', 'Status', 'Activities Completed', 'MISP IOC Count', 'Tickets Created', 'Daily Traffic Reports', 'Issues Reported']];
  const tickets = [['Analyst', 'Date', 'Ticket Number', 'Related Reference', 'Description', 'External Link']];
  for (const shift of db.prepare('SELECT * FROM shifts ORDER BY day').all()) {
    if (!selected.has(shift.user_id) || shift.day < start || shift.day > end) continue;
    const s = shiftData(shift), name = selected.get(s.user_id).name;
    shifts.push([name, s.day, s.status, s.activities.filter(a => a.done).length, s.iocs, s.tickets.length, Number(s.activities[3].done), s.activities.filter(a => a.issue).length]);
    for (const t of s.tickets) {
      if (q.q && ![name, t.number, t.related, t.description].join(' ').toLowerCase().includes(q.q.toLowerCase())) continue;
      tickets.push([name, s.day, t.number, t.related, t.description, t.link]);
    }
  }
  let sheets = [['Task Performance', tasks], ['Routine Activity', shifts], ['Tickets', tickets]];
  if (q.type === 'Task Report') sheets = sheets.slice(0, 1);
  else if (q.type === 'SOC Shift Activity Report') sheets = sheets.slice(1, 2);
  else if (q.type === 'Ticket Report') sheets = sheets.slice(2);
  return { status: 200, data: xlsx(sheets), type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', headers: { 'Content-Disposition': `attachment; filename="cadence-report-${start}-${end}.xlsx"` } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const { server } = createApp();
    const host = process.env.CADENCE_HOST || '127.0.0.1', port = Number(process.env.PORT || 8000);
    server.on('error', error => { console.error(`Could not start Cadence: ${error.message}`); process.exitCode = 1; });
    server.listen(port, host, () => console.log(`Cadence is running at http://${host}:${server.address().port}`));
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { server.close(); server.closeIdleConnections(); });
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
