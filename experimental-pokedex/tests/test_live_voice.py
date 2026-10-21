import base64
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import core
import live_voice
import server

PCM=b'\x00\x20'*12000
class Clock:
    time=0
    def now(self):return self.time
class Socket:
    def __init__(self,events,clock):self.events=iter(events);self.clock=clock;self.sent=[];self.closed=False
    def send(self,raw):self.sent.append(json.loads(raw))
    def settimeout(self,_):pass
    def recv(self):
        event=next(self.events);self.clock.time+=event.pop('_elapsed',.1)
        return json.dumps(event)
    def close(self):self.closed=True

def event(kind,**extra):return dict(type=kind,**extra)
class LiveTests(unittest.TestCase):
    def test_streams_first_audio_before_session_is_closed_and_always_finalizes(self):
        clock=Clock();sock=Socket([event('session.started'),event('session.output_audio.delta',delta=base64.b64encode(PCM).decode()),event('session.output_audio.delta',delta=base64.b64encode(bytes(4800)).decode(),_elapsed=2),event('session.closed')],clock)
        stream=live_voice.stream('Pikachu. Tipo Eléctrico.','marin','fixture-key',connector=lambda _:sock,now=clock.now)
        self.assertEqual(next(stream),PCM);self.assertFalse(sock.closed)
        list(stream);self.assertTrue(sock.closed)
        session=sock.sent[0]['session'];self.assertFalse(session['store']);self.assertEqual(session['model'],'gpt-live-1');self.assertEqual(session['delegation'],{'type':'client'})
        self.assertTrue(any(e['type']=='session.commentary.append' for e in sock.sent));self.assertTrue(any(e['type']=='session.close' for e in sock.sent))
    def test_listener_cancellation_closes_the_upstream_session(self):
        clock=Clock();sock=Socket([event('session.started'),event('session.output_audio.delta',delta=base64.b64encode(PCM).decode())],clock)
        stream=live_voice.stream('Texto.','cedar','fixture',connector=lambda _:sock,now=clock.now)
        next(stream);stream.close();self.assertTrue(sock.closed);self.assertEqual(sock.sent[-1]['type'],'session.close')
    def test_upstream_quota_is_sanitized(self):
        clock=Clock();sock=Socket([event('error',error={'code':'insufficient_quota','message':'fixture-secret'})],clock)
        with self.assertRaises(core.Problem) as exc:list(live_voice.stream('Texto.','marin','fixture-secret',connector=lambda _:sock,now=clock.now))
        self.assertEqual(exc.exception.status,429);self.assertNotIn('fixture-secret',exc.exception.message);self.assertTrue(sock.closed)
    def test_silent_session_times_out_without_success(self):
        clock=Clock();sock=Socket([event('session.started'),event('session.output_audio.delta',delta=base64.b64encode(bytes(4800)).decode(),_elapsed=16)],clock)
        with self.assertRaises(core.Problem) as exc:list(live_voice.stream('Texto.','marin','fixture-secret',connector=lambda _:sock,now=clock.now))
        self.assertEqual(exc.exception.status,504);self.assertTrue(sock.closed)
    def test_wav_roundtrip_and_incompatible_cache_rejected(self):
        self.assertEqual(live_voice.pcm_bytes(live_voice.wav_bytes(PCM)),PCM)
        self.assertTrue(live_voice.audible(PCM));self.assertFalse(live_voice.audible(bytes(4800)))
    def test_invalid_voice_cannot_open_a_connection(self):
        called=[]
        with self.assertRaises(core.Problem):list(live_voice.stream('Texto','Charon','fixture',connector=lambda _:called.append(True)))
        self.assertEqual(called,[])

class AppTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.store=server.Store(self.tmp.name,'fixture-password');self.app=server.App(self.store)
        self.dex={'id':25,'slug':'pikachu','name':'Pikachu','types':['electric'],'genus':'Pokémon Ratón','description':'Almacena electricidad.'}
        self.lookup=patch.object(self.app,'selected_dex',return_value=self.dex);self.lookup.start()
    def tearDown(self):self.lookup.stop();self.store.db.close();self.tmp.cleanup()
    def test_completed_audio_is_cached_and_replay_uses_no_provider(self):
        self.store.set('openai_voice_key','fixture-key')
        with patch.object(live_voice,'stream',return_value=iter([PCM])) as upstream:
            self.assertEqual(b''.join(self.app.voice_stream({})),PCM);self.assertEqual(upstream.call_count,1)
        self.store.set('openai_voice_key','')
        with patch.object(live_voice,'stream',side_effect=AssertionError('No network')):
            self.assertEqual(b''.join(self.app.voice_stream({})),PCM)
    def test_cancelled_or_failed_audio_is_not_cached(self):
        self.store.set('openai_voice_key','fixture-key')
        def failing(*_):yield PCM;raise core.Problem(502,'interrupted')
        with patch.object(live_voice,'stream',side_effect=failing):
            with self.assertRaises(core.Problem):list(self.app.voice_stream({}))
        self.assertEqual(self.store.db.execute('SELECT count(*) FROM blobs').fetchone()[0],0)
        self.assertTrue(self.app.voice_lock.acquire(False));self.app.voice_lock.release()
    def test_missing_key_reports_setup_not_server_disconnection(self):
        with self.assertRaises(core.Problem) as exc:list(self.app.voice_stream({}))
        self.assertEqual(exc.exception.status,400);self.assertIn('facturación aparte',exc.exception.message)
    def test_voice_key_never_appears_in_bootstrap_settings(self):
        self.app.post('/api/settings',{'openai_voice_key':'fixture-secret-key','voice':'cedar'},'fixture')
        settings=self.store.settings();self.assertTrue(settings['hasVoice']);self.assertNotIn('fixture-secret-key',json.dumps(settings));self.assertEqual(settings['voice'],'cedar')
        self.app.post('/api/settings',{'clear_openai_voice_key':True},'fixture');self.assertFalse(self.store.settings()['hasVoice'])
    def test_check_access_has_no_billable_session(self):
        self.store.set('openai_voice_key','fixture-key')
        with patch.object(live_voice,'check_access',return_value={'ok':True}) as request,patch.object(live_voice,'stream') as stream:
            result=self.app.post('/api/check-access',{},'fixture')
        self.assertTrue(result['ok']);self.assertEqual(request.call_count,1);stream.assert_not_called()


