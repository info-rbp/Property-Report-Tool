const CACHE = 'proinspect-shell-v2';
const SHELL = ['/manifest.webmanifest', '/proinspect-icon.svg'];

async function precacheApplication() {
  const cache = await caches.open(CACHE);
  await cache.addAll(SHELL);
  try {
    const response = await fetch('/', { credentials: 'include', cache: 'reload' });
    if (!response.ok) return;
    const html = await response.text();
    await cache.put('/', new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }));
    const assetPaths = Array.from(html.matchAll(/(?:src|href)="([^"]+)"/g))
      .map((match) => match[1])
      .filter((path) => path.startsWith('/') && !path.startsWith('/api/'));
    await Promise.all(assetPaths.map((path) => cache.add(path).catch(() => undefined)));
  } catch {
    // The existing cache remains usable if refresh fails.
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheApplication());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put('/', copy));
          }
          return response;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
      }
      return response;
    }))
  );
});
