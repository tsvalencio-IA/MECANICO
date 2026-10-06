const CACHE="thiaguinho-auto-v1.0.0";
const STATIC=[
  "./",
  "./index.html",
  "./css/app.css",
  "./js/app.js",
  "./js/firebase.js",
  "./js/media.js",
  "./data/knowledge.js",
  "./manifest.webmanifest",
  "./assets/icon-thIAguinho.svg",
  "./assets/logo-thIAguinho.svg",
  "./assets/mascote-thIAguinho.webp"
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