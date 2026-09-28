"""Cadence: dependency-free internal work management application."""
import base64
import datetime as dt
import hashlib
import hmac
import io
import json
import os
import re
import secrets
import sqlite3
import zipfile
from http import cookies
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from xml.sax.saxutils import escape

ROOT = Path(__file__).parent
DB = os.environ.get('CADENCE_DB', str(ROOT / 'data' / 'cadence.db'))
STATUSES = ['Backlog', 'To Do', 'In Progress', 'Review', 'Done', 'Blocked', 'Returned', 'Cancelled']
PRIORITIES = ['Low', 'Normal', 'High', 'Critical']
COMPLEXITIES = ['Simple', 'Medium', 'Complex', 'Advanced']
QUALITIES = ['Excellent', 'Good', 'Acceptable', 'Needs Improvement']
TEAMS = ['SOC · Layer 1', 'SOC · Layer 2', 'SOC · Layer 3', 'Design & Automation', 'Threat Intelligence']
ROLES = ['Analyst', 'SOC Manager', 'Security Manager']
ACTIVITIES = ['Review Logged Incidents in Splunk Incident Review', 'Upload Malicious IP and Domain Files to the Website', 'Review Scanner and Sensor Dashboards', 'Prepare Daily Traffic Report', 'Monitor Website Status in Grafana', 'Monitor Security Center Website', 'Monitor Security News', 'Add IOCs to MISP and Share Them via Bale']

def now(): return dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')
def today(): return dt.datetime.now(dt.timezone(dt.timedelta(hours=3, minutes=30))).date().isoformat()
def connect():
    c = sqlite3.connect(DB)
    c.row_factory = sqlite3.Row
    c.execute('PRAGMA foreign_keys=ON')
    return c

def password_hash(password, salt=None):
    salt = salt or secrets.token_hex(16)
    return salt + ':' + hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 260000).hex()

def valid_password(password, stored):
    return hmac.compare_digest(password_hash(password, stored.split(':')[0]), stored)

def public_user(row): return {k: row[k] for k in ('id', 'name', 'email', 'role', 'team')}
def need(condition, message, status=400):
    if not condition: raise ValueError(status, message)

def text(value, limit=10000): return str(value or '').strip()[:limit]
def date(value, optional=False):
    if optional and not value: return ''
    try: return dt.date.fromisoformat(value).isoformat()
    except (ValueError, TypeError): raise ValueError(400, 'Enter a valid date.')

