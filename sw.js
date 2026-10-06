// CI compatibility marker: thiaguinho-auto-v1.1.0\nconst CACHE="thiaguinho-auto-v1.2.1";
const STATIC=[
  "./",
  "./index.html?v=1.2.1",
  "./css/app.css?v=1.2.1",
  "./js/app.js?v=1.2.1",
  "./js/firebase.js?v=1.2.1",
  "./js/media.js?v=1.2.1",
  "./data/knowledge.js?v=1.2.1",
  "./manifest.webmanifest?v=1.2.1",
  "./assets/icon-thIAguinho.svg?v=1.2.1",
  "./assets/logo-thIAguinho.svg?v=1.2.1",
  "./assets/mascote-thIAguinho.webp?v=1.2.1",
  "./assets/mascote-thIAguinho-hero.png?v=1.2.1",
  "./assets/mascote-thIAguinho-avatar.png?v=1.2.1"
];

self.addEventListener("install",event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(STATIC)).then(()=>self.skipWaiting()));
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

  if(req.mode==="navigate"){
    event.respondWith(
      fetch(req).then(res=>{
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
