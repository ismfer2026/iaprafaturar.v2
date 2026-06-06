/**
 * Service Worker — iaprafaturar CRM v3.0
 * Lógica correta:
 * - Login sempre tenta rede primeiro
 * - Offline só aparece se rota não está em cache E sem internet
 * - App já logado funciona offline normalmente
 */

// Precache manifest injected at build time (or empty if standalone)
// self.__WB_MANIFEST

const CACHE_NAME = 'iaprafaturar-v5'
const SUPABASE_URL = 'https://cbggntmqnulzdhpmying.supabase.co'
const SYNC_TAG = 'iapra-background-sync'

// Rotas que NUNCA devem ter fallback offline (login, cadastro público)
const NO_OFFLINE_ROUTES = ['/login', '/cadastro', '/criar-conta', '/reset-password', '/agendar']

// ── Install: só cacheia assets estáticos ─────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll([
        '/offline-resources.html', // página de recursos offline (não é fallback global)
        '/icon-192x192.png',
        '/favicon.ico',
      ])
    )
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// ── Fetch: lógica por tipo ────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Ignora não-GET e cross-origin que não sejam Supabase
  if (request.method !== 'GET') return
  if (!request.url.startsWith(self.location.origin) &&
      !request.url.startsWith(SUPABASE_URL)) return

  // Supabase/Auth/Functions — SEMPRE rede, sem cache/fallback.
  // Evita tokens antigos, RLS com auth.uid() nulo e erros de body reutilizado no mobile.
  if (request.url.startsWith(SUPABASE_URL)) return

  // Rotas de autenticação/público — NetworkFirst SEM fallback offline
  const isAuthRoute = NO_OFFLINE_ROUTES.some(r => url.pathname.startsWith(r))
  if (isAuthRoute) {
    event.respondWith(fetch(request).catch(() => {
      // Se falhar numa rota pública, retorna resposta vazia com status 503
      return new Response('Sem conexão', { status: 503 })
    }))
    return
  }

  // Navegação interna (rotas do app logado) — NetworkFirst com fallback para cache
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Cacheia a resposta para uso offline futuro
          if (response.ok) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then(cache => cache.put(request.clone(), clone)).catch(() => {})
          }
          return response
        })
        .catch(async () => {
          // Sem internet — tenta cache
          const cached = await caches.match(request)
          if (cached) return cached

          // Não tem cache — redireciona para a raiz (que tem cache do último login)
          const root = await caches.match('/')
          if (root) return root

          // Último recurso — mostra página de recursos offline
          return caches.match('/offline-resources.html')
        })
    )
    return
  }

  // Assets estáticos (JS, CSS, imagens) — StaleWhileRevalidate
  if (/\.(js|css|png|svg|webp|woff2|ico|mp3)$/.test(request.url)) {
    event.respondWith(
      caches.match(request).then(cached => {
        const fetchPromise = fetch(request).then(response => {
          if (response.ok) {
            caches.open(CACHE_NAME).then(cache => cache.put(request.clone(), response.clone())).catch(() => {})
          }
          return response
        }).catch(() => cached)
        return cached || fetchPromise
      })
    )
  }
})

async function networkFirstWithCache(request) {
  try {
    const response = await fetch(request.clone())
    if (response.ok) {
      const clone = response.clone()
      caches.open(CACHE_NAME).then(cache => cache.put(request.clone(), clone)).catch(() => {})
    }
    return response
  } catch {
    const cached = await caches.match(request)
    if (cached) return cached
    return new Response(JSON.stringify({ error: 'offline', cached: false }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

// ── Background Sync ───────────────────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(syncPendingOperations())
  }
})

async function syncPendingOperations() {
  try {
    const db = await openIDB()
    const pending = await getAllPending(db)
    if (!pending.length) return

    for (const item of pending) {
      try {
        const url = `${SUPABASE_URL}/rest/v1/${item.table_name}`
        const method = item.operation === 'INSERT' ? 'POST'
          : item.operation === 'UPDATE' ? 'PATCH' : 'DELETE'
        const endpoint = (item.operation !== 'INSERT')
          ? `${url}?id=eq.${item.record_id}` : url
        const token = await getMetaValue(db, 'access_token')

        const response = await fetch(endpoint, {
          method,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': token ? `Bearer ${token}` : '',
            'Prefer': 'return=minimal',
          },
          body: method !== 'DELETE' ? JSON.stringify(item.data) : undefined,
        })

        if ([200, 201, 204].includes(response.status)) {
          await deletePending(db, item.id)
          const allClients = await self.clients.matchAll()
          allClients.forEach(c => c.postMessage({
            type: 'SYNC_ITEM_COMPLETE',
            table: item.table_name,
            operation: item.operation,
          }))
        }
      } catch {}
    }

    const remaining = await getAllPending(db)
    const allClients = await self.clients.matchAll()
    allClients.forEach(c => c.postMessage({
      type: 'SYNC_COMPLETE',
      pendingCount: remaining.length,
    }))
  } catch (err) {
    console.error('[SW] Background sync error:', err)
  }
}

