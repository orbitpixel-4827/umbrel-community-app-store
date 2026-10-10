"""Self-hosted Pokédex. Private data and ChatGPT credentials live in DATA_DIR."""
import base64
import datetime
import hashlib
import hmac
import http.cookies
import json
import mimetypes
import os
from pathlib import Path
import re
import secrets
import sqlite3
import threading
import time
import urllib.parse
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import core
import chatgpt

ROOT=Path(__file__).resolve().parent
SESSION_COOKIE=os.environ.get('POKEDEX_COOKIE_NAME','pokedex_session')
if not re.fullmatch(r'[A-Za-z0-9_]{1,64}',SESSION_COOKIE):raise RuntimeError('Nombre de cookie inválido.')
DEFAULTS={'provider':'openrouter','voice':'Charon','autoVoice':True,'robot':True,'game':'scarlet-violet','favorites':[]}

def dumps(value): return json.dumps(value,ensure_ascii=False,separators=(',',':'))
def password_hash(password,salt): return hashlib.scrypt(password.encode(),salt=salt,n=16384,r=8,p=1,maxmem=64*1024*1024).hex()

class Store:
    def __init__(self,directory,password=None):
        self.directory=Path(directory).resolve();self.directory.mkdir(parents=True,exist_ok=True);self.directory.chmod(0o700)
        self.lock=threading.RLock();self.db=sqlite3.connect(str(self.directory/'pokedex.sqlite3'),check_same_thread=False,isolation_level=None)
        self.db.execute('PRAGMA journal_mode=WAL');self.db.execute('PRAGMA busy_timeout=5000')
        self.db.executescript('''CREATE TABLE IF NOT EXISTS config(key TEXT PRIMARY KEY,value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS cache(key TEXT PRIMARY KEY,body TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS encounters(id TEXT PRIMARY KEY,species INTEGER NOT NULL,at INTEGER NOT NULL,body TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS encounter_time ON encounters(at DESC);
        CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,csrf TEXT NOT NULL,expires INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS blobs(key TEXT PRIMARY KEY,body BLOB NOT NULL,mime TEXT NOT NULL,at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS tickets(token TEXT PRIMARY KEY,session TEXT NOT NULL,body TEXT NOT NULL,expires INTEGER NOT NULL,used INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS quotas(kind TEXT PRIMARY KEY,day TEXT NOT NULL,count INTEGER NOT NULL,last REAL NOT NULL,pause REAL NOT NULL DEFAULT 0);''')
        if not self.get('password_hash'):
            if password and len(password)<12: raise RuntimeError('POKEDEX_PASSWORD necesita al menos 12 caracteres.')
            password=password or secrets.token_urlsafe(24);salt=secrets.token_bytes(16)
            self.set('password_salt',salt.hex());self.set('password_hash',password_hash(password,salt))
            if not os.environ.get('POKEDEX_PASSWORD'):
                path=self.directory/'initial-password';path.write_text(password+'\n');path.chmod(0o600)
        (self.directory/'pokedex.sqlite3').chmod(0o600)
    def get(self,key,default=None):
        with self.lock:
            row=self.db.execute('SELECT value FROM config WHERE key=?',(key,)).fetchone()
            return json.loads(row[0]) if row else default
    def set(self,key,value):
        with self.lock: self.db.execute('INSERT OR REPLACE INTO config VALUES (?,?)',(key,dumps(value)))
    def cached(self,key):
        with self.lock:
            row=self.db.execute('SELECT body FROM cache WHERE key=?',(key,)).fetchone()
            return json.loads(row[0]) if row else None
    def cache(self,key,value):
        with self.lock: self.db.execute('INSERT OR REPLACE INTO cache VALUES (?,?)',(key,dumps(value)))
    def blob(self,key):
        with self.lock:
            row=self.db.execute('SELECT body,mime FROM blobs WHERE key=?',(key,)).fetchone()
            if row: self.db.execute('UPDATE blobs SET at=? WHERE key=?',(int(time.time()),key))
            return row
    def save_blob(self,key,body,mime):
        with self.lock:
            self.db.execute('INSERT OR REPLACE INTO blobs VALUES (?,?,?,?)',(key,body,mime,int(time.time())))
            total=self.db.execute('SELECT coalesce(sum(length(body)),0) FROM blobs').fetchone()[0]
            for old,size in self.db.execute('SELECT key,length(body) FROM blobs ORDER BY at').fetchall():
                if total<=128*1024*1024: break
                self.db.execute('DELETE FROM blobs WHERE key=?',(old,));total-=size
    def entries(self):
        with self.lock: return [json.loads(r[0]) for r in self.db.execute('SELECT body FROM encounters ORDER BY at DESC,id DESC')]
    def settings(self):
        out=dict(DEFAULTS,**self.get('preferences',{}))
        out.update(hasGemini=bool(self.get('gemini_key')),hasOpenrouter=bool(self.get('openrouter_key')),hasVoice=bool(self.get('voice_key') or self.get('gemini_key')))
        connection=self.get('chatgpt_connection') or {}
        out['chatgpt']={'connected':bool(connection.get('refresh_token')),'email':connection.get('email',''),'model':connection.get('model','')}
        out['chatgptModels']=self.get('chatgpt_models',[])
        return out
    def reserve(self,kind,limit,gap):
        now=time.time();day=datetime.datetime.now(datetime.timezone.utc).date().isoformat()
        with self.lock:
            row=self.db.execute('SELECT day,count,last,pause FROM quotas WHERE kind=?',(kind,)).fetchone()
            count=row[1] if row and row[0]==day else 0
            if row and now<row[3]: raise core.Problem(429,f'{dict(chatgpt="ChatGPT",openrouter="OpenRouter").get(kind.removeprefix("vision:"),"Gemini")} está en pausa tras limitar las solicitudes. Espera {int(row[3]-now)+1} segundos antes de volver a probar.')
            if limit is not None and count>=limit: raise core.Problem(429,f'Pokédex alcanzó su límite local de {limit} solicitudes de {"voz" if kind=="voice" else "reconocimiento"} por hoy.')
            if row and now-row[2]<gap: raise core.Problem(429,f'Espera {int(gap-(now-row[2]))+1} segundos antes de repetir.')
            self.db.execute('INSERT OR REPLACE INTO quotas VALUES (?,?,?,?,?)',(kind,day,count+1,now,row[3] if row else 0))
    def pause(self,kind,seconds=60):
        with self.lock: self.db.execute('UPDATE quotas SET pause=? WHERE kind=?',(time.time()+seconds,kind))
    def session(self,token):
        with self.lock:
            row=self.db.execute('SELECT csrf,expires FROM sessions WHERE token=?',(hashlib.sha256(token.encode()).hexdigest(),)).fetchone()
            return row[0] if row and row[1]>time.time() else None
    def verify_password(self,password):
        actual=password_hash(password,bytes.fromhex(self.get('password_salt')))
        if not hmac.compare_digest(actual,self.get('password_hash')): raise core.Problem(401,'Contraseña incorrecta.')
    def login(self,password):
        self.verify_password(password)
        token=secrets.token_urlsafe(32);csrf=secrets.token_urlsafe(24)
        with self.lock:
            self.db.execute('DELETE FROM sessions WHERE expires<?',(int(time.time()),))
            self.db.execute('INSERT INTO sessions VALUES (?,?,?)',(hashlib.sha256(token.encode()).hexdigest(),csrf,int(time.time())+30*86400))
        return token,csrf
    def record(self,dex,media,source,identity,ticket=None,session=None):
        uuid.UUID(identity)
        entry={'id':identity,'species':dex['id'],'at':int(time.time()*1000),'media':media,'source':source,'dex':dex}
        with self.lock:
            self.db.execute('BEGIN IMMEDIATE')
            try:
                if ticket:
                    row=self.db.execute('SELECT session,expires,used FROM tickets WHERE token=?',(ticket,)).fetchone()
                    if not row or row[0]!=session or row[1]<time.time() or row[2]: raise core.Problem(409,'Este análisis ya se registró o caducó. Escanea de nuevo.')
                old=self.db.execute('SELECT body FROM encounters WHERE id=?',(identity,)).fetchone()
                if old:
                    self.db.execute('COMMIT');return json.loads(old[0])
                self.db.execute('INSERT INTO encounters VALUES (?,?,?,?)',(identity,dex['id'],entry['at'],dumps(entry)))
                if ticket: self.db.execute('UPDATE tickets SET used=1 WHERE token=?',(ticket,))
                self.db.execute('COMMIT');return entry
            except Exception:
                self.db.execute('ROLLBACK');raise
    def import_backup(self,backup):
        if backup.get('format')!='pokedex-roja' or backup.get('version')!=1 or not isinstance(backup.get('encounters'),list): raise core.Problem(400,'La copia no es compatible con Pokédex.')
        rows=backup['encounters']
        if len(rows)>10000: raise core.Problem(400,'La copia supera los 10 000 encuentros.')
        validated=[]
        for row in rows:
            try:
                uuid.UUID(row['id']);dex=row['dex'];national=int(row['species']);at=row['at']
                if not isinstance(at,int) or at<0 or at>time.time()*1000+86400000 or national<1 or national>=10000 or dex['id']!=national: raise ValueError()
                if not isinstance(dex['name'],str) or len(dex['name'])>200 or not isinstance(dex['types'],list) or not 1<=len(dex['types'])<=2 or any(t not in core.TYPES for t in dex['types']): raise ValueError()
                core.lookup(dex.get('pokemonSlug',dex['slug']));core.lookup(dex['slug']);core.apply_form(dex,dex.get('battleForm','none'),dex.get('teraType',''))
                validated.append((row,core.apply_form(dex)))
            except (ValueError,TypeError,KeyError,core.Problem): raise core.Problem(400,'La copia contiene un encuentro inválido. No se importó ningún registro.') from None
        inserted=0
        with self.lock:
            self.db.execute('BEGIN IMMEDIATE')
            try:
                for row,reference in validated:
                    result=self.db.execute('INSERT OR IGNORE INTO encounters VALUES (?,?,?,?)',(row['id'],row['species'],row['at'],dumps(row)))
                    inserted+=result.rowcount
                    self.cache('dex:'+reference.get('pokemonSlug',reference['slug']),reference)
                    if reference.get('pokemonSlug',reference['slug'])==reference['slug']:
                        self.cache('dex:'+reference['slug'],reference);self.cache('dex:'+str(reference['id']),reference)
                self.db.execute('COMMIT')
            except Exception: self.db.execute('ROLLBACK');raise
        return inserted

