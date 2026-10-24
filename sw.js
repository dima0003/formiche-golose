// Cache offline: dopo la prima apertura il gioco funziona senza connessione.
const VERSIONE = "formiche-golose-v3";
const FILE = [
  "./", "index.html", "manifest.webmanifest",
  "js/sprites.js", "js/motore.js", "js/gioco.js",
  "icone/icona-180.png", "icone/icona-192.png", "icone/icona-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSIONE).then((c) => c.addAll(FILE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((chiavi) => Promise.all(chiavi.filter((k) => k !== VERSIONE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  // Prima la rete (aggiornamenti subito), senza connessione la copia salvata.
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        if (r.ok && new URL(e.request.url).origin === location.origin) {
          const copia = r.clone();
          caches.open(VERSIONE).then((c) => c.put(e.request, copia));
        }
        return r;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
