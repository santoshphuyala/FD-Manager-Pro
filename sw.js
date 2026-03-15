const CACHE_NAME = 'fd-manager-pro-cache-v1';
// Add all the files you want to cache for offline use
const URLS_TO_CACHE = [
  '/',
  'index.html',
  'css/styles.css',
  'js/utils.js',
  'js/ocr-enhanced.js',
  'js/dataManager.js',
  'js/ai-features.js',
  'js/combined.js',
  // Add paths to your icons (from manifest.json)
  'images/icon-192x192.png',
  'images/icon-512x512.png',
  'images/icon-maskable-192x192.png',
  'images/icon-maskable-512x512.png',
  // Add external libraries if you want to cache them
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.0/font/bootstrap-icons.css',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js@3.9.1/dist/chart.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/tesseract.js@4.0.2/dist/tesseract.min.js'
];

// Install event: cache all the files
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(URLS_TO_CACHE);
      })
      .catch((err) => {
        console.error('Failed to open cache', err);
      })
  );
});

// Fetch event: serve from cache first, then network
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse; // Cache hit
        }

        // Cache miss — fetch from network
        return fetch(event.request).then((networkResponse) => {
          if (
            networkResponse &&
            networkResponse.status === 200 &&
            (networkResponse.type === 'basic' || networkResponse.type === 'cors')
          ) {
            const responseToCache = networkResponse.clone();
            cache.put(event.request, responseToCache).catch((err) => {
              console.error('Cache put error:', err);
            });
          }
          return networkResponse;
        }).catch((error) => {
          console.error('Network fetch error:', error);
          return new Response('Network error: ' + error.message, {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/plain' }
          });
        });
      });
    })
  );
});

// Activate event: clean up old caches
self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});