class App:
    def __init__(self,store):
        self.store=store;self.data=core.Data(store);self.chatgpt=chatgpt.Connection(store);self.login_attempts={};self.login_lock=threading.Lock();self.jobs={};self.jobs_lock=threading.Lock()
    def start_job(self,body,session):
        operation=body.get('operation');data=body.get('input')
        if operation not in ('recognize','encounters') or not isinstance(data,dict):raise core.Problem(400,'Operación de escaneo inválida.')
        identity=body.get('id') or str(uuid.uuid4())
        try:uuid.UUID(identity)
        except (ValueError,TypeError,AttributeError):raise core.Problem(400,'Identificador de análisis inválido.') from None
        fingerprint=hashlib.sha256(dumps({'operation':operation,'input':data}).encode()).hexdigest()
        now=time.time()
        with self.jobs_lock:
            self.jobs={k:v for k,v in self.jobs.items() if now-v['at']<600}
            old=self.jobs.get(identity)
            if old:
                if old['session']!=session or old['fingerprint']!=fingerprint:raise core.Problem(409,'El identificador pertenece a otro análisis.')
                return {'job':identity}
            pending=[j for j in self.jobs.values() if j['state']=='working']
            if any(j['session']==session for j in pending):raise core.Problem(409,'Ya hay un análisis en curso. Espera a que termine.')
            if len(pending)>=8:raise core.Problem(503,'Pokédex está ocupada. Espera un momento.')
            job={'state':'working','session':session,'at':now,'fingerprint':fingerprint};self.jobs[identity]=job
        def worker():
            try:result=self.post('/api/'+operation,data,session);out={'state':'done','result':result}
            except core.Problem as exc:out={'state':'failed','error':exc.message,'status':exc.status}
            except Exception:out={'state':'failed','error':'No se completó la operación. Comprueba el historial antes de repetir.','status':500}
            with self.jobs_lock:job.update(out)
        threading.Thread(target=worker,daemon=True).start()
        return {'job':identity}
    def job(self,identity,session):
        with self.jobs_lock:
            job=self.jobs.get(identity)
            if not job or job['session']!=session or time.time()-job['at']>=600:raise core.Problem(404,'El análisis ya no está disponible. Comprueba el historial antes de repetir.')
            return {k:v for k,v in job.items() if k not in ('session','at','fingerprint')}
    def login(self,ip,password,verify_only=False):
        if not isinstance(password,str) or len(password)>512: raise core.Problem(400,'Contraseña inválida.')
        with self.login_lock:
            attempts=[t for t in self.login_attempts.get(ip,[]) if time.time()-t<60]
            if len(attempts)>=5: raise core.Problem(429,'Espera un minuto antes de volver a iniciar sesión.')
            attempts.append(time.time());self.login_attempts[ip]=attempts
            if len(self.login_attempts)>1000: self.login_attempts={ip:attempts}
        return self.store.verify_password(password) if verify_only else self.store.login(password)
    def selected_dex(self,body):
        expected=body.get('species',0)
        if not isinstance(expected,int): raise core.Problem(400,'Especie inválida.')
        dex=self.data.dex(body.get('lookup',''),expected)
        return core.apply_form(dex,body.get('transformation','none'),body.get('teraType',''))
    def post(self,path,body,session):
        if path=='/api/scan-jobs':return self.start_job(body,session)
        if path=='/api/chatgpt/import':
            self.chatgpt.import_credentials(body);self.store.set('preferences',dict(self.store.get('preferences',{}),provider='chatgpt'));return self.store.settings()
        if path=='/api/chatgpt/models':
            self.chatgpt.models();return self.store.settings()
        if path=='/api/chatgpt/disconnect':
            # Disconnect locally; users revoke remote permission in ChatGPT settings.
            with self.chatgpt.lock:
                self.store.set('chatgpt_connection',None);self.store.set('chatgpt_models',[])
            return self.store.settings()
        if path=='/api/settings':
            old=self.store.get('preferences',{});out=dict(DEFAULTS,**old)
            for k in ('autoVoice','robot'):
                if k in body:
                    if not isinstance(body[k],bool): raise core.Problem(400,'Preferencia inválida.')
                    out[k]=body[k]
            for k,allowed in (('provider',('chatgpt','gemini','openrouter')),('voice',('Charon','Kore','Puck')),('game',core.CATALOG['games'])):
                if k in body:
                    if body[k] not in allowed: raise core.Problem(400,'Opción inválida.')
                    out[k]=body[k]
            if 'favorites' in body:
                favorites=body['favorites']
                if not isinstance(favorites,list) or len(favorites)>2000 or any(not isinstance(i,int) or not 0<i<10000 for i in favorites): raise core.Problem(400,'Favoritos inválidos.')
                out['favorites']=sorted(set(favorites))
            keys={}
            for k in ('gemini_key','openrouter_key','voice_key'):
                if body.get('clear_'+k): keys[k]=''
                elif body.get(k):
                    value=body[k]
                    if not isinstance(value,str) or not 10<=len(value.strip())<=2048 or any(c.isspace() for c in value.strip()): raise core.Problem(400,'La clave está incompleta o contiene espacios.')
                    keys[k]=value.strip()
            for k,v in keys.items(): self.store.set(k,v)
            if 'chatgptModel' in body:self.chatgpt.select_model(body['chatgptModel'])
            self.store.set('preferences',out);return self.store.settings()
        if path=='/api/password':
            self.login('password-change:'+session,body.get('current',''),verify_only=True)
            value=body.get('password','')
            if not isinstance(value,str) or not 12<=len(value)<=512: raise core.Problem(400,'Usa una contraseña de al menos 12 caracteres.')
            salt=secrets.token_bytes(16)
            with self.store.lock:
                self.store.set('password_salt',salt.hex());self.store.set('password_hash',password_hash(value,salt));self.store.db.execute('DELETE FROM sessions WHERE token!=?',(hashlib.sha256(session.encode()).hexdigest(),))
            initial=self.store.directory/'initial-password'
            if initial.exists(): initial.unlink()
            return {'ok':True}
        if path=='/api/logout':
            with self.store.lock: self.store.db.execute('DELETE FROM sessions WHERE token=?',(hashlib.sha256(session.encode()).hexdigest(),))
            return {'ok':True}
        if path=='/api/import': return {'inserted':self.store.import_backup(body)}
        if path=='/api/check-recognition':
            provider=self.store.settings()['provider'];key=self.store.get(provider+'_key')
            if provider=='chatgpt':
                models=self.chatgpt.models()
                return {'provider':'chatgpt','daily':None,'models':models,'message':'Conectado a tu plan de ChatGPT. No se envió una imagen ni se consumió un reconocimiento. Se aplican los límites de uso compartido de tu suscripción.'}
            if provider!='chatgpt' and not key: raise core.Problem(400,'Configura la clave de reconocimiento en Ajustes.')
            return core.recognition_access(provider,key)
        if path=='/api/recognize':
            image=body.get('image','')
            if not isinstance(image,str) or len(image)>2*1024*1024: raise core.Problem(413,'La imagen es demasiado grande.')
            try: raw=base64.b64decode(image,validate=True)
            except ValueError: raise core.Problem(400,'Imagen inválida.') from None
            if not raw.startswith(b'\xff\xd8\xff') or len(raw)<100: raise core.Problem(400,'Selecciona una imagen JPEG válida.')
            provider=self.store.settings()['provider'];key=self.store.get(provider+'_key')
            if provider!='chatgpt' and not key: raise core.Problem(400,'Configura la clave de reconocimiento en Ajustes.')
            # A provider's quota or cooldown must not block the other provider.
            # Ignore the old shared daily cap without deleting saved user data.
            scope='vision:'+provider
            self.store.reserve(scope,None,20)
            try: result=self.chatgpt.recognize(image) if provider=='chatgpt' else core.recognize(image,provider,key)
            except core.Problem as e:
                if e.status==429:self.store.pause(scope,e.retry_after or 60)
                raise
            ticket=secrets.token_urlsafe(24)
            with self.store.lock:
                self.store.db.execute('DELETE FROM tickets WHERE expires<?',(int(time.time()),))
                self.store.db.execute('INSERT INTO tickets VALUES (?,?,?,?,0)',(ticket,session,dumps(result),int(time.time())+300))
            return dict(result,ticket=ticket)
        if path=='/api/encounters':
            ticket=body.get('ticket');media='otro';source='manual'
            if ticket:
                with self.store.lock: row=self.store.db.execute('SELECT body,session,expires,used FROM tickets WHERE token=?',(ticket,)).fetchone()
                if not row or row[1]!=session or row[2]<time.time() or row[3]: raise core.Problem(409,'El análisis caducó o ya fue registrado.')
                result=json.loads(row[0]);index=body.get('candidate',0)
                if not isinstance(index,int) or not 0<=index<len(result['candidates']): raise core.Problem(400,'Candidato inválido.')
                candidate=result['candidates'][index]
                selected={'lookup':candidate['slug'],'species':candidate['id'],'transformation':candidate['transformation'],'teraType':candidate['teraType'] or body.get('teraType','')}
                media=result['media'];source='scan'
            else:
                selected=body;media=body.get('media','otro')
                if media not in ('peluche','figura','carta','videojuego','imagen','otro'): raise core.Problem(400,'Formato inválido.')
            dex=self.selected_dex(selected)
            identity=body.get('id') or str(uuid.uuid4())
            return self.store.record(dex,media,source,identity,ticket,session)
        if path.startswith('/api/encounters/'):
            identity=path.rsplit('/',1)[1];uuid.UUID(identity)
            with self.store.lock: row=self.store.db.execute('SELECT body FROM encounters WHERE id=?',(identity,)).fetchone()
            if not row: raise core.Problem(404,'El registro ya no existe.')
            entry=json.loads(row[0])
            if 'media' in body:
                if body['media'] not in ('peluche','figura','carta','videojuego','imagen','otro'): raise core.Problem(400,'Formato inválido.')
                entry['media']=body['media']
            if body.get('lookup'):
                dex=self.selected_dex(body);entry.update(dex=dex,species=dex['id'],source='corrected')
            with self.store.lock: self.store.db.execute('UPDATE encounters SET species=?,body=? WHERE id=?',(entry['species'],dumps(entry),identity))
            return entry
        if path=='/api/check-access':
            key=self.store.get('voice_key') or self.store.get('gemini_key')
            if not key: raise core.Problem(400,'Configura la clave de voz en Ajustes.')
            core.fetch_json('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1',headers={'x-goog-api-key':key})
            core.fetch_json('https://generativelanguage.googleapis.com/v1beta/models/'+core.VOICE_MODEL,headers={'x-goog-api-key':key})
            return {'ok':True,'message':'La clave y el modelo de voz están disponibles. La generación aún depende de tu cuota.'}
        if path=='/api/voice':
            game=body.get('game',self.store.settings()['game'])
            if game not in core.CATALOG['games']: raise core.Problem(400,'Videojuego inválido.')
            dex=self.selected_dex(body);text=core.narration(dex,game);voice=self.store.settings()['voice']
            cache_key='voice:'+hashlib.sha256((core.VOICE_MODEL+'|'+voice+'|'+text).encode()).hexdigest()
            cached=self.store.blob(cache_key)
            if cached:return cached
            key=self.store.get('voice_key') or self.store.get('gemini_key')
            if not key: raise core.Problem(400,'Configura tu clave de Gemini en Narración.')
            self.store.reserve('voice',40,5)
            try: raw=core.voice_response(core.fetch_json('https://generativelanguage.googleapis.com/v1beta/interactions',core.voice_payload(text,voice),{'x-goog-api-key':key}))
            except core.Problem as e:
                if e.status==429:self.store.pause('voice',e.retry_after or 60)
                raise
            self.store.save_blob(cache_key,raw,'audio/wav');return raw,'audio/wav'
        raise core.Problem(404,'La opción no existe.')

