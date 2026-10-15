// thIAguinho minimal install service worker v1.6.2
// Intencionalmente sem interceptar requisições: mantém o PWA instalável sem risco de ERR_FAILED.
self.addEventListener("install",event=>{
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate",event=>{
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message",event=>{
  if(event.data && event.data.type==="SKIP_WAITING") self.skipWaiting();
});
