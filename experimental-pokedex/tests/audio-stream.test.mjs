import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {narrationStream} from '../static/audio-stream.mjs';
import {createRobotFilter} from '../static/domain.mjs';
const source=fs.readFileSync(new URL('../static/app.mjs',import.meta.url),'utf8');
const fragment=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b));
const encoder=new TextEncoder();
const pcm=Buffer.from([0,64,0,192]).toString('base64');
const audio=JSON.stringify({type:'audio',rate:24000,pcm})+'\n';
const done='{"type":"done"}\n';
function response(parts){return new Response(new ReadableStream({start(c){for(const p of parts)c.enqueue(encoder.encode(p));c.close();}}),{headers:{'Content-Type':'application/x-ndjson'}});}
test('streams split packets as PCM before the response is complete',async()=>{
 let enqueue,finish;const received=[];
 const body=new ReadableStream({start(c){enqueue=v=>c.enqueue(encoder.encode(v));finish=()=>c.close();}});
 const running=narrationStream({},'csrf',{fetcher:async()=>new Response(body,{headers:{'Content-Type':'application/x-ndjson'}}),onPCM:async p=>received.push([...p])});
 enqueue(audio.slice(0,15));enqueue(audio.slice(15));await new Promise(r=>setImmediate(r));
 assert.deepEqual(received,[[.5,-.5]]);enqueue(done);finish();await running;
});
test('provider errors stay readable and a truncated stream is never successful',async()=>{
 await assert.rejects(narrationStream({},'',{fetcher:async()=>response([audio]),onPCM(){}}),/cortó/);
 await assert.rejects(narrationStream({},'',{fetcher:async()=>response(['{"type":"error","message":"Cuota de API"}\n']),onPCM(){}}),/Cuota de API/);
});
test('voice POST is same-origin, includes CSRF, and never exposes a provider token',async()=>{
 let request;await narrationStream({lookup:'pikachu'},'session-csrf',{fetcher:async(url,init)=>{request={url,...init};return response([done]);},onPCM(){}});
 assert.equal(request.url,'/api/voice-stream');assert.equal(request.credentials,'same-origin');assert.equal(request.headers['X-Pokedex-CSRF'],'session-csrf');assert.equal(request.headers.Authorization,undefined);
});
test('a failed voice request is not retried',async()=>{
 let calls=0;await assert.rejects(narrationStream({},'',{fetcher:async()=>{calls++;return new Response('{"error":"Clave no autorizada"}',{status:401});},onPCM(){}}),/Clave no autorizada/);assert.equal(calls,1);
});
test('metallic processing is identical across packet boundaries',()=>{
 const input=Float32Array.from({length:9000},(_,i)=>.4*Math.sin(i/12));
 const whole=createRobotFilter(24000)(input),filter=createRobotFilter(24000),joined=new Float32Array(input.length);
 joined.set(filter(input.slice(0,1700)));joined.set(filter(input.slice(1700)),1700);assert.deepEqual(joined,whole);
 assert.ok(whole.every(v=>Math.abs(v)<=.94));assert.ok(whole.some((v,i)=>Math.abs(v-input[i])>.1));
});
function favorites(saved=[25]){
 const button={outerHTML:''};const scope={settings:{favorites:saved},view:{page:'detail',dex:{id:25}},epoch:1,icon:()=>'<svg/>',$:()=>button,toast(){},api:async(_path,body)=>({favorites:body.favorites})};
 vm.createContext(scope);vm.runInContext(fragment('function favoriteButton(','function renderDetail()'),scope);return {scope,button};
}
test('saved favorites have a filled red heart and accessible selected state',()=>{
 const h=favorites();assert.match(h.scope.favoriteButton(25),/is-favorite/);assert.match(h.scope.favoriteButton(25),/aria-pressed="true"/);assert.doesNotMatch(h.scope.favoriteButton(6),/is-favorite/);
});
test('toggling a favorite immediately updates the visible button after saving',async()=>{
 const h=favorites([]);await h.scope.toggleFavorite();assert.match(h.button.outerHTML,/is-favorite/);assert.match(h.button.outerHTML,/aria-pressed="true"/);
 await h.scope.toggleFavorite();assert.doesNotMatch(h.button.outerHTML,/is-favorite/);assert.match(h.button.outerHTML,/aria-pressed="false"/);
});
test('a failed save never marks an unsaved favorite as selected',async()=>{
 const h=favorites([]);h.scope.api=async()=>{throw Error('network');};await assert.rejects(h.scope.toggleFavorite(),/network/);assert.equal(h.scope.settings.favorites.length,0);assert.equal(h.button.outerHTML,'');
});
test('favorites filter combines with search and type, and can return to the full collection',()=>{
 const target={innerHTML:'',classList:{remove(){},add(){}}};
 const scope={view:{query:'pika',type:'electric',favorites:true},settings:{favorites:[25]},entries:[], $:()=>target,D:{collection:(_entries,q,t)=>{assert.equal(q,'pika');assert.equal(t,'electric');return [{id:'p',species:25},{id:'r',species:26}];}},tile:e=>e.id,bindArtwork(){}};
 vm.createContext(scope);vm.runInContext(fragment('function updateGrid()','function renderStats()'),scope);
 scope.updateGrid();assert.equal(target.innerHTML,'p');scope.view.favorites=false;scope.updateGrid();assert.equal(target.innerHTML,'pr');
});