class Handler(BaseHTTPRequestHandler):
    protocol_version='HTTP/1.1'
    idle_timeout=30
    def setup(self):
        super().setup()
        self.connection.settimeout(self.idle_timeout)
    def log_message(self,format,*args): pass # No credentials, images, query strings or upstream bodies in logs.
    @property
    def app(self): return self.server.app
    def reply(self,status,value,mime='application/json',headers=None):
        raw=value if isinstance(value,bytes) else dumps(value).encode() if mime=='application/json' else str(value).encode()
        self.send_response(status);self.send_header('Content-Type',mime);self.send_header('Content-Length',str(len(raw)))
        if not headers or 'Cache-Control' not in headers:self.send_header('Cache-Control','no-store' if self.path.startswith('/api/') else 'no-cache')
        self.send_header('X-Content-Type-Options','nosniff');self.send_header('Referrer-Policy','no-referrer')
        self.send_header('Permissions-Policy','camera=(self), microphone=(), geolocation=()')
        self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'")
        if headers:
            for k,v in headers.items():self.send_header(k,v)
        self.end_headers()
        try:self.wfile.write(raw)
        except (BrokenPipeError,ConnectionResetError):pass
    def session(self):
        cookie=http.cookies.SimpleCookie()
        try:cookie.load(self.headers.get('Cookie',''));token=cookie[SESSION_COOKIE].value if SESSION_COOKIE in cookie else ''
        except http.cookies.CookieError:token=''
        csrf=self.app.store.session(token)
        if not csrf:raise core.Problem(401,'Inicia sesión para abrir tu Pokédex.',auth=True)
        return token,csrf
    def origin(self):
        origin=self.headers.get('Origin','');configured=os.environ.get('POKEDEX_BASE_URL','').rstrip('/')
        if configured:
            expected=urllib.parse.urlparse(configured).netloc
        else:expected=self.headers.get('Host','')
        parsed=urllib.parse.urlparse(origin)
        if not origin or parsed.scheme not in ('http','https') or parsed.netloc!=expected or parsed.path not in ('','/') or parsed.query or parsed.fragment or (configured and origin!=configured):raise core.Problem(403,'El origen de la solicitud no está autorizado.')
        return parsed.scheme
    def body(self):
        if self.headers.get_content_type()!='application/json':raise core.Problem(415,'Se necesitan datos JSON.')
        try:size=int(self.headers.get('Content-Length','0'))
        except ValueError:raise core.Problem(400,'Solicitud inválida.')
        if size<2 or size>25*1024*1024:raise core.Problem(413,'El archivo es demasiado grande.')
        self.connection.settimeout(30)
        try:result=json.loads(self.rfile.read(size))
        except (ValueError,UnicodeError):raise core.Problem(400,'Los datos no son válidos.') from None
        if not isinstance(result,dict):raise core.Problem(400,'Se necesita un objeto JSON.')
        return result
    def do_GET(self):
        try:
            parsed=urllib.parse.urlparse(self.path);path=parsed.path;query=urllib.parse.parse_qs(parsed.query)
            if path=='/health':return self.reply(200,{'ok':True,'version':'1.3.2'})
            if path.startswith('/api/'):
                session,csrf=self.session()
                if path.startswith('/api/scan-jobs/'):
                    return self.reply(200,self.app.job(path.rsplit('/',1)[1],session))
                if path=='/api/bootstrap':return self.reply(200,{'settings':self.app.store.settings(),'encounters':self.app.store.entries(),'csrf':csrf,'serverId':self.app.store.get('password_salt')})
                if path=='/api/export':return self.reply(200,{'format':'pokedex-roja','version':1,'exportedAt':int(time.time()*1000),'encounters':self.app.store.entries()})
                if path=='/api/dex':return self.reply(200,self.app.data.dex(query.get('q',[''])[0]))
                if path=='/api/wiki':return self.reply(200,self.app.data.wiki(clean_name(query.get('name',[''])[0])))
                if path=='/api/za-moves':return self.reply(200,self.app.data.za_moves(clean_name(query.get('name',[''])[0])))
                if path=='/api/asset':
                    url=query.get('url',[''])[0]
                    if not core.valid_asset(url):raise core.Problem(400,'Imagen o sonido no autorizado.')
                    key='asset:'+hashlib.sha256(url.encode()).hexdigest();cached=self.app.store.blob(key)
                    if not cached:
                        raw,mime=core.fetch(url,limit=4*1024*1024)
                        if url.endswith('.png'):
                            if not raw.startswith(b'\x89PNG\r\n\x1a\n'):raise core.Problem(502,'Imagen no compatible.')
                            mime='image/png'
                        else:
                            if not raw.startswith(b'OggS'):raise core.Problem(502,'Sonido no compatible.')
                            mime='audio/ogg'
                        cached=raw,mime;self.app.store.save_blob(key,raw,mime)
                    return self.reply(200,cached[0],cached[1],{'Cache-Control':'private, max-age=86400'})
                raise core.Problem(404,'La opción no existe.')
            name='index.html' if path=='/' else urllib.parse.unquote(path.lstrip('/'))
            target=(ROOT/'static'/name).resolve();static=(ROOT/'static').resolve()
            if not target.is_relative_to(static) or not target.is_file() or name.startswith('.'):
                raise core.Problem(404,'Archivo no encontrado.')
            mime=mimetypes.guess_type(str(target))[0] or 'application/octet-stream'
            if target.suffix in ('.js','.mjs'):mime='text/javascript'
            return self.reply(200,target.read_bytes(),mime)
        except core.Problem as e:self.reply(e.status,{'error':e.message,'auth':e.auth})
        except (ValueError,KeyError,TypeError):self.reply(400,{'error':'Solicitud inválida.'})
        except Exception:self.reply(500,{'error':'No se pudo completar la consulta. Tu historial se conserva.'})
    def do_POST(self):
        try:
            scheme=self.origin();body=self.body();path=urllib.parse.urlparse(self.path).path
            if path=='/api/login':
                token,csrf=self.app.login(self.client_address[0],body.get('password',''))
                secure=scheme=='https'
                return self.reply(200,{'csrf':csrf},'application/json',{'Set-Cookie':SESSION_COOKIE+'='+token+'; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000'+('; Secure' if secure else '')})
            session,csrf=self.session()
            if not hmac.compare_digest(self.headers.get('X-Pokedex-CSRF',''),csrf):raise core.Problem(403,'La sesión cambió. Vuelve a abrir Pokédex.')
            if path=='/api/chatgpt/import' and scheme!='https':raise core.Problem(400,'La conexión de ChatGPT solo se importa por HTTPS con un certificado de confianza.')
            result=self.app.post(path,body,session)
            if isinstance(result,tuple):return self.reply(200,result[0],result[1])
            return self.reply(200,result,headers={'Set-Cookie':SESSION_COOKIE+'=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'} if path=='/api/logout' else None)
        except core.Problem as e:self.reply(e.status,{'error':e.message,'auth':e.auth})
        except (ValueError,KeyError,TypeError):self.reply(400,{'error':'Solicitud inválida.'})
        except Exception:self.reply(500,{'error':'No se pudo completar la operación. Comprueba el historial antes de repetir.'})
    def do_DELETE(self):
        try:
            self.origin();session,csrf=self.session()
            if not hmac.compare_digest(self.headers.get('X-Pokedex-CSRF',''),csrf):raise core.Problem(403,'La sesión cambió.')
            match=re.fullmatch(r'/api/encounters/([a-f0-9-]{36})',urllib.parse.urlparse(self.path).path)
            if not match:raise core.Problem(404,'El registro no existe.')
            uuid.UUID(match[1])
            with self.app.store.lock:self.app.store.db.execute('DELETE FROM encounters WHERE id=?',(match[1],))
            self.reply(200,{'ok':True})
        except core.Problem as e:self.reply(e.status,{'error':e.message,'auth':e.auth})
        except Exception:self.reply(400,{'error':'No se pudo eliminar el registro.'})

def clean_name(name):
    if not isinstance(name,str) or not 1<=len(name)<=100 or any(c in name for c in '<>\r\n/'):raise core.Problem(400,'Nombre inválido.')
    return name

def make_server(store,host='127.0.0.1',port=0):
    server=ThreadingHTTPServer((host,port),Handler);server.daemon_threads=True;server.app=App(store);return server

if __name__=='__main__':
    directory=os.environ.get('POKEDEX_DATA_DIR')
    if not directory or not Path(directory).is_absolute():raise SystemExit('Define POKEDEX_DATA_DIR con una ruta absoluta de almacenamiento.')
    store=Store(directory,os.environ.get('POKEDEX_PASSWORD'))
    server=make_server(store,os.environ.get('POKEDEX_BIND','127.0.0.1'),int(os.environ.get('POKEDEX_PORT','8765')))
    print(f'Pokédex disponible en http://{server.server_address[0]}:{server.server_address[1]}',flush=True)
    print('Contraseña inicial: archivo initial-password en el volumen privado, salvo contraseña configurada por entorno.',flush=True)
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:server.server_close();store.db.close()
