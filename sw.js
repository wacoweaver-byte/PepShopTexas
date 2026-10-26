/* Pep Shop Texas service worker (v4: pages always revalidate so uploads show up right away; v3: tells open pages when an alert arrives so the bell updates). Network-first pages, cached static files, push alerts.
   Admin pages and every Supabase call always go straight to the network. */
const V = "pst-v511";
const CORE = ["offline.html", "css/pst-bl.css?v=511", "js/pst-core.js?v=511", "img/pst-emblem-96.webp", "img/pst-emblem-192.webp", "icons/icon-192.png", "icons/badge-96.png"];
const ADMIN = /\/(admin|admin-coa|inventory|products|promotions|reports|customers|discounts|manual-order|availability-requests|bulk-requests)\.html$/;
self.addEventListener("install", e => { e.waitUntil(caches.open(V).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET") return;
  if (u.hostname.endsWith("supabase.co")) return;                       // live data, never cached
  if (u.origin === location.origin && ADMIN.test(u.pathname)) return;   // admin untouched
  if (r.mode === "navigate") {
    e.respondWith(fetch(r, { cache: "no-cache" }).then(res => { const c = res.clone(); caches.open(V).then(x => x.put(r, c)); return res; })
      .catch(() => caches.match(r, { ignoreSearch: true }).then(m => m || caches.match("offline.html"))));
    return;
  }
  const font = /fonts\.(googleapis|gstatic)\.com$/.test(u.hostname), lib = /cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com/.test(u.hostname);
  const ours = u.origin === location.origin && /\/(css\/pst-bl\.css|js\/pst-[a-z]+\.js|img\/|icons\/)/.test(u.pathname);
  if (ours || font || lib) {
    e.respondWith(caches.open(V).then(c => c.match(r).then(hit => {
      const net = fetch(r).then(res => { if (res.ok || res.type === "opaque") c.put(r, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    })));
  }
});
self.addEventListener("push", e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  const scopeUrl = self.registration.scope;
  e.waitUntil((async () => {
    await self.registration.showNotification(d.title || "Pep Shop Texas", {
      body: d.body || "", tag: d.tag || undefined, renotify: !!d.tag, icon: scopeUrl + "icons/icon-192.png", badge: scopeUrl + "icons/badge-96.png",
      data: { url: new URL(d.url || "account.html#orders", scopeUrl).href, addUrl: d.addUrl ? new URL(d.addUrl, scopeUrl).href : "" },
      actions: Array.isArray(d.actions) ? d.actions.slice(0, 2) : []
    });
    try { (await self.clients.matchAll({ type: "window", includeUncontrolled: true })).forEach(c => c.postMessage({ type: "pst-push", tag: d.tag || "", title: d.title || "Pep Shop Texas", body: d.body || "", url: new URL(d.url || "account.html#orders", scopeUrl).href })); } catch {}
    if (typeof d.badge === "number" && self.navigator.setAppBadge) { try { d.badge ? await self.navigator.setAppBadge(d.badge) : await self.navigator.clearAppBadge(); } catch {} }
  })());
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const dd = e.notification.data || {};
  const url = (e.action === "add" && dd.addUrl) || dd.url || self.registration.scope;   // "Add to bag" button on reminders
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) if (c.url.startsWith(self.registration.scope) && "focus" in c) { c.navigate(url).catch(() => {}); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
