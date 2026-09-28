import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { TEAMS, PRIORITIES, COMPLEXITIES, ACTIVITIES, blankActivities, passwordHash, today, now, offsetDate, need } from './domain.js';

export function openDatabase({ dbPath, demo = false, adminPassword = '' }) {
  if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  try {
    db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;');
    db.exec(`
      CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL, team TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id INTEGER REFERENCES users(id), expires TEXT);
      CREATE TABLE IF NOT EXISTS tasks(id INTEGER PRIMARY KEY, title TEXT, description TEXT, assignee INTEGER REFERENCES users(id), status TEXT, priority TEXT, complexity TEXT, start TEXT, deadline TEXT, hours REAL, quality TEXT, review_required INTEGER, checklist TEXT, reference TEXT, updated TEXT, completed TEXT, created_by INTEGER REFERENCES users(id));
      CREATE TABLE IF NOT EXISTS comments(id INTEGER PRIMARY KEY, task_id INTEGER REFERENCES tasks(id), user_id INTEGER REFERENCES users(id), body TEXT, created TEXT, edited TEXT);
      CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY, task_id INTEGER REFERENCES tasks(id), user_id INTEGER REFERENCES users(id), body TEXT, created TEXT);
      CREATE TABLE IF NOT EXISTS shifts(id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id), day TEXT, status TEXT, activities TEXT, iocs INTEGER, shared INTEGER, reference TEXT, tickets TEXT, updated TEXT, UNIQUE(user_id,day));
      CREATE TABLE IF NOT EXISTS attachments(id INTEGER PRIMARY KEY, kind TEXT, object_id INTEGER, slot TEXT, name TEXT, content BLOB, user_id INTEGER REFERENCES users(id));
      CREATE TABLE IF NOT EXISTS login_attempts(client TEXT PRIMARY KEY, attempts INTEGER, until TEXT);
    `);
    if (!db.prepare('PRAGMA table_info(tasks)').all().some(row => row.name === 'work_team')) {
      db.exec("ALTER TABLE tasks ADD COLUMN work_team TEXT NOT NULL DEFAULT ''");
    }
    if (!db.prepare('SELECT count(*) AS count FROM users').get().count) {
      need(demo || adminPassword.length >= 12, 'Set CADENCE_ADMIN_PASSWORD (12+ characters), or CADENCE_DEMO=1 for local sample data.');
      db.exec('BEGIN IMMEDIATE');
      try { seed(db, demo, adminPassword || 'Cadence-demo-2026!'); db.exec('COMMIT'); }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    }
    return db;
  } catch (error) { db.close(); throw error; }
}

function seed(db, demo, password) {
  const people = [['Iman Gholami', 'iman@cadence.local', 'Security Manager', TEAMS[2]]];
  if (demo) people.push(
    ['Sara Ahmadi', 'sara@cadence.local', 'SOC Manager', TEAMS[1]],
    ['Arman Karimi', 'arman@cadence.local', 'Analyst', TEAMS[0]],
    ['Nika Rahimi', 'nika@cadence.local', 'Analyst', TEAMS[1]],
    ['Darya Moradi', 'darya@cadence.local', 'Analyst', TEAMS[3]],
    ['Ali Hosseini', 'ali@cadence.local', 'Analyst', TEAMS[4]],
  );
  const insertUser = db.prepare('INSERT INTO users(name,email,password,role,team) VALUES(?,?,?,?,?)');
  for (const [name, email, role, team] of people) insertUser.run(name, email, passwordHash(password), role, team);
  if (!demo) return;
  const titles = ['Refine the shift handover playbook', 'Automate the daily traffic report', 'Review the onboarding checklist', 'Document the IOC enrichment workflow', 'Validate sensor coverage inventory', 'Update monthly reporting template', 'Improve the MISP sharing procedure', 'Review team access documentation', 'Prepare analyst training material', 'Streamline website file publishing', 'Document escalation ownership', 'Evaluate automation quality checks'];
  const statuses = ['In Progress', 'Review', 'To Do', 'Done', 'Blocked', 'Done', 'In Progress', 'Review', 'Backlog', 'Done', 'To Do', 'Done'];
  const insertTask = db.prepare('INSERT INTO tasks(title,description,assignee,status,priority,complexity,start,deadline,hours,quality,review_required,checklist,reference,updated,completed,created_by,work_team) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  for (let i = 0; i < titles.length; i++) {
    const status = statuses[i], uid = i % 4 + 3;
    insertTask.run(titles[i], 'Deliver a clear, reusable outcome for the team. Document the approach, validate the result, and share a concise handover.', uid, status, PRIORITIES[(i + 1) % 4], COMPLEXITIES[i % 4], offsetDate(today(), -7), offsetDate(today(), i % 7 - 2), Math.round((2 + i * .75) * 10) / 10, status === 'Done' ? 'Good' : '', 1, JSON.stringify([{ text: 'Confirm scope and acceptance criteria', done: true }, { text: 'Validate and document the outcome', done: status === 'Done' }]), '', now(), status === 'Done' ? today() : '', 2, people[uid - 1][3]);
  }
  const insertShift = db.prepare('INSERT INTO shifts(user_id,day,status,activities,iocs,shared,reference,tickets,updated) VALUES(?,?,?,?,?,?,?,?,?)');
  for (let offset = 1; offset < 8; offset++) for (const uid of [3, 4]) {
    insertShift.run(uid, offsetDate(today(), -offset), 'Completed', JSON.stringify(blankActivities().map(a => ({ ...a, done: true }))), offset + uid, 1, '', JSON.stringify([{ number: `SD-${1000 + offset * 10 + uid}`, related: 'Daily operations', description: 'Follow-up request', link: '' }]), now());
  }
}
