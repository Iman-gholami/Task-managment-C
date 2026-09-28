const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { inflateRawSync } = require('node:zlib');
const { createHash } = require('node:crypto');

let createApp, app, base, clients;
const password = 'Cadence-demo-2026!';
class Client {
  constructor(base) { this.base = base; this.cookie = ''; }
  async request(endpoint, method = 'GET', data, headers = {}) {
    const r = await fetch(this.base + '/api/' + endpoint, {
      method, headers: { 'Content-Type': 'application/json', 'X-Cadence-Request': '1', Cookie: this.cookie, ...headers },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    if (r.headers.get('set-cookie')) this.cookie = r.headers.get('set-cookie').split(';')[0];
    const content = r.headers.get('content-type').includes('application/json') ? await r.json() : Buffer.from(await r.arrayBuffer());
    return { status: r.status, data: content, headers: r.headers };
  }
  async login(email, secret = password) { return this.request('login', 'POST', { email: email + '@cadence.local', password: secret }); }
}
async function start(options = {}) {
  const app = createApp({ dbPath: ':memory:', demo: true, ...options });
  app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
  return { ...app, base: 'http://127.0.0.1:' + app.server.address().port };
}
async function stop(app) {
  const closed = once(app.server, 'close'); app.server.close(); app.server.closeIdleConnections(); await closed;
}
async function task(client = clients.analyst, values = {}) {
  const r = await client.request('tasks', 'POST', { title: 'Integration task', review_required: true, ...values });
  assert.equal(r.status, 201, JSON.stringify(r.data)); return r.data.id;
}
// Independently inspect the generated ZIP through its central directory and zlib.
function unzip(buffer) {
  const end = buffer.length - 22;
  assert.equal(buffer.readUInt32LE(end), 0x06054b50);
  const count = buffer.readUInt16LE(end + 10), files = new Map();
  let cursor = buffer.readUInt32LE(end + 16);
  for (let i = 0; i < count; i++) {
    assert.equal(buffer.readUInt32LE(cursor), 0x02014b50);
    const size = buffer.readUInt32LE(cursor + 20), expectedSize = buffer.readUInt32LE(cursor + 24);
    const nl = buffer.readUInt16LE(cursor + 28), ex = buffer.readUInt16LE(cursor + 30), co = buffer.readUInt16LE(cursor + 32);
    const file = buffer.subarray(cursor + 46, cursor + 46 + nl).toString();
    const offset = buffer.readUInt32LE(cursor + 42);
    assert.equal(buffer.readUInt32LE(offset), 0x04034b50);
    const start = offset + 30 + buffer.readUInt16LE(offset + 26) + buffer.readUInt16LE(offset + 28);
    const data = inflateRawSync(buffer.subarray(start, start + size)); assert.equal(data.length, expectedSize);
    files.set(file, data.toString()); cursor += 46 + nl + ex + co;
  }
  return files;
}

before(async () => {
  ({ createApp } = await import('../server.js')); app = await start(); base = app.base; clients = {};
  for (const [role, email] of [['admin', 'iman'], ['manager', 'sara'], ['analyst', 'arman'], ['design', 'darya']]) {
    clients[role] = new Client(base); assert.equal((await clients[role].login(email)).status, 200);
  }
});
after(async () => { if (app) await stop(app); });

test('anonymous access is rejected and static assets have security headers', async () => {
  assert.equal((await new Client(base).request('state')).status, 401);
  const r = await fetch(base); assert.equal(r.status, 200);
  assert.match(r.headers.get('content-security-policy'), /script-src 'self'/);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.match(await r.text(), /Loading workspace/);
  assert.equal((await fetch(base + '/server.js')).status, 404);
});
test('state, assignments and updates are scoped on the server', async () => {
  const { data: a } = await clients.analyst.request('state');
  assert.ok(a.tasks.every(t => t.assignee === a.me.id));
  const { data: m } = await clients.manager.request('state');
  assert.ok(m.users.every(u => u.team.startsWith('SOC')));
  assert.ok(m.tasks.every(t => m.users.some(u => u.id === t.assignee)));
  const id = await task(clients.design);
  assert.equal((await clients.analyst.request(`tasks/${id}`, 'PATCH', { priority: 'Critical' })).status, 403);
  for (const client of [clients.analyst, clients.manager]) assert.equal((await client.request('tasks', 'POST', { title: 'Forbidden', assignee: 5 })).status, 403);
});
test('review-required work needs manager approval and quality evaluation', async () => {
  const id = await task();
  assert.equal((await clients.analyst.request(`tasks/${id}`, 'PATCH', { status: 'Done' })).status, 403);
  assert.equal((await clients.analyst.request(`tasks/${id}`, 'PATCH', { quality: 'Excellent' })).status, 403);
  assert.equal((await clients.analyst.request(`tasks/${id}`, 'PATCH', { status: 'Review', hours: 3.5 })).status, 200);
  assert.equal((await clients.manager.request(`tasks/${id}`, 'PATCH', { status: 'Done', quality: 'Excellent' })).status, 200);
  const { data: state } = await clients.analyst.request('state'), t = state.tasks.find(t => t.id === id);
  assert.equal(t.completed, state.today); assert.equal(t.hours, 3.5); assert.equal(t.quality, 'Excellent');
});
test('checklists, comments and event history persist', async () => {
  const id = await task();
  const checklist = [{ text: 'Review output', done: true }];
  assert.equal((await clients.analyst.request(`tasks/${id}`, 'PATCH', { checklist })).status, 200);
  assert.equal((await clients.analyst.request('comments', 'POST', { task_id: id, body: '@Sara please review.' })).status, 201);
  const { data: s } = await clients.analyst.request('state');
  assert.deepEqual(s.tasks.find(t => t.id === id).checklist, checklist);
  assert.ok(s.events.some(e => e.task_id === id));
  const comment = s.comments.find(c => c.task_id === id);
  assert.equal((await clients.manager.request('comments/' + comment.id, 'PATCH', { body: 'Forbidden' })).status, 403);
  assert.equal((await clients.analyst.request('comments/' + comment.id, 'PATCH', { body: 'Updated comment' })).status, 200);
  const { data: edited } = await clients.analyst.request('state'); assert.ok(edited.comments.find(c => c.id === comment.id).edited);
});
test('temporary assistance retains primary team and records work team', async () => {
  const id = await task(clients.analyst, { work_team: 'Design & Automation' });
  const { data: s } = await clients.analyst.request('state');
  assert.equal(s.tasks.find(t => t.id === id).work_team, 'Design & Automation'); assert.equal(s.me.team, 'SOC · Layer 1');
});
test('one shift per day, individual ticket validation, completion and immutability', async () => {
  const { data: { id } } = await clients.analyst.request('shifts', 'POST', {});
  assert.equal((await clients.analyst.request('shifts', 'POST', {})).data.id, id);
  assert.equal((await clients.analyst.request(`shifts/${id}`, 'PATCH', { status: 'Completed' })).status, 400);
  for (const tickets of [[{ number: '' }], [{ number: 'SD-1' }, { number: 'sd-1' }], [null]]) assert.equal((await clients.analyst.request(`shifts/${id}`, 'PATCH', { tickets })).status, 400);
  for (const iocs of [-1, 1.5, '6', 10000001]) assert.equal((await clients.analyst.request(`shifts/${id}`, 'PATCH', { iocs })).status, 400);
  assert.equal((await clients.manager.request(`shifts/${id}`, 'PATCH', { iocs: 3 })).status, 403);
  const activities = Array.from({ length: 8 }, () => ({ done: true, note: '', issue: null }));
  activities[2].issue = { summary: 'Sensor unavailable', description: 'External follow-up', reference: 'https://example.com/reference' };
  const r = await clients.analyst.request(`shifts/${id}`, 'PATCH', { activities, iocs: 6, shared: true, tickets: [{ number: 'SD-1', description: 'A traceable ticket' }], status: 'Completed' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal((await clients.analyst.request(`shifts/${id}`, 'PATCH', { iocs: 9 })).status, 409);
  const { data: s } = await clients.analyst.request('state'), shift = s.shifts.find(s => s.id === id);
  assert.equal(shift.tickets.length, 1); assert.equal(shift.iocs, 6); assert.equal(shift.activities[2].issue.summary, 'Sensor unavailable');
});
test('only SOC employees can create shifts, and only for today', async () => {
  assert.equal((await clients.design.request('shifts', 'POST', {})).status, 403);
  assert.equal((await clients.analyst.request('shifts', 'POST', { day: '2025-01-01' })).status, 400);
});
test('attachments round trip bytes and enforce parent permissions', async () => {
  const id = await task(), content = Buffer.from('A document attachment');
  const upload = { kind: 'task', object_id: id, slot: '', name: 'report.docx', content: content.toString('base64') };
  assert.equal((await clients.analyst.request('attachments', 'POST', upload)).status, 201);
  assert.equal((await clients.analyst.request('attachments', 'POST', { ...upload, content: 'invalid!' })).status, 400);
  const { data: s } = await clients.analyst.request('state'), attachment = s.attachments.find(a => a.object_id === id);
  const r = await clients.analyst.request('attachments/' + attachment.id);
  assert.deepEqual(r.data, content); assert.match(r.headers.get('content-disposition'), /attachment/);
  assert.equal((await clients.design.request('attachments/' + attachment.id)).status, 403);
});
test('Excel export is a ZIP workbook with separate, scoped, formula-safe sheets', async () => {
  await task(clients.analyst, { title: '=HYPERLINK("https://example.com")' });
  const { data: state } = await clients.analyst.request('state');
  const r = await clients.analyst.request(`export?start=${state.today}&end=${state.today}`);
  assert.equal(r.status, 200); assert.match(r.headers.get('content-type'), /spreadsheetml/);
  const files = unzip(r.data), taskSheet = files.get('xl/worksheets/sheet1.xml');
  assert.equal([...files.keys()].filter(k => k.startsWith('xl/worksheets/')).length, 3);
  assert.match(files.get('xl/workbook.xml'), /Routine Activity/);
  assert.match(taskSheet, /=HYPERLINK/); assert.doesNotMatch(taskSheet, /<f[ >]/); assert.doesNotMatch(taskSheet, /Darya/);
  assert.match(taskSheet, /t="n"><v>/);
  assert.match(taskSheet, /Primary Team/); assert.match(taskSheet, /Work Team/);
  const tickets = await clients.analyst.request(`export?start=${state.today}&end=${state.today}&type=Ticket+Report&q=does-not-exist`);
  const ticketFiles = unzip(tickets.data);
  assert.equal([...ticketFiles.keys()].filter(k => k.startsWith('xl/worksheets/')).length, 1);
  assert.doesNotMatch(ticketFiles.get('xl/worksheets/sheet1.xml'), /SD-1/);
  assert.equal((await clients.analyst.request('export?start=2026-10-01&end=2026-01-01')).status, 400);
});
test('malformed values and cross-origin writes are rejected without partial writes', async () => {
  const { data: before } = await clients.analyst.request('state');
  for (const fields of [{ title: '' }, { title: 'Bad URL', reference: 'javascript:alert(1)' }, { title: 'Bad dates', start: '2026-02-30' }, { title: 'Reversed', start: '2026-10-01', deadline: '2026-09-01' }, { title: 'Bad checklist', checklist: [null] }, { title: 'Bad team', work_team: 'Unknown' }]) {
    assert.equal((await clients.analyst.request('tasks', 'POST', fields)).status, 400);
  }
  assert.equal((await clients.analyst.request('tasks', 'POST', { title: 'Forbidden' }, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await clients.analyst.request('tasks', 'POST', { title: 'Forbidden' }, { 'X-Cadence-Request': '' })).status, 403);
  const { data: after } = await clients.analyst.request('state'); assert.equal(after.tasks.length, before.tasks.length);
});
test('only administrators manage users and cannot demote themselves', async () => {
  const employee = { name: 'Test Employee', email: 'test@cadence.local', password: 'Strong-demo-test!', role: 'Analyst', team: 'Design & Automation' };
  assert.equal((await clients.analyst.request('users', 'POST', employee)).status, 403);
  assert.equal((await clients.admin.request('users', 'POST', employee)).status, 201);
  assert.equal((await clients.admin.request('users', 'POST', employee)).status, 409);
  assert.equal((await clients.admin.request('users/1', 'PATCH', { role: 'Analyst' })).status, 400);
});
test('logout and expiry revoke sessions; cookies remain HttpOnly and SameSite', async () => {
  const c = new Client(base), r = await c.login('arman');
  assert.match(r.headers.get('set-cookie'), /HttpOnly/); assert.match(r.headers.get('set-cookie'), /SameSite=Strict/);
  await c.request('logout', 'POST', {}); assert.equal((await c.request('state')).status, 401);
  await c.login('arman'); const hash = createHash('sha256').update(c.cookie.split('=')[1]).digest('hex');
  app.db.prepare('UPDATE sessions SET expires=? WHERE token=?').run('2000-01-01T00:00:00+00:00', hash);
  assert.equal((await c.request('state')).status, 401);
});
test('existing SQLite data, Python password hashes and session dates remain usable', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-migration-')), dbPath = path.join(temp, 'existing.db');
  let local;
  try {
    local = await start({ dbPath }); const c = new Client(local.base); await c.login('iman');
    const id = await task(c, { title: 'Preserved existing task' });
    local.db.prepare('UPDATE users SET password=? WHERE id=1').run('0123456789abcdef0123456789abcdef:15b3a7fbb1ae402dd9b7aa2893bbc1cada4e65a7a78bf070fb2438f0583f33ca');
    local.db.exec('ALTER TABLE tasks DROP COLUMN work_team');
    const legacyToken = 'legacy-session-token', hash = createHash('sha256').update(legacyToken).digest('hex');
    local.db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash, 1, new Date(Date.now() + 3600000).toISOString().replace('Z', '+00:00'));
    await stop(local); local = await start({ dbPath, demo: false, adminPassword: '' });
    const old = new Client(local.base); old.cookie = 'cadence=' + legacyToken;
    assert.equal((await old.request('state')).status, 200);
    const fresh = new Client(local.base); assert.equal((await fresh.login('iman', 'Legacy-demo-password!')).status, 200);
    const { data: s } = await fresh.request('state'); assert.equal(s.users.length, 6);
    assert.equal(s.tasks.find(t => t.id === id).title, 'Preserved existing task');
    assert.equal(s.tasks.find(t => t.id === id).work_team, 'SOC · Layer 3');
  } finally { if (local) await stop(local); fs.rmSync(temp, { recursive: true, force: true }); }
});
test('failed login counters commit and temporary lockout expires', async () => {
  const local = await start();
  try {
    const c = new Client(local.base);
    for (let i = 0; i < 10; i++) assert.equal((await c.login('missing', 'wrong')).status, 401);
    assert.equal((await c.login('iman')).status, 429);
    local.db.exec("UPDATE login_attempts SET until='2000-01-01T00:00:00Z'");
    assert.equal((await c.login('iman')).status, 200);
  } finally { await stop(local); }
});
