import base64
import io
import json
from pathlib import Path
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
import uuid
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import rsa,padding

ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
import chatgpt
import core
import server

def b64(raw):return base64.urlsafe_b64encode(raw).decode().rstrip('=')
class ChatGPTTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.key=rsa.generate_private_key(public_exponent=65537,key_size=2048);n=cls.key.public_key().public_numbers()
        cls.keys={'keys':[{'kid':'test','kty':'RSA','use':'sig','alg':'RS256','n':b64(n.n.to_bytes(256,'big')),'e':b64(n.e.to_bytes(3,'big'))}]}
    def setUp(self):
        directory=ROOT/'.cache/tests';directory.mkdir(parents=True,exist_ok=True)
        self.temp=tempfile.TemporaryDirectory(dir=directory);self.store=server.Store(self.temp.name,'fixture-password-2026');self.connection=chatgpt.Connection(self.store)
    def tearDown(self):self.store.db.close();self.temp.cleanup()
    def token(self,aud,**claims):
        body={'iss':chatgpt.ISSUER,'sub':'account','aud':aud,'iat':int(time.time()),'exp':int(time.time())+3600,**claims};head=b64(json.dumps({'kid':'test','alg':'RS256'}).encode());body=b64(json.dumps(body).encode());signature=self.key.sign((head+'.'+body).encode(),padding.PKCS1v15(),hashes.SHA256());return head+'.'+body+'.'+b64(signature)
    def record(self):return {'format':'pokedex-chatgpt-v1','client_id':'oaiapp_fixture','nonce':'n'*43,'id_token':self.token('oaiapp_fixture',nonce='n'*43,email='test@example.invalid'),'access_token':self.token(chatgpt.RESOURCE,client_id='oaiapp_fixture',scope=chatgpt.DIRECT),'refresh_token':'private-refresh-fixture','token_type':'Bearer','ext_agent_host_id':'urn:uuid:copied-laptop'}
    def connect(self):
        with patch.object(chatgpt,'request',return_value=self.keys):self.connection.import_credentials(self.record())
    def test_verified_import_keeps_umbrel_host_and_never_exposes_tokens(self):
        host=self.store.get('chatgpt_host_id');self.connect();status=self.store.settings()
        self.assertEqual(host,self.store.get('chatgpt_host_id'));self.assertNotIn('private-refresh',json.dumps(status));self.assertNotIn('access_token',json.dumps(status));self.assertTrue(status['chatgpt']['connected'])
    def test_invalid_signature_nonce_audience_expiry_and_identity_rejected(self):
        token=self.token('oaiapp_fixture',nonce='original')
        for audience,nonce,subject in [('wrong','original',None),('oaiapp_fixture','wrong',None),('oaiapp_fixture','original','other')]:
            with self.assertRaises(core.Problem):chatgpt.verify_token(token,audience,self.keys,nonce,subject)
        for value in [token[:-10]+'fake',self.token('oaiapp_fixture',exp=0),self.token('oaiapp_fixture',iss='https://evil.invalid'),self.token(['oaiapp_fixture','evil'])]:
            with self.assertRaises(core.Problem):chatgpt.verify_token(value,'oaiapp_fixture',self.keys)
    def test_missing_direct_permission_does_not_replace_valid_account(self):
        self.connect();old=self.store.get('chatgpt_connection');record=self.record();record['access_token']=self.token(chatgpt.RESOURCE,client_id='oaiapp_fixture',scope='openid')
        with patch.object(chatgpt,'request',return_value=self.keys),self.assertRaises(core.Problem):self.connection.import_credentials(record)
        self.assertEqual(self.store.get('chatgpt_connection'),old)
    def test_refresh_is_serial_and_replaces_rotating_tokens_atomically(self):
        self.connect();old=self.store.get('chatgpt_connection');old['expires_at']=0;self.store.set('chatgpt_connection',old)
        fresh=self.token(chatgpt.RESOURCE,client_id='oaiapp_fixture',scope=chatgpt.DIRECT)
        def network(url,*args,**kwargs):return self.keys if url==chatgpt.JWKS else {'scope':chatgpt.DIRECT,'token_type':'Bearer','access_token':fresh,'refresh_token':'rotated-refresh-fixture'}
        results=[]
        with patch.object(chatgpt,'request',side_effect=network) as call:
            threads=[threading.Thread(target=lambda:results.append(self.connection.access())) for _ in range(6)]
            for t in threads:t.start()
            for t in threads:t.join()
        self.assertEqual(len(results),6);self.assertEqual(sum(c.args[0]==chatgpt.TOKEN for c in call.call_args_list),1);self.assertEqual(self.store.get('chatgpt_connection')['refresh_token'],'rotated-refresh-fixture')
        self.assertEqual(call.call_args_list[0].args[1]['resource'],chatgpt.RESOURCE)
    def test_refresh_wrong_identity_preserves_connection(self):
        self.connect();old=self.store.get('chatgpt_connection');old['expires_at']=0;self.store.set('chatgpt_connection',old)
        response={'scope':chatgpt.DIRECT,'token_type':'Bearer','access_token':self.token(chatgpt.RESOURCE,sub='other',client_id='oaiapp_fixture',scope=chatgpt.DIRECT),'refresh_token':'rotated-refresh-fixture'}
        with patch.object(chatgpt,'request',side_effect=lambda url,*a,**k:self.keys if url==chatgpt.JWKS else response),self.assertRaises(core.Problem):self.connection.access()
        self.assertEqual(self.store.get('chatgpt_connection'),old)
    def test_model_catalog_preserves_account_order_and_excludes_hidden(self):
        self.connect()
        with patch.object(chatgpt,'request',return_value={'models':[{'slug':'vision-model','display_name':'Vision','visibility':'list'},{'slug':'hidden','visibility':'hide'},{'slug':'second','visibility':'list'}]}):models=self.connection.models()
        self.assertEqual([m['slug'] for m in models],['vision-model','second']);self.assertEqual(self.store.get('chatgpt_connection')['model'],'vision-model')
    def test_image_inference_uses_plan_endpoint_without_paid_fallback(self):
        self.connect();record=self.store.get('chatgpt_connection');record['model']='vision-model';self.store.set('chatgpt_connection',record)
        text=json.dumps({'candidates':[{'species_id':5,'pokemon_slug':'charmeleon','certainty':'high','form_certainty':'high','transformation':'none','tera_type':''}],'media':'imagen'})
        with patch.object(chatgpt,'request',return_value=text) as call:result=self.connection.recognize('jpeg-fixture')
        args=call.call_args;self.assertEqual(args.args[0],chatgpt.RESOURCE+'/responses');payload=args.args[1];self.assertTrue(payload['stream']);self.assertFalse(payload['store']);self.assertNotIn('temperature',payload);self.assertNotIn('max_output_tokens',payload);self.assertEqual(payload['input'][0]['content'][1]['image_url'],'data:image/jpeg;base64,jpeg-fixture');self.assertEqual(result['candidates'][0]['id'],5);self.assertEqual(call.call_count,1)
    def stream(self,*events):return io.BytesIO(b''.join(b'data: '+json.dumps(e).encode()+b'\n\n' for e in events))
    def test_stream_requires_completed_and_does_not_accept_partial_output(self):
        delta={'type':'response.output_text.delta','delta':'partial'}
        self.assertEqual(chatgpt.read_stream(self.stream(delta,{'type':'response.completed'})),'partial')
        for last in [None,{'type':'response.incomplete'},{'type':'response.failed','response':{'error':{'code':'subscription_sharing_usage_limit_exceeded'}}}]:
            with self.assertRaises(core.Problem) as exc:chatgpt.read_stream(self.stream(delta,*([last] if last else [])))
            if last and last['type']=='response.failed':self.assertEqual(exc.exception.status,429)
    def test_chatgpt_failure_never_marks_pokedex_session_expired(self):
        for code,status in [('invalid_grant',401),('subscription_sharing_usage_unavailable',403),('subscription_sharing_usage_limit_exceeded',429)]:
            problem=chatgpt.error(502,code);self.assertEqual(problem.status,status);self.assertFalse(problem.auth)
    def test_background_job_returns_promptly_and_polling_does_not_repeat_inference(self):
        app=server.App(self.store);ready=threading.Event();release=threading.Event()
        def recognize(*args):ready.set();release.wait(3);return {'candidates':[],'media':'otro'}
        data={'id':str(uuid.uuid4()),'operation':'recognize','input':{'image':base64.b64encode(b'\xff\xd8\xff'+b'x'*100).decode()}};self.store.set('openrouter_key','fixture-key')
        with patch.object(core,'recognize',side_effect=recognize) as call:
            before=time.monotonic();started=app.start_job(data,'session');self.assertLess(time.monotonic()-before,.5);ready.wait(1)
            for _ in range(8):self.assertEqual(app.job(started['job'],'session')['state'],'working')
            self.assertEqual(app.start_job(data,'session'),started)
            with self.assertRaises(core.Problem):app.job(started['job'],'other-session')
            release.set()
            for _ in range(100):
                if app.job(started['job'],'session')['state']!='working':break
                time.sleep(.01)
            self.assertEqual(app.job(started['job'],'session')['state'],'done');self.assertEqual(call.call_count,1)
    def test_provider_error_remains_distinct_inside_background_job(self):
        app=server.App(self.store);self.store.set('openrouter_key','fixture-key')
        with patch.object(core,'recognize',side_effect=core.Problem(429,'Provider quota')):
            result=app.start_job({'operation':'recognize','input':{'image':base64.b64encode(b'\xff\xd8\xff'+b'x'*100).decode()}},'session')
            for _ in range(100):
                value=app.job(result['job'],'session')
                if value['state']!='working':break
                time.sleep(.01)
        self.assertEqual(value['status'],429);self.assertEqual(value['error'],'Provider quota');self.assertNotIn('session',value)

if __name__=='__main__':unittest.main()