def init_db():
    Path(DB).parent.mkdir(parents=True, exist_ok=True)
    with connect() as c:
        c.executescript('''
        CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL, team TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id INTEGER REFERENCES users(id), expires TEXT);
        CREATE TABLE IF NOT EXISTS tasks(id INTEGER PRIMARY KEY, title TEXT, description TEXT, assignee INTEGER REFERENCES users(id), status TEXT, priority TEXT, complexity TEXT, start TEXT, deadline TEXT, hours REAL, quality TEXT, review_required INTEGER, checklist TEXT, reference TEXT, updated TEXT, completed TEXT, created_by INTEGER REFERENCES users(id));
        CREATE TABLE IF NOT EXISTS comments(id INTEGER PRIMARY KEY, task_id INTEGER REFERENCES tasks(id), user_id INTEGER REFERENCES users(id), body TEXT, created TEXT, edited TEXT);
        CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY, task_id INTEGER REFERENCES tasks(id), user_id INTEGER REFERENCES users(id), body TEXT, created TEXT);
        CREATE TABLE IF NOT EXISTS shifts(id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id), day TEXT, status TEXT, activities TEXT, iocs INTEGER, shared INTEGER, reference TEXT, tickets TEXT, updated TEXT, UNIQUE(user_id,day));
        CREATE TABLE IF NOT EXISTS attachments(id INTEGER PRIMARY KEY, kind TEXT, object_id INTEGER, slot TEXT, name TEXT, content BLOB, user_id INTEGER REFERENCES users(id));
        CREATE TABLE IF NOT EXISTS login_attempts(client TEXT PRIMARY KEY, attempts INTEGER, until TEXT);
        ''')
        if 'work_team' not in [r[1] for r in c.execute('PRAGMA table_info(tasks)')]:
            c.execute("ALTER TABLE tasks ADD COLUMN work_team TEXT NOT NULL DEFAULT ''")
        if c.execute('SELECT count(*) FROM users').fetchone()[0]: return
        demo = os.environ.get('CADENCE_DEMO', '0') == '1'
        password = os.environ.get('CADENCE_ADMIN_PASSWORD')
        need(demo or (password and len(password) >= 12), 'Set CADENCE_ADMIN_PASSWORD (12+ characters), or CADENCE_DEMO=1 for local sample data.')
        password = password or 'Cadence-demo-2026!'
        people = [('Iman Gholami','iman@cadence.local','Security Manager',TEAMS[2])]
        if demo: people += [('Sara Ahmadi','sara@cadence.local','SOC Manager',TEAMS[1]),('Arman Karimi','arman@cadence.local','Analyst',TEAMS[0]),('Nika Rahimi','nika@cadence.local','Analyst',TEAMS[1]),('Darya Moradi','darya@cadence.local','Analyst',TEAMS[3]),('Ali Hosseini','ali@cadence.local','Analyst',TEAMS[4])]
        for name,email,role,team in people:
            c.execute('INSERT INTO users(name,email,password,role,team) VALUES(?,?,?,?,?)',(name,email,password_hash(password),role,team))
        if demo:
            titles = ['Refine the shift handover playbook','Automate the daily traffic report','Review the onboarding checklist','Document the IOC enrichment workflow','Validate sensor coverage inventory','Update monthly reporting template','Improve the MISP sharing procedure','Review team access documentation','Prepare analyst training material','Streamline website file publishing','Document escalation ownership','Evaluate automation quality checks']
            day = dt.date.fromisoformat(today())
            for i,title_ in enumerate(titles):
                status = ['In Progress','Review','To Do','Done','Blocked','Done','In Progress','Review','Backlog','Done','To Do','Done'][i]
                end = (day+dt.timedelta(days=i%7-2)).isoformat()
                c.execute('INSERT INTO tasks(title,description,assignee,status,priority,complexity,start,deadline,hours,quality,review_required,checklist,reference,updated,completed,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',(title_,'Deliver a clear, reusable outcome for the team. Document the approach, validate the result, and share a concise handover.',i%4+3,status,PRIORITIES[(i+1)%4],COMPLEXITIES[i%4],(day-dt.timedelta(days=7)).isoformat(),end,round(2+i*.75,1),'Good' if status=='Done' else '',1,json.dumps([{'text':'Confirm scope and acceptance criteria','done':True},{'text':'Validate and document the outcome','done':status=='Done'}]),'',now(),today() if status=='Done' else '',2))
            for offset in range(1,8):
                for uid in [3,4]:
                    d=(day-dt.timedelta(days=offset)).isoformat()
                    c.execute('INSERT INTO shifts(user_id,day,status,activities,iocs,shared,reference,tickets,updated) VALUES(?,?,?,?,?,?,?,?,?)',(uid,d,'Completed',json.dumps([{'done':True,'note':'','issue':None} for _ in ACTIVITIES]),offset+uid,1,'',json.dumps([{'number':f'SD-{1000+offset*10+uid}','related':'Daily operations','description':'Follow-up request','link':''}]),now()))

def can_user(actor, target):
    return actor['role']=='Security Manager' or actor['id']==target['id'] or (actor['role']=='SOC Manager' and target['team'].startswith('SOC'))

def can_task(c, actor, task):
    target = c.execute('SELECT * FROM users WHERE id=?',(task['assignee'],)).fetchone()
    return target and can_user(actor,target)

def task_dict(c,row):
    t=dict(row);t['checklist']=json.loads(t['checklist'])
    if not t.get('work_team'): t['work_team']=c.execute('SELECT team FROM users WHERE id=?',(t['assignee'],)).fetchone()[0]
    return t

def shift_dict(row):
    s=dict(row);s['activities']=json.loads(s['activities']);s['tickets']=json.loads(s['tickets']);return s

