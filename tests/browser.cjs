// Run after `npm install` and `npx playwright install chromium`.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawn}=require('node:child_process');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const output=path.join(root,'test-results');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'cadence-browser-'));
fs.mkdirSync(output,{recursive:true});
let server,browser,page;
async function start(){
 server=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,CADENCE_DEMO:'1',CADENCE_DB:path.join(temp,'browser.db'),PORT:'0'}});
 return new Promise((resolve,reject)=>{server.stdout.on('data',d=>{const m=d.toString().match(/http:\/\/127.0.0.1:\d+/);if(m)resolve(m[0]);});server.on('error',reject);server.on('exit',c=>{if(c)reject(Error('Server exited: '+c));});});
}
async function screenshot(name){await page.screenshot({path:path.join(output,name+'.png'),fullPage:true});}
async function login(email){await page.locator('[name=email]').fill(email+'@cadence.local');await page.locator('[name=password]').fill('Cadence-demo-2026!');await page.locator('button[type=submit]').click();await page.locator('#main h1').filter({hasText:/Good/}).waitFor();}
async function nav(name){await page.locator(`.sidebar [data-nav="${name}"]`).click();}
async function change(locator,value){const response=page.waitForResponse(r=>r.url().includes('/api/')&&r.request().method()==='PATCH');await locator.selectOption(value);assert.equal((await response).status(),200);await page.waitForResponse(r=>r.url().endsWith('/api/state'));}
(async()=>{
 try{
  const base=await start();browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.locator('#login-form').waitFor();await screenshot('login');await login('iman');await screenshot('dashboard-dark');
  await page.locator('[data-action=theme]').click();assert.equal(await page.locator('html').getAttribute('data-theme'),'light');await screenshot('dashboard-light');await page.locator('[data-action=theme]').click();
  await nav('tasks');await page.locator('[data-action=create-task]').click();await page.locator('[name=title]').fill('Browser workflow task');await page.locator('[name=description]').fill('A real task created by the browser integration test.');await page.locator('[name=assignee]').selectOption('3');await page.locator('#create-task-form button[type=submit]').click();await page.locator('.modal h2').filter({hasText:'Browser workflow task'}).waitFor();
  await page.locator('#comment-form textarea').fill('@Arman please review this checklist.');await page.locator('#comment-form button[type=submit]').click();await page.getByText('@Arman please review this checklist.',{exact:true}).waitFor();
  await page.locator('[data-action^="add-check:"]').click();await page.locator('#check-form [name=text]').fill('Validate the result');await page.locator('#check-form button[type=submit]').click();await page.getByText('Validate the result',{exact:true}).waitFor();await screenshot('task-detail');await page.keyboard.press('Escape');
  await page.reload();await page.locator('#task-search').fill('Browser workflow task');await page.locator('.task-title').filter({hasText:'Browser workflow task'}).waitFor();assert.equal(await page.locator('.data-table tbody tr').count(),1);await screenshot('tasks');
  for(const route of ['team','performance','reports','admin']){await nav(route);await page.locator('#main h1').waitFor();assert.ok(!(await page.locator('#main').innerText()).includes('We couldn’t load this view.'));await screenshot(route);}
  await nav('reports');await page.locator('[data-report="Ticket Report"]').click();const [download]=await Promise.all([page.waitForEvent('download'),page.locator('[data-action=export-report]').click()]);assert.match(download.suggestedFilename(),/\.xlsx$/);await download.saveAs(path.join(output,'report.xlsx'));
  await page.keyboard.press('Control+k');await page.locator('#command-query').fill('Browser workflow task');await page.locator('#command-results button').filter({hasText:'Browser workflow task'}).click();await page.locator('.detail-modal').waitFor();await page.keyboard.press('Escape');
  await page.locator('[data-action=logout]').click();await login('arman');assert.equal(await page.locator('[data-nav=admin]').count(),0);
  await page.locator('[data-action=start-shift]').click();await page.locator('.shift-activities').waitFor();await page.locator('[data-action=complete-shift]').click();await page.locator('#toast').filter({hasText:'Complete all eight activities'}).waitFor();
  await page.locator('[data-action=add-ticket]').click();await page.locator('[name=number]').fill('SD-BROWSER-1');await page.locator('[name=description]').fill('A traceable shift ticket');await page.locator('#ticket-form button[type=submit]').click();await page.locator('.ticket-record').filter({hasText:'SD-BROWSER-1'}).waitFor();
  for(let i=0;i<8;i++){const response=page.waitForResponse(r=>r.url().includes('/api/shifts/')&&r.request().method()==='PATCH');await page.locator(`[data-shift-check="${i}"]`).check();assert.equal((await response).status(),200);await page.locator('.completion-tag').filter({hasText:`${Math.round((i+1)/8*100)}%`}).waitFor();}
  await page.locator('[data-shift-iocs]').fill('6');await page.locator('[data-shift-iocs]').press('Tab');await page.locator('.shift-recap').getByText('6',{exact:true}).waitFor();await screenshot('shift-active');await page.locator('[data-action=complete-shift]').click();await page.locator('.page-heading .status-completed').waitFor();assert.equal(await page.locator('[data-shift-check]:disabled').count(),8);await screenshot('shift-completed');
  await page.reload();await page.locator('.shift-recap').waitFor();assert.equal(await page.locator('.ticket-record').count(),1);
  await page.setViewportSize({width:1920,height:1080});await nav('dashboard');await screenshot('dashboard-wide');
  await page.setViewportSize({width:390,height:844});await screenshot('dashboard-narrow');const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false,'Page should not overflow horizontally');
  assert.deepEqual(errors,[]);console.log('PASS: browser workflows, persistence, downloads, themes, and viewports.');
 }catch(error){if(page)await screenshot('failure').catch(()=>{});console.error(error);process.exitCode=1;}
 finally{await browser?.close();server?.kill();fs.rmSync(temp,{recursive:true,force:true});}
})();
