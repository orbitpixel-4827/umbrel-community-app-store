// One-time desktop sign-in. All private output goes to the explicit external path.
// No packages, browser automation, home-directory files or paid API key.
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const issuer='https://auth.openai.com',resource='https://api.openai.com/v1';
const direct='chatgpt.tokens.use.direct';
const random=()=>crypto.randomBytes(32).toString('base64url');
async function json(url,body){
 const response=await fetch(url,{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(30000),...(body?{headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(body)}:{})});
 if(!response.ok)throw Error('OpenAI no completó la autorización (HTTP '+response.status+'). Repite el inicio de sesión.');
 return response.json();
}
export function verify(token,audience,keys,{nonce,subject}={}){
 try{
  const [head,body,sig,...extra]=token.split('.');if(extra.length||token.length>32768)throw Error();
  const header=JSON.parse(Buffer.from(head,'base64url')),claims=JSON.parse(Buffer.from(body,'base64url'));
  if(header.alg!=='RS256'||header.crit)throw Error();
  const matches=keys.keys.filter(k=>k.kid===header.kid&&k.kty==='RSA'&&(!k.use||k.use==='sig')&&(!k.alg||k.alg==='RS256'));
  if(matches.length!==1||!crypto.verify('RSA-SHA256',Buffer.from(head+'.'+body),crypto.createPublicKey({key:matches[0],format:'jwk'}),Buffer.from(sig,'base64url')))throw Error();
  const now=Date.now()/1000,aud=Array.isArray(claims.aud)?claims.aud:[claims.aud];
  if(claims.iss!==issuer||!aud.includes(audience)||(aud.length>1&&claims.azp!==audience)||!Number.isFinite(claims.exp)||!Number.isFinite(claims.iat)||claims.exp<now-5||claims.iat>now+5||(claims.nbf||0)>now+5||typeof claims.sub!=='string'||!claims.sub||(nonce!==undefined&&claims.nonce!==nonce)||(subject!==undefined&&claims.sub!==subject))throw Error();
  return claims;
 }catch{throw Error('No se pudo verificar la identidad de ChatGPT. No se guardaron credenciales.');}
}
export async function connect(output){
 const root=path.dirname(fileURLToPath(import.meta.url));
 if(!output||!path.isAbsolute(output))throw Error('Indica una ruta absoluta en el disco externo.');output=path.resolve(output);
 if(!output.startsWith(root+path.sep)||!root.startsWith('/Volumes/'))throw Error('Indica --output con una ruta absoluta dentro del proyecto autorizado en el disco externo.');
 await fs.mkdir(path.dirname(output),{recursive:true,mode:0o700});
 const realRoot=await fs.realpath(root),realDirectory=await fs.realpath(path.dirname(output));
 if(!realDirectory.startsWith(realRoot+path.sep))throw Error('La carpeta de salida debe estar dentro del proyecto en el disco externo.');
 for(const candidate of [output,path.join(path.dirname(output),'chatgpt-host.json')]){try{if((await fs.lstat(candidate)).isSymbolicLink())throw Error('No se permiten enlaces simbólicos para las credenciales.');}catch(e){if(e.code!=='ENOENT')throw e;}}
 // Retain this desktop host identity across attempts; it is never imported over Umbrel's.
 const identityFile=path.join(path.dirname(output),'chatgpt-host.json');let local;
 try{local=JSON.parse(await fs.readFile(identityFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw Error('No se pudo leer la identidad local.');local={host:'urn:uuid:'+crypto.randomUUID()};await fs.writeFile(identityFile,JSON.stringify(local),{mode:0o600,flag:'wx'});}
 let previous;try{previous=JSON.parse(await fs.readFile(output,'utf8'));}catch(e){if(e.code!=='ENOENT')throw Error('El archivo de conexión existente no se puede leer.');}
 const state=random(),nonce=random(),verifier=random();let finish;
 const callback=new Promise(resolve=>finish=resolve);
 const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname!=='/auth/callback'||req.method!=='GET'){res.writeHead(404);res.end();return;}
  if(req.headers.host!=='127.0.0.1:'+server.address().port||url.searchParams.get('state')!==state){res.writeHead(400);res.end('Autorización inválida.');return;}
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'"});res.end('<h1>Pokédex</h1><p>Puedes cerrar esta ventana y volver a Pokédex. La computadora terminará de verificar la conexión.</p>');finish(url.searchParams);
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const redirect='http://127.0.0.1:'+server.address().port+'/auth/callback';
 const params=new URLSearchParams({client_id:previous?.client_id||'dynamic_agent_client',ext_agent_host_id:local.host,response_type:'code',redirect_uri:redirect,scope:'openid profile email offline_access resource.invoke '+direct,resource,state,nonce,code_challenge_method:'S256',code_challenge:crypto.createHash('sha256').update(verifier).digest('base64url')});
 if(!previous)params.set('agent_name_hint','Pokédex');
 console.log('Abre esta dirección en el navegador INTERNO de Codex en esta computadora:');console.log(issuer+'/api/accounts/authorize?'+params);
 let timer;
 try{
  const query=await Promise.race([callback,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('La autorización caducó. Puedes volver a iniciarla.')),10*60*1000);})]);
  if(query.get('error'))throw Error('No se autorizó el uso de ChatGPT. No se cambió la conexión anterior.');
  const client=query.get('client_id')||previous?.client_id;
  if(!client||client==='dynamic_agent_client'||!/^oaiapp_[A-Za-z0-9_-]+$/.test(client)||(previous&&client!==previous.client_id)||!query.get('code'))throw Error('La autorización no devolvió el cliente esperado.');
  const tokens=await json(issuer+'/api/accounts/oauth/token',{grant_type:'authorization_code',client_id:client,code:query.get('code'),code_verifier:verifier,redirect_uri:redirect,resource});
  const keys=await json(issuer+'/.well-known/jwks.json');
  const account=verify(tokens.id_token,client,keys,{nonce,subject:previous?.subject});
  const access=verify(tokens.access_token,resource,keys,{subject:account.sub});
  if(access.client_id!==client||!tokens.scope?.split(' ').includes(direct)||!access.scope?.split(' ').includes(direct)||tokens.token_type?.toLowerCase()!=='bearer'||!tokens.refresh_token)throw Error('No se autorizó usar tu plan de ChatGPT.');
  const record={format:'pokedex-chatgpt-v1',client_id:client,subject:account.sub,email:account.email||'',nonce,ext_agent_host_id:local.host,id_token:tokens.id_token,access_token:tokens.access_token,refresh_token:tokens.refresh_token,token_type:tokens.token_type};
  const temporary=output+'.'+random()+'.new';await fs.writeFile(temporary,JSON.stringify(record),{mode:0o600,flag:'wx'});await fs.rename(temporary,output);await fs.chmod(output,0o600);
  console.log('Conexión verificada. En Pokédex → Ajustes → Reconocimiento → ChatGPT Plus, importa el archivo: '+output);
  console.log('Después de importarlo, Umbrel renovará la conexión. No compartas ni publiques este archivo.');
 }finally{clearTimeout(timer);await new Promise(resolve=>server.close(resolve));}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);if(args.length!==2||args[0]!=='--output'){console.error('Uso: node connect-chatgpt.mjs --output /Volumes/SSD/.../private/chatgpt-connection.json');process.exitCode=1;}
 else await connect(args[1]).catch(()=>{console.error('No se completó la conexión. Revisa que autorizaste el uso del plan y vuelve a ejecutar el asistente. No se muestran credenciales ni detalles privados.');process.exitCode=1;});
}
