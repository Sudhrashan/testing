// Service Worker — caches all app files for offline use
const CACHE_NAME = 'vd-geotag-v22'; // bumped: long IST timestamp "Fri Jul 03 2026 10:42:20 AM" + fix Sheets 1899 date bug (force text)

const CACHE_FILES = [
    './', './index.html', './manifest.json', './Logo.png', './LOGO INSIDE.png',
    './css/variables.css', './css/components.css', './css/login.css', './css/admin.css',
    './js/config.js',  './js/state.js',      './js/utils.js',      './js/db.js',
    './js/api.js',     './js/auth.js',        './js/gps.js',        './js/camera.js',
    './js/clock.js',   './js/attendance.js',  './js/report.js',     './js/admin.js',
    './js/navigation.js', './js/ui.js',       './js/events.js',     './js/app.js',
];

self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE_NAME).then(c => c.addAll(CACHE_FILES).catch(() => {}))
    );
    self.skipWaiting();
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', e => {
    // Let external API calls go straight to network
    const url = e.request.url;
    if (url.includes('script.google') || url.includes('geoapify') ||
        url.includes('nominatim')     || url.includes('bigdatacloud')) return;

    e.respondWith(
        caches.match(e.request).then(cached => cached || fetch(e.request).catch(() => caches.match('./index.html')))
    );
});
