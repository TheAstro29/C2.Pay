/* C2-Pay · service worker สำหรับแจ้งเตือน (push) เท่านั้น — ไม่แคชไฟล์ ไม่ดักการโหลดหน้า
 * ข้อความมาจาก Cloud Function payApi/payDaily (FCM แบบ data-only: title, body, url, tag)
 * แตะแจ้งเตือน → โฟกัสแอปที่เปิดอยู่แล้วส่ง url ให้หน้าเว็บเปิดใบนั้น หรือเปิดแอปใหม่ที่ url นั้น
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let p = {};
  try { p = e.data ? e.data.json() : {}; } catch (err) { p = { data: { body: e.data ? e.data.text() : '' } }; }
  const d = Object.assign({}, p.notification || {}, p.data || {});
  const title = d.title || 'C2-Pay';
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || '',
    icon: 'img/icon-192.png',
    badge: 'img/icon-192.png',
    tag: d.tag || undefined,
    renotify: !!d.tag,
    data: { url: d.url || './' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const app = list.find((c) => c.url.startsWith(self.registration.scope));
    if (app) {
      try { await app.focus(); } catch (err) {}
      app.postMessage({ c2pay: 'open', url });
      return;
    }
    await self.clients.openWindow(url);
  })());
});
