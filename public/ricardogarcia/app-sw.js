// Service worker da app «Missão»: guarda o esqueleto para abrir sem rede; a API vai sempre à rede.
const V = 'missao-v11'
const BASE = ['/ricardogarcia/app', '/ricardogarcia/app.webmanifest', '/ricardogarcia/app-icones/192.png', '/ricardogarcia/app-emblema.png', '/ricardogarcia/fontes/Anton.ttf', '/ricardogarcia/fontes/Oswald.ttf', '/ricardogarcia/fontes/Kalam.ttf']
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(BASE)).then(() => self.skipWaiting())) })
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== V).map(x => caches.delete(x)))).then(() => self.clients.claim())) })
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url)
  if (e.request.method !== 'GET' || u.origin !== location.origin || !BASE.includes(u.pathname)) return
  e.respondWith(fetch(e.request).then(r => { if (r.ok && BASE.includes(u.pathname)) { const c = r.clone(); caches.open(V).then(x => x.put(u.pathname, c)) } return r })
    .catch(() => caches.match(u.pathname).then(r => r || caches.match('/ricardogarcia/app'))))
})

// Notificações push (FCM web push, só com «data»): mostra-as aqui com o emblema da app.
self.addEventListener('push', e => {
  let d = {}
  try { const j = e.data ? e.data.json() : {}; d = j.data || j } catch (_) { d = { corpo: e.data ? e.data.text() : '' } }
  const titulo = d.titulo || 'Missão', url = d.url || '/ricardogarcia/app'
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    // Com a app aberta à frente, a própria app toca o som e mostra o aviso.
    const vis = cs.find(c => c.visibilityState === 'visible' && new URL(c.url).pathname.startsWith('/ricardogarcia/app'))
    if (vis) { vis.postMessage({ tipo: 'push', dados: d }); return }
    return self.registration.showNotification(titulo, { body: d.corpo || '', icon: '/ricardogarcia/app-icones/192.png', badge: '/ricardogarcia/app-icones/192.png', tag: d.tag || 'missao', renotify: true, vibrate: [60, 40, 60, 40, 160], data: { url } })
  }))
})
self.addEventListener('notificationclick', e => {
  e.notification.close()
  const url = (e.notification.data && e.notification.data.url) || '/ricardogarcia/app'
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    const c = cs.find(x => new URL(x.url).pathname.startsWith('/ricardogarcia/app'))
    if (c) { c.postMessage({ tipo: 'abrir', url }); return c.focus() }
    return self.clients.openWindow(url)
  }))
})
