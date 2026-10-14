/// <reference lib="webworker" />
// The service worker: precaches the whole exercise so it runs without a connection, and waits to be told before a
// newer version takes over (the app asks "Reload to use it"; a version never swaps under a running session).
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'

declare const self: ServiceWorkerGlobalScope

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// the app's "Reload to use it"
self.addEventListener('message', (e) => { if (e.data?.type === 'SKIP_WAITING') self.skipWaiting() })

// One-time hand-over from the versions before 14 Oct 2026, which updated themselves and so never ask a waiting
// worker to take over: if the worker in charge is one of those (it left no marker), take over at once, and their
// pages reload themselves into this version.
const MARK = 'landfall-sw-asks-before-update'
self.addEventListener('install', (e) => {
  e.waitUntil(caches.has(MARK).then(asks => { if (self.registration.active && !asks) return self.skipWaiting() }))
})
self.addEventListener('activate', (e) => { e.waitUntil(caches.open(MARK).then(() => undefined)) })
