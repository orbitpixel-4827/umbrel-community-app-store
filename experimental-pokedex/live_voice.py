"""One-way GPT-Live narration. API keys stay on Umbrel; no microphone is sent."""
import base64
import io
import json
import math
import struct
import threading
import time
import wave

import core

MODEL = 'gpt-live-1'
REVISION = 'live-1'
VOICES = ('marin', 'cedar')
RATE = 24000
MAX_SECONDS = 55
STYLE = ('Eres una enciclopedia electrónica. Habla en español de México, con dicción '
         'precisa, ritmo ágil y voz monótona, metálica y robótica. Lee exclusivamente '
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


def connect(key):
    # Imported only when used so offline data/tests do not need network packages.
    import websocket
    try:
        return websocket.create_connection('wss://api.openai.com/v1/live/sessions',
            header={'Authorization': 'Bearer '+key}, timeout=5, redirect_limit=0)
    except websocket.WebSocketBadStatusException as exc:
        status = getattr(exc, 'status_code', 502)
        if status in (401, 403): raise core.Problem(status, 'OpenAI no autorizó GPT-Live. Revisa la clave de API y su acceso al modelo.') from None
        if status == 429: raise core.Problem(429, 'GPT-Live alcanzó la cuota de tu proyecto de API. Revisa uso y facturación en OpenAI.') from None
        raise core.Problem(502, 'No se pudo abrir la voz de GPT-Live.') from None
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
                code = str(event.get('error',{}).get('code',''))
                if 'quota' in code or 'rate_limit' in code: raise core.Problem(429, 'GPT-Live alcanzó la cuota de API de OpenAI.')
                raise core.Problem(502, 'GPT-Live rechazó la narración. Comprueba la clave y el acceso al modelo.')
    except (ValueError, TypeError, KeyError):
        raise core.Problem(502, 'GPT-Live devolvió una respuesta no compatible.') from None
    finally:
        stop.set()
        if not closing and not finalized:
            try: send({'type':'session.close'})
            except Exception: pass
        if sender: sender.join(timeout=.3)
        ws.close()
