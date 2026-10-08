import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as D from '../static/domain.mjs';

// Exercise the actual browser handlers with controlled iOS states and time.
const source=fs.readFileSync(new URL('../static/app.mjs',import.meta.url),'utf8');
const fragment=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end));
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function clock(){
 let now=100000,id=0;const tasks=new Map();
 return {Date:{now:()=>now},setTimeout(fn,delay){tasks.set(++id,{fn,at:now+delay});return id;},clearTimeout(i){tasks.delete(i);},
  async advance(ms){const until=now+ms;while(true){const item=[...tasks].filter(([,t])=>t.at<=until).sort((a,b)=>a[1].at-b[1].at)[0];if(!item)break;now=item[1].at;tasks.delete(item[0]);item[1].fn();await settle();}now=until;await settle();},get pending(){return tasks.size;}};
}
function audioHarness(session={type:'auto'}){
 const time=clock(),contexts=[],order=[];
 class Context {
  state='suspended';sampleRate=24000;destination={};sources=[];resumeCalls=0;
  constructor(){contexts.push(this);order.push('context:'+session?.type);}
  async resume(){this.resumeCalls++;this.state='running';}
  createBuffer(channels,length,sampleRate){return {numberOfChannels:channels,length,sampleRate,copyToChannel(){},getChannelData(){return new Float32Array(length);}};}
  createBufferSource(){const node={playbackRate:{value:1},connect(){},disconnect(){},start(){node.started=true;},stop(){node.stopped=true;}};this.sources.push(node);return node;}
  async decodeAudioData(){return this.createBuffer(1,240,24000);}
 }
 const scope={window:{AudioContext:Context},navigator:session?{audioSession:session}:{},D,...time};
 const audio=vm.runInNewContext(fragment('const audio=','async function speak')+'\naudio;',scope);
 return {audio,contexts,order,time,session};
}
test('home-screen playback selects the playback session before creating the context',async()=>{
 const h=audioHarness();const pending=h.audio.unlock();assert.equal(h.session.type,'playback');assert.deepEqual(h.order,['context:playback']);assert.equal(h.contexts[0].sources[0].started,true);await pending;
 assert.equal(await h.audio.play(new ArrayBuffer(4)),true);assert.equal(h.audio.node.started,true);assert.equal(h.audio.node.playbackRate.value,1.12);
});
test('audio still works in browsers without AudioSession API',async()=>{
 const h=audioHarness(null);await h.audio.unlock();assert.equal(await h.audio.play(new ArrayBuffer(4),false,1),true);
});
test('audio resumes after a camera interruption before playback',async()=>{
 const h=audioHarness();await h.audio.unlock();h.audio.ctx.state='interrupted';assert.equal(await h.audio.play(new ArrayBuffer(4)),true);assert.equal(h.audio.ctx.resumeCalls,2);
});
test('an interrupted decoder is resumed before starting the sound',async()=>{
 const h=audioHarness();await h.audio.unlock();h.audio.ctx.decodeAudioData=async()=>{h.audio.ctx.state='interrupted';return h.audio.ctx.createBuffer(1,240,24000);};await h.audio.play(new ArrayBuffer(4));assert.equal(h.audio.ctx.resumeCalls,2);assert.equal(h.audio.node.started,true);
});
test('a closed audio context is replaced on the next tap',async()=>{
 const h=audioHarness();await h.audio.unlock();h.audio.ctx.state='closed';await h.audio.unlock();assert.equal(h.contexts.length,2);assert.equal(h.audio.ctx.state,'running');
});
test('navigation cancels audio that is still being decoded',async()=>{
 const h=audioHarness();await h.audio.unlock();let finish;h.audio.ctx.decodeAudioData=()=>new Promise(r=>finish=r);const pending=h.audio.play(new ArrayBuffer(4));await settle();h.audio.stop();finish(h.audio.ctx.createBuffer(1,240,24000));assert.equal(await pending,false);assert.equal(h.audio.node,null);
});
test('blocked audio reports an error instead of leaving the test button waiting forever',async()=>{
 const h=audioHarness();await h.audio.unlock();h.audio.ctx.state='suspended';h.audio.ctx.resume=()=>new Promise(()=>{});const result=h.audio.unlock();const check=assert.rejects(result,/audio está bloqueado/);await h.time.advance(3000);await check;assert.equal(h.time.pending,0);
});
function cameraHarness(){
 const time=clock(),messages=[],analyses=[],video={videoWidth:1280,videoHeight:960,async play(){}},stream={getTracks:()=>[{stop(){}}]};
 const scope={...time,Promise,Error,window:{isSecureContext:true},navigator:{mediaDevices:{getUserMedia:async()=>stream}},document:{hidden:false,createElement:()=>({getContext:()=>({drawImage(){}}),toDataURL:()=> 'data:image/jpeg;base64,frame'})},audio:{unlock:async()=>{}},view:{page:'camera'},epoch:1,lastScan:100000,scanBusy:false,cameraStream:stream,scanTimer:null,controller:null,
  $:q=>q==='#camera'?video:{textContent:''},toast:m=>messages.push(m),cameraStatus:m=>messages.push(m),analyze:async image=>analyses.push(image),go(next){scope.stopCamera();scope.view=next;scope.epoch++;},chooseImage(){},renderCamera(){}};
 vm.createContext(scope);
 vm.runInContext(fragment('function stopCamera()','function go(')+fragment('async function openCamera()','function chooseImage('),scope);
 return {scope,time,messages,analyses,video};
}
test('reopening the scanner during cooldown automatically analyzes when the wait ends',async()=>{
 const h=cameraHarness();await h.scope.openCamera();await h.time.advance(3500);assert.equal(h.analyses.length,0);assert.match(h.messages.at(-1),/empezará automáticamente/);await h.time.advance(16499);assert.equal(h.analyses.length,0);await h.time.advance(1);assert.deepEqual(h.analyses,['frame']);assert.equal(h.time.pending,0);
});
test('repeated scan taps cannot accumulate requests during cooldown',async()=>{
 const h=cameraHarness();await h.scope.capture();await h.scope.capture();assert.equal(h.time.pending,1);await h.time.advance(20000);assert.equal(h.analyses.length,1);
});
test('leaving the camera cancels the delayed analysis',async()=>{
 const h=cameraHarness();await h.scope.openCamera();await h.time.advance(3500);h.scope.stopCamera();h.scope.epoch++;h.scope.view={page:'home'};await h.time.advance(20000);assert.equal(h.analyses.length,0);assert.equal(h.time.pending,0);
});
test('the scanner retries when Safari has not supplied its first video frame yet',async()=>{
 const h=cameraHarness();h.scope.lastScan=0;h.video.videoWidth=0;await h.scope.capture();assert.equal(h.analyses.length,0);h.video.videoWidth=1280;await h.time.advance(500);assert.equal(h.analyses.length,1);
});
test('an audio activation error does not block the live camera',async()=>{
 const h=cameraHarness();h.scope.lastScan=0;h.scope.audio.unlock=async()=>{throw Error('audio bloqueado');};await h.scope.openCamera();await h.time.advance(3500);assert.equal(h.analyses.length,1);assert.ok(h.messages.includes('audio bloqueado'));
});
