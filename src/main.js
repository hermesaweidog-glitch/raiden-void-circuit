import { AIRCRAFT } from './config.js';
import { Game } from './game.js';

const canvas = document.querySelector('#game');
const game = new Game(canvas);
const aircraftSelect = document.querySelector('#aircraft-select');

for (const craft of Object.values(AIRCRAFT)) {
  const button = document.createElement('button');
  button.className = 'aircraft-card';
  button.style.setProperty('--craft', craft.color);
  button.innerHTML = `<span class="aircraft-icon"></span><strong>${craft.name}</strong><small>${craft.subtitle}</small><p>${craft.description}</p>`;
  button.addEventListener('click', () => game.start(craft.id));
  aircraftSelect.append(button);
}

document.querySelector('#bomb-button').addEventListener('pointerdown', event => {
  event.preventDefault();
  event.stopPropagation();
  game.useBomb();
});
document.querySelector('#pause-button').addEventListener('click', () => game.togglePause());
document.querySelector('#mute-button').addEventListener('click', () => game.toggleMute());
document.querySelector('#retry-button').addEventListener('click', () => game.restart());

window.raidenGame = {
  start: id => game.start(id || 'falcon'),
  getState: () => game.debugState(),
  bomb: () => game.useBomb(),
  grantXp: amount => game.grantXp(amount),
  forceBoss: () => game.debugForceBoss(),
  forceStage: stage => game.debugForceStage(stage),
  game,
};

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(() => {}));
}
