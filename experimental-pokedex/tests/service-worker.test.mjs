import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../static/sw.js',import.meta.url),'utf8');
function worker({paths=['/'],broken=false}={}){
 const listeners={},deleted=[],navigated=[];let unregistered=0,skipped=0;
 const scope={URL,location:{origin:'https://umbrel.test'},
  self:{addEventListener:(name,fn)=>listeners[name]=fn,skipWaiting:async()=>{skipped++;},registration:{unregister:async()=>{unregistered++;}},
   clients:{matchAll:async()=>paths.map(path=>({url:'https://umbrel.test'+path,navigate:async url=>{navigated.push(url);if(broken&&path==='/')throw Error('closed');}}))}},
  caches:{keys:async()=>['pokedex-shell-v1.2.0','pokedex-shell-v1.3.1','pokedex-assets-v1','unrelated-app'],delete:async key=>{deleted.push(key);if(broken&&key.includes('1.2.0'))throw Error('locked');}}};
 vm.runInNewContext(source,scope);
 return {listeners,deleted,navigated,get unregistered(){return unregistered;},get skipped(){return skipped;},async fire(name){let pending;listeners[name]({waitUntil:value=>pending=value});await pending;}};
}
test('no fetch handler can substitute saved HTML for health, API or worker requests',()=>{assert.equal(worker().listeners.fetch,undefined);});
test('migration immediately replaces the old worker without precaching another interface',async()=>{const h=worker();await h.fire('install');assert.equal(h.skipped,1);assert.deepEqual(h.deleted,[]);});
test('migration deletes only owned shell and artwork caches and unregisters',async()=>{const h=worker();await h.fire('activate');assert.deepEqual(h.deleted,['pokedex-shell-v1.2.0','pokedex-shell-v1.3.1','pokedex-assets-v1']);assert.equal(h.unregistered,1);});
test('old open home reloads from Umbrel and preserves its query',async()=>{const h=worker({paths:['/?game=red','/index.html']});await h.fire('activate');assert.deepEqual(h.navigated,['https://umbrel.test/?game=red&v=1.3.2','https://umbrel.test/index.html?v=1.3.2']);});
test('current release never enters a migration reload loop',async()=>{const h=worker({paths:['/?v=1.3.2','/index.html?v=1.3.2']});await h.fire('activate');assert.deepEqual(h.navigated,[]);});
test('migration does not navigate API, diagnostic or unrelated pages',async()=>{const h=worker({paths:['/health','/api/bootstrap','/missing']});await h.fire('activate');assert.deepEqual(h.navigated,[]);});
test('one locked cache or closed tab does not prevent migration of other clients',async()=>{const h=worker({paths:['/','/index.html'],broken:true});await h.fire('activate');assert.equal(h.unregistered,1);assert.equal(h.navigated.length,2);});
