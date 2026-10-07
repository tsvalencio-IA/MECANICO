// CI compatibility marker: thiaguinho-auto-v1.1.0\nconst CACHE="thiaguinho-auto-v1.5.0";
const STATIC=[
  "./app-v134.html?v=1.5.0",
  "./index.html?v=1.5.0",
  "./css/app.css?v=1.5.0",
  "./js/app.js?v=1.5.0",
  "./js/firebase.js?v=1.5.0",
  "./js/media.js?v=1.5.0",
  "./data/knowledge.js?v=1.5.0",
  "./manifest-v134.json?v=1.5.0",
  "./assets/icon-thIAguinho.svg?v=1.5.0",
  "./assets/icon-192.png?v=1.5.0",
  "./assets/icon-512.png?v=1.5.0",
  "./assets/logo-thIAguinho.svg?v=1.5.0",
  "./assets/mascote-thIAguinho.webp?v=1.5.0",
  "./assets/mascote-thIAguinho-hero.png?v=1.5.0",
  "./assets/mascote-thIAguinho-avatar.png?v=1.5.0"
];

self.addEventListener("install",event=>{
  event.waitUntil(caches.open(CACHE).then(async cache=>{for(const url of STATIC){try{await cache.add(url);}catch(e){console.warn("[SW cache]",url,e);}}}).then(()=>self.skipWaiting()));
});

self.addEventListener("activate",event=>{
  event.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener("fetch",event=>{
  const req=event.request;
  if(req.method!=="GET")return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin)return;

  const criticalShell=/\/(?:index\.html|css\/app\.css|js\/app\.js)$/.test(url.pathname);
  if(criticalShell){
    event.respondWith(
      fetch(req,{cache:"no-store"}).then(res=>{
        if(res&&res.ok){const copy=res.clone();caches.open(CACHE).then(c=>c.put(req,copy));}
        return res;
      }).catch(()=>caches.match(req))
    );
    return;
  }

  if(req.mode==="navigate"){
    event.respondWith(
      fetch(req,{cache:"no-store"}).then(res=>{
        const copy=res.clone();caches.open(CACHE).then(c=>c.put("./index.html",copy));return res;
      }).catch(()=>caches.match("./index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(hit=>hit||fetch(req).then(res=>{
      if(res&&res.ok){
        const copy=res.clone();caches.open(CACHE).then(c=>c.put(req,copy));
      }
      return res;
    }))
  );
});

self.addEventListener("message",event=>{
  if(event.data && event.data.type==="SKIP_WAITING") self.skipWaiting();
});