// ── Push ──────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return
  try {
    const payload = event.data.json()
    const { title = 'iaprafaturar', body = '', type = 'general', sound = 'notification', data = {} } = payload
    // image_url já vem como URL absoluta do backend (https://iaprafaturar.com.br/notif-images/...)
    const imageUrl = data.image_url || undefined
    const VIBRATION = {
      new_appointment:          [200, 100, 200, 100, 400],
      appointment_reminder_24h: [300, 100, 300],
      reminder:                 [300, 100, 300],
      appointment_cancelled:    [100, 50, 100],
      campaign_admin:           [400, 200, 400, 200, 600],
      credits_low:              [100, 50, 100, 50, 300],
      financial_goal:           [200, 100, 200, 100, 600],
      new_client:               [150, 100, 150],
      lead_converted:           [200, 100, 200, 100, 600],
      payment_received:         [200, 100, 400],
      achievement:              [300, 100, 300, 100, 600],
      stock_low:                [200, 100, 200],
      morning_briefing:         [100, 50, 100],
    }
    event.waitUntil(
      Promise.all([
        self.registration.showNotification(title, {
          body,
          icon:  '/icon-192x192.png',
          badge: '/icon-192x192.png',
          image: imageUrl,
          vibrate: VIBRATION[type] || [200, 100, 200],
          data: { ...data, type, url: getUrlForType(type, data) },
          tag: getTagForType(type, data),
          renotify: true,
          requireInteraction: ['reminder', 'appointment_reminder_24h', 'campaign_admin', 'credits_low'].includes(type),
          actions: getActionsForType(type),
        }),
        updateBadge(),
      ])
    )
  } catch (err) {
    console.error('[SW] Push error:', err)
  }
})

self.addEventListener('notificationclick', (event) => {
  const { action, notification } = event
  const { type, url, appointmentId, clientId } = notification.data || {}
  notification.close()
  let targetUrl = url || '/'
  if (action === 'view_agenda')  targetUrl = '/agenda'
  if (action === 'confirm')      targetUrl = `/agenda?confirm=${appointmentId}`
  if (action === 'dismiss')      return
  if (action === 'view_report')  targetUrl = '/relatorios'
  if (action === 'buy_credits')  targetUrl = '/configuracoes/creditos'
  if (action === 'view_stock')   targetUrl = '/estoque'
  if (action === 'view_client')  targetUrl = clientId ? `/clientes/${clientId}` : '/clientes'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if ('focus' in c) { c.postMessage({ type: 'NAVIGATE', url: targetUrl }); return c.focus() }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl)
    })
  )
})

// ── Message ───────────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'CLEAR_BADGE') {
    try { if ('clearAppBadge' in self.navigator) self.navigator.clearAppBadge() } catch {}
  }
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
  if (event.data?.type === 'STORE_TOKEN') {
    openIDB().then(db => setMetaValue(db, 'access_token', event.data.token))
  }
})

// ── Badging ───────────────────────────────────────────────
async function updateBadge() {
  try {
    if ('setAppBadge' in self.navigator) {
      const notifs = await self.registration.getNotifications()
      await self.navigator.setAppBadge(notifs.length + 1)
    }
  } catch {}
}

