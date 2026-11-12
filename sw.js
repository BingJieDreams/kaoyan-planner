/* 离线缓存：部署到 http(s) 后自动生效 */
var CACHE = 'chongci-planner-v6';
var ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/icon.svg',
  './assets/css/style.css',
  './assets/js/seed.js',
  './assets/js/scheduler.js',
  './assets/js/words.js',
  './assets/js/app.js'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(ASSETS); })
      .then(function () { return self.skipWaiting(); })
      .catch(function () { /* 忽略单个资源失败 */ })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var url;
  try { url = new URL(e.request.url); } catch (err) { return; }
  /* 只处理本站静态资源；GitHub API 等跨域请求一律放行，避免同步读到缓存 */
  if (url.origin !== self.location.origin) return;
  /* 网络优先，并绕过浏览器 HTTP 缓存，保证在线时永远是最新代码 */
  e.respondWith(
    fetch(e.request, { cache: 'reload' }).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(e.request, copy); }).catch(function () {});
      return res;
    }).catch(function () {
      return caches.match(e.request).then(function (hit) {
        return hit || caches.match('./index.html');
      });
    })
  );
});
