"""One-way GPT-Live narration. API keys stay on Umbrel; no microphone is sent."""
import base64
import io
import json
import math
import re
import struct
import threading
import time
import urllib.error
import urllib.request
import wave

import core

MODEL = 'gpt-live-1'
REVISION = 'live-1'
VOICES = ('marin', 'cedar')
RATE = 24000
MAX_SECONDS = 55
STYLE = ('Eres una enciclopedia electrónica. Habla en español de México, con dicción '
         'precisa, ritmo algo más rápido de lo habitual y voz monótona, metálica y robótica. Lee exclusivamente '
         'la ficha proporcionada, sin saludo, preguntas ni comentarios adicionales. '
         'Al terminar, guarda silencio. No ejecutes herramientas ni delegues tareas.')


def wav_bytes(pcm):
    out = io.BytesIO()
    with wave.open(out, 'wb') as audio:
        audio.setnchannels(1); audio.setsampwidth(2); audio.setframerate(RATE)
        audio.writeframes(pcm)
    return out.getvalue()


def pcm_bytes(wav):
    with wave.open(io.BytesIO(wav)) as audio:
        if audio.getnchannels() != 1 or audio.getsampwidth() != 2 or audio.getframerate() != RATE:
            raise core.Problem(502, 'El audio guardado no es compatible.')
        return audio.readframes(audio.getnframes())


