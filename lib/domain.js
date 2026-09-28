import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';

export const STATUSES = ['Backlog', 'To Do', 'In Progress', 'Review', 'Done', 'Blocked', 'Returned', 'Cancelled'];
export const PRIORITIES = ['Low', 'Normal', 'High', 'Critical'];
export const COMPLEXITIES = ['Simple', 'Medium', 'Complex', 'Advanced'];
export const QUALITIES = ['Excellent', 'Good', 'Acceptable', 'Needs Improvement'];
export const TEAMS = ['SOC · Layer 1', 'SOC · Layer 2', 'SOC · Layer 3', 'Design & Automation', 'Threat Intelligence'];
export const ROLES = ['Analyst', 'SOC Manager', 'Security Manager'];
export const ACTIVITIES = [
  'Review Logged Incidents in Splunk Incident Review',
  'Upload Malicious IP and Domain Files to the Website',
  'Review Scanner and Sensor Dashboards',
  'Prepare Daily Traffic Report',
  'Monitor Website Status in Grafana',
  'Monitor Security Center Website',
  'Monitor Security News',
  'Add IOCs to MISP and Share Them via Bale',
];

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export function need(condition, message, status = 400) {
  if (!condition) throw new HttpError(status, message);
}
export const text = (value, limit = 10000) => String(value ?? '').trim().slice(0, limit);
export const now = () => new Date().toISOString();
export const today = () => new Date(Date.now() + 3.5 * 3600000).toISOString().slice(0, 10);
export const offsetDate = (day, offset) => new Date(Date.parse(day + 'T12:00:00Z') + offset * 86400000).toISOString().slice(0, 10);
export function date(value, optional = false) {
  if (optional && !value) return '';
  need(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value), 'Enter a valid date.');
  const parsed = new Date(value + 'T12:00:00Z');
  need(Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value, 'Enter a valid date.');
  return value;
}
export function integer(value, label = 'Value') {
  const n = Number(value);
  need(Number.isSafeInteger(n) && n > 0, `${label} must be a positive whole number.`);
  return n;
}
export function validUrl(value) {
  if (!value) return;
  let parsed;
  try { parsed = new URL(value); } catch { /* handled below */ }
  need(typeof value === 'string' && parsed && ['http:', 'https:'].includes(parsed.protocol) && parsed.hostname,
    'External links must start with https:// or http://.');
}
export function publicUser(user) {
  return Object.fromEntries(['id', 'name', 'email', 'role', 'team'].map(key => [key, user[key]]));
}
export function canUser(actor, target) {
  return target && (actor.role === 'Security Manager' || actor.id === target.id ||
    (actor.role === 'SOC Manager' && target.team.startsWith('SOC')));
}
export function canTask(db, actor, task) {
  return task && canUser(actor, db.prepare('SELECT * FROM users WHERE id=?').get(task.assignee));
}
export function taskData(db, task) {
  return { ...task, checklist: JSON.parse(task.checklist),
    work_team: task.work_team || db.prepare('SELECT team FROM users WHERE id=?').get(task.assignee).team };
}
export function shiftData(shift) {
  return { ...shift, activities: JSON.parse(shift.activities), tickets: JSON.parse(shift.tickets) };
}
export function passwordHash(password, salt = randomBytes(16).toString('hex')) {
  // Preserve the Python MVP's format so existing accounts keep working.
  return `${salt}:${pbkdf2Sync(password, salt, 260000, 32, 'sha256').toString('hex')}`;
}
export function validPassword(password, stored) {
  if (typeof stored !== 'string' || !/^[a-f0-9]{32}:[a-f0-9]{64}$/.test(stored)) return false;
  return timingSafeEqual(Buffer.from(passwordHash(password, stored.split(':')[0])), Buffer.from(stored));
}
export const blankActivities = () => ACTIVITIES.map(() => ({ done: false, note: '', issue: null, reference: '' }));
