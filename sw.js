const CACHE_NAME = 'shanyuan-v21';
const ASSETS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/css/components.css',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // 💡 網路優先策略：線上時總是優先抓取最新網頁程式碼，斷網時才降級讀取本地快取
  e.respondWith(
    fetch(e.request)
      .catch(() => caches.match(e.request).then(cached => cached || caches.match('/index.html')))
  );
});
