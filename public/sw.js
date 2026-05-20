// ─── Academic Risk — Service Worker ──────────────────────────────────────────
// Maneja push notifications web (VAPID).

// ─── Push Notification handler ────────────────────────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return

  let payload = { title: 'Academic Risk', body: '', url: '/' }
  try { payload = { ...payload, ...event.data.json() } } catch { /* text fallback */ }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body:    payload.body,
      icon:    '/assets/ar-icon.png',
      badge:   '/assets/ar-icon.png',
      data:    { url: payload.url },
      vibrate: [200, 100, 200],
      tag:     'academic-risk-alert',   // colapsa notificaciones duplicadas
      renotify: true,
    })
  )
})

// ─── Click en notificación → abrir URL ────────────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // Si ya hay una ventana abierta, enfocarla y navegar
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus()
          if ('navigate' in client) client.navigate(url)
          return
        }
      }
      // Si no hay ventana, abrir una nueva
      return clients.openWindow(url)
    })
  )
})
