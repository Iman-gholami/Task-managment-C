"""Integration tests exercise HTTP, authorization, persistence and OOXML exports."""
import base64
import http.cookiejar
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

ROOT=Path(__file__).resolve().parents[1]
class API(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp=tempfile.TemporaryDirectory()
        os.environ['CADENCE_DB']=str(Path(cls.tmp.name)/'test.db')
        os.environ['CADENCE_DEMO']='1'
        spec=importlib.util.spec_from_file_location('cadence',ROOT/'server.py')
        cls.app=importlib.util.module_from_spec(spec);spec.loader.exec_module(cls.app);cls.app.init_db()
        cls.server=cls.app.ThreadingHTTPServer(('127.0.0.1',0),cls.app.Handler)
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True);cls.thread.start()
        cls.url='http://127.0.0.1:'+str(cls.server.server_port)
        cls.clients={}
        for role,email in [('admin','iman'),('manager','sara'),('analyst','arman'),('design','darya')]:
            cls.clients[role]=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
            code,_=cls.call('login','POST',{'email':email+'@cadence.local','password':'Cadence-demo-2026!'},role)
            assert code==200
    @classmethod
    def tearDownClass(cls): cls.server.shutdown();cls.server.server_close();cls.tmp.cleanup()
    @classmethod
    def call(cls,path,method='GET',data=None,role='analyst',headers=None,raw=False):
        req=urllib.request.Request(cls.url+'/api/'+path,method=method,data=json.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json','X-Cadence-Request':'1',**(headers or {})})
        try:r=cls.clients[role].open(req)
        except urllib.error.HTTPError as e:r=e
        body=r.read()
        return r.code,body if raw else json.loads(body)
    def new_task(self,role='analyst',**values):
        code,data=self.call('tasks','POST',{'title':'Integration test task','review_required':True,**values},role)
        self.assertEqual(code,201,data);return data['id']
    def test_scoped_state(self):
        _,a=self.call('state');self.assertTrue(all(t['assignee']==a['me']['id'] for t in a['tasks']))
        _,m=self.call('state',role='manager');allowed={u['id'] for u in m['users']}
        self.assertTrue(all(t['assignee'] in allowed for t in m['tasks']))
        self.assertFalse(any(u['team']=='Design & Automation' for u in m['users']))
    def test_task_review_and_quality(self):
        tid=self.new_task()
        self.assertEqual(self.call(f'tasks/{tid}','PATCH',{'status':'Done'})[0],403)
        self.assertEqual(self.call(f'tasks/{tid}','PATCH',{'quality':'Excellent'})[0],403)
        self.assertEqual(self.call(f'tasks/{tid}','PATCH',{'status':'Review','hours':3.5})[0],200)
        self.assertEqual(self.call(f'tasks/{tid}','PATCH',{'status':'Done','quality':'Excellent'},'manager')[0],200)
        _,s=self.call('state');t=next(t for t in s['tasks'] if t['id']==tid)
        self.assertEqual(t['completed'],s['today']);self.assertEqual(t['hours'],3.5)
    def test_cross_user_access_and_assignment(self):
        tid=self.new_task('design')
        self.assertEqual(self.call(f'tasks/{tid}','PATCH',{'priority':'Critical'})[0],403)
        self.assertEqual(self.call('tasks','POST',{'title':'Unauthorized','assignee':5})[0],403)
        self.assertEqual(self.call('tasks','POST',{'title':'Unauthorized','assignee':5},'manager')[0],403)
    def test_shift_completion_ticket_validation_and_immutability(self):
        code,s=self.call('shifts','POST',{});self.assertEqual(code,201);sid=s['id']
        self.assertEqual(self.call('shifts','POST',{})[1]['id'],sid)
        self.assertEqual(self.call(f'shifts/{sid}','PATCH',{'status':'Completed'})[0],400)
        self.assertEqual(self.call(f'shifts/{sid}','PATCH',{'tickets':[{'number':''}]})[0],400)
        self.assertEqual(self.call(f'shifts/{sid}','PATCH',{'tickets':[{'number':'SD-1'},{'number':'sd-1'}]})[0],400)
        self.assertEqual(self.call(f'shifts/{sid}','PATCH',{'iocs':-1})[0],400)
        self.assertEqual(self.call(f'shifts/{sid}','PATCH',{'iocs':2.5})[0],400)
        acts=[{'done':True,'note':'Completed','issue':None} for _ in range(8)]
        code,r=self.call(f'shifts/{sid}','PATCH',{'activities':acts,'iocs':6,'shared':True,'tickets':[{'number':'SD-1','description':'A traceable ticket'}],'status':'Completed'});self.assertEqual(code,200,r)
        self.assertEqual(self.call(f'shifts/{sid}','PATCH',{'iocs':9})[0],409)
        _,state=self.call('state');s=next(s for s in state['shifts'] if s['id']==sid)
        self.assertEqual(len(s['tickets']),1);self.assertEqual(s['iocs'],6)
    def test_non_soc_cannot_create_shift(self):self.assertEqual(self.call('shifts','POST',{},'design')[0],403)
    def test_comment_authorization(self):
        tid=self.new_task();self.assertEqual(self.call('comments','POST',{'task_id':tid,'body':'@Sara please review.'})[0],201)
        _,state=self.call('state');c=next(c for c in state['comments'] if c['task_id']==tid)
        self.assertEqual(self.call('comments/'+str(c['id']),'PATCH',{'body':'Changed'},'manager')[0],403)
        self.assertEqual(self.call('comments/'+str(c['id']),'PATCH',{'body':'Updated'})[0],200)
    def test_attachment_round_trip_and_access(self):
        tid=self.new_task();body=b'attachment test';data={'kind':'task','object_id':tid,'slot':'','name':'report.docx','content':base64.b64encode(body).decode()}
        self.assertEqual(self.call('attachments','POST',data)[0],201)
        _,state=self.call('state');a=next(a for a in state['attachments'] if a['object_id']==tid)
        self.assertEqual(self.call('attachments/'+str(a['id']),raw=True)[1],body)
        self.assertEqual(self.call('attachments/'+str(a['id']),role='design')[0],403)
    def test_report_is_real_xlsx_scoped_and_inert(self):
        self.new_task(title='=HYPERLINK("https://example.com")')
        today=self.app.today();code,body=self.call(f'export?start={today}&end={today}',raw=True)
        self.assertEqual(code,200)
        with zipfile.ZipFile(io.BytesIO(body)) as z:
            self.assertEqual(len([n for n in z.namelist() if n.startswith('xl/worksheets/')]),3)
            for name in z.namelist():ET.fromstring(z.read(name))
            tasks=z.read('xl/worksheets/sheet1.xml').decode()
            self.assertIn('=HYPERLINK',tasks);self.assertNotIn('<f>',tasks);self.assertNotIn('Darya',tasks)
        self.assertEqual(self.call('export?start=2026-10-01&end=2026-01-01')[0],400)
    def test_input_and_origin_validation(self):
        self.assertEqual(self.call('tasks','POST',{'title':'Bad','reference':'javascript:alert(1)'})[0],400)
        self.assertEqual(self.call('tasks','POST',{'title':'Bad','start':'2026-10-01','deadline':'2026-09-01'})[0],400)
        self.assertEqual(self.call('tasks','POST',{'title':'Bad'},headers={'Origin':'https://evil.example'})[0],403)
        self.assertEqual(self.call('tasks','POST',{'title':'Bad'},headers={'X-Cadence-Request':''})[0],403)
    def test_admin_management_and_scope(self):
        d={'name':'Test Employee','email':'test@cadence.local','password':'Strong-demo-test!','role':'Analyst','team':'Design & Automation'}
        self.assertEqual(self.call('users','POST',d)[0],403)
        self.assertEqual(self.call('users','POST',d,'admin')[0],201)
        self.assertEqual(self.call('users','POST',d,'admin')[0],409)
        self.assertEqual(self.call('users/1','PATCH',{'role':'Analyst'},'admin')[0],400)
    def test_reinitialization_preserves_data(self):
        tid=self.new_task();self.app.init_db();_,s=self.call('state');self.assertTrue(any(t['id']==tid for t in s['tasks']))
    def test_unauthenticated_access(self):
        try:urllib.request.urlopen(self.url+'/api/state')
        except urllib.error.HTTPError as e:self.assertEqual(e.code,401)
        else:self.fail('Anonymous data access must fail')
if __name__=='__main__':unittest.main(verbosity=2)