def audible(pcm):
    if not pcm or len(pcm) % 2: return False
    samples = struct.unpack('<' + 'h' * (len(pcm)//2), pcm)
    return math.sqrt(sum(v*v for v in samples)/len(samples)) > 90


def provider_problem(status, body=None, secret=''):
    """Classify upstream failures without returning arbitrary provider text/secrets."""
    if isinstance(body,(bytes,str)):
        try:body=json.loads(body[:32768])
        except (ValueError,UnicodeError):body={}
    error=body.get('error',{}) if isinstance(body,dict) else {}
    code=error.get('code','') if isinstance(error,dict) else ''
    detail=error.get('message','') if isinstance(error,dict) else ''
    if not isinstance(detail,str):detail=''
    if secret:detail=detail.replace(secret,'[clave oculta]')
    detail=re.sub(r'(?i)sk-[a-z0-9_.*-]+|bearer\s+[^\s,;]+','[clave oculta]',detail)
    detail=re.sub(r'[\x00-\x1f<>]',' ',detail).strip()[:250]
    label=f'OpenAI · HTTP {status}. '
    # Structured upstream reason helps diagnosis, but never echo HTML or credentials.
    def problem(code,message):
        return core.Problem(code,label+message+(' Detalle de OpenAI: '+detail if detail else ''))
    if code in ('insufficient_quota','billing_hard_limit_reached','billing_not_active'):
        return problem(429,'El proyecto de API no tiene cuota o saldo disponible. Revisa su facturación; ChatGPT Plus no incluye saldo de API.')
    if status==401 or code in ('invalid_api_key','invalid_authentication','missing_api_key'):
        return problem(401,'La API rechazó la autenticación. Comprueba que guardaste la clave completa del proyecto de OpenAI en Narración.')
    if code in ('unsupported_country_region_territory','region_not_supported'):
        return problem(403,'OpenAI no permite esta solicitud desde la región de salida de tu servidor. Revisa dónde sale a Internet Umbrel.')
    if status==403:
        return problem(403,'Acceso denegado a GPT-Live. Esto no demuestra que la clave sea incorrecta: los permisos All no habilitan el modelo para una cuenta o proyecto. Comprueba el acceso y nivel de API de ese proyecto; GPT-Live no admite el nivel gratuito.')
    if status==404 or code=='model_not_found':
        return problem(404,'GPT-Live no está disponible para este proyecto o modelo. Comprueba el acceso a gpt-live-1.')
    if status==429 or code=='rate_limit_exceeded':
        return problem(429,'Se alcanzó una cuota o límite de API. Revisa uso, límites y facturación del proyecto antes de repetir.')
    return problem(502,'No se pudo completar la conexión de voz. La app no volverá a enviarla automáticamente.')


def check_access(key):
    """Read-only catalog check; not a promise of voice-session authorization."""
    req=urllib.request.Request('https://api.openai.com/v1/models/'+MODEL,
        headers={'Authorization':'Bearer '+key,'User-Agent':'Pokedex-Umbrel/1.4.1'})
    try:
        with core.OPENER.open(req,timeout=15) as response:
            data=json.loads(response.read(65536))
            if not isinstance(data,dict) or data.get('id')!=MODEL:
                raise core.Problem(502,'OpenAI devolvió una comprobación de acceso no compatible.')
    except urllib.error.HTTPError as exc:
        raise provider_problem(exc.code,exc.read(32768),key) from None
    except (urllib.error.URLError,TimeoutError):
        raise core.Problem(503,'Umbrel no pudo consultar el acceso a la API de voz de OpenAI.') from None
    except (ValueError,UnicodeError):
        raise core.Problem(502,'OpenAI devolvió una comprobación de acceso incompleta.') from None
    return {'ok':True,'message':'La API aceptó la clave y devolvió el modelo gpt-live-1. Esta consulta no verifica saldo ni autorización para abrir una sesión de voz. Probar voz comprobará la sesión; genera consumo si se abre. GPT-Live requiere un nivel de API compatible, aparte de ChatGPT Plus.'}


def connect(key):
    # Imported only when used so offline data/tests do not need network packages.
    import websocket
    try:
        return websocket.create_connection('wss://api.openai.com/v1/live/sessions',
            header={'Authorization': 'Bearer '+key,'User-Agent':'Pokedex-Umbrel/1.4.1'}, timeout=10, redirect_limit=0, suppress_origin=True)
    except websocket.WebSocketBadStatusException as exc:
        raise provider_problem(getattr(exc,'status_code',502),getattr(exc,'resp_body',None),key) from None
    except Exception:
        raise core.Problem(503, 'Umbrel no pudo conectar con GPT-Live.') from None


def stream(text, voice, key, connector=connect, now=time.monotonic):
    """Yield PCM as it arrives, close after spoken content and a quiet tail.

    Live has no audio-done event. Use real-time silence plus transcript activity,
    bound every session, and always close it, including when the listener leaves.
    Never retry a billable session automatically.
    """
    if voice not in VOICES: raise core.Problem(400, 'Voz inválida.')
    ws = connector(key)
    stop = threading.Event(); sender = None; closing = False; finalized = False
    started = now(); last_voice = None; last_text = None; voiced = 0
    failure = []
    instruction = 'Lee ahora esta ficha en español y después guarda silencio: '+text
    def send(event): ws.send(json.dumps(event, ensure_ascii=False))
    def silence():
        chunk = base64.b64encode(bytes(4800)).decode()
        while not stop.wait(.1):
            try: send({'type':'session.input_audio.append','audio':chunk})
            except Exception: failure.append(True); return
    try:
        send({'type':'session.start','event_id':'start','session':{
            'model':MODEL, 'store':False, 'instructions':STYLE,
            'audio':{'format':{'type':'audio/pcm','rate':RATE},'output':{'voice':voice}},
            'delegation':{'type':'client'},
            'input':[{'type':'message','role':'developer','content':[{'type':'input_text','text':instruction}]}]}})
        ws.settimeout(.25)
        while True:
            elapsed = now()-started
            if elapsed > MAX_SECONDS: raise core.Problem(504, 'GPT-Live no terminó la narración. Puedes volver a probar con el botón Voz.')
            if not closing and last_voice is not None and voiced >= .25 and now()-last_voice > 1.8 and (last_text is None or now()-last_text > 1.8):
                stop.set(); send({'type':'session.close'}); closing = True
            if last_voice is None and elapsed > 15: raise core.Problem(504, 'GPT-Live no comenzó a hablar. Revisa el acceso al modelo en Narración.')
            if failure: raise core.Problem(503, 'Se interrumpió la conexión con GPT-Live.')
            try: raw = ws.recv()
            except TimeoutError: continue
            except Exception as exc:
                if type(exc).__name__ == 'WebSocketTimeoutException': continue
                raise core.Problem(503, 'Se interrumpió la voz. No se repetirá el consumo automáticamente.') from None
            if not raw: raise core.Problem(502, 'GPT-Live cerró la conexión antes de finalizar.')
            event = json.loads(raw); kind = event.get('type')
            if kind == 'session.started':
                if sender is not None: raise core.Problem(502, 'GPT-Live devolvió una sesión duplicada.')
                send({'type':'session.commentary.append','event_id':'narrate','delegation_id':None,'content':instruction})
                sender = threading.Thread(target=silence, daemon=True); sender.start()
            elif kind == 'session.output_audio.delta':
                pcm = base64.b64decode(event.get('delta',''), validate=True)
                if len(pcm)%2 or len(pcm)>192000: raise core.Problem(502, 'GPT-Live devolvió audio no compatible.')
                if audible(pcm): last_voice = now(); voiced += len(pcm)/(RATE*2)
                if pcm and not closing: yield pcm
            elif kind == 'session.output_transcript.delta': last_text = now()
            elif kind == 'session.closed':
                if not closing or last_voice is None: raise core.Problem(502, 'GPT-Live finalizó sin completar una narración.')
                finalized = True; return
            elif kind == 'error':
                raise provider_problem(502,event,key)
    except (ValueError, TypeError, KeyError):
        raise core.Problem(502, 'GPT-Live devolvió una respuesta no compatible.') from None
    finally:
        stop.set()
        if not closing and not finalized:
            try: send({'type':'session.close'})
            except Exception: pass
        if sender: sender.join(timeout=.3)
        ws.close()
