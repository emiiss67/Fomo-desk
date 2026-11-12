/* App shell cache only. Desk data (Supabase JSON) is never cached here. No web push on plan B. */
const CACHE = "desk-shell-v28";
const SHELL = ["./", "index.html", "app.css", "app.js", "chart.js", "manifest.json", "icons/icon-192.png"];
self.addEventListener("install", e => e.waitUntil((async () => {
  const c = await caches.open(CACHE);
  await Promise.all(SHELL.map(async u => {
    const r = await fetch(u, { cache: "reload" });
    if (r.ok) await c.put(u, r);
  }));
  await self.skipWaiting();
})()));
self.addEventListener("activate", e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== "GET") return;       // data goes straight to the network
  e.respondWith(fetch(new Request(e.request, { cache: "no-store" })).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return r; })
    .catch(() => caches.match(e.request)));
});
