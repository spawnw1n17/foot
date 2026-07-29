'use strict';
const CACHE='aurora-flight-v5';
const CORE=['./','index.html','styles.css','skins.css','data.js','app.js','map.js','flight.js','controls.js','skins.js','assets/uav-skins.svg','manifest.webmanifest','icon.svg'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);if(u.hostname==='tile.openstreetmap.org'){e.respondWith(caches.open(CACHE).then(async c=>{const hit=await c.match(e.request);try{const fresh=await fetch(e.request);if(fresh.ok)c.put(e.request,fresh.clone());return fresh}catch{return hit||new Response('',{status:503})}}));return}
  if(e.request.method==='GET')e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r}).catch(()=>caches.match('./'))))
});
