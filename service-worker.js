const CACHE = 'raiden-v43';
const ICON_NAMES = ['primary-cannon','homing','drone','chain','rail','bombard','gravity','prism','interceptor','magnet','overclock','armor','critical','salvage','guidance','bombcap','capacitor','payload','flux','harvester','overdrive','engine','mines'];
const SVG_ICONS = ['acid', 'support', 'seeker-orbit', 'seeker-orbit-plus', 'lance-orbit', 'cluster-stars', 'black-hole', 'langeinus', 'suicide-assault', 'lucky-star', 'basic-fist', 'kiai', 'joint-strike', 'push-hands', 'iron-bell', 'afterimage', 'iron-mountain', 'swift-defense', 'taiji-master', 'six-harmony', 'frenzy', 'soul-taker', 'battlefield-cleanup', 'supply-chain'];
const AIRCRAFT_NAMES = ['falcon', 'lancer', 'wasp'];
const PILOT_NAMES = ['imperial', 'rambo', 'gemini', 'shadow', 'joker', 'reaper', 'kungfu', 'gambler'];
const ASSETS = ['./', './index.html', './styles.css', './src/main.js?v=43', './src/game.js', './src/audio.js', './src/config.js', './src/systems.js', './src/meta.js', './assets/audio/menu.mp3', './assets/audio/stage.mp3', './assets/audio/boss-warning.mp3', './assets/audio/boss.mp3', './manifest.webmanifest', ...ICON_NAMES.map(name => `./assets/icons/${name}.webp`), ...SVG_ICONS.map(name => `./assets/icons/${name}.svg`), ...AIRCRAFT_NAMES.map(name => `./assets/aircraft/${name}.webp`), ...PILOT_NAMES.map(name => `./assets/pilots/${name}.webp`)];
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache => Promise.allSettled(ASSETS.map(asset => cache.add(asset)))));
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
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(event.request, copy)).catch(() => {});
    }
    return response;
  }).catch(() => caches.match(event.request, { ignoreSearch: false }).then(hit => hit || caches.match(event.request, { ignoreSearch: true }))));
});