class DiagnosticTests(unittest.TestCase):
    def test_authentication_and_model_permissions_have_distinct_messages(self):
        auth=live_voice.provider_problem(401);access=live_voice.provider_problem(403)
        self.assertEqual(auth.status,401);self.assertEqual(access.status,403)
        self.assertIn('HTTP 401',auth.message);self.assertIn('HTTP 403',access.message)
        self.assertIn('no demuestra que la clave sea incorrecta',access.message)
    def test_saldo_and_rate_limit_are_not_confused_with_invalid_key(self):
        quota=live_voice.provider_problem(403,{'error':{'code':'insufficient_quota'}})
        self.assertEqual(quota.status,429);self.assertIn('saldo',quota.message)
        rate=live_voice.provider_problem(429);self.assertIn('límite',rate.message)
    def test_structured_reason_masks_full_and_partial_keys_and_bearers(self):
        secret='fixture-private-key'
        message=live_voice.provider_problem(403,{'error':{'message':'Access denied '+secret+' sk-proj-abc***DEF Bearer dangerous-token'}},secret).message
        self.assertNotIn(secret,message);self.assertNotIn('abc',message);self.assertNotIn('dangerous-token',message)
        self.assertIn('Access denied',message)
    def test_html_gateway_error_is_not_returned_as_provider_details(self):
        error=live_voice.provider_problem(403,b'<html>fixture-private-key</html>')
        self.assertNotIn('fixture-private-key',error.message);self.assertNotIn('<html>',error.message)
    def test_region_rejection_is_identified_from_structured_code(self):
        error=live_voice.provider_problem(403,{'error':{'code':'unsupported_country_region_territory'}})
        self.assertIn('región',error.message)
    def test_readonly_catalog_check_does_not_claim_a_voice_session_succeeded(self):
        from unittest.mock import MagicMock
        response=MagicMock();response.__enter__.return_value.read.return_value=b'{"id":"gpt-live-1"}'
        with patch.object(core.OPENER,'open',return_value=response) as request:
            result=live_voice.check_access('fixture-secret')
        self.assertTrue(result['ok']);self.assertIn('no verifica saldo ni autorización',result['message'])
        self.assertEqual(request.call_args.args[0].get_method(),'GET')
    def test_catalog_auth_failure_reports_http_status_and_masks_the_secret(self):
        import urllib.error
        body=io.BytesIO(b'{"error":{"code":"invalid_api_key","message":"Bad key fixture-secret"}}')
        with patch.object(core.OPENER,'open',side_effect=urllib.error.HTTPError('https://api.openai.com/v1/models/gpt-live-1',401,'Bad',{},body)):
            with self.assertRaises(core.Problem) as exc:live_voice.check_access('fixture-secret')
        self.assertEqual(exc.exception.status,401);self.assertNotIn('fixture-secret',exc.exception.message)
    def test_server_connection_has_no_browser_origin_and_never_follows_redirects(self):
        from types import SimpleNamespace
        from unittest.mock import MagicMock
        mock=MagicMock(return_value='connected')
        module=SimpleNamespace(create_connection=mock,WebSocketBadStatusException=type('BadStatus',(Exception,),{}))
        with patch.dict(sys.modules,{'websocket':module}):self.assertEqual(live_voice.connect('fixture-secret'),'connected')
        args=mock.call_args.kwargs
        self.assertTrue(args['suppress_origin']);self.assertEqual(args['redirect_limit'],0)
        self.assertEqual(args['header']['Authorization'],'Bearer fixture-secret')
    def test_handshake_403_keeps_its_safe_structured_reason(self):
        from types import SimpleNamespace
        from unittest.mock import MagicMock
        class BadStatus(Exception):
            status_code=403
            resp_body=b'{"error":{"message":"Voice session access denied for fixture-secret"}}'
        module=SimpleNamespace(create_connection=MagicMock(side_effect=BadStatus()),WebSocketBadStatusException=BadStatus)
        with patch.dict(sys.modules,{'websocket':module}):
            with self.assertRaises(core.Problem) as exc:live_voice.connect('fixture-secret')
        self.assertIn('HTTP 403',exc.exception.message);self.assertIn('Voice session access denied',exc.exception.message)
        self.assertNotIn('fixture-secret',exc.exception.message)

    def test_plain_voice_rejection_is_retained_without_a_secret(self):
        error=live_voice.provider_problem(403,b'Voice session access denied: fixture-secret','fixture-secret')
        self.assertIn('Voice session access denied',error.message);self.assertNotIn('fixture-secret',error.message)
    def test_string_error_field_is_also_sanitized(self):
        error=live_voice.provider_problem(403,{'error':'Voice session access denied: sk-proj-abc123'},'')
        self.assertIn('Voice session access denied',error.message);self.assertNotIn('abc123',error.message)

if __name__=='__main__':unittest.main()
