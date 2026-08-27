const CACHE='slh-v5.5.0-auto-cloud-sync';
const CORE=[
  './','./index.html','./css/app.css','./css/performance-v51.css','./css/card-v12.css','./css/nav-v5.css','./css/premium-v51.css','./css/smooth-v52.css','./css/neo-v54.css',
  './js/app.js','./js/nav-v5.js','./js/instant-save-v9.js','./js/auth-gate.js','./js/db.js','./js/search.js','./js/metadata.js','./js/metadata-v9.js','./js/metadata-repair.js','./js/card-v12.js','./js/auto-cloud-sync.js','./js/smooth-v52.js','./js/interaction-v53.js','./js/analytics-v53.js','./js/neo-v54.js','./js/shortcuts-v51.js','./js/cloud.js',
  './manifest.webmanifest','./icons/icon.svg'
];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(event.request.mode==='navigate'){
    event.respondWith(fetch(event.request,{cache:'no-store'}).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put('./index.html',copy))}return response}).catch(()=>caches.match('./index.html')));return;
  }
  if(url.origin===location.origin&&(url.pathname.endsWith('.js')||url.pathname.endsWith('.css')||url.pathname.endsWith('.webmanifest'))){
    event.respondWith(fetch(event.request,{cache:'no-store'}).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy))}return response}).catch(()=>caches.match(event.request)));return;
  }
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{if(response.ok&&url.origin===location.origin){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy))}return response})));
});