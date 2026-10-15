// thIAguinho recovery service worker
// thiaguinho-auto-v1.6.0
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

self.addEventListener("fetch",event=>{
  const req=event.request;
  if(req.method!=="GET") return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin) return;

  event.respondWith(
    fetch(req,{cache:"no-store"}).catch(()=>{
      if(req.mode==="navigate"){
        return new Response(
          "<!doctype html><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>thIAguinho</title><body style='font-family:system-ui;background:#07111f;color:#fff;padding:24px'><h2>Sem conexão</h2><p>Verifique a internet e tente novamente.</p></body>",
          {status:503,headers:{"Content-Type":"text/html; charset=utf-8"}}
        );
      }
      return new Response("",{status:503,statusText:"Offline"});
    })
  );
});

self.addEventListener("message",event=>{
  if(event.data && event.data.type==="SKIP_WAITING") self.skipWaiting();
});
