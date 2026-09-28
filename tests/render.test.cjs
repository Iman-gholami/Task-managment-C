// Server-rendered template contract checks. These do not replace browser/layout QA.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const vm=require('node:vm');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..');
let server,temp,base;
before(async()=>{
  temp=fs.mkdtempSync(path.join(os.tmpdir(),'cadence-render-'));
  server=spawn('python',['-u','server.py'],{cwd:root,env:{...process.env,CADENCE_DEMO:'1',CADENCE_DB:path.join(temp,'test.db'),PORT:'0'}});
  // A temporary free port is assigned by asking the server to print its bound address.
  base=await new Promise((resolve,reject)=>{server.stdout.on('data',d=>{const m=d.toString().match(/http:\/\/127.0.0.1:(\d+)/);if(m)resolve(m[0]);});server.on('error',reject);server.on('exit',c=>{if(c)reject(Error('Server failed: '+c));});});
});
after(()=>{server?.kill();if(temp)fs.rmSync(temp,{recursive:true,force:true});});
async function state(email){const r=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json','X-Cadence-Request':'1'},body:JSON.stringify({email:email+'@cadence.local',password:'Cadence-demo-2026!'})});assert.equal(r.status,200);const cookie=r.headers.get('set-cookie').split(';')[0];return (await fetch(base+'/api/state',{headers:{Cookie:cookie}})).json();}
function harness(fixture){const nodes={};const node=()=>({innerHTML:'',className:'',focus(){},classList:{add(){},remove(){}}});const document={documentElement:{dataset:{}},body:node(),activeElement:node(),querySelector:q=>nodes[q]??=node(),querySelectorAll:()=>[],addEventListener(){}};
 const context=vm.createContext({fixture,document,location:{hash:'',reload(){}},window:{addEventListener(){}},localStorage:{getItem(){return null},setItem(){}},console,Date,URLSearchParams,structuredClone,requestAnimationFrame:f=>f(),setTimeout,clearTimeout});
 const source=fs.readFileSync(path.join(root,'static/app.js'),'utf8');vm.runInContext(source.slice(0,source.lastIndexOf('(async()=>')),context);vm.runInContext('S=fixture;setRange();',context);return {context,nodes,run:code=>vm.runInContext(code,context)};
}
for(const [role,email] of [['Security Manager','iman'],['SOC Manager','sara'],['Analyst','arman']])test(role+' screens render from real scoped API data',async()=>{
 const h=harness(await state(email));
 for(const route of ['dashboard','tasks/my','tasks/team','tasks/all','shifts','shifts/history','team','performance','performance/employee','reports','admin']){
  h.run(`route=${JSON.stringify(route)};render();`);const html=h.nodes['#main'].innerHTML;
  assert.ok(html.length>70,route);assert.ok(!html.includes('We couldn’t load this view.'),route);assert.ok(!html.includes('[object Object]'),route);
 }
 for(const type of ['Employee Monthly Report','Team Monthly Report','Task Report','SOC Shift Activity Report','Ticket Report']){h.run(`reportType=${JSON.stringify(type)};route='reports';render();`);assert.ok(h.nodes['#main'].innerHTML.includes(type));}
 h.run('createTask()');assert.ok(h.nodes['#overlay'].innerHTML.includes('Work team'));
 h.run('taskDetail(S.tasks[0].id)');assert.ok(h.nodes['#overlay'].innerHTML.includes('Checklist'));
 h.run('period="Custom Range";render()');assert.ok(h.nodes['#main'].innerHTML);
 h.run('route="shifts";activeShift=S.shifts[0]?.id;render()');assert.ok(!h.nodes['#main'].innerHTML.includes('We couldn’t load this view.'));
});
test('User content is escaped and empty screens remain actionable',async()=>{const fixture=await state('iman'),h=harness(fixture);h.run('S.tasks[0].title="<img src=x onerror=alert(1)>";taskDetail(S.tasks[0].id)');assert.ok(h.nodes['#overlay'].innerHTML.includes('&lt;img'));assert.ok(!h.nodes['#overlay'].innerHTML.includes('<img src=x'));h.run('S.tasks=[];S.shifts=[];route="tasks/all";render()');assert.ok(h.nodes['#main'].innerHTML.includes('You’re all caught up.'));h.run('route="performance";render()');assert.ok(h.nodes['#main'].innerHTML.includes('No activity was found'));});
