// Firebase Cloud Messaging Service Worker
// Este arquivo DEVE estar em /public/firebase-messaging-sw.js

importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js')

// Configuração do Firebase (mesma do firebase-config.ts)
const firebaseConfig = {
  apiKey: "AIzaSyAbBVqaEziU-OnSt0obMx_HsgBRJqSubNY",
  authDomain: "mtm-push-notifications-fdbf1.firebaseapp.com",
  projectId: "mtm-push-notifications-fdbf1",
  storageBucket: "mtm-push-notifications-fdbf1.firebasestorage.app",
  messagingSenderId: "978304341617",
  appId: "1:978304341617:web:1312656f10990a496bedd0",
  measurementId: "G-QLZDCMXLLF"
}

// Inicializar Firebase
firebase.initializeApp(firebaseConfig)

// Obter instância do messaging
const messaging = firebase.messaging()

// Handler para mensagens em background
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Mensagem recebida em background:', payload)
  
  const notificationTitle = payload.notification?.title || 'MTM Notification'
  const notificationOptions = {
    body: payload.notification?.body || '',
    icon: payload.notification?.icon || '/logo-new.png',
    badge: '/icon-32x32.png',
    tag: payload.data?.tag || 'mtm-notification',
    data: payload.data,
    requireInteraction: false,
    vibrate: [200, 100, 200],
    actions: [
      {
        action: 'view',
        title: 'Ver',
        icon: '/icon-32x32.png'
      },
      {
        action: 'close',
        title: 'Fechar',
        icon: '/icon-32x32.png'
      }
    ]
  }

  self.registration.showNotification(notificationTitle, notificationOptions)
})

// Handler para cliques em notificações
self.addEventListener('notificationclick', (event) => {
  console.log('[firebase-messaging-sw.js] Notificação clicada:', event)
  
  event.notification.close()
  
  // Obter URL de destino
  const urlToOpen = event.notification.data?.url || '/app-mobile'
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Verificar se já existe uma janela aberta
        for (const client of clientList) {
          if (client.url.includes(urlToOpen) && 'focus' in client) {
            return client.focus()
          }
        }
        // Se não, abrir nova janela
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen)
        }
      })
  )
})