// ── IDB helpers ───────────────────────────────────────────
function openIDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open('iaprafaturar-offline', 2)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('pending_sync'))
        db.createObjectStore('pending_sync', { keyPath: 'id', autoIncrement: true })
      if (!db.objectStoreNames.contains('meta'))
        db.createObjectStore('meta', { keyPath: 'key' })
    }
    req.onsuccess = () => res(req.result)
    req.onerror = () => rej(req.error)
  })
}
function getAllPending(db) {
  return new Promise(res => {
    const req = db.transaction('pending_sync', 'readonly').objectStore('pending_sync').getAll()
    req.onsuccess = () => res(req.result)
    req.onerror = () => res([])
  })
}
function deletePending(db, id) {
  return new Promise(res => {
    const tx = db.transaction('pending_sync', 'readwrite')
    tx.objectStore('pending_sync').delete(id)
    tx.oncomplete = res
  })
}
function getMetaValue(db, key) {
  return new Promise(res => {
    const req = db.transaction('meta', 'readonly').objectStore('meta').get(key)
    req.onsuccess = () => res(req.result?.value ?? null)
    req.onerror = () => res(null)
  })
}
function setMetaValue(db, key, value) {
  return new Promise(res => {
    const tx = db.transaction('meta', 'readwrite')
    tx.objectStore('meta').put({ key, value })
    tx.oncomplete = res
  })
}

// ── URL/Tag/Actions helpers ───────────────────────────────
function getUrlForType(type, data) {
  const map = {
    new_appointment:          `/agenda?id=${data.appointmentId}`,
    appointment_reminder_24h: `/agenda?id=${data.appointmentId}`,
    reminder:                 `/agenda?id=${data.appointmentId}`,
    appointment_cancelled:    '/agenda',
    morning_briefing:         '/agenda',
    daily_summary:            '/relatorios',
    weekly_report:            '/relatorios',
    weekly_metrics:           '/relatorios',
    campaign_admin:           '/campanhas',
    credits_low:              '/configuracoes/creditos',
    financial_goal:           '/relatorios/financeiro',
    payment_received:         '/relatorios/financeiro',
    new_client:               `/clientes/${data.clientId}`,
    lead_converted:           `/clientes/${data.clientId}`,
    client_birthday:          `/clientes/${data.clientId}`,
    client_inactive:          `/clientes/${data.clientId}`,
    session_completed:        `/clientes/${data.clientId}`,
    stock_low:                '/estoque',
    agent_message:            '/agentes',
    ai_insight:               '/relatorios',
    achievement:              '/relatorios',
  }
  return map[type] || '/'
}
function getTagForType(type, data) {
  const tags = {
    new_appointment:          `appt-${data.appointmentId}`,
    appointment_reminder_24h: `reminder24-${data.appointmentId}`,
    reminder:                 `reminder-${data.appointmentId}`,
    appointment_cancelled:    `cancelled-${data.appointmentId}`,
    campaign_admin:           `campaign-${data.campaignId}`,
    credits_low:              'credits-low',
    financial_goal:           `goal-${data.goalId}`,
    payment_received:         `payment-${data.transactionId || Date.now()}`,
    new_client:               `client-${data.clientId}`,
    lead_converted:           `converted-${data.clientId}`,
    client_birthday:          `birthday-${data.clientId}`,
    client_inactive:          `inactive-${data.clientId}`,
    stock_low:                `stock-${data.itemId}`,
    morning_briefing:         'morning-briefing',
    daily_summary:            'daily-summary',
    weekly_metrics:           'weekly-metrics',
    achievement:              `achievement-${data.achievementId || 'generic'}`,
  }
  return tags[type] || `notif-${Date.now()}`
}
function getActionsForType(type) {
  const actions = {
    new_appointment:          [{ action: 'view_agenda', title: '📅 Ver Agenda' }, { action: 'dismiss', title: 'Depois' }],
    appointment_reminder_24h: [{ action: 'view_agenda', title: '📅 Ver Agenda' }, { action: 'dismiss', title: 'Ok' }],
    reminder:                 [{ action: 'confirm', title: '✅ Confirmar' }, { action: 'view_agenda', title: '📅 Agenda' }],
    credits_low:              [{ action: 'buy_credits', title: '⚡ Recarregar' }, { action: 'dismiss', title: 'Depois' }],
    financial_goal:           [{ action: 'view_report', title: '📊 Ver Relatório' }],
    payment_received:         [{ action: 'view_report', title: '💰 Ver Financeiro' }],
    morning_briefing:         [{ action: 'view_agenda', title: '📅 Ver Agenda' }],
    daily_summary:            [{ action: 'view_report', title: '📊 Ver Relatório' }],
    stock_low:                [{ action: 'view_stock', title: '📦 Ver Estoque' }, { action: 'dismiss', title: 'Depois' }],
    lead_converted:           [{ action: 'view_client', title: '👤 Ver Cliente' }],
    achievement:              [{ action: 'view_report', title: '🏆 Ver Conquista' }],
  }
  return actions[type] || []
}