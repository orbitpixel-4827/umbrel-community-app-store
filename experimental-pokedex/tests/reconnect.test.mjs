import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../static/app.mjs',import.meta.url),'utf8');
const fragment=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end));
const settle=()=>new Promise(r=>setImmediate(r));
function harness(){
 let now=100000,id=0;const tasks=new Map(),calls=[],scheduled=[],messages=[];
 const s={Date:{now:()=>now},setTimeout(fn,delay){tasks.set(++id,{fn,at:now+delay});return id;},clearTimeout(i){tasks.delete(i);},
  document:{hidden:false},view:{page:'settings'},epoch:1,offline:true,offlineReason:'Sin red',reconnectTimer:null,reconnecting:null,bootstrapReady:true,reconnectAttempts:0,lastReconnect:0,reconnectBlocked:false,cameraNeedsConnection:false,
  pendingScan:null,scanBusy:false,cameraStream:null,scanTimer:null,lastScan:0,controller:null,csrf:'',settings:{},entries:[],AbortController,
  async api(path,body,options){calls.push({path,body,options});return {csrf:'fresh',settings:{voice:'Charon'},encounters:[{id:'one'}]};},
  showOffline(){},cameraStatus:m=>messages.push(m),toast:m=>messages.push(m),scheduleScan:(token,delay)=>scheduled.push({token,delay}),
  $:()=>({classList:{add(){},remove(){}}}),sheet(){},note:v=>v,primary:v=>v};
 vm.createContext(s);vm.runInContext(fragment('function pauseReconnect()','const audio='),s);
 return {s,calls,scheduled,messages,tasks,async advance(ms){now+=ms;const due=[...tasks].filter(([,t])=>t.at<=now);for(const [i,t]of due){tasks.delete(i);t.fn();}await settle();}};
}
test('foreground session probes bypass offline cache and preserve the current screen',async()=>{
 const h=harness(),form=h.s.view;form.draft='unsaved';assert.equal(await h.s.recoverConnection(),true);
 assert.equal(h.calls[0].path,'/api/bootstrap');assert.equal(h.s.csrf,'fresh');assert.equal(h.s.view,form);assert.equal(form.draft,'unsaved');
});
test('simultaneous foreground events share a single connection probe',async()=>{
 const h=harness();let finish;h.s.api=()=>{h.calls.push('probe');return new Promise(r=>finish=r);};
 const a=h.s.recoverConnection(),b=h.s.recoverConnection(true);assert.equal(h.calls.length,1);
 finish({csrf:'fresh',settings:{},encounters:[]});assert.equal(await a,true);assert.equal(await b,true);
});
test('network failures retry with capped backoff while visible',async()=>{
 const h=harness();h.s.api=async()=>{throw Object.assign(Error('network'),{connection:true});};
 await h.s.recoverConnection();assert.equal(h.tasks.size,1);for(let i=0;i<8;i++)await h.advance(30000);
 assert.equal(h.tasks.size,1);assert.equal(h.s.reconnectAttempts,9);
});
test('hidden apps cancel probes scheduled for recovery',async()=>{
 const h=harness();h.s.queueReconnect();h.s.document.hidden=true;h.s.pauseReconnect();await h.advance(30000);assert.equal(h.calls.length,0);assert.equal(await h.s.recoverConnection(true),false);
});
test('proxy login responses stop the automatic retry loop but allow an explicit retry',async()=>{
 const h=harness();h.s.api=async()=>{throw Object.assign(Error('proxy login'),{gateway:true});};
 await h.s.recoverConnection();assert.equal(h.s.reconnectBlocked,true);assert.equal(h.tasks.size,0);
 h.s.api=async()=>({csrf:'fresh',settings:{},encounters:[]});assert.equal(await h.s.recoverConnection(true),true);
});
test('a stale connection probe cannot replace a newer screen session',async()=>{
 const h=harness();let finish;h.s.api=()=>new Promise(r=>finish=r);const pending=h.s.recoverConnection();h.s.epoch++;
 finish({csrf:'stale',settings:{},encounters:[]});assert.equal(await pending,false);assert.equal(h.s.csrf,'');
});
test('a live camera waiting for preflight recovery schedules exactly one scan',async()=>{
 const h=harness();Object.assign(h.s,{view:{page:'camera'},cameraStream:{},cameraNeedsConnection:true});await h.s.recoverConnection();await h.s.recoverConnection(true);
 assert.deepEqual(h.scheduled,[{token:1,delay:3500}]);assert.equal(h.s.cameraNeedsConnection,false);
});
test('recovery never starts another scan over a pending server job',async()=>{
 const h=harness();Object.assign(h.s,{view:{page:'camera'},cameraStream:{},cameraNeedsConnection:true,pendingScan:{id:'existing'}});await h.s.recoverConnection();assert.equal(h.scheduled.length,0);
});
function analysisHarness(){
 const h=harness();Object.assign(h.s,{view:{page:'camera'},cameraStream:{},offline:false,refresh:async()=>{},scanJob:async()=>({candidates:[]})});
 vm.runInContext(fragment('async function analyze(','async function saveScan('),h.s);return h;
}
test('failed connection preflight sends no image and enables safe automatic recovery',async()=>{
 const h=analysisHarness();let sent=0;h.s.refresh=async()=>{throw Object.assign(Error('network'),{connection:true});};h.s.scanJob=async()=>{sent++;};
 await h.s.analyze('frame');assert.equal(sent,0);assert.equal(h.s.cameraNeedsConnection,true);assert.equal(h.tasks.size,1);assert.equal(h.s.scanBusy,false);
});
test('a lost response after submission preserves the job without scheduling a fresh image',async()=>{
 const h=analysisHarness();h.s.scanJob=async()=>{h.s.pendingScan={id:'same-job'};throw Object.assign(Error('network'),{connection:true});};
 await h.s.analyze('frame');assert.equal(h.s.cameraNeedsConnection,false);assert.equal(h.s.pendingScan.id,'same-job');assert.equal(h.tasks.size,0);
});
test('provider quota errors do not trigger recognition retries',async()=>{
 const h=analysisHarness();h.s.scanJob=async()=>{throw Object.assign(Error('quota'),{status:429});};await h.s.analyze('frame');assert.equal(h.s.cameraNeedsConnection,false);assert.equal(h.tasks.size,0);
});
test('leaving the scanner during preflight prevents the image from being sent',async()=>{
 const h=analysisHarness();let sent=0;h.s.refresh=async()=>{h.s.epoch++;h.s.view={page:'home'};};h.s.scanJob=async()=>{sent++;};await h.s.analyze('frame');assert.equal(sent,0);
});
