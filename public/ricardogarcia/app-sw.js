// Service worker da app «Missão»: guarda o esqueleto para abrir sem rede; a API vai sempre à rede.
const V = 'missao-v5'
const BASE = ['/ricardogarcia/app', '/ricardogarcia/app.webmanifest', '/ricardogarcia/app-icones/192.png', '/ricardogarcia/app-emblema.png', '/ricardogarcia/fontes/Anton.ttf', '/ricardogarcia/fontes/Oswald.ttf', '/ricardogarcia/fontes/Kalam.ttf']
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(BASE)).then(() => self.skipWaiting())) })
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== V).map(x => caches.delete(x)))).then(() => self.clients.claim())) })
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url)
  if (e.request.method !== 'GET' || u.origin !== location.origin || !BASE.includes(u.pathname)) return
  e.respondWith(fetch(e.request).then(r => { if (r.ok && BASE.includes(u.pathname)) { const c = r.clone(); caches.open(V).then(x => x.put(u.pathname, c)) } return r })
    .catch(() => caches.match(u.pathname).then(r => r || caches.match('/ricardogarcia/app'))))
})
