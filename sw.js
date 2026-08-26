const CACHE='slh-v3.1.0-auth';
const CORE=['./','./index.html','./css/app.css','./js/app.js','./js/auth-gate.js','./js/db.js','./js/search.js','./js/metadata.js','./js/cloud.js','./manifest.webmanifest','./icons/icon.svg'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;
  const url=new URL(event.request.url);

  if(event.request.mode==='navigate'){
    event.respondWith(
      fetch(event.request,{cache:'no-store'})
        .then(response=>{
          if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put('./index.html',copy));}
          return response;
        })
        .catch(()=>caches.match('./index.html'))
    );
    return;
  }

  if(url.origin===location.origin && (url.pathname.endsWith('.js') || url.pathname.endsWith('.css'))){
    event.respondWith(
      fetch(event.request,{cache:'no-store'})
        .then(response=>{
          if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));}
          return response;
        })
        .catch(()=>caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached=>cached || fetch(event.request).then(response=>{
      if(response.ok && url.origin===location.origin){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));}
      return response;
    }))
  );
});
