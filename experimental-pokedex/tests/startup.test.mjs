import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../static/app.mjs',import.meta.url),'utf8');
const fragment=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end));
function session(){
 const calls=[],s={csrf:'old',settings:{},entries:[{id:'stale'}],bootstrapReady:false,offline:false,
  request:async(path,init)=>{calls.push({path,init});return {response:{ok:true,status:200},data:{csrf:'current',settings:{game:'red-blue'},encounters:[{id:'server'}]}};},
  cached(){throw Error('Session must not touch IndexedDB');},clearCache:async()=>{},go(){},showOffline(){},pauseReconnect(){},queueReconnect(){}};
 vm.createContext(s);vm.runInContext(fragment('async function api(','function showOffline()')+fragment('async function refresh()','function pauseReconnect()'),s);
 return {s,calls};
}
test('bootstrap loads current server encounters and CSRF without accessing cached credentials',async()=>{
 const h=session();await h.s.refresh();assert.equal(h.s.csrf,'current');assert.equal(h.s.entries[0].id,'server');assert.equal(h.calls.length,1);
});
test('failed bootstrap cannot open a cached collection with an obsolete session',async()=>{
 const h=session();h.s.request=async()=>{throw Object.assign(Error('network'),{connection:true});};
 await assert.rejects(h.s.refresh(),/network/);assert.equal(h.s.csrf,'old');assert.equal(h.s.offline,false);
});
test('a malformed bootstrap never clears a connection failure or becomes a valid session',async()=>{
 const h=session();h.s.offline=true;h.s.request=async()=>({response:{ok:true},data:{csrf:'',settings:{},encounters:[]}});
 await assert.rejects(h.s.refresh(),/sesión válida/);assert.equal(h.s.offline,true);assert.equal(h.s.csrf,'old');
});
test('expired session clears local state and opens sign in instead of loading a cached session',async()=>{
 const h=session(),pages=[];h.s.go=v=>pages.push(v.page);h.s.request=async()=>({response:{ok:false,status:401},data:{auth:true,error:'Sign in'}});
 await assert.rejects(h.s.refresh(),e=>e.status===401);assert.equal(h.s.csrf,'');assert.equal(h.s.entries.length,0);assert.deepEqual(pages,['login']);
});
test('optional audio storage cannot block indefinitely when IndexedDB is unavailable',async()=>{
 const s={setTimeout:(fn)=>setTimeout(fn,5),clearTimeout,db:()=>new Promise(()=>{})};vm.createContext(s);
 vm.runInContext(fragment('async function storageTask(','async function clearCache()'),s);
 assert.equal(await s.cached('voice:fixture'),undefined);
});
function startup(){
 const timers=new Map(),pages=[],s={bootstrapReady:false,view:{page:'home'},document:{hidden:false},navigator:{},window:{},catalog:null,chart:null,app:{innerHTML:''},E:x=>x,on(){},pauseReconnect(){},queueReconnect(){},go:v=>pages.push(v.page),
  request:async()=>({data:{}}),refresh:async()=>{},setTimeout:(fn)=>{const id=timers.size+1;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id)};
 vm.createContext(s);vm.runInContext(fragment('let booting=','window.addEventListener(\'pageshow\''),s);
 return {s,timers,pages};
}
test('cold start retries a temporary network failure and opens only after live bootstrap',async()=>{
 const h=startup();let calls=0;h.s.refresh=async()=>{if(++calls===1)throw Object.assign(Error('network'),{connection:true});};
 await h.s.boot();assert.deepEqual(h.pages,[]);assert.equal(h.timers.size,1);await [...h.timers.values()][0]();
 assert.deepEqual(h.pages,['home']);assert.equal(h.timers.size,0);assert.equal(h.s.bootstrapReady,true);
});
test('simultaneous resume events share one cold start',async()=>{
 const h=startup();let finish,calls=0;h.s.refresh=()=>{calls++;return new Promise(r=>finish=r);};const a=h.s.boot(),b=h.s.boot();await new Promise(r=>setImmediate(r));assert.equal(calls,1);finish();await Promise.all([a,b]);assert.deepEqual(h.pages,['home']);
});
test('cold start does not continually retry a proxy sign-in page',async()=>{
 const h=startup();h.s.refresh=async()=>{throw Object.assign(Error('proxy login'),{gateway:true});};await h.s.boot();assert.equal(h.timers.size,0);assert.ok(h.s.app.innerHTML.includes('proxy login'));assert.equal(h.s.bootstrapReady,false);
});
test('new client unregisters only its legacy worker without installing another',async()=>{
 const h=startup(),removed=[];h.s.navigator.serviceWorker={getRegistrations:async()=>[
  {active:{scriptURL:'https://umbrel.test/sw.js'},unregister:async()=>removed.push('pokedex')},
  {active:{scriptURL:'https://umbrel.test/other/sw.js'},unregister:async()=>removed.push('other')}
 ]};h.s.location={origin:'https://umbrel.test'};h.s.URL=URL;await h.s.retireLegacyWorker();assert.deepEqual(removed,['pokedex']);
});

test('foreground event preserves a sign-in form already open',async()=>{const h=startup();h.s.view={page:'login'};h.s.app.innerHTML='password draft';await h.s.boot();assert.equal(h.s.app.innerHTML,'password draft');assert.equal(h.pages.length,0);});
