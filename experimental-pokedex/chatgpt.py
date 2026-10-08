"""ChatGPT plan access through the documented public SIWC flow, never a paid key."""
import base64
import json
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import rsa, padding
import core

ISSUER='https://auth.openai.com'
RESOURCE='https://api.openai.com/v1'
TOKEN=ISSUER+'/api/accounts/oauth/token'
JWKS=ISSUER+'/.well-known/jwks.json'
DIRECT='chatgpt.tokens.use.direct'

def error(status, code=''):
    if code=='subscription_sharing_usage_limit_exceeded' or status==429:
        return core.Problem(429,'ChatGPT alcanzó el límite de uso compartido de tu plan. Revisa Uso en los ajustes de ChatGPT; Pokédex no añade un límite diario.')
    if code=='subscription_sharing_usage_unavailable':
        return core.Problem(403,'Tu cuenta no tiene habilitado compartir el uso de ChatGPT. Revisa la conexión y los permisos en ChatGPT.')
    if status in (401,403) or code=='invalid_grant':
        return core.Problem(401,'La conexión con ChatGPT necesita autorización de nuevo. Vuelve a conectar tu cuenta en Ajustes.')
    return core.Problem(502,'ChatGPT no completó el análisis. La imagen no se reenviará automáticamente.')

def request(url, payload=None, token=None, form=False, stream=False):
    # Fixed official destinations; never follow a redirect with credentials.
    if url not in (TOKEN,JWKS,RESOURCE+'/models',RESOURCE+'/responses'):
        raise core.Problem(400,'Destino de ChatGPT inválido.')
    body=None if payload is None else (urllib.parse.urlencode(payload).encode() if form else json.dumps(payload).encode())
    headers={'Accept':'text/event-stream' if stream else 'application/json'}
    if body is not None:headers['Content-Type']='application/x-www-form-urlencoded' if form else 'application/json'
    if token:headers['Authorization']='Bearer '+token
    try:
        with core.OPENER.open(urllib.request.Request(url,body,headers),timeout=65) as response:
            if stream:return read_stream(response)
            raw=response.read(1024*1024+1)
            if len(raw)>1024*1024:raise ValueError()
            return json.loads(raw)
    except urllib.error.HTTPError as exc:
        try:code=json.loads(exc.read(32768)).get('error',{});code=code.get('code','') if isinstance(code,dict) else code
        except Exception:code=''
        problem=error(exc.code,code);problem.retry_after=core.retry_delay(exc.headers);raise problem from None
    except (urllib.error.URLError,TimeoutError):
        raise core.Problem(503,'Umbrel no pudo comunicarse con ChatGPT. No se volvió a enviar la imagen.') from None
    except (ValueError,KeyError,TypeError):
        raise core.Problem(502,'La respuesta de ChatGPT no es válida.') from None

def read_stream(response):
    text=[];data=[];size=0;started=time.monotonic()
    for line in response:
        size+=len(line)
        if size>2*1024*1024 or time.monotonic()-started>150:
            raise core.Problem(504,'ChatGPT tardó demasiado en completar el análisis.')
        if line.strip():
            if line.startswith(b'data:'):data.append(line[5:].strip())
            continue
        if not data:continue
        raw=b'\n'.join(data);data=[]
        if raw==b'[DONE]':break
        event=json.loads(raw);kind=event.get('type')
        if kind=='response.output_text.delta':text.append(event.get('delta',''))
        if kind=='response.failed':raise error(502,event.get('response',{}).get('error',{}).get('code',''))
        if kind in ('response.incomplete','error'):raise error(502,event.get('code',''))
        if kind=='response.completed':
            result=''.join(text)
            if not result:
                result=''.join(c.get('text','') for item in event.get('response',{}).get('output',[]) for c in item.get('content',[]) if c.get('type')=='output_text')
            return result
    raise core.Problem(502,'ChatGPT interrumpió el análisis antes de completarlo. No se guardó un reconocimiento parcial.')

def unbase64(value):
    if not isinstance(value,str) or not re.fullmatch(r'[A-Za-z0-9_-]+',value):raise ValueError()
    return base64.urlsafe_b64decode(value+'='*(-len(value)%4))

def verify_token(value,audience,keys,nonce=None,subject=None,allow_expired=False):
    """Verify RS256 with the issuer's JWKS, then validate OIDC claims."""
    try:
        if not isinstance(value,str) or len(value)>32768:raise ValueError()
        head,body,signature=value.split('.');header=json.loads(unbase64(head));claims=json.loads(unbase64(body))
        if header.get('alg')!='RS256' or header.get('crit'):raise ValueError()
        matching=[k for k in keys.get('keys',[]) if k.get('kid')==header.get('kid') and k.get('kty')=='RSA' and k.get('use','sig')=='sig' and k.get('alg','RS256')=='RS256']
        if len(matching)!=1:raise ValueError()
        key=matching[0];public=rsa.RSAPublicNumbers(int.from_bytes(unbase64(key['e']),'big'),int.from_bytes(unbase64(key['n']),'big')).public_key()
        public.verify(unbase64(signature),(head+'.'+body).encode(),padding.PKCS1v15(),hashes.SHA256())
        now=time.time();aud=claims.get('aud');aud=aud if isinstance(aud,list) else [aud]
        if claims.get('iss')!=ISSUER or audience not in aud or (len(aud)>1 and claims.get('azp')!=audience):raise ValueError()
        if type(claims.get('exp')) not in (int,float) or type(claims.get('iat')) not in (int,float):raise ValueError()
        if not allow_expired and claims['exp']<now-5 or claims['iat']>now+5 or claims.get('nbf',0)>now+5:raise ValueError()
        if not isinstance(claims.get('sub'),str) or not claims['sub']:raise ValueError()
        if nonce is not None and claims.get('nonce')!=nonce or subject is not None and claims['sub']!=subject:raise ValueError()
        return claims
    except Exception:
        raise core.Problem(400,'No se pudo verificar la identidad de ChatGPT. Repite la autorización desde la computadora.') from None