def xlsx(sheets):
    """Write real OOXML, using inline strings so untrusted cells never become formulas."""
    out=io.BytesIO()
    with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
        z.writestr('[Content_Types].xml','<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'+''.join(f'<Override PartName="/xl/worksheets/sheet{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' for i in range(1,len(sheets)+1))+'</Types>')
        z.writestr('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')
        z.writestr('xl/workbook.xml','<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+''.join(f'<sheet name="{escape(name)}" sheetId="{i}" r:id="rId{i}"/>' for i,(name,_) in enumerate(sheets,1))+'</sheets></workbook>')
        z.writestr('xl/_rels/workbook.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+''.join(f'<Relationship Id="rId{i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{i}.xml"/>' for i in range(1,len(sheets)+1))+'</Relationships>')
        for i,(_,rows) in enumerate(sheets,1):
            content=[]
            for rn,row in enumerate(rows,1):
                cells=[]
                for cn,v in enumerate(row,1):
                    n=cn; col=''
                    while n: n,r=divmod(n-1,26);col=chr(65+r)+col
                    v=re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]','',str(v if v is not None else ''))
                    cells.append(f'<c r="{col}{rn}" t="inlineStr"><is><t xml:space="preserve">{escape(v)}</t></is></c>')
                content.append(f'<row r="{rn}">{"".join(cells)}</row>')
            z.writestr(f'xl/worksheets/sheet{i}.xml','<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="12" width="24" customWidth="1"/></cols><sheetData>'+''.join(content)+'</sheetData></worksheet>')
    return out.getvalue()

class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args): pass
    def send(self,status,data,ctype='application/json',headers=None):
        if ctype=='application/json': data=json.dumps(data).encode()
        if isinstance(data,str): data=data.encode()
        self.send_response(status)
        self.send_header('Content-Type',ctype);self.send_header('Content-Length',str(len(data)))
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Referrer-Policy','same-origin')
        self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'")
        self.send_header('Cache-Control','no-store' if self.path.startswith('/api/') else 'no-cache')
        for k,v in (headers or {}).items(): self.send_header(k,v)
        self.end_headers();self.wfile.write(data)
    def do_GET(self): self.run('GET')
    def do_POST(self): self.run('POST')
    def do_PATCH(self): self.run('PATCH')
    def do_DELETE(self): self.run('DELETE')
    def run(self,method):
        try:
            p=urlparse(self.path); path=p.path; q={k:v[0] for k,v in parse_qs(p.query).items()}
            if not path.startswith('/api/'):
                need(method=='GET','Method not allowed.',405)
                file={'/':('index.html','text/html; charset=utf-8'),'/app.js':('app.js','text/javascript; charset=utf-8'),'/styles.css':('styles.css','text/css; charset=utf-8')}.get(path)
                need(file,'Page not found.',404)
                return self.send(200,(ROOT/'static'/file[0]).read_bytes(),file[1])
            data={}
            if method!='GET':
                origin=self.headers.get('Origin')
                need(not origin or urlparse(origin).netloc==self.headers.get('Host'),'Request origin is not allowed.',403)
                need(self.headers.get('X-Cadence-Request')=='1','Missing request header.',403)
                size=int(self.headers.get('Content-Length','0'));need(0<=size<=8_000_000,'File is too large. Maximum size is 5 MB.',413)
                try: data=json.loads(self.rfile.read(size) or b'{}')
                except json.JSONDecodeError: raise ValueError(400,'Invalid request.')
                need(isinstance(data,dict),'Invalid request.')
            with connect() as c:
                if path=='/api/login' and method=='POST':
                    client=self.client_address[0]
                    attempt=c.execute('SELECT * FROM login_attempts WHERE client=?',(client,)).fetchone()
                    need(not attempt or attempt['until']<now() or attempt['attempts']<10,'Too many attempts. Try again in 15 minutes.',429)
                    user=c.execute('SELECT * FROM users WHERE email=?',(text(data.get('email')).lower(),)).fetchone()
                    if not user or not valid_password(text(data.get('password')),user['password']):
                        count=attempt['attempts']+1 if attempt and attempt['until']>now() else 1
                        c.execute('INSERT OR REPLACE INTO login_attempts VALUES(?,?,?)',(client,count,(dt.datetime.now(dt.timezone.utc)+dt.timedelta(minutes=15)).isoformat(timespec='seconds')));c.commit()
                        raise ValueError(401,'Email or password is incorrect.')
                    c.execute('DELETE FROM login_attempts WHERE client=?',(client,))
                    token=secrets.token_urlsafe(32)
                    c.execute('INSERT INTO sessions VALUES(?,?,?)',(hashlib.sha256(token.encode()).hexdigest(),user['id'],(dt.datetime.now(dt.timezone.utc)+dt.timedelta(hours=12)).isoformat(timespec='seconds')))
                    secure='; Secure' if os.environ.get('CADENCE_SECURE_COOKIE')=='1' else ''
                    return self.send(200,public_user(user),headers={'Set-Cookie':f'cadence={token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200{secure}'})
                jar=cookies.SimpleCookie();jar.load(self.headers.get('Cookie',''))
                token=jar['cadence'].value if 'cadence' in jar else ''
                token_hash=hashlib.sha256(token.encode()).hexdigest()
                actor=c.execute('SELECT u.* FROM users u JOIN sessions s ON u.id=s.user_id WHERE s.token=? AND s.expires>?',(token_hash,now())).fetchone()
                need(actor,'Please sign in to continue.',401)
                if path=='/api/logout' and method=='POST':
                    c.execute('DELETE FROM sessions WHERE token=?',(token_hash,));return self.send(200,{},headers={'Set-Cookie':'cadence=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'})
                users=c.execute('SELECT * FROM users ORDER BY name').fetchall()
                if path=='/api/state' and method=='GET':
                    tasks=[task_dict(c,t) for t in c.execute('SELECT * FROM tasks ORDER BY updated DESC') if can_task(c,actor,t)]
                    allowed=[u['id'] for u in users if can_user(actor,u)]
                    shifts=[shift_dict(s) for s in c.execute('SELECT * FROM shifts ORDER BY day DESC') if s['user_id'] in allowed]
                    ids={t['id'] for t in tasks}; sids={s['id'] for s in shifts}
                    return self.send(200,{'me':public_user(actor),'people':[{k:u[k] for k in ('id','name','role','team')} for u in users],'users':[public_user(u) for u in users if can_user(actor,u)],'tasks':tasks,'shifts':shifts,'activities':ACTIVITIES,'statuses':STATUSES,'priorities':PRIORITIES,'complexities':COMPLEXITIES,'qualities':QUALITIES,'teams':TEAMS,'roles':ROLES,'today':today(),'demo':os.environ.get('CADENCE_DEMO')=='1','comments':[dict(r) for r in c.execute('SELECT * FROM comments') if r['task_id'] in ids],'events':[dict(r) for r in c.execute('SELECT * FROM events ORDER BY id DESC') if r['task_id'] in ids],'attachments':[dict(r) for r in c.execute('SELECT id,kind,object_id,slot,name,user_id FROM attachments') if (r['kind']=='task' and r['object_id'] in ids) or (r['kind']=='shift' and r['object_id'] in sids)]})
                if path=='/api/tasks' and method=='POST':
                    uid=int(data.get('assignee',actor['id'])); target=next((u for u in users if u['id']==uid),None)
                    need(target and can_user(actor,target),'You cannot assign work to this employee.',403)
                    title_=text(data.get('title'),200);need(title_,'Task title is required.')
                    start=date(data.get('start') or today());deadline=date(data.get('deadline'),True);need(not deadline or deadline>=start,'Deadline must be on or after the start date.')
                    priority=data.get('priority','Normal');complexity=data.get('complexity','Medium');need(priority in PRIORITIES and complexity in COMPLEXITIES,'Select valid task properties.')
                    ref=text(data.get('reference'));self.valid_url(ref)
                    cur=c.execute('INSERT INTO tasks(title,description,assignee,status,priority,complexity,start,deadline,hours,quality,review_required,checklist,reference,updated,completed,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',(title_,text(data.get('description')),uid,'To Do',priority,complexity,start,deadline,0,'',int(bool(data.get('review_required'))),json.dumps([{'text':text(x,200),'done':False} for x in data.get('checklist',[]) if text(x)]),ref,now(),'',actor['id']))
                    work_team=data.get('work_team') or target['team'];need(work_team in TEAMS,'Select a valid work team.')
                    c.execute('UPDATE tasks SET work_team=? WHERE id=?',(work_team,cur.lastrowid))
                    return self.send(201,{'id':cur.lastrowid})
                m=re.fullmatch(r'/api/tasks/(\d+)',path)
                if m and method=='PATCH':
                    tid=int(m[1]);task=c.execute('SELECT * FROM tasks WHERE id=?',(tid,)).fetchone();need(task,'Task not found.',404);need(can_task(c,actor,task),'Access denied.',403)
                    changes={}
                    for key,choices in [('status',STATUSES),('priority',PRIORITIES),('complexity',COMPLEXITIES),('quality',['']+QUALITIES)]:
                        if key in data:
                            need(data[key] in choices,'Select a valid '+key+'.');changes[key]=data[key]
                    manager=actor['role']!='Analyst'
                    if 'quality' in changes: need(manager,'Only a manager can evaluate quality.',403)
                    if changes.get('status')=='Done' and task['review_required']: need(manager,'Submit this task for manager review.',403)
                    if 'hours' in data:
                        value=float(data['hours']);need(0<=value<=100000,'Hours must be a positive finite number.');changes['hours']=value
                    for key in ['title','description','reference']:
                        if key in data: changes[key]=text(data[key],200 if key=='title' else 10000)
                    if 'title' in changes: need(changes['title'],'Task title is required.')
                    if 'reference' in changes: self.valid_url(changes['reference'])
                    if 'checklist' in data:
                        need(isinstance(data['checklist'],list) and len(data['checklist'])<=100,'Maximum 100 checklist items.')
                        changes['checklist']=json.dumps([{'text':text(x.get('text'),200),'done':bool(x.get('done'))} for x in data['checklist'] if text(x.get('text'))])
                    if 'status' in changes: changes['completed']=today() if changes['status']=='Done' else ''
                    changes['updated']=now()
                    c.execute('UPDATE tasks SET '+','.join(k+'=?' for k in changes)+' WHERE id=?',(*changes.values(),tid))
                    c.execute('INSERT INTO events(task_id,user_id,body,created) VALUES(?,?,?,?)',(tid,actor['id'],', '.join(k.replace('_',' ').capitalize()+': '+str(v) for k,v in changes.items() if k not in ['updated','completed','checklist']) or 'Updated checklist',now()))
                    return self.send(200,{'ok':True})
                if path=='/api/comments' and method=='POST':
                    task=c.execute('SELECT * FROM tasks WHERE id=?',(data.get('task_id'),)).fetchone();need(task and can_task(c,actor,task),'Task not found.',404)
                    body=text(data.get('body'));need(body,'Write a comment first.')
                    c.execute('INSERT INTO comments(task_id,user_id,body,created,edited) VALUES(?,?,?,?,?)',(task['id'],actor['id'],body,now(),''));return self.send(201,{'ok':True})
                m=re.fullmatch(r'/api/comments/(\d+)',path)
                if m and method=='PATCH':
                    comment=c.execute('SELECT * FROM comments WHERE id=?',(m[1],)).fetchone();need(comment and comment['user_id']==actor['id'],'You can only edit your own comments.',403)
                    body=text(data.get('body'));need(body,'Comment cannot be empty.')
                    c.execute('UPDATE comments SET body=?,edited=? WHERE id=?',(body,now(),m[1]));return self.send(200,{'ok':True})
                if path=='/api/shifts' and method=='POST':
                    need(actor['team'].startswith('SOC'),'Shift logs are available to SOC employees.',403)
                    day=date(data.get('day') or today());need(day==today(),'Only today’s shift can be created.')
                    c.execute('INSERT OR IGNORE INTO shifts(user_id,day,status,activities,iocs,shared,reference,tickets,updated) VALUES(?,?,?,?,?,?,?,?,?)',(actor['id'],day,'Active',json.dumps([{'done':False,'note':'','issue':None} for _ in ACTIVITIES]),0,0,'','[]',now()))
                    return self.send(201,{'id':c.execute('SELECT id FROM shifts WHERE user_id=? AND day=?',(actor['id'],day)).fetchone()[0]})
                m=re.fullmatch(r'/api/shifts/(\d+)',path)
                if m and method=='PATCH':
                    shift=c.execute('SELECT * FROM shifts WHERE id=?',(m[1],)).fetchone();need(shift and shift['user_id']==actor['id'],'You can only edit your own shift.',403);need(shift['status']!='Completed','This shift is completed and read-only.',409)
                    acts=data.get('activities',json.loads(shift['activities']));need(isinstance(acts,list) and len(acts)==8,'All eight activities are required.')
                    clean=[]
                    for a in acts:
                        issue=a.get('issue');
                        if issue:
                            need(text(issue.get('summary')),'Issue summary is required.');self.valid_url(issue.get('reference',''))
                            issue={'summary':text(issue.get('summary'),200),'description':text(issue.get('description')),'reference':text(issue.get('reference'))}
                        activity_ref=text(a.get('reference'));self.valid_url(activity_ref)
                        clean.append({'done':bool(a.get('done')),'note':text(a.get('note')),'issue':issue,'reference':activity_ref})
                    iocs=data.get('iocs',shift['iocs']);need(isinstance(iocs,int) and 0<=iocs<=10000000,'IOC count must be a non-negative whole number.')
                    tickets=data.get('tickets',json.loads(shift['tickets']));need(isinstance(tickets,list) and len(tickets)<=500,'Maximum 500 tickets per shift.')
                    numbers=[];clean_tickets=[]
                    for t in tickets:
                        number=text(t.get('number'),100);need(number,'Every ticket needs a ticket number.');need(number.lower() not in numbers,'Ticket numbers must be unique in this shift.');numbers.append(number.lower());self.valid_url(t.get('link',''));clean_tickets.append({k:text(t.get(k),100 if k=='number' else 2000) for k in ['number','related','description','link']})
                    status=data.get('status',shift['status']);need(status in ['Active','Completed'],'Invalid shift status.')
                    need(status!='Completed' or all(a['done'] for a in clean),'Complete all eight activities before completing your shift.')
                    ref=text(data.get('reference',shift['reference']));self.valid_url(ref)
                    c.execute('UPDATE shifts SET status=?,activities=?,iocs=?,shared=?,reference=?,tickets=?,updated=? WHERE id=?',(status,json.dumps(clean),iocs,int(bool(data.get('shared',shift['shared']))),ref,json.dumps(clean_tickets),now(),shift['id']));return self.send(200,{'ok':True})
                if path=='/api/users' and method=='POST':
                    need(actor['role']=='Security Manager','Only the Security Manager can manage users.',403)
                    name=text(data.get('name'),100);email=text(data.get('email'),200).lower();pw=text(data.get('password'));need(name and re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',email),'Name and valid email are required.');need(len(pw)>=12,'Use a password with at least 12 characters.')
                    need(data.get('role') in ROLES and data.get('team') in TEAMS,'Select a valid role and team.')
                    c.execute('INSERT INTO users(name,email,password,role,team) VALUES(?,?,?,?,?)',(name,email,password_hash(pw),data['role'],data['team']));return self.send(201,{'ok':True})
                m=re.fullmatch(r'/api/users/(\d+)',path)
                if m and method=='PATCH':
                    need(actor['role']=='Security Manager','Only the Security Manager can manage users.',403)
                    target=c.execute('SELECT * FROM users WHERE id=?',(m[1],)).fetchone();need(target,'Employee not found.',404)
                    role=data.get('role',target['role']);team=data.get('team',target['team']);need(role in ROLES and team in TEAMS,'Select a valid role and team.')
                    need(not (target['id']==actor['id'] and role!='Security Manager'),'You cannot remove your own administrator role.')
                    c.execute('UPDATE users SET role=?,team=? WHERE id=?',(role,team,target['id']));c.execute('DELETE FROM sessions WHERE user_id=? AND token!=?',(target['id'],token_hash));return self.send(200,{'ok':True})
                if path=='/api/attachments' and method=='POST':
                    kind=data.get('kind');need(kind in ['task','shift'],'Invalid attachment destination.')
                    row=c.execute('SELECT * FROM '+('tasks' if kind=='task' else 'shifts')+' WHERE id=?',(data.get('object_id'),)).fetchone();need(row,'Item not found.',404)
                    need(can_task(c,actor,row) if kind=='task' else row['user_id']==actor['id'] and row['status']=='Active','Access denied.',403)
                    try: binary=base64.b64decode(data.get('content',''),validate=True)
                    except Exception: raise ValueError(400,'Invalid file content.')
                    need(0<len(binary)<=5*1024*1024,'Choose a file up to 5 MB.')
                    c.execute('INSERT INTO attachments(kind,object_id,slot,name,content,user_id) VALUES(?,?,?,?,?,?)',(kind,row['id'],text(data.get('slot'),30),text(data.get('name'),200),binary,actor['id']));return self.send(201,{'ok':True})
                m=re.fullmatch(r'/api/attachments/(\d+)',path)
                if m and method=='GET':
                    a=c.execute('SELECT * FROM attachments WHERE id=?',(m[1],)).fetchone();need(a,'Attachment not found.',404)
                    row=c.execute('SELECT * FROM '+('tasks' if a['kind']=='task' else 'shifts')+' WHERE id=?',(a['object_id'],)).fetchone()
                    need(can_task(c,actor,row) if a['kind']=='task' else can_user(actor,next(u for u in users if u['id']==row['user_id'])),'Access denied.',403)
                    filename=re.sub('[^a-zA-Z0-9._ -]','_',a['name'])
                    return self.send(200,a['content'],'application/octet-stream',{'Content-Disposition':f'attachment; filename="{filename}"'})
                if path=='/api/export' and method=='GET':
                    start=date(q.get('start') or today()[:8]+'01');end=date(q.get('end') or today());need(start<=end,'End date must follow start date.')
                    selected={u['id']:u for u in users if can_user(actor,u) and (not q.get('employee') or str(u['id'])==q['employee']) and (not q.get('team') or u['team']==q['team'])}
                    task_rows=[['Task Title','Work Description','Quality','Start Time','End Time','Hours','Executor','Complexity','Status','Deadline','Primary Team','Work Team']]
                    for t in c.execute('SELECT * FROM tasks ORDER BY id'):
                        if t['assignee'] not in selected or not(start <= (t['completed'] or t['start']) <= end): continue
                        if any(q.get(k) and q[k]!=t[k] for k in ['status','complexity','quality']): continue
                        task_rows.append([t[k] for k in ['title','description','quality','start','completed','hours']]+[selected[t['assignee']]['name'],t['complexity'],t['status'],t['deadline'],selected[t['assignee']]['team'],t['work_team'] or selected[t['assignee']]['team']])
                    shift_rows=[['Analyst','Date','Status','Activities Completed','MISP IOC Count','Tickets Created','Daily Traffic Reports','Issues Reported']];ticket_rows=[['Analyst','Date','Ticket Number','Related Reference','Description','External Link']]
                    for s in c.execute('SELECT * FROM shifts ORDER BY day'):
                        if s['user_id'] not in selected or not start<=s['day']<=end: continue
                        a=json.loads(s['activities']);ts=json.loads(s['tickets']);name=selected[s['user_id']]['name']
                        shift_rows.append([name,s['day'],s['status'],sum(x['done'] for x in a),s['iocs'],len(ts),int(a[3]['done']),sum(bool(x['issue']) for x in a)])
                        ticket_rows.extend([[name,s['day'],t['number'],t['related'],t['description'],t['link']] for t in ts if not q.get('q') or q['q'].lower() in ' '.join([name,t['number'],t['related'],t['description']]).lower()])
                    sheets=[('Task Performance',task_rows),('Routine Activity',shift_rows),('Tickets',ticket_rows)]
                    kind=q.get('type','Employee Monthly Report')
                    if kind=='Task Report': sheets=sheets[:1]
                    elif kind=='SOC Shift Activity Report': sheets=sheets[1:2]
                    elif kind=='Ticket Report': sheets=sheets[2:]
                    return self.send(200,xlsx(sheets),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',{'Content-Disposition':f'attachment; filename="cadence-report-{start}-{end}.xlsx"'})
                raise ValueError(404,'This action is unavailable.')
        except ValueError as e:
            status,message=e.args if len(e.args)==2 and isinstance(e.args[0],int) else (400,'Check the values and try again.')
            self.send(status,{'error':message})
        except sqlite3.IntegrityError: self.send(409,{'error':'This record already exists. Check the email or date.'})
        except Exception:
            import traceback;traceback.print_exc()
            self.send(500,{'error':'We could not save your changes. Please retry.'})
    def valid_url(self,url): need(not url or (isinstance(url,str) and urlparse(url).scheme in ['http','https'] and urlparse(url).netloc),'External links must start with https:// or http://.')

if __name__=='__main__':
    init_db()
    host=os.environ.get('CADENCE_HOST','127.0.0.1');port=int(os.environ.get('PORT','8000'))
    server=ThreadingHTTPServer((host,port),Handler)
    print(f'Cadence is running at http://{host}:{server.server_port}',flush=True)
    server.serve_forever()
