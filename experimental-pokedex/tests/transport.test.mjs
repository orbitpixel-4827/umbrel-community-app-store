import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {request,pollJob} from '../static/transport.mjs';
import {verify} from '../connect-chatgpt.mjs';

test('startup GET recovers one network failure without posting an image',async()=>{
 const old=globalThis.fetch;let count=0;globalThis.fetch=async()=>{if(++count===1)throw TypeError('network');return new Response('{"ok":true}',{headers:{'Content-Type':'application/json'}});};
 try{assert.deepEqual((await request('/api/bootstrap')).data,{ok:true});assert.equal(count,2);}finally{globalThis.fetch=old;}
});
test('POST is never replayed on a lost connection',async()=>{
 const old=globalThis.fetch;let count=0;globalThis.fetch=async()=>{count++;throw TypeError('network');};
 try{await assert.rejects(request('/api/scan-jobs',{method:'POST'}),e=>e.connection===true);assert.equal(count,1);}finally{globalThis.fetch=old;}
});
test('gateway login HTML does not become a cached API success',async()=>{
 const old=globalThis.fetch;globalThis.fetch=async()=>new Response('<html>Umbrel login</html>',{headers:{'Content-Type':'text/html'}});
 try{await assert.rejects(request('/api/bootstrap'),e=>e.gateway===true&&!e.connection);}finally{globalThis.fetch=old;}
});
test('provider quota is an HTTP response, not a lost Umbrel connection',async()=>{
 const old=globalThis.fetch;globalThis.fetch=async()=>new Response('{"error":"quota"}',{status:429,headers:{'Content-Type':'application/json'}});
 try{const result=await request('/api/recognize',{method:'POST'});assert.equal(result.response.status,429);assert.equal(result.data.error,'quota');}finally{globalThis.fetch=old;}
});
test('a suspended request times out instead of leaving startup spinning',async()=>{
 const old=globalThis.fetch;globalThis.fetch=(_url,init)=>new Promise((_,reject)=>init.signal.addEventListener('abort',()=>reject(Object.assign(Error(),{name:'AbortError'})),{once:true}));
 try{await assert.rejects(request('/api/bootstrap',{}, {timeout:5,retries:0}),/tardó demasiado/);}finally{globalThis.fetch=old;}
});
test('a fetch that ignores abort still reaches the deadline',async()=>{
 const old=globalThis.fetch;globalThis.fetch=()=>new Promise(()=>{});
 try{await assert.rejects(request('/api/bootstrap',{}, {timeout:5,retries:0}),/tardó demasiado/);}finally{globalThis.fetch=old;}
});
test('a body that stalls after headers still reaches the deadline',async()=>{
 const old=globalThis.fetch;globalThis.fetch=async()=>({ok:true,status:200,headers:new Headers({'Content-Type':'application/json'}),json:()=>new Promise(()=>{})});
 try{await assert.rejects(request('/api/bootstrap',{}, {timeout:5,retries:0}),/tardó demasiado/);}finally{globalThis.fetch=old;}
});
test('cancellation interrupts a body that ignores abort without replaying a POST',async()=>{
 const old=globalThis.fetch,signal=new AbortController();let calls=0;
 globalThis.fetch=async()=>{calls++;return {ok:true,status:200,headers:new Headers({'Content-Type':'application/json'}),json:()=>{signal.abort();return new Promise(()=>{});}};};
 try{await assert.rejects(request('/api/scan-jobs',{method:'POST'},{signal:signal.signal}),e=>e.name==='AbortError');assert.equal(calls,1);}finally{globalThis.fetch=old;}
});
test('an already cancelled scan never sends the image',async()=>{
 const old=globalThis.fetch,signal=new AbortController();let calls=0;signal.abort();globalThis.fetch=async()=>{calls++;};
 try{await assert.rejects(request('/api/scan-jobs',{method:'POST'},{signal:signal.signal}),e=>e.name==='AbortError');assert.equal(calls,0);}finally{globalThis.fetch=old;}
});
test('HTTP server errors do not masquerade as transport outages or proxy login',async()=>{
 const old=globalThis.fetch;globalThis.fetch=async()=>new Response('Unavailable',{status:503,headers:{'Content-Type':'text/html'}});
 try{await assert.rejects(request('/api/bootstrap'),e=>e.server===true&&e.status===503&&!e.connection&&!e.gateway);}finally{globalThis.fetch=old;}
});
test('live session fetch bypasses the browser HTTP cache',async()=>{
 const old=globalThis.fetch;let cache;globalThis.fetch=async(_url,init)=>{cache=init.cache;return new Response('{}',{headers:{'Content-Type':'application/json'}});};
 try{await request('/api/bootstrap');assert.equal(cache,'no-store');}finally{globalThis.fetch=old;}
});
test('job polling survives a lost reply and never starts a new recognition',async()=>{
 let count=0;const paths=[];
 const result=await pollJob('existing-job',async path=>{paths.push(path);if(++count===2)throw Object.assign(Error('network'),{connection:true});return count<4?{state:'working'}:{state:'done',result:{species:5}};},{pause:async()=>{}});
 assert.deepEqual(result,{species:5});assert.equal(paths.length,4);assert.ok(paths.every(path=>path==='/api/scan-jobs/existing-job'));
});
test('a job quota failure cannot be shown as success or retried as inference',async()=>{
 let count=0;await assert.rejects(pollJob('job',async()=>{count++;return {state:'failed',error:'ChatGPT quota',status:429};},{pause:async()=>{}}),e=>e.status===429);assert.equal(count,1);
});
test('a disconnected job retains its ID for safe recovery',async()=>{
 await assert.rejects(pollJob('pending-job',async()=>{throw Object.assign(Error('offline'),{connection:true});},{pause:async()=>{}}),e=>e.job==='pending-job');
});
test('desktop helper validates signed identity before saving credentials',()=>{
 const {publicKey,privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});const jwk=publicKey.export({format:'jwk'});const keys={keys:[{...jwk,kid:'fixture',alg:'RS256',use:'sig'}]};
 const claims={iss:'https://auth.openai.com',aud:'oaiapp_fixture',sub:'account',nonce:'expected',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600};
 const h=Buffer.from(JSON.stringify({alg:'RS256',kid:'fixture'})).toString('base64url'),b=Buffer.from(JSON.stringify(claims)).toString('base64url'),token=h+'.'+b+'.'+crypto.sign('RSA-SHA256',Buffer.from(h+'.'+b),privateKey).toString('base64url');
 assert.equal(verify(token,'oaiapp_fixture',keys,{nonce:'expected'}).sub,'account');
 for(const opts of [{nonce:'wrong'},{subject:'wrong'}])assert.throws(()=>verify(token,'oaiapp_fixture',keys,opts),/verificar/);
 assert.throws(()=>verify(token,'wrong-client',keys),/verificar/);assert.throws(()=>verify(token.slice(0,-12)+'bad','oaiapp_fixture',keys),/verificar/);
});
