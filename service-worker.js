'use strict';
const VERSION='0.5.0';
const REVISION='r3';
const CACHE=`boke-training-v${VERSION}-${REVISION}`;
const ASSET_QUERY=`?v=${VERSION}-${REVISION}`;
const CONFIG_PATH='./research/judge-criteria.json';
const SHELL=['./','./index.html','./validation.html',`./style.css${ASSET_QUERY}`,`./enhancements.css${ASSET_QUERY}`,`./validation.css${ASSET_QUERY}`,`./scoring-core.js${ASSET_QUERY}`,`./stock-library.js${ASSET_QUERY}`,`./pwa-ui.js${ASSET_QUERY}`,`./game.js${ASSET_QUERY}`,`./validation.js${ASSET_QUERY}`,`./manifest.webmanifest${ASSET_QUERY}`,CONFIG_PATH,'./research/validation-set.json','./assets/icon-192.png','./assets/icon-512.png','./assets/offline-realworld-1.webp','./assets/offline-realworld-2.webp','./assets/offline-realworld-3.webp','./assets/offline-realworld-4.webp','./assets/offline-realworld-5.webp'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);if(url.origin!==self.location.origin)return;
  if(url.pathname.endsWith('/research/judge-criteria.json')){
    event.respondWith(fetch(event.request,{cache:'no-store'}).then(response=>{if(!response.ok)throw new Error('config update failed');const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(CONFIG_PATH,copy));return response}).catch(()=>caches.match(CONFIG_PATH)));return;
  }
  if(event.request.mode==='navigate'){
    const fallback=url.pathname.endsWith('/validation.html')?'./validation.html':'./index.html';event.respondWith(fetch(event.request).then(response=>response.ok?response:Promise.reject(new Error('navigation failed'))).catch(()=>caches.match(fallback)));return;
  }
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));
});
