self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // Basico a propósito: sin cache agresiva para evitar contenido viejo durante actualizaciónes manuales.
});

