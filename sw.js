const MIGRATION_VERSION="1.6.2";

self.addEventListener("install",event=>{
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate",event=>{
  event.waitUntil((async()=>{
    try{
      const keys=await caches.keys();
      await Promise.all(keys.filter(k=>k.startsWith("thiaguinho-auto-")).map(k=>caches.delete(k)));
    }catch(e){}
    await self.clients.claim();
    try{await self.registration.unregister();}catch(e){}
  })());
});
