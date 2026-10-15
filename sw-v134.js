// thIAguinho PWA service worker
const CACHE="thiaguinho-auto-v1.6.0";
const STATIC=[
  "./app-v134.html?v=1.6.0",
  "./index.html?v=1.6.0",
  "./css/app.css?v=1.6.0",
  "./js/app.js?v=1.6.0",
  "./js/firebase.js?v=1.6.0",
  "./js/media.js?v=1.6.0",
  "./js/knowledge-remote.js?v=1.6.0",
  "./data/knowledge.js?v=1.6.0",
  "./manifest-v134.json?v=1.6.0",
  "./assets/icon-thIAguinho.svg?v=1.6.0",
  "./assets/icon-192.png?v=1.6.0",
  "./assets/icon-512.png?v=1.6.0",
  "./assets/logo-thIAguinho.svg?v=1.6.0",
  "./assets/mascote-thIAguinho.webp?v=1.6.0",
  "./assets/mascote-thIAguinho-hero.png?v=1.6.0",
  "./assets/mascote-thIAguinho-avatar.png?v=1.6.0"
];

async function putSafe(cache,key,response){
  try{
    if(response && response.ok) await cache.put(key,response.clone());
  }catch(e){}
}

self.addEventListener("install",event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    for(const url of STATIC){
      try{
        const res=await fetch(url,{cache:"reload"});
        await putSafe(cache,url,res);
      }catch(e){}
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate",event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch",event=>{
  const req=event.request;
  if(req.method!=="GET") return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin) return;

  if(req.mode==="navigate"){
    event.respondWith((async()=>{
      try{
        const res=await fetch(req,{cache:"no-store"});
        if(res && res.ok){
          const cache=await caches.open(CACHE);
          await putSafe(cache,req,res);
        }
        return res;
      }catch(e){
        return (await caches.match(req)) ||
               (await caches.match("./app-v134.html?v=1.6.0")) ||
               (await caches.match("./index.html?v=1.6.0")) ||
               new Response("thIAguinho indisponível temporariamente.",{
                 status:503,
                 headers:{"Content-Type":"text/plain; charset=utf-8"}
               });
      }
    })());
    return;
  }

  const critical=/\/(?:index\.html|app-v134\.html|css\/app\.css|js\/(?:app|knowledge-remote)\.js)$/.test(url.pathname);
  if(critical){
    event.respondWith((async()=>{
      try{
        const res=await fetch(req,{cache:"no-store"});
        if(res && res.ok){
          const cache=await caches.open(CACHE);
          await putSafe(cache,req,res);
        }
        return res;
      }catch(e){
        return (await caches.match(req)) ||
               new Response("",{status:503,statusText:"Offline"});
      }
    })());
    return;
  }

  event.respondWith((async()=>{
    const hit=await caches.match(req);
    if(hit) return hit;
    try{
      const res=await fetch(req);
      if(res && res.ok){
        const cache=await caches.open(CACHE);
        await putSafe(cache,req,res);
      }
      return res;
    }catch(e){
      return new Response("",{status:503,statusText:"Offline"});
    }
  })());
});

self.addEventListener("message",event=>{
  if(event.data && event.data.type==="SKIP_WAITING") self.skipWaiting();
});