class Connection:
    def __init__(self,store):
        self.store=store;self.lock=threading.RLock()
        with store.lock:
            if not store.get('chatgpt_host_id'):store.set('chatgpt_host_id','urn:uuid:'+str(uuid.uuid4()))
    def status(self):
        record=self.store.get('chatgpt_connection') or {}
        return {'connected':bool(record.get('refresh_token')),'email':record.get('email',''),'model':record.get('model','')}
    def import_credentials(self,record):
        if not isinstance(record,dict) or record.get('format')!='pokedex-chatgpt-v1':raise core.Problem(400,'Selecciona el archivo de conexión creado por Pokédex.')
        client=record.get('client_id','')
        if not isinstance(client,str) or not re.fullmatch(r'oaiapp_[A-Za-z0-9_-]{1,200}',client):raise core.Problem(400,'La conexión no incluye el cliente autorizado de ChatGPT.')
        if not isinstance(record.get('nonce'),str) or not 32<=len(record['nonce'])<=128:raise core.Problem(400,'La conexión no incluye la comprobación de autorización.')
        keys=request(JWKS);identity=verify_token(record.get('id_token'),client,keys,record.get('nonce'))
        access=verify_token(record.get('access_token'),RESOURCE,keys,subject=identity['sub'])
        if access.get('client_id')!=client or DIRECT not in access.get('scope','').split():raise core.Problem(403,'No se concedió permiso para usar el plan de ChatGPT.')
        if record.get('token_type','').lower()!='bearer' or not isinstance(record.get('refresh_token'),str) or not 10<len(record['refresh_token'])<32768:raise core.Problem(400,'La conexión está incompleta.')
        saved={k:record[k] for k in ('client_id','id_token','access_token','refresh_token')}
        saved.update(subject=identity['sub'],email=identity.get('email',''),expires_at=access['exp'],scopes=access['scope'].split(),model='')
        # Never copy the laptop host ID; the Umbrel host keeps its own identity.
        with self.lock:
            self.store.set('chatgpt_registration',{'client_id':client,'subject':identity['sub'],'email':identity.get('email','')})
            self.store.set('chatgpt_connection',saved);self.store.set('chatgpt_models',[])
        return self.status()
    def access(self):
        with self.lock:
            saved=self.store.get('chatgpt_connection') or {}
            if not saved.get('refresh_token'):raise core.Problem(400,'Conecta ChatGPT en Ajustes → Reconocimiento.')
            if saved.get('expires_at',0)>time.time()+90:return saved['access_token']
            response=request(TOKEN,{'grant_type':'refresh_token','client_id':saved['client_id'],'refresh_token':saved['refresh_token'],'resource':RESOURCE},form=True)
            scopes=response.get('scope','').split()
            if DIRECT not in scopes or response.get('token_type','').lower()!='bearer':raise core.Problem(403,'ChatGPT no renovó el permiso para usar tu plan.')
            keys=request(JWKS);access=verify_token(response.get('access_token'),RESOURCE,keys,subject=saved['subject'])
            if access.get('client_id')!=saved['client_id'] or DIRECT not in access.get('scope','').split():raise core.Problem(403,'La renovación de ChatGPT no corresponde a esta conexión.')
            if not isinstance(response.get('refresh_token'),str) or len(response['refresh_token'])<10:raise core.Problem(502,'ChatGPT no devolvió la renovación completa.')
            updated=dict(saved,access_token=response['access_token'],refresh_token=response['refresh_token'],expires_at=access['exp'],scopes=scopes)
            if response.get('id_token'):
                verify_token(response['id_token'],saved['client_id'],keys,subject=saved['subject']);updated['id_token']=response['id_token']
            self.store.set('chatgpt_connection',updated)
            return updated['access_token']
    def models(self):
        with self.lock:
            response=request(RESOURCE+'/models',token=self.access())
            models=[{'slug':m['slug'],'name':m.get('display_name',m['slug'])} for m in response.get('models',[]) if m.get('visibility')=='list' and isinstance(m.get('slug'),str) and re.fullmatch(r'[A-Za-z0-9._-]{1,150}',m['slug'])]
            if not models:raise core.Problem(403,'ChatGPT no ofreció modelos para esta cuenta. Revisa el acceso al plan.')
            saved=self.store.get('chatgpt_connection')
            if not any(m['slug']==saved.get('model') for m in models):saved['model']=models[0]['slug'];self.store.set('chatgpt_connection',saved)
            self.store.set('chatgpt_models',models)
        return models
    def select_model(self,slug):
        with self.lock:
            if not any(m['slug']==slug for m in self.store.get('chatgpt_models',[])):raise core.Problem(400,'Elige un modelo disponible en tu cuenta de ChatGPT.')
            saved=self.store.get('chatgpt_connection')
            if not saved:raise core.Problem(400,'Conecta ChatGPT primero.')
            saved['model']=slug;self.store.set('chatgpt_connection',saved)
    def recognize(self,image):
        with self.lock:
            saved=self.store.get('chatgpt_connection') or {}
            if not saved.get('model'):self.models();saved=self.store.get('chatgpt_connection')
            token=self.access();model=saved['model']
        text=request(RESOURCE+'/responses',{'model':model,'store':False,'stream':True,'input':[{'role':'user','content':[{'type':'input_text','text':core.PROMPT},{'type':'input_image','image_url':'data:image/jpeg;base64,'+image}]}]},token=token,stream=True)
        return core.recognition_text(text)
