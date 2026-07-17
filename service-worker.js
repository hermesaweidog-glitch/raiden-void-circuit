const CACHE = 'raiden-void-circuit-v19';
const ICON_NAMES = ['primary-cannon','homing','drone','chain','rail','bombard','gravity','prism','interceptor','magnet','overclock','armor','critical','salvage','guidance','bombcap','capacitor','payload','flux','harvester','overdrive'];
const SVG_ICONS = ['acid', 'support', 'seeker-orbit', 'lance-orbit', 'basic-fist', 'kiai', 'joint-strike', 'push-hands', 'iron-bell', 'afterimage', 'iron-mountain', 'swift-defense', 'taiji-master', 'six-harmony', 'frenzy', 'soul-taker', 'battlefield-cleanup', 'supply-chain'];
const AIRCRAFT_NAMES = ['falcon', 'lancer', 'wasp'];
const PILOT_NAMES = ['imperial', 'rambo', 'gemini', 'shadow', 'joker', 'reaper', 'kungfu', 'gambler'];
const ASSETS = ['./', './index.html', './styles.css', './src/main.js?v=19', './src/game.js', './src/config.js', './src/systems.js', './manifest.webmanifest', ...ICON_NAMES.map(name => `./assets/icons/${name}.webp`), ...SVG_ICONS.map(name => `./assets/icons/${name}.svg`), ...AIRCRAFT_NAMES.map(name => `./assets/aircraft/${name}.webp`), ...PILOT_NAMES.map(name => `./assets/pilots/${name}.webp`)];
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});
self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))),
    self.clients.claim(),
  ]));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request).then(response => {
    const copy = response.clone();
    caches.open(CACHE).then(cache => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match(event.request)));
});
