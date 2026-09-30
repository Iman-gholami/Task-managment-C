// Responsive and keyboard regression checks against the real Node server.
// Run after the browser workflow suite. No mocked API or screenshot fixtures.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'test-results', 'ui');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-ui-'));
fs.mkdirSync(output, { recursive: true });
let server, browser, page;
const results = [], errors = [];

async function start() {
  server = spawn(process.execPath, ['server.js'], { cwd: root, env: { ...process.env, CADENCE_DEMO: '1', CADENCE_DB: path.join(temp, 'ui.db'), PORT: '0' } });
  return new Promise((resolve, reject) => {
    server.stdout.on('data', d => { const m = d.toString().match(/http:\/\/127.0.0.1:\d+/); if (m) resolve(m[0]); });
    server.on('error', reject);
    server.on('exit', c => { if (c) reject(Error('Server exited: ' + c)); });
  });
}
async function login(name) {
  await page.locator('[name=email]').fill(name + '@cadence.local');
  await page.locator('[name=password]').fill('Cadence-demo-2026!');
  await page.locator('#login-form button[type=submit]').click();
  await page.locator('#main h1').filter({ hasText: /Good/ }).waitFor();
}
async function logout() {
  await close();
  await page.locator('[data-action=account]').click();
  await page.locator('[data-action=logout]').click();
  await page.locator('#login-form').waitFor();
}
async function close() {
  while (await page.locator('.modal').count()) await page.keyboard.press('Escape');
}
async function nav(route) {
  await close();
  await page.locator(`.sidebar [data-nav="${route}"]`).click();
  await page.locator('#main h1').waitFor();
}
async function saveChange(action) {
  const saved = page.waitForResponse(r => r.url().endsWith('/api/state'));
  const response = page.waitForResponse(r => r.request().method() === 'PATCH');
  await action();
  assert.equal((await response).status(), 200);
  await saved;
}
async function inspect(name, theme, width) {
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); document.querySelector('.modal')?.scrollTo(0, 0); });
  const audit = await page.evaluate(() => {
    const visible = el => !!el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
    const root = document.querySelector('.modal') || document.querySelector('#app');
    const controls = [...root.querySelectorAll('button,input,select,textarea')].filter(visible);
    const unnamed = controls.filter(el => !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby') &&
      !(el.tagName === 'BUTTON' && el.textContent.trim()) &&
      ![...el.labels || []].some(l => l.textContent.trim())).map(el => el.outerHTML.slice(0, 200));
    const smallText = [...root.querySelectorAll('p,small,h1,h2,h3,.status,.due,.field>span,.task-title strong')]
      .filter(el => visible(el) && el.textContent.trim() && parseFloat(getComputedStyle(el).fontSize) < 12)
      .map(el => el.className || el.tagName);
    const hiddenStates = [...root.querySelectorAll('.queue-row .status,.queue-row .due')].filter(el => !visible(el)).length;
    return { overflow: document.documentElement.scrollWidth > innerWidth + 1, unnamed, smallText, hiddenStates };
  });
  const file = `${width}-${theme}-${name}.png`;
  await page.screenshot({ path: path.join(output, file), animations: 'disabled' });
  results.push({ name, theme, width, file, ...audit });
}
async function checkContrast(theme) {
  const palette = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return Object.fromEntries(['bg', 'surface', 'surface-2', 'text', 'secondary', 'muted', 'primary', 'primary-solid', 'success', 'warning', 'danger', 'info'].map(k => [k, style.getPropertyValue('--' + k).trim()]));
  });
  const luminance = hex => {
    const rgb = hex.match(/[a-f\d]{2}/gi).map(v => parseInt(v, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  };
  const contrast = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
  for (const fg of ['text', 'secondary', 'muted', 'primary', 'success', 'warning', 'danger', 'info']) {
    for (const bg of ['bg', 'surface', 'surface-2']) assert.ok(contrast(palette[fg], palette[bg]) >= 4.5, `${theme} ${fg}/${bg} contrast`);
  }
  assert.ok(contrast('#ffffff', palette['primary-solid']) >= 4.5, `${theme} primary button contrast`);
}
async function contactSheets() {
  const gallery = await browser.newPage({ viewport: { width: 1560, height: 900 } });
  for (const width of [1440, 1280, 1024, 768, 390]) {
    const rows = results.filter(r => r.width === width);
    await gallery.setContent(`<html><head><style>body{margin:0;padding:20px;background:#dce2eb;color:#142133;font:14px system-ui}h1{font-size:22px}main{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}figure{margin:0;min-width:0}figcaption{font-weight:600;padding:8px 0}img{display:block;width:100%;border:1px solid #8491a4}</style></head><body><h1>Cadence · ${width}px · dark and light</h1><main>${rows.map(r => `<figure><figcaption>${r.theme} / ${r.name}</figcaption><img src="data:image/png;base64,${fs.readFileSync(path.join(output, r.file)).toString('base64')}"></figure>`).join('')}</main></body></html>`);
    await gallery.screenshot({ path: path.join(output, `contact-${width}.jpg`), fullPage: true, type: 'jpeg', quality: 80 });
  }
  await gallery.close();
}

(async () => {
  try {
    const base = await start();
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base);
    await page.locator('#login-form').waitFor();
    // Sign-in layout in both themes, at every required width.
    for (const width of [1440, 1280, 1024, 768, 390]) for (const theme of ['dark', 'light']) {
      await page.setViewportSize({ width, height: 960 });
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; localStorage.setItem('cadence-theme', theme); }, theme);
      await inspect('login', theme, width);
    }
    await page.setViewportSize({ width: 1440, height: 960 });
    await login('iman');

    // Preserve the exact view when visiting another page and returning.
    await nav('tasks');
    await page.locator('#task-search').fill('a');
    await page.locator('#task-priority').selectOption('High');
    const before = await page.locator('#task-results').innerText();
    await nav('team'); await nav('tasks');
    assert.equal(await page.locator('#task-search').inputValue(), 'a');
    assert.equal(await page.locator('#task-priority').inputValue(), 'High');
    assert.equal(await page.locator('#task-results').innerText(), before);
    await page.locator('[data-action=reset-task-filters]').click();
    await page.locator('[data-sort=priority]').click();
    assert.equal(await page.locator('th:has([data-sort=priority])').getAttribute('aria-sort'), 'ascending');
    await page.locator('[data-sort=priority]').click();
    assert.equal(await page.locator('th:has([data-sort=priority])').getAttribute('aria-sort'), 'descending');

    // Drawer editing returns to context; Escape returns keyboard focus to its origin.
    const firstTask = page.locator('.task-title').first();
    const origin = await firstTask.getAttribute('data-action');
    await firstTask.click();
    assert.equal(await page.locator('#app').evaluate(el => el.inert), true);
    await page.locator('#comment-form textarea').fill('Draft retained while inspecting properties');
    await page.locator('.modal [data-task-priority]').focus();
    await saveChange(() => page.locator('.modal [data-task-priority]').selectOption('High'));
    await page.waitForFunction(() => document.activeElement?.hasAttribute('data-task-priority'));
    assert.equal(await page.locator('#comment-form textarea').inputValue(), 'Draft retained while inspecting properties');

    await page.locator('[data-action^="edit-description:"]').click();
    await page.keyboard.press('Escape');
    await page.locator('.detail-modal').waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.action), origin);
    assert.equal(await page.locator('#app').evaluate(el => el.inert), false);

    // Keyboard search reaches actual shift records and reports, not placeholder results.
    await page.keyboard.press('Control+k');
    await page.locator('#command-query').fill('shift');
    assert.ok(await page.locator('#command-results [data-action^="open-shift:"]').count());
    await page.locator('#command-query').press('ArrowDown');
    const active = await page.locator('#command-query').getAttribute('aria-activedescendant');
    assert.equal(await page.locator('#' + active).getAttribute('aria-selected'), 'true');
    await page.locator('#command-query').fill('Ticket Report');
    await page.locator('#command-query').press('Enter');
    await page.locator('.section-head h2').filter({ hasText: 'Ticket Report' }).waitFor();
    await page.keyboard.press('n');
    await page.locator('#create-task-form [name=title]').waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.name), 'title');
    await close();

    const screens = [
      ['dashboard', () => nav('dashboard')],
      ['tasks', () => nav('tasks')],
      ['task-create', async () => { await nav('tasks'); await page.locator('[data-action=create-task]').click(); }],
      ['task-detail', async () => { await nav('tasks'); await page.locator('.task-title').first().click(); }],
      ['shift-workspace', async () => { await nav('shifts'); const rows = page.locator('[data-action^="open-shift:"]'); if (await rows.count()) await rows.first().click(); }],
      ['shift-history', async () => { await nav('shifts'); await page.locator('[data-action=shift-history]').click(); }],
      ['team', () => nav('team')],
      ['performance', () => nav('performance')],
      ['employee', async () => { await nav('team'); await page.locator('.employee-name').first().click(); }],
      ['reports', async () => { await nav('reports'); await page.locator('[data-report="Employee Monthly Report"]').click(); }],
      ['admin', () => nav('admin')],
      ['search', async () => { await nav('dashboard'); await page.keyboard.press('Control+k'); await page.locator('#command-query').fill('shift'); }],
    ];
    for (const width of [1440, 1280, 1024, 768, 390]) {
      await page.setViewportSize({ width, height: 960 });
      for (const theme of ['dark', 'light']) {
        await close();
        if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('[data-action=theme]').click();
        await checkContrast(theme);
        for (const [name, open] of screens) { await open(); await inspect(name, theme, width); }
      }
    }
    // Mobile sorting remains usable when the table header is visually collapsed.
    await nav('tasks');
    await page.locator('#task-sort').selectOption('hours');
    assert.equal(await page.locator('th:has([data-sort=title])').getAttribute('aria-sort'), 'none');
    await page.locator('[data-action=sort-direction]').click();
    await page.locator('#task-sort').selectOption('deadline');
    await nav('shifts');
    await page.locator('[data-action="shift-section:context"]').click();
    assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('continuity-panel')), true);

    // Analyst: recorded issue/note, read/write scope, review submission, and mobile account access.
    await logout(); await login('arman');
    assert.equal(await page.locator('[data-nav=admin]').count(), 0);
    await page.locator('[data-action=start-shift]').click();
    await page.locator('.shift-activities').waitFor();
    await page.locator('[data-action="issue:0"]').click();
    await page.locator('[name=summary]').fill('Sensor needs a follow-up');
    await page.locator('#issue-form button[type=submit]').click();
    await page.locator('.continuity-panel').getByText('Sensor needs a follow-up', { exact: true }).waitFor();
    const note = page.locator('[data-shift-note="0"]');
    await page.locator('#shift-activity-0 summary').click();
    await note.fill('Review the collector at the start of the next shift.');
    await saveChange(() => note.press('Tab'));
    await page.reload();
    await page.locator('.shift-activities').waitFor();
    assert.equal(await note.inputValue(), 'Review the collector at the start of the next shift.');
    await nav('tasks'); await page.locator('[data-action=create-task]').click();
    await page.locator('[name=title]').fill('UI review workflow');
    await page.locator('#create-task-form button[type=submit]').click();
    await page.locator('.detail-modal').waitFor();
    assert.equal(await page.locator('[data-task-quality]').count(), 0);
    await saveChange(() => page.locator('.modal [data-task-status]').selectOption('Review'));
    await page.locator('.detail-summary .status-review').waitFor();
    await logout(); await login('sara');
    await nav('tasks'); await page.locator('#task-search').fill('UI review workflow');
    await page.locator('.task-title').click();
    await page.locator('[data-action^="approve:"]').click();
    await page.locator('.detail-summary .status-done').waitFor();
    await close();
    await page.reload(); await page.locator('#task-search').fill('UI review workflow');
    await page.locator('.task-title').click();
    await page.locator('.detail-summary .status-done').waitFor();

    await contactSheets();
    const failures = results.filter(r => r.overflow || r.unnamed.length || r.smallText.length || r.hiddenStates);
    fs.writeFileSync(path.join(output, 'audit.json'), JSON.stringify({ screenshots: results.length, errors, failures, results }, null, 2));
    assert.deepEqual(errors, [], 'No browser runtime errors');
    assert.deepEqual(failures, [], 'Responsive/label/readability checks');
    console.log(`PASS: ${results.length} screen/theme/viewport combinations, token contrast, keyboard context, analyst and manager workflows.`);
  } catch (error) {
    fs.writeFileSync(path.join(output, 'partial-audit.json'), JSON.stringify({ failure: error.stack, errors, results }, null, 2));
    if (page) await page.screenshot({ path: path.join(output, 'failure.png'), animations: 'disabled' }).catch(() => {});
    console.error(error); process.exitCode = 1;
  } finally {
    await browser?.close(); server?.kill(); fs.rmSync(temp, { recursive: true, force: true });
  }
})();
