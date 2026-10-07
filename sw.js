const MIGRATION_VERSION="1.4.0";
const TARGET="/MECANICO/app-v134.html?v=1.4.0&fresh=";
const MIGRATION_HTML='<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#07111f"><title>Atualizando thIAguinho</title><style>html,body{margin:0;min-height:100%;background:#07111f;color:#edf5ff;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}main{min-height:100dvh;display:grid;place-items:center;padding:24px;text-align:center}.spin{width:44px;height:44px;margin:0 auto 16px;border:4px solid #173a5a;border-top-color:#31d7ff;border-radius:50%;animation:s .8s linear infinite}@keyframes s{to{transform:rotate(360deg)}}h1{font-size:1.25rem;margin:0 0 8px}p{color:#9fb0c3;margin:0}</style></head><body><main><div><div class="spin"></div><h1>Atualizando o chat</h1><p>Removendo a versão antiga…</p></div></main><script>(async()=>{try{if("serviceWorker" in navigator){const r=await navigator.serviceWorker.getRegistrations();await Promise.all(r.map(x=>x.unregister()));}if("caches" in window){const k=await caches.keys();await Promise.all(k.map(x=>caches.delete(x)));}}catch(e){}location.replace("'+TARGET+'"+Date.now());})();<\/script></body></html>';

self.addEventListener("install",event=>{
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate",event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener("fetch",event=>{
  const req=event.request;
  if(req.method!=="GET") return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin) return;

  if(req.mode==="navigate"){
    event.respondWith(new Response(MIGRATION_HTML,{
      headers:{
        "Content-Type":"text/html; charset=utf-8",
        "Cache-Control":"no-store"
      }
    }));
    return;
  }

  event.respondWith(fetch(req,{cache:"no-store"}));
});
