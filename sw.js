/* 설치 보고서 생성기 v0.2.1 — Service Worker (앱 셸 캐시)
 *
 * 갱신 방법: 아래 VERSION 문자열을 직접 올린다(자동 생성·해시 없음).
 * 예) 'v0.2.1-1' → 'v0.2.1-2'
 */
const VERSION = 'v0.2.1-1';
const CACHE = 'ir-shell-' + VERSION;

/* install 에서 미리 받아 둘 앱 셸 */
const SHELL = [
  './',
  './index.html',
  './stopwatch.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // 항목별로 받는다 — 하나가 실패해도 나머지 셸은 캐시된다(전체 실패 방지)
    await Promise.all(
      SHELL.map(url =>
        cache.add(new Request(url, { cache: 'reload' }))
          .catch(err => console.warn('[sw] 프리캐시 실패:', url, err))
      )
    );
    await self.skipWaiting();   // 대기하지 않고 바로 활성화
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(k => k.startsWith('ir-shell-') && k !== CACHE)   // 옛 버전 캐시 삭제
        .map(k => caches.delete(k))
    );
    await self.clients.claim();   // 열려 있는 페이지에도 즉시 적용
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;

  if (req.method !== 'GET') return;                 // POST 등은 그대로 통과

  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;  // Gemini API 등 외부 요청은 관여하지 않는다

  /* 페이지 이동: 네트워크 우선 → 실패하면 캐시(오프라인 폴백) */
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const res = await fetch(req);
        if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
        return res;
      } catch (err) {
        const hit = await cache.match(req, { ignoreSearch: true });
        if (hit) return hit;
        const shell = await cache.match('./index.html');
        return shell || Response.error();
      }
    })());
    return;
  }

  /* 정적 자원: 캐시 우선 → 없으면 네트워크 후 캐시 */
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
      return res;
    } catch (err) {
      const shell = await cache.match('./index.html');
      return shell || Response.error();
    }
  })());
});
