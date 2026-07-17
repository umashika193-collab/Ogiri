'use strict';
const VERSION='0.1.0';
const REVISION='r9';
const CACHE=`boke-training-v${VERSION}-${REVISION}`;
const ASSET_QUERY=`?v=${VERSION}-${REVISION}`;
const SHELL=['./','./index.html',`./style.css${ASSET_QUERY}`,`./enhancements.css${ASSET_QUERY}`,`./scoring-core.js${ASSET_QUERY}`,`./pwa-ui.js${ASSET_QUERY}`,`./game.js${ASSET_QUERY}`,`./manifest.webmanifest${ASSET_QUERY}`,'./assets/icon-192.png','./assets/icon-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);if(url.origin!==self.location.origin)return;
  if(event.request.mode==='navigate'){
    event.respondWith(fetch(event.request).then(response=>response.ok?response:Promise.reject(new Error('navigation failed'))).catch(()=>caches.match('./index.html')));return;
  }
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));
});
