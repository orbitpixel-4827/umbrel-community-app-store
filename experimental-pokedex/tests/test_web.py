import base64
import copy
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
import urllib.error
import urllib.request
import uuid
import wave

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
import core
import server

FIXTURES=ROOT/'tests/fixtures'
TEST_ROOT=ROOT/'.cache/tests'
TEST_ROOT.mkdir(parents=True,exist_ok=True)

class WebTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(dir=TEST_ROOT);self.store=server.Store(self.temp.name,'fixture-password-2026');self.data=core.Data(self.store)
        self.network=patch.object(core,'fetch_json',side_effect=self.fixture);self.network.start()
    def tearDown(self):
        self.network.stop();self.store.db.close();self.temp.cleanup()
    def fixture(self,url,payload=None,headers=None):
        slug=url.rstrip('/').split('/')[-1];kind=url.rstrip('/').split('/')[-2]
        mapping={'pokemon/5':'charmeleon.json','pokemon/charmeleon':'charmeleon.json','pokemon/charizard-mega-x':'pokemon-charizard-mega-x.json','pokemon/charizard-gmax':'pokemon-charizard-gmax.json','pokemon/arceus':'pokemon-arceus.json','pokemon-species/charmeleon':'species-5.json','pokemon-species/charizard':'species-6.json','pokemon-species/arceus':'species-493.json','pokemon-form/arceus-fire':'form-arceus-fire.json','evolution-chain/2':'chain-2.json'}
        if kind+'/'+slug not in mapping:raise core.Problem(404,'fixture missing')
        return json.loads((FIXTURES/mapping[kind+'/'+slug]).read_text())
    def dex(self):return self.data.dex('charmeleon',5)
    def row(self,dex=None):
        dex=dex or self.dex();return dict(id=str(uuid.uuid4()),species=dex['id'],at=int(time.time()*1000),media='imagen',source='manual',dex=dex)
    def backup(self,rows):return {'format':'pokedex-roja','version':1,'encounters':rows}
    def test_species_and_learnset(self):
        d=self.dex();self.assertEqual(d['id'],5);self.assertGreater(len(d['learnset']),100);self.assertEqual(len(d['evolutions']),3);self.assertEqual(d['evolutions'][1]['parent'],4);self.assertEqual(d['evolutions'][1]['conditions'][0]['min_level'],16);self.assertEqual(d['genderRate'],1)
    def test_mega_and_gmax_use_form_source(self):
        mega=self.data.dex('charizard-mega-x',6);gmax=self.data.dex('charizard-gmax',6)
        self.assertEqual(mega['types'],['fire','dragon']);self.assertTrue(mega['artwork'].endswith('10034.png'));self.assertTrue(gmax['artwork'].endswith('10196.png'));self.assertEqual(mega['id'],gmax['id']);self.assertIsNone(self.store.cached('dex:6'))
    def test_form_endpoint_and_cache_independence(self):
        fire=self.data.dex('arceus-fire',493);normal=self.data.dex('arceus',493)
        self.assertEqual(fire['types'],['fire']);self.assertEqual(normal['types'],['normal']);self.assertTrue(fire['artwork'].endswith('493-fire.png'));self.assertEqual(fire['formLabel'],'Tipo Fuego');self.assertEqual(len(fire['cosmeticForms']),19);self.assertEqual(fire['pastTypes'],[])
    def test_species_mismatch_not_hidden_by_cache(self):
        self.dex()
        with self.assertRaises(core.Problem) as error:self.data.dex('charmeleon',6)
        self.assertEqual(error.exception.status,422)
    def test_safe_lookup(self):
        for bad in ('../../data','https://evil.test','a?key=secret','<script>'):
            with self.assertRaises(core.Problem):core.lookup(bad)
        self.assertEqual(core.lookup('#0005'),'5');self.assertEqual(core.lookup('Nidoran♀'),'nidoran-f');self.assertEqual(core.lookup('Mr. Mime'),'mr-mime')
    def test_distinct_tera_type_and_clone(self):
        d=self.dex();fire=core.apply_form(d,'terastal','fire');water=core.apply_form(d,'terastal','water')
        self.assertNotIn('battleForm',d);self.assertEqual(fire['types'],d['types']);self.assertEqual(fire['artwork'],d['artwork']);self.assertNotEqual(fire['teraType'],water['teraType']);self.assertIn('Astral',core.form_label(core.apply_form(d,'terastal','stellar')))
    def test_illegal_transformation(self):
        for args in ((self.dex(),'mega',''),(self.dex(),'terastal','crystal'),(self.data.dex('charizard-mega-x',6),'terastal','fire')):
            with self.assertRaises(core.Problem):core.apply_form(*args)
    def test_candidate_form_certainty(self):
        body={'candidates':[{'species_id':6,'pokemon_slug':'charizard-gmax','certainty':'high'}]}
        c=core.candidates(body)['candidates'][0];self.assertEqual(c['transformation'],'gigantamax');self.assertEqual(c['certainty'],'medium')
    def test_same_species_multiple_candidates_retained(self):
        body={'candidates':[dict(species_id=6,pokemon_slug=s,certainty='medium') for s in ('charizard-mega-x','charizard-mega-y')]}
        self.assertEqual(len(core.candidates(body)['candidates']),2)
    def test_invalid_candidates_not_registered(self):
        self.assertEqual(core.candidates({'candidates':[{'species_id':6,'pokemon_slug':'../../key'}]})['candidates'],[])
        self.assertEqual(core.candidates({'candidates':[]})['candidates'],[])
    def test_tera_unknown_not_guessed(self):
        c={'species_id':5,'pokemon_slug':'charmeleon','certainty':'high','transformation':'terastal','tera_type':'water','form_certainty':'low'}
        value=core.candidates({'candidates':[c]})['candidates'][0];self.assertEqual(value['teraType'],'');self.assertEqual(value['certainty'],'medium')
    def test_persistence_and_idempotence(self):
        d=self.dex();identity=str(uuid.uuid4());self.store.record(d,'peluche','manual',identity);self.store.record(d,'figura','manual',identity)
        self.assertEqual(len(self.store.entries()),1);self.store.db.close();self.store=server.Store(self.temp.name,'different-password-ignored');self.assertEqual(len(self.store.entries()),1);self.assertEqual(self.store.entries()[0]['media'],'peluche')
    def test_import_compatible_android_and_no_duplication(self):
        row=self.row(core.apply_form(self.dex(),'terastal','water'));backup=self.backup([row]);self.assertEqual(self.store.import_backup(backup),1);self.assertEqual(self.store.import_backup(backup),0);self.assertEqual(self.store.entries()[0]['dex']['teraType'],'water');self.assertNotIn('battleForm',self.store.cached('dex:charmeleon'))
    def test_atomic_invalid_import(self):
        good=self.row();bad=self.row();bad['species']=6
        with self.assertRaises(core.Problem):self.store.import_backup(self.backup([good,bad]))
        self.assertEqual(self.store.entries(),[])
    def test_import_rejects_future_timestamp(self):
        row=self.row();row['at']=int(time.time()*1000)+2*86400000
        with self.assertRaises(core.Problem):self.store.import_backup(self.backup([row]))
    def test_settings_do_not_expose_keys(self):
        self.store.set('gemini_key','test-only-not-a-real-key');settings=self.store.settings();self.assertTrue(settings['hasGemini']);self.assertNotIn('test-only-not-a-real-key',json.dumps(settings));self.assertNotIn('gemini_key',settings)
    def test_quota_durable_after_restart(self):
        self.store.reserve('vision',20,20)
        with self.assertRaises(core.Problem):self.store.reserve('vision',20,20)
        self.store.db.close();self.store=server.Store(self.temp.name)
        with self.assertRaises(core.Problem):self.store.reserve('vision',20,20)
    def test_daily_limit(self):
        day=time.strftime('%Y-%m-%d',time.gmtime());self.store.db.execute('INSERT INTO quotas VALUES (?,?,?,?,?)',('voice',day,40,0,0))
        with self.assertRaises(core.Problem):self.store.reserve('voice',40,5)
    def scan(self):
        return server.App(self.store).post('/api/recognize',{'image':base64.b64encode(b'\xff\xd8\xff'+b'x'*100).decode()},'fixture-session')
    def test_old_shared_daily_limit_and_pause_do_not_block_new_scans(self):
        self.store.record(self.dex(),'imagen','manual',str(uuid.uuid4()))
        self.store.set('openrouter_key','fixture-key')
        day=time.strftime('%Y-%m-%d',time.gmtime())
        self.store.db.execute('INSERT INTO quotas VALUES (?,?,?,?,?)',('vision',day,20,time.time(),time.time()+86400))
        with patch.object(core,'recognize',return_value={'candidates':[],'media':'otro'}) as recognize:
            self.assertIn('ticket',self.scan());self.assertEqual(recognize.call_count,1)
        self.assertEqual(len(self.store.entries()),1)
    def test_recognition_does_not_add_daily_cap(self):
        self.store.set('openrouter_key','fixture-key')
        day=time.strftime('%Y-%m-%d',time.gmtime())
        self.store.db.execute('INSERT INTO quotas VALUES (?,?,?,?,?)',('vision:openrouter',day,1000,0,0))
        with patch.object(core,'recognize',return_value={'candidates':[],'media':'otro'}):self.scan()
        self.assertEqual(self.store.db.execute('SELECT count FROM quotas WHERE kind=?',('vision:openrouter',)).fetchone()[0],1001)
    def test_provider_failure_does_not_pause_other_provider(self):
        self.store.set('gemini_key','fixture-google');self.store.set('openrouter_key','fixture-openrouter')
        self.store.set('preferences',{'provider':'gemini'})
        with patch.object(core,'recognize',side_effect=core.Problem(429,'Gemini quota',retry_after=120)):
            with self.assertRaises(core.Problem):self.scan()
        with patch.object(core,'recognize',return_value={'candidates':[],'media':'otro'}) as recognize:
            with self.assertRaises(core.Problem) as error:self.scan()
            self.assertIn('Gemini',error.exception.message);self.assertEqual(recognize.call_count,0)
            self.store.set('preferences',{'provider':'openrouter'});self.scan();self.assertEqual(recognize.call_count,1)
        pause=self.store.db.execute('SELECT pause FROM quotas WHERE kind=?',('vision:gemini',)).fetchone()[0]
        self.assertGreater(pause-time.time(),119)
    def test_recognition_cooldown_persists_after_restart_without_daily_cap(self):
        self.store.reserve('vision:openrouter',None,20)
        self.store.db.close();self.store=server.Store(self.temp.name)
        with self.assertRaises(core.Problem):self.store.reserve('vision:openrouter',None,20)
    def test_openrouter_quota_query_returns_only_safe_counters_and_no_inference(self):
        self.store.set('openrouter_key','fixture-secret-key')
        raw={'data':{'label':'fixture-secret-key','limit_remaining':123,'free_model_daily_requests':{'used':11,'limit':50,'remaining':39,'private':'fixture-secret-key'}}}
        with patch.object(core,'fetch_json',return_value=raw) as fetcher:
            result=server.App(self.store).post('/api/check-recognition',{},'fixture-session')
        self.assertEqual(result['daily'],{'used':11,'limit':50,'remaining':39});self.assertNotIn('fixture-secret-key',json.dumps(result))
        self.assertEqual(fetcher.call_count,1);self.assertEqual(fetcher.call_args.args,('https://openrouter.ai/api/v1/key',))
        self.assertEqual(self.store.db.execute('SELECT count(*) FROM quotas').fetchone()[0],0)
    def test_openrouter_missing_or_invalid_counter_is_not_invented(self):
        for quota in (None,{}, {'used':0,'limit':50,'remaining':True}, {'used':0,'limit':50,'remaining':-1}):
            with patch.object(core,'fetch_json',return_value={'data':{'free_model_daily_requests':quota}}):
                self.assertIsNone(core.recognition_access('openrouter','fixture-key')['daily'])
    def test_google_recognition_access_does_not_claim_remaining_quota(self):
        with patch.object(core,'fetch_json',return_value={'name':core.VISION_MODEL}) as fetcher:
            result=core.recognition_access('gemini','fixture-key')
        self.assertIsNone(result['daily']);self.assertIn('AI Studio',result['message']);self.assertEqual(fetcher.call_count,1)
    def test_openrouter_error_diagnostics_are_sanitized_and_distinct(self):
        for code in (401,402,429,503):
            message=core.openrouter_error(code,{'error':{'message':'fixture-secret-key'}})
            self.assertIn('OpenRouter',message);self.assertNotIn('fixture-secret-key',message)
        self.assertIn('saturado',core.openrouter_error(429,{'error':{'metadata':{'provider_code':429}}}))
        self.assertIn('créditos',core.openrouter_error(402,{}))
        self.assertIn('Consultar cuota',core.openrouter_error(429,{}))
    def test_provider_error_keeps_retry_after_without_raw_error_body(self):
        error=urllib.error.HTTPError('https://openrouter.ai/api/v1/chat/completions',429,'limited',{'Retry-After':'120'},io.BytesIO(b'{"error":{"message":"fixture-secret-key"}}'))
        with patch.object(core.OPENER,'open',side_effect=error):
            with self.assertRaises(core.Problem) as problem:core.fetch(error.url)
        self.assertEqual(problem.exception.retry_after,120);self.assertNotIn('fixture-secret-key',problem.exception.message)
        self.assertIsNone(core.retry_delay({'Retry-After':'bad'}));self.assertEqual(core.retry_delay({'Retry-After':'999999'}),86400)
    def test_ticket_one_scan_one_encounter(self):
        d=self.dex();session='fixture-session';ticket='fixture-ticket';self.store.db.execute('INSERT INTO tickets VALUES (?,?,?,?,0)',(ticket,session,'{}',int(time.time())+300));self.store.record(d,'imagen','scan',str(uuid.uuid4()),ticket,session)
        with self.assertRaises(core.Problem):self.store.record(d,'imagen','scan',str(uuid.uuid4()),ticket,session)
        self.assertEqual(len(self.store.entries()),1)
    def test_ticket_bound_to_session(self):
        self.store.db.execute('INSERT INTO tickets VALUES (?,?,?,?,0)',('ticket','owner','{}',int(time.time())+300))
        with self.assertRaises(core.Problem):self.store.record(self.dex(),'imagen','scan',str(uuid.uuid4()),'ticket','other')
        self.assertEqual(self.store.entries(),[])
    def test_asset_allowlist(self):
        self.assertTrue(core.valid_asset(core.art_url(25)));self.assertTrue(core.valid_asset('https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/25.ogg'))
        for bad in ('http://127.0.0.1/key','https://raw.githubusercontent.com/evil/pokemon.png','https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/../key.png','https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png?key=x'):
            self.assertFalse(core.valid_asset(bad))
    def test_type_defenses(self):
        values={v['type']:v['multiplier'] for v in core.defenses(['fire','flying'])};self.assertEqual(values['rock'],4);self.assertEqual(values['ground'],0);self.assertEqual(values['water'],2)
    def test_historical_chart(self):
        self.assertEqual(next(v['multiplier'] for v in core.defenses(['steel'],5) if v['type']=='dark'),.5);self.assertNotIn('fairy',[v['type'] for v in core.defenses(['fire'],5)])
    def test_narration_has_game_and_form_without_unbounded_text(self):
        d=core.apply_form(self.dex(),'terastal','water');text=core.narration(d,'scarlet-violet');self.assertIn('Teratipo Agua',text);self.assertIn('Tipos originales',text);self.assertLessEqual(len(text),1600)
    def test_voice_schema_no_conversation(self):
        body=core.voice_payload('Texto de prueba.','Charon');self.assertFalse(body['store']);self.assertNotIn('previous_interaction_id',body);self.assertEqual(body['response_format']['mime_type'],'audio/wav');self.assertIn('annotations',body['input'][0]['content'][0])
    def test_wav_validation(self):
        buffer=io.BytesIO()
        with wave.open(buffer,'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(24000);w.writeframes(b'\0\0'*240)
        raw=buffer.getvalue();reply={'steps':[{'type':'model_output','content':[{'type':'audio','data':base64.b64encode(raw).decode()}]}]};self.assertEqual(core.voice_response(reply),raw)
        reply['steps'][0]['content'][0]['data']=base64.b64encode(b'not-wav').decode()
        with self.assertRaises(core.Problem):core.voice_response(reply)
    def test_openrouter_only_free_models(self):
        catalog={'data':[{'id':'paid-model','pricing':{'prompt':'0.01','completion':'0'},'architecture':{'input_modalities':['text','image']}},{'id':'free-model:free','pricing':{'prompt':'0','completion':'0'},'architecture':{'input_modalities':['text','image']}}]}
        calls=[]
        def provider(url,payload=None,headers=None):
            calls.append((url,payload));return catalog if payload is None else {'choices':[{'message':{'content':'{"candidates":[],"media":"otro"}'}}]}
        with patch.object(core,'fetch_json',side_effect=provider):result=core.recognize('image','openrouter','fixture-key')
        self.assertEqual(calls[-1][1]['model'],'free-model:free');self.assertEqual(result['candidates'],[])
    def test_no_free_provider_does_not_call_paid(self):
        with patch.object(core,'fetch_json',return_value={'data':[]}) as fetcher:
            with self.assertRaises(core.Problem):core.recognize('image','openrouter','fixture-key')
            self.assertEqual(fetcher.call_count,1)
    def test_google_diagnostic_sanitized(self):
        self.assertNotIn('secret-key',core.google_error(401,{'error':{'message':'secret-key'}}));self.assertIn('cuota',core.google_error(429,{}))
    def test_google_failure_is_not_session_failure(self):
        self.assertFalse(core.Problem(401,'Google rejected authentication').auth)
    def test_za_only_marked_game_tables(self):
        sections={'parse':{'sections':[{'line':'Movimientos','index':'8'}]}};body={'parse':{'text':{'*':(FIXTURES/'za-moves.html').read_text()}}}
        with patch.object(core,'fetch_json',side_effect=[sections,body]):moves=self.data.za_moves('Charmeleon')
        self.assertGreater(len(moves),10);self.assertTrue(all(m['game']=='legends-za' for m in moves));self.assertTrue(all(m['pp']==-1 for m in moves));self.assertTrue(any(m.get('cooldown',0)>0 for m in moves))
    def test_preferences_validation_before_key_write(self):
        app=server.App(self.store)
        with self.assertRaises(core.Problem):app.post('/api/settings',{'provider':'paid-router','gemini_key':'new-test-only-key'},'')
        self.assertIsNone(self.store.get('gemini_key'))
    def test_wrong_password_rejected(self):
        with self.assertRaises(core.Problem):self.store.login('wrong password')
        token,csrf=self.store.login('fixture-password-2026');self.assertEqual(self.store.session(token),csrf)
    def test_cancel_scan_ticket_has_no_encounter(self):
        self.store.db.execute('INSERT INTO tickets VALUES (?,?,?,?,0)',('ticket','owner','{}',int(time.time())+300));self.assertEqual(self.store.entries(),[])

class HTTPTests(WebTests):
    # Run only HTTP-specific cases here, not inherited core cases.
    def setUp(self):
        super().setUp();self.http=server.make_server(self.store);self.thread=threading.Thread(target=self.http.serve_forever,daemon=True);self.thread.start();self.origin=f'http://127.0.0.1:{self.http.server_port}';self.cookie='';self.csrf=''
    def tearDown(self):
        self.http.shutdown();self.http.server_close();self.thread.join();super().tearDown()
    def request(self,path,body=None,method=None,origin=None,csrf=None,host=None,extra_headers=None):
        headers={'Origin':origin or self.origin,'Cookie':self.cookie,'X-Pokedex-CSRF':self.csrf if csrf is None else csrf}
        if host is not None:headers['Host']=host
        if extra_headers:headers.update(extra_headers)
        if body is not None:headers['Content-Type']='application/json'
        req=urllib.request.Request(self.origin+path,json.dumps(body).encode() if body is not None else None,headers,method=method)
        try:response=urllib.request.urlopen(req,timeout=5)
        except urllib.error.HTTPError as e:response=e
        raw=response.read();value=json.loads(raw) if response.headers.get_content_type()=='application/json' else raw
        return response.status,value,response.headers
    def auth(self):
        status,value,headers=self.request('/api/login',{'password':'fixture-password-2026'});self.assertEqual(status,200);self.cookie=headers['Set-Cookie'].split(';')[0];self.csrf=value['csrf']
    def test_http_auth_and_headers(self):
        status,value,_=self.request('/api/bootstrap');self.assertEqual(status,401);self.assertTrue(value['auth']);self.auth();status,value,headers=self.request('/api/bootstrap');self.assertEqual(status,200);self.assertNotIn('gemini_key',value['settings']);self.assertIn("frame-ancestors 'none'",headers['Content-Security-Policy'])
    def test_http_csrf_and_cross_origin(self):
        self.auth();self.assertEqual(self.request('/api/settings',{'robot':False},csrf='bad')[0],403);self.assertEqual(self.request('/api/settings',{'robot':False},origin='https://evil.example')[0],403);self.assertEqual(self.request('/api/settings',{'robot':False})[0],200)
    def test_http_record_delete_export_and_restart_data(self):
        self.auth();status,entry,_=self.request('/api/encounters',{'lookup':'charmeleon','transformation':'terastal','teraType':'water','id':str(uuid.uuid4())});self.assertEqual(status,200);self.assertEqual(entry['dex']['teraType'],'water');self.assertEqual(len(self.request('/api/export')[1]['encounters']),1);self.assertEqual(self.request('/api/encounters/'+entry['id'],method='DELETE')[0],200);self.assertEqual(self.request('/api/export')[1]['encounters'],[])
    def test_http_correct_keeps_date_and_id(self):
        self.auth();entry=self.request('/api/encounters',{'lookup':'charmeleon'})[1];corrected=self.request('/api/encounters/'+entry['id'],{'lookup':'charizard-mega-x'})[1];self.assertEqual(corrected['at'],entry['at']);self.assertEqual(corrected['id'],entry['id']);self.assertEqual(corrected['species'],6)
    def test_http_google_401_does_not_log_out(self):
        self.auth();self.store.set('voice_key','test-only-key')
        with patch.object(core,'fetch_json',side_effect=core.Problem(401,'Google rechazó la autenticación.')):status,value,_=self.request('/api/check-access',{})
        self.assertEqual(status,401);self.assertFalse(value['auth']);self.assertEqual(self.request('/api/bootstrap')[0],200)
    def test_http_scan_records_only_once_and_uses_provider_candidate(self):
        self.auth();self.store.set('openrouter_key','fixture-only-key')
        result={'candidates':[{'id':5,'slug':'charmeleon','certainty':'high','transformation':'none','teraType':''}],'media':'peluche'}
        image=base64.b64encode(b'\xff\xd8\xff'+b'fixture-image'*30).decode()
        with patch.object(core,'recognize',return_value=result):
            status,scan,_=self.request('/api/recognize',{'image':image})
        self.assertEqual(status,200);self.assertEqual(self.store.entries(),[])
        status,entry,_=self.request('/api/encounters',{'ticket':scan['ticket'],'candidate':0,'lookup':'charizard-mega-x'})
        self.assertEqual(status,200);self.assertEqual(entry['species'],5);self.assertEqual(entry['source'],'scan');self.assertEqual(entry['media'],'peluche')
        self.assertEqual(self.request('/api/encounters',{'ticket':scan['ticket'],'candidate':0})[0],409);self.assertEqual(len(self.store.entries()),1)
    def test_http_background_scan_and_registration_keep_one_encounter(self):
        self.auth();self.store.set('openrouter_key','fixture-only-key')
        result={'candidates':[{'id':5,'slug':'charmeleon','certainty':'high','transformation':'none','teraType':''}],'media':'peluche'}
        image=base64.b64encode(b'\xff\xd8\xff'+b'fixture-image'*30).decode();identity=str(uuid.uuid4())
        with patch.object(core,'recognize',return_value=result) as recognize:
            status,started,_=self.request('/api/scan-jobs',{'id':identity,'operation':'recognize','input':{'image':image}});self.assertEqual(status,200)
            for _ in range(100):
                value=self.request('/api/scan-jobs/'+started['job'])[1]
                if value['state']!='working':break
                time.sleep(.01)
            self.assertEqual(value['state'],'done');self.assertEqual(recognize.call_count,1)
        scan=value['result'];status,started,_=self.request('/api/scan-jobs',{'operation':'encounters','input':{'ticket':scan['ticket'],'candidate':0,'id':str(uuid.uuid4())}});self.assertEqual(status,200)
        for _ in range(100):
            value=self.request('/api/scan-jobs/'+started['job'])[1]
            if value['state']!='working':break
            time.sleep(.01)
        self.assertEqual(value['state'],'done');self.assertEqual(value['result']['species'],5);self.assertEqual(len(self.store.entries()),1)
        for _ in range(4):self.assertEqual(self.request('/api/scan-jobs/'+started['job'])[1],value)
        self.assertEqual(len(self.store.entries()),1)
    def test_http_job_is_bound_to_session_and_cannot_start_without_csrf(self):
        self.auth();self.assertEqual(self.request('/api/scan-jobs',{'operation':'recognize','input':{}},csrf='wrong')[0],403)
        job=self.http.app.start_job({'operation':'recognize','input':{}},'other-session')
        self.assertEqual(self.request('/api/scan-jobs/'+job['job'])[0],404)
    def test_http_chatgpt_import_rejects_plain_http(self):
        self.auth()
        with patch.object(self.http.app.chatgpt,'import_credentials') as importer:self.assertEqual(self.request('/api/chatgpt/import',{})[0],400)
        importer.assert_not_called()
    def test_http_https_cookie_and_configured_origin(self):
        with patch.dict(os.environ,{'POKEDEX_BASE_URL':'https://umbrel.local:8443'}):
            status,_,headers=self.request('/api/login',{'password':'fixture-password-2026'},origin='https://umbrel.local:8443')
            self.assertEqual(status,200);self.assertIn('; Secure',headers['Set-Cookie']);self.assertIn('HttpOnly',headers['Set-Cookie'])
            self.assertEqual(self.request('/api/login',{'password':'fixture-password-2026'},origin='http://umbrel.local:8443')[0],403)
    def test_http_local_and_tailscale_addresses_share_the_same_collection(self):
        with patch.dict(os.environ,{'POKEDEX_BASE_URL':''}):
            for host in ('192.168.1.87:9087','100.101.102.103:9087','umbrel.local:9087'):
                origin='http://'+host
                status,value,headers=self.request('/api/login',{'password':'fixture-password-2026'},host=host,origin=origin)
                self.assertEqual(status,200);self.assertNotIn('; Secure',headers['Set-Cookie'])
                self.cookie=headers['Set-Cookie'].split(';')[0];self.csrf=value['csrf']
                self.assertEqual(self.request('/api/settings',{'robot':False},host=host,origin=origin)[0],200)
                self.assertEqual(self.request('/api/settings',{'robot':True},host=host,origin=origin,csrf='bad')[0],403)
            status,entry,_=self.request('/api/encounters',{'lookup':'charmeleon'},host='192.168.1.87:9087',origin='http://192.168.1.87:9087')
            self.assertEqual(status,200)
            self.assertEqual(self.request('/api/export',host='100.101.102.103:9087')[1]['encounters'][0]['id'],entry['id'])
    def test_http_https_proxy_keeps_secure_cookie_without_a_fixed_name(self):
        with patch.dict(os.environ,{'POKEDEX_BASE_URL':''}):
            for host in ('192.168.1.87:9087','100.101.102.103:9087','umbrel.local:9087'):
                status,_,headers=self.request('/api/login',{'password':'fixture-password-2026'},host=host,origin='https://'+host)
                self.assertEqual(status,200);self.assertIn('; Secure',headers['Set-Cookie']);self.assertIn('SameSite=Strict',headers['Set-Cookie'])
    def test_http_ip_mode_still_rejects_foreign_origins_and_forwarded_host_spoofing(self):
        with patch.dict(os.environ,{'POKEDEX_BASE_URL':''}):
            host='192.168.1.87:9087'
            for origin in ('https://evil.example','http://100.101.102.103:9087','http://192.168.1.87:9088','http://192.168.1.87:9087?spoof=1','http://192.168.1.87:9087#spoof'):
                self.assertEqual(self.request('/api/login',{'password':'fixture-password-2026'},host=host,origin=origin,extra_headers={'X-Forwarded-Host':origin.split('://')[1]})[0],403)
    def test_http_ipv6_host_can_login_without_a_fixed_base_url(self):
        with patch.dict(os.environ,{'POKEDEX_BASE_URL':''}):
            host='[fd7a:115c:a1e0::87]:9087'
            self.assertEqual(self.request('/api/login',{'password':'fixture-password-2026'},host=host,origin='http://'+host)[0],200)
    def test_http_password_change_preserves_only_current_session(self):
        self.auth();token=self.cookie.split('=',1)[1];other,_=self.store.login('fixture-password-2026')
        status,_,_=self.request('/api/password',{'current':'fixture-password-2026','password':'replacement-fixture-password'})
        self.assertEqual(status,200);self.assertIsNotNone(self.store.session(token));self.assertIsNone(self.store.session(other));self.assertEqual(self.store.db.execute('SELECT count(*) FROM sessions').fetchone()[0],1)
        self.assertFalse((self.store.directory/'initial-password').exists());self.store.verify_password('replacement-fixture-password')
    def test_http_static_files_cannot_read_data(self):
        self.assertEqual(self.request('/../server.py')[0],404);self.assertEqual(self.request('/%2e%2e/server.py')[0],404);status,body,_=self.request('/');self.assertEqual(status,200);self.assertIn(b'viewport-fit=cover',body)
    def test_http_native_cookie_does_not_collide_with_the_compose_app(self):
        with patch.object(server,'SESSION_COOKIE','pokedex_umbrel_session'):
            self.auth();self.assertTrue(self.cookie.startswith('pokedex_umbrel_session='))
            self.assertEqual(self.request('/api/bootstrap')[0],200)
            native=self.cookie;self.cookie=self.cookie.replace('pokedex_umbrel_session=','pokedex_session=')
            self.assertEqual(self.request('/api/bootstrap')[0],401)
            self.cookie=native;status,_,headers=self.request('/api/logout',{})
            self.assertEqual(status,200);self.assertTrue(headers['Set-Cookie'].startswith('pokedex_umbrel_session='))
    def test_http_native_umbreld_gateway_preserves_host_and_https(self):
        with patch.object(server,'SESSION_COOKIE','pokedex_umbrel_session'),patch.dict(os.environ,{'POKEDEX_BASE_URL':''}):
            host='192.168.1.87:9088';origin='https://'+host
            status,value,headers=self.request('/api/login',{'password':'fixture-password-2026'},host=host,origin=origin,extra_headers={'X-Forwarded-Host':host,'X-Forwarded-Proto':'https'})
            self.assertEqual(status,200);self.assertIn('; Secure',headers['Set-Cookie'])
            self.cookie=headers['Set-Cookie'].split(';')[0];self.csrf=value['csrf']
            self.assertEqual(self.request('/api/settings',{'robot':True},host=host,origin=origin)[0],200)
    def test_http_logout_revokes(self):
        self.auth();self.assertEqual(self.request('/api/logout',{})[0],200);self.assertEqual(self.request('/api/bootstrap')[0],401)
    def test_http_invalid_import_atomic(self):
        self.auth();good=self.row();bad=self.row();bad['species']=99;status,_,_=self.request('/api/import',self.backup([good,bad]));self.assertEqual(status,400);self.assertEqual(self.store.entries(),[])
    def test_http_asset_ssrf_block(self):
        self.auth();self.assertEqual(self.request('/api/asset?url='+urllib.parse.quote('http://127.0.0.1/secrets'))[0],400)
    def test_http_voice_binary_cache_without_key_request(self):
        self.auth();dex=self.dex();text=core.narration(dex,'scarlet-violet');key='voice:'+__import__('hashlib').sha256((core.VOICE_MODEL+'|Charon|'+text).encode()).hexdigest();self.store.save_blob(key,b'cached-wav','audio/wav');status,raw,headers=self.request('/api/voice',{'lookup':'charmeleon','game':'scarlet-violet'});self.assertEqual(status,200);self.assertEqual(raw,b'cached-wav');self.assertEqual(headers.get_content_type(),'audio/wav')

if __name__=='__main__':
    suite=unittest.TestSuite()
    suite.addTests(unittest.defaultTestLoader.loadTestsFromTestCase(WebTests))
    suite.addTests(HTTPTests(name) for name in unittest.defaultTestLoader.getTestCaseNames(HTTPTests) if name.startswith('test_http_'))
    result=unittest.TextTestRunner(verbosity=2).run(suite)
    raise SystemExit(not result.wasSuccessful())
