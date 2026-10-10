// Retire the cached interface for clients installed before 1.3.2.
// New clients load directly from Umbrel and do not register a worker.
const RELEASE='1.3.2';
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 const keys=await caches.keys();
 await Promise.allSettled(keys.filter(key=>key.startsWith('pokedex-shell-')||key==='pokedex-assets-v1').map(key=>caches.delete(key)));
 await self.registration.unregister();
 const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
 await Promise.allSettled(clients.map(client=>{
  const url=new URL(client.url);
  if(url.origin!==location.origin||!['/','/index.html'].includes(url.pathname)||url.searchParams.get('v')===RELEASE)return;
  url.searchParams.set('v',RELEASE);
  return client.navigate(url.href);
 }));
})()));